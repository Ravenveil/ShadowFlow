/**
 * AgentState 前端类型 — Story 9.4 AC4
 * 字段名严格保持 snake_case，与后端 Pydantic 一致。
 */

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

export interface StateSnapshot {
  snapshot_id: string;
  created_at: string | null;
  state_version: number;
}

export interface AgentStateResponse {
  data: AgentState;
  meta: Record<string, unknown>;
}

export interface SnapshotListResponse {
  data: StateSnapshot[];
  meta: Record<string, unknown>;
}

export interface SnapshotCreateResponse {
  data: { snapshot_id: string };
  meta: Record<string, unknown>;
}

export interface PatchStatePayload {
  version: number;
  role_profile_ref?: string;
  memory_profile_ref?: string;
  state_fields?: Record<string, unknown>;
  session_summary?: string;
  recent_artifacts?: string[];
  pending_tasks?: string[];
}
