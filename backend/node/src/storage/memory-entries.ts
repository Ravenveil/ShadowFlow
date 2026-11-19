/**
 * 兼容层（2026-11-19 目录重构第 4 批 / DDD 样板）：
 * memory-entries 已按 DDD 四件套重建到 domains/memory/{model,repository,infra,use_cases}。
 *
 * 本文件保留旧导出名，调用方零改动；确认全仓无引用后可单独删除本文件。
 * 新结构：
 *   - model.ts                               领域实体/值对象/不变量
 *   - repository.ts                          MemoryEntryRepository 接口
 *   - infra/json-memory-entry.repository.ts  JSON 持久化实现
 *   - use_cases/entries.ts                   业务用例
 */

import { createMemoryEntry, type MemoryEntry, type MemoryScope } from '../domains/memory/model';
import { JsonMemoryEntryRepository } from '../domains/memory/infra/json-memory-entry.repository';

export type { MemoryScope, MemoryEntry, MemoryStore } from '../domains/memory/model';
export { isValidId } from '../domains/memory/model';

const repo = new JsonMemoryEntryRepository();

/** @deprecated 用 domains/memory/use_cases/entries 的 makeListEntries */
export const listEntries = (scope?: MemoryScope): MemoryEntry[] => repo.list(scope);
/** @deprecated 用 makeCreateEntry + model.createMemoryEntry */
export const createEntry = (input: Parameters<typeof createMemoryEntry>[0]): MemoryEntry => {
  const entry = createMemoryEntry(input);
  repo.save(entry);
  return entry;
};
/** @deprecated 用 makeUpdateEntry */
export const updateEntry = (id: string, patch: Parameters<typeof repo.update>[1]): MemoryEntry | null =>
  repo.update(id, patch);
/** @deprecated 用 makeDeleteEntry */
export const deleteEntry = (id: string): boolean => repo.remove(id);
/** @deprecated 用 makeGetSettings */
export const getSettings = (): { enabled: boolean } => repo.getSettings();
/** @deprecated 用 makeUpdateSettings */
export const updateSettings = (settings: { enabled: boolean }): { enabled: boolean } =>
  repo.updateSettings(settings);
