/**
 * memory 域 — Repository 接口（内部所有，依赖倒置点）
 *
 * 领域层定义它需要的持久化能力，infra 层实现它。
 * use_case 只认识这个接口，不认识 JSON / SQLite / 文件 IO。
 * V1 保持同步签名（与现有 storage 一致），将来换存储再局部异步化。
 */

import type { EntryPatch, MemoryEntry, MemoryScope, MemoryStore } from './model';

export interface MemoryEntryRepository {
  /** 取全部或按 scope 过滤；已按 updated_at 倒序。 */
  list(scope?: MemoryScope): MemoryEntry[];
  /** 按 id 取单条。 */
  get(id: string): MemoryEntry | null;
  /** 新增（不变量由 model 守护，repo 只负责持久化）。 */
  save(entry: MemoryEntry): void;
  /** 按 id 应用补丁（不变量由 model 守护），返回更新后的实体；不存在返回 null。 */
  update(id: string, patch: EntryPatch, now?: () => string): MemoryEntry | null;
  /** 按 id 删除，返回是否删到了。 */
  remove(id: string): boolean;
  /** 读取记忆总开关。 */
  getSettings(): { enabled: boolean };
  /** 更新记忆总开关。 */
  updateSettings(settings: { enabled: boolean }): { enabled: boolean };
  /** 整体存取（供 infra/迁移用，一般 use_case 不碰）。 */
  load(): MemoryStore;
  persist(store: MemoryStore): void;
}
