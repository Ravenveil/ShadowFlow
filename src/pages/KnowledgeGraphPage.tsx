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

  const [params, setParams] = useSearchParams();
  const packId = propPackId ?? params.get('pack') ?? '';

  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{
    centerAt: (x?: number, y?: number, ms?: number) => void;
    zoom: (k?: number, ms?: number) => number | undefined;
    zoomToFit: (ms?: number, padding?: number) => void;
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

  const selectedSummary = useMemo(() => {
    if (!selected || !graph) return null;
    return summarizeNodeNeighborhood(selected.id, graph.nodes, graph.links, REL_SAMPLE);
  }, [selected, graph]);

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
        {meta && (
          <span className="neo-kg-stats">
            {meta.node_count} nodes · {meta.link_count} links · {meta.rag_backend}
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
        <span className="neo-kg-zoomctl">
          <button onClick={() => zoomBy(0.67)} aria-label="缩小" title="缩小">−</button>
          <button onClick={() => fgRef.current?.zoomToFit(400, 30)} aria-label="适应全图" title="适应全图">⤢</button>
          <button onClick={() => zoomBy(1.5)} aria-label="放大" title="放大">+</button>
        </span>
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
              <p>
                当前 RAG 后端是 <code>keyword stub</code>，不生成实体-关系图谱。
              </p>
              <p>
                在 .env 设置 <code>LIGHTRAG_ENABLED=true</code> 并配置 LLM/embedding
                后重启后端，再 Reindex 该 Pack 即可生成图谱。
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
              nodeVal={(n: object) => (n as GraphNode).val}
              nodeColor={(n: object) => getCommunityColor((n as GraphNode).community)}
              linkColor={() => 'rgba(128,128,128,0.35)'}
              linkLabel={(l: object) => {
                const link = l as { relation?: string };
                return link.relation ?? '';
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
          {selected && (
            <button className="neo-kg-close" onClick={() => setSelected(null)}>
              {t('neo.knowledgeGraph.closeDetail', { defaultValue: '关闭详情' })}
            </button>
          )}
        </div>

        {selected && selectedSummary && (
          <aside className="neo-kg-detail" data-testid="graph-node-detail">
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
            <p className="raw-type">{selected.raw_type || 'entity'} · {selectedSummary.totalNeighbors} neighbors</p>
            {selected.text && <p className="desc">{selected.text}</p>}
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
