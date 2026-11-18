/**
 * memory-profile-configs.ts — 单后端迁移：MemoryProfile 配置 CRUD 数据层。
 *
 * 移植自 python shadowflow/memory/memory_profile.py（数据契约）+ api/memory/
 * memory.py 的 _profiles 纯内存 dict（Story 9.3 AC1/AC4）。Python 侧进程重启
 * 即丢、无历史数据，经主理人裁决直接落 sqlite 新表 memory_profile_configs
 * （sqlite.ts getDb() 统一建表），无数据迁移。
 *
 * 字段与约束逐项对齐 memory_profile.py：
 *   working_memory_limit     int >= 256   默认 4096
 *   episodic_retention_days  int >= 0     默认 30
 *   semantic_retrieval_top_k int >= 1     默认 5
 *   compression_top_k        int >= 1     默认 10
 *   writeback_policy ∈ {always, on_task_complete, on_session_end, manual}
 *   state_sync_policy ∈ {eager, lazy, disabled}
 *   compression_policy ∈ {none, summarize, select_top_k}
 *   created_at / updated_at  ISO-8601 TEXT（datetime.isoformat() 语义）
 */

import { randomUUID } from 'crypto';
import { getDb } from './sqlite';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type WritebackPolicy = 'always' | 'on_task_complete' | 'on_session_end' | 'manual';
export type StateSyncPolicy = 'eager' | 'lazy' | 'disabled';
export type CompressionPolicy = 'none' | 'summarize' | 'select_top_k';

export interface MemoryProfile {
  profile_id: string;
  working_memory_limit: number;
  episodic_retention_days: number;
  semantic_retrieval_top_k: number;
  compression_top_k: number;
  writeback_policy: WritebackPolicy;
  state_sync_policy: StateSyncPolicy;
  compression_policy: CompressionPolicy;
  created_at: string;
  updated_at: string;
}

/** PATCH 可选字段（PatchProfileRequest 同形；undefined = 不更新）。 */
export interface ProfilePatch {
  working_memory_limit?: number;
  episodic_retention_days?: number;
  semantic_retrieval_top_k?: number;
  compression_top_k?: number;
  writeback_policy?: WritebackPolicy;
  state_sync_policy?: StateSyncPolicy;
  compression_policy?: CompressionPolicy;
}

// ---------------------------------------------------------------------------
// 校验（Field ge 约束 + 枚举档位，非法抛 FieldViolation）
// ---------------------------------------------------------------------------

export class FieldViolationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

interface NumConstraint {
  field: string;
  min: number;
  minLabel: number;
}

const NUM_CONSTRAINTS: NumConstraint[] = [
  { field: 'working_memory_limit', min: 256, minLabel: 256 },
  { field: 'episodic_retention_days', min: 0, minLabel: 0 },
  { field: 'semantic_retrieval_top_k', min: 1, minLabel: 1 },
  { field: 'compression_top_k', min: 1, minLabel: 1 },
];

const WRITEBACK_POLICIES: ReadonlySet<string> = new Set([
  'always',
  'on_task_complete',
  'on_session_end',
  'manual',
]);
const STATE_SYNC_POLICIES: ReadonlySet<string> = new Set(['eager', 'lazy', 'disabled']);
const COMPRESSION_POLICIES: ReadonlySet<string> = new Set(['none', 'summarize', 'select_top_k']);

function checkNumeric(field: string, value: unknown, min: number, minLabel: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new FieldViolationError(`${field} must be an integer`);
  }
  if (value < min) {
    // 文案对齐 FastAPI/Pydantic field 约束报错
    throw new FieldViolationError(`${field} must be greater than or equal to ${minLabel}`);
  }
  return value;
}

function checkEnum(field: string, value: unknown, allowed: ReadonlySet<string>): string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new FieldViolationError(
      `${field} must be one of: ${Array.from(allowed).join(', ')}`,
    );
  }
  return value;
}

function checkNumericPatch(patch: ProfilePatch): void {
  for (const { field, min, minLabel } of NUM_CONSTRAINTS) {
    const v = patch[field as keyof ProfilePatch];
    if (v === undefined) continue;
    checkNumeric(field, v, min, minLabel);
  }
}

function checkEnumPatch(patch: ProfilePatch): void {
  if (patch.writeback_policy !== undefined) {
    checkEnum('writeback_policy', patch.writeback_policy, WRITEBACK_POLICIES);
  }
  if (patch.state_sync_policy !== undefined) {
    checkEnum('state_sync_policy', patch.state_sync_policy, STATE_SYNC_POLICIES);
  }
  if (patch.compression_policy !== undefined) {
    checkEnum('compression_policy', patch.compression_policy, COMPRESSION_POLICIES);
  }
}

// ---------------------------------------------------------------------------
// profile_id 正则（memory.py _UUID_RE 同款）
// ---------------------------------------------------------------------------

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// 行 ↔ 对象
// ---------------------------------------------------------------------------

interface ProfileRow {
  profile_id: string;
  working_memory_limit: number;
  episodic_retention_days: number;
  semantic_retrieval_top_k: number;
  compression_top_k: number;
  writeback_policy: string;
  state_sync_policy: string;
  compression_policy: string;
  created_at: string;
  updated_at: string;
}

function rowToProfile(r: ProfileRow): MemoryProfile {
  return {
    profile_id: r.profile_id,
    working_memory_limit: r.working_memory_limit,
    episodic_retention_days: r.episodic_retention_days,
    semantic_retrieval_top_k: r.semantic_retrieval_top_k,
    compression_top_k: r.compression_top_k,
    writeback_policy: r.writeback_policy as WritebackPolicy,
    state_sync_policy: r.state_sync_policy as StateSyncPolicy,
    compression_policy: r.compression_policy as CompressionPolicy,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD（memory.py 端点行为对齐）
// ---------------------------------------------------------------------------

/** POST /profiles — 缺省字段回填默认值，生成 uuid4 形 profile_id。 */
export function createProfile(patch: ProfilePatch): MemoryProfile {
  checkNumericPatch(patch);
  checkEnumPatch(patch);
  const now = new Date().toISOString();
  const profile: MemoryProfile = {
    profile_id: randomUUID(),
    working_memory_limit: patch.working_memory_limit ?? 4096,
    episodic_retention_days: patch.episodic_retention_days ?? 30,
    semantic_retrieval_top_k: patch.semantic_retrieval_top_k ?? 5,
    compression_top_k: patch.compression_top_k ?? 10,
    writeback_policy: patch.writeback_policy ?? 'on_task_complete',
    state_sync_policy: patch.state_sync_policy ?? 'lazy',
    compression_policy: patch.compression_policy ?? 'none',
    created_at: now,
    updated_at: now,
  };
  getDb()
    .prepare(
      `INSERT INTO memory_profile_configs
       (profile_id, working_memory_limit, episodic_retention_days, semantic_retrieval_top_k,
        compression_top_k, writeback_policy, state_sync_policy, compression_policy,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      profile.profile_id,
      profile.working_memory_limit,
      profile.episodic_retention_days,
      profile.semantic_retrieval_top_k,
      profile.compression_top_k,
      profile.writeback_policy,
      profile.state_sync_policy,
      profile.compression_policy,
      profile.created_at,
      profile.updated_at,
    );
  return profile;
}

/** GET /profiles — 全量，按 updated_at 倒序（memory.py list_profiles 同口径）。 */
export function listProfiles(): MemoryProfile[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM memory_profile_configs ORDER BY updated_at DESC, profile_id ASC`,
    )
    .all() as ProfileRow[];
  return rows.map(rowToProfile);
}

/** GET /profiles/:id — 不存在返回 null（路由层 404）。 */
export function getProfile(profileId: string): MemoryProfile | null {
  const row = getDb()
    .prepare(`SELECT * FROM memory_profile_configs WHERE profile_id = ?`)
    .get(profileId) as ProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

/**
 * PATCH /profiles/:id — model_copy(update={...patch, updated_at=now}) 同构。
 * 只更新出现的字段；字段校验失败抛 FieldViolationError（不触碰库）。
 */
export function updateProfile(profileId: string, patch: ProfilePatch): MemoryProfile | null {
  checkNumericPatch(patch);
  checkEnumPatch(patch);
  const existing = getProfile(profileId);
  if (!existing) return null;
  const updated: MemoryProfile = {
    ...existing,
    ...(patch.working_memory_limit !== undefined ? { working_memory_limit: patch.working_memory_limit } : {}),
    ...(patch.episodic_retention_days !== undefined ? { episodic_retention_days: patch.episodic_retention_days } : {}),
    ...(patch.semantic_retrieval_top_k !== undefined ? { semantic_retrieval_top_k: patch.semantic_retrieval_top_k } : {}),
    ...(patch.compression_top_k !== undefined ? { compression_top_k: patch.compression_top_k } : {}),
    ...(patch.writeback_policy !== undefined ? { writeback_policy: patch.writeback_policy } : {}),
    ...(patch.state_sync_policy !== undefined ? { state_sync_policy: patch.state_sync_policy } : {}),
    ...(patch.compression_policy !== undefined ? { compression_policy: patch.compression_policy } : {}),
    updated_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `UPDATE memory_profile_configs SET
         working_memory_limit = ?, episodic_retention_days = ?, semantic_retrieval_top_k = ?,
         compression_top_k = ?, writeback_policy = ?, state_sync_policy = ?,
         compression_policy = ?, updated_at = ?
       WHERE profile_id = ?`,
    )
    .run(
      updated.working_memory_limit,
      updated.episodic_retention_days,
      updated.semantic_retrieval_top_k,
      updated.compression_top_k,
      updated.writeback_policy,
      updated.state_sync_policy,
      updated.compression_policy,
      updated.updated_at,
      profileId,
    );
  return updated;
}

/** DELETE /profiles/:id — true=删了一行；false=不存在。 */
export function deleteProfile(profileId: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM memory_profile_configs WHERE profile_id = ?`)
    .run(profileId);
  return info.changes > 0;
}
