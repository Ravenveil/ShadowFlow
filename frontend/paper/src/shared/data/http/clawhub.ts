/**
 * http/clawhub.ts — ClawHub 安装 / 卸载会话客户端。
 *
 *   POST /api/clawhub/install/:cliId            → { install_id, cli_id, command, stream_url }
 *   POST /api/clawhub/uninstall/:cliId          → 同上（复用安装的 SSE 流）
 *   GET  /api/clawhub/install/:installId/stream → SSE：install-start / install-log /
 *                                                 install-done / install-error
 *   POST /api/clawhub/install/:installId/cancel → 204
 *
 * 安装流是一次性短生命周期流（EventSource 只能 GET），终态帧到达即关闭。
 * 后端错误码：404 未知 CLI / 422 copy-only / 409 已在安装中，交给界面按 status 分支。
 */
import { API_BASE, ROUTES, request } from '@/shared/data/http/client';

export interface InstallStartResponse {
  install_id: string;
  cli_id: string;
  command: string;
  stream_url: string;
}

/** 安装日志的一行（stdout / stderr）。 */
export interface InstallLogLine {
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface InstallStartEvent {
  install_id: string;
  cli_id: string;
  command: string;
  started_at: string;
}

export interface InstallDoneEvent {
  exit_code: number;
  finished_at: string;
  duration_ms: number;
}

export interface InstallErrorEvent {
  /** INSTALL_FAILED / INSTALL_CANCELED / PM_NOT_FOUND 或后端新增码。 */
  code: string;
  message: string;
  exit_code?: number;
  stderr_tail: string;
}

export interface InstallStreamHandlers {
  onStart?: (data: InstallStartEvent) => void;
  onLog?: (data: InstallLogLine) => void;
  onDone?: (data: InstallDoneEvent) => void;
  onError?: (data: InstallErrorEvent) => void;
}

export interface InstallStreamHandle {
  close: () => void;
}

/** 发起安装。422 = copy-only，409 = 已在安装中，404 = 未知 CLI。 */
export const startInstall = (cliId: string) =>
  request<InstallStartResponse>(ROUTES.clawhubInstall(cliId), { method: 'POST' });

/** 发起卸载（与安装共用 SSE 事件）。422 = 无自动卸载方式（copy-only）。 */
export const startUninstall = (cliId: string) =>
  request<InstallStartResponse>(ROUTES.clawhubUninstall(cliId), { method: 'POST' });

/** 取消安装/卸载；会话已不存在时返回 false。 */
export async function cancelInstall(installId: string): Promise<boolean> {
  try {
    await request<null>(ROUTES.clawhubInstallCancel(installId), { method: 'POST' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 订阅安装日志 SSE。终态帧（done / error）到达后自动关闭。
 * 返回的 handle.close() 供组件卸载时主动断开。
 */
export function subscribeInstallStream(
  installId: string,
  handlers: InstallStreamHandlers,
): InstallStreamHandle {
  const es = new EventSource(`${API_BASE}${ROUTES.clawhubInstallStream(installId)}`);
  let terminated = false;

  const parse = (ev: MessageEvent): Record<string, unknown> | null => {
    try {
      return JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const close = () => {
    if (terminated) return;
    terminated = true;
    es.close();
  };

  es.addEventListener('install-start', (ev) => {
    const data = parse(ev as MessageEvent);
    if (data) handlers.onStart?.(data as unknown as InstallStartEvent);
  });
  es.addEventListener('install-log', (ev) => {
    const data = parse(ev as MessageEvent);
    if (data) handlers.onLog?.(data as unknown as InstallLogLine);
  });
  es.addEventListener('install-done', (ev) => {
    const data = parse(ev as MessageEvent);
    close();
    if (data) handlers.onDone?.(data as unknown as InstallDoneEvent);
  });
  es.addEventListener('install-error', (ev) => {
    const data = parse(ev as MessageEvent);
    close();
    if (data) handlers.onError?.(data as unknown as InstallErrorEvent);
  });
  // 服务端 404（会话不存在）或流意外断开：一次性流不做重连，直接关闭。
  es.addEventListener('error', () => close());

  return { close };
}
