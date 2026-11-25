/**
 * memory 域 — profiles 子域领域模型（内部，业务变化驱动）
 *
 * 字段约束、枚举档位、默认值全部对齐 python memory_profile.py。
 * 纯函数，禁止 import express / sqlite / storage / crypto。
 */

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

export type ProfilePatch = Partial<
  Pick<
    MemoryProfile,
    | 'working_memory_limit'
    | 'episodic_retention_days'
    | 'semantic_retrieval_top_k'
    | 'compression_top_k'
    | 'writeback_policy'
    | 'state_sync_policy'
    | 'compression_policy'
  >
>;

/** 领域错误：字段越界 / 非法枚举。adapter 映射为 422。 */
export class FieldViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldViolationError';
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NumConstraint {
  field: keyof ProfilePatch;
  min: number;
  minLabel: number;
}

/** 数值下限约束（规则单一真源）。 */
export const NUM_CONSTRAINTS: readonly NumConstraint[] = [
  { field: 'working_memory_limit', min: 256, minLabel: 256 },
  { field: 'episodic_retention_days', min: 0, minLabel: 0 },
  { field: 'semantic_retrieval_top_k', min: 1, minLabel: 1 },
  { field: 'compression_top_k', min: 1, minLabel: 1 },
];

export const WRITEBACK_POLICIES: ReadonlySet<string> = new Set([
  'always',
  'on_task_complete',
  'on_session_end',
  'manual',
]);
export const STATE_SYNC_POLICIES: ReadonlySet<string> = new Set(['eager', 'lazy', 'disabled']);
export const COMPRESSION_POLICIES: ReadonlySet<string> = new Set([
  'none',
  'summarize',
  'select_top_k',
]);

/** 默认值（单一真源）。 */
export const DEFAULTS = {
  working_memory_limit: 4096,
  episodic_retention_days: 30,
  semantic_retrieval_top_k: 5,
  compression_top_k: 10,
  writeback_policy: 'on_task_complete' as WritebackPolicy,
  state_sync_policy: 'lazy' as StateSyncPolicy,
  compression_policy: 'none' as CompressionPolicy,
};

// ── 纯校验 ────────────────────────────────────────────────────────────────────

function checkNumeric(field: string, value: unknown, min: number, minLabel: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new FieldViolationError(`${field} must be an integer`);
  }
  if (value < min) {
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

/** 校验 patch（数值 + 枚举），不改入参。create/update 共用。 */
export function validatePatch(patch: ProfilePatch): void {
  for (const { field, min, minLabel } of NUM_CONSTRAINTS) {
    const v = patch[field];
    if (v === undefined) continue;
    checkNumeric(field, v, min, minLabel);
  }
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

/**
 * 领域工厂：新建 profile。校验 → 填默认值 → 生成身份与时间（deps 注入）。
 */
export function createProfile(
  patch: ProfilePatch,
  deps: { newId?: () => string; now?: () => string } = {},
): MemoryProfile {
  validatePatch(patch);
  const now = (deps.now ?? (() => new Date().toISOString()))();
  return {
    profile_id: (deps.newId ?? (() => ''))(),
    working_memory_limit: patch.working_memory_limit ?? DEFAULTS.working_memory_limit,
    episodic_retention_days: patch.episodic_retention_days ?? DEFAULTS.episodic_retention_days,
    semantic_retrieval_top_k: patch.semantic_retrieval_top_k ?? DEFAULTS.semantic_retrieval_top_k,
    compression_top_k: patch.compression_top_k ?? DEFAULTS.compression_top_k,
    writeback_policy: patch.writeback_policy ?? DEFAULTS.writeback_policy,
    state_sync_policy: patch.state_sync_policy ?? DEFAULTS.state_sync_policy,
    compression_policy: patch.compression_policy ?? DEFAULTS.compression_policy,
    created_at: now,
    updated_at: now,
  };
}

/** 在既有实体上应用 patch（model_copy(update=...) 同构），刷新 updated_at。 */
export function applyProfilePatch(
  existing: MemoryProfile,
  patch: ProfilePatch,
  deps: { now?: () => string } = {},
): MemoryProfile {
  validatePatch(patch);
  return {
    ...existing,
    ...(patch.working_memory_limit !== undefined ? { working_memory_limit: patch.working_memory_limit } : {}),
    ...(patch.episodic_retention_days !== undefined ? { episodic_retention_days: patch.episodic_retention_days } : {}),
    ...(patch.semantic_retrieval_top_k !== undefined ? { semantic_retrieval_top_k: patch.semantic_retrieval_top_k } : {}),
    ...(patch.compression_top_k !== undefined ? { compression_top_k: patch.compression_top_k } : {}),
    ...(patch.writeback_policy !== undefined ? { writeback_policy: patch.writeback_policy } : {}),
    ...(patch.state_sync_policy !== undefined ? { state_sync_policy: patch.state_sync_policy } : {}),
    ...(patch.compression_policy !== undefined ? { compression_policy: patch.compression_policy } : {}),
    updated_at: (deps.now ?? (() => new Date().toISOString()))(),
  };
}

/** 列表排序规则：updated_at 倒序，profile_id 升序兜底。 */
export function byUpdatedDesc(a: MemoryProfile, b: MemoryProfile): number {
  return b.updated_at.localeCompare(a.updated_at) || a.profile_id.localeCompare(b.profile_id);
}
