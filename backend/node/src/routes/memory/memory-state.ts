/**
 * 兼容层（2026-11-19 目录重构第 3 批）：memory 路由已迁到 domains/memory/adapters 域。
 * 旧导入路径保持不变，调用方（index.ts）无需修改；确认无引用后可单独删除本文件。
 */
export { default } from '../../domains/memory/adapters/memory-state';
