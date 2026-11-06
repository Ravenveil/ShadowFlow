/**
 * TeamDagCanvas — GroupMembersPanel「工作流」section 的只读 DAG 画布（2026-08-23）。
 *
 * 血统：布局算法照抄 ProcessDagCanvas 的最长路径分层（computeColumns 同构，
 * 无 dagre 依赖），节点渲染参照 TeamDagEditor 的紧凑 pill；与两者的差异：
 *   - ProcessDagCanvas 吃 run 的 RunGraph（执行态、状态染色），本组件吃
 *     team 配置态的 TeamWorkflow（GET /api/teams/{tid}/workflow）
 *   - TeamDagEditor 是可编辑画布（拖拽/连线/属性面板），本组件纯只读：
 *     nodesDraggable=false / nodesConnectable=false / elementsSelectable=false，
 *     仅保留缩放平移，因此不需要 useNodesState，nodes/edges 直接由
 *     workflow 投影（纯函数 teamWorkflowToFlow*，vitest 可直测）
 *   - 右栏宽度有限（~400px），外层固定高度 240px（.neo-gm-dag-canvas）
 *
 * 边 mode 视觉（与 TeamDagEditor 的 approve 虚线约定一致）：
 *   - approve      → 虚线 + 警示色描边（L6 审批门语义）
 *   - conditional  → 虚线 + 主题强调色（存量数据里可能出现的旧 mode）
 *   - direct/未知  → 默认实线
 *   边 label 直接展示 mode 原文（与旧 chips 明细一致，不另起 i18n 文案）。
 *
 * 2026-11-03 策略联动：可选 prop policyColorOf（agentId → 最严策略态），
 * 命中时节点描边按策略染色（permit/warn/deny），与协作策略矩阵即时联动
 * —— 矩阵改一格、保存/草稿即反映到画布节点描边颜色。
 *
 * 2026-11-06 边线策略联动：可选 prop pairPolicy（成员对无向键 → 策略态，
 * buildPairPolicyColor 构造）。运行时 policy-gate 本就按边逐条查矩阵
 * （gate(matrix, 边source, 边target)），这里把同一张表投到边线颜色上：
 * 允许绿 / 警告琥珀 / 拒绝红加粗，approve 审批边保留虚线形态、仅颜色随策略。
 */
import { useMemo } from 'react';
import { Handle, Position, type Edge, type Node, type NodeTypes } from 'reactflow';
import SfReactFlowBase from '../../core/components/Canvas/SfReactFlowBase';
import { AgentAvatar } from '../../components/agent/AgentAvatar';
import type { TeamWorkflow, TeamWorkflowEdge, PolicyCellState } from '../../api/teams';
import { POLICY_COLOR, edgeVisualFor, lookupPairPolicy, type EdgeVisual } from './teamPolicyVisual';

const COL_GAP = 140;
/* 节点 2026-11-04 改为「头像在上 + 名字在下」竖排卡片（≈56px 高），
   行距从 52 抬到 78，避免同列节点上下压叠。 */
const ROW_GAP = 78;

/** 策略态 → 节点描边色（与 TeamPanel 矩阵格配色一致；真源在 teamPolicyVisual）。 */
export const POLICY_NODE_COLOR = POLICY_COLOR;

interface TeamDagNodeData extends Record<string, unknown> {
  label: string;
  agentId: string;
  /** 2026-11-03：策略联动染色（可选；无策略 = 无描边色 = 默认边框）。 */
  policyState?: PolicyCellState | null;
}

const HANDLE_STYLE = { background: 'transparent', border: 'none' } as const;

const NODE_TYPES: NodeTypes = { gmTeam: GmTeamNode };

function GmTeamNode({ data }: { data: TeamDagNodeData }) {
  const policyStyle =
    data.policyState && POLICY_NODE_COLOR[data.policyState]
      ? { border: `2px solid ${POLICY_NODE_COLOR[data.policyState]}` }
      : undefined;
  return (
    <div className="neo-gm-dag-node" style={policyStyle} title={data.agentId || data.label}>
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <span className="neo-gm-dag-node-avatar">
        <AgentAvatar
          name={data.label || data.agentId || '?'}
          seed={data.label || data.agentId}
          size={26}
        />
      </span>
      <span className="neo-gm-dag-node-label">{data.label}</span>
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
}

/** 最长路径分层（与 ProcessDagCanvas.computeColumns 同构；环安全=guard 限步）。 */
export function computeTeamDagColumns(workflow: TeamWorkflow): Map<string, number> {
  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};
  for (const n of workflow.nodes) {
    incoming[n.id] = [];
    outgoing[n.id] = [];
  }
  for (const e of workflow.edges) {
    if (incoming[e.target]) incoming[e.target].push(e.source);
    if (outgoing[e.source]) outgoing[e.source].push(e.target);
  }
  const col = new Map<string, number>();
  const queue: string[] = [];
  for (const n of workflow.nodes) {
    if ((incoming[n.id] ?? []).length === 0) {
      col.set(n.id, 0);
      queue.push(n.id);
    }
  }
  const guard = workflow.nodes.length * 4 + 8;
  const maxCol = Math.max(0, workflow.nodes.length - 1);
  let steps = 0;
  while (queue.length && steps++ < guard) {
    const id = queue.shift()!;
    const c = col.get(id) ?? 0;
    for (const next of outgoing[id] ?? []) {
      const prev = col.get(next);
      // 列号封顶 n-1：驳回回炉边（环）会让 BFS 反复入队抬高列号，
      // 不封顶时 6 节点图能被推到 20+ 列，fitView 缩到 0.25 画布近乎空白。
      if ((prev === undefined || prev < c + 1) && c + 1 <= maxCol) {
        col.set(next, c + 1);
        queue.push(next);
      }
    }
  }
  for (const n of workflow.nodes) {
    if (!col.has(n.id)) col.set(n.id, 0);
  }
  return col;
}

/** TeamWorkflow 节点 → reactflow nodes（分层列 × 列内行序布局 + 策略染色）。 */
export function teamWorkflowToFlowNodes(
  workflow: TeamWorkflow,
  policyColorOf?: Map<string, PolicyCellState> | null,
): Node<TeamDagNodeData>[] {
  const cols = computeTeamDagColumns(workflow);
  const buckets = new Map<number, string[]>();
  for (const n of workflow.nodes) {
    const c = cols.get(n.id) ?? 0;
    const arr = buckets.get(c) ?? [];
    arr.push(n.id);
    buckets.set(c, arr);
  }
  return workflow.nodes.map((n) => {
    const c = cols.get(n.id) ?? 0;
    const row = (buckets.get(c) ?? []).indexOf(n.id);
    const agentId = n.data?.agentId ?? '';
    return {
      id: n.id,
      type: 'gmTeam',
      position: { x: c * COL_GAP, y: row * ROW_GAP },
      data: {
        label: n.data?.name || n.data?.agentId || n.id,
        agentId,
        policyState: policyColorOf?.get(agentId) ?? null,
      },
    };
  });
}

/** 按边 mode × 成员对策略生成展示属性（策略色优先；虚线 className 标记 mode）。 */function edgeVisual(mode: string, policy?: PolicyCellState | null): EdgeVisual {
  return edgeVisualFor(mode, policy, 'neo-gm-dag-edge--approve', 'neo-gm-dag-edge--conditional');
}

/**
 * TeamWorkflow 边 → reactflow edges（label = mode 原文）。
 * 2026-11-06 策略联动：pairPolicy（成员对无向键 → 策略态，buildPairPolicyColor
 * 构造）命中时边线按成员对策略染色（允许绿/警告琥珀/拒绝红加粗），矩阵改格
 * 即反映；approve 审批边保留虚线形态，仅颜色随策略。边的 source/target 是
 * node id，先经节点表解析成 agentId 再查成员对。
 */
export function teamWorkflowToFlowEdges(
  workflow: TeamWorkflow,
  pairPolicy?: Map<string, PolicyCellState> | null,
): Edge[] {
  const agentOf = new Map<string, string>();
  for (const n of workflow.nodes) {
    if (n.data?.agentId) agentOf.set(n.id, n.data.agentId);
  }
  return workflow.edges.map((e: TeamWorkflowEdge) => {
    const mode = typeof e.data?.mode === 'string' ? e.data.mode : 'direct';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      label: mode,
      ...edgeVisual(
        mode,
        lookupPairPolicy(pairPolicy, agentOf.get(e.source) ?? '', agentOf.get(e.target) ?? ''),
      ),
    };
  });
}

export function TeamDagCanvas({
  workflow,
  policyColorOf,
  pairPolicy,
}: {
  workflow: TeamWorkflow;
  /** agentId → 最严策略态；命中时节点描边按策略染色（矩阵联动）。 */
  policyColorOf?: Map<string, PolicyCellState> | null;
  /** 成员对无向键 → 策略态（buildPairPolicyColor）；命中时边线随策略染色。 */
  pairPolicy?: Map<string, PolicyCellState> | null;
}) {
  const nodes = useMemo(
    () => teamWorkflowToFlowNodes(workflow, policyColorOf),
    [workflow, policyColorOf],
  );
  const edges = useMemo(() => teamWorkflowToFlowEdges(workflow, pairPolicy), [workflow, pairPolicy]);

  return (
    <div className="neo-gm-dag-canvas" data-testid="neo-gm-dag-canvas">
      <SfReactFlowBase
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        showMiniMap={false}
        className="neo-gm-dag-flow"
      />
    </div>
  );
}

export default TeamDagCanvas;
