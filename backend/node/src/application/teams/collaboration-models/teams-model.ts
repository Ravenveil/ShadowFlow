/**
 * collaboration 域 — teams 子域领域模型（纯规则层）
 *
 * D1/D2/D3 的纯判定部分：team_id 校验、workspace 哨兵归一、workflow 存储形展平、
 * agentId 抽取。DAG 环检测委托 lib/team-dag-draft（已是纯函数，单一真源）。
 * 纯函数，禁止 import fs/path/storage。
 */

/** D3：pre-workspace 老记录的哨兵 workspace。 */
export const UNASSIGNED_WORKSPACE = 'unassigned';

/** 对齐 Python _TEAM_ID_RE：常见 id 字符，禁路径穿越。 */
const TEAM_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function isValidTeamId(teamId: string): boolean {
  return TEAM_ID_RE.test(teamId);
}

/** 缺失/空白 → 'unassigned' 哨兵；显式 id（含 legacy 字面 'default'）原样返回。 */
export function normalizeWorkspaceId(workspaceId: string | null | undefined): string {
  if (workspaceId === null || workspaceId === undefined || !workspaceId.trim()) {
    return UNASSIGNED_WORKSPACE;
  }
  return workspaceId;
}

/** 团队工作流图的「存储形」——前端画布落库的原样包装。 */
export interface TeamWorkflowGraph {
  nodes: unknown[];
  edges: unknown[];
}

export interface TeamRecord {
  team_id: string;
  name: string;
  description: string;
  workspace_id: string;
  agent_ids: string[];
  created_at: string;
  updated_at: string;
  workflow?: TeamWorkflowGraph;
  policy_matrix?: Record<string, unknown>;
  validation_hooks?: unknown[];
  [key: string]: unknown;
}

/** GET …/workflow 无保存图时的缺省返回。 */
export function defaultWorkflow(): TeamWorkflowGraph {
  return { nodes: [], edges: [] };
}

/** 本地 agent 摘要（D2 存在性来源）。 */
export interface LocalAgentSummary {
  id: string;
  name: string;
  /** soul 首个非空行（对齐 Python /api/agents 把 soul 当 role 摘要带出）。 */
  role?: string;
}

/** 从节点对象抽 (id, agentId)：兼容包装形 {id,data:{agentId}} 与裸形 {id,agentId}。 */
export function nodeIdentity(n: unknown): { id: string; agentId?: string } | null {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return null;
  const o = n as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  let agentId: string | undefined;
  const data = o.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (typeof d.agentId === 'string' && d.agentId.trim()) agentId = d.agentId.trim();
  }
  if (!agentId && typeof o.agentId === 'string' && o.agentId.trim()) {
    agentId = o.agentId.trim();
  }
  return { id: o.id, ...(agentId ? { agentId } : {}) };
}

/** 从边对象抽 (source, target, mode)：兼容 {data:{mode}} 与裸 {mode}。 */
export function edgeIdentity(e: unknown): { source: string; target: string; mode: unknown } | null {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const o = e as Record<string, unknown>;
  if (typeof o.source !== 'string' || typeof o.target !== 'string') return null;
  const data = o.data;
  const mode =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>).mode
      : o.mode;
  return { source: o.source, target: o.target, mode };
}

/** 抽取节点引用的非空 agentId（D2 用；coordinator 占位节点的空 agentId 跳过）。 */
export function workflowStoredAgentIds(workflow: TeamWorkflowGraph): string[] {
  const out: string[] = [];
  for (const n of workflow.nodes) {
    const id = nodeIdentity(n);
    if (id?.agentId) out.push(id.agentId);
  }
  return out;
}

/** 从 agent 记录的 soul 抽首个非空行作 role 摘要。 */
export function roleFromSoul(soul: unknown): string | undefined {
  if (typeof soul !== 'string') return undefined;
  return soul.split('\n').find((l) => l.trim().length > 0)?.trim();
}
