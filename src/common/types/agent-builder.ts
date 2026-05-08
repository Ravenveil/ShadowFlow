/**
 * Builder 领域合同 — Story 8.1 (AC4)
 *
 * 字段名保持后端 snake_case，不在 Builder 边界做 camelCase 转换。
 * 不重复定义 WorkflowDefinition（已在 workflow.ts 中）。
 */

// ---------------------------------------------------------------------------
// 子对象
// ---------------------------------------------------------------------------

export interface HandoffRule {
  trigger: string;
  target_role: string; // role_id of target
}

export interface StateField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  default: string | number | boolean | null;
}

// ---------------------------------------------------------------------------
// CollaborationContract (Story 13.5)
// ---------------------------------------------------------------------------

export type AgentScope = 'standalone' | 'team_member_candidate';
export type CollaborationStyle = 'push' | 'pull';

export interface CollaborationContract {
  scope: AgentScope;
  accepts_from: string[];
  delivers_to: string[];
  collaboration_style: CollaborationStyle;
}

export interface RoleProfile {
  role_id: string;
  name: string;
  description: string;
  persona: string;
  responsibilities: string[];
  constraints: string[];
  tools: string[];
  executor_kind: 'api' | 'cli';
  executor_provider: string;
  executor_model: string;
  // 深度配置字段（Story 8.3b）
  capabilities: string[];
  handoff_rules: HandoffRule[];
  persona_traits: Record<string, string>;
  state_fields: StateField[];
  can_spawn_tasks: boolean;
  sub_agents: RoleProfile[];
  metadata: Record<string, unknown>;
  // Story 13.5: Collaboration Contract（可选，缺省视为 standalone）
  collaboration_contract?: CollaborationContract;
}

export type PermissionLevel = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  permission: PermissionLevel;
  arg_pattern: string; // e.g. "query:*小红书*"; empty = matches all
}

export interface ToolPolicy {
  tool_id: string;
  // MCP fields (AC3)
  provider_id?: string;
  credentials_ref?: string;
  visibility: 'enabled' | 'disabled';
  // deny > ask > allow rules (AC4)
  permission_rules: PermissionRule[];
  default_permission: PermissionLevel;
  // Legacy fields
  trust_level: 'internal' | 'external';
  side_effects: 'read_only' | 'write' | 'mixed';
  requires_confirmation: boolean;
  metadata: Record<string, unknown>;
}

// Tool Registry types
export interface BuiltinTool {
  tool_id: string;
  name: string;
  type: 'builtin';
  description: string;
  version: string;
  icon: string;
  credentials_required: false;
  boss_only?: boolean;
}

export interface McpToolSchema {
  tool_id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  type: 'mcp';
  provider_id: string;
  provider_name: string;
}

export interface McpProvider {
  provider_id: string;
  name: string;
  transport_type: 'stdio' | 'http' | 'sse';
  command: string[];
  server_url: string;
  description: string;
  env_masked: Record<string, string>;
  status: 'registered' | 'connected' | 'error';
  schema_cache?: McpToolSchema[];
  last_test_result?: {
    success: boolean;
    message: string;
    tested_at: number;
  };
}

export interface RegisterProviderPayload {
  name: string;
  transport_type: 'stdio' | 'http' | 'sse';
  command?: string[];
  server_url?: string;
  env: Record<string, string>;
  description?: string;
}

export interface KnowledgeBinding {
  binding_id: string;
  source_type: 'file' | 'url' | 'cid' | 'inline' | 'pack' | 'unspecified';
  source_ref: string;
  retrieval_mode: 'auto' | 'semantic' | 'keyword' | 'hybrid';
  citation_required: boolean;
  freshness_hint: 'always' | 'daily' | 'weekly' | 'static';
  /** 'shared' = team-level; 'agent' = role-specific (target_ref = role_id) */
  scope: 'shared' | 'agent';
  target_ref: string | null;
  metadata: Record<string, unknown>;
}

export interface MemoryProfile {
  scope: 'session' | 'user' | 'global';
  writeback_target: 'host' | 'docs' | 'memory' | 'graph' | null;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface EvalProfile {
  smoke_eval_enabled: boolean;
  eval_criteria: string[];
  regression_gate: boolean;
  metadata: Record<string, unknown>;
}

export interface PublishProfile {
  target: 'template' | 'workflow' | 'agent_app' | 'none';
  visibility: 'private' | 'team' | 'public';
  publish_ref: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ExecutionMode (Story 13.2)
// ---------------------------------------------------------------------------

export type ExecutionModeType = 'react' | 'workflow';

export interface ExecutionMode {
  mode: ExecutionModeType;
  workflow_ref?: string;
  workflow_name?: string;
}

// ---------------------------------------------------------------------------
// AgentBlueprint
// ---------------------------------------------------------------------------

export interface AgentBlueprint {
  blueprint_id: string;
  version: string;
  name: string;
  goal: string;
  audience: string;
  mode: 'single' | 'team';
  role_profiles: RoleProfile[];
  tool_policies: ToolPolicy[];
  knowledge_bindings: KnowledgeBinding[];
  memory_profile: MemoryProfile;
  eval_profile: EvalProfile;
  publish_profile: PublishProfile;
  metadata: Record<string, unknown>;
  /** Story 13.2: 执行方式（缺省为 ReAct 循环） */
  execution_mode?: ExecutionMode;
}

// ---------------------------------------------------------------------------
// Request / Response 类型
// ---------------------------------------------------------------------------

export interface BuilderGenerateRequest {
  goal: string;
  audience?: string;
  mode?: 'single' | 'team';
  desired_output?: string;
  knowledge_sources?: string[];
  reference_agent_id?: string;
}

export interface BuilderGenerateResponse {
  data: AgentBlueprint;
  meta: {
    confidence: number;
    missing_inputs: string[];
    suggested_next_step: string;
  };
}

export interface BuilderInstantiateRequest {
  blueprint: AgentBlueprint;
  parameters?: Record<string, unknown>;
}

export interface BuilderInstantiateResponse {
  data: {
    blueprint: AgentBlueprint;
    template_spec: Record<string, unknown>;
    workflow_definition: Record<string, unknown>;
  };
  meta: {
    warnings: string[];
  };
}

export interface BuilderSmokeRunRequest {
  blueprint: AgentBlueprint;
}

export type SmokeCheckStatus = 'passed' | 'failed' | 'warning' | 'skipped';

export type SmokeFailureCategory =
  | 'goal_clarity'
  | 'knowledge_inaccessible'
  | 'tool_permission'
  | 'role_conflict'
  | 'graph_break'
  | 'none';

export interface SmokeCheck {
  check_id: string;
  label: string;
  status: SmokeCheckStatus;
  reason: string;
  target_ref: string | null;
  /** Builder-friendly failure category for translation layer */
  failure_category: SmokeFailureCategory;
  /** Machine-readable raw error (debug layer only) */
  raw_reason: string | null;
}

export interface BuilderSmokeRunResponse {
  data: {
    status: 'passed' | 'failed' | 'warning';
    checks: SmokeCheck[];
    summary: string;
    recommended_fix: string | null;
    /** The most critical failing check_id (for prioritization) */
    primary_blocker: string | null;
  };
  meta: {
    warnings: string[];
  };
}

export interface BuilderPublishRequest {
  blueprint: AgentBlueprint;
}

export interface PublishLinks {
  templates: string;
  editor: string;
  inbox: string;
}

export interface BuilderPublishResponse {
  data: {
    template_id: string;
    workflow_id: string;
    kit_tags: string[];
    publish_status: 'published' | 'pending' | 'error';
    links: PublishLinks;
  };
  meta: {
    trace_id: string;
  };
}

/**
 * @deprecated Patch 16 (Story 8.6): REGRESSION_BLOCKED is now returned as HTTP 422 via
 * BuilderApiError(422). This interface is kept for reference only and is no longer used
 * by publishBlueprint(). Callers should catch BuilderApiError with status === 422 instead.
 */
export interface BuilderPublishBlockedResponse {
  error: {
    code: 'REGRESSION_BLOCKED';
    message: string;
    details: Record<string, unknown>;
    trace_id: string;
  };
}

export interface BuilderKitSummary {
  kit_id: string;
  name: string;
  description: string;
  mode: 'single' | 'team';
  role_count: number;
  tags: string[];
}

export interface BuilderKitsResponse {
  data: {
    kits: BuilderKitSummary[];
  };
  meta: {
    count: number;
  };
}

// ---------------------------------------------------------------------------
// Story 13.3 — Catalog Agent → Team 角色引入
// ---------------------------------------------------------------------------

export interface ImportAgentRequest {
  catalog_agent_id: string;
}

export interface ImportAgentResponse {
  data: RoleProfile;
  meta: {
    trace_id: string;
    timestamp: string;
    blueprint_id: string;
    catalog_agent_id: string;
  };
}

// ---------------------------------------------------------------------------
// Story 13.6 — Standalone Agent → Team Promotion
//
// 锚点角色通过 RoleProfile.metadata.anchor = true 标记（per-role），
// 与 Story 13.3 的 metadata.imported_from 同命名空间，无需新建顶层字段。
// 后端 Blueprint metadata.anchor_role_id 记录锚点 role_id 引用。
// ---------------------------------------------------------------------------

export interface PromoteFromAgentRequest {
  anchor_agent_id: string;
}

export interface PromoteFromAgentResponse {
  data: AgentBlueprint;
  meta: {
    trace_id: string;
    timestamp: string;
    anchor_agent_id: string;
  };
}
