/**
 * teamDagDraft — 「AI 生成草稿」的草稿 → 编辑器图纯函数投影。
 *
 * POST /api/teams/dag-draft 返回的 TeamDagDraft（服务端已做 D1/D2 校验）
 * 转成 TeamDagEditor 画布使用的 TeamWorkflow 形状：
 *   - agentId 只对 roster 内成员生效（roster 外的引用/LLM 新角色落空 agentId，
 *     展示 name；与编辑器「data.agentId 为空占位」的旧节点语义一致）；
 *   - 边 mode 走 normalizeEdgeMode：approve 保留，conditional/未知 → direct
 *     （编辑器目前只有 direct/approve 两种边 mode，conditional 的「回边」
 *     语义在画布上收敛为 direct，用户可再手动调整）；
 *   - 坐标给一个简单的分层布局（按 direct/approve 边做最长路径分层，
 *     conditional 边不参与分层，同层纵向排开），避免全部叠在 (0,0)。
 *
 * 纯函数、无 reactflow 依赖，便于 vitest 直测。
 */
import type { TeamDagDraft, TeamWorkflow } from '../../api/teams';
import type { AgentRecord } from '../../api/agents';
import { normalizeEdgeMode } from './teamDagValidation';

/** 分层：按顺序边（direct/approve）做最长路径分层；conditional 边不参与。 */
function computeLayers(draft: TeamDagDraft): Map<string, number> {
  const layer = new Map<string, number>();
  for (const n of draft.nodes) layer.set(n.id, 0);
  const seqEdges = draft.edges.filter((e) => e.mode !== 'conditional');
  // 顺序边无环（服务端已校验），松弛 |V| 轮收敛
  for (let i = 0; i < draft.nodes.length; i++) {
    for (const e of seqEdges) {
      const s = layer.get(e.source);
      const t = layer.get(e.target);
      if (s === undefined || t === undefined) continue;
      if (s + 1 > t) layer.set(e.target, s + 1);
    }
  }
  return layer;
}

export function dagDraftToWorkflow(draft: TeamDagDraft, roster: AgentRecord[]): TeamWorkflow {
  const byId = new Map(roster.map((a) => [a.agent_id, a]));
  const layer = computeLayers(draft);
  const layerCount = new Map<number, number>();

  return {
    nodes: draft.nodes.map((n) => {
      const agent = n.agentId ? byId.get(n.agentId) : undefined;
      const l = layer.get(n.id) ?? 0;
      const row = layerCount.get(l) ?? 0;
      layerCount.set(l, row + 1);
      return {
        id: n.id,
        type: 'agentTask',
        position: { x: l * 220, y: 40 + row * 106 },
        data: {
          agentId: agent ? agent.agent_id : '',
          name: agent?.name || n.name || n.id,
          soul: agent?.soul ?? '',
        },
      };
    }),
    edges: draft.edges.map((e) => ({
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      data: { mode: normalizeEdgeMode(e.mode) },
    })),
  };
}
