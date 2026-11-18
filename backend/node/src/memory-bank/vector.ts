/**
 * vector.ts — 向量存储/余弦/RRF 纯 TS 实现（Python :614-623, :1948-2035, :2088-2147）。
 *
 * v1 裁剪：embedder=null → dense rankings 恒空，但本模块保留完整能力：
 *   - 存储格式与 Python 逐字节兼容：小端 float32 BLOB（struct.pack(f"<{n}f")）。
 *     注意 Buffer 可能非 4 字节对齐，必须逐 readFloatLE，不能 new Float32Array(buffer)。
 *   - 入库与查询向量都做 L2 归一化 → 余弦相似度 = 点积（Python :2027 matrix@vector）。
 *   - revision 失效缓存 + 100k 上限（与 Python _cached_vectors 语义一致）。
 */

import type Database from 'better-sqlite3';
import { MemoryBankError } from './errors';
import { MEMORY_CONFIG } from './config';

export interface VectorCacheEntry {
  revision: number;
  ids: string[];
  matrix: Float32Array[];
  createdAt: number;
}

const cache = new Map<string, VectorCacheEntry>();

export function invalidateVectorCache(packId: string): void {
  cache.delete(packId);
}

export function blobToVector(blob: Buffer): Float32Array {
  const out = new Float32Array(Math.floor(blob.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = blob.readFloatLE(i * 4);
  return out;
}

export function vectorToBlob(vector: ArrayLike<number>): Buffer {
  const buf = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) buf.writeFloatLE(vector[i], i * 4);
  return buf;
}

/** L2 归一化（Python _normalize_vector :614-619；零向量/非有限 → INVALID_EMBEDDING）。 */
export function normalizeVector(vector: ArrayLike<number>): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum);
  if (vector.length === 0 || norm === 0 || !Number.isFinite(norm)) {
    throw new MemoryBankError(
      'INVALID_EMBEDDING',
      'Embedder returned an empty or invalid vector',
      500,
    );
  }
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

/** 余弦（输入均已归一化）= 点积。 */
export function cosine(matrix: Float32Array[], query: Float32Array): number[] {
  const scores = new Array<number>(matrix.length);
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    let dot = 0;
    const n = Math.min(row.length, query.length);
    for (let i = 0; i < n; i++) dot += row[i] * query[i];
    scores[r] = dot;
  }
  return scores;
}

/** TopK（等价 np.argpartition + argsort）：返回按分数降序的原下标。 */
export function topKIndices(scores: number[], k: number): number[] {
  const count = Math.min(k, scores.length);
  const idx = scores.map((_, i) => i);
  idx.sort((a, b) => scores[b] - scores[a]);
  return idx.slice(0, count);
}

/**
 * 读取 + 缓存 pack 的向量矩阵（Python _cached_vectors :1948-1981）。
 * revision 不匹配即重建；chunks 超上限返回 null（调用方退化为逐行扫描）。
 * v1 embedder=null 时无人调用，保留以对齐二期。
 */
export function cachedVectors(packId: string, db: Database.Database): VectorCacheEntry | null {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'revision'`).get() as
    | { value: string }
    | undefined;
  const revision = Number(row?.value ?? 0);
  const hit = cache.get(packId);
  if (hit && hit.revision === revision) return hit;
  const countRow = db
    .prepare(`SELECT COUNT(*) AS n FROM chunks WHERE embedding IS NOT NULL`)
    .get() as { n: number };
  if (countRow.n > MEMORY_CONFIG.vector_cache_max_chunks) return null;
  const rows = db
    .prepare(
      `SELECT c.chunk_id AS chunk_id, c.embedding AS embedding FROM chunks c
       JOIN sources s ON s.source_id = c.source_id
       WHERE c.embedding IS NOT NULL AND s.status = 'done' AND s.is_latest = 1
       ORDER BY c.rowid`,
    )
    .all() as Array<{ chunk_id: string; embedding: Buffer }>;
  if (rows.length === 0) return null;
  const dimension = Math.floor(rows[0].embedding.length / 4);
  const matrix: Float32Array[] = [];
  for (const row2 of rows) {
    const vec = blobToVector(row2.embedding);
    if (vec.length !== dimension) {
      throw new MemoryBankError(
        'VECTOR_CORRUPT',
        'Inconsistent stored vector dimensions',
        500,
      );
    }
    matrix.push(vec);
  }
  const entry: VectorCacheEntry = { revision, ids: rows.map((r) => r.chunk_id), matrix, createdAt: Date.now() };
  cache.set(packId, entry);
  return entry;
}
