/**
 * remote-shell.ts — builtin `remote_shell` tool（SSH 远端执行）。**HIGH RISK** — 默认 DENY。
 *
 * 与 `shell_exec` 的关系（2026-11-20）：
 *   - **独立工具名**，不给 `shell_exec` 加 `transport` 参数。理由：权限策略按工具名
 *     布点（`permission-policy-v2.ts` 的 `modeFor(name)`），同一个名字只能一个 mode ——
 *     加参数就没法做到「本地允许、远端 prompt」；而且缺省值会静默错配（模型忘传
 *     `transport` 就在本机跑，用户以为在集群上跑）。
 *   - 命令黑名单**共用** `lib/remote-safety.ts` 的基线表，再叠加远端专属表
 *     （包管理 / git push / 横向跳机器 / 外带数据 / token 打印）。
 *
 * 安全边界（三层，缺一不可）：
 *   1. 工具权限闸（tool-runner 按 `builtinDefaultModes.remote_shell = 'deny'` 拦；
 *      被 skill/agent 的 allowed-tools 显式列出才可能放行）。
 *   2. 本文件二次闸：`ctx.allowedTools` 不含 `remote_shell` → 直接拒（与 shell_exec
 *      同款「配错了也不会静默放行」的兜底）。
 *   3. 命令层：`checkRemoteCommand` + `cwd` 必须是 remoteDir 内的相对路径。
 *
 * 执行语义：
 *   - 通过系统 OpenSSH（`sshExec`），BatchMode=yes 仅公钥；`sshExec` 会先
 *     `cd <remoteDir> &&`，所以这里只叠加可选的 `cd <cwd> &&`（相对路径）。
 *   - 同步执行，**上限 120s**（`sshExec` 自身硬顶 10 分钟，这里更严）。长任务
 *     请分步或让模型拆步骤 —— v1 不做后台 job。
 *   - stdout / stderr 各截 256 KiB，超出置 `truncated: true`。
 *
 * 输出：`{ command, exit_code, stdout, stderr, duration_ms, timed_out,
 *          cancelled, truncated, remote_dir }`
 */

import type { ToolSpec } from '../../tool-spec';
import { readSshConfig, sshExec, type SshExecResult } from '../../ssh-exec';
import { assertInsideRemoteDir, checkRemoteCommand } from '../../remote-safety';
import type { BuiltinToolExecutor, BuiltinToolContext } from './types';

/** 同步远端执行的墙钟上限（比 shell_exec 的 30s 宽，比 sshExec 的 10min 严）。 */
export const REMOTE_SHELL_MAX_TIMEOUT_MS = 120_000;
export const REMOTE_SHELL_DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export const remoteShellTool: ToolSpec = {
  name: 'remote_shell',
  description:
    'Run a shell command on the REMOTE host the user configured (SSH, under its remoteDir). '
    + 'Use this — not shell_exec — for anything that must run on the remote GPU machine. '
    + '120s hard timeout; for longer work split it into steps. '
    + 'Blocked on remote: package managers (pip/conda/apt), git push, nested ssh/scp/rsync, '
    + 'data upload (curl -T, nc), and env/printenv. Cluster scheduling (sbatch/srun/squeue/scancel) is allowed. '
    + 'stdout/stderr capped at 256 KiB each.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command line to execute on the remote host.' },
      timeout_ms: {
        type: 'number',
        description: 'Optional timeout in milliseconds (1000..120000, default 120000).',
      },
      cwd: {
        type: 'string',
        description: 'Optional sub-directory, relative to the configured remoteDir. Must not escape it.',
      },
    },
    required: ['command'],
    additionalProperties: false,
  },
  source: 'base',
};

interface RemoteShellInput {
  command: string;
  timeout_ms?: number;
  cwd?: string;
}

function isRemoteShellInput(x: unknown): x is RemoteShellInput {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { command: unknown }).command === 'string'
  );
}

/** 单引号包裹（远端 shell 展开安全）—— 与 ssh-exec 内部同款转义。 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** 截断到 MAX_OUTPUT_BYTES，返回 [文本, 是否截断]。 */
function capOutput(s: string): { text: string; truncated: boolean } {
  if (Buffer.byteLength(s, 'utf-8') <= MAX_OUTPUT_BYTES) return { text: s, truncated: false };
  // 按字节截断再按 utf-8 解码（可能切在多字节字符中间 → 尾字符替换为 U+FFFD，可接受）。
  const buf = Buffer.from(s, 'utf-8').subarray(0, MAX_OUTPUT_BYTES);
  return { text: buf.toString('utf-8'), truncated: true };
}

export const remoteShellExecutor: BuiltinToolExecutor = async (
  input: unknown,
  ctx: BuiltinToolContext,
) => {
  if (!isRemoteShellInput(input)) {
    return {
      output: { error: 'remote_shell: input must be { command: string, timeout_ms?, cwd? }' },
      isError: true,
    };
  }

  const cmd = input.command;
  if (cmd.trim().length === 0) {
    return { output: { error: 'remote_shell: empty command' }, isError: true };
  }
  if (cmd.length > 8192) {
    return { output: { error: 'remote_shell: command exceeds 8 KiB' }, isError: true };
  }
  if (cmd.includes('\0')) {
    return { output: { error: 'remote_shell: command contains NUL byte' }, isError: true };
  }

  // 兜底闸：与 shell_exec 一致 —— skill/agent 没显式列出就不跑，即使权限策略配错。
  if (ctx.allowedTools && !ctx.allowedTools.has('remote_shell')) {
    return {
      output: {
        error: "remote_shell denied: not present in this agent's allowed-tools whitelist",
      },
      isError: true,
    };
  }

  const cfg = readSshConfig();
  if (!cfg) {
    return {
      output: {
        error:
          'remote_shell: 尚未配置远程主机。请到 设置 → 远程执行 / SSH 填写主机、用户名与私钥，'
          + '并点「测试连接」确认可连通后再试。',
      },
      isError: true,
    };
  }

  const blockedReason = checkRemoteCommand(cmd);
  if (blockedReason) {
    return {
      output: {
        error: `remote_shell blocked: matches remote-forbidden pattern (${blockedReason})`,
        command: cmd,
      },
      isError: true,
    };
  }

  // `cwd`：只允许 remoteDir 内相对路径（`sshExec` 已保证 cwd=remoteDir，这里只往下走一层）。
  const cwdErr = assertInsideRemoteDir(input.cwd);
  if (cwdErr) {
    return { output: { error: `remote_shell blocked: ${cwdErr}`, command: cmd }, isError: true };
  }
  const cwd = typeof input.cwd === 'string' ? input.cwd.trim() : '';

  const rawTimeout = Number(input.timeout_ms);
  const timeoutMs = Math.min(
    Math.max(Number.isFinite(rawTimeout) ? rawTimeout : REMOTE_SHELL_DEFAULT_TIMEOUT_MS, 1_000),
    REMOTE_SHELL_MAX_TIMEOUT_MS,
  );

  // 远端命令：可选 cd 到 remoteDir 子目录（相对路径，已校验），再跑用户命令。
  const remoteCommand = cwd ? `cd -- ${shellQuote(cwd)} && ${cmd}` : cmd;

  let result: SshExecResult;
  try {
    result = await sshExec(cfg, remoteCommand, { timeoutMs, signal: ctx.signal });
  } catch (err) {
    // ssh 二进制缺失等环境错误 —— 结构化返回，让模型能解释给用户而不是崩回合。
    const code = (err as { code?: string }).code ?? 'REMOTE_EXEC_FAILED';
    return {
      output: {
        error: `remote_shell 无法启动 ssh（${code}）：${(err as Error).message}`,
        command: cmd,
      },
      isError: true,
    };
  }

  const out = capOutput(result.stdout);
  const err = capOutput(result.stderr);

  return {
    output: {
      command: cmd,
      exit_code: result.code,
      stdout: out.text,
      stderr: err.text,
      duration_ms: result.durationMs,
      timed_out: result.code === 124,
      cancelled: result.code === 130,
      truncated: out.truncated || err.truncated,
      remote_dir: cfg.remoteDir ?? null,
    },
    isError: result.code !== 0,
  };
};
