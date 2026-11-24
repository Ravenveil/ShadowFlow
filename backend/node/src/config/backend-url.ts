/**
 * backend-url.ts — Node 网关自身的 base URL（ADR-0001 后唯一的后端地址）。
 *
 * 取代已删除的 python-backend.ts（其 BACKEND_URL 指向 :8000 的
 * FastAPI）。仍有少量持久化/增强通道以 loopback HTTP 打自身（team-persistence、
 * craft-team-setup、loop-watcher、memory-bank 兜底）：端口来自 PORT（默认
 * 8002），与 index.ts 的监听端口同源。后续批次应把这些调用改为直调
 * store/use_case，绕过自环 —— 见 ADR-0001 收尾清单。
 */
export const BACKEND_URL =
  process.env.SF_BACKEND_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8002}`;
