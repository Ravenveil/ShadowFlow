/**
 * 兼容层（2026-11-19 目录重构第 2 批）：Token 用量流水已迁到 analytics/usage 域。
 * 旧导入路径保持不变，调用方无需修改；确认无引用后可单独删除本文件。
 */
export * from '../domains/analytics/usage/adapters/token-usage';
