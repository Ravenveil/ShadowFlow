/**
 * memory 域 — 用例（application 层，内部）
 *
 * 每个用例 = 一个业务动作，动词命名，与 HTTP/SQL 无关。
 * 只依赖 model（规则）+ repository（接口），可注入内存实现做单测，不启 server、不碰磁盘。
 */

import {
  createMemoryEntry,
  isMemoryScope,
  isValidId,
  type EntryPatch,
  type MemoryEntry,
  type MemoryScope,
  type NewEntry,
} from '../model';
import type { MemoryEntryRepository } from '../repository';

/** 用例返回体：区分「没找到」与「成功」，避免路由猜 null 语义。 */
export type NotFound = { kind: 'not_found' };
export type Invalid = { kind: 'invalid'; code: string };
export type Ok<T> = { kind: 'ok'; value: T };
export type Result<T> = Ok<T> | NotFound | Invalid;

/** 列出记忆（可按 scope 过滤）。 */
export const makeListEntries =
  (repo: MemoryEntryRepository) =>
  (scope?: unknown): MemoryEntry[] => {
    const filter = isMemoryScope(scope) ? (scope as MemoryScope) : undefined;
    return repo.list(filter);
  };

/** 新建记忆：校验入参形状 → 交给领域工厂守不变量 → 持久化。 */
export const makeCreateEntry =
  (repo: MemoryEntryRepository) =>
  (input: unknown): Result<MemoryEntry> => {
    const body = (input ?? {}) as Partial<NewEntry>;
    if (typeof body.scope !== 'string' || typeof body.title !== 'string') {
      return { kind: 'invalid', code: 'INVALID_BODY' };
    }
    try {
      const entry = createMemoryEntry({
        scope: body.scope as MemoryScope,
        title: body.title,
        content: typeof body.content === 'string' ? body.content : '',
      });
      repo.save(entry);
      return { kind: 'ok', value: entry };
    } catch (err) {
      return { kind: 'invalid', code: (err as Error).message };
    }
  };

/** 更新记忆：id 合法性 → 组装 patch → 交给领域规则 → 持久化。 */
export const makeUpdateEntry =
  (repo: MemoryEntryRepository) =>
  (id: string, input: unknown): Result<MemoryEntry> => {
    if (!isValidId(id)) return { kind: 'invalid', code: 'INVALID_ID' };
    const body = (input ?? {}) as Partial<NewEntry>;
    const patch: EntryPatch = {};
    if (body.scope !== undefined) patch.scope = body.scope as MemoryScope;
    if (body.title !== undefined) patch.title = body.title as string;
    if (body.content !== undefined) patch.content = body.content as string;
    try {
      const updated = repo.update(id, patch);
      return updated ? { kind: 'ok', value: updated } : { kind: 'not_found' };
    } catch (err) {
      return { kind: 'invalid', code: (err as Error).message };
    }
  };

/** 删除记忆。 */
export const makeDeleteEntry =
  (repo: MemoryEntryRepository) =>
  (id: string): Result<true> => {
    if (!isValidId(id)) return { kind: 'invalid', code: 'INVALID_ID' };
    return repo.remove(id) ? { kind: 'ok', value: true } : { kind: 'not_found' };
  };

/** 读开关。 */
export const makeGetSettings =
  (repo: MemoryEntryRepository) =>
  () => repo.getSettings();

/** 更新开关：校验 enabled 必须是布尔。 */
export const makeUpdateSettings =
  (repo: MemoryEntryRepository) =>
  (input: unknown): Result<{ enabled: boolean }> => {
    const body = (input ?? {}) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') {
      return { kind: 'invalid', code: 'INVALID_BODY' };
    }
    return { kind: 'ok', value: repo.updateSettings({ enabled: body.enabled }) };
  };
