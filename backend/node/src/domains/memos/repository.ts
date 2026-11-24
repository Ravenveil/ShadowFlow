/**
 * memos 域 — Repository 接口（内部，依赖倒置点）。
 * 领域只声明需要的持久化能力，infra 提供实现；换存储只改 infra。
 */

import type { Memo, MemoPatch, MemoStore } from './model';

export interface MemoRepository {
  /** 全部备忘，按 updated_at 倒序。 */
  list(): Memo[];
  get(id: string): Memo | null;
  save(memo: Memo): void;
  /** 应用补丁（不变量由 model 守护），不存在返回 null。 */
  update(id: string, patch: MemoPatch, now?: () => number): Memo | null;
  remove(id: string): boolean;
  load(): MemoStore;
  persist(store: MemoStore): void;
}
