/**
 * friendlyError — 网络/未知错误的用户可读文案。
 *
 * 2026-11-07 用户反馈：右栏裸露英文 "Failed to fetch"（后端未起时 fetch 的
 * TypeError 原文直达 UI）。网络层错误统一映射成中文提示；业务错误（如
 * 'HTTP 500'）原样透传，不吞细节。
 */

const NETWORK_ERROR_RE = /^(Failed to fetch|NetworkError|Load failed|fetch failed|Network request failed)$/i;

export function friendlyErrorText(err: unknown): string {
  if (err instanceof Error) {
    const raw = err.message.trim();
    if (err instanceof TypeError || NETWORK_ERROR_RE.test(raw)) {
      return '无法连接后端服务，请确认服务已启动后重试';
    }
    return raw || '未知错误';
  }
  return String(err) || '未知错误';
}
