/**
 * memoryBank.ts — /api/memory-bank API client（PR #7 设计移植）。
 *
 * 多模态记忆库：BM25+向量混合检索 RAG 后端（Python sidecar）。
 * Node 网关 proxyFallback 自动转发到 Python FastAPI，本客户端只打 Node 基址。
 * 错误处理对齐 api/knowledge.ts：稳定 code（MEMORY_BANK_PACK_NOT_FOUND 等），
 * 非 JSON 响应显式抛错避免裸 SyntaxError。
 */
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class MemoryBankApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`MemoryBank API error ${status}`);
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
      throw new MemoryBankApiError(res.status, 'non-JSON response', 'MEMORY_BANK_BAD_RESPONSE');
    }
  }
  const body = await res.text();
  let detail: unknown = body;
  try {
    detail = JSON.parse(body);
  } catch {
    // keep raw text
  }
  throw new MemoryBankApiError(res.status, detail, _extractErrorCode(detail));
}

// ---------------------------------------------------------------------------
// Types — 与 Python memory_bank.py envelope {data, meta} 对齐
// ---------------------------------------------------------------------------

export interface MemoryBankPack {
  pack_id: string;
  name: string;
  description: string;
  status?: string;
  stats?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface MemoryBankPackListData {
  packs: MemoryBankPack[];
}

export interface MemoryBankSource {
  source_id: string;
  filename: string;
  mime_type?: string;
  status?: string;
  version?: number;
  is_latest?: boolean;
  checksum?: string;
  chunk_count?: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface MemoryBankSourceListData {
  sources: MemoryBankSource[];
}

export interface MemoryBankHit {
  text: string;
  matched_text?: string;
  source: string;
  score: number;
  kind?: string;
  citation?: string;
  retrieval_channels?: string[];
  provenance?: Record<string, unknown>;
  raw_uri?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryBankQueryData {
  hits: MemoryBankHit[];
}

export interface MemoryBankQueryMeta {
  rag_backend?: string;
  latency_ms?: number;
  trace_id?: string;
  [key: string]: unknown;
}

export interface MemoryBankQueryResponse {
  data: MemoryBankQueryData;
  meta: MemoryBankQueryMeta;
}

export interface MemoryBankIngestResult {
  source_id: string;
  filename?: string;
  status?: string;
  version?: number;
  deduplicated?: boolean;
  warnings?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

export async function createPack(
  payload: { name: string; description?: string; metadata?: Record<string, unknown> },
): Promise<{ data: MemoryBankPack; meta: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE_URL}/api/memory-bank/packs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse(res);
}

export async function listPacks(): Promise<{ data: MemoryBankPackListData; meta: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE_URL}/api/memory-bank/packs`);
  return _handleResponse(res);
}

export async function getPack(
  packId: string,
): Promise<{ data: MemoryBankPack; meta: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}`);
  return _handleResponse(res);
}

export async function deletePack(packId: string): Promise<{ deleted: boolean; pack_id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}`, {
    method: 'DELETE',
  });
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// Ingest — 文本与文件（multipart）
// ---------------------------------------------------------------------------

export async function ingestText(
  packId: string,
  payload: { text: string; source_name?: string; metadata?: Record<string, unknown>; deduplicate?: boolean },
): Promise<{ data: MemoryBankIngestResult; meta: Record<string, unknown> }> {
  const res = await fetch(
    `${API_BASE_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}/text`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return _handleResponse(res);
}

export async function ingestFile(
  packId: string,
  file: File,
  metadata?: Record<string, unknown>,
): Promise<{ data: MemoryBankIngestResult; meta: Record<string, unknown> }> {
  const fd = new FormData();
  fd.append('upload', file);
  if (metadata) fd.append('metadata', JSON.stringify(metadata));
  const res = await fetch(
    `${API_BASE_URL}/api/memory-bank/` +
      `packs/${encodeURIComponent(packId)}/files`,
    { method: 'POST', body: fd },
  );
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function listSources(
  packId: string,
  includeHistory = false,
): Promise<{ data: MemoryBankSourceListData; meta: Record<string, unknown> }> {
  const qs = includeHistory ? '?include_history=true' : '';
  const res = await fetch(
    `${API_BASE_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}/sources${qs}`,
  );
  return _handleResponse(res);
}

export async function deleteSource(packId: string, sourceId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(
    `${API_BASE_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}/sources/${encodeURIComponent(sourceId)}`,
    { method: 'DELETE' },
  );
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface MemoryBankQueryPayload {
  query: string;
  top_k?: number;
  filters?: Record<string, unknown>;
  query_variants?: string[];
  use_reranker?: boolean;
}

export async function queryPack(
  packId: string,
  payload: MemoryBankQueryPayload,
): Promise<MemoryBankQueryResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// Blob — 原始文件回读（血统回溯）
// ---------------------------------------------------------------------------

export async function fetchBlobUrl(packId: string, sha256: string): Promise<string> {
  return (
    `${API_BASE_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}` +
    `/blobs/${encodeURIComponent(sha256)}`
  );
}
