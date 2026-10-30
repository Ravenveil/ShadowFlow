/**
 * KnowledgeGraphPage — 知识图谱可视化（2026-08-19，从 Shadow 搬迁）。
 *
 * 搬迁来源：Shadow 项目的 src/core/components/sidebar/KnowledgeGraphPanel.tsx
 * （ForceGraph2D 力导图 + graphAnalysis 分析层）。去 Tauri 化改造：
 *   - 数据源 invokeTauri → GET /api/knowledge/packs/:id/graph（LightRAG GraphML）
 *   - listenTauri 事件刷新 → 手动 Refresh + pack 切换
 *   - openKnowledgeBaseFile → 无（web 端暂不做源文件跳转）
 * graphAnalysis.ts（797 行）从 Shadow 原样拷贝，零改动复用
 * enrichGraphData / summarizeNodeNeighborhood / getCommunityColor。
 *
 * 2026-09-03 PackGraph 批：LightRAG 缺席时后端回退确定性图层（无 LLM 构图），
 * 本页新增 graph_backend 标识、受控词表冲突计数、图健康指标（密度/连通分量/
 * 孤岛/hub）与节点详情的内容级溯源（source_id + chunk_index + checksum）。
 *
 * 2026-09-03 Obsidian 化：canvas 自绘节点（社区色圆点 + 常显标签，低缩放
 * text fade 只留悬停上下文）、悬停 1 跳邻域高亮/其余淡出、sequential 关系
 * 箭头、节点详情改为右侧悬浮卡、缩放控件改右下角浮层。graphAnalysis.ts
 * 仍与 Shadow 逐字节同步，本批不改它。
 *
 * 路由：/knowledge/graph?pack=<pack_id>，从 KnowledgePage 每张 Pack 卡进入。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
// 2D 力导图:本地封装(桶包 react-force-graph 顶层 import 3d-force-graph-vr/ar
// → aframe 组件加载期炸 "AFRAME is not defined",故绕开,见 ForceGraph2D.ts)
import ForceGraph2D from '../common/utils/ForceGraph2D';
import {
  getPackGraph,
  KnowledgeApiError,
  listPacks,
  type KnowledgeGraphMeta,
} from '../api/knowledge';
import { getVaultGraph } from '../api/knowledgeVaults';
import type { KnowledgePack } from '../common/types/knowledge';
import {
  enrichGraphData,
  getCommunityColor,
  summarizeNodeNeighborhood,
  type GraphData,
  type GraphNode,
} from '../common/utils/graphAnalysis';
import { useI18n } from '../common/i18n';
import './graph-neo.css';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

const REL_SAMPLE = 5;
const PROV_SAMPLE = 5;
/** 节点标签字号（图坐标系 px）。Obsidian 式：标签随缩放缩放，
 *  屏幕上小于 ~6px（scale < 6/LABEL_FONT ≈ 1.4）时自动隐没。 */
const LABEL_FONT = 4.2;

/** PackGraph 节点携带的内容级溯源（to_graph_data 透出；LightRAG 节点没有）。 */
interface NodeProvenance {
  source_id: string;
  chunk_index: number;
  checksum?: string;
}

type PackGraphNode = GraphNode & {
  mentions?: number;
  sources?: NodeProvenance[];
};

const BACKEND_LABEL: Record<string, string> = {
  lightrag: 'LightRAG',
  pack_graph: '确定性图层',
  none: '无图',
};

/**
 * embedded 变体(2026-08-20 知识库统一批):作为知识页右栏「图谱」视图嵌入 ——
 * 隐藏独立页头(标题/pack 选择器/返回),工具条加「刷新」;packId 由 prop 指定
 * (来源 = 当前选中的源);独立路由 /knowledge/graph 行为不变(查询参数选 pack)。
 */
export default function KnowledgeGraphPage({
  embedded = false,
  packId: propPackId,
  vaultId,
  onNodeOpen,
}: {
  embedded?: boolean;
  packId?: string;
  vaultId?: string;
  /** 点节点详情里的「打开文件」回调(相对路径)——Shadow openKnowledgeBaseFile 同款跳转。 */
  onNodeOpen?: (relPath: string) => void;
} = {}) {
  const { t } = useI18n();
  const [packs, setPacks] = useState<KnowledgePack[]>([]);
  const [packsStatus, setPacksStatus] = useState<LoadStatus>('idle');
  const [meta, setMeta] = useState<KnowledgeGraphMeta | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphStatus, setGraphStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  // Obsidian 式画布交互（2026-09-03）：悬停节点 → 邻域高亮、其余淡出
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [themeTick, setThemeTick] = useState(0);

  const [params, setParams] = useSearchParams();
  const packId = propPackId ?? params.get('pack') ?? '';

  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{
    centerAt: (x?: number, y?: number, ms?: number) => void;
    zoom: (k?: number, ms?: number) => number | undefined;
    zoomToFit: (ms?: number, padding?: number) => void;
    d3Force: (name: string) => { strength?: (s: number) => unknown } | undefined;
    d3ReheatSimulation: () => void;
  } | undefined>(undefined);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // 画布自适应容器尺寸
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // canvas 不认 CSS 变量：data-theme 切换时 bump 一下，让下方 ink 重新解析
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((v) => v + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => obs.disconnect();
  }, []);

  // canvas 墨色（React 渲染级解析一次，非逐节点）：标签/边/描边/高亮环
  const ink = useMemo(() => {
    void themeTick;
    const night = document.documentElement.dataset.theme === 'night';
    const cs = getComputedStyle(wrapRef.current ?? document.documentElement);
    const css = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    return {
      label: css('--t-fg-2', night ? '#d4d4d8' : '#3f3f46'),
      edge: night ? 'rgba(170,170,185,0.22)' : 'rgba(120,120,135,0.30)',
      edgeHi: night ? 'rgba(167,139,250,0.80)' : 'rgba(28,28,30,0.55)',
      edgeDim: night ? 'rgba(170,170,185,0.06)' : 'rgba(120,120,135,0.07)',
      nodeStroke: night ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.85)',
      ringSoft: night ? 'rgba(167,139,250,0.28)' : 'rgba(28,28,30,0.12)',
    };
  }, [themeTick]);

  // pack 列表（选 pack 用;vault 模式无选择器,跳过）
  useEffect(() => {
    if (vaultId) return;
    (async () => {
      setPacksStatus('loading');
      try {
        const res = await listPacks({ limit: 50 });
        setPacks(res.data.packs);
        setPacksStatus('success');
        if (!propPackId && !packId && res.data.packs.length > 0) {
          setParams({ pack: res.data.packs[0].pack_id }, { replace: true });
        }
      } catch {
        setPacksStatus('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 图谱键:vault 模式用 vaultId,否则 packId(空 = 不加载)
  const graphKey = vaultId ?? packId;
  const loadGraph = useCallback(
    async (id: string) => {
      if (!id) return;
      setGraphStatus('loading');
      setErrorMsg('');
      setSelected(null);
      try {
        // vault 模式 → 文件夹链接图谱(Obsidian 式即时计算);否则 pack 图谱
        const res = vaultId ? await getVaultGraph(vaultId) : await getPackGraph(id);
        setGraph(res.data);
        setMeta(res.meta);
        setGraphStatus('success');
      } catch (err) {
        setGraphStatus('error');
        setErrorMsg(
          err instanceof KnowledgeApiError && err.status === 404
            ? '该 KnowledgePack 已被删除或不存在。'
            : `图谱加载失败：${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [vaultId],
  );

  useEffect(() => {
    loadGraph(graphKey);
  }, [graphKey, loadGraph]);

  // enrich：pagerank / 社区发现 / 连接度（Shadow 原版同一套管线）
  const enriched = useMemo(() => (graph ? enrichGraphData(graph) : null), [graph]);

  // raw_type 过滤（LightRAG 实体类型：person/org/event/...）
  const rawTypes = useMemo(() => {
    const counts = new Map<string, number>();
    graph?.nodes.forEach((n) => {
      const key = n.raw_type || 'unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [graph]);

  const visible = useMemo(() => {
    if (!enriched) return null;
    if (typeFilter === 'all') return enriched;
    return {
      nodes: enriched.nodes.filter((n) => (n.raw_type || 'unknown') === typeFilter),
      links: enriched.links.filter((l) => {
        const s = typeof l.source === 'string' ? l.source : l.source.id;
        const tgt = typeof l.target === 'string' ? l.target : l.target.id;
        return enriched.nodes.some((n) => n.id === s && (n.raw_type || 'unknown') === typeFilter)
          && enriched.nodes.some((n) => n.id === tgt && (n.raw_type || 'unknown') === typeFilter);
      }),
    };
  }, [enriched, typeFilter]);

  // Obsidian 式铺开：无/少边的图用默认斥力会挤成一团，加强 charge 让节点散开。
  // 注意：历史上配合 d3ReheatSimulation() 实测卡死过（2026-09-03），
  // effect 在首帧仿真未冷却时生效，无需 reheat。
  useEffect(() => {
    if (!visible) return;
    fgRef.current?.d3Force?.('charge')?.strength?.(-90);
  }, [visible]);

  const selectedSummary = useMemo(() => {
    if (!selected || !graph) return null;
    return summarizeNodeNeighborhood(selected.id, graph.nodes, graph.links, REL_SAMPLE);
  }, [selected, graph]);

  // 悬停节点的 1 跳邻域（Obsidian hover：邻居保持、其余淡出）
  const hoverNeighbors = useMemo(() => {
    if (!hoverNode || !visible) return new Set<string>();
    const set = new Set<string>([hoverNode.id]);
    for (const l of visible.links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      if (s === hoverNode.id) set.add(t);
      if (t === hoverNode.id) set.add(s);
    }
    return set;
  }, [hoverNode, visible]);

  const hoverLinks = useMemo(() => {
    if (!hoverNode || !visible) return new Set<object>();
    return new Set<object>(
      visible.links.filter((l) => {
        const s = typeof l.source === 'string' ? l.source : l.source.id;
        const t = typeof l.target === 'string' ? l.target : l.target.id;
        return s === hoverNode.id || t === hoverNode.id;
      }),
    );
  }, [hoverNode, visible]);

  // 自定义节点绘制（Obsidian 风）：社区色圆点 + 常显标签 + 悬停/选中光环。
  // 低缩放时只画悬停上下文的标签（text fade），避免满屏叠字。
  const drawNode = useCallback(
    (n: object, ctx: CanvasRenderingContext2D, scale: number) => {
      const node = n as GraphNode;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isHover = hoverNode?.id === node.id;
      const isSel = selected?.id === node.id;
      const dimmed = hoverNode != null && !hoverNeighbors.has(node.id);

      const r = Math.max(2.4, Math.sqrt(node.val ?? 1) * 2.8);
      ctx.save();
      ctx.globalAlpha = dimmed ? 0.12 : 1;

      if (isHover || isSel) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3.2, 0, Math.PI * 2);
        ctx.fillStyle = ink.ringSoft;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = getCommunityColor(node.community);
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = ink.nodeStroke;
      ctx.stroke();

      if (!dimmed && (isHover || isSel || hoverNode != null || LABEL_FONT * scale >= 6)) {
        // Obsidian：标签画在图坐标系，随缩放缩小（缩远自然隐没，不叠字）
        const fontSize = isHover || isSel ? LABEL_FONT * 1.15 : LABEL_FONT;
        const name = node.name.length > 26 ? `${node.name.slice(0, 26)}…` : node.name;
        ctx.font = `${isHover || isSel ? 600 : 400} ${fontSize}px "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = ink.label;
        ctx.fillText(name, x, y + r + 1.4);
      }
      ctx.restore();
    },
    [hoverNode, selected, hoverNeighbors, ink],
  );

  const handleSearch = () => {
    const q = search.trim().toLowerCase();
    if (!q || !visible) return;
    const hit = visible.nodes.find(
      (n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q),
    );
    if (hit && typeof hit.x === 'number' && typeof hit.y === 'number') {
      fgRef.current?.centerAt(hit.x, hit.y, 600);
      fgRef.current?.zoom(2.2, 600);
      setSelected(hit);
    }
  };

  // 缩放(搬 Shadow):zoom() 无参 = 读当前倍率
  const zoomBy = (factor: number) => {
    const z = fgRef.current?.zoom?.() ?? 1;
    fgRef.current?.zoom(z * factor, 250);
  };

  const stubMode = meta?.rag_backend && meta.rag_backend !== 'lightrag';
  const empty = graphStatus === 'success' && (meta?.node_count ?? 0) === 0;

  return (
    <div
      data-testid="knowledge-graph-page"
      className={`neo-kg${embedded ? ' neo-kg--embedded' : ''}`}
    >
      {!embedded && (
      <header className="neo-kg-header">
        <div className="neo-kg-header-left">
          <p className="neo-kg-eyebrow">Knowledge / Graph</p>
          <h1 className="neo-kg-title">
            {t('neo.knowledgeGraph.title', { defaultValue: '知识图谱' })}
          </h1>
        </div>
        <div className="neo-kg-header-actions">
          <select
            data-testid="graph-pack-select"
            value={packId}
            onChange={(e) => setParams({ pack: e.target.value })}
            className="neo-kg-select"
            aria-label="选择 KnowledgePack"
          >
            {packsStatus !== 'success' && <option value="">加载 packs…</option>}
            {packs.map((p) => (
              <option key={p.pack_id} value={p.pack_id}>
                {p.name}（{p.status}）
              </option>
            ))}
          </select>
          <button
            data-testid="graph-refresh"
            onClick={() => loadGraph(graphKey)}
            disabled={!graphKey || graphStatus === 'loading'}
            className="neo-kg-btn"
          >
            {t('neo.knowledgeGraph.refresh', { defaultValue: '刷新' })}
          </button>
          <Link to="/knowledge" className="neo-kg-btn neo-kg-btn-primary">
            {t('neo.knowledgeGraph.back', { defaultValue: '← 知识库' })}
          </Link>
        </div>
      </header>
      )}

      <div className="neo-kg-toolbar">
        <div className="neo-kg-search">
          <input
            data-testid="graph-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder={t('neo.knowledgeGraph.searchPh', { defaultValue: '搜索实体，回车定位…' })}
            aria-label="搜索图谱实体"
          />
        </div>
        {rawTypes.map(([type, count]) => (
          <button
            key={type}
            onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
            className={`neo-kg-chip${typeFilter === type ? ' on' : ''}`}
          >
            {type} · {count}
          </button>
        ))}
        {meta?.graph_backend && meta.graph_backend !== 'none' && (
          <span
            className="neo-kg-tag"
            data-testid="graph-backend-tag"
            title={
              meta.graph_backend === 'pack_graph'
                ? '确定性图层：wiki-link / 标题 / 短语构图，无 LLM，节点带内容级溯源'
                : 'LightRAG：LLM 抽取的实体-关系图谱'
            }
          >
            {BACKEND_LABEL[meta.graph_backend] ?? meta.graph_backend}
          </span>
        )}
        {(meta?.conflict_count ?? 0) > 0 && (
          <span
            className="neo-kg-tag neo-kg-tag-warn"
            data-testid="graph-conflict-tag"
            title="受控词表冲突：同一 wiki-link 别名指向多个不同目标（已标记，未覆盖）"
          >
            {t('neo.knowledgeGraph.conflicts', { defaultValue: '冲突' })} · {meta?.conflict_count}
          </span>
        )}
        {meta && (
          <span className="neo-kg-stats">
            {meta.node_count} nodes · {meta.link_count} links
            {meta.health && (
              <>
                {' '}· ρ {meta.health.density} · ⌗ {meta.health.components}
                {meta.health.isolated_count > 0 && ` · 孤岛 ${meta.health.isolated_count}`}
              </>
            )}
          </span>
        )}
        {embedded && (
          <button
            data-testid="graph-refresh"
            onClick={() => loadGraph(graphKey)}
            disabled={!graphKey || graphStatus === 'loading'}
            className="neo-kg-chip"
          >
            {t('neo.knowledgeGraph.refresh', { defaultValue: '刷新' })}
          </button>
        )}
      </div>

      <div className="neo-kg-body">
        <div ref={wrapRef} className="neo-kg-canvas-wrap">
          {graphStatus === 'error' && (
            <div className="neo-kg-empty">
              <p>{errorMsg}</p>
            </div>
          )}
          {graphStatus === 'loading' && (
            <div className="neo-kg-empty">
              <p>{t('neo.knowledgeGraph.loading', { defaultValue: '图谱加载中…' })}</p>
            </div>
          )}
          {empty && !stubMode && (
            <div className="neo-kg-empty">
              <p>该 Pack 还没有图谱数据。</p>
              <p>等 indexing 完成后点「刷新」，或先在知识库页 Reindex。</p>
            </div>
          )}
          {empty && vaultId && (
            <div className="neo-kg-empty">
              <p>该仓库还没有可解析的文档链接。</p>
              <p>在笔记里写 <code>[[双链]]</code> 或相对路径 Markdown 链接后刷新,图谱即刻生成。</p>
            </div>
          )}
          {empty && !vaultId && stubMode && (
            <div className="neo-kg-empty">
              <p>确定性图层已启用，但在该 Pack 中没有检测到实体。</p>
              <p>
                在文档里写 <code>[[双链]]</code>、Markdown 标题或英文大写术语后
                Reindex，图谱即刻生成；配置 <code>LIGHTRAG_ENABLED=true</code>
                可叠加 LLM 抽取的实体-关系图。
              </p>
            </div>
          )}
          {!empty && visible && (
            <ForceGraph2D
              ref={fgRef as never}
              width={size.w}
              height={size.h}
              graphData={visible as never}
              backgroundColor="transparent"
              nodeLabel={(n: object) => (n as GraphNode).name}
              nodeCanvasObject={drawNode}
              linkColor={(l: object) => {
                if (!hoverNode) return ink.edge;
                return hoverLinks.has(l) ? ink.edgeHi : ink.edgeDim;
              }}
              linkWidth={(l: object) => (hoverNode && hoverLinks.has(l) ? 1.5 : 0.7)}
              linkDirectionalArrowLength={(l: object) =>
                (l as { relationFamily?: string }).relationFamily === 'sequential' ? 3.5 : 0
              }
              linkDirectionalArrowRelPos={1}
              linkLabel={(l: object) => {
                const link = l as { relation?: string };
                return link.relation ?? '';
              }}
              onNodeHover={(n: object | null) => {
                setHoverNode((n as GraphNode | null) ?? null);
                if (wrapRef.current) wrapRef.current.style.cursor = n ? 'pointer' : '';
              }}
              onNodeClick={(n: object) => {
                const node = n as GraphNode;
                setSelected(node);
                if (typeof node.x === 'number' && typeof node.y === 'number') {
                  fgRef.current?.centerAt(node.x, node.y, 400);
                  fgRef.current?.zoom(2, 400);
                }
              }}
              cooldownTicks={120}
            />
          )}
          <span className="neo-kg-zoomctl">
            <button onClick={() => zoomBy(0.67)} aria-label="缩小" title="缩小">−</button>
            <button onClick={() => fgRef.current?.zoomToFit(400, 30)} aria-label="适应全图" title="适应全图">⤢</button>
            <button onClick={() => zoomBy(1.5)} aria-label="放大" title="放大">+</button>
          </span>
        </div>

        {selected && selectedSummary && (
          <aside className="neo-kg-detail" data-testid="graph-node-detail">
            <button
              className="neo-kg-close"
              onClick={() => setSelected(null)}
              aria-label={t('neo.knowledgeGraph.closeDetail', { defaultValue: '关闭详情' })}
              title={t('neo.knowledgeGraph.closeDetail', { defaultValue: '关闭详情' })}
            >
              ✕
            </button>
            <h3>{selected.name}</h3>
            {selected.path && onNodeOpen && (
              <button
                data-testid="graph-open-file"
                className="neo-kg-btn neo-kg-btn-primary"
                onClick={() => onNodeOpen(selected.path as string)}
              >
                打开文件
              </button>
            )}
            <p className="raw-type">
              {selected.raw_type || 'entity'}
              {(selected as PackGraphNode).mentions !== undefined &&
                ` · ${(selected as PackGraphNode).mentions} mentions`}
              {' '}· {selectedSummary.totalNeighbors} neighbors
            </p>
            {selected.text && <p className="desc">{selected.text}</p>}
            {(selected as PackGraphNode).sources &&
              (selected as PackGraphNode).sources!.length > 0 && (
              <>
                <p className="section-label">
                  {t('neo.knowledgeGraph.provenance', { defaultValue: 'Provenance 溯源' })}
                </p>
                {(selected as PackGraphNode).sources!.slice(0, PROV_SAMPLE).map((s, i) => (
                  <div
                    key={`prov-${s.source_id}-${s.chunk_index}-${i}`}
                    className="rel-row"
                    title={`source ${s.source_id}${s.checksum ? ` · sha256 ${s.checksum}` : ''}`}
                  >
                    <span className="rel">chunk {s.chunk_index}</span>
                    {s.checksum && <span className="prov-hash">{s.checksum.slice(0, 8)}…</span>}
                  </div>
                ))}
              </>
            )}
            {selectedSummary.relationTypes.length > 0 && (
              <p className="raw-type">relations: {selectedSummary.relationTypes.join(', ')}</p>
            )}
            {selectedSummary.outgoing.length > 0 && (
              <>
                <p className="section-label">Outgoing</p>
                {selectedSummary.outgoing.slice(0, REL_SAMPLE).map((e) => (
                  <div key={`out-${e.id}`} className="rel-row">
                    <span className="rel">{e.relation ?? '→'}</span>
                    <span>{e.name}</span>
                  </div>
                ))}
              </>
            )}
            {selectedSummary.incoming.length > 0 && (
              <>
                <p className="section-label">Incoming</p>
                {selectedSummary.incoming.slice(0, REL_SAMPLE).map((e) => (
                  <div key={`in-${e.id}`} className="rel-row">
                    <span className="rel">{e.relation ?? '←'}</span>
                    <span>{e.name}</span>
                  </div>
                ))}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
