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
 */
import { useMemo } from 'react';
import { Handle, Position, type Edge, type Node, type NodeTypes } from 'reactflow';
import SfReactFlowBase from '../../core/components/Canvas/SfReactFlowBase';
import { AgentAvatar } from '../../components/agent/AgentAvatar';
import type { TeamWorkflow, TeamWorkflowEdge } from '../../api/teams';

const COL_GAP = 140;
/* 节点 2026-11-04 改为「头像在上 + 名字在下」竖排卡片（≈56px 高），
   行距从 52 抬到 78，避免同列节点上下压叠。 */
const ROW_GAP = 78;

interface TeamDagNodeData extends Record<string, unknown> {
  label: string;
  agentId: string;
}

const HANDLE_STYLE = { background: 'transparent', border: 'none' } as const;

const NODE_TYPES: NodeTypes = { gmTeam: GmTeamNode };

function GmTeamNode({ data }: { data: TeamDagNodeData }) {
  return (
    <div className="neo-gm-dag-node" title={data.agentId || data.label}>
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

/** TeamWorkflow 节点 → reactflow nodes（分层列 × 列内行序布局）。 */
export function teamWorkflowToFlowNodes(workflow: TeamWorkflow): Node<TeamDagNodeData>[] {
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
    return {
      id: n.id,
      type: 'gmTeam',
      position: { x: c * COL_GAP, y: row * ROW_GAP },
      data: {
        label: n.data?.name || n.data?.agentId || n.id,
        agentId: n.data?.agentId ?? '',
      },
    };
  });
}

/** 按边 mode 生成展示属性（虚线 className + 描边色；箭头色随动走 SfReactFlowBase 默认）。 */
function edgeVisual(mode: string): Pick<Edge, 'className' | 'style'> {
  if (mode === 'approve') {
    return {
      className: 'neo-gm-dag-edge--approve',
      style: { stroke: 'var(--t-warn, #D97706)' },
    };
  }
  if (mode === 'conditional') {
    return {
      className: 'neo-gm-dag-edge--conditional',
      style: { stroke: 'var(--t-accent, #0891B2)' },
    };
  }
  return {};
}

/** TeamWorkflow 边 → reactflow edges（label = mode 原文）。 */
export function teamWorkflowToFlowEdges(workflow: TeamWorkflow): Edge[] {
  return workflow.edges.map((e: TeamWorkflowEdge) => {
    const mode = typeof e.data?.mode === 'string' ? e.data.mode : 'direct';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      label: mode,
      ...edgeVisual(mode),
    };
  });
}

export function TeamDagCanvas({ workflow }: { workflow: TeamWorkflow }) {
  const nodes = useMemo(() => teamWorkflowToFlowNodes(workflow), [workflow]);
  const edges = useMemo(() => teamWorkflowToFlowEdges(workflow), [workflow]);

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
