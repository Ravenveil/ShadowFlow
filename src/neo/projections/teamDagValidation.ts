/**
 * teamDagValidation — Team DAG 编辑器的保存前纯函数校验（GAP B28）。
 *
 * 语义镜像后端 `shadowflow/api/team_validation.py:validate_workflow`
 * （PUT /api/teams/{id}/workflow 的 D1 写时校验），让编辑器在发请求前
 * 用同一套规则挡住非法图，后端 422 作为兜底：
 *
 *   1. 每条边必须是 well-formed 的 {source, target} 字符串对
 *   2. 禁止自环（source === target）
 *   3. 边两端必须指向已知节点 id
 *   4. 顺序边不成环 —— 后端 `_map_mode` 把 'conditional'/'parallel' 之外的
 *      mode（'direct'/'approve'/缺省）全部归为 sequential；环检测只覆盖
 *      sequential 边（conditional/parallel 豁免 —— conditional 是「驳回回炉」
 *      合法回边）。2026-11-07 修复：此前前端把所有边都塞进环检测，导致
 *      「送审 + 驳回回炉」互逆边对根本存不下去，口径对齐后端。
 *
 * approve 边规则核对（2026-08-22，读 team_validation.py 确认）：后端对 approve
 * 没有额外的 D1/D2 结构约束 —— 它经 `_map_mode` 归为 sequential，唯一语义是
 * 参与环检测（本文件已镜像）；D2 校验的是节点 agentId 存在性，与边 mode 无关。
 * 因此本文件不新增 approve 专属规则，只提供 mode 归一化/切换的纯函数。
 *
 * 纯函数、无 reactflow 依赖，便于 vitest 直测。
 */
import type { TeamWorkflow } from '../../api/teams';

/** team workflow 边模式（与 TeamWorkflowEdge['data']['mode'] 对齐）。 */
export type TeamEdgeMode = 'direct' | 'approve' | 'conditional' | 'parallel';

/**
 * 归一化边 mode：approve/conditional/parallel 是后端 `_map_mode` 认识的
 * 显式模式，原样保留（round-trip 不丢语义 —— 存量「驳回回炉」conditional
 * 边此前会被压成 direct，保存即语义降级）；其余（含 undefined、未知字符串）
 * 一律按 'direct' 落库。
 */
export function normalizeEdgeMode(mode: unknown): TeamEdgeMode {
  return mode === 'approve' || mode === 'conditional' || mode === 'parallel' ? mode : 'direct';
}

/**
 * 是否参与顺序语义（环检测 / 最长路径分层）：conditional（驳回回炉回边）
 * 与 parallel（并行汇入）豁免，对齐后端 `_map_mode` 的 sequential 归类。
 */
export function isSequentialEdgeMode(mode: unknown): boolean {
  return mode !== 'conditional' && mode !== 'parallel';
}

/**
 * 切换某条边的 mode，返回新数组（不改传入数组/未命中的边对象）。
 * 泛型约束放宽到 {id, data?}，reactflow 的 Edge 和测试里的普通对象都能用。
 */
export function applyEdgeMode<E extends { id: string; data?: unknown }>(
  edges: readonly E[],
  edgeId: string,
  mode: TeamEdgeMode,
): E[] {
  return edges.map((e) =>
    e.id === edgeId
      ? {
          ...e,
          data: {
            ...(typeof e.data === 'object' && e.data !== null ? (e.data as Record<string, unknown>) : {}),
            mode,
          },
        }
      : e,
  );
}

/** DFS 找环，返回环路径（收尾节点重复）或 null。镜像后端 `_find_cycle`。 */
function findCycle(nodeIds: string[], edges: Array<{ source: string; target: string }>): string[] | null {
  const graph = new Map<string, string[]>();
  for (const id of nodeIds) graph.set(id, []);
  for (const e of edges) {
    const arr = graph.get(e.source) ?? [];
    arr.push(e.target);
    graph.set(e.source, arr);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  const dfs = (n: string): string[] | null => {
    if (stack.has(n)) return [...path.slice(path.indexOf(n)), n];
    if (visited.has(n)) return null;
    visited.add(n);
    stack.add(n);
    path.push(n);
    for (const next of graph.get(n) ?? []) {
      const r = dfs(next);
      if (r) return r;
    }
    stack.delete(n);
    path.pop();
    return null;
  };

  for (const n of [...graph.keys()]) {
    if (!visited.has(n)) {
      const r = dfs(n);
      if (r) return r;
    }
  }
  return null;
}

export function validateTeamWorkflowGraph(workflow: TeamWorkflow): string[] {
  const errors: string[] = [];
  const nodeIds = workflow.nodes.map((n) => n.id);
  const nodeSet = new Set(nodeIds);

  const cleanEdges: Array<{ source: string; target: string; mode: unknown }> = [];
  for (const e of workflow.edges) {
    if (typeof e.source !== 'string' || typeof e.target !== 'string' || !e.source || !e.target) {
      errors.push(`边 ${e.id || '(无 id)'} 缺少有效的 source/target`);
      continue;
    }
    if (e.source === e.target) {
      errors.push(`不允许自环边「${e.source} → ${e.target}」`);
      continue;
    }
    if (!nodeSet.has(e.source)) {
      errors.push(`边「${e.source} → ${e.target}」：节点 ${e.source} 不在图中`);
    }
    if (!nodeSet.has(e.target)) {
      errors.push(`边「${e.source} → ${e.target}」：节点 ${e.target} 不在图中`);
    }
    cleanEdges.push({ source: e.source, target: e.target, mode: e.data?.mode });
  }

  // 环检测只看 sequential 边（对齐后端 _map_mode）：conditional/parallel
  // 是合法回边/并行边，「送审 + 驳回回炉」互逆边对不能因此被拒
  const seqEdges = cleanEdges.filter((e) => isSequentialEdgeMode(e.mode));
  const cycle = findCycle(nodeIds, seqEdges);
  if (cycle) {
    errors.push(`检测到顺序边环路：${cycle.join(' → ')}`);
  }

  return errors;
}
