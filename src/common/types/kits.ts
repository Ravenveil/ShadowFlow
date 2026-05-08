/**
 * Kit Defaults Registry 前端类型 — Story 10.5
 *
 * 字段名保持后端 snake_case，与后端 KitDefinition.metadata_only() 响应对齐。
 * 各 Kit 的详细输入类型由 10.1-10.4 填写（TODO 标注）。
 */

// ---------------------------------------------------------------------------
// KitDefinition 元数据（GET /builder/kits 列表响应）
// ---------------------------------------------------------------------------

export type KitCategory = 'research' | 'knowledge' | 'review' | 'persona' | 'custom';

export type KitResultView =
  | 'scene_report'
  | 'agent_dm_with_state'
  | 'approval_inbox'
  | 'research_report';

export type KitMode = 'goal' | 'scene' | 'graph';

export interface KitDefinition {
  kit_id: string;
  display_name: string;
  description: string;
  category: KitCategory;
  supported_modes: KitMode[];
  default_result_view: KitResultView;
  recommended_inputs: string[];
  icon: string;
}

// ---------------------------------------------------------------------------
// KitDefinition 完整详情（GET /builder/kits/{kit_id} 响应）
// ---------------------------------------------------------------------------

export interface BlueprintSummary {
  blueprint_id: string;
  name: string;
  goal: string;
  mode: 'single' | 'team';
  role_count: number;
}

export interface KitDetailDefinition extends KitDefinition {
  default_blueprint_summary: BlueprintSummary;
  default_scene: Record<string, unknown>;
  default_policy_profile: Record<string, unknown>;
  default_eval_profile: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API 响应 envelope
// ---------------------------------------------------------------------------

export interface KitsListResponse {
  data: KitDefinition[];
  meta: {
    count: number;
    trace_id?: string;
    timestamp?: string;
    source?: string;
  };
}

export interface KitDetailResponse {
  data: KitDetailDefinition;
  meta: {
    trace_id?: string;
    timestamp?: string;
  };
}

// ---------------------------------------------------------------------------
// 各 Kit 的输入类型占位（由 Story 10.1-10.4 填写）
// ---------------------------------------------------------------------------

/** Story 10.1 — Research Kit 向导输入（5 字段，对齐后端 ResearchGoalInputs） */
export interface ResearchKitInputs {
  /** 研究主题（必填） */
  research_topic: string;
  /** 研究目标/输出形式：answer / report / structured_outline */
  output_format: 'answer' | 'report' | 'structured_outline';
  /** 资料新鲜度要求：latest / within_month / any */
  freshness: 'latest' | 'within_month' | 'any';
  /** 是否强制引用（默认 true） */
  citation_required: boolean;
  /** 最大搜索轮次（1–5，默认 2） */
  max_search_rounds: number;
}

/** Story 10.2 — Knowledge Assistant Kit 向导输入（完整 5 字段 + 可选字段） */
export interface KnowledgeAssistantKitInputs {
  /** 知识来源类型: upload / url / existing_pack / none */
  knowledge_source: 'upload' | 'url' | 'existing_pack' | 'none';
  /** 是否强制引用（默认 true） */
  citation_required: boolean;
  /** 低置信度处理策略 */
  low_confidence_strategy: 'escalate_human' | 'escalate_review' | 'reject_with_message';
  /** 高风险关键词列表（命中时强制引用） */
  escalation_keywords: string[];
  /** 助手名称（用于 AgentDM 显示名） */
  assistant_name: string;
  /** KnowledgePack ID（knowledge_source='existing_pack' 时使用） */
  pack_id?: string;
  /** 置信度升级阈值（默认 0.5） */
  confidence_threshold?: number;
}

/** Story 10.3 — Review & Approval Kit 向导输入（与后端 ReviewApprovalGoalInputs 对齐） */
export interface ReviewApprovalKitInputs {
  /** 内容类型：document / code / proposal / custom */
  content_type?: 'document' | 'code' | 'proposal' | 'custom';
  /** 审批层级：single_review（Writer+Reviewer）/ review_then_approve（+Approver） */
  approval_levels?: 'single_review' | 'review_then_approve';
  /** 最大驳回轮次（1–10，默认 3） */
  max_reject_rounds?: number;
  /** 输出格式：markdown / json / plain_text */
  output_format?: 'markdown' | 'json' | 'plain_text';
  /** 审核角色姓名（默认 "Reviewer"） */
  reviewer_name?: string;
  /** 审批角色姓名（默认 "Approver"，review_then_approve 时使用） */
  approver_name?: string;
  [key: string]: unknown;
}

/** Story 10.4 — Persona / NPC Kit 向导输入（5 字段，对齐后端 PersonaNPCGoalInputs） */
export interface PersonaNPCKitInputs {
  /** 角色名称（必填，1–200 字符） */
  persona_name: string;
  /** 性格描述，如「温柔、善解人意、略带神秘感」（必填） */
  personality: string;
  /** 背景故事（可选，用于 MemoryProfile semantic memory 种子） */
  backstory?: string;
  /** 记忆保留策略：minimal（轻量）/ balanced（平衡）/ rich（丰富），默认 balanced */
  memory_retention?: 'minimal' | 'balanced' | 'rich';
  /** 是否启用关系追踪（RelationshipHooks），默认 true */
  enable_relationships?: boolean;
}
