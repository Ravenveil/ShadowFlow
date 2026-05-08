/**
 * Builder API client — Story 8.1 (AC4) + Story 8.6 (真实发布) + Story 10.5 (Kit Registry)
 *                      + Story 13.3 (Catalog Agent → Team 角色引入)
 *
 * 复用 templates.ts 的 _handleResponse<T> 模式；
 * 错误路径统一进入 BuilderApiError。
 * REGRESSION_BLOCKED 自 Patch 16 起由后端返回 HTTP 422，
 * publishBlueprint 通过抛出 BuilderApiError(422) 通知调用方，
 * 不再返回 BuilderPublishBlockedResponse union 类型。
 *
 * Story 10.5 新增：
 *   listKits()  — GET /builder/kits，返回 KitDefinition[] 列表
 *   getKit(id)  — GET /builder/kits/{kit_id}，返回完整 KitDetailDefinition
 *
 * Story 13.3 新增：
 *   importAgentToBlueprint(blueprintId, catalogAgentId) — POST /builder/blueprints/{id}/import-agent
 */
import type {
  BuilderGenerateRequest,
  BuilderGenerateResponse,
  BuilderInstantiateRequest,
  BuilderInstantiateResponse,
  BuilderSmokeRunRequest,
  BuilderSmokeRunResponse,
  BuilderPublishRequest,
  BuilderPublishResponse,
  BuilderKitsResponse,
  AgentBlueprint,
  ImportAgentRequest,
  ImportAgentResponse,
  PromoteFromAgentRequest,
  PromoteFromAgentResponse,
  RoleProfile,
} from '../common/types/agent-builder';
import type {
  KitDefinition,
  KitDetailDefinition,
  KitsListResponse,
  KitDetailResponse,
} from '../common/types/kits';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class BuilderApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`Builder API error ${status}`);
  }
}

async function _handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.text();
  let detail: unknown = body;
  try {
    detail = JSON.parse(body);
  } catch {
    // keep raw text
  }
  throw new BuilderApiError(res.status, detail);
}

async function _post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return _handleResponse<TRes>(res);
}

async function _get<TRes>(path: string): Promise<TRes> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  return _handleResponse<TRes>(res);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateBlueprint(
  req: BuilderGenerateRequest,
): Promise<BuilderGenerateResponse> {
  return _post<BuilderGenerateRequest, BuilderGenerateResponse>(
    '/builder/blueprints/generate',
    req,
  );
}

export async function instantiateBlueprint(
  blueprint: AgentBlueprint,
  parameters?: Record<string, unknown>,
): Promise<BuilderInstantiateResponse> {
  const req: BuilderInstantiateRequest = { blueprint, parameters };
  return _post<BuilderInstantiateRequest, BuilderInstantiateResponse>(
    '/builder/blueprints/instantiate',
    req,
  );
}

export async function smokeRunBlueprint(
  blueprint: AgentBlueprint,
): Promise<BuilderSmokeRunResponse> {
  const req: BuilderSmokeRunRequest = { blueprint };
  return _post<BuilderSmokeRunRequest, BuilderSmokeRunResponse>(
    '/builder/blueprints/smoke-run',
    req,
  );
}

export async function publishBlueprint(
  blueprint: AgentBlueprint,
): Promise<BuilderPublishResponse> {
  const req: BuilderPublishRequest = { blueprint };
  return _post<BuilderPublishRequest, BuilderPublishResponse>(
    '/builder/blueprints/publish',
    req,
  );
}

export async function listBuilderKits(): Promise<BuilderKitsResponse> {
  return _get<BuilderKitsResponse>('/builder/kits');
}

// ---------------------------------------------------------------------------
// Story 10.5 — Kit Registry API (AC2/AC3)
// ---------------------------------------------------------------------------

/**
 * GET /builder/kits
 * 返回所有已注册 Kit 的元数据列表（不含完整 Blueprint）。
 */
export async function listKits(): Promise<KitDefinition[]> {
  const resp = await _get<KitsListResponse>('/builder/kits');
  // 后端 data 可能是 KitDefinition[] (REGISTRY 模式) 或 legacy 对象
  const data = resp.data;
  if (Array.isArray(data)) {
    return data as KitDefinition[];
  }
  // 降级：legacy { kits: [...] } 结构
  const legacyData = data as { kits?: KitDefinition[] };
  return legacyData.kits ?? [];
}

/**
 * GET /builder/kits/{kitId}
 * 返回单个 Kit 的完整详情（含 blueprint summary）。
 */
export async function getKit(kitId: string): Promise<KitDetailDefinition> {
  const resp = await _get<KitDetailResponse>(`/builder/kits/${encodeURIComponent(kitId)}`);
  return resp.data;
}

// ---------------------------------------------------------------------------
// Story 10.1 — Research Kit instantiate (AC5)
// ---------------------------------------------------------------------------

import type {
  ResearchKitInputs,
  KnowledgeAssistantKitInputs,
  ReviewApprovalKitInputs,
  PersonaNPCKitInputs,
} from '../common/types/kits';

/**
 * POST /builder/kits/research/instantiate
 * 从 Research Kit 向导输入（ResearchKitInputs）生成 AgentBlueprint。
 *
 * 对应后端 `POST /builder/kits/research/instantiate`（Story 10.1 AC5）。
 * 返回 AgentBlueprint 对象（4 角色：Planner / Researcher / Summarizer / Report Writer）。
 */
export async function instantiateResearchKit(
  inputs: ResearchKitInputs,
): Promise<AgentBlueprint> {
  const resp = await _post<ResearchKitInputs, { data: AgentBlueprint; meta: Record<string, unknown> }>(
    '/builder/kits/research/instantiate',
    inputs,
  );
  return resp.data;
}

// ---------------------------------------------------------------------------
// Story 10.2 — Knowledge Assistant Kit (AC5)
// ---------------------------------------------------------------------------

/**
 * 实例化 Knowledge Assistant Kit。
 *
 * 将向导输入（KnowledgeAssistantKitInputs）转换为 AgentBlueprint，
 * 提交到 POST /builder/blueprints/instantiate 生成 WorkflowDefinition。
 *
 * 返回 blueprint + template_spec + workflow_definition（可直接传给 Editor）。
 */
export async function instantiateKnowledgeAssistantKit(
  inputs: KnowledgeAssistantKitInputs,
): Promise<BuilderInstantiateResponse['data']> {
  const blueprintPayload: Partial<AgentBlueprint> = {
    name: inputs.assistant_name,
    goal:
      '作为可信知识问答助手，基于绑定的知识库回答用户问题，严格引用来源，低置信度时转人工，禁止编造答案。',
    audience: '企业用户 / 知识管理员 / 文档助手使用者',
    mode: 'team',
    role_profiles: [
      {
        role_id: 'retriever',
        name: 'Retriever',
        description: '执行知识库检索，输出命中片段与 confidence score',
        persona: '专注知识检索的信息检索专家',
        responsibilities: [
          '从绑定的 KnowledgePack 中检索相关片段',
          '输出 hit_count 和 confidence score',
        ],
        constraints: ['只能访问已绑定的 KnowledgePack', '不生成任何答案，只输出检索结果'],
        tools: ['knowledge_retrieval'],
        executor_kind: 'api',
        executor_provider: 'anthropic',
        executor_model: 'claude-sonnet-4-6',
        capabilities: [],
        handoff_rules: [
          { trigger: 'retrieval_done', target_role: 'answerer' },
          { trigger: 'retrieval_failed', target_role: 'escalation' },
        ],
        persona_traits: {},
        state_fields: [],
        can_spawn_tasks: false,
        sub_agents: [],
        metadata: { role_type: 'retriever' },
      },
      {
        role_id: 'answerer',
        name: 'Answerer',
        description: '基于检索片段生成带 citation_trace 的回答',
        persona: '严格遵守知识边界、只基于检索结果作答的问答专家',
        responsibilities: [
          '仅基于 Retriever 提供的命中片段生成回答',
          '每个答案必须附带 citation_trace[]',
          'hit_count=0 时返回 no_source_response 标准拒答模板',
        ],
        constraints: [
          '禁止编造未在知识库中出现的内容',
          `citation_required=${inputs.citation_required}`,
        ],
        tools: ['citation_service'],
        executor_kind: 'api',
        executor_provider: 'anthropic',
        executor_model: 'claude-sonnet-4-6',
        capabilities: [],
        handoff_rules: [
          { trigger: 'low_confidence', target_role: 'escalation' },
          { trigger: 'no_source', target_role: 'escalation' },
        ],
        persona_traits: {},
        state_fields: [],
        can_spawn_tasks: false,
        sub_agents: [],
        metadata: {
          role_type: 'answerer',
          citation_required: inputs.citation_required,
          confidence_threshold: inputs.confidence_threshold ?? 0.5,
        },
      },
      {
        role_id: 'escalation',
        name: 'Escalation',
        description: '当触发升级条件时接管，发出 human_handoff_event',
        persona: '负责将低置信度或无知识支撑的问题转交人工的升级处理员',
        responsibilities: ['接收升级请求', '发出 human_handoff_event'],
        constraints: ['不独立生成答案', '必须通过 ApprovalGate 机制通知人工'],
        tools: ['approval_gate'],
        executor_kind: 'api',
        executor_provider: 'anthropic',
        executor_model: 'claude-sonnet-4-6',
        capabilities: [],
        handoff_rules: [],
        persona_traits: {},
        state_fields: [],
        can_spawn_tasks: false,
        sub_agents: [],
        metadata: {
          role_type: 'escalation',
          can_receive_approvals: true,
          escalation_strategy: inputs.low_confidence_strategy,
          escalation_keywords: inputs.escalation_keywords,
        },
      },
    ],
    knowledge_bindings:
      inputs.knowledge_source === 'existing_pack' && inputs.pack_id
        ? [
            {
              binding_id: `kb-kit-${Date.now().toString(36)}`,
              source_type: 'pack',
              source_ref: inputs.pack_id,
              citation_required: inputs.citation_required,
              retrieval_mode: 'auto',
              freshness_hint: 'static',
              scope: 'shared',
              target_ref: null,
              metadata: { pack_id: inputs.pack_id },
            },
          ]
        : [],
    eval_profile: {
      smoke_eval_enabled: true,
      eval_criteria: [
        'doc_hit_rate: 知识包检索命中率，目标 > 0.8',
        'citation_attached_rate: 命中路径回答附带 citation_trace 的比率，目标 = 1.0',
        'escalation_triggered: 低置信度和无知识时升级规则按 Policy 触发',
      ],
      regression_gate: false,
      metadata: {
        kit_id: 'knowledge_assistant_kit',
        confidence_threshold: inputs.confidence_threshold ?? 0.5,
      },
    },
    metadata: {
      kit_id: 'knowledge_assistant_kit',
      citation_required: inputs.citation_required,
      low_confidence_strategy: inputs.low_confidence_strategy,
      confidence_threshold: inputs.confidence_threshold ?? 0.5,
      escalation_keywords: inputs.escalation_keywords,
    },
  };

  const req: BuilderInstantiateRequest = {
    blueprint: blueprintPayload as AgentBlueprint,
    parameters: { kit_id: 'knowledge_assistant_kit' },
  };
  const resp = await _post<BuilderInstantiateRequest, BuilderInstantiateResponse>(
    '/builder/blueprints/instantiate',
    req,
  );
  return resp.data;
}

// ---------------------------------------------------------------------------
// Story 10.3 — Review & Approval Kit (AC5)
// ---------------------------------------------------------------------------

/**
 * instantiateReviewApprovalKit — 实例化 Review & Approval Kit
 *
 * 将向导输入（ReviewApprovalKitInputs，6 字段）提交到
 * POST /builder/kits/review_approval/instantiate，
 * 返回生成的 AgentBlueprint（2-3 角色：Writer + Reviewer [+ Approver]）。
 *
 * 生成的 Blueprint 包含：
 *   - PolicyMatrix 预配置（Writer 禁止直接 deliver，Reviewer/Approver 可驳回）
 *   - max_reject_rounds → RetryPolicy.max_rounds
 *   - ApprovalGate 节点配置（供运行时注入）
 * 结果视图默认为 approval_inbox。
 */
export async function instantiateReviewApprovalKit(
  inputs: ReviewApprovalKitInputs,
): Promise<AgentBlueprint> {
  const resp = await _post<
    ReviewApprovalKitInputs,
    { data: AgentBlueprint; meta: Record<string, unknown> }
  >('/builder/kits/review_approval/instantiate', inputs);
  return resp.data;
}

// ---------------------------------------------------------------------------
// Story 10.4 — Persona / NPC Kit (AC5)
// ---------------------------------------------------------------------------

/**
 * instantiatePersonaNPCKit — 实例化 Persona / NPC Kit
 *
 * 将向导输入（PersonaNPCKitInputs，5 字段）提交到
 * POST /builder/kits/persona_npc/instantiate，
 * 返回生成的 AgentBlueprint（单角色 + MemoryProfile + State Fields + RelationshipHooks）。
 *
 * 结果视图默认为 agent_dm_with_state（AgentDM 频道 + AgentStatePanel 右侧）。
 */
export async function instantiatePersonaNPCKit(
  inputs: PersonaNPCKitInputs,
): Promise<AgentBlueprint> {
  const resp = await _post<PersonaNPCKitInputs, { data: AgentBlueprint; meta: Record<string, unknown> }>(
    '/builder/kits/persona_npc/instantiate',
    inputs,
  );
  return resp.data;
}

// ---------------------------------------------------------------------------
// Story 13.3 — Catalog Agent → Team 角色引入
// ---------------------------------------------------------------------------

/**
 * POST /builder/blueprints/{blueprintId}/import-agent
 *
 * 从 Catalog Agent 快照提取 RoleProfile 返回给前端。
 * blueprint_id 是占位符（blueprint 存储在前端 builderStore）；
 * 前端负责把返回的 RoleProfile 插入 blueprint.role_profiles。
 */
// ---------------------------------------------------------------------------
// Story 10.6 — Kit Smoke Run & Regression
// ---------------------------------------------------------------------------

export interface KitSuggestedFix {
  label: string;
  action_type: 'navigate';
  target: string;
}

export interface KitSmokeCaseResult {
  name: string;
  passed: boolean;
  failed_stage: string | null;
  metrics: Record<string, number>;
  missing_configs: string[];
  suggested_fixes: KitSuggestedFix[];
  detail: string;
  duration_s: number;
  error: string | null;
  citation_present: boolean | null;
}

export interface KitSmokeRunReport {
  kit_id: string;
  passed: boolean;
  failed_stage: string | null;
  missing_configs: string[];
  suggested_fixes: KitSuggestedFix[];
  case_results: KitSmokeCaseResult[];
  summary_metrics: Record<string, number>;
  duration_s: number;
  timestamp: string;
  error: string | null;
}

export interface KitRegressionMetricDiff {
  metric: string;
  baseline: number;
  current: number;
  delta_pct: number;
  verdict: 'pass' | 'warning' | 'block';
}

export interface KitRegressionReport {
  kit_id: string;
  baseline_timestamp: string | null;
  current: KitSmokeRunReport | null;
  baseline_comparison: KitRegressionMetricDiff[];
  regressions_detected: boolean;
  verdict: 'pass' | 'warning' | 'block';
  reasons: string[];
}

export async function runKitSmoke(
  kitId: string,
  blueprint: AgentBlueprint,
  opts?: { mockLlm?: boolean; timeoutS?: number },
): Promise<KitSmokeRunReport> {
  const resp = await _post<
    { kit_id: string; blueprint: AgentBlueprint; mock_llm: boolean; timeout_s: number },
    { data: KitSmokeRunReport; meta: Record<string, unknown> }
  >('/builder/blueprints/kit-smoke-run', {
    kit_id: kitId,
    blueprint,
    mock_llm: opts?.mockLlm ?? true,
    timeout_s: opts?.timeoutS ?? 60,
  });
  return resp.data;
}

export async function runKitRegression(
  kitId: string,
  blueprint: AgentBlueprint,
  opts?: { mockLlm?: boolean; timeoutS?: number },
): Promise<KitRegressionReport> {
  const resp = await _post<
    { kit_id: string; blueprint: AgentBlueprint; mock_llm: boolean; timeout_s: number },
    { data: KitRegressionReport; meta: Record<string, unknown> }
  >('/builder/blueprints/kit-regression', {
    kit_id: kitId,
    blueprint,
    mock_llm: opts?.mockLlm ?? true,
    timeout_s: opts?.timeoutS ?? 60,
  });
  return resp.data;
}

export async function importAgentToBlueprint(
  blueprintId: string,
  catalogAgentId: string,
): Promise<RoleProfile> {
  const req: ImportAgentRequest = { catalog_agent_id: catalogAgentId };
  const resp = await _post<ImportAgentRequest, ImportAgentResponse>(
    `/builder/blueprints/${encodeURIComponent(blueprintId)}/import-agent`,
    req,
  );
  return resp.data;
}

// ---------------------------------------------------------------------------
// Story 13.6 — Standalone Agent → Team Promotion
// ---------------------------------------------------------------------------

/**
 * POST /builder/teams/from-agent
 *
 * 以一个已发布 Catalog Agent 为锚点构造完整的 Team Blueprint。
 * 不同于 import-agent 仅返回单个 RoleProfile —— 此端点返回完整 AgentBlueprint，
 * 调用方应使用 builderStore.setBlueprint 整体接管编辑态。
 */
export async function promoteToTeamFromAgent(
  anchorAgentId: string,
): Promise<AgentBlueprint> {
  const req: PromoteFromAgentRequest = { anchor_agent_id: anchorAgentId };
  const resp = await _post<PromoteFromAgentRequest, PromoteFromAgentResponse>(
    '/builder/teams/from-agent',
    req,
  );
  return resp.data;
}
