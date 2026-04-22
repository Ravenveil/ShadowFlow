// AUTO-GENERATED — DO NOT EDIT. Source: shadowflow/runtime/contracts.py
// Run `python scripts/generate_ts_types.py` to regenerate after modifying contracts.py

export interface WritebackRef {
  channel: "artifact" | "checkpoint";
  target?: "host" | "docs" | "memory" | "graph" | "zerog";
  mode?: "reference" | "inline";
  host_action: "persist_artifact_ref" | "persist_checkpoint_ref";
  content_field?: string | null;
  resume_supported?: boolean | null;
  next_node_id?: string | null;
}

export interface CheckpointState {
  current_node_id?: string | null;
  next_node_id?: string | null;
  visited_nodes?: string[];
  last_output?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

export interface TaskRecord {
  task_id: string;
  run_id: string;
  root_task_id: string;
  parent_task_id?: string | null;
  title?: string | null;
  focus?: string | null;
  status?: "accepted" | "running" | "succeeded" | "failed" | "cancelled" | "waiting";
  created_at?: string;
  started_at?: string | null;
  ended_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RunRecord {
  run_id: string;
  request_id: string;
  workflow_id: string;
  task_id?: string | null;
  parent_run_id?: string | null;
  root_run_id?: string | null;
  status: "accepted" | "validated" | "running" | "succeeded" | "failed" | "cancelled" | "checkpointed" | "waiting";
  started_at: string;
  ended_at?: string | null;
  entrypoint: string;
  current_step_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StepRecord {
  step_id: string;
  run_id: string;
  node_id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";
  index: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  trace?: Record<string, unknown>[];
  artifacts?: ArtifactRef[];
  error?: Record<string, unknown> | null;
  started_at: string;
  ended_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ArtifactRef {
  artifact_id: string;
  kind?: "text" | "json" | "document" | "report" | "patch" | "log";
  name: string;
  uri: string;
  producer_step_id: string;
  writeback: WritebackRef;
  metadata?: Record<string, unknown>;
}

export interface CheckpointRef {
  checkpoint_id: string;
  run_id: string;
  step_id?: string | null;
  state_ref?: string | null;
  state: CheckpointState;
  created_at?: string;
  writeback: WritebackRef;
  metadata?: Record<string, unknown>;
}

export interface MemoryEvent {
  event_id: string;
  run_id: string;
  task_id?: string | null;
  step_id?: string | null;
  category?: "task" | "step_result" | "artifact" | "checkpoint" | "handoff" | "activation" | "feedback_signal" | "run_summary";
  summary: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

export interface HandoffRef {
  handoff_id: string;
  run_id: string;
  from_step_id: string;
  from_node_id: string;
  to_node_id?: string | null;
  goal?: string | null;
  artifact_ids?: string[];
  created_at?: string;
  metadata?: Record<string, unknown>;
}
