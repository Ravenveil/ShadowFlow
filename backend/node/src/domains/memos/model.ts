/**
 * memos 域 — 领域模型（内部，业务变化驱动）
 *
 * 个人工作备忘 / 日程：纯领域规则，禁止 import express / fs / sqlite。
 * 前端契约（frontend/app/src/chat-api.ts SfMemo）：
 *   { memo_id, title, note, due_at, done, created_at, updated_at }
 */

export interface Memo {
  memo_id: string;
  title: string;
  note: string;
  /** ISO 日期（YYYY-MM-DD）或 null。 */
  due_at: string | null;
  done: boolean;
  /** epoch ms。 */
  created_at: number;
  updated_at: number;
}

/** 持久化态：整存整取。 */
export interface MemoStore {
  memos: Memo[];
}

export type NewMemo = Pick<Memo, 'title'> & { note?: string; due_at?: string | null };
export type MemoPatch = Partial<Pick<Memo, 'title' | 'note' | 'due_at' | 'done'>>;

export const TITLE_MAX = 200;
export const NOTE_MAX = 4000;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export type MemoErrorCode = 'INVALID_TITLE' | 'TITLE_TOO_LONG' | 'NOTE_TOO_LONG' | 'INVALID_DUE';

export class MemoDomainError extends Error {
  constructor(public readonly code: MemoErrorCode) {
    super(code);
    this.name = 'MemoDomainError';
  }
}

export function isValidMemoId(id: string): boolean {
  return UUID_RE.test(id);
}

function assertTitle(title: unknown): asserts title is string {
  if (typeof title !== 'string' || title.trim().length === 0) throw new MemoDomainError('INVALID_TITLE');
  if (title.length > TITLE_MAX) throw new MemoDomainError('TITLE_TOO_LONG');
}

function assertNote(note: unknown): asserts note is string {
  if (typeof note !== 'string' || note.length > NOTE_MAX) throw new MemoDomainError('NOTE_TOO_LONG');
}

function assertDue(due: unknown): asserts due is string | null {
  if (due === null || due === undefined || due === '') return;
  if (typeof due !== 'string' || due.length > 40) throw new MemoDomainError('INVALID_DUE');
}

/** 领域工厂：新建备忘，生成 id 与时间戳（测试可注入）。 */
export function createMemo(
  input: NewMemo,
  deps: { now?: () => number; newId?: () => string } = {},
): Memo {
  assertTitle(input.title);
  assertNote(input.note ?? '');
  assertDue(input.due_at ?? null);
  const now = (deps.now ?? (() => Date.now()))();
  return {
    memo_id: (deps.newId ?? (() => crypto.randomUUID()))(),
    title: input.title.trim(),
    note: input.note ?? '',
    due_at: input.due_at ? input.due_at : null,
    done: false,
    created_at: now,
    updated_at: now,
  };
}

/** 应用补丁：守同样不变量，刷新 updated_at，返回新对象。 */
export function applyMemoPatch(
  memo: Memo,
  patch: MemoPatch,
  deps: { now?: () => number } = {},
): Memo {
  const next: Memo = { ...memo };
  if (patch.title !== undefined) {
    assertTitle(patch.title);
    next.title = patch.title.trim();
  }
  if (patch.note !== undefined) {
    assertNote(patch.note);
    next.note = patch.note;
  }
  if (patch.due_at !== undefined) {
    assertDue(patch.due_at);
    next.due_at = patch.due_at ? patch.due_at : null;
  }
  if (patch.done !== undefined) {
    if (typeof patch.done !== 'boolean') throw new MemoDomainError('INVALID_TITLE');
    next.done = patch.done;
  }
  next.updated_at = (deps.now ?? (() => Date.now()))();
  return next;
}

/** 列表排序：更新新的在前。 */
export function sortByUpdatedDesc(memos: readonly Memo[]): Memo[] {
  return memos.slice().sort((a, b) => b.updated_at - a.updated_at);
}
