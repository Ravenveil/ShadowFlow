/**
 * RunsPage — /runs (list) + /runs/:runId (detail with 6 projection tabs)
 *
 * UI PROTECTION: 只能加，不能删。新增独立路由 /runs 和 /runs/:runId。
 *
 * 功能:
 *   /runs          → 列出所有 Run，可点击进入详情
 *   /runs/:runId   → Tabs 切换 6 种投影视图:
 *                    - RunGraph (ReactFlow DAG)
 *                    - TaskTree (嵌套树)
 *                    - ArtifactLineage (ReactFlow ellipse nodes)
 *                    - MemoryGraph (ReactFlow)
 *                    - CheckpointLineage (ReactFlow)
 *                    - TrainingDataset (表格)
 *
 * UI5.0（页面批A）:全页去暗色硬编码（bg-shadowflow-* / text-white/* / zinc 暗色
 * tint），改为 var(--t-*) 主题变量 —— day=clawsgo 中性浅色、night 保持深色。
 * 状态 pill 中性化：彩色只留 5px 状态点。仅样式层改动，数据流/testid/文案不变。
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  listRuns,
  getRunGraph,
  getTaskTree,
  getArtifactLineage,
  getMemoryGraph,
  getCheckpointLineage,
  getActivationTrainingDataset,
  RunsApiError,
} from '../api/runs';
import type {
  RunRecord,
  RunGraph,
  TaskTreeProjection,
  ArtifactLineageProjection,
  MemoryRelationProjection,
  CheckpointLineageProjection,
  ActivationTrainingDataset,
  ProjectionNode,
  ProjectionEdge,
} from '../api/runs';
// UI5.0 — 页面批A共享视觉层
import ui5 from './ui5-pages.module.css';


// ---------------------------------------------------------------------------
// Status pill — UI5.0: 中性 chip + 小面积状态点（蓝/绿/黄/红只用于圆点）
// ---------------------------------------------------------------------------

const STATUS_DOTS: Record<string, string> = {
  succeeded:        'var(--t-ok)',
  completed:        'var(--t-ok)',
  failed:           'var(--t-err)',
  error:            'var(--t-err)',
  running:          'var(--t-run)',
  checkpointed:     'var(--t-warn)',
  awaiting_approval:'var(--t-warn)',
  waiting:          'var(--t-warn)',
  waiting_user:     'var(--t-warn)',
  skipped:          'var(--t-fg-5)',
  cancelled:        'var(--t-fg-4)',
  paused:           'var(--t-fg-4)',
  accepted:         'var(--t-fg-4)',
  validated:        'var(--t-fg-4)',
  not_started:      'var(--t-fg-4)',
  pending:          'var(--t-fg-4)',
};

function StatusPill({ status }: { status: string }) {
  const dot = STATUS_DOTS[status] ?? 'var(--t-fg-4)';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px]"
      style={{
        background: 'var(--t-panel-2)',
        borderColor: 'var(--t-border)',
        color: 'var(--t-fg-3)',
      }}
    >
      <span
        style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: dot, display: 'inline-block' }}
        aria-hidden
      />
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers: date formatting
// ---------------------------------------------------------------------------

// Story 15.8 — RunsListPage moved to relative-time only; legacy helpers are
// preserved (CLAUDE.md "只能加，不能删") with a `_` prefix so noUnusedLocals
// stays happy and future callers can still import them.
export function _fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

export function _fmtDuration(start: string, end?: string): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Story 15.8 — relative-time formatter for completed_at column. */
function fmtRelative(iso?: string): string {
  if (!iso) return '—';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diff)) return '—';
    const s = Math.max(0, Math.floor(diff / 1000));
    if (s < 60) return '刚刚';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = Math.floor(h / 24);
    return `${d} 天前`;
  } catch {
    return '—';
  }
}

// UI5.0: 产物 badge 中性化（类型只读信息，不再铺彩色 tint）
function ArtifactBadge({ type }: { type: string }) {
  return (
    <span
      data-testid={`run-artifact-badge-${type}`}
      className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase"
      style={{
        background: 'var(--t-panel-2)',
        borderColor: 'var(--t-border)',
        color: 'var(--t-fg-3)',
      }}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Error + Retry banner
// ---------------------------------------------------------------------------

function ErrorBanner({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      role="alert"
      style={{
        borderColor: 'color-mix(in oklab, var(--t-err) 35%, transparent)',
        background: 'color-mix(in oklab, var(--t-err) 8%, transparent)',
        color: 'var(--t-err)',
      }}
    >
      {msg}
      <button onClick={onRetry} className="ml-3 underline" style={{ color: 'var(--t-err)' }}>
        重试
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-20 text-sm" style={{ color: 'var(--t-fg-4)' }}>
      加载中…
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — UI5.0: 排版+图标空态，软瓷贴 + 大留白（不引图片资源）
// ---------------------------------------------------------------------------

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center border"
        style={{
          borderRadius: 16,
          borderColor: 'var(--t-border)',
          background: 'var(--t-panel-3)',
          color: 'var(--t-fg-4)',
        }}
      >
        <Inbox size={24} strokeWidth={1.5} aria-hidden />
      </div>
      <p className="text-sm" style={{ color: 'var(--t-fg-3)' }}>{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReactFlow projection graph helper
// ---------------------------------------------------------------------------

/** Convert ProjectionNode[] + ProjectionEdge[] into ReactFlow nodes/edges */
function toReactFlowProjection(
  nodes: ProjectionNode[],
  edges: ProjectionEdge[],
  opts: { ellipseTypes?: string[] } = {},
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const COLS = 4;
  const COL_W = 200;
  const ROW_H = 120;

  const rfNodes: Node[] = nodes.map((n, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const isEllipse = opts.ellipseTypes?.includes(n.entity_type) ?? false;
    return {
      id: n.id,
      position: { x: col * COL_W + 40, y: row * ROW_H + 40 },
      data: {
        label: (
          <div className="flex flex-col gap-0.5 text-[10px]">
            <span className="font-medium truncate max-w-[130px]" style={{ color: 'var(--t-fg)' }}>{n.label}</span>
            <span style={{ color: 'var(--t-fg-4)' }}>{n.entity_type}</span>
            {n.status && <StatusPill status={n.status} />}
          </div>
        ),
      },
      // UI5.0: 节点卡片主题化（原写死 #1A1A1A/#27272A）
      style: {
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: isEllipse ? '50%' : '10px',
        color: 'var(--t-fg)',
        fontSize: '11px',
        minWidth: isEllipse ? 120 : 150,
        minHeight: isEllipse ? 80 : undefined,
        padding: '8px 10px',
      },
      type: 'default',
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.from_id,
    target: e.to_id,
    label: e.edge_type,
    // marker 的 color 走 SVG attribute 不解析 var()，用双主题都可见的中灰
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' },
    style: { stroke: 'var(--t-border-2, var(--t-border))' },
    labelStyle: { fontSize: 9, fill: 'var(--t-fg-4)' },
    type: 'default',
  }));

  return { rfNodes, rfEdges };
}

// ---------------------------------------------------------------------------
// ProjectionGraphView — shared ReactFlow canvas for projection graphs
// ---------------------------------------------------------------------------

function ProjectionGraphView({
  nodes,
  edges,
  ellipseTypes,
}: {
  nodes: ProjectionNode[];
  edges: ProjectionEdge[];
  ellipseTypes?: string[];
}) {
  const { rfNodes, rfEdges } = toReactFlowProjection(nodes, edges, { ellipseTypes });

  if (rfNodes.length === 0) {
    return <EmptyState label="该 Run 没有此类投影数据" />;
  }

  return (
    <div
      style={{ height: 520, background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 14, overflow: 'hidden' }}
      className="w-full"
      data-testid="projection-flow-canvas"
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.3}
        maxZoom={2}
      >
        <Controls className={ui5.rfControls} />
        <Background variant={BackgroundVariant.Dots} color="var(--t-border)" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RunGraph view — special type from RunGraphNode
// ---------------------------------------------------------------------------

function RunGraphView({ data }: { data: RunGraph }) {
  if (data.nodes.length === 0) {
    return <EmptyState label="该 Run 的执行图为空" />;
  }

  const COLS = 4;
  const COL_W = 210;
  const ROW_H = 130;

  const rfNodes: Node[] = data.nodes.map((n, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      id: n.id,
      position: { x: col * COL_W + 40, y: row * ROW_H + 40 },
      data: {
        label: (
          <div className="flex flex-col gap-0.5 text-[10px]">
            <span className="font-semibold truncate max-w-[140px]" style={{ color: 'var(--t-fg)' }}>{n.label}</span>
            <span style={{ color: 'var(--t-fg-4)' }}>{n.kind} / {n.type}</span>
            <StatusPill status={n.status} />
            {n.entrypoint && (
              // UI5.0: 紫 badge → accent 蓝小 chip（唯一关键 accent）
              <span
                className="rounded border px-1 text-[9px]"
                style={{
                  borderColor: 'color-mix(in oklab, var(--t-accent) 35%, transparent)',
                  background: 'var(--t-accent-tint)',
                  color: 'var(--t-accent)',
                }}
              >
                entrypoint
              </span>
            )}
          </div>
        ),
      },
      style: {
        background: 'var(--t-panel)',
        border: n.entrypoint ? '1px solid var(--t-accent)' : '1px solid var(--t-border)',
        borderRadius: '10px',
        color: 'var(--t-fg)',
        fontSize: '11px',
        minWidth: 160,
        padding: '8px 10px',
      },
      type: 'default',
    };
  });

  const rfEdges: Edge[] = data.edges.map((e, i) => ({
    id: `edge-${i}`,
    source: e.from_id,
    target: e.to_id,
    label: e.edge_type ?? e.type,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' },
    style: { stroke: e.intervention ? 'var(--t-warn)' : 'var(--t-border-2, var(--t-border))' },
    labelStyle: { fontSize: 9, fill: 'var(--t-fg-4)' },
    type: 'default',
  }));

  return (
    <div
      style={{ height: 520, background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 14, overflow: 'hidden' }}
      className="w-full"
      data-testid="run-graph-canvas"
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.3}
        maxZoom={2}
      >
        <Controls className={ui5.rfControls} />
        <Background variant={BackgroundVariant.Dots} color="var(--t-border)" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskTree view — nested indented list
// ---------------------------------------------------------------------------

interface TreeNode extends ProjectionNode {
  children: TreeNode[];
}

function buildTree(nodes: ProjectionNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
  const roots: TreeNode[] = [];
  nodes.forEach((n) => {
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(map.get(n.id)!);
    } else {
      roots.push(map.get(n.id)!);
    }
  });
  return roots;
}

function TaskTreeNode({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div
        className={`flex items-center gap-2 rounded px-2 py-1.5 ${ui5.rowHover}`}
        data-testid={`task-tree-node-${node.id}`}
      >
        <span className="font-mono text-[10px]" style={{ color: 'var(--t-fg-5)' }}>
          {depth > 0 ? '└ ' : ''}
        </span>
        <span className="flex-1 text-xs truncate" style={{ color: 'var(--t-fg-2)' }}>{node.label}</span>
        <span className="text-[10px]" style={{ color: 'var(--t-fg-5)' }}>{node.entity_type}</span>
        {node.status && <StatusPill status={node.status} />}
      </div>
      {node.children.map((child) => (
        <TaskTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function TaskTreeView({ data }: { data: TaskTreeProjection }) {
  if (data.nodes.length === 0) {
    return <EmptyState label="该 Run 的任务树为空" />;
  }
  const roots = buildTree(data.nodes);
  return (
    <div
      className="rounded-[14px] border p-3"
      style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel)' }}
      data-testid="task-tree-view"
    >
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-fg-4)' }}>
          Task Tree
        </span>
        <span className="text-[10px]" style={{ color: 'var(--t-fg-4)' }}>
          {data.nodes.length} 节点 / {data.edges.length} 边
        </span>
      </div>
      <div className={ui5.themedDivide}>
        {roots.map((root) => (
          <TaskTreeNode key={root.id} node={root} depth={0} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrainingDataset view — table
// ---------------------------------------------------------------------------

function TrainingDatasetView({ data }: { data: ActivationTrainingDataset }) {
  if (data.samples.length === 0) {
    return <EmptyState label="该 Run 没有 Activation 训练样本" />;
  }

  return (
    <div
      className="overflow-x-auto rounded-[14px] border"
      style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel)' }}
      data-testid="training-dataset-view"
    >
      <div className="px-4 py-2 flex gap-4 items-center" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-fg-4)' }}>
          Training Dataset
        </span>
        <span className="text-[10px]" style={{ color: 'var(--t-fg-4)' }}>
          {data.samples.length} 样本
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--t-border)', color: 'var(--t-fg-4)', textAlign: 'left' }}>
            {['sample_id', 'node_id', 'step_status', 'activation_mode', 'activation_decision', 'candidates'].map((h) => (
              <th key={h} className="px-3 py-2 font-mono font-normal whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className={ui5.themedDivide}>
          {data.samples.map((s) => (
            <tr key={s.sample_id} className={`transition-colors ${ui5.rowHover}`}
                data-testid={`dataset-row-${s.sample_id}`}>
              <td className="px-3 py-2 font-mono max-w-[120px] truncate" style={{ color: 'var(--t-fg-4)' }}>{s.sample_id}</td>
              <td className="px-3 py-2 font-mono max-w-[120px] truncate" style={{ color: 'var(--t-fg-2)' }}>{s.node_id}</td>
              <td className="px-3 py-2"><StatusPill status={s.step_status} /></td>
              <td className="px-3 py-2" style={{ color: 'var(--t-fg-3)' }}>{s.activation_mode}</td>
              <td className="px-3 py-2"><StatusPill status={s.activation_decision} /></td>
              <td className="px-3 py-2" style={{ color: 'var(--t-fg-4)' }}>{s.candidate_count} ({s.selected_candidate_count} selected)</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projection tabs config
// ---------------------------------------------------------------------------

type TabKey = 'graph' | 'task-tree' | 'artifact-lineage' | 'memory-graph' | 'checkpoint-lineage' | 'training-dataset';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'graph',               label: 'Run Graph' },
  { key: 'task-tree',           label: 'Task Tree' },
  { key: 'artifact-lineage',    label: 'Artifact Lineage' },
  { key: 'memory-graph',        label: 'Memory Graph' },
  { key: 'checkpoint-lineage',  label: 'Checkpoint Lineage' },
  { key: 'training-dataset',    label: 'Training Dataset' },
];

// ---------------------------------------------------------------------------
// Generic projection panel — fetches + displays
// ---------------------------------------------------------------------------

type ProjectionState<T> = { status: 'idle' | 'loading' | 'success' | 'error'; data?: T; error?: string };

function useProjection<T>(fetcher: () => Promise<T>, active: boolean) {
  const [state, setState] = useState<ProjectionState<T>>({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await fetcher();
      setState({ status: 'success', data });
    } catch (err) {
      const msg = err instanceof RunsApiError
        ? (err.status === 404 ? 'Run 不存在或该投影无数据' : `API 错误 (${err.status})`)
        : '加载失败，请重试';
      setState({ status: 'error', error: msg });
    }
  }, [fetcher]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  return { state, reload: load };
}

// ---------------------------------------------------------------------------
// RunDetailPage — /runs/:runId
// ---------------------------------------------------------------------------

// Inner component — receives validated runId, all hooks unconditional
function RunDetailInner({ runId }: { runId: string }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('graph');

  // Stable fetcher references keyed on runId
  const fetchGraph = useCallback(() => getRunGraph(runId), [runId]);
  const fetchTask  = useCallback(() => getTaskTree(runId), [runId]);
  const fetchArt   = useCallback(() => getArtifactLineage(runId), [runId]);
  const fetchMem   = useCallback(() => getMemoryGraph(runId), [runId]);
  const fetchCkpt  = useCallback(() => getCheckpointLineage(runId), [runId]);
  const fetchTd    = useCallback(() => getActivationTrainingDataset(runId), [runId]);

  const graphState = useProjection<RunGraph>(fetchGraph, activeTab === 'graph');
  const taskState  = useProjection<TaskTreeProjection>(fetchTask, activeTab === 'task-tree');
  const artState   = useProjection<ArtifactLineageProjection>(fetchArt, activeTab === 'artifact-lineage');
  const memState   = useProjection<MemoryRelationProjection>(fetchMem, activeTab === 'memory-graph');
  const ckptState  = useProjection<CheckpointLineageProjection>(fetchCkpt, activeTab === 'checkpoint-lineage');
  const tdState    = useProjection<ActivationTrainingDataset>(fetchTd, activeTab === 'training-dataset');

  function renderPanel() {
    switch (activeTab) {
      case 'graph': {
        const { state, reload } = graphState;
        if (state.status === 'loading' || state.status === 'idle') return <Spinner />;
        if (state.status === 'error') return <ErrorBanner msg={state.error!} onRetry={reload} />;
        return (
          <ReactFlowProvider>
            <RunGraphView data={state.data!} />
          </ReactFlowProvider>
        );
      }
      case 'task-tree': {
        const { state, reload } = taskState;
        if (state.status === 'loading' || state.status === 'idle') return <Spinner />;
        if (state.status === 'error') return <ErrorBanner msg={state.error!} onRetry={reload} />;
        return <TaskTreeView data={state.data!} />;
      }
      case 'artifact-lineage': {
        const { state, reload } = artState;
        if (state.status === 'loading' || state.status === 'idle') return <Spinner />;
        if (state.status === 'error') return <ErrorBanner msg={state.error!} onRetry={reload} />;
        return (
          <ReactFlowProvider>
            <ProjectionGraphView
              nodes={state.data!.nodes}
              edges={state.data!.edges}
              ellipseTypes={['artifact']}
            />
          </ReactFlowProvider>
        );
      }
      case 'memory-graph': {
        const { state, reload } = memState;
        if (state.status === 'loading' || state.status === 'idle') return <Spinner />;
        if (state.status === 'error') return <ErrorBanner msg={state.error!} onRetry={reload} />;
        return (
          <ReactFlowProvider>
            <ProjectionGraphView
              nodes={state.data!.nodes}
              edges={state.data!.edges}
              ellipseTypes={['memory_event']}
            />
          </ReactFlowProvider>
        );
      }
      case 'checkpoint-lineage': {
        const { state, reload } = ckptState;
        if (state.status === 'loading' || state.status === 'idle') return <Spinner />;
        if (state.status === 'error') return <ErrorBanner msg={state.error!} onRetry={reload} />;
        return (
          <ReactFlowProvider>
            <ProjectionGraphView
              nodes={state.data!.nodes}
              edges={state.data!.edges}
              ellipseTypes={['checkpoint']}
            />
          </ReactFlowProvider>
        );
      }
      case 'training-dataset': {
        const { state, reload } = tdState;
        if (state.status === 'loading' || state.status === 'idle') return <Spinner />;
        if (state.status === 'error') return <ErrorBanner msg={state.error!} onRetry={reload} />;
        return <TrainingDatasetView data={state.data!} />;
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--t-bg)', color: 'var(--t-fg)' }}>
      {/* Header */}
      <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <button
            onClick={() => navigate('/runs')}
            className="text-sm transition-colors"
            style={{ color: 'var(--t-fg-4)' }}
            data-testid="back-to-runs"
          >
            ← Runs
          </button>
          <div className="h-4 w-px" style={{ background: 'var(--t-border)' }} />
          <div className="min-w-0">
            <h1 className="font-mono text-sm truncate" style={{ color: 'var(--t-fg-2)' }} data-testid="run-detail-id">
              {runId}
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--t-fg-5)' }}>Run 详情 — 6 种投影视图</p>
          </div>
        </div>
      </div>

      {/* Tab bar — UI5.0: accent 下划线只给激活 tab（原 text-accent/border-accent
          类全站不存在，是死样式，改为真实主题变量） */}
      <div className="px-6" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div className="mx-auto max-w-6xl flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`tab-${tab.key}`}
              className="px-4 py-3 text-xs font-medium border-b-2 transition-colors"
              style={
                activeTab === tab.key
                  ? { borderColor: 'var(--t-accent)', color: 'var(--t-fg)' }
                  : { borderColor: 'transparent', color: 'var(--t-fg-4)' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Panel */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-6"
           data-testid="projection-panel">
        {renderPanel()}
      </div>
    </div>
  );
}

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  if (!runId) return <EmptyState label="Run ID 无效" />;
  return <RunDetailInner runId={runId} />;
}

// ---------------------------------------------------------------------------
// RunsListPage — /runs
// ---------------------------------------------------------------------------

/**
 * RunsListPage — Story 15.8.
 *
 * Renders RunRecord rows from GET /api/runs (run history persisted by
 * server/src/storage/runs.ts after each session completes). Columns:
 *   - Goal (truncated, 60ch)
 *   - Skill display name
 *   - Artifact type badge (html/yaml/markdown)
 *   - Status pill (completed/failed)
 *   - Completed-at relative time
 *   - Actions: 预览 (artifact_url) + 下载 (artifact download)
 *
 * The /runs/:runId detail page still consumes legacy projection endpoints,
 * so clicking a row continues to navigate there.
 */
export function RunsListPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    setLoadStatus('loading');
    setErrorMsg(null);
    try {
      const data = await listRuns();
      setRuns(data);
      setLoadStatus('success');
    } catch (err) {
      const msg = err instanceof RunsApiError
        ? `加载失败 (${err.status})`
        : '加载失败，请刷新重试';
      setErrorMsg(msg);
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--t-bg)', color: 'var(--t-fg)' }}>
      {/* Header */}
      <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--t-fg)', letterSpacing: '-0.01em' }}>Runs</h1>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--t-fg-4)' }}>
              历史执行记录，点击行查看 6 种投影详情。
            </p>
          </div>
          <button
            onClick={fetchRuns}
            disabled={loadStatus === 'loading'}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              borderColor: 'var(--t-border)',
              background: 'var(--t-panel)',
              color: 'var(--t-fg-2)',
            }}
            data-testid="refresh-runs-btn"
          >
            刷新
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-6 gap-4">
        {loadStatus === 'loading' && <Spinner />}

        {loadStatus === 'error' && (
          <ErrorBanner msg={errorMsg!} onRetry={fetchRuns} />
        )}

        {loadStatus === 'success' && runs.length === 0 && (
          <EmptyState label="还没有任何 Run，先在首页运行一个目标。" />
        )}

        {loadStatus === 'success' && runs.length > 0 && (
          <div
            className="overflow-x-auto rounded-[14px] border"
            style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel)' }}
            data-testid="runs-table"
          >
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--t-border)', color: 'var(--t-fg-4)', textAlign: 'left' }}>
                  {['目标', 'Skill', '产物', '状态', '时间', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 font-mono font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={ui5.themedDivide}>
                {runs.map((run) => {
                  const goalShort = run.goal.length > 60 ? run.goal.slice(0, 60) + '…' : run.goal;
                  return (
                    <tr
                      key={run.run_id}
                      className={`cursor-pointer transition-colors ${ui5.rowHover}`}
                      onClick={() => navigate(`/runs/${encodeURIComponent(run.run_id)}`)}
                      data-testid={`run-row-${run.run_id}`}
                    >
                      <td
                        className="px-4 py-3 max-w-[300px] truncate"
                        style={{ color: 'var(--t-fg-2)' }}
                        data-testid={`run-goal-${run.run_id}`}
                        title={run.goal}
                      >
                        {goalShort}
                      </td>
                      <td
                        className="px-4 py-3 max-w-[160px] truncate"
                        style={{ color: 'var(--t-fg-3)' }}
                        data-testid={`run-skill-${run.run_id}`}
                      >
                        {run.skill_display_name}
                      </td>
                      <td className="px-4 py-3">
                        {run.artifact_type ? <ArtifactBadge type={run.artifact_type} /> : (
                          <span style={{ color: 'var(--t-fg-5)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={run.status} />
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: 'var(--t-fg-4)' }}
                        data-testid={`run-time-${run.run_id}`}
                      >
                        {fmtRelative(run.completed_at)}
                      </td>
                      <td
                        className="px-4 py-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {run.artifact_url ? (
                          <span className="inline-flex items-center gap-3">
                            <a
                              href={run.artifact_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] hover:underline"
                              style={{ color: 'var(--t-accent)' }}
                              data-testid={`run-preview-${run.run_id}`}
                            >
                              预览
                            </a>
                            <a
                              href={run.artifact_url}
                              download={run.artifact_filename ?? undefined}
                              className="text-[11px] hover:underline"
                              style={{ color: 'var(--t-fg-4)' }}
                              data-testid={`run-download-${run.run_id}`}
                            >
                              下载
                            </a>
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'var(--t-fg-5)' }}>无产物</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default RunsListPage;
