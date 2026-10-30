/**
 * Knowledge API client — Story 9.1
 *
 * Thin wrapper around the backend `/knowledge/packs` endpoints.
 * Mirrors `src/api/catalog.ts` `_handleResponse<T>` style and surfaces a
 * stable `code` (KNOWLEDGE_PACK_NOT_FOUND, etc.) on failure.
 */
import type {
  CreatePackPayload,
  KnowledgeDeleteResponse,
  KnowledgeDetailResponse,
  KnowledgeListResponse,
  KnowledgeMeta,
  KnowledgeQueryResponse,
  UpdatePackPayload,
} from '../common/types/knowledge';
import type { GraphData } from '../common/utils/graphAnalysis';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class KnowledgeApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Knowledge API error ${status}`);
    this.code = code || `HTTP_${status}`;
  }
}

function _extractErrorCode(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>;
    const inner = d.error;
    if (inner && typeof inner === 'object') {
      const code = (inner as Record<string, unknown>).code;
      if (typeof code === 'string') return code;
    }
    const code = d.code;
    if (typeof code === 'string') return code;
  }
  return '';
}

async function _handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    try {
      return (await res.json()) as T;
    } catch {
      // 200 + 非 JSON（典型：Vite/网关 SPA fallback 回了 index.html）。
      // 显式抛带 code 的错误，避免裸 SyntaxError 被页面兜底成误导性的「网络错误」。
      throw new KnowledgeApiError(res.status, 'non-JSON response', 'KNOWLEDGE_API_BAD_RESPONSE');
    }
  }
  const body = await res.text();
  let detail: unknown = body;
  try {
    detail = JSON.parse(body);
  } catch {
    // keep raw text
  }
  throw new KnowledgeApiError(res.status, detail, _extractErrorCode(detail));
}

export async function listPacks(
  params: { limit?: number; offset?: number } = {},
): Promise<KnowledgeListResponse> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const url = `${API_BASE_URL}/api/knowledge/packs${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url);
  return _handleResponse<KnowledgeListResponse>(res);
}

export async function getPack(packId: string): Promise<KnowledgeDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/api/knowledge/packs/${encodeURIComponent(packId)}`);
  return _handleResponse<KnowledgeDetailResponse>(res);
}

export async function createPack(payload: CreatePackPayload): Promise<KnowledgeDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/api/knowledge/packs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<KnowledgeDetailResponse>(res);
}

export async function updatePack(
  packId: string,
  payload: UpdatePackPayload,
): Promise<KnowledgeDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/api/knowledge/packs/${encodeURIComponent(packId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<KnowledgeDetailResponse>(res);
}

export async function deletePack(packId: string): Promise<KnowledgeDeleteResponse> {
  const res = await fetch(`${API_BASE_URL}/api/knowledge/packs/${encodeURIComponent(packId)}`, {
    method: 'DELETE',
  });
  return _handleResponse<KnowledgeDeleteResponse>(res);
}

export async function reindexPack(packId: string): Promise<KnowledgeDetailResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge/packs/${encodeURIComponent(packId)}/reindex`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  return _handleResponse<KnowledgeDetailResponse>(res);
}

// ---------------------------------------------------------------------------
// RAG 检索（POST /packs/{id}/query）。后端未配置 LightRAG / 无命中时返回
// 空 hits（不 500），调用方按「无引用」降级展示即可。
// ---------------------------------------------------------------------------

export async function queryPack(
  packId: string,
  query: string,
  topK?: number,
): Promise<KnowledgeQueryResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge/packs/${encodeURIComponent(packId)}/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(topK !== undefined ? { query, top_k: topK } : { query }),
    },
  );
  return _handleResponse<KnowledgeQueryResponse>(res);
}

// ---------------------------------------------------------------------------
// Hierarchical index browsing（GET /packs/{id}/index，借鉴 StaffDeck 的
// 文档→章节→页面可导航索引）。树节点不带 chunk 正文，只有结构 + chunk_indexes。
// ---------------------------------------------------------------------------

/** 文档树节点：kind='document' | 'chapter' | 'page'，children 嵌套。 */
export interface KnowledgeIndexNode {
  node_id: string;
  kind: string;
  title: string;
  level: number;
  chunk_indexes: number[];
  children: KnowledgeIndexNode[];
}

export interface KnowledgeIndexDocument {
  doc_id: string;
  source_id: string;
  title: string;
  /** 'outline'（md 标题层级）| 'paged'（非结构化按 chunk 序号分页）。 */
  kind: string;
  chunk_count: number;
  tree: KnowledgeIndexNode;
}

export interface KnowledgeIndexResponse {
  data: {
    pack_id: string;
    built_at: string;
    documents: KnowledgeIndexDocument[];
    stats: { documents: number; nodes: number; chunks: number };
  };
  meta: KnowledgeMeta & { pack_id: string };
}

export async function getPackIndex(packId: string): Promise<KnowledgeIndexResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge/packs/${encodeURIComponent(packId)}/index`,
  );
  return _handleResponse<KnowledgeIndexResponse>(res);
}

// ---------------------------------------------------------------------------
// Knowledge graph export（2026-08-19，配合 /knowledge/graph 图谱可视化页）
// 后端把 LightRAG 的 graph_*.graphml 解析成 GraphData 形状（graphAnalysis.ts）。
// 2026-09-03 起 LightRAG 缺席时回退 PackGraph 确定性图层（graph_backend 标识），
// meta 附带冲突计数与图健康指标。
// ---------------------------------------------------------------------------

/** 图健康指标（后端 pack_graph.graph_health：孤岛/hub/密度/连通分量）。 */
export interface KnowledgeGraphHealth {
  nodes: number;
  edges: number;
  density: number;
  components: number;
  isolated_count: number;
  isolated: string[];
  hubs: Array<{ id: string; name: string; degree: number }>;
}

export interface KnowledgeGraphMeta {
  pack_id: string;
  rag_backend: string;
  /** 图数据来源：lightrag（LLM 抽取）| pack_graph（确定性图层）| none。 */
  graph_backend?: string;
  /** PackGraph 受控词表冲突数（wiki-link 别名指向多个目标）。 */
  conflict_count?: number;
  health?: KnowledgeGraphHealth | null;
  node_count: number;
  link_count: number;
}

export interface KnowledgeGraphResponse {
  data: GraphData;
  meta: KnowledgeGraphMeta;
}

export async function getPackGraph(packId: string): Promise<KnowledgeGraphResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge/packs/${encodeURIComponent(packId)}/graph`,
  );
  return _handleResponse<KnowledgeGraphResponse>(res);
}
