/**
 * ingest.ts — 摄入管线（Python ingest_text :1600-1615 / ingest_file :1617-1645 /
 * ingest_folder :1653-1731 / _ingest_bytes :1733-1886 的 TS 直译）。
 *
 * 事务语义逐条对齐：
 *   1. manifest 校验 + 扩展名/空文件守卫；
 *   2. deduplicate：同 filename+sha256 且 done → 返回既有 source_dict + deduplicated:true；
 *   3. 版本链：同 filename 最新 done 版本 → version+1 / supersedes；旧行 is_latest→0；
 *   4. blob 先落盘（内容寻址，幂等）；sources 行 status='processing' 先提交；
 *   5. 解析 → parents → children →（v1 无 embedder）→ BEGIN 写 parents/units/
 *      links/chunks/chunks_fts → sources 行 done + revision++ → commit；
 *   6. 任何异常 → rollback + sources 行 failed + 重新抛出。
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { MemoryBankError, packNotFound, sourceNotFound } from './errors';
import { P0_EXTENSIONS, mimeForExtension } from './config';
import { blobPath, loadManifest, manifestPath, packDir, safeSuffix, atomicWrite, validateSha } from './paths';
import { connect, bumpRevision, closePack } from './db';
import { invalidateVectorCache } from './vector';
import { ftsText, nowIso, sha256Hex } from './text';
import { parseUnits } from './parsers';
import { buildParents, buildChildren } from './structure';
import type {
  FolderIngestResult,
  FolderFileResult,
  FolderOptions,
  IngestOptions,
  SourceDict,
  Unit,
} from './types';

type Database = ReturnType<typeof connect>;

function jsonCompact(value: unknown): string {
  return JSON.stringify(value);
}

function loadJsonSafe(raw: string | null | undefined, fallback: unknown): unknown {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

interface SourceRow {
  source_id: string;
  filename: string;
  extension: string;
  mime_type: string;
  raw_sha256: string;
  size_bytes: number;
  status: string;
  version: number;
  supersedes: string | null;
  is_latest: number;
  metadata_json: string;
  warnings_json: string;
  error_message: string;
  unit_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export function sourceDict(row: SourceRow): SourceDict {
  return {
    source_id: row.source_id,
    filename: row.filename,
    source_name: row.filename,
    extension: row.extension,
    mime_type: row.mime_type,
    checksum: row.raw_sha256,
    size_bytes: row.size_bytes,
    ingest_status: row.status,
    version: row.version,
    supersedes: row.supersedes,
    is_latest: row.is_latest === 1,
    metadata: loadJsonSafe(row.metadata_json, {}) as Record<string, unknown>,
    warnings: loadJsonSafe(row.warnings_json, []) as unknown[],
    error_message: row.error_message,
    unit_count: row.unit_count,
    chunk_count: row.chunk_count,
    imported_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getRow(db: Database, sourceId: string): SourceRow {
  const row = db.prepare('SELECT * FROM sources WHERE source_id = ?').get(sourceId) as
    | SourceRow
    | undefined;
  if (!row) throw sourceNotFound(sourceId);
  return row;
}

/** blob 落盘：已存在即跳过（内容寻址天然幂等）。校验和由调用方传入并核对。 */
function storeBlob(packId: string, data: Buffer, suffix: string, expectedSha: string): string {
  const digest = sha256Hex(data);
  if (expectedSha && digest !== expectedSha) {
    throw new MemoryBankError('BLOB_CHECKSUM_MISMATCH', 'Blob checksum mismatch', 500);
  }
  const target = blobPath(packId, digest, suffix);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  }
  return digest;
}

export function getBlob(packId: string, sha256: string): { data: Buffer; mimeType: string } {
  loadManifest(packId);
  validateSha(sha256);
  const folder = path.join(packDir(packId), 'blobs', sha256.slice(0, 2));
  let matches: string[] = [];
  if (fs.existsSync(folder)) {
    matches = fs.readdirSync(folder).filter((f) => f.startsWith(sha256) && f.length > sha256.length);
  }
  if (matches.length === 0) {
    throw new MemoryBankError('BLOB_NOT_FOUND', `Blob not found: ${sha256}`, 404);
  }
  const file = path.join(folder, matches[0]);
  const ext = path.extname(file).toLowerCase();
  return { data: fs.readFileSync(file), mimeType: mimeForExtension(ext) };
}

// ── 三入口 ───────────────────────────────────────────────────────────────────

export function ingestText(
  packId: string,
  text: string,
  opts: IngestOptions = {},
): SourceDict & { pack_id: string; deduplicated: boolean } {
  if (!text || !text.trim()) {
    throw new MemoryBankError('EMPTY_TEXT', 'Cannot ingest empty text');
  }
  let sourceName = opts.source_name ?? 'inline.txt';
  if (!path.extname(sourceName)) sourceName += '.txt';
  return ingestBytes(
    packId,
    Buffer.from(text, 'utf-8'),
    sourceName,
    'text/plain; charset=utf-8',
    opts.metadata ?? {},
    opts.deduplicate !== false,
  );
}

export function ingestFile(
  packId: string,
  data: Buffer,
  filename: string,
  mimeArg: string,
  metadata: Record<string, unknown> = {},
  deduplicate = true,
): SourceDict & { pack_id: string; deduplicated: boolean } {
  if (!filename) {
    throw new MemoryBankError('FILENAME_REQUIRED', 'filename is required when uploading bytes');
  }
  if (data.length > 64 * 1024 * 1024) {
    throw new MemoryBankError('FILE_TOO_LARGE', 'File exceeds the configured limit', 413);
  }
  const mime = mimeArg || 'application/octet-stream';
  return ingestBytes(packId, data, filename, mime, metadata, deduplicate);
}

export function ingestFolder(
  packId: string,
  folder: string,
  opts: FolderOptions = {},
): FolderIngestResult {
  loadManifest(packId);
  const root = folder;
  if (!fs.existsSync(root)) {
    throw new MemoryBankError('FOLDER_NOT_FOUND', `Folder not found: ${root}`, 404);
  }
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) {
    throw new MemoryBankError('NOT_A_FOLDER', `Not a directory: ${root}`);
  }
  const recursive = opts.recursive !== false;
  const candidates: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else if (entry.isFile()) {
        candidates.push(full);
      }
    }
  };
  walk(root);
  candidates.sort();
  if (candidates.length > 64 * 1024 * 1024) {
    // 不可达：上限是文件数，防御写错
    throw new MemoryBankError('FOLDER_TOO_MANY_FILES', 'Folder holds too many files', 413);
  }
  if (candidates.length > 2000) {
    throw new MemoryBankError(
      'FOLDER_TOO_MANY_FILES',
      `Folder holds ${candidates.length} files; the limit is 2000`,
      413,
    );
  }

  const counts = { ingested: 0, deduplicated: 0, skipped: 0, failed: 0 };
  const files: FolderFileResult[] = [];
  for (const full of candidates) {
    const rel = path.relative(root, full).split(path.sep).join('/');
    const record: FolderFileResult = { file: rel, status: 'skipped' };
    const suffix = safeSuffix(path.basename(full));
    if (!P0_EXTENSIONS.has(suffix) && !isKnownExtension(suffix)) {
      record.status = 'skipped';
      record.code = 'UNSUPPORTED_FORMAT';
    } else if (isKnownButUnsupported(suffix)) {
      record.status = 'skipped';
      record.code = 'UNSUPPORTED_FORMAT';
    } else if (!P0_EXTENSIONS.has(suffix)) {
      record.status = 'skipped';
      record.code = 'UNSUPPORTED_FORMAT';
    } else {
      try {
        const size = fs.statSync(full).size;
        if (size === 0) {
          record.status = 'skipped';
          record.code = 'EMPTY_FILE';
        } else if (size > 64 * 1024 * 1024) {
          record.status = 'skipped';
          record.code = 'FILE_TOO_LARGE';
        } else {
          const data = fs.readFileSync(full);
          const metadata = { ...(opts.metadata ?? {}), source_path: rel };
          try {
            const result = ingestFile(packId, data, path.basename(full), '', metadata, opts.deduplicate !== false);
            if (result.deduplicated) {
              record.status = 'deduplicated';
              record.source_id = result.source_id;
            } else {
              record.status = 'ingested';
              record.source_id = result.source_id;
            }
          } catch (err) {
            if (err instanceof MemoryBankError) {
              record.status = 'failed';
              record.code = err.code;
              record.message = err.message;
            } else {
              record.status = 'failed';
              record.code = 'INGEST_FAILED';
              record.message = (err as Error).message;
            }
          }
        }
      } catch (err) {
        record.status = 'failed';
        record.code = 'READ_FAILED';
        record.message = (err as Error).message;
      }
    }
    files.push(record);
    counts[record.status] += 1;
  }
  return {
    folder: root,
    recursive,
    total: candidates.length,
    ...counts,
    files,
  };
}

function isKnownExtension(suffix: string): boolean {
  return [
    '.xlsx', '.xlsm', '.docx', '.pdf',
    '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff',
  ].includes(suffix);
}

function isKnownButUnsupported(suffix: string): boolean {
  return isKnownExtension(suffix);
}

// ── 核心事务管线（_ingest_bytes 直译） ───────────────────────────────────────

function ingestBytes(
  packId: string,
  data: Buffer,
  filenameRaw: string,
  mimeType: string,
  metadata: Record<string, unknown>,
  deduplicate: boolean,
): SourceDict & { pack_id: string; deduplicated: boolean } {
  loadManifest(packId);
  const filename = path.basename(filenameRaw).trim();
  if (!filename) {
    throw new MemoryBankError('INVALID_FILENAME', 'Filename cannot be empty');
  }
  const suffix = safeSuffix(filename);
  if (!P0_EXTENSIONS.has(suffix)) {
    throw new MemoryBankError(
      'UNSUPPORTED_FORMAT',
      `Unsupported file extension: ${suffix}`,
      415,
    );
  }
  if (data.length === 0) {
    throw new MemoryBankError('EMPTY_FILE', 'Cannot ingest an empty file');
  }
  const digest = sha256Hex(data);
  const sourceId = randomUUID().replace(/-/g, '');
  const now = nowIso();

  const db = connect(packId);
  if (deduplicate) {
    const duplicate = db
      .prepare(
        `SELECT * FROM sources
         WHERE filename = ? AND raw_sha256 = ? AND status = 'done'
         ORDER BY version DESC LIMIT 1`,
      )
      .get(filename, digest) as SourceRow | undefined;
    if (duplicate) {
      return {
        ...sourceDict(duplicate),
        pack_id: packId,
        deduplicated: true,
      };
    }
  }
  const previous = db
    .prepare(
      `SELECT source_id, version FROM sources
       WHERE filename = ? AND status = 'done'
       ORDER BY version DESC LIMIT 1`,
    )
    .get(filename) as { source_id: string; version: number } | undefined;
  const version = previous ? previous.version + 1 : 1;
  const supersedes = previous ? previous.source_id : null;
  storeBlob(packId, data, suffix, digest);
  db.prepare(
    `INSERT INTO sources(
       source_id, filename, extension, mime_type, raw_sha256, size_bytes,
       status, version, supersedes, is_latest, metadata_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?, 0, ?, ?, ?)`,
  ).run(
    sourceId, filename, suffix, mimeType, digest, data.length,
    version, supersedes, jsonCompact(metadata), now, now,
  );

  try {
    const units: Unit[] = parseUnits(filename, data, mimeType);
    if (units.length === 0) {
      throw new MemoryBankError('NO_CONTENT', 'Parser found no searchable content', 422);
    }
    const parents = buildParents(sourceId, units);
    const storedUnits: Unit[] = parents.flatMap((p) => p.units);
    const children = buildChildren(parents);
    if (children.length === 0) {
      throw new MemoryBankError('NO_CONTENT', 'No chunks were produced', 422);
    }
    // v1：embedder=null，embedding/embedding_dim 均为 NULL，embedding_model 为 ''

    const insertParent = db.prepare(
      `INSERT INTO parents(parent_id, source_id, ordinal, kind, text, context_json, unit_ids_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertUnit = db.prepare(
      `INSERT INTO units(unit_id, source_id, parent_id, ordinal, kind, text, group_key,
                         context_json, data_json, raw_sha256, raw_mime)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLink = db.prepare(
      `INSERT OR REPLACE INTO links(src_unit_id, dst_unit_id, relation, weight)
       VALUES (?, ?, 'next', 1.0)`,
    );
    const insertChunk = db.prepare(
      `INSERT INTO chunks(chunk_id, parent_id, source_id, ordinal, kind, start_char, end_char,
                          text, context_json, unit_ids_json, embedding, embedding_dim, embedding_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '')`,
    );
    const insertFts = db.prepare(
      'INSERT INTO chunks_fts(chunk_id, index_text) VALUES (?, ?)',
    );

    db.exec('BEGIN IMMEDIATE');
    try {
      if (previous) {
        db.prepare('UPDATE sources SET is_latest = 0, updated_at = ? WHERE filename = ?').run(
          nowIso(),
          filename,
        );
      }
      for (const parent of parents) {
        insertParent.run(
          parent.parent_id, parent.source_id, parent.ordinal, parent.kind, parent.text,
          jsonCompact(parent.context), jsonCompact(parent.units.map((u) => u.unit_id)),
        );
      }
      storedUnits.forEach((unit, ordinal) => {
        insertUnit.run(
          unit.unit_id, sourceId, unit.parent_id, ordinal, unit.kind, unit.text,
          unit.group_key, jsonCompact(unit.context), jsonCompact(unit.data),
          unit.raw_sha256, unit.raw_mime,
        );
        if (ordinal > 0) {
          insertLink.run(storedUnits[ordinal - 1].unit_id, unit.unit_id);
        }
      });
      for (const child of children) {
        insertChunk.run(
          child.chunk_id, child.parent_id, sourceId, child.ordinal, child.kind,
          child.start_char, child.end_char, child.text,
          jsonCompact(child.context), jsonCompact(child.unit_ids),
        );
        insertFts.run(child.chunk_id, ftsText(`${child.text} ${filename}`));
      }
      db.prepare(
        `UPDATE sources SET status = 'done', is_latest = 1, unit_count = ?,
           chunk_count = ?, updated_at = ?, error_message = '' WHERE source_id = ?`,
      ).run(storedUnits.length, children.length, nowIso(), sourceId);
      bumpRevision(db);
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }
    invalidateVectorCache(packId);
    refreshManifest(packId, db);
    const result = sourceDict(getRow(db, sourceId));
    return { ...result, pack_id: packId, deduplicated: false };
  } catch (err) {
    // 兜底回滚：事务已结束（COMMIT 后 / 内层已回滚）时忽略本句错误，保留原始异常
    try {
      db.exec('ROLLBACK');
    } catch {
      /* no active transaction */
    }
    const message =
      err instanceof MemoryBankError
        ? err.message
        : `${(err as Error).name}: ${(err as Error).message}`;
    db.prepare(
      `UPDATE sources SET status = 'failed', is_latest = 0,
         error_message = ?, updated_at = ? WHERE source_id = ?`,
    ).run(message, nowIso(), sourceId);
    refreshManifest(packId, db);
    if (err instanceof MemoryBankError) throw err;
    throw new MemoryBankError('INGEST_FAILED', `Ingest failed: ${message}`, 500);
  }
}

/** 刷新 manifest 的 stats/status（Python _refresh_manifest :1188-1194）。 */
function refreshManifest(packId: string, db: Database): void {
  const manifest = loadManifest(packId);
  manifest.stats = stats(packId, db);
  const failed = (
    db.prepare(`SELECT COUNT(*) AS n FROM sources WHERE status = 'failed'`).get() as { n: number }
  ).n;
  const processing = (
    db.prepare(`SELECT COUNT(*) AS n FROM sources WHERE status = 'processing'`).get() as { n: number }
  ).n;
  manifest.status = processing > 0 ? 'indexing' : failed > 0 ? 'degraded' : 'ready';
  manifest.updated_at = nowIso();
  atomicWrite(manifestPath(packId), JSON.stringify(manifest, null, 2));
}

/** 实时统计（Python stats :1084-1097）。 */
export function stats(packId: string, db?: Database): {
  sources: number; units: number; parents: number; chunks: number; bytes: number;
} {
  const conn = db ?? connect(packId);
  const row = conn
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM sources WHERE status = 'done') AS sources,
         (SELECT COUNT(*) FROM units) AS units,
         (SELECT COUNT(*) FROM parents) AS parents,
         (SELECT COUNT(*) FROM chunks) AS chunks,
         COALESCE((SELECT SUM(size_bytes) FROM sources WHERE status = 'done'), 0) AS bytes`,
    )
    .get() as { sources: number; units: number; parents: number; chunks: number; bytes: number };
  return {
    sources: Number(row.sources),
    units: Number(row.units),
    parents: Number(row.parents),
    chunks: Number(row.chunks),
    bytes: Number(row.bytes),
  };
}

// ── 删除（Python delete_source :1155-1186） ─────────────────────────────────

export function deleteSource(packId: string, sourceId: string): void {
  loadManifest(packId);
  const db = connect(packId);
  const row = db
    .prepare('SELECT filename, raw_sha256, is_latest FROM sources WHERE source_id = ?')
    .get(sourceId) as { filename: string; raw_sha256: string; is_latest: number } | undefined;
  if (!row) throw sourceNotFound(sourceId);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM sources WHERE source_id = ?').run(sourceId);
    if (row.is_latest === 1) {
      const previous = db
        .prepare(
          `SELECT source_id FROM sources
           WHERE filename = ? AND status = 'done'
           ORDER BY version DESC LIMIT 1`,
        )
        .get(row.filename) as { source_id: string } | undefined;
      if (previous) {
        db.prepare('UPDATE sources SET is_latest = 1, updated_at = ? WHERE source_id = ?').run(
          nowIso(),
          previous.source_id,
        );
      }
    }
    const remaining = (
      db.prepare('SELECT COUNT(*) AS n FROM sources WHERE raw_sha256 = ?').get(row.raw_sha256) as {
        n: number;
      }
    ).n;
    bumpRevision(db);
    db.exec('COMMIT');
    invalidateVectorCache(packId);
    if (remaining === 0) {
      const folder = path.join(packDir(packId), 'blobs', row.raw_sha256.slice(0, 2));
      if (fs.existsSync(folder)) {
        for (const f of fs.readdirSync(folder)) {
          if (f.startsWith(row.raw_sha256)) {
            try {
              fs.unlinkSync(path.join(folder, f));
            } catch {
              /* best-effort */
            }
          }
        }
      }
    }
    refreshManifest(packId, db);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function deletePackFiles(packId: string): void {
  loadManifest(packId);
  closePack(packId);
  const dir = packDir(packId);
  for (const f of [
    'memory_bank.sqlite',
    'memory_bank.sqlite-wal',
    'memory_bank.sqlite-shm',
    'memory_bank.json',
  ]) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* missing_ok */
    }
  }
  try {
    fs.rmSync(path.join(dir, 'blobs'), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    fs.rmdirSync(dir);
  } catch {
    /* 非空则留给用户 */
  }
}

export { packNotFound };
