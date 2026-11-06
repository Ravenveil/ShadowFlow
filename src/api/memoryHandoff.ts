/**
 * Memory Handoff API client — 功能线③ 记忆与交接（2026-11-05）。
 *
 * 后端：server/src/routes/memory-handoff.ts（挂载在 /api/memory/handoff）。
 * 与 memoryLessons.ts（经验记忆）/ memoryEntries.ts（河流记忆）并存，互不覆盖。
 *
 * 契约：
 *   GET    /api/memory/handoff/stats                 → 概览计数
 *   GET    /api/memory/handoff?agent=&status=        → 交接包列表
 *   POST   /api/memory/handoff                      → A 下班建包（自动汇总快照）
 *   GET    /api/memory/handoff/:id                  → 详情（含 context）
 *   POST   /api/memory/handoff/:id/accept           → B 接班（幂等）
 *   GET    /api/memory/handoff/context?agent=B      → B 当前可读上下文
 *   GET    /api/memory/handoff/profiles/conflicts   → 待裁决的画像冲突
 *   POST   /api/memory/handoff/profiles/conflicts/resolve → 裁决（采纳 / 驳回）
 *   GET    /api/memory/handoff/profiles/:subjectId  → 当前画像 + 变更流水
 *   POST   /api/memory/handoff/profiles/writeback   → 长期画像写回（force 可裁决）
 *   POST   /api/memory/handoff/profiles/ingest      → 反馈规则式自动提炼
 */

import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();
const BASE = `${API_BASE_URL}/api/memory/handoff`;

export interface HandoffShift {
  shift_id: string;
  from_agent: string;
  to_agent: string;
  scope_key: string;
  task_type: string;
}

export interface HandoffContext {
  generated_at: number;
  shift: HandoffShift;
  lessons: Array<{
    id: string; kind: string; scope_key: string; task_type: string;
    content: string; score: number; source: string;
  }>;
  open_items: Array<{ goal: string; n: number }>;
  profiles: Array<{ subject_id: string; key: string; value: string; confidence: number }>;
}

export interface Handoff {
  id: string;
  shift_id: string;
  from_agent: string;
  to_agent: string;
  scope_key: string;
  task_type: string;
  summary: string;
  status: 'pending' | 'accepted';
  created_at: number;
  accepted_at: number | null;
  context_items: number;
  context?: HandoffContext;
}

export interface HandoffStats {
  handoffs: number;
  pending: number;
  accepted: number;
  handoff_items: number;
  profiles: number;
  profile_events: number;
  /** 历史累计冲突次数（含已裁决） */
  conflicts: number;
  /** 当前还等人处理的条数 */
  pending_conflicts: number;
}

export interface ContextItem {
  type: 'memory' | 'handoff' | 'lesson';
  source: string;
  content: string;
  kind?: string;
  from_agent?: string;
  shift_id?: string;
  score?: number;
}

export interface HandoffContextResult {
  agent: string;
  scope: { scope_key: string; task_type: string };
  items: ContextItem[];
  count: number;
  sources: string[];
}

export interface WritebackResult {
  subject_type: string;
  subject_id: string;
  key: string;
  action: 'create' | 'update' | 'conflict' | 'keep' | 'override' | 'dismiss';
  changed: boolean;
  value: string;
  confidence: number;
}

export interface ProfileResult {
  subject: { type: string; id: string };
  profile: Array<{
    key: string; value: string; confidence: number;
    source: string; evidence: string; updated_at: number;
  }>;
  history: Array<{
    key: string; old_value: string | null; new_value: string; action: string;
    confidence: number; source: string; actor: string; created_at: number;
  }>;
  writes: number;
  /** 历史累计冲突次数 */
  conflicts: number;
  /** 当前待裁决条数 */
  pending_conflicts: number;
}

export interface IngestResult {
  subject_id: string;
  profile_keys: string[];
  extracted: number;
  rules: number;
}

export class MemoryHandoffError extends Error {
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
      // 非 JSON 错误体（SPA fallback 回了 index.html）用 statusText。
    }
    throw new MemoryHandoffError(res.status, msg);
  }
  return (await res.json()) as T;
}

function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => handle<T>(r));
}

export function listHandoffs(opts: { agent?: string; status?: string; limit?: number } = {}): Promise<Handoff[]> {
  const qs = new URLSearchParams();
  if (opts.agent) qs.set('agent', opts.agent);
  if (opts.status) qs.set('status', opts.status);
  if (opts.limit) qs.set('limit', String(opts.limit));
  return fetch(`${BASE}${qs.toString() ? `?${qs}` : ''}`).then((r) => handle<Handoff[]>(r));
}

export function createHandoff(payload: {
  shift_id: string; from_agent: string; to_agent: string;
  scope_key?: string; task_type?: string; summary?: string;
}): Promise<{ handoff: Handoff; idempotent: boolean }> {
  return post(`${BASE}`, payload as unknown as Record<string, unknown>);
}

export function getHandoff(id: string): Promise<Handoff> {
  return fetch(`${BASE}/${encodeURIComponent(id)}`).then((r) => handle<Handoff>(r));
}

export function acceptHandoff(id: string, to_agent: string): Promise<{
  handoff: Handoff; injected: number; idempotent: boolean;
}> {
  return post(`${BASE}/${encodeURIComponent(id)}/accept`, { to_agent });
}

export function getHandoffContext(agent: string, opts: {
  scope_key?: string; task_type?: string; limit?: number;
} = {}): Promise<HandoffContextResult> {
  const qs = new URLSearchParams({ agent });
  if (opts.scope_key) qs.set('scope_key', opts.scope_key);
  if (opts.task_type) qs.set('task_type', opts.task_type);
  if (opts.limit) qs.set('limit', String(opts.limit));
  return fetch(`${BASE}/context?${qs}`).then((r) => handle<HandoffContextResult>(r));
}

export function getHandoffStats(): Promise<HandoffStats> {
  return fetch(`${BASE}/stats`).then((r) => handle<HandoffStats>(r));
}

export function writebackProfile(payload: {
  subject_id: string; key: string; value: string; confidence?: number;
  subject_type?: string; source?: string; evidence?: string; actor?: string;
  /** 人工裁决：绕过置信度比较直接覆盖（后端记 action='override'） */
  force?: boolean;
}): Promise<WritebackResult> {
  return post(`${BASE}/profiles/writeback`, payload as unknown as Record<string, unknown>);
}

export function getProfile(subjectId: string, subjectType = 'customer'): Promise<ProfileResult> {
  return fetch(`${BASE}/profiles/${encodeURIComponent(subjectId)}?subject_type=${encodeURIComponent(subjectType)}`)
    .then((r) => handle<ProfileResult>(r));
}

export function ingestFeedback(payload: {
  subject_id: string; text: string; subject_type?: string; actor?: string;
}): Promise<IngestResult> {
  return post(`${BASE}/profiles/ingest`, payload as unknown as Record<string, unknown>);
}

/** 同置信不同说法的写回：后端只记 conflict 不改值，等人在这里定夺。 */
export interface ProfileConflict {
  subject_type: string;
  subject_id: string;
  key: string;
  current_value: string;
  current_confidence: number;
  proposed_value: string;
  proposed_confidence: number;
  source: string;
  evidence: string;
  created_at: number;
}

export interface ConflictResolution {
  subject_type: string;
  subject_id: string;
  key: string;
  decision: 'accept' | 'dismiss';
  action: string;
  value: string;
  actor: string;
  resolved_at: number;
}

export function listProfileConflicts(
  opts: { limit?: number; subject_id?: string } = {},
): Promise<ProfileConflict[]> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.subject_id) qs.set('subject_id', opts.subject_id);
  const q = qs.toString();
  return fetch(`${BASE}/profiles/conflicts${q ? `?${q}` : ''}`).then((r) =>
    handle<ProfileConflict[]>(r),
  );
}

/** 采纳提议 / 驳回提议（保留当前值）；重复裁决后端返回 404。 */
export function resolveProfileConflict(payload: {
  subject_id: string;
  key: string;
  decision: 'accept' | 'dismiss';
  subject_type?: string;
  actor?: string;
}): Promise<ConflictResolution> {
  return post(`${BASE}/profiles/conflicts/resolve`, payload as unknown as Record<string, unknown>);
}
