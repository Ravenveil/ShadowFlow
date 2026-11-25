/**
 * memory.ts — 记忆三区的 HTTP 客户端（手写条目 / 经验沉淀 / 画像）。
 *
 * 对齐后端 domains/memory 的三组真实端点（都已迁到 Node 单后端）：
 *   /api/memory-entries           手写笔记（user / project / session 三种作用域）
 *   /api/memory/lessons           经验沉淀（run 失败/中断自动写，也可手补）
 *   /api/memory/profiles          记忆画像（每条一套保留/召回策略）
 *
 * 组件不直接写 fetch、不认后端路径：路径只出现在本文件。
 * 404 一律走 mayGet 的兜底：后端没这块功能时界面显示空态，而不是报错。
 */
import { mayGet, request } from '@/shared/data/http/client';

/* ── 手写条目 ─────────────────────────────────────────────────────── */

export type MemoryScope = 'user' | 'project' | 'session';

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntryDraft {
  scope: MemoryScope;
  title: string;
  content: string;
}

export const listMemoryEntries = () =>
  mayGet<MemoryEntry[]>('/api/memory-entries').then((rows) => rows ?? []);

export const createMemoryEntry = (draft: MemoryEntryDraft) =>
  request<MemoryEntry>('/api/memory-entries', {
    method: 'POST',
    body: JSON.stringify(draft),
  });

export const deleteMemoryEntry = (id: string) =>
  request<null>(`/api/memory-entries/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* ── 经验沉淀 ─────────────────────────────────────────────────────── */

/** 三类沉淀：教训 / 偏好 / 弱项（后端 kind 字段就这三个值）。 */
export type LessonKind = 'lesson' | 'preference' | 'weakness';

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
}

export const listMemoryLessons = () =>
  mayGet<MemoryLesson[] | { data: MemoryLesson[] }>('/api/memory/lessons').then((res) =>
    Array.isArray(res) ? res : (res?.data ?? []),
  );

/** 归档（软删留痕）：后端返回那条 lesson，界面据此从列表里摘掉。 */
export const archiveMemoryLesson = (id: string) =>
  request<MemoryLesson>(`/api/memory/lessons/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* ── 画像 ─────────────────────────────────────────────────────────── */

export interface MemoryProfile {
  profile_id: string;
  working_memory_limit: number;
  episodic_retention_days: number;
  semantic_retrieval_top_k: number;
  writeback_policy: string;
  state_sync_policy: string;
  compression_policy: string;
  created_at: string;
  updated_at: string;
}

export const listMemoryProfiles = () =>
  mayGet<{ data: MemoryProfile[] }>('/api/memory/profiles').then((res) => res?.data ?? []);

export const deleteMemoryProfile = (id: string) =>
  request<null>(`/api/memory/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* ── 召回设置（走通用 settings 键值对；没写过就是后端缺省） ─────────── */

const SETTING_AUTO_LEARN = '/api/settings/memory.autoLearn';
const SETTING_RECALL_TOP_K = '/api/settings/memory.recallTopK';

interface SettingValue<T> {
  value: T;
}

/** 自动沉淀开关：缺省开（后端没写过这个 key 时返回 404）。 */
export const getAutoLearn = () =>
  mayGet<SettingValue<boolean>>(SETTING_AUTO_LEARN).then((res) => res?.value ?? true);

export const setAutoLearn = (value: boolean) =>
  request<SettingValue<boolean>>(SETTING_AUTO_LEARN, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

/** 每次召回条数：缺省 4。 */
export const getRecallTopK = () =>
  mayGet<SettingValue<number>>(SETTING_RECALL_TOP_K).then((res) => res?.value ?? 4);

export const setRecallTopK = (value: number) =>
  request<SettingValue<number>>(SETTING_RECALL_TOP_K, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
