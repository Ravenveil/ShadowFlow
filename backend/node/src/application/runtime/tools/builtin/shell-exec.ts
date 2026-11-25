/**
 * shell-exec.ts — builtin `shell_exec` tool. **HIGH RISK** — default DENY.
 *
 * Only available when the active skill's `allowed-tools` frontmatter
 * explicitly lists `shell_exec`. tool-runner.ts is responsible for the
 * permission check; this executor adds a SECOND defence layer:
 *
 *   1. Command-string blacklist — common destructive primitives are blocked
 *      regardless of skill opt-in. We'd rather false-positive than ship a
 *      hole. Patterns block: sudo, rm -rf, chmod -R 777, dd if=, mkfs,
 *      curl/wget piped to a shell, /etc/passwd writes, shutdown/reboot,
 *      eval/exec of base64-decoded payloads, network-listen primitives,
 *      kernel module ops, and direct device-file access (/dev/, /proc/).
 *
 *   2. Pipe/redirect to interpreter ban — `... | sh`, `... | bash -s`,
 *      `... > /etc/anything` are all rejected.
 *
 *   3. Working directory pinned to ctx.workspace. The spawned process
 *      cannot `cd` out of it via shell expansion AT spawn time (we use
 *      shell:true so it can run shell builtins, but the spawn cwd is fixed).
 *      Path-traversal within the command is the user's problem — we don't
 *      try to parse the shell.
 *
 *   4. Environment sanitised: only PATH + a small allowlist is forwarded.
 *      No HOME, no USER, no SSH_AUTH_SOCK, no API keys.
 *
 *   5. 30-second wall-clock timeout (SHELL_TIMEOUT_MS). On timeout we send
 *      SIGTERM, then SIGKILL after 2s.
 *
 *   6. Output cap: 256 KiB stdout + 256 KiB stderr. Beyond that the streams
 *      are dropped with a `truncated: true` flag.
 *
 * Output: `{ command, exit_code, signal, stdout, stderr, duration_ms,
 *           timed_out, truncated }`.
 */

import { spawn } from 'child_process';
import type { ToolSpec } from '../../tool-spec';
import { SHELL_TIMEOUT_MS } from './sandbox-utils';
import { checkLocalCommand } from '../../../adapters/remote-safety';
import type { BuiltinToolExecutor, BuiltinToolContext } from './types';

export const shellExecTool: ToolSpec = {
  name: 'shell_exec',
  description:
    'Run a shell command inside the workspace. HIGH RISK — only available when the active skill ' +
    "lists shell_exec in its allowed-tools frontmatter. Destructive primitives (sudo, rm -rf, curl|sh, etc.) " +
    'are blocked. 30s timeout. Output capped at 256 KiB per stream.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command line to execute.' },
      timeout_ms: { type: 'number', description: 'Optional timeout in milliseconds (1..30000).' },
    },
    required: ['command'],
    additionalProperties: false,
  },
  source: 'base',
};

interface ShellExecInput {
  command: string;
  timeout_ms?: number;
}

function isShellExecInput(x: unknown): x is ShellExecInput {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { command: unknown }).command === 'string'
  );
}

const MAX_OUTPUT_BYTES = 256 * 1024;

/**
 * 命令黑名单在 2026-11-20 抽到 `lib/remote-safety.ts`（`BLOCKED_PATTERNS` /
 * `checkLocalCommand`），与远端 `remote_shell` 共用同一张基线表 —— 改规则只改
 * 一处，两条执行路径不会漏。本文件的行为**零变化**：命中即拒，文案同前。
 */

/** Build a minimal, sanitised env. PATH is required for shell to find utilities. */
function buildSafeEnv(srcEnv?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const src = srcEnv ?? (process.env as Record<string, string>);
  const out: NodeJS.ProcessEnv = {};
  const allowed = ['PATH', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG', 'LC_ALL'];
  for (const k of allowed) {
    if (src[k]) out[k] = src[k];
  }
  // Hard-cap PATH length — pathological values can break spawn.
  if (out.PATH && out.PATH.length > 8192) out.PATH = out.PATH.slice(0, 8192);
  return out;
}

export const shellExecExecutor: BuiltinToolExecutor = async (
  input: unknown,
  ctx: BuiltinToolContext,
) => {
  if (!isShellExecInput(input)) {
    return { output: { error: 'shell_exec: input must be { command: string, timeout_ms? }' }, isError: true };
  }

  const cmd = input.command;
  if (cmd.length === 0) {
    return { output: { error: 'shell_exec: empty command' }, isError: true };
  }
  if (cmd.length > 8192) {
    return { output: { error: 'shell_exec: command exceeds 8 KiB' }, isError: true };
  }
  if (cmd.includes('\0')) {
    return { output: { error: 'shell_exec: command contains NUL byte' }, isError: true };
  }

  // Belt-and-braces: shell_exec is gated by permission policy AT tool-runner.
  // We additionally require the skill to have opted in via allowed-tools so
  // a misconfigured policy can't accidentally enable it.
  if (ctx.allowedTools && !ctx.allowedTools.has('shell_exec')) {
    return {
      output: { error: "shell_exec denied: not present in skill's allowed-tools frontmatter" },
      isError: true,
    };
  }

  const blockedReason = checkLocalCommand(cmd);
  if (blockedReason) {
    return {
      output: { error: `shell_exec blocked: matches dangerous pattern (${blockedReason})` },
      isError: true,
    };
  }

  const timeoutMs = Math.min(Math.max(input.timeout_ms ?? SHELL_TIMEOUT_MS, 1), SHELL_TIMEOUT_MS);
  const start = Date.now();

  return await new Promise((resolve) => {
    const child = spawn(cmd, {
      shell: true,
      cwd: ctx.workspace,
      env: buildSafeEnv(ctx.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    interface ShellResult {
      output: Record<string, unknown>;
      isError: boolean;
    }
    const finish = (result: ShellResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(forceKillTimer);
      resolve(result);
    };

    const buildResult = (exitCode: number | null, signalName: NodeJS.Signals | null): ShellResult => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      return {
        output: {
          command: cmd,
          exit_code: exitCode,
          signal: signalName,
          stdout,
          stderr,
          duration_ms: Date.now() - start,
          timed_out: timedOut,
          truncated,
        },
        isError: timedOut || (exitCode !== null && exitCode !== 0),
      };
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const remaining = MAX_OUTPUT_BYTES - stdoutBytes;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      if (chunk.length > remaining) {
        stdoutChunks.push(chunk.subarray(0, remaining));
        stdoutBytes += remaining;
        truncated = true;
      } else {
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const remaining = MAX_OUTPUT_BYTES - stderrBytes;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      if (chunk.length > remaining) {
        stderrChunks.push(chunk.subarray(0, remaining));
        stderrBytes += remaining;
        truncated = true;
      } else {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    });

    child.on('error', (err) => {
      finish({
        output: { error: `shell_exec spawn failed: ${err.message}` },
        isError: true,
      });
    });

    child.on('close', (code, signalName) => {
      finish(buildResult(code, signalName));
    });

    // Timeout — SIGTERM first, SIGKILL 2s later.
    let forceKillTimer: NodeJS.Timeout = setTimeout(() => undefined, 0);
    clearTimeout(forceKillTimer);
    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 2000);
    }, timeoutMs);

    // Abort signal — propagate to child.
    const onAbort = () => {
      if (settled) return;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    };
    if (ctx.signal.aborted) {
      onAbort();
    } else {
      ctx.signal.addEventListener('abort', onAbort, { once: true });
    }
  });
};
