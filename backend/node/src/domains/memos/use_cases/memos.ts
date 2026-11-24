/**
 * memos 域 — 用例（内部），只依赖 model + repository 接口。
 */

import {
  createMemo,
  isValidMemoId,
  type Memo,
  type MemoPatch,
  type NewMemo,
} from '../model';
import type { MemoRepository } from '../repository';

export type NotFound = { kind: 'not_found' };
export type Invalid = { kind: 'invalid'; code: string };
export type Ok<T> = { kind: 'ok'; value: T };
export type Result<T> = Ok<T> | NotFound | Invalid;

export const makeListMemos = (repo: MemoRepository) => (): Memo[] => repo.list();

export const makeCreateMemo =
  (repo: MemoRepository) =>
  (input: unknown): Result<Memo> => {
    const body = (input ?? {}) as Partial<NewMemo>;
    if (typeof body.title !== 'string') return { kind: 'invalid', code: 'INVALID_BODY' };
    try {
      const memo = createMemo({
        title: body.title,
        note: typeof body.note === 'string' ? body.note : '',
        due_at: typeof body.due_at === 'string' ? body.due_at : null,
      });
      repo.save(memo);
      return { kind: 'ok', value: memo };
    } catch (err) {
      return { kind: 'invalid', code: (err as Error).message };
    }
  };

export const makeUpdateMemo =
  (repo: MemoRepository) =>
  (id: string, input: unknown): Result<Memo> => {
    if (!isValidMemoId(id)) return { kind: 'invalid', code: 'INVALID_ID' };
    const body = (input ?? {}) as Partial<MemoPatch>;
    const patch: MemoPatch = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.note !== undefined) patch.note = body.note;
    if (body.due_at !== undefined) patch.due_at = body.due_at;
    if (body.done !== undefined) patch.done = body.done;
    try {
      const updated = repo.update(id, patch);
      return updated ? { kind: 'ok', value: updated } : { kind: 'not_found' };
    } catch (err) {
      return { kind: 'invalid', code: (err as Error).message };
    }
  };

export const makeDeleteMemo =
  (repo: MemoRepository) =>
  (id: string): Result<true> => {
    if (!isValidMemoId(id)) return { kind: 'invalid', code: 'INVALID_ID' };
    return repo.remove(id) ? { kind: 'ok', value: true } : { kind: 'not_found' };
  };
