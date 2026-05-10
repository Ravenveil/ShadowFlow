/**
 * Runs API client — 6 projection endpoints + list/get
 *
 * Covers:
 *   GET /runs                           → RunSummary[]
 *   GET /runs/{runId}                   → RunResult
 *   GET /runs/{runId}/graph             → RunGraph
 *   GET /runs/{runId}/task-tree         → TaskTreeProjection
 *   GET /runs/{runId}/artifact-lineage  → ArtifactLineageProjection
 *   GET /runs/{runId}/memory-graph      → MemoryRelationProjection
 *   GET /runs/{runId}/checkpoint-lineage → CheckpointLineageProjection
 *   GET /runs/{runId}/training-dataset  → ActivationTrainingDataset
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
export async function listRuns(): Promise<RunRecord[]> {
  const res = await fetch(`${getApiBase()}/api/runs`);
  const parsed = await _handleResponse<RunRecord[] | RunsListResponse>(res);
  if (Array.isArray(parsed)) return parsed;
  return parsed.runs ?? [];
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
