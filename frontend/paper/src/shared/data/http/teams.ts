/**
 * teams.ts — 团队工作流与策略矩阵（后端 teams-store 的真实契约）。
 *
 *   GET /api/teams/:id/workflow  → { nodes: [...], edges: [...] }，没存过给默认图
 *   PUT /api/teams/:id/workflow  → 环检测 + agent 校验（本轮只读，不写）
 *   GET /api/teams/:id/policy    → policy_matrix，缺省 {}
 *   PUT /api/teams/:id/policy    → { matrix }（整体替换）
 *
 * 只有这个文件知道路径与字段名；TeamsView 只认下面的类型。
 */
import { mayGet, request } from './client';

/** 工作流节点：position 是设计坐标，data 里带着归属 agent 与一句话职责。 */
export interface TeamWorkflowNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: { agentId?: string; name?: string; soul?: string };
}

/** 交接：mode = direct 直通 / conditional 条件 / approve 审批门。 */
export interface TeamWorkflowEdge {
  id?: string;
  source: string;
  target: string;
  data?: { mode?: string; label?: string };
}

export interface TeamWorkflowGraph {
  nodes: TeamWorkflowNode[];
  edges: TeamWorkflowEdge[];
}

/** 策略矩阵：行发起、列接收，值与后端 policy-gate 同义。 */
export type TeamPolicy = Record<string, Record<string, string>>;

async function unwrap<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await request<T | { data: T }>(path, init);
  if (res && typeof res === 'object' && 'data' in (res as object)) {
    return (res as { data: T }).data;
  }
  return res as T;
}

export const getTeamWorkflow = (teamId: string) =>
  unwrap<TeamWorkflowGraph>(`/api/teams/${encodeURIComponent(teamId)}/workflow`).then((g) => ({
    nodes: Array.isArray(g?.nodes) ? g.nodes : [],
    edges: Array.isArray(g?.edges) ? g.edges : [],
  }));

export const getTeamPolicy = (teamId: string) =>
  unwrap<TeamPolicy>(`/api/teams/${encodeURIComponent(teamId)}/policy`).then((m) =>
    m && typeof m === 'object' && !Array.isArray(m) ? m : {},
  );

export const saveTeamPolicy = (teamId: string, matrix: TeamPolicy) =>
  unwrap<TeamPolicy>(`/api/teams/${encodeURIComponent(teamId)}/policy`, {
    method: 'PUT',
    body: JSON.stringify({ matrix }),
  });

/** 团队详情（成员可能比列表里多，例如刚加的人）。 */
export interface TeamDetail {
  team_id: string;
  name: string;
  description?: string;
  agent_ids?: string[];
  workflow?: TeamWorkflowGraph | Record<string, never>;
  policy_matrix?: TeamPolicy;
}

export const getTeamDetail = (teamId: string) =>
  mayGet<TeamDetail>(`/api/teams/${encodeURIComponent(teamId)}`).then((t) => t ?? null);
