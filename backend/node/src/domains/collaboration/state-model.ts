/**
 * collaboration 域 — agent-state 子域领域模型（纯规则层）
 *
 * 错误体系、ID 校验、AgentState 默认值/宽容归一化、乐观锁 patch、reset、
 * 快照列表排序等纯规则。纯函数，禁止 import fs/path/crypto/storage。
 * 移植自 storage/agent-state-service.ts，行为逐字对齐。
 */

/** State ID 正则：[A-Za-z0-9_-]{1,128} */
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

// ── 错误体系（对齐 runtime/errors.py） ────────────────────────────────────────

export class StateServiceError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'StateServiceError';
  }
}

/** 乐观锁版本冲突。 */
export class StateConflictError extends StateServiceError {
  readonly expected: number;
  readonly got: number;
  constructor(expected: number, got: number) {
    super('STATE_CONFLICT', `State version conflict: expected ${expected}, got ${got}`, { expected, got });
    this.expected = expected;
    this.got = got;
    this.name = 'StateConflictError';
  }
}

/** 快照不存在。 */
export class SnapshotNotFoundError extends StateServiceError {
  constructor(agentId: string, snapshotId: string) {
    super('SNAPSHOT_NOT_FOUND', `Snapshot '${snapshotId}' not found for agent '${agentId}'`, {
      agent_id: agentId,
      snapshot_id: snapshotId,
    });
    this.name = 'SnapshotNotFoundError';
  }
}

// ── 校验 ──────────────────────────────────────────────────────────────────────

export function validateAgentId(agentId: string): void {
  if (!ID_RE.test(agentId)) {
    throw new StateServiceError(
      'SHADOWFLOW_ERROR',
      `Invalid agent_id '${agentId}': must match [A-Za-z0-9_-]{1,128}`,
      { agent_id: agentId },
    );
  }
}

export function validateSnapshotId(snapshotId: string): void {
  if (!ID_RE.test(snapshotId)) {
    throw new StateServiceError(
      'SHADOWFLOW_ERROR',
      `Invalid snapshot_id '${snapshotId}': must match [A-Za-z0-9_-]{1,128}`,
      { snapshot_id: snapshotId },
    );
  }
}

// ── 实体 ──────────────────────────────────────────────────────────────────────

export interface AgentState {
  agent_id: string;
  role_profile_ref: string;
  memory_profile_ref: string;
  state_fields: Record<string, unknown>;
  session_summary: string;
  recent_artifacts: string[];
  pending_tasks: string[];
  last_writeback_at: string | null;
  state_version: number;
  created_at: string;
  updated_at: string;
}

/** patch 永远碰不到的字段（乐观锁身份字段）。 */
export const IMMUTABLE_FIELDS = new Set(['agent_id', 'state_version', 'created_at', 'updated_at']);
/** patch 可写的白名单。 */
export const MUTABLE_FIELDS = new Set([
  'role_profile_ref',
  'memory_profile_ref',
  'state_fields',
  'session_summary',
  'recent_artifacts',
  'pending_tasks',
  'last_writeback_at',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** model_validate_json 宽容版：缺字段回填 Pydantic 默认值。 */
export function normalizeState(raw: unknown, agentId: string, now: () => string): AgentState {
  const r = isPlainObject(raw) ? raw : {};
  return {
    agent_id: typeof r.agent_id === 'string' ? r.agent_id : agentId,
    role_profile_ref: typeof r.role_profile_ref === 'string' ? r.role_profile_ref : '',
    memory_profile_ref: typeof r.memory_profile_ref === 'string' ? r.memory_profile_ref : '',
    state_fields: isPlainObject(r.state_fields) ? r.state_fields : {},
    session_summary: typeof r.session_summary === 'string' ? r.session_summary : '',
    recent_artifacts: isStringArray(r.recent_artifacts) ? r.recent_artifacts : [],
    pending_tasks: isStringArray(r.pending_tasks) ? r.pending_tasks : [],
    last_writeback_at: typeof r.last_writeback_at === 'string' ? r.last_writeback_at : null,
    state_version:
      typeof r.state_version === 'number' && Number.isInteger(r.state_version) ? r.state_version : 0,
    created_at: typeof r.created_at === 'string' ? r.created_at : now(),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : now(),
  };
}

/** AgentState(agent_id=...) 构造（Pydantic 默认值语义）。 */
export function newAgentState(agentId: string, now: () => string): AgentState {
  const t = now();
  return {
    agent_id: agentId,
    role_profile_ref: '',
    memory_profile_ref: '',
    state_fields: {},
    session_summary: '',
    recent_artifacts: [],
    pending_tasks: [],
    last_writeback_at: null,
    state_version: 0,
    created_at: t,
    updated_at: t,
  };
}

/**
 * 乐观锁 patch：校验版本 → 应用白名单字段 → 版本 +1 → 刷新时间。
 * 冲突抛 StateConflictError。纯函数，返回新对象。
 */
export function applyStatePatch(
  state: AgentState,
  patch: Record<string, unknown>,
  now: () => string,
): AgentState {
  const incomingVersion = typeof patch.version === 'number' ? patch.version : state.state_version;
  if (incomingVersion !== state.state_version) {
    throw new StateConflictError(state.state_version, incomingVersion);
  }
  const next: AgentState = { ...state };
  for (const [key, value] of Object.entries(patch)) {
    if (MUTABLE_FIELDS.has(key)) {
      (next as unknown as Record<string, unknown>)[key] = value;
    }
  }
  next.state_version += 1;
  next.updated_at = now();
  return next;
}

/** reset：清运行态四件套 + last_writeback_at，保留 profile refs，版本 +1。 */
export function resetStateFields(state: AgentState, now: () => string): AgentState {
  return {
    ...state,
    state_fields: {},
    session_summary: '',
    recent_artifacts: [],
    pending_tasks: [],
    last_writeback_at: null,
    state_version: state.state_version + 1,
    updated_at: now(),
  };
}

/** 版本递增（restore 用）。 */
export function bumpVersion(state: AgentState, now: () => string): AgentState {
  return { ...state, state_version: state.state_version + 1, updated_at: now() };
}

/** 快照摘要排序：created_at 倒序，取前 limit。 */
export function sortSnapshots(
  rows: Array<Record<string, unknown>>,
  limit: number,
): Array<Record<string, unknown>> {
  return rows
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, limit);
}

/** 快照摘要构造（从快照 JSON 提取字段）。 */
export function snapshotSummary(
  entryName: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    snapshot_id: entryName.slice(0, -'.json'.length),
    created_at:
      (typeof data.updated_at === 'string' && data.updated_at) ||
      (typeof data.created_at === 'string' && data.created_at) ||
      undefined,
    state_version:
      typeof data.state_version === 'number' && Number.isInteger(data.state_version)
        ? data.state_version
        : 0,
  };
}
