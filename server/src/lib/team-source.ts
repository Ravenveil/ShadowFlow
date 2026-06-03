/**
 * team-source.ts — Phase 1 单一真源读取层。
 *
 * D1(plan-eng-review 已锁):team 的 edges/policy 以 Python JSON
 * (`.shadowflow/teams/<id>.json`)为唯一真源。本模块把该 JSON 映射成 runDag /
 * 批 2 chat 执行器共用的 run shape `{members, edges, policy_matrix}`,并提供
 * 读盘 loader。Express `.team.yaml` 仅保留 dag_layout(坐标),不再作为 edges/policy 来源。
 */
import type { TeamEdgeV1, EdgeKind } from './team-yaml';

export interface TeamRunShape {
  members: string[];
  edges: TeamEdgeV1[];
  policy_matrix: Record<string, Record<string, string>>;
}

interface PyWorkflowNode { id?: string; data?: { agentId?: string } }
interface PyWorkflowEdge { source?: string; target?: string; data?: { mode?: string } }
interface PyTeamJson {
  team_id?: string;
  name?: string;
  agent_ids?: string[];
  workflow?: { nodes?: PyWorkflowNode[]; edges?: PyWorkflowEdge[] };
  policy_matrix?: Record<string, Record<string, string>>;
}

function mapMode(mode: string | undefined): EdgeKind {
  if (mode === 'conditional') return 'conditional';
  if (mode === 'parallel') return 'parallel';
  return 'sequential'; // 'direct' / 未知 → 串行
}

export function mapPythonTeamToRunShape(json: PyTeamJson): TeamRunShape {
  const members = Array.isArray(json.agent_ids) ? json.agent_ids.slice() : [];
  const nodes = json.workflow?.nodes ?? [];
  const nodeToAgent = new Map<string, string>();
  for (const n of nodes) {
    if (n.id && n.data?.agentId) nodeToAgent.set(n.id, n.data.agentId);
  }
  const edges: TeamEdgeV1[] = [];
  for (const e of json.workflow?.edges ?? []) {
    const from = e.source ? nodeToAgent.get(e.source) : undefined;
    const to = e.target ? nodeToAgent.get(e.target) : undefined;
    if (!from || !to) continue; // 悬空边跳过
    edges.push({ from, to, kind: mapMode(e.data?.mode) });
  }
  return { members, edges, policy_matrix: json.policy_matrix ?? {} };
}
