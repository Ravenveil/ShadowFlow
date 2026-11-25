/**
 * collaboration 域 — teams 用例（application 层，纯校验编排部分）
 *
 * D1 workflow DAG 校验：把前端画布「存储形」展平成草案形，委托
 * 域内 model validateDagDraft（纯函数，单一真源；2026-11-20 从
 * lib/team-dag-draft 迁入 dag-draft-model，切断对 transport 的传递依赖）。
 * 文件 I/O（一队一 JSON、原子写）在 infra，本模块只编排规则。
 */

import {
  validateDagDraft,
  normalizeDraftEdgeMode,
  type DagDraftEdge,
  type DagDraftNode,
} from '../dag-draft-model';
import {
  edgeIdentity,
  nodeIdentity,
  workflowStoredAgentIds,
  type TeamWorkflowGraph,
} from '../teams-model';

/**
 * D1：结构错误返回错误串列表（空 = 合法），绝不抛。
 * 畸形节点静默跳过（端点缺失由边报错），与 Python 一致。
 */
export const validateWorkflowStoredShape = (workflow: TeamWorkflowGraph): string[] => {
  const nodes: DagDraftNode[] = [];
  const edges: DagDraftEdge[] = [];
  for (const n of workflow.nodes) {
    const id = nodeIdentity(n);
    if (id) nodes.push({ id: id.id, ...(id.agentId ? { agentId: id.agentId } : {}) });
  }
  for (const e of workflow.edges) {
    const ee = edgeIdentity(e);
    if (ee) edges.push({ source: ee.source, target: ee.target, mode: normalizeDraftEdgeMode(ee.mode) });
  }
  return validateDagDraft({ nodes, edges });
};

/** D2 用：workflow 引用的非空 agentId。 */
export const storedAgentIds = (workflow: TeamWorkflowGraph): string[] =>
  workflowStoredAgentIds(workflow);
