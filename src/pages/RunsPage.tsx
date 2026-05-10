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


// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  succeeded:        'bg-emerald-900/40 text-emerald-400 border-emerald-800/50',
  failed:           'bg-red-900/40 text-red-400 border-red-800/50',
  running:          'bg-blue-900/40 text-blue-400 border-blue-800/50',
  cancelled:        'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
  checkpointed:     'bg-amber-900/40 text-amber-400 border-amber-800/50',
  awaiting_approval:'bg-cyan-900/40 text-cyan-400 border-cyan-800/50',
  waiting:          'bg-purple-900/40 text-purple-400 border-purple-800/50',
  waiting_user:     'bg-purple-900/40 text-purple-400 border-purple-800/50',
  paused:           'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
  accepted:         'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
  validated:        'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
  not_started:      'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
  pending:          'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
  skipped:          'bg-zinc-800/40 text-zinc-500 border-zinc-700/40',
};

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50';
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>
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

const ARTIFACT_BADGE_CLS: Record<string, string> = {
  html:     'bg-blue-900/40 text-blue-300 border-blue-800/50',
  yaml:     'bg-amber-900/40 text-amber-300 border-amber-800/50',
  markdown: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50',
};

function ArtifactBadge({ type }: { type: string }) {
  const cls = ARTIFACT_BADGE_CLS[type] ?? 'bg-zinc-800/60 text-zinc-300 border-zinc-700/50';
  return (
    <span
      data-testid={`run-artifact-badge-${type}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${cls}`}
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
    <div className="rounded border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
         role="alert">
      {msg}
      <button onClick={onRetry} className="ml-3 underline hover:text-red-300">
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
    <div className="flex flex-1 items-center justify-center py-20 text-sm text-white/40">
      加载中…
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-shadowflow-border bg-white/5 text-white/30">
        <Inbox size={24} strokeWidth={1.5} aria-hidden />
      </div>
      <p className="text-sm text-white/50">{label}</p>
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
            <span className="font-medium text-white/90 truncate max-w-[130px]">{n.label}</span>
            <span className="text-white/40">{n.entity_type}</span>
            {n.status && <StatusPill status={n.status} />}
          </div>
        ),
      },
      style: {
        background: '#1A1A1A',
        border: '1px solid #27272A',
        borderRadius: isEllipse ? '50%' : '8px',
        color: '#FAFAFA',
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
    markerEnd: { type: MarkerType.ArrowClosed, color: '#52525B' },
    style: { stroke: '#3F3F46' },
    labelStyle: { fontSize: 9, fill: '#71717A' },
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
    <div style={{ height: 520 }} className="w-full rounded border border-shadowflow-border bg-[#0C0C10]"
         data-testid="projection-flow-canvas">
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
        <Controls className="[&>button]:bg-shadowflow-surface [&>button]:border-shadowflow-border [&>button]:text-white/70" />
        <Background variant={BackgroundVariant.Dots} color="#27272A" gap={16} size={1} />
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
            <span className="font-semibold text-white/90 truncate max-w-[140px]">{n.label}</span>
            <span className="text-white/40">{n.kind} / {n.type}</span>
            <StatusPill status={n.status} />
            {n.entrypoint && (
              <span className="rounded border border-purple-700/50 bg-purple-900/30 px-1 text-[9px] text-purple-300">
                entrypoint
              </span>
            )}
          </div>
        ),
      },
      style: {
        background: '#1A1A1A',
        border: n.entrypoint ? '1px solid var(--t-accent)' : '1px solid #27272A',
        borderRadius: '8px',
        color: '#FAFAFA',
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
    markerEnd: { type: MarkerType.ArrowClosed, color: '#52525B' },
    style: { stroke: e.intervention ? '#F59E0B' : '#3F3F46' },
    labelStyle: { fontSize: 9, fill: '#71717A' },
    type: 'default',
  }));

  return (
    <div style={{ height: 520 }} className="w-full rounded border border-shadowflow-border bg-[#0C0C10]"
         data-testid="run-graph-canvas">
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
        <Controls className="[&>button]:bg-shadowflow-surface [&>button]:border-shadowflow-border [&>button]:text-white/70" />
        <Background variant={BackgroundVariant.Dots} color="#27272A" gap={16} size={1} />
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
        className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5"
        data-testid={`task-tree-node-${node.id}`}
      >
        <span className="text-white/20 font-mono text-[10px]">
          {depth > 0 ? '└ ' : ''}
        </span>
        <span className="flex-1 text-xs text-white/80 truncate">{node.label}</span>
        <span className="text-[10px] text-white/30">{node.entity_type}</span>
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
    <div className="rounded border border-shadowflow-border bg-shadowflow-surface p-3"
         data-testid="task-tree-view">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
          Task Tree
        </span>
        <span className="text-[10px] text-white/30">
          {data.nodes.length} 节点 / {data.edges.length} 边
        </span>
      </div>
      <div className="divide-y divide-shadowflow-border/50">
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
    <div className="overflow-x-auto rounded border border-shadowflow-border bg-shadowflow-surface"
         data-testid="training-dataset-view">
      <div className="px-4 py-2 border-b border-shadowflow-border flex gap-4 items-center">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
          Training Dataset
        </span>
        <span className="text-[10px] text-white/40">
          {data.samples.length} 样本
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-shadowflow-border text-white/40 text-left">
            {['sample_id', 'node_id', 'step_status', 'activation_mode', 'activation_decision', 'candidates'].map((h) => (
              <th key={h} className="px-3 py-2 font-mono font-normal whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-shadowflow-border/40">
          {data.samples.map((s) => (
            <tr key={s.sample_id} className="hover:bg-white/5 transition-colors"
                data-testid={`dataset-row-${s.sample_id}`}>
              <td className="px-3 py-2 font-mono text-white/50 max-w-[120px] truncate">{s.sample_id}</td>
              <td className="px-3 py-2 font-mono text-white/70 max-w-[120px] truncate">{s.node_id}</td>
              <td className="px-3 py-2"><StatusPill status={s.step_status} /></td>
              <td className="px-3 py-2 text-white/60">{s.activation_mode}</td>
              <td className="px-3 py-2"><StatusPill status={s.activation_decision} /></td>
              <td className="px-3 py-2 text-white/40">{s.candidate_count} ({s.selected_candidate_count} selected)</td>
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
    <div className="flex min-h-screen flex-col bg-shadowflow-bg text-white">
      {/* Header */}
      <div className="border-b border-shadowflow-border px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <button
            onClick={() => navigate('/runs')}
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
            data-testid="back-to-runs"
          >
            ← Runs
          </button>
          <div className="h-4 w-px bg-shadowflow-border" />
          <div className="min-w-0">
            <h1 className="font-mono text-sm text-white/70 truncate" data-testid="run-detail-id">
              {runId}
            </h1>
            <p className="mt-0.5 text-xs text-white/30">Run 详情 — 6 种投影视图</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-shadowflow-border px-6">
        <div className="mx-auto max-w-6xl flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`tab-${tab.key}`}
              className={[
                'px-4 py-3 text-xs font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-white/40 hover:text-white/70',
              ].join(' ')}
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
    <div className="flex min-h-screen flex-col bg-shadowflow-bg text-white">
      {/* Header */}
      <div className="border-b border-shadowflow-border px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white/90">Runs</h1>
            <p className="mt-0.5 text-xs text-white/40">
              历史执行记录，点击行查看 6 种投影详情。
            </p>
          </div>
          <button
            onClick={fetchRuns}
            disabled={loadStatus === 'loading'}
            className="rounded border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
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
            className="overflow-x-auto rounded border border-shadowflow-border bg-shadowflow-surface"
            data-testid="runs-table"
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-shadowflow-border text-white/40 text-left">
                  {['目标', 'Skill', '产物', '状态', '时间', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 font-mono font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-shadowflow-border/40">
                {runs.map((run) => {
                  const goalShort = run.goal.length > 60 ? run.goal.slice(0, 60) + '…' : run.goal;
                  return (
                    <tr
                      key={run.run_id}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => navigate(`/runs/${encodeURIComponent(run.run_id)}`)}
                      data-testid={`run-row-${run.run_id}`}
                    >
                      <td
                        className="px-4 py-3 text-white/80 max-w-[300px] truncate"
                        data-testid={`run-goal-${run.run_id}`}
                        title={run.goal}
                      >
                        {goalShort}
                      </td>
                      <td
                        className="px-4 py-3 text-white/60 max-w-[160px] truncate"
                        data-testid={`run-skill-${run.run_id}`}
                      >
                        {run.skill_display_name}
                      </td>
                      <td className="px-4 py-3">
                        {run.artifact_type ? <ArtifactBadge type={run.artifact_type} /> : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={run.status} />
                      </td>
                      <td
                        className="px-4 py-3 text-white/50 whitespace-nowrap"
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
                              className="text-accent text-[11px] hover:underline"
                              data-testid={`run-preview-${run.run_id}`}
                            >
                              预览
                            </a>
                            <a
                              href={run.artifact_url}
                              download={run.artifact_filename ?? undefined}
                              className="text-white/50 text-[11px] hover:text-white/80 hover:underline"
                              data-testid={`run-download-${run.run_id}`}
                            >
                              下载
                            </a>
                          </span>
                        ) : (
                          <span className="text-white/30 text-[11px]">无产物</span>
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
