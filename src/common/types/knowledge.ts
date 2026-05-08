/**
 * KnowledgePack 类型 — Story 9.1
 *
 * 字段名严格保持 snake_case，与后端 Pydantic 一致。前端不在边界做 camelCase 转换。
 */

export type RetrievalMode = 'semantic' | 'keyword' | 'hybrid';

export type SourceType = 'file' | 'url' | 'text' | 'dataset';

export type IngestStatus = 'pending' | 'processing' | 'done' | 'failed';

export type PackStatus = 'pending' | 'indexing' | 'ready' | 'failed';

export type FreshnessPolicy = 'always' | 'daily' | 'weekly' | 'on_demand';

export interface RetrievalProfile {
  mode: RetrievalMode;
  top_k: number;
  min_confidence: number;
  chunk_size: number;
  overlap: number;
}

export interface KnowledgeSource {
  source_id: string;
  source_type: SourceType;
  source_ref: string;
  mime_type: string;
  imported_at: string;
  checksum: string;
  ingest_status: IngestStatus;
  chunk_count: number;
  error_message: string;
}

export interface KnowledgePack {
  pack_id: string;
  name: string;
  description: string;
  sources: KnowledgeSource[];
  retrieval_profile: RetrievalProfile;
  citation_required: boolean;
  freshness_policy: FreshnessPolicy;
  created_at: string;
  updated_at: string;
  status: PackStatus;
}

export interface KnowledgeSourceInput {
  source_type: SourceType;
  source_ref: string;
  mime_type?: string;
}

export interface CreatePackPayload {
  name: string;
  description?: string;
  sources: KnowledgeSourceInput[];
  retrieval_profile?: Partial<RetrievalProfile>;
  citation_required?: boolean;
  freshness_policy?: FreshnessPolicy;
}

export interface UpdatePackPayload {
  name?: string;
  description?: string;
  retrieval_profile?: Partial<RetrievalProfile>;
  citation_required?: boolean;
  freshness_policy?: FreshnessPolicy;
}

/** RAG backend currently serving this deployment. */
export type RagBackend = 'stub' | 'lightrag';

export interface KnowledgeMeta {
  trace_id: string;
  timestamp: string;
  /** Active RAG backend: "stub" (keyword index) or "lightrag" (graph+vector). */
  rag_backend?: RagBackend;
}

export interface KnowledgeListResponse {
  data: { packs: KnowledgePack[] };
  meta: KnowledgeMeta & { total: number; limit: number; offset: number; skipped?: number };
}

export interface KnowledgeDetailResponse {
  data: KnowledgePack;
  meta: KnowledgeMeta;
}

export interface KnowledgeDeleteResponse {
  data: { deleted: boolean; pack_id: string };
  meta: KnowledgeMeta;
}
