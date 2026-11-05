/**
 * Memory Lessons API client — 经验记忆（2026-11-05，对接 OPC-OS PR#3 设计移植的
 * Node 后端 /api/memory/lessons，server/src/routes/memory-lessons.ts）。
 *
 * 与 memoryEntries.ts（河流记忆，手动条目）并存双区：
 *   - 河流记忆：用户手动写的跨会话笔记（user/project/session scope）。
 *   - 经验记忆（本文件）：系统在 run 结束时自动沉淀的教训/偏好/弱项，
 *     召回进提示词；也允许手动补一条（source='manual'）。
 *
 * 后端契约：
 *   GET    /api/memory/lessons?scope_key=&kind=&includeArchived=&limit=  → MemoryLesson[]
 *   POST   /api/memory/lessons  { content, kind?, scope_key?, task_type?,
 *                                 source?, source_ref?, title?, score? }  → 201 MemoryLesson
 *                          （重复内容自动加权而非新增）
 *   GET    /api/memory/lessons/stats → { total, by_kind, top_k, max_per_scope }
 *   DELETE /api/memory/lessons/:id → 200 MemoryLesson（软删=归档留痕）
 *   GET/PUT /api/settings/memory.autoLearn   → 自动沉淀开关（缺省=开）
 *   GET/PUT /api/settings/memory.recallTopK  → 每次召回条数（缺省=4）
 */

import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export const KIND_LESSON = 'lesson';
export const KIND_PREF = 'preference';
export const KIND_WEAK = 'weakness';

export const KIND_LABELS: Record<string, string> = {
  [KIND_LESSON]: '教训',
  [KIND_PREF]: '偏好',
  [KIND_WEAK]: '弱项',
};

export const SOURCE_LABELS: Record<string, string> = {
  run_failed: 'run 失败沉淀',
  user_abort: '用户中断沉淀',
  manual: '手动补充',
  gateway_failed: '网关失败沉淀',
};

export interface MemoryLesson {
  id: string;
  kind: string;
  scope_key: string;
  task_type: string;
  title: string;
  content: string;
  source: string;
  source_ref: string;
  score: number;
  hits: number;
  archived: number;
  created_at: number;
  updated_at: number;
}

export interface MemoryLessonStats {
  total: number;
  by_kind: Record<string, number>;
  top_k: number;
  max_per_scope: number;
}

export interface RememberLessonPayload {
  content: string;
  kind?: string;
  scope_key?: string;
  task_type?: string;
  source?: string;
  source_ref?: string;
  title?: string;
  score?: number;
}

export class MemoryLessonsError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // 非 JSON 错误体（典型：SPA fallback 回了 index.html），用 statusText。
    }
    throw new MemoryLessonsError(res.status, msg);
  }
  return (await res.json()) as T;
}

export async function listMemoryLessons(opts: {
  scope_key?: string;
  kind?: string;
  includeArchived?: boolean;
  limit?: number;
} = {}): Promise<MemoryLesson[]> {
  const qs = new URLSearchParams();
  if (opts.scope_key) qs.set('scope_key', opts.scope_key);
  if (opts.kind) qs.set('kind', opts.kind);
  if (opts.includeArchived) qs.set('includeArchived', '1');
  if (opts.limit) qs.set('limit', String(opts.limit));
  const res = await fetch(`${API_BASE_URL}/api/memory/lessons${qs.toString() ? `?${qs}` : ''}`);
  return handle<MemoryLesson[]>(res);
}

export async function rememberLesson(payload: RememberLessonPayload): Promise<MemoryLesson> {
  const res = await fetch(`${API_BASE_URL}/api/memory/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handle<MemoryLesson>(res);
}

export async function getMemoryLessonStats(): Promise<MemoryLessonStats> {
  const res = await fetch(`${API_BASE_URL}/api/memory/lessons/stats`);
  return handle<MemoryLessonStats>(res);
}

export async function forgetMemoryLesson(id: string): Promise<MemoryLesson> {
  const res = await fetch(`${API_BASE_URL}/api/memory/lessons/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handle<MemoryLesson>(res);
}

// ── 设置（autoLearn / recallTopK 走通用 /api/settings/:key）──────────────────

/** 读一个设置；404（未设置）时返回 fallback —— 语义上"没配=用默认值"。 */
export async function getMemorySetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/settings/${encodeURIComponent(key)}`);
    if (res.status === 404) return fallback;
    const body = await handle<{ key: string; value: T }>(res);
    return body.value;
  } catch {
    return fallback;
  }
}

export async function putMemorySetting(key: string, value: unknown): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  await handle<{ key: string; value: unknown }>(res);
}
