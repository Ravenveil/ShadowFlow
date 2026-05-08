/**
 * Agent Catalog 类型 — Story 8.7
 *
 * 字段名与后端保持 snake_case，不在边界做 camelCase 转换。
 */
import type { AgentBlueprint, CollaborationContract } from './agent-builder';

export type CatalogKitType =
  | 'all'
  | 'research'
  | 'knowledge_assistant'
  | 'review_approval'
  | 'persona'
  | 'custom';

export interface CatalogAppSummary {
  app_id: string;
  name: string;
  goal: string;
  kit_type: string;
  author: string;
  /** 后端可能返回 null（未发布草稿），fmtDate 兼容处理。 */
  published_at: string | null;
  fork_count: number;
  forked_from: string | null;
  template_id: string;
  workflow_id: string;
  blueprint_id: string;
  /**
   * Story 13.5: 团队成员候选提示字段（可选）。
   * 与后端 Python `Literal["team_member_candidate"]` 对称：当前唯一合法非空值。
   */
  scope_hint?: 'team_member_candidate';
  /** Story 13.6 D2-b: 第一个 RoleProfile 的 collaboration_contract 摘要（可选）。 */
  collaboration_contract?: CollaborationContract;
}

export interface CatalogAppDetail extends CatalogAppSummary {
  mode: 'single' | 'team';
  role_names: string[];
  role_count: number;
  description: string;
  /** Sanitized blueprint snapshot — never contains system_prompt / credentials. */
  blueprint_snapshot: Record<string, unknown>;
}

export interface CatalogListResponse {
  data: { apps: CatalogAppSummary[] };
  meta: {
    total: number;
    page: number;
    page_size: number;
    kit_type: string;
    q: string;
  };
}

export interface CatalogDetailResponse {
  data: CatalogAppDetail;
  meta: { trace_id: string };
}

export interface CatalogForkResponse {
  data: {
    blueprint_id: string;
    forked_from: string;
    blueprint: AgentBlueprint;
  };
  meta: { trace_id: string };
}

export interface CatalogListQuery {
  kit_type?: CatalogKitType;
  q?: string;
  page?: number;
  page_size?: number;
}
