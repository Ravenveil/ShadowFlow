/**
 * types.ts — memory-bank v1 类型定义（与 Python memory_bank.py 数据形状 1:1）。
 *
 * 权威来源：backend/python/shadowflow/memory/memory_bank.py
 *   - PackManifest   ← create_pack (:1036-1054)
 *   - SourceDict     ← _source_dict (:1133-1153)
 *   - MemoryBankHit  ← retrieve hits (:2165-2188)
 *   - QueryResponse  ← query (:2191-2206)
 *   - FolderIngestResult ← ingest_folder (:1725-1731)
 * 前端契约镜像：frontend/legacy/src/api/memoryBank.ts（字段只增不减）。
 */

export interface RetrievalProfile {
  mode: 'hybrid' | 'keyword';
  top_k: number;
  child_size: number;
  child_overlap: number;
  parent_size: number;
}

export interface PackStats {
  sources: number;
  units: number;
  parents: number;
  chunks: number;
  bytes: number;
}

/** memory_bank.json 的结构（createPack 落盘 / getPack·listPacks 返回体）。 */
export interface PackManifest {
  schema: string;
  pack_id: string;
  name: string;
  description: string;
  status: string;
  retrieval_profile: RetrievalProfile;
  embedding_model: string;
  metadata: Record<string, unknown>;
  stats: PackStats;
  created_at: string;
  updated_at: string;
}

/** sources 表的对外形状（listSources / ingest 结果主体）。 */
export interface SourceDict {
  source_id: string;
  filename: string;
  source_name: string;
  extension: string;
  mime_type: string;
  checksum: string;
  size_bytes: number;
  ingest_status: string;
  version: number;
  supersedes: string | null;
  is_latest: boolean;
  metadata: Record<string, unknown>;
  warnings: unknown[];
  error_message: string;
  unit_count: number;
  chunk_count: number;
  imported_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface HitProvenance {
  pack_id: string;
  checksum: string;
  source_version: number;
  context: Record<string, unknown>;
  parent_char_start: number;
  parent_char_end: number;
  unit_ids: unknown[];
}

/** POST /packs/:id/query 的单个命中（14 字段，见 Python :2165-2188）。 */
export interface MemoryBankHit {
  text: string;
  matched_text: string;
  source: string;
  score: number;
  chunk_id: string;
  parent_id: string;
  source_id: string;
  kind: string;
  citation: string;
  provenance: HitProvenance;
  metadata: Record<string, unknown>;
  raw_uri: string;
  raw_mime: string;
  retrieval_channels: string[];
}

/** 注意：query 端点直接返回 {data, meta}，不是 envelope 再包一层。 */
export interface QueryResponse {
  data: { hits: MemoryBankHit[] };
  meta: {
    pack_id: string;
    query: string;
    rag_backend: 'hybrid' | 'keyword+structure';
    reranked: boolean;
    latency_ms: number;
    trace_id?: string;
  };
}

export interface FolderFileResult {
  file: string;
  status: 'ingested' | 'deduplicated' | 'skipped' | 'failed';
  code?: string;
  message?: string;
  source_id?: string;
}

export interface FolderIngestResult {
  folder: string;
  recursive: boolean;
  total: number;
  ingested: number;
  deduplicated: number;
  skipped: number;
  failed: number;
  files: FolderFileResult[];
}

export interface QueryOptions {
  top_k?: number;
  filters?: Record<string, unknown>;
  query_variants?: string[];
  use_reranker?: boolean;
}

export interface IngestOptions {
  source_name?: string;
  metadata?: Record<string, unknown>;
  deduplicate?: boolean;
}

export interface FolderOptions {
  recursive?: boolean;
  metadata?: Record<string, unknown>;
  deduplicate?: boolean;
}

// ── 内部管线结构（Python _Unit / _Parent / _Child 的 TS 镜像） ────────────────

export interface Unit {
  kind: string;
  text: string;
  group_key: string;
  context: Record<string, unknown>;
  data: Record<string, unknown>;
  raw_sha256: string;
  raw_mime: string;
  /** v1 恒为空 Buffer（图片/文档内嵌二进制未启用）。 */
  raw_data: Buffer;
  unit_id: string;
  parent_id: string;
}

export interface Parent {
  source_id: string;
  ordinal: number;
  text: string;
  kind: string;
  context: Record<string, unknown>;
  units: Unit[];
  parent_id: string;
}

export interface Child {
  parent_id: string;
  source_id: string;
  ordinal: number;
  start_char: number;
  end_char: number;
  text: string;
  kind: string;
  context: Record<string, unknown>;
  unit_ids: string[];
  chunk_id: string;
}
