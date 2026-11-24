/**
 * api/clawhub.ts — ClawHub 安装会话客户端（2026-06）
 *
 *  - startInstall(cliId)            POST /api/clawhub/install/:cliId → {install_id, stream_url…}
 *  - subscribeInstallStream(id, cb) GET  /api/clawhub/install/:id/stream（SSE：
 *                                   install-start / install-log / install-done / install-error）
 *  - cancelInstall(id)              POST /api/clawhub/install/:id/cancel
 *
 * SSE 用原生 EventSource（不走 startSseClient —— 该包装的 DEFAULT_NAMED_EVENTS
 * 不含 install-* 事件，直接命名监听更干净；安装流是一次性短生命周期，断开即止）。
 */

import { getApiBase } from './_base';

export interface InstallStartResponse {
  install_id: string;
  cli_id: string;
  command: string;
  stream_url: string;
}

export class ClawhubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ClawhubApiError';
  }
}

/** 发起安装。404 未知 CLI / 422 copy-only / 409 已在安装中 → 抛错交 UI 分支。 */
export async function startInstall(cliId: string): Promise<InstallStartResponse> {
  const res = await fetch(
    `${getApiBase()}/api/clawhub/install/${encodeURIComponent(cliId)}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = `安装请求失败（${res.status}）`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) code = body.error;
      if (body.message) message = body.message;
    } catch {
      /* keep defaults */
    }
    throw new ClawhubApiError(res.status, code, message);
  }
  return (await res.json()) as InstallStartResponse;
}

/**
 * 发起卸载（2026-10-30 生命周期闭环）。复用安装 SSE 流（install-* 事件同源，
 * stream_url 指向 /api/clawhub/install/:id/stream）。422 = copy-only（message
 * 携带手动卸载引导文案）。
 */
export async function startUninstall(cliId: string): Promise<InstallStartResponse> {
  const res = await fetch(
    `${getApiBase()}/api/clawhub/uninstall/${encodeURIComponent(cliId)}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = `卸载请求失败（${res.status}）`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) code = body.error;
      if (body.message) message = body.message;
    } catch {
      /* keep defaults */
    }
    throw new ClawhubApiError(res.status, code, message);
  }
  return (await res.json()) as InstallStartResponse;
}

/** 取消安装（SIGTERM → 5s → SIGKILL）。会话不存在返回 false。 */
export async function cancelInstall(installId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/clawhub/install/${encodeURIComponent(installId)}/cancel`,
      { method: 'POST' },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export interface InstallStreamHandlers {
  onStart?: (data: { install_id: string; cli_id: string; command: string; started_at: string }) => void;
  onLog?: (data: { stream: 'stdout' | 'stderr'; line: string }) => void;
  onDone?: (data: { exit_code: number; finished_at: string; duration_ms: number }) => void;
  onError?: (data: {
    code: 'INSTALL_FAILED' | 'INSTALL_CANCELED' | 'PM_NOT_FOUND' | string;
    message: string;
    exit_code?: number;
    stderr_tail: string;
  }) => void;
}

export interface InstallStreamHandle {
  close: () => void;
}

/**
 * 订阅安装日志 SSE。终态帧（done/error）到达后自动关闭连接（一次性流）。
 * 返回 handle.close() 供组件卸载时主动断开。
 */
export function subscribeInstallStream(
  installId: string,
  handlers: InstallStreamHandlers,
): InstallStreamHandle {
  const es = new EventSource(
    `${getApiBase()}/api/clawhub/install/${encodeURIComponent(installId)}/stream`,
  );
  let terminated = false;

  const parse = (ev: MessageEvent): Record<string, unknown> | null => {
    try {
      return JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const close = () => {
    if (!terminated) {
      terminated = true;
      es.close();
    }
  };

  es.addEventListener('install-start', (ev) => {
    const d = parse(ev as MessageEvent);
    if (d) handlers.onStart?.(d as Parameters<NonNullable<InstallStreamHandlers['onStart']>>[0]);
  });
  es.addEventListener('install-log', (ev) => {
    const d = parse(ev as MessageEvent);
    if (d) handlers.onLog?.(d as Parameters<NonNullable<InstallStreamHandlers['onLog']>>[0]);
  });
  es.addEventListener('install-done', (ev) => {
    const d = parse(ev as MessageEvent);
    close();
    if (d) handlers.onDone?.(d as Parameters<NonNullable<InstallStreamHandlers['onDone']>>[0]);
  });
  es.addEventListener('install-error', (ev) => {
    const d = parse(ev as MessageEvent);
    close();
    if (d) handlers.onError?.(d as Parameters<NonNullable<InstallStreamHandlers['onError']>>[0]);
  });
  // 服务端 404（会话不存在）→ EventSource onerror；这里静默关闭即可。
  es.addEventListener('error', () => {
    // 浏览器原生重连只在流意外断开时发生；安装流是一次性的，终态帧没来就断
    // 说明会话已过期 —— 直接关闭，UI 侧靠 done/error 帧之外的超时兜底。
    close();
  });

  return { close };
}
