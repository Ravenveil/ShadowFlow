/**
 * agent-state-service.ts — 单后端迁移：AgentState 服务层（Story 9.4 AC1/AC2）。
 *
 * 移植自 python shadowflow/runtime/state_service.py（全文直译）：
 *   State files:   <data>/agent_state/{agent_id}.json
 *   Snapshots:     <data>/state_snapshots/{agent_id}/{snapshot_id}.json
 *
 * 数据同构：Python 侧 _SHADOWFLOW_ROOT = Path(".shadowflow")（cwd 相对，生产
 * venv 直起时 cwd = 仓库根）；Node 侧统一走 repoDataFile()（SHADOWFLOW_DATA_DIR
 * 可覆盖，缺省落 <repo>/.shadowflow）——两边读写同一份文件，legacy↔single 切换
 * 状态不丢。Python 写盘 model_dump_json(indent=2)；缺字段按 Pydantic 默认值补齐。
 *
 * 错误体系对齐 runtime/errors.py：
 *   - 校验失败（agent_id / snapshot_id 不符 [A-Za-z0-9_-]{1,128}）→ 基类错误，
 *     code = "SHADOWFLOW_ERROR"（Python _validate_agent_id 用基类，未覆写 code）
 *   - StateConflict → code STATE_CONFLICT + details {expected, got}
 *   - SnapshotNotFound → code SNAPSHOT_NOT_FOUND + details {agent_id, snapshot_id}
 *
 * 路由层（routes/agents/agent-state.ts）负责把这些映射为
 * HTTPException(detail={error:{...}}) 的线格式。
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { repoDataFile } from './repo-root';

// ---------------------------------------------------------------------------
// 错误体系（ShadowflowError / StateConflict / SnapshotNotFound 直译）
// ---------------------------------------------------------------------------

export class StateServiceError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** 乐观锁版本冲突（state_service.py StateConflict）。 */
export class StateConflictError extends StateServiceError {
  readonly expected: number;
  readonly got: number;

  constructor(expected: number, got: number) {
    super(
      'STATE_CONFLICT',
      `State version conflict: expected ${expected}, got ${got}`,
      { expected, got },
    );
    this.expected = expected;
    this.got = got;
  }
}

/** 快照不存在（state_service.py SnapshotNotFound）。 */
export class SnapshotNotFoundError extends StateServiceError {
  constructor(agentId: string, snapshotId: string) {
    super(
      'SNAPSHOT_NOT_FOUND',
      `Snapshot '${snapshotId}' not found for agent '${agentId}'`,
      { agent_id: agentId, snapshot_id: snapshotId },
    );
  }
}

// ---------------------------------------------------------------------------
// 校验（_ID_RE + _validate_agent_id / _validate_snapshot_id）
// ---------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function validateAgentId(agentId: string): void {
  if (!ID_RE.test(agentId)) {
    // Python: f"Invalid agent_id {agent_id!r}: must match [A-Za-z0-9_-]{{1,128}}"
    throw new StateServiceError(
      'SHADOWFLOW_ERROR',
      `Invalid agent_id '${agentId}': must match [A-Za-z0-9_-]{1,128}`,
      { agent_id: agentId },
    );
  }
}

function validateSnapshotId(snapshotId: string): void {
  if (!ID_RE.test(snapshotId)) {
    throw new StateServiceError(
      'SHADOWFLOW_ERROR',
      `Invalid snapshot_id '${snapshotId}': must match [A-Za-z0-9_-]{1,128}`,
      { snapshot_id: snapshotId },
    );
  }
}

// ---------------------------------------------------------------------------
// AgentState 数据模型（Pydantic AgentState 同形，datetime 以 ISO 字符串承载）
// ---------------------------------------------------------------------------

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function nowIso(): string {
  return new Date().toISOString();
}

/** model_validate_json 的宽容版：缺字段回填 Pydantic 默认值（跨语言写盘兼容）。 */
function normalizeState(raw: unknown, agentId: string): AgentState {
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
      typeof r.state_version === 'number' && Number.isInteger(r.state_version)
        ? r.state_version
        : 0,
    created_at: typeof r.created_at === 'string' ? r.created_at : nowIso(),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : nowIso(),
  };
}

/** AgentState(agent_id=...) 构造（Pydantic 默认值语义）。 */
function newAgentState(agentId: string): AgentState {
  const now = nowIso();
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
    created_at: now,
    updated_at: now,
  };
}

// ---------------------------------------------------------------------------
// 存储路径（repoDataFile 收口，与 Python .shadowflow 同构）
// ---------------------------------------------------------------------------

function stateDir(): string {
  return repoDataFile('agent_state');
}

function statePath(agentId: string): string {
  return path.join(stateDir(), `${agentId}.json`);
}

function snapshotDir(agentId: string): string {
  return repoDataFile('state_snapshots', agentId);
}

function snapshotPath(agentId: string, snapshotId: string): string {
  return path.join(snapshotDir(agentId), `${snapshotId}.json`);
}

/** _write_secure：写盘 + 尽力 0o600（Windows/ACL 失败仅告警，与 Python 同语义）。 */
function writeSecure(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    console.warn(`agent-state-service: chmod 0o600 failed for ${filePath} (Windows/ACL limitation)`);
  }
}

function readStateFile(agentId: string): AgentState | null {
  const file = statePath(agentId);
  if (!fs.existsSync(file)) return null;
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return normalizeState(raw, agentId);
}

// ---------------------------------------------------------------------------
// Service（StateService 六方法直译）
// ---------------------------------------------------------------------------

/** get_state：不存在返回 null（路由层 404 AGENT_STATE_NOT_FOUND）。 */
export function getState(agentId: string): AgentState | null {
  validateAgentId(agentId);
  return readStateFile(agentId);
}

/** update_state：乐观锁 patch；agent 无状态则先构造默认态（Python 同语义）。 */
export function updateState(agentId: string, patch: Record<string, unknown>): AgentState {
  validateAgentId(agentId);
  const state = readStateFile(agentId) ?? newAgentState(agentId);

  const incomingVersion =
    typeof patch.version === 'number' ? patch.version : state.state_version;
  if (incomingVersion !== state.state_version) {
    throw new StateConflictError(state.state_version, incomingVersion);
  }

  // _MUTABLE 白名单：patch 永远碰不到 state_version / agent_id / created_at
  const MUTABLE = new Set([
    'role_profile_ref',
    'memory_profile_ref',
    'state_fields',
    'session_summary',
    'recent_artifacts',
    'pending_tasks',
    'last_writeback_at',
  ]);
  for (const [key, value] of Object.entries(patch)) {
    if (MUTABLE.has(key)) {
      (state as unknown as Record<string, unknown>)[key] = value;
    }
  }

  state.state_version += 1;
  state.updated_at = nowIso();
  writeSecure(statePath(agentId), JSON.stringify(state, null, 2));
  return state;
}

/** snapshot_state：对当前态（缺省则默认态）落快照，返回 uuid4().hex 形 id。 */
export function snapshotState(agentId: string): string {
  validateAgentId(agentId);
  const state = readStateFile(agentId) ?? newAgentState(agentId);
  const snapshotId = randomUUID().replace(/-/g, '');
  writeSecure(snapshotPath(agentId, snapshotId), JSON.stringify(state, null, 2));
  return snapshotId;
}

/** restore_state：快照 → 覆盖当前态，版本 +1（并发写者感知状态已变）。 */
export function restoreState(agentId: string, snapshotId: string): AgentState {
  validateAgentId(agentId);
  validateSnapshotId(snapshotId);
  const file = snapshotPath(agentId, snapshotId);
  if (!fs.existsSync(file)) {
    throw new SnapshotNotFoundError(agentId, snapshotId);
  }
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const restored = normalizeState(raw, agentId);
  restored.state_version += 1;
  restored.updated_at = nowIso();
  writeSecure(statePath(agentId), JSON.stringify(restored, null, 2));
  return restored;
}

/** list_snapshots：newest-first，最多 limit=50 条（路由未传 limit，默认生效）。 */
export function listSnapshots(agentId: string, limit = 50): Array<Record<string, unknown>> {
  validateAgentId(agentId);
  const dir = snapshotDir(agentId);
  if (!fs.existsSync(dir)) return [];
  const results: Array<Record<string, unknown>> = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf-8')) as Record<string, unknown>;
      results.push({
        snapshot_id: entry.slice(0, -'.json'.length),
        // Python: data.get("updated_at") or data.get("created_at")
        created_at:
          (typeof data.updated_at === 'string' && data.updated_at) ||
          (typeof data.created_at === 'string' && data.created_at) ||
          undefined,
        state_version:
          typeof data.state_version === 'number' && Number.isInteger(data.state_version)
            ? data.state_version
            : 0,
      });
    } catch {
      // Python：坏快照告警跳过，不拖垮列表
      console.warn(`agent-state-service: unreadable snapshot ${path.join(dir, entry)}`);
    }
  }
  // Python: sort(key=lambda x: x.get("created_at") or "", reverse=True)
  results.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  return results.slice(0, limit);
}

/** reset_state：清运行态四件套，保留 profile refs，版本 +1。 */
export function resetState(agentId: string): AgentState {
  validateAgentId(agentId);
  const state = readStateFile(agentId) ?? newAgentState(agentId);
  state.state_fields = {};
  state.session_summary = '';
  state.recent_artifacts = [];
  state.pending_tasks = [];
  state.last_writeback_at = null;
  state.state_version += 1;
  state.updated_at = nowIso();
  writeSecure(statePath(agentId), JSON.stringify(state, null, 2));
  return state;
}
