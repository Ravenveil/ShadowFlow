/**
 * ProcessDagCanvas — 「过程」tab 的 DAG 执行画布（2026-08-19 复活）。
 *
 * 血统：react-flow 画布曾三套并用（BlueprintCanvas / WorkflowCanvas /
 * TeamWorkflowEditor，合并于 d6260be 的 SfReactFlowBase，始作于 0f1d0c8），
 * Neo 大清除（0badada）时随旧页面下线。本组件按「执行」语义复活：
 *   - 节点 = GET /runs/:id/graph 投影（状态染色 + entrypoint 标记 +
 *     迭代环徽标——loop 是 DAG 的一部分，2026-08-19 导航架构统一批）
 *   - 边 = control_flow（条件标签；指向迭代环节点的边虚线示意环回）
 *   - 布局 = 旧版最长路径分层（computeColumns 同构），无 dagre 依赖；
 *     拖拽位置跨 5s 刷新保留（position ref 按 node id 记忆）
 *   - 流式期间运行中节点的出入边 animated（react-flow 自带蚂蚁线）
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
} from 'reactflow';
import SfReactFlowBase from '../../core/components/Canvas/SfReactFlowBase';
import type { RunGraph, RunGraphNode } from '../../api/runs';

const COL_GAP = 80;
const ROW_GAP = 26;

interface LoopMeta {
  loop_status?: string;
  loop_iterations?: number;
  loop_converged?: boolean;
}

interface ProcNodeData extends Record<string, unknown> {
  label: string;
  kind: string;
  status: string;
  entrypoint: boolean;
  loop?: LoopMeta | null;
}

const HANDLE_STYLE = { background: 'transparent', border: 'none' } as const;

const NODE_TYPES: NodeTypes = { proc: ProcNode };

function ProcNode({ data }: { data: ProcNodeData }) {
  return (
    <div className={`neo-pdag-node neo-pdag-node--${data.status}${data.entrypoint ? ' neo-pdag-node--entry' : ''}`}>
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <span className="neo-pdag-node-dot" aria-hidden />
      <span className="neo-pdag-node-label" title={data.label}>
        {data.label}
      </span>
      <span className="neo-pdag-node-kind">{data.kind}</span>
      {data.loop && (
        <span
          className={`neo-pdag-node-loop${data.loop.loop_converged ? ' neo-pdag-node-loop--ok' : ''}`}
          title={`迭代环：${data.loop.loop_iterations ?? 0} 轮${data.loop.loop_converged ? ' · 已收敛' : ''}`}
        >
          ⟳ {data.loop.loop_iterations ?? 0}
        </span>
      )}
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
}

/** 最长路径分层（与旧 BlueprintCanvas.computeColumns 同构；环安全=visited 宽松）。 */
function computeColumns(nodes: RunGraphNode[], edges: { from_id: string; to_id: string }[]): Map<string, number> {
  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};
  for (const n of nodes) {
    incoming[n.id] = [];
    outgoing[n.id] = [];
  }
  for (const e of edges) {
    if (incoming[e.to_id]) incoming[e.to_id].push(e.from_id);
    if (outgoing[e.from_id]) outgoing[e.from_id].push(e.to_id);
  }
  const col = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if ((incoming[n.id] ?? []).length === 0) {
      col.set(n.id, 0);
      queue.push(n.id);
    }
  }
  const guard = nodes.length * 4 + 8;
  let steps = 0;
  while (queue.length && steps++ < guard) {
    const id = queue.shift()!;
    const c = col.get(id) ?? 0;
    for (const next of outgoing[id] ?? []) {
      const prev = col.get(next);
      if (prev === undefined || prev < c + 1) {
        col.set(next, c + 1);
        queue.push(next);
      }
    }
  }
  for (const n of nodes) {
    if (!col.has(n.id)) col.set(n.id, 0);
  }
  return col;
}

export function ProcessDagCanvas({ graph, streaming }: { graph: RunGraph; streaming: boolean }) {
  // 拖拽位置记忆：5s 轮询刷新时已见节点保持用户摆的位置，新节点才用布局种子位。
  const posRef = useRef(new Map<string, { x: number; y: number }>());

  const rfNodesSeed = useMemo(() => {
    const cols = computeColumns(graph.nodes, graph.edges);
    const buckets = new Map<number, RunGraphNode[]>();
    for (const n of graph.nodes) {
      const c = cols.get(n.id) ?? 0;
      const arr = buckets.get(c) ?? [];
      arr.push(n);
      buckets.set(c, arr);
    }
    return graph.nodes.map<Node<ProcNodeData>>((n) => {
      const c = cols.get(n.id) ?? 0;
      const row = (buckets.get(c) ?? []).indexOf(n);
      const seed = { x: c * COL_GAP, y: row * ROW_GAP };
      const loop = (n.metadata as { loop?: LoopMeta | null } | undefined)?.loop ?? null;
      return {
        id: n.id,
        type: 'proc',
        position: posRef.current.get(n.id) ?? seed,
        data: {
          label: n.label || n.id,
          kind: n.kind || n.type,
          status: n.status,
          entrypoint: n.entrypoint,
          loop,
        },
      };
    });
  }, [graph]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<ProcNodeData>(rfNodesSeed);

  // 记忆位置（用户拖动后 onNodesChange 更新 rfNodes，这里同步回 ref）
  useEffect(() => {
    for (const n of rfNodes) posRef.current.set(n.id, n.position);
  }, [rfNodes]);

  useEffect(() => {
    setRfNodes(rfNodesSeed);
  }, [rfNodesSeed, setRfNodes]);

  const loopNodeIds = useMemo(
    () =>
      new Set(
        graph.nodes
          .filter((n) => (n.metadata as { loop?: unknown } | undefined)?.loop)
          .map((n) => n.id),
      ),
    [graph.nodes],
  );
  const runningIds = useMemo(
    () => new Set(graph.nodes.filter((n) => n.status === 'running').map((n) => n.id)),
    [graph.nodes],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e, i) => ({
        id: `${e.from_id}->${e.to_id}-${i}`,
        source: e.from_id,
        target: e.to_id,
        type: 'smoothstep',
        label: e.condition ?? undefined,
        animated: streaming && (runningIds.has(e.from_id) || runningIds.has(e.to_id)),
        className: loopNodeIds.has(e.to_id) || loopNodeIds.has(e.from_id) ? 'neo-pdag-edge-loop' : undefined,
      })),
    [graph.edges, streaming, runningIds, loopNodeIds],
  );
  const [rfEdgesState, setRfEdgesState, onEdgesChange] = useEdgesState(rfEdges);
  useEffect(() => {
    setRfEdgesState(rfEdges);
  }, [rfEdges, setRfEdgesState]);

  return (
    <SfReactFlowBase
      nodes={rfNodes}
      edges={rfEdgesState}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitViewOnNodeCountGrow
      className="neo-pdag"
    />
  );
}
