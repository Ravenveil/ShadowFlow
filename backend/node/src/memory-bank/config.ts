/**
 * config.ts — v1 运行常量（MemoryConfig 的 TS 镜像，Python :209-231）。
 *
 * 全部是字符预算而非 token；值与 Python 默认值完全一致，保证
 * Node 与 Python 在同一 pack 上产出可对拍的结果。
 * v1 裁剪：embedder=null / reranker=null / vision=null（dense 路恒空）。
 */

export const MEMORY_CONFIG = {
  child_size: 420,
  child_overlap: 64,
  parent_size: 1800,
  max_table_rows_per_parent: 24,
  max_file_bytes: 64 * 1024 * 1024,
  max_folder_files: 2000,
  max_table_rows: 200_000,
  candidate_multiplier: 6,
  rrf_k: 60,
  bm25_weight: 1.0,
  vector_weight: 1.0,
  embedding_batch_size: 32,
  vector_cache_max_chunks: 100_000,
  rerank_candidates: 40,
  near_duplicate_threshold: 0.92,
} as const;

/** schema/DB 版本与 Python 常量一致（:164-165），pack 目录互认的前提。 */
export const MB_SCHEMA = 'shadowflow.memory_bank/1';
export const MB_DB_VERSION = 1;

/**
 * v1 支持的扩展名（team-lead 裁剪）：txt/md/markdown/log/json/jsonl/html/htm/csv。
 * xlsx/xlsm/docx/pdf/图片在白名单里但解析器未实现 → UNSUPPORTED_FORMAT 415，
 * 与 Python 对未知扩展名的行为一致（清晰报错，不静默）。
 * _check_ooxml 留待二期（ooxml.ts）。
 */
export const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.log']);
export const P0_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.log',
  '.json', '.jsonl',
  '.html', '.htm',
  '.csv',
]);
/** 支持登记（metadata/去重/版本化），但 v1 解析不了 → 415。 */
export const KNOWN_BUT_UNSUPPORTED = new Set([
  '.xlsx', '.xlsm', '.docx', '.pdf',
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff',
]);

/** 路由层请求上限（对齐 Python Pydantic :2296-2318）。 */
export const LIMITS = {
  pack_name_max: 200,
  text_max: 8_000_000,
  query_max: 8000,
  query_variants_max: 4,
  top_k_default: 5,
  top_k_min: 1,
  top_k_http_max: 20,
  top_k_internal_max: 50,
  path_max: 2000,
} as const;

/** mime 推断的小型映射表（路由 #11 blobs 用；缺省 application/octet-stream）。 */
export const MIME_BY_EXTENSION: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.jsonl': 'application/jsonl',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function mimeForExtension(ext: string): string {
  return MIME_BY_EXTENSION[ext.toLowerCase()] ?? 'application/octet-stream';
}
