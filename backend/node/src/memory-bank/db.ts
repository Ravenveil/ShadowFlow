/**
 * db.ts — per-pack better-sqlite3 连接缓存 + PRAGMA + DDL（Python :857-979）。
 *
 * 关键决策（与设计 §5.2 一致）：
 *   - 不复用 storage/sqlite.ts 的 getDb()：memory bank 是 per-pack 独立文件，
 *     生命周期与 app.sqlite 完全不同，自己缓存连接。
 *   - DDL 与 Python :881-968 逐字一致（CREATE IF NOT EXISTS + user_version 守卫），
 *     因此 Python 建的库 Node 直接打开可用（已实测：user_version=1、FTS5 MATCH+bm25 正常）。
 *   - PRAGMA 与 Python :864-867 一致：foreign_keys/WAL/synchronous/busy_timeout。
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import { dbPath, loadManifest } from './paths';
import { MemoryBankError } from './errors';
import { MB_DB_VERSION } from './config';

const connections = new Map<string, Database.Database>();

const DDL = `
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
    source_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    extension TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    raw_sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    supersedes TEXT REFERENCES sources(source_id) ON DELETE SET NULL,
    is_latest INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    warnings_json TEXT NOT NULL DEFAULT '[]',
    error_message TEXT NOT NULL DEFAULT '',
    unit_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_name ON sources(filename, version);
CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(raw_sha256);
CREATE INDEX IF NOT EXISTS idx_sources_latest ON sources(is_latest, status);

CREATE TABLE IF NOT EXISTS parents (
    parent_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    context_json TEXT NOT NULL,
    unit_ids_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_parents_source ON parents(source_id, ordinal);

CREATE TABLE IF NOT EXISTS units (
    unit_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES parents(parent_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    group_key TEXT NOT NULL,
    context_json TEXT NOT NULL,
    data_json TEXT NOT NULL,
    raw_sha256 TEXT NOT NULL DEFAULT '',
    raw_mime TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_units_source ON units(source_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_units_parent ON units(parent_id);

CREATE TABLE IF NOT EXISTS chunks (
    chunk_id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL REFERENCES parents(parent_id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    text TEXT NOT NULL,
    context_json TEXT NOT NULL,
    unit_ids_json TEXT NOT NULL,
    embedding BLOB,
    embedding_dim INTEGER,
    embedding_model TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_chunks_parent ON chunks(parent_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_kind ON chunks(kind);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    chunk_id UNINDEXED,
    index_text,
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS links (
    src_unit_id TEXT NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
    dst_unit_id TEXT NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY(src_unit_id, dst_unit_id, relation)
);
INSERT OR IGNORE INTO meta(key, value) VALUES ('revision', '0');
PRAGMA user_version = 1;
`;

/** 打开（必要时初始化）一个 pack 的库连接；带进程内缓存。 */
export function connect(packId: string, initialize = false): Database.Database {
  const cached = connections.get(packId);
  if (cached) return cached;
  const file = dbPath(packId);
  if (!initialize && !fs.existsSync(file)) {
    throw new MemoryBankError('PACK_NOT_FOUND', `Knowledge pack not found: ${packId}`, 404);
  }
  fs.mkdirSync(file.substring(0, file.lastIndexOf(process.platform === 'win32' ? '\\' : '/')) || '.', {
    recursive: true,
  });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 30000');
  if (initialize) initializeDb(db);
  else checkVersion(db, packId);
  connections.set(packId, db);
  return db;
}

function checkVersion(db: Database.Database, packId: string): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version !== MB_DB_VERSION) {
    db.close();
    throw new MemoryBankError(
      'DB_SCHEMA_MISMATCH',
      `Unsupported database version: ${version} (pack ${packId})`,
      500,
    );
  }
}

/** 建表（幂等）。user_version 已是 1 的旧库直接跳过 DDL 也安全（IF NOT EXISTS）。 */
export function initializeDb(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version !== 0 && version !== MB_DB_VERSION) {
    throw new MemoryBankError(
      'DB_SCHEMA_MISMATCH',
      `Unsupported database version: ${version}`,
      500,
    );
  }
  db.exec(DDL);
}

export function closePack(packId: string): void {
  const db = connections.get(packId);
  if (db) {
    db.close();
    connections.delete(packId);
  }
}

export function closeAll(): void {
  for (const [id, db] of connections) {
    db.close();
    connections.delete(id);
  }
}

/** 测试用：重置全部连接（不删文件）。 */
export function _resetForTests(): void {
  closeAll();
}

/** bump meta.revision（Python _bump_revision :985-986）。 */
export function bumpRevision(db: Database.Database): void {
  db.prepare(
    `UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'revision'`,
  ).run();
}

/** pack 存在性校验：manifest 必须可读且 schema 一致（所有入口共用）。 */
export function requireManifest(packId: string): Record<string, unknown> {
  return loadManifest(packId);
}
