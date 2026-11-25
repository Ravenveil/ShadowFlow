/**
 * retrieve.ts — 检索管线（Python retrieve :2057-2189 的 TS 直译）。
 *
 * 流程：多路 BM25（query + variants，各路独立排序）→（v1 dense 恒空）→
 * RRF 融合（variant_weight × weight / (rrf_k + rank)）→ 归一 →
 * identifier ×1.10 / modality boost / authority clamp[0.5,1.5] 加权 →
 * （v1 无 reranker）→ parent 去重 + Jaccard≥0.92 近重复抑制 → top_k 命中组装。
 */

import { MemoryBankError } from './errors';
import { MEMORY_CONFIG } from './config';
import { connect } from './db';
import { ftsQuery } from './text';
import { jaccard, lexicalTokens, modalityBoost } from './text';
import { IDENTIFIER_RE } from './text';
import type { MemoryBankHit, HitProvenance, QueryOptions } from './types';

type Database = ReturnType<typeof connect>;

interface ChunkRow {
  chunk_id: string;
  parent_id: string;
  source_id: string;
  kind: string;
  start_char: number;
  end_char: number;
  text: string;
  unit_ids_json: string;
  parent_text: string;
  parent_context: string;
  filename: string;
  raw_sha256: string;
  source_mime: string;
  source_metadata: string;
  source_version: number;
}

function loadJsonSafe(raw: string | null | undefined, fallback: unknown): unknown {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

/** _filter_sql(:1890-1916)：固定 status='done'，可选 is_latest/source_ids/kinds/文件名/时间。 */
function filterSql(
  filters: Record<string, unknown>,
  params: unknown[],
  alias = 'c',
): string {
  const clauses: string[] = ["s.status = 'done'"];
  if (!filters.include_history) clauses.push('s.is_latest = 1');
  const sourceIds = Array.isArray(filters.source_ids)
    ? (filters.source_ids as unknown[]).map(String).filter(Boolean)
    : [];
  if (sourceIds.length > 0) {
    clauses.push(`${alias}.source_id IN (${sourceIds.map(() => '?').join(',')})`);
    params.push(...sourceIds);
  }
  const kinds = Array.isArray(filters.kinds)
    ? (filters.kinds as unknown[]).map(String).filter(Boolean)
    : [];
  if (kinds.length > 0) {
    clauses.push(`${alias}.kind IN (${kinds.map(() => '?').join(',')})`);
    params.push(...kinds);
  }
  if (typeof filters.filename_contains === 'string' && filters.filename_contains) {
    clauses.push("s.filename LIKE ? ESCAPE '\\'");
    const value = String(filters.filename_contains)
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
    params.push(`%${value}%`);
  }
  if (filters.created_after) {
    clauses.push('s.created_at >= ?');
    params.push(String(filters.created_after));
  }
  if (filters.created_before) {
    clauses.push('s.created_at <= ?');
    params.push(String(filters.created_before));
  }
  return clauses.join(' AND ');
}

/** _bm25_rankings(:1926-1946)：每路 query 一次 MATCH + bm25 ASC。 */
function bm25Rankings(
  db: Database,
  queries: string[],
  filters: Record<string, unknown>,
  limit: number,
): string[][] {
  const params: unknown[] = [];
  const where = filterSql(filters, params);
  const stmt = db.prepare(
    `SELECT c.chunk_id AS chunk_id, bm25(chunks_fts) AS rank
     FROM chunks_fts
     JOIN chunks c ON c.chunk_id = chunks_fts.chunk_id
     JOIN sources s ON s.source_id = c.source_id
     WHERE chunks_fts MATCH ? AND ${where}
     ORDER BY rank ASC LIMIT ?`,
  );
  const rankings: string[][] = [];
  for (const query of queries) {
    const match = ftsQuery(query);
    if (!match) {
      rankings.push([]);
      continue;
    }
    const rows = stmt.all(match, ...params, limit) as Array<{ chunk_id: string }>;
    rankings.push(rows.map((r) => r.chunk_id));
  }
  return rankings;
}

/** _rows_by_ids(:2037-2055)：800 一批 JOIN parents/sources 取回完整行。 */
function rowsByIds(db: Database, ids: Iterable<string>): Map<string, ChunkRow> {
  const unique = [...new Set(ids)];
  const output = new Map<string, ChunkRow>();
  const stmt = db.prepare(
    `SELECT c.*, p.text AS parent_text, p.context_json AS parent_context,
            s.filename AS filename, s.raw_sha256 AS raw_sha256,
            s.mime_type AS source_mime, s.metadata_json AS source_metadata,
            s.version AS source_version
     FROM chunks c
     JOIN parents p ON p.parent_id = c.parent_id
     JOIN sources s ON s.source_id = c.source_id
     WHERE c.chunk_id IN (${unique.slice(0, 800).map(() => '?').join(',')})`,
  );
  for (let start = 0; start < unique.length; start += 800) {
    const batch = unique.slice(start, start + 800);
    const local = db.prepare(
      `SELECT c.*, p.text AS parent_text, p.context_json AS parent_context,
              s.filename AS filename, s.raw_sha256 AS raw_sha256,
              s.mime_type AS source_mime, s.metadata_json AS source_metadata,
              s.version AS source_version
       FROM chunks c
       JOIN parents p ON p.parent_id = c.parent_id
       JOIN sources s ON s.source_id = c.source_id
       WHERE c.chunk_id IN (${batch.map(() => '?').join(',')})`,
    );
    for (const row of local.all(...batch) as unknown as ChunkRow[]) {
      output.set(row.chunk_id, row);
    }
  }
  return output;
}

/**
 * 主检索入口。返回 parent 上下文按子块证据排序的命中列表。
 * score 是相对值（归一后），不是概率。
 */
export function retrieve(
  packId: string,
  query: string,
  opts: QueryOptions = {},
): MemoryBankHit[] {
  const topK = opts.top_k ?? 5;
  if (!query || !query.trim()) {
    throw new MemoryBankError('EMPTY_QUERY', 'Query cannot be empty');
  }
  if (!(topK >= 1 && topK <= 50)) {
    throw new MemoryBankError('INVALID_TOP_K', 'top_k must be between 1 and 50');
  }
  const variants: string[] = [query.trim()];
  for (const v of opts.query_variants ?? []) {
    const t = (v ?? '').trim();
    if (t && !variants.includes(t)) variants.push(t);
  }
  const limited = variants.slice(0, 5);
  const filters = { ...(opts.filters ?? {}) };
  const candidateLimit = Math.min(200, Math.max(20, topK * MEMORY_CONFIG.candidate_multiplier));

  const db = connect(packId);
  const lexical = bm25Rankings(db, limited, filters, candidateLimit);
  // v1：embedder=null → dense 恒空（与 Python :1986-1987 embedder 缺席分支一致）
  const dense: string[][] = limited.map(() => []);

  const candidateIds = new Set<string>();
  for (const ranking of [...lexical, ...dense]) {
    for (const id of ranking) candidateIds.add(id);
  }
  if (candidateIds.size === 0) return [];

  const rows = rowsByIds(db, candidateIds);
  const rrf = new Map<string, number>();
  const channels = new Map<string, Set<string>>();
  for (const id of candidateIds) {
    rrf.set(id, 0);
    channels.set(id, new Set());
  }
  const variantWeight = 1 / limited.length;
  for (const ranking of lexical) {
    ranking.forEach((chunkId, i) => {
      const rank = i + 1;
      rrf.set(chunkId, (rrf.get(chunkId) ?? 0) + (variantWeight * MEMORY_CONFIG.bm25_weight) / (MEMORY_CONFIG.rrf_k + rank));
      channels.get(chunkId)?.add('bm25');
    });
  }
  for (const ranking of dense) {
    ranking.forEach((chunkId, i) => {
      const rank = i + 1;
      rrf.set(chunkId, (rrf.get(chunkId) ?? 0) + (variantWeight * MEMORY_CONFIG.vector_weight) / (MEMORY_CONFIG.rrf_k + rank));
      channels.get(chunkId)?.add('vector');
    });
  }
  let maxRrf = 0;
  for (const v of rrf.values()) if (v > maxRrf) maxRrf = v;
  if (maxRrf === 0) maxRrf = 1;

  const identifiers = new Set([...query.matchAll(IDENTIFIER_RE)].map((m) => m[0].toLowerCase()));
  const candidates: Array<{ chunkId: string; row: ChunkRow; score: number }> = [];
  for (const [chunkId, rawScore] of rrf) {
    const row = rows.get(chunkId);
    if (!row) continue;
    let score = rawScore / maxRrf;
    const matched = row.text.toLowerCase();
    let hitIdentifier = false;
    for (const identifier of identifiers) {
      if (matched.includes(identifier)) {
        hitIdentifier = true;
        break;
      }
    }
    if (hitIdentifier) {
      score *= 1.1;
      channels.get(chunkId)?.add('identifier');
    }
    score *= modalityBoost(query, row.kind);
    const sourceMetadata = loadJsonSafe(row.source_metadata, {}) as Record<string, unknown>;
    const authority = sourceMetadata.authority;
    if (typeof authority === 'number' && Number.isFinite(authority)) {
      score *= Math.max(0.5, Math.min(1.5, authority));
    }
    candidates.push({ chunkId, row, score });
  }
  candidates.sort((a, b) => b.score - a.score);

  // v1：无 reranker（Python :2119-2131 分支整体跳过，reranked=false）

  // parent 去重 + Jaccard 近重复抑制（:2133-2147）
  const selected: Array<{ chunkId: string; row: ChunkRow; score: number }> = [];
  const selectedTokens: Set<string>[] = [];
  const seenParents = new Set<string>();
  for (const item of candidates) {
    if (seenParents.has(item.row.parent_id)) continue;
    const tokens = lexicalTokens(item.row.text);
    let isDup = false;
    for (const prev of selectedTokens) {
      if (jaccard(tokens, prev) >= MEMORY_CONFIG.near_duplicate_threshold) {
        isDup = true;
        break;
      }
    }
    if (isDup) continue;
    seenParents.add(item.row.parent_id);
    selectedTokens.push(tokens);
    selected.push(item);
    if (selected.length >= topK) break;
  }

  const hits: MemoryBankHit[] = [];
  const rawStmt = db.prepare(
    `SELECT raw_sha256, raw_mime FROM units
     WHERE parent_id = ? AND raw_sha256 <> ''
     ORDER BY CASE WHEN kind = 'image' THEN 0 ELSE 1 END, ordinal LIMIT 1`,
  );
  for (const item of selected) {
    const row = item.row;
    const raw = rawStmt.get(row.parent_id) as
      | { raw_sha256: string; raw_mime: string }
      | undefined;
    const context = loadJsonSafe(row.parent_context, {}) as Record<string, unknown>;
    const sourceMetadata = loadJsonSafe(row.source_metadata, {}) as Record<string, unknown>;
    let citation = `${row.filename} (v${row.source_version})`;
    if (context.page) citation += `，第 ${String(context.page)} 页`;
    if (context.sheet) citation += `，${String(context.sheet)}`;
    const provenance: HitProvenance = {
      pack_id: packId,
      checksum: row.raw_sha256,
      source_version: row.source_version,
      context,
      parent_char_start: row.start_char,
      parent_char_end: row.end_char,
      unit_ids: loadJsonSafe(row.unit_ids_json, []) as unknown[],
    };
    hits.push({
      text: row.parent_text,
      matched_text: row.text,
      source: row.filename,
      score: Math.round(item.score * 1e6) / 1e6,
      chunk_id: row.chunk_id,
      parent_id: row.parent_id,
      source_id: row.source_id,
      kind: row.kind,
      citation,
      provenance,
      metadata: sourceMetadata,
      raw_uri: `memory://${packId}/${raw ? raw.raw_sha256 : row.raw_sha256}`,
      raw_mime: raw ? raw.raw_mime : row.source_mime,
      retrieval_channels: [...(channels.get(item.chunkId) ?? [])].sort(),
    });
  }
  return hits;
}

/** query 包装（Python :2191-2206）：{data:{hits}, meta:{...}}。 */
export function queryPack(
  packId: string,
  query: string,
  opts: QueryOptions = {},
): {
  data: { hits: MemoryBankHit[] };
  meta: {
    pack_id: string;
    query: string;
    rag_backend: 'hybrid' | 'keyword+structure';
    reranked: boolean;
    latency_ms: number;
  };
} {
  const started = Date.now();
  const hits = retrieve(packId, query, opts);
  const denseUsed = hits.some((h) => h.retrieval_channels.includes('vector'));
  return {
    data: { hits },
    meta: {
      pack_id: packId,
      query,
      rag_backend: denseUsed ? 'hybrid' : 'keyword+structure',
      reranked: false,
      latency_ms: Math.round((Date.now() - started) * 100) / 100,
    },
  };
}

/** 评测（Python evaluate_retrieval :2211-2275）—— v1 内部保留，无 HTTP 路由。 */
export function evaluateRetrieval(
  packId: string,
  cases: Array<{ query: string; relevant_source_ids: string[]; filters?: Record<string, unknown> }>,
  opts: { top_k?: number; filters?: Record<string, unknown> } = {},
): Record<string, unknown> {
  if (cases.length === 0) {
    throw new MemoryBankError('EMPTY_EVALUATION', 'Evaluation cases cannot be empty');
  }
  const topK = opts.top_k ?? 10;
  const perCase: Record<string, unknown>[] = [];
  let totalReturned = 0;
  let totalRelevantReturned = 0;
  let totalGold = 0;
  let totalRelevantSources = 0;
  for (const c of cases) {
    const gold = new Set((c.relevant_source_ids ?? []).map(String));
    if (gold.size === 0) {
      throw new MemoryBankError('INVALID_EVALUATION_CASE', 'Each case needs relevant_source_ids');
    }
    const hits = retrieve(packId, c.query, {
      top_k: topK,
      filters: { ...(opts.filters ?? {}), ...(c.filters ?? {}) },
    });
    const relevantFlags = hits.map((h) => gold.has(h.source_id));
    const relevantSources = new Set(hits.filter((h) => gold.has(h.source_id)).map((h) => h.source_id));
    const returnedRelevant = relevantFlags.filter(Boolean).length;
    const precision = hits.length > 0 ? returnedRelevant / hits.length : 0;
    const recall = relevantSources.size / gold.size;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const firstHit = relevantFlags.findIndex(Boolean);
    const reciprocalRank = firstHit >= 0 ? 1 / (firstHit + 1) : 0;
    let dcg = 0;
    relevantFlags.forEach((flag, index) => {
      if (flag) dcg += 1 / Math.log2(index + 2);
    });
    const idealCount = Math.min(gold.size, topK);
    let idcg = 0;
    for (let i = 0; i < idealCount; i++) idcg += 1 / Math.log2(i + 2);
    perCase.push({
      query: c.query,
      precision,
      recall,
      f1,
      reciprocal_rank: reciprocalRank,
      ndcg: idcg > 0 ? dcg / idcg : 0,
      hit: relevantSources.size > 0,
      returned: hits.length,
    });
    totalReturned += hits.length;
    totalRelevantReturned += returnedRelevant;
    totalRelevantSources += relevantSources.size;
    totalGold += gold.size;
  }
  const macro = (key: string): number =>
    perCase.reduce((sum, item) => sum + (item[key] as number), 0) / perCase.length;
  const microPrecision = totalReturned > 0 ? totalRelevantReturned / totalReturned : 0;
  const microRecall = totalGold > 0 ? totalRelevantSources / totalGold : 0;
  const microF1 =
    microPrecision + microRecall > 0
      ? (2 * microPrecision * microRecall) / (microPrecision + microRecall)
      : 0;
  return {
    cases: perCase,
    macro: {
      context_precision: macro('precision'),
      source_recall: macro('recall'),
      f1: macro('f1'),
      recall_at_k: macro('hit'),
      mrr: macro('reciprocal_rank'),
      ndcg: macro('ndcg'),
    },
    micro: { context_precision: microPrecision, source_recall: microRecall, f1: microF1 },
    top_k: topK,
    metric_scope: 'retrieval/source-level; generation claim F1 requires a separate claim evaluator',
  };
}
