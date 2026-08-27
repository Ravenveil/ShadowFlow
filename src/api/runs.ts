/**
 * Runs API client — 6 projection endpoints + list/get + loops SSE/verdicts
 *
 * Covers:
 *   GET /runs?limit=                    → RunRecord[]
 *   GET /runs/{runId}                   → RunResult
 *   GET /runs/{runId}/graph             → RunGraph
 *   GET /runs/{runId}/task-tree         → TaskTreeProjection
 *   GET /runs/{runId}/artifact-lineage  → ArtifactLineageProjection
 *   GET /runs/{runId}/memory-graph      → MemoryRelationProjection
 *   GET /runs/{runId}/checkpoint-lineage → CheckpointLineageProjection
 *   GET /runs/{runId}/training-dataset  → ActivationTrainingDataset
 *   GET /runs/{runId}/loops             → RunLoopsResponse
 *   GET /runs/{runId}/loops/stream      → SSE（loops 快照/单环 upsert 帧）
 *   GET /runs/{runId}/loops/{loopId}/verdicts → LoopVerdict | LoopVerdict[]
 *   GET /runs/{runId}/suggestions       → 完成态「后续建议」（Node 网关 LLM 生成）
 */

import { getApiBase } from './_base';

// ---------------------------------------------------------------------------
// Shared error class
// ---------------------------------------------------------------------------

export class RunsApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`Runs API error ${status}`);
  }
}

async function _handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.text();
  let detail: unknown = body;
  try { detail = JSON.parse(body); } catch { /* raw */ }
  throw new RunsApiError(res.status, detail);
}

// ---------------------------------------------------------------------------
// Shared projection types
// ---------------------------------------------------------------------------

export interface ProjectionScope {
  workflow_id?: string;
  run_id?: string;
  task_id?: string;
  artifact_id?: string;
  checkpoint_id?: string;
}

export interface ProjectionNodeTimestamps {
  started_at?: string;
  ended_at?: string;
  created_at?: string;
}

export interface ProjectionNode {
  id: string;
  entity_type:
    | 'workflow_node'
    | 'run'
    | 'task'
    | 'step'
    | 'artifact'
    | 'checkpoint'
    | 'memory_event'
    | 'handoff'
    | 'activation_candidate'
    | 'activation'
    | 'feedback_signal';
  label: string;
  status?: string;
  parent_id?: string;
  refs: Record<string, unknown>;
  timestamps: ProjectionNodeTimestamps;
  metadata: Record<string, unknown>;
}

export interface ProjectionEdge {
  id: string;
  edge_type:
    | 'control_flow'
    | 'conditional_flow'
    | 'belongs_to_run'
    | 'belongs_to_task'
    | 'executes_node'
    | 'delegation'
    | 'handoff_to'
    | 'produces_artifact'
    | 'emits_memory_event'
    | 'candidate_for_activation'
    | 'activates'
    | 'records_feedback'
    | 'creates_checkpoint'
    | 'derived_from_checkpoint'
    | 'resume_from'
    | 'retry_of';
  from_id: string;
  to_id: string;
  intervention: boolean;
  condition?: string;
  metadata: Record<string, unknown>;
}

export interface ProjectionGraph {
  projection_kind: string;
  version: string;
  scope: ProjectionScope;
  summary: Record<string, unknown>;
  filters: Record<string, unknown>;
  nodes: ProjectionNode[];
  edges: ProjectionEdge[];
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// RunSummary — /runs list (legacy projection-graph oriented type kept for
// downstream tests / typings; the live /api/runs endpoint now returns the
// 15.8 RunRecord shape — see RunRecord below).
// ---------------------------------------------------------------------------

export type RunStatus =
  | 'accepted'
  | 'validated'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'checkpointed'
  | 'waiting'
  | 'waiting_user'
  | 'awaiting_approval'
  | 'paused';

export interface RunSummary {
  run_id: string;
  request_id: string;
  workflow_id: string;
  status: RunStatus;
  started_at: string;
  ended_at?: string;
  current_step_id?: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// RunRecord — Story 15.8: the persisted run-history shape returned by
// GET /api/runs. Matches server/src/storage/runs.ts RunRecord 1:1.
// ---------------------------------------------------------------------------

export type RunRecordStatus = 'completed' | 'failed';
export type ArtifactType = 'yaml' | 'html' | 'markdown';

export interface RunRecord {
  run_id: string;
  session_id: string;
  goal: string;
  skill_name: string;
  skill_display_name: string;
  artifact_type: ArtifactType | null;
  artifact_filename: string | null;
  artifact_url: string | null;
  status: RunRecordStatus;
  created_at: string;
  completed_at: string;
  project_dir?: string;
}

interface RunsListResponse {
  runs: RunRecord[];
  total: number;
}

// ---------------------------------------------------------------------------
// RunGraph — GET /runs/{id}/graph
// ---------------------------------------------------------------------------

export interface RunGraphNode {
  id: string;
  label: string;
  kind: string;
  type: string;
  entity_type: 'workflow_node';
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled' | 'not_started';
  step_id?: string;
  index?: number;
  entrypoint: boolean;
  refs: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface WorkflowGraphEdge {
  from_id: string;
  to_id: string;
  type: string;
  edge_type?: string;
  condition?: string;
  intervention: boolean;
  metadata: Record<string, unknown>;
}

export interface RunGraph {
  projection_kind: 'run_graph';
  version: string;
  run_id: string;
  workflow_id: string;
  status: string;
  entrypoint: string;
  scope: ProjectionScope;
  summary: Record<string, unknown>;
  filters: Record<string, unknown>;
  nodes: RunGraphNode[];
  edges: WorkflowGraphEdge[];
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// TaskTreeProjection — GET /runs/{id}/task-tree
// ---------------------------------------------------------------------------

export interface TaskTreeProjection extends ProjectionGraph {
  projection_kind: 'task_tree';
}

// ---------------------------------------------------------------------------
// ArtifactLineageProjection — GET /runs/{id}/artifact-lineage
// ---------------------------------------------------------------------------

export interface ArtifactLineageProjection extends ProjectionGraph {
  projection_kind: 'artifact_lineage_graph';
}

// ---------------------------------------------------------------------------
// MemoryRelationProjection — GET /runs/{id}/memory-graph
// ---------------------------------------------------------------------------

export interface MemoryRelationProjection extends ProjectionGraph {
  projection_kind: 'memory_relation_graph';
}

// ---------------------------------------------------------------------------
// CheckpointLineageProjection — GET /runs/{id}/checkpoint-lineage
// ---------------------------------------------------------------------------

export interface CheckpointLineageProjection extends ProjectionGraph {
  projection_kind: 'checkpoint_lineage_graph';
}

// ---------------------------------------------------------------------------
// ActivationTrainingDataset — GET /runs/{id}/training-dataset
// ---------------------------------------------------------------------------

export interface ActivationTrainingSample {
  sample_id: string;
  run_id: string;
  workflow_id: string;
  task_id?: string;
  step_id?: string;
  node_id: string;
  step_status: string;
  activation_mode: string;
  activation_decision: string;
  candidate_count: number;
  selected_candidate_count: number;
  selected_candidate_ids: string[];
  candidates: Record<string, unknown>[];
  feedback_ids: string[];
  reward_hints: Record<string, number>;
  signals: Record<string, unknown>;
  assembly_block_id?: string;
  assembly_goal?: string;
  metadata: Record<string, unknown>;
}

export interface ActivationTrainingDataset {
  dataset_kind: 'activation_training_dataset';
  version: string;
  scope: ProjectionScope;
  summary: Record<string, unknown>;
  samples: ActivationTrainingSample[];
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// LoopRecord — GET /runs/{id}/loops
// ---------------------------------------------------------------------------

export type LoopKind = 'until_converge' | 'until_diverge' | 'fixed_count';
export type LoopStatus = 'running' | 'converged' | 'oscillating' | 'diverged' | 'halted';

export interface LoopSetpoint {
  metric: string;
  op: string;
  value: number;
}

export interface IterationEvidence {
  body_node_ids?: string[];
  last_output?: Record<string, unknown>;
  controlled?: Record<string, unknown>;
  sensor?: {
    converged: boolean;
    classification: string;
    value?: number;
    message?: string;
  };
  claims?: Record<string, unknown>[];
}

export interface IterationRecord {
  loop_id: string;
  run_id: string;
  index: number;
  evidence: IterationEvidence;
  metrics: Record<string, number>;
  verifier_score?: number;
  trace_id: string;
  started_at?: string;
}

export interface LoopRecord {
  loop_id: string;
  run_id: string;
  parent_loop_id?: string;
  kind: LoopKind;
  setpoint: LoopSetpoint;
  depth: number;
  sensor_binding?: string;
  actuator_binding?: string;
  status: LoopStatus;
  iteration_count: number;
  iterations: IterationRecord[];
}

export interface LoopStep {
  step_id: string;
  node_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  loop: LoopRecord;
}

export interface RunLoopsResponse {
  run_id: string;
  loops: LoopStep[];
  total_count: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * listRuns — contract (2026-05-10 review B2 — 守 Story 15.1 决议)。
 *
 * GET /api/runs 返回 raw array `RunRecord[]`。15.8 dev 期间一度被改成
 * `{runs, total}` envelope，违反了 15.1 review 的明确决议；已回退到 raw array。
 *
 * 仍兼容 envelope 形态（双形态 fallback）以容忍临时部署不同步：若 server
 * 端尚未升级回 raw，前端仍能正常 unwrap，避免 hackathon demo 中断。
 */
export async function listRuns(limit?: number): Promise<RunRecord[]> {
  const qs =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? `?limit=${Math.floor(limit)}`
      : '';
  const res = await fetch(`${getApiBase()}/api/runs${qs}`);
  const parsed = await _handleResponse<RunRecord[] | RunsListResponse>(res);
  if (Array.isArray(parsed)) return parsed;
  return parsed.runs ?? [];
}

export async function deleteRun(runId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteRun failed: ${res.status}`);
}

export async function getRunGraph(runId: string): Promise<RunGraph> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/graph`);
  return _handleResponse<RunGraph>(res);
}

export async function getTaskTree(runId: string): Promise<TaskTreeProjection> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/task-tree`);
  return _handleResponse<TaskTreeProjection>(res);
}

export async function getArtifactLineage(runId: string): Promise<ArtifactLineageProjection> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/artifact-lineage`);
  return _handleResponse<ArtifactLineageProjection>(res);
}

// ---------------------------------------------------------------------------
// Artifact pin — POST /artifacts/{id}/pin（toggle，GAP：产物 filecard 置顶）
// ---------------------------------------------------------------------------

export interface ArtifactPinState {
  artifact_id: string;
  pinned: boolean;
  pinned_at: string | null;
}

/**
 * toggleArtifactPin — 产物 filecard 置顶开关（持久化在后端独立小仓
 * .shadowflow/artifacts/）。重复调用即撤销（toggle 语义）。
 */
export async function toggleArtifactPin(artifactId: string): Promise<ArtifactPinState> {
  const res = await fetch(
    `${getApiBase()}/api/artifacts/${encodeURIComponent(artifactId)}/pin`,
    { method: 'POST' },
  );
  const parsed = await _handleResponse<{ data: ArtifactPinState } | ArtifactPinState>(res);
  return 'data' in parsed ? (parsed as { data: ArtifactPinState }).data : (parsed as ArtifactPinState);
}

export async function getMemoryGraph(runId: string): Promise<MemoryRelationProjection> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/memory-graph`);
  return _handleResponse<MemoryRelationProjection>(res);
}

export async function getCheckpointLineage(runId: string): Promise<CheckpointLineageProjection> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/checkpoint-lineage`);
  return _handleResponse<CheckpointLineageProjection>(res);
}

export async function getActivationTrainingDataset(runId: string): Promise<ActivationTrainingDataset> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/training-dataset`);
  return _handleResponse<ActivationTrainingDataset>(res);
}

export async function getRunLoops(runId: string): Promise<RunLoopsResponse> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/loops`);
  const parsed = await _handleResponse<{ data: RunLoopsResponse; meta?: Record<string, unknown> }>(res);
  // Handle both envelope and direct response formats
  return 'data' in parsed ? parsed.data : parsed as unknown as RunLoopsResponse;
}

// ---------------------------------------------------------------------------
// 完成态「后续建议」— GET /runs/{id}/suggestions（Node 网关 run-suggestions.ts）
// ---------------------------------------------------------------------------

export interface RunSuggestionsResponse {
  suggestions: string[];
}

/**
 * 取 run 完成后的下一步建议（LLM 实时生成）。LLM 不可用 / run 未知时后端
 * 返回 502/404 —— 抛 RunsApiError，由调用方降级为「不渲染建议区」，
 * 前端绝不展示假建议。
 */
export async function getRunSuggestions(runId: string): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/suggestions`);
  const parsed = await _handleResponse<RunSuggestionsResponse>(res);
  if (!Array.isArray(parsed.suggestions)) return [];
  return parsed.suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

export async function haltLoop(runId: string, loopId: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/loops/${encodeURIComponent(loopId)}/halt`, {
    method: 'POST',
  });
  const parsed = await _handleResponse<{ data: { status: string; message: string }; meta?: { already_halted?: boolean } }>(res);
  // Handle both envelope and direct response formats
  return 'data' in parsed ? parsed.data : parsed as unknown as { status: string; message: string };
}

// ---------------------------------------------------------------------------
// LoopVerdict — GET /runs/{id}/loops/{loop_id}/verdicts
// ---------------------------------------------------------------------------

/** 单个 claim 的字段未在端点契约里固定——保留开放形状，渲染层防御式取值。 */
export type LoopVerdictClaim = Record<string, unknown>;

export interface LoopVerdict {
  iteration: number;
  score?: number;
  rationale?: string;
  claims: LoopVerdictClaim[];
}

/** 解一层 `{data: …}` envelope（loops 系端点的惯用包装）。 */
function _unwrapData(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'data' in raw) {
    return (raw as { data: unknown }).data;
  }
  return raw;
}

function _normalizeVerdict(raw: unknown): LoopVerdict | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const claims = Array.isArray(o.claims)
    ? (o.claims.filter((c) => c && typeof c === 'object') as LoopVerdictClaim[])
    : [];
  return {
    iteration: typeof o.iteration === 'number' ? o.iteration : 0,
    score: typeof o.score === 'number' ? o.score : undefined,
    rationale: typeof o.rationale === 'string' && o.rationale ? o.rationale : undefined,
    claims,
  };
}

/**
 * getLoopVerdicts — verifier 面板数据源（GAP：verdicts 端点）。
 *
 * 契约签名 `{ iteration, score, rationale, claims[] }`；实现侧可能按轮返回
 * 单个对象或整轮列表，这里三种形态都容忍：单对象 / 数组 / `{verdicts: []}`，
 * 外加一层可选 `{data: …}` envelope。未知形状 → 空数组（前端不编造）。
 */
export async function getLoopVerdicts(runId: string, loopId: string): Promise<LoopVerdict[]> {
  const res = await fetch(
    `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/loops/${encodeURIComponent(loopId)}/verdicts`,
  );
  let parsed: unknown = await _handleResponse<unknown>(res);
  parsed = _unwrapData(parsed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'verdicts' in parsed) {
    parsed = (parsed as { verdicts: unknown }).verdicts;
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr
    .map(_normalizeVerdict)
    .filter((v): v is LoopVerdict => v !== null)
    .sort((a, b) => a.iteration - b.iteration);
}

// ---------------------------------------------------------------------------
// Loops SSE — GET /runs/{id}/loops/stream
// ---------------------------------------------------------------------------

export interface RunLoopsStreamHandle {
  /** 永久关闭流（不再重连）。 */
  close: () => void;
}

/**
 * streamRunLoops — 优先于 5s REST 轮询的 loops 增量通道（GAP：Loop 实时性）。
 *
 * 帧形状容忍（后端迭代期间契约可能微调）：
 *   - `{ loops: LoopStep[] }` 全量快照（按 loop_id 重建）
 *   - 单条 LoopStep（`{ step_id, loop, … }`）或裸 LoopRecord → 按 loop_id upsert
 *   外层再容忍一层 `{data: …}` envelope。事件名监听 message/loop/loops/
 *   snapshot/update 五种。
 *
 * 首个数据帧到达之前出错（端点不存在/未就绪）→ 关流并回调 onUnavailable，
 * 调用方回落轮询；拿到过数据之后的瞬断交给浏览器 EventSource 自动重连。
 */
export function streamRunLoops(
  runId: string,
  onSnapshot: (loops: LoopStep[]) => void,
  onUnavailable?: () => void,
): RunLoopsStreamHandle {
  const url = `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/loops/stream`;
  const byId = new Map<string, LoopStep>();
  let gotData = false;
  let closed = false;

  const es = new EventSource(url);

  const emit = () => onSnapshot([...byId.values()]);

  const ingest = (raw: unknown) => {
    const v = _unwrapData(raw);
    if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as { loops?: unknown }).loops)) {
      // 全量快照
      byId.clear();
      for (const step of (v as { loops: LoopStep[] }).loops) {
        if (step?.loop?.loop_id) byId.set(step.loop.loop_id, step);
      }
      gotData = true;
      emit();
      return;
    }
    // 单条 LoopStep
    const asStep = v as LoopStep | null;
    if (asStep && typeof asStep === 'object' && asStep.loop?.loop_id) {
      byId.set(asStep.loop.loop_id, asStep);
      gotData = true;
      emit();
      return;
    }
    // 裸 LoopRecord（无 step 包装）
    const asLoop = v as LoopRecord | null;
    if (asLoop && typeof asLoop === 'object' && typeof asLoop.loop_id === 'string' && typeof asLoop.kind === 'string') {
      const prev = byId.get(asLoop.loop_id);
      byId.set(asLoop.loop_id, {
        step_id: prev?.step_id ?? '',
        node_id: prev?.node_id ?? '',
        status: prev?.status ?? asLoop.status,
        started_at: prev?.started_at ?? '',
        ended_at: prev?.ended_at ?? null,
        loop: asLoop,
      });
      gotData = true;
      emit();
    }
    // 形状不识别的帧：静默丢弃（不编造）
  };

  const onMessage = (ev: Event) => {
    const data = (ev as MessageEvent).data;
    if (typeof data !== 'string') return;
    try {
      ingest(JSON.parse(data));
    } catch {
      // 非 JSON 帧（心跳/注释行已被浏览器滤掉）→ 忽略
    }
  };

  es.addEventListener('message', onMessage);
  for (const name of ['loop', 'loops', 'snapshot', 'update']) {
    es.addEventListener(name, onMessage);
  }
  es.addEventListener('error', () => {
    if (gotData || closed) return; // 有数据后的瞬断 → 交给 EventSource 自动重连
    closed = true;
    es.close();
    onUnavailable?.();
  });

  return {
    close: () => {
      closed = true;
      es.close();
    },
  };
}
