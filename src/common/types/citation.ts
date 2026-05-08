/**
 * Citation 类型 — Story 9.2
 *
 * 字段名严格保持 snake_case，与后端 Pydantic 一致。
 */

export interface CitationTrace {
  trace_id: string;
  pack_id: string;
  source_id: string;
  chunk_id: string;
  excerpt: string;
  confidence: number;
  retrieved_at: string;
  task_or_artifact_ref: string;
}

export interface CitationListResponse {
  data: {
    run_id: string;
    traces: CitationTrace[];
    citation_missing: boolean;
  };
  meta: {
    trace_id: string;
    timestamp: string;
    node_id?: string | null;
    total: number;
  };
}

export interface CitationReport {
  run_id: string;
  traces: CitationTrace[];
  citation_missing: boolean;
}

export interface CitationExportResponse {
  data: CitationReport;
  meta: { trace_id: string; timestamp: string };
}
