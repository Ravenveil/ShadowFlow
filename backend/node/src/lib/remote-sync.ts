/**
 * remote-sync.ts — 远端产出一键拉回（2026-11-20）。
 *
 * 用途：ARC 论文团的实验在远端 GPU 机器上跑，产出（training log / 图表 / tex）
 * 必须回到本机，右栏产出面板才看得见 —— 面板是**本机文件树**
 * （`frontend/src/neo/NeoHost.tsx` 以 `conversation.workspaceDir` 为 root，走
 * `GET /api/fs/list`），远端文件不落盘就永远不可见。
 *
 * 为什么是「ssh | 本地 tar 流」而不是「sshExec 收字符串再解」：
 *   - `sshExec` 的 stdout 按 utf-8 拼接（`ssh-exec.ts`），tar.gz 是二进制，
 *     收进字符串会直接损坏；
 *   - `tar -czf - | base64` 能绕过编码问题，但体积 +33%，且 200 MiB 上限时
 *     Node 里要留一个几百 MB 的字符串（桌面应用不能这么吃内存）；
 *   - 流式管道内存恒定、无膨胀，且**不改 `sshExec` 的任何默认行为**。
 *
 * 安全与预算：
 *   - `remoteSubdir` 必须是 remoteDir 内的相对路径（`assertInsideRemoteDir`）。
 *   - 传输前先跑一次远端 preflight（`find | wc -l` + `du -sk`）拿文件数与体积，
 *     超限**拒绝**而不是传完才发现；回传的数字就是这次 preflight 的结果。
 *   - 整体墙钟上限 `DEFAULT_SYNC_TIMEOUT_MS`（10 分钟），超时同时杀 ssh 与 tar。
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { buildSshArgs, sshExec, type SshConfig } from './ssh-exec';
import { assertInsideRemoteDir } from './remote-safety';

/** 单次拉回的体积上限（解压前的远端 du 口径）。 */
export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
/** 单次拉回的文件数上限。 */
export const DEFAULT_MAX_FILES = 2000;
/** 拉回的总墙钟上限。 */
export const DEFAULT_SYNC_TIMEOUT_MS = 10 * 60 * 1000;

export type RemoteSyncErrorCode = 'REMOTE_SYNC_TOO_LARGE' | 'REMOTE_SYNC_FAILED';

export class RemoteSyncError extends Error {
  readonly code: RemoteSyncErrorCode;
  constructor(code: RemoteSyncErrorCode, message: string) {
    super(message);
    this.name = 'RemoteSyncError';
    this.code = code;
  }
}

export interface PullOptions {
  config: SshConfig;
  /** 本机落点目录（绝对路径），不存在会自动创建。 */
  destDir: string;
  /** remoteDir 内的相对子目录，缺省 = remoteDir 根。 */
  remoteSubdir?: string;
  maxBytes?: number;
  maxFiles?: number;
  signal?: AbortSignal;
}

export interface PullResult {
  /** 远端 preflight 统计的文件数。 */
  files: number;
  /** 远端 preflight 统计的字节数（du -sk * 1024）。 */
  bytes: number;
  /** 本机落点。 */
  dest: string;
  /** 远端相对子目录（回显，便于日志对照）。 */
  remoteSubdir: string;
}

/** 远端 tar 流 → 本地解包。抽成类型是为了单测能注入假实现（不 spawn 真 ssh）。 */
export type StreamTarFn = (
  config: SshConfig,
  remoteCommand: string,
  destDir: string,
  signal?: AbortSignal,
) => Promise<{ code: number; stderr: string }>;

const STREAM_STDERR_CAP = 64 * 1024;
/** preflight 输出上限：只需要两行数字。 */
const PREFLIGHT_TIMEOUT_MS = 30_000;

/** 远端路径的 shell 单引号包裹（与 ssh-exec 内部同款转义）。 */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function appendCapped(prev: string, chunk: Buffer): string {
  if (prev.length >= STREAM_STDERR_CAP) return prev;
  return (prev + chunk.toString('utf-8')).slice(0, STREAM_STDERR_CAP);
}

/**
 * 真实实现：`ssh <host> 'cd <sub> && tar -czf - …'` 的 stdout 直接 pipe 进本地
 * `tar -xzf - -C <dest>`。二进制不经过 utf-8 字符串，内存恒定。
 */
export const streamTarViaSsh: StreamTarFn = (config, remoteCommand, destDir, signal) =>
  new Promise<{ code: number; stderr: string }>((resolve) => {
    if (signal?.aborted) {
      resolve({ code: 130, stderr: '[remote-sync] 已取消' });
      return;
    }

    let settled = false;
    let sshCode: number | null = null;
    let sshErr = '';
    let tarErr = '';

    const finish = (code: number, stderr: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, stderr });
    };

    const ssh = spawn('ssh', buildSshArgs(config, remoteCommand), {
      windowsHide: true,
      env: { ...process.env },
    });
    const tar = spawn('tar', ['-x', '-z', '-f', '-', '-C', destDir], {
      windowsHide: true,
    });

    const killAll = () => {
      try { ssh.kill('SIGKILL'); } catch { /* ignore */ }
      try { tar.kill('SIGKILL'); } catch { /* ignore */ }
    };
    const timer = setTimeout(() => {
      killAll();
      finish(124, `[remote-sync] 拉回超时，已终止（ssh:${sshErr} tar:${tarErr}）`);
    }, DEFAULT_SYNC_TIMEOUT_MS);
    const onAbort = () => {
      killAll();
      finish(130, '[remote-sync] 已取消');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    ssh.stderr?.on('data', (d: Buffer) => { sshErr = appendCapped(sshErr, d); });
    tar.stderr?.on('data', (d: Buffer) => { tarErr = appendCapped(tarErr, d); });

    // 管道：ssh.stdout → tar.stdin。（任一端销毁都要往下走，靠 close 事件收口）
    ssh.stdout.pipe(tar.stdin);
    ssh.stdout.on('error', () => { try { tar.stdin.end(); } catch { /* ignore */ } });

    ssh.on('error', (err: NodeJS.ErrnoException) => {
      try { tar.stdin.end(); } catch { /* ignore */ }
      finish(
        err.code === 'ENOENT' ? -1 : 1,
        `[remote-sync] 无法启动 ssh：${err.message}（Windows 请启用「OpenSSH 客户端」功能）`,
      );
    });
    tar.on('error', (err) => {
      killAll();
      finish(1, `[remote-sync] 无法启动本地 tar：${err.message}`);
    });

    ssh.on('close', (code) => {
      sshCode = code ?? -1;
      // 远端结束 → 关闭 tar stdin，让本地 tar 正常收尾（而不是等 EOF 超时）。
      try { tar.stdin.end(); } catch { /* ignore */ }
    });
    tar.on('close', (tarCode) => {
      const code = sshCode === 0 && tarCode === 0 ? 0 : (sshCode && sshCode !== 0 ? sshCode : (tarCode ?? 1));
      finish(code, [sshErr, tarErr].filter(Boolean).join('\n'));
    });
  });

let streamTarImpl: StreamTarFn = streamTarViaSsh;

/**
 * 测试注入点：替换「远端 tar 流 → 本地解包」的实现。
 * 传 null 恢复真实实现。生产代码永远不该调用它。
 */
export function __setStreamTarImplForTests(fn: StreamTarFn | null): void {
  streamTarImpl = fn ?? streamTarViaSsh;
}

interface PreflightStats { files: number; bytes: number }

/**
 * 远端 preflight：拿文件数与体积，顺便判定子目录是否存在。
 * 输出格式固定两行 `FILES <n>` / `BYTES <kib>`；目录不存在输出 `SF_NO_DIR`。
 */
async function preflightRemoteDir(config: SshConfig, sub: string): Promise<PreflightStats> {
  const target = sub ? sq(sub) : '.';
  // du -sk 比 du -sb 可移植（GNU/BSD/macOS 都支持 -sk）。
  const cmd =
    `if [ -d ${target} ]; then cd -- ${target} && ` +
    `printf 'FILES %s\\nBYTES %s\\n' ` +
    `"$(find . -type f -not -path './.git/*' -not -path './venv/*' -not -path './node_modules/*' | wc -l | tr -d ' ')" ` +
    `"$(du -sk . 2>/dev/null | cut -f1)"; ` +
    `else echo SF_NO_DIR; fi`;

  const r = await sshExec(config, cmd, { timeoutMs: PREFLIGHT_TIMEOUT_MS });
  if (r.code !== 0) {
    throw new RemoteSyncError(
      'REMOTE_SYNC_FAILED',
      `远端目录探测失败（exit=${r.code}）：${(r.stderr || '').slice(0, 400)}`,
    );
  }
  if (r.stdout.includes('SF_NO_DIR')) {
    throw new RemoteSyncError(
      'REMOTE_SYNC_FAILED',
      `远端目录不存在：${sub || '(remoteDir 根)'}（请确认设置里的远端项目目录与产出子目录）`,
    );
  }
  const files = Number(/FILES\s+(\d+)/.exec(r.stdout)?.[1] ?? NaN);
  const kib = Number(/BYTES\s+(\d+)/.exec(r.stdout)?.[1] ?? NaN);
  if (!Number.isFinite(files) || !Number.isFinite(kib)) {
    throw new RemoteSyncError(
      'REMOTE_SYNC_FAILED',
      `远端目录统计无法解析：${r.stdout.slice(0, 200)}`,
    );
  }
  return { files, bytes: kib * 1024 };
}

/**
 * 把远端 `remoteDir/<remoteSubdir>` 拉回 `destDir`。
 *
 * 失败一律抛 `RemoteSyncError`（带 code），由路由映射 HTTP 状态。
 */
export async function pullRemoteTree(opts: PullOptions): Promise<PullResult> {
  const subRaw = typeof opts.remoteSubdir === 'string' ? opts.remoteSubdir.trim() : '';
  const subErr = assertInsideRemoteDir(subRaw);
  if (subErr) {
    throw new RemoteSyncError('REMOTE_SYNC_FAILED', `remote_subdir 非法：${subErr}`);
  }

  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;

  const stats = await preflightRemoteDir(opts.config, subRaw);
  if (stats.files > maxFiles) {
    throw new RemoteSyncError(
      'REMOTE_SYNC_TOO_LARGE',
      `远端产出文件数超出上限（${stats.files} > ${maxFiles}）。请先用 remote_shell 只保留需要的产出（如删缓存/中间权重）。`,
    );
  }
  if (stats.bytes > maxBytes) {
    const mib = (n: number) => Math.round(n / (1024 * 1024));
    throw new RemoteSyncError(
      'REMOTE_SYNC_TOO_LARGE',
      `远端产出体积超出上限（${mib(stats.bytes)} MiB > ${mib(maxBytes)} MiB）。请先用 remote_shell 清理大文件（模型权重、缓存）后重试。`,
    );
  }

  mkdirSync(opts.destDir, { recursive: true });

  const target = subRaw ? sq(subRaw) : '.';
  const remoteCommand =
    `cd -- ${target} && tar -czf - --exclude=.git --exclude=venv --exclude=node_modules .`;

  const r = await streamTarImpl(opts.config, remoteCommand, opts.destDir, opts.signal);
  if (r.code !== 0) {
    throw new RemoteSyncError(
      'REMOTE_SYNC_FAILED',
      `拉回失败（exit=${r.code}）：${(r.stderr || '').slice(0, 400) || '无 stderr'}`,
    );
  }

  return {
    files: stats.files,
    bytes: stats.bytes,
    dest: opts.destDir,
    remoteSubdir: subRaw,
  };
}
