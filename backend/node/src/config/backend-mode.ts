/**
 * backend-mode.ts — 单后端 / 双后端统一模式开关（单后端迁移第一批）
 *
 * 背景：仓库里已有一套 `SF_GROUPS_BACKEND=python|node|dual` 开关，覆盖群聊；
 * 但「整个后端是双进程还是单进程」一直散落在 dev.mjs 的 --no-python 和
 * index.ts 的 proxyFallback 挂载里，没有统一入口。本模块把它收口成一个
 * 一等公民模式：
 *
 *   SF_BACKEND_MODE=single   （默认）纯 Node 单后端：groups 走 Node、不启 Python、
 *                            proxyFallback 变成「显式缺口」404 而非静默转发
 *   SF_BACKEND_MODE=legacy   Node + Python 双后端（逃生舱，仅显式设置时回退）
 *
 * 默认 single（2026-11-19 gap 清零后切换）：前端在用的后端端点已全部迁到
 * Node，最终探针 112 个 GET 全部非 gap，/api/* 全由 Node 接管。legacy 保留
 * 为逃生舱：仅当显式设置 SF_BACKEND_MODE=legacy 才回退到双后端行为。
 *
 * 本模块只做「读 env → 返回模式」，无副作用，方便单测。
 */

export type BackendMode = 'legacy' | 'single';

export const BACKEND_MODE_VALUES: readonly BackendMode[] = ['legacy', 'single'] as const;

/** 读取当前后端模式。显式 legacy → 双后端；未设/无法识别/single → single（安全默认）。 */
export function getBackendMode(env: NodeJS.ProcessEnv = process.env): BackendMode {
  const raw = (env.SF_BACKEND_MODE ?? '').trim().toLowerCase();
  return raw === 'legacy' ? 'legacy' : 'single';
}

export function isSingleBackend(env: NodeJS.ProcessEnv = process.env): boolean {
  return getBackendMode(env) === 'single';
}

/**
 * single 模式下 groups 后端强制为 node —— 这是单后端的硬性前提。
 * legacy 模式下完全沿用既有 SF_GROUPS_BACKEND（python 默认 / node / dual），
 * 保证今天的行为零变化。
 */
export function groupsBackendEnv(env: NodeJS.ProcessEnv = process.env): 'python' | 'node' | 'dual' {
  if (isSingleBackend(env)) return 'node';
  const raw = (env.SF_GROUPS_BACKEND ?? '').trim().toLowerCase();
  return raw === 'node' || raw === 'dual' ? raw : 'python';
}

/**
 * 是否挂载 python proxyFallback。
 * legacy → 挂（现状）；single → 不挂（缺口由显式 404 暴露，见 installSingleBackendGapHandler）。
 */
export function shouldMountProxyFallback(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isSingleBackend(env);
}
