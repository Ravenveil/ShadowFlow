/**
 * http-compat.ts — 公网隧道稳定性/兼容性共用件（2026-11-08）。
 *
 * 1. applyHttpServerTuning — keepAlive/headers 超时对齐反代阈值。
 *    Node 默认 keepAliveTimeout=5s 低于反代/Cloudflare 的空闲超时（约 60s+）：
 *    反代复用一条连接回源时可能撞上服务端已关闭 → 间歇 502 / 连接重置
 *    （公网连接不稳的首嫌）。对齐为 keepAliveTimeout=65s、headersTimeout=70s。
 * 2. buildCorsOrigins — CORS 放行来源白名单。
 *    FRONTEND_ORIGIN + 本地开发端口 + `CORS_ORIGINS`（逗号分隔）补放行来源。
 */

export const KEEP_ALIVE_TIMEOUT_MS = 65_000;
export const HEADERS_TIMEOUT_MS = 70_000;

/** keepAlive=65s / headers=70s，须 headersTimeout > keepAliveTimeout。
 *  入参按 unknown 收（http/http2 Server 变体含弱类型结构，避免弱类型检查拒参），
 *  运行时鸭子转型写入两超时字段。 */
export function applyHttpServerTuning(server: unknown): void {
  const s = server as { keepAliveTimeout?: number; headersTimeout?: number } | null | undefined;
  if (!s) return;
  s.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  s.headersTimeout = HEADERS_TIMEOUT_MS;
}

/**
 * CORS 来源白名单：FRONTEND_ORIGIN + localhost 开发端口 + CORS_ORIGINS 逗号
 * 分隔补放行（如隧道域名、其他前端门面）。去重、去空白。
 */
export function buildCorsOrigins(
  frontendOrigin: string,
  env: { CORS_ORIGINS?: string } = process.env,
): string[] {
  const extra = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([frontendOrigin, 'http://localhost:3000', 'http://localhost:5173', ...extra]));
}
