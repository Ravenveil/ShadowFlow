/**
 * ProcessView — NeoHost「过程」tab（runs 投影露出，阶段 2.3）。
 *
 * 数据源（Python 经 proxyFallback，真实端点，不 mock）：
 *   - GET /api/runs/{id}/graph      → RunGraph（节点 status + control_flow 边）
 *   - GET /api/runs/{id}/task-tree  → TaskTreeProjection（run/task/step 缩进树）
 *
 * 渲染：graph → 左轨竖向节点列表（状态 dot + label + kind）+ 边 chips（A → B，
 * 带 condition 时附条件）；task-tree → 按 parent_id 组装的缩进树（entity 标签
 * + label + 状态 pill）。`active`（SSE 仍在流）时 5s 轮询刷新投影。
 *
 * 空态语义：runId 必有（NeoHost 已兜底）；投影 404/失败 → 错误条；
 * 节点为空 → 干净空态，不补占位。
 */
import { useEffect, useState } from 'react';
import { GitBranch, ListTree } from 'lucide-react';
import {
  getRunGraph,
  getTaskTree,
  type ProjectionNode,
  type RunGraph,
  type TaskTreeProjection,
} from '../../api/runs';
import { useI18n } from '../../common/i18n';

// ---------------------------------------------------------------------------
// 状态 → pill 样式（neo-host.css 新增的通用 modifier）
// ---------------------------------------------------------------------------

const NODE_STATUS_CLASS: Record<string, string> = {
  running: 'neo-host-pill--running',
  succeeded: 'neo-host-pill--ok',
  failed: 'neo-host-pill--err',
  pending: 'neo-host-pill--muted',
  skipped: 'neo-host-pill--muted',
  cancelled: 'neo-host-pill--muted',
  not_started: 'neo-host-pill--muted',
};

function statusClass(status: string | undefined): string {
  return NODE_STATUS_CLASS[status ?? ''] ?? 'neo-host-pill--muted';
}

// ---------------------------------------------------------------------------
// task-tree：parent_id → 缩进树
// ---------------------------------------------------------------------------

function buildChildren(nodes: ProjectionNode[]): Map<string, ProjectionNode[]> {
  const ids = new Set(nodes.map((n) => n.id));
  const byParent = new Map<string, ProjectionNode[]>();
  for (const n of nodes) {
    const pid = n.parent_id && ids.has(n.parent_id) ? n.parent_id : '';
    const list = byParent.get(pid);
    if (list) list.push(n);
    else byParent.set(pid, [n]);
  }
  return byParent;
}

const ENTITY_TAG_KEY: Record<string, string> = {
  run: 'neo.host.proc.entityRun',
  task: 'neo.host.proc.entityTask',
  step: 'neo.host.proc.entityStep',
};

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export interface ProcessViewProps {
  runId: string;
  /** SSE 仍在流（useRunSession.isStreaming）→ 5s 轮询投影。 */
  active: boolean;
}

export function ProcessView({ runId, active }: ProcessViewProps) {
  const { t } = useI18n();
  const [graph, setGraph] = useState<RunGraph | null>(null);
  const [tree, setTree] = useState<TaskTreeProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      // 两个投影独立结算：一个 404/失败不拖垮另一个。
      Promise.all([
        getRunGraph(runId).then(
          (g) => ({ g }),
          () => ({ g: null }),
        ),
        getTaskTree(runId).then(
          (tr) => ({ tr }),
          () => ({ tr: null }),
        ),
      ])
        .then(([a, b]) => {
          if (cancelled) return;
          setGraph(a.g);
          setTree(b.tr);
          setError(a.g === null && b.tr === null ? 'both' : null);
          setLoaded(true);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
          setLoaded(true);
        });
    };
    setLoaded(false);
    setError(null);
    load();
    if (!active) return () => { cancelled = true; };
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId, active]);

  // ── graph 节点排序：entrypoint 优先，其次 step index，保持原始相对顺序 ──
  const graphNodes = graph
    ? [...graph.nodes].sort(
        (a, b) =>
          Number(b.entrypoint) - Number(a.entrypoint) ||
          (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER),
      )
    : [];
  const graphLabelById = new Map(graphNodes.map((n) => [n.id, n.label || n.id]));

  const treeRoots = tree ? (buildChildren(tree.nodes).get('') ?? []) : [];
  const treeChildren = tree ? buildChildren(tree.nodes) : new Map<string, ProjectionNode[]>();

  const renderTreeNode = (node: ProjectionNode, depth: number): React.ReactNode => {
    const kids = treeChildren.get(node.id) ?? [];
    const pad = 8 + depth * 14;
    return (
      <div key={node.id}>
        <div className="neo-host-ptree-row" style={{ paddingLeft: pad }}>
          <span className="neo-host-ptree-tag">
            {t(ENTITY_TAG_KEY[node.entity_type] ?? 'neo.host.proc.entityNode', {
              defaultValue: node.entity_type,
            })}
          </span>
          <span className="neo-host-ptree-label" title={node.id}>
            {node.label || node.id}
          </span>
          {node.status && (
            <span className={`neo-host-pill ${statusClass(node.status)}`}>{node.status}</span>
          )}
        </div>
        {kids.map((k) => renderTreeNode(k, depth + 1))}
      </div>
    );
  };

  const hasGraph = graphNodes.length > 0;
  const hasTree = treeRoots.length > 0;

  return (
    <div className="neo-host-list">
      {error ? (
        <div className="neo-host-empty neo-host-empty--fill">
          {t('neo.host.procError', { defaultValue: '该运行暂无可视化过程数据' })}
        </div>
      ) : !loaded ? (
        <div className="neo-host-tree-note neo-host-tree-note--pad">
          {t('neo.host.loading', { defaultValue: '读取中…' })}
        </div>
      ) : !hasGraph && !hasTree ? (
        <div className="neo-host-empty neo-host-empty--fill">
          {t('neo.host.procEmpty', { defaultValue: '该运行暂无过程投影' })}
        </div>
      ) : (
        <>
          {/* 执行图：节点轨 + 边 chips */}
          {hasGraph && (
            <div className="neo-host-sec">
              <div className="neo-host-sec-head">
                <GitBranch size={12} strokeWidth={1.8} />
                <span className="neo-host-sec-title">
                  {t('neo.host.procGraph', { defaultValue: '执行图' })}
                </span>
                <span className="neo-host-sec-meta">
                  {t('neo.host.procGraphMeta', {
                    defaultValue: '{{nodes}} 节点 · {{edges}} 边',
                    nodes: graphNodes.length,
                    edges: graph?.edges.length ?? 0,
                  })}
                </span>
              </div>
              <div className="neo-host-pgraph">
                {graphNodes.map((n) => (
                  <div key={n.id} className="neo-host-pgraph-node">
                    <span
                      className={`neo-host-pgraph-dot neo-host-pgraph-dot--${n.status}`}
                      aria-hidden
                    />
                    <span className="neo-host-pgraph-label" title={n.id}>
                      {n.label || n.id}
                    </span>
                    <span className="neo-host-pgraph-kind">{n.kind || n.type}</span>
                    <span className={`neo-host-pill ${statusClass(n.status)}`}>{n.status}</span>
                  </div>
                ))}
              </div>
              {graph && graph.edges.length > 0 && (
                <div className="neo-host-pgraph-edges">
                  {graph.edges.map((e, i) => (
                    <span
                      key={`${e.from_id}->${e.to_id}-${i}`}
                      className="neo-host-edge-chip"
                      title={e.condition ?? e.edge_type ?? e.type}
                    >
                      {graphLabelById.get(e.from_id) ?? e.from_id}
                      <span className="neo-host-edge-arrow">→</span>
                      {graphLabelById.get(e.to_id) ?? e.to_id}
                      {e.condition ? <span className="neo-host-edge-cond">{e.condition}</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 任务树：缩进树 */}
          {hasTree && (
            <div className="neo-host-sec">
              <div className="neo-host-sec-head">
                <ListTree size={12} strokeWidth={1.8} />
                <span className="neo-host-sec-title">
                  {t('neo.host.procTree', { defaultValue: '任务树' })}
                </span>
              </div>
              <div className="neo-host-ptree">{treeRoots.map((n) => renderTreeNode(n, 0))}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ProcessView;
