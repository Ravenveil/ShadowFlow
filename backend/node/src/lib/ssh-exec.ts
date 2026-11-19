/**
 * ssh-exec.ts — 远端执行器（SSH 远程跑实验）。
 *
 * 设计取舍（2026-11-19）：
 *   - 用系统 OpenSSH（Windows 10+ / macOS / Linux 均自带）而不是 ssh2/node-ssh：
 *     免装原生依赖、免 proxy 拉包失败，行为与用户手敲 ssh 一致。
 *   - 只支持公钥认证（BatchMode=yes）。密码认证需要 sshpass，跨平台不可靠，
 *     明确不支持而不是静默挂起等密码。
 *   - StrictHostKeyChecking=accept-new：首次连接自动接受并写入 known_hosts，
 *     否则「配好了却连不上」会是第一次使用最常见的坑。
 *   - 命令通过 argv 传参、不经本地 shell，避免注入；远端仍是 shell 语义。
 *
 * 配置存 settings 通用 KV（key=`remote.ssh`）：私钥**路径**不是私钥本身，
 * 落明文可接受；真正的私钥始终留在磁盘上，由 ssh 自己读。
 */

import { spawn } from 'node:child_process';
import { getSetting, setSetting } from '../storage/settings';

export const SSH_CONFIG_KEY = 'remote.ssh';

export interface SshConfig {
  host: string;
  port: number;
  user: string;
  /** 私钥文件路径（~ 会被展开）。留空 = 用 ssh-agent / 默认密钥。 */
  keyPath?: string;
  /** 远端工作目录：所有命令先 cd 到这里（跑实验的项目根）。 */
  remoteDir?: string;
}

export interface SshExecResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

const HOST_RE = /^[a-zA-Z0-9._:\-[\]]+$/;
const USER_RE = /^[a-zA-Z0-9._\-]+$/;
const MAX_TIMEOUT_MS = 10 * 60 * 1000;

/** 校验并归一配置。返回错误串列表（空 = 合法）。 */
export function validateSshConfig(input: unknown): {
  config: SshConfig | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { config: null, errors: ['config must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const host = typeof o.host === 'string' ? o.host.trim() : '';
  const user = typeof o.user === 'string' ? o.user.trim() : '';
  const portRaw = o.port;
  const port = portRaw === undefined || portRaw === null || portRaw === ''
    ? 22
    : Number(portRaw);
  const keyPath = typeof o.keyPath === 'string' ? o.keyPath.trim() : '';
  const remoteDir = typeof o.remoteDir === 'string' ? o.remoteDir.trim() : '';

  if (!host) errors.push('host 必填');
  else if (!HOST_RE.test(host)) errors.push('host 含非法字符');
  if (!user) errors.push('user 必填');
  else if (!USER_RE.test(user)) errors.push('user 含非法字符');
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('port 必须是 1-65535 的整数');

  if (errors.length) return { config: null, errors };
  return {
    config: {
      host,
      port,
      user,
      ...(keyPath ? { keyPath } : {}),
      ...(remoteDir ? { remoteDir } : {}),
    },
    errors: [],
  };
}

/** 读当前配置（缺失/损坏 → null）。 */
export function readSshConfig(): SshConfig | null {
  const raw = getSetting(SSH_CONFIG_KEY);
  if (!raw) return null;
  const { config } = validateSshConfig(raw);
  return config;
}

/**
 * 与已有配置合并（不落库）：keyPath / remoteDir 未提供则保留原值。
 * 前端展示的私钥路径是掩码，用户不重填不等于要清除；要清除请显式传
 * `clearKeyPath: true`。
 */
export function mergeSshConfig(
  input: unknown,
  prev: SshConfig | null,
): Record<string, unknown> {
  const raw: Record<string, unknown> =
    input && typeof input === 'object' && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>) }
      : {};

  if (prev) {
    const clearKey = raw.clearKeyPath === true;
    const keyProvided = typeof raw.keyPath === 'string' && raw.keyPath.trim() !== '';
    if (clearKey) raw.keyPath = '';
    else if (!keyProvided && prev.keyPath) raw.keyPath = prev.keyPath;

    const dirProvided = typeof raw.remoteDir === 'string' && raw.remoteDir.trim() !== '';
    if (!dirProvided && prev.remoteDir) raw.remoteDir = prev.remoteDir;
  }
  return raw;
}

/**
 * 写配置。keyPath / remoteDir 支持「未提供则保留原值」：见 mergeSshConfig。
 */
export function saveSshConfig(input: unknown): SshConfig {
  const raw = mergeSshConfig(input, readSshConfig());

  const { config, errors } = validateSshConfig(raw);
  if (!config) {
    const err = new Error(errors.join('；'));
    (err as Error & { code?: string }).code = 'INVALID_SSH_CONFIG';
    throw err;
  }
  setSetting(SSH_CONFIG_KEY, config);
  return config;
}

function expandHome(p: string): string {
  if (p === '~') return process.env.HOME ?? process.env.USERPROFILE ?? p;
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    return `${home}${p.slice(1)}`;
  }
  return p;
}

/** 远端工作目录在 shell 里的安全写法（单引号包裹，内部单引号转义）。 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * 拼 ssh argv（2026-11-20 抽出为公开函数）。
 *
 * 抽出原因：产出回传要走 `ssh host 'tar -czf - …' | 本地 tar` 的**流式管道**
 * （体积大、二进制，不能按 utf-8 收进字符串），那条路径在 `lib/remote-sync.ts`
 * 里自己 spawn，需要与 `sshExec` 完全一致的连接参数 —— 复制一份必然漂移。
 * `sshExec` 自身改为调用本函数，走的是同一份 argv，行为零变化。
 *
 * 命令经 argv 传参、不经本地 shell（避免注入）；远端仍是 shell 语义。
 */
export function buildSshArgs(config: SshConfig, command: string): string[] {
  const args = [
    '-p', String(config.port),
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ServerAliveInterval=15',
  ];
  if (config.keyPath) args.push('-i', expandHome(config.keyPath));
  args.push(`${config.user}@${config.host}`);
  // 远端：先 cd 到项目目录再跑命令（一个 argv，远端 shell 展开）
  args.push(config.remoteDir ? `cd ${shellQuote(config.remoteDir)} && ${command}` : command);
  return args;
}

/**
 * 执行远端命令。失败不抛异常（结构化返回 code/stderr），
 * 只有 ssh 二进制不存在这种环境错误才 reject —— 便于路由区分 500 与业务失败。
 */
export function sshExec(
  config: SshConfig,
  command: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SshExecResult> {
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 120_000, 1_000), MAX_TIMEOUT_MS);
  const args = buildSshArgs(config, command);

  const started = Date.now();
  return new Promise<SshExecResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn('ssh', args, {
      windowsHide: true,
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        resolve({
          code: 124,
          stdout,
          stderr: `${stderr}\n[ssh-exec] 超时（${timeoutMs}ms），已终止`,
          durationMs: Date.now() - started,
        });
      }
    }, timeoutMs);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        resolve({
          code: 130,
          stdout,
          stderr: `${stderr}\n[ssh-exec] 已取消`,
          durationMs: Date.now() - started,
        });
      }
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (settled) return;
      settled = true;
      if (err.code === 'ENOENT') {
        const e = new Error('本机未找到 ssh 命令（Windows 请启用「OpenSSH 客户端」功能）');
        (e as Error & { code?: string }).code = 'SSH_BINARY_MISSING';
        reject(e);
        return;
      }
      reject(err);
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (settled) return;
      settled = true;
      resolve({
        code: code ?? -1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });
}

/** 连通性自检：跑一条无害命令，返回面版本与远端目录。 */
export async function sshProbe(
  config: SshConfig,
  opts: { timeoutMs?: number } = {},
): Promise<SshExecResult & { ok: boolean }> {
  const r = await sshExec(
    config,
    'echo "SF_OK"; uname -a 2>/dev/null || ver; pwd',
    { timeoutMs: opts.timeoutMs ?? 20_000 },
  );
  return { ...r, ok: r.code === 0 && r.stdout.includes('SF_OK') };
}
