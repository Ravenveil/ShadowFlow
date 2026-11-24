/**
 * backend-mode.ts — 后端模式（2026-11-24 起恒为 single，ADR-0001）
 *
 * 历史：2026-11-18 引入 single/legacy 双模式作为单后端迁移的渐进开关；
 * 2026-11-19 默认切 single（gap 探针 112 个 GET 全非 gap）；2026-11-21 起
 * dev.mjs 不再拉起 Python。2026-11-24 ADR-0001 生效：backend/python 已删除，
 * legacy 逃生舱随之终结 —— 本模块退化为常量真源，保留函数签名让调用方
 * 无痛过渡；散落的 `if (!isSingleBackend())` 分支已成死代码，随改随清。
 *
 * 恢复双后端？不要。看 documentation/ADR-0001-single-backend.md 的收尾清单。
 */

export type BackendMode = 'single';

export const BACKEND_MODE_VALUES: readonly BackendMode[] = ['single'] as const;

/** 恒 single（ADR-0001：Python 后端已退役；SF_BACKEND_MODE 环境变量已作废）。 */
export function getBackendMode(_env: NodeJS.ProcessEnv = process.env): BackendMode {
  return 'single';
}

export function isSingleBackend(_env: NodeJS.ProcessEnv = process.env): boolean {
  return true;
}

/** groups 后端恒为 node（SF_GROUPS_BACKEND=python 已无后端可指）。 */
export function groupsBackendEnv(_env: NodeJS.ProcessEnv = process.env): 'node' {
  return 'node';
}

/** proxyFallback 已随 Python 退役删除 —— 恒不挂载。 */
export function shouldMountProxyFallback(_env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}
