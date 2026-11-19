/**
 * 远程执行（SSH）API 客户端。
 *
 * 后端：backend/node/src/routes/system/remote-exec.ts
 *   GET  /api/remote-exec/config
 *   PUT  /api/remote-exec/config
 *   POST /api/remote-exec/test
 *   POST /api/remote-exec/run
 *
 * 用途：在设置里配置一台远端机器（跑实验的 GPU 机/服务器），
 * 之后论文团的实验步骤由它真正执行，而不是只在本机空转。
 */

import { getApiBase } from './_base';

const API_BASE = getApiBase();

export interface RemoteExecConfigInput {
  host: string;
  port?: number;
  user: string;
  keyPath?: string;
  remoteDir?: string;
}

export interface RemoteExecConfigView {
  configured: boolean;
  config: {
    host: string;
    port: number;
    user: string;
    keyPathMasked: string | null;
    remoteDir: string;
  } | null;
}

export interface RemoteExecResult {
  code: number;
  ok: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export class RemoteExecError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new RemoteExecError(
      err?.message ?? `请求失败（HTTP ${res.status}）`,
      err?.code ?? `HTTP_${res.status}`,
      res.status,
    );
  }
  return body as T;
}

export async function getRemoteExecConfig(): Promise<RemoteExecConfigView> {
  const res = await fetch(`${API_BASE}/api/remote-exec/config`);
  const body = await readJson<{ data?: RemoteExecConfigView }>(res);
  return body.data ?? { configured: false, config: null };
}

export async function saveRemoteExecConfig(
  input: RemoteExecConfigInput,
): Promise<RemoteExecConfigView> {
  const res = await fetch(`${API_BASE}/api/remote-exec/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ data?: RemoteExecConfigView }>(res);
  return body.data ?? { configured: false, config: null };
}

/** 连通性自检；传 input 可「先测再存」。 */
export async function testRemoteExec(
  input?: Partial<RemoteExecConfigInput>,
): Promise<RemoteExecResult> {
  const res = await fetch(`${API_BASE}/api/remote-exec/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  });
  const body = await readJson<{ data?: RemoteExecResult }>(res);
  return body.data ?? { code: -1, ok: false, stdout: '', stderr: '', durationMs: 0 };
}

/** 在远端项目目录跑一条命令。 */
export async function runRemoteCommand(
  command: string,
  timeoutMs?: number,
): Promise<RemoteExecResult> {
  const res = await fetch(`${API_BASE}/api/remote-exec/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, ...(timeoutMs ? { timeoutMs } : {}) }),
  });
  const body = await readJson<{ data?: RemoteExecResult }>(res);
  return body.data ?? { code: -1, ok: false, stdout: '', stderr: '', durationMs: 0 };
}

export async function clearRemoteExecConfig(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/remote-exec/config`, { method: 'DELETE' });
  await readJson<unknown>(res);
}
