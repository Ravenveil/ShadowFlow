/**
 * sqlite.ts — Story 15.16 — single sqlite connection for the server.
 *
 * Why singleton:
 *   better-sqlite3 is sync; opening multiple connections to the same WAL db
 *   is supported but pointless for our single-process server. One handle,
 *   reused across routes.
 *
 * Boot sequence:
 *   1. mkdir .shadowflow/ (cwd-relative — matches existing JSON storage).
 *   2. Open / create app.sqlite.
 *   3. journal_mode = WAL (better crash safety + reader/writer parallelism).
 *   4. foreign_keys = ON (off by default in sqlite, must opt in).
 *   5. busy_timeout = 5s (avoid SQLITE_BUSY on concurrent route handlers).
 *   6. Run migrations/001-init.sql (idempotent — IF NOT EXISTS everywhere).
 *
 * Test isolation: _resetForTests() closes the handle so tests can chdir to
 * an isolated tmp dir and call getDb() again — the next getDb() call reads
 * the fresh cwd.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let _db: Database.Database | null = null;
let _initialized = false;

function paths() {
  const cwd = process.cwd();
  const dir = path.join(cwd, '.shadowflow');
  const file = path.join(dir, 'app.sqlite');
  // migrations live next to the compiled / source tree at server/migrations/.
  // __dirname when run via tsx points into server/src/storage, so go up two.
  const migration = path.join(__dirname, '..', '..', 'migrations', '001-init.sql');
  return { dir, file, migration };
}

/**
 * Add a column to a table if it isn't already present. Idempotent: reads
 * PRAGMA table_info and only issues ALTER TABLE when the column is missing.
 * `colDef` is the SQLite type/affinity (e.g. 'TEXT') — keep it nullable with
 * no NOT NULL/UNIQUE so the ALTER can never fail on an existing populated table.
 */
function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  colDef: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`);
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const { dir, file, migration } = paths();
  const dbExisted = fs.existsSync(file);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Always run the DDL — every statement is IF NOT EXISTS so re-running on
  // an existing db is a no-op. This also makes brand-new test cwds work.
  const ddl = fs.readFileSync(migration, 'utf-8');
  db.exec(ddl);

  // ── Idempotent additive column migrations ────────────────────────────────
  // SQLite has no `ADD COLUMN IF NOT EXISTS`, and CREATE TABLE IF NOT EXISTS
  // skips column changes on a db that already has the table. So for columns
  // added after the initial schema we ADD them only when absent. Each entry is
  // best-effort additive (nullable, no default constraint that could fail) so
  // an existing db is upgraded in place without a destructive rebuild.
  addColumnIfMissing(db, 'messages', 'timeline_message_id', 'TEXT');
  // B1 统一会话内核（2026-06-11）— 与 Python 群聊体系的显式互链：
  // conversation.group_id ↔ group.conversation_id（groups.py 同日加）。
  addColumnIfMissing(db, 'conversations', 'group_id', 'TEXT');
  // 后端合一·阶段0（2026-06-12）— 持久 run 索引（storage/run-index.ts）。
  // session↔conversation 映射不再依赖内存 sessionStore 的 TTL 生命周期。
  db.exec(`CREATE TABLE IF NOT EXISTS run_index (
    session_id TEXT PRIMARY KEY,
    conversation_id TEXT,
    goal TEXT NOT NULL DEFAULT '',
    status TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_run_index_conversation ON run_index(conversation_id);`);

  // 后端合一·阶段1a（2026-06-12）— Node 侧群存储（storage/groups-store.ts），
  // 与 Python shadowflow/api/groups.py 的 JSON-file 群记录逐字段等价。1a 只产数据层，
  // 路由/开关由 1b 接入。蛇形列名对齐 Python record，list/dict 字段以 TEXT(JSON) 存。
  //   groups：群/DM 会话头（kind='group'|'dm'）。archived INTEGER(0/1)；
  //           agent_ids/member_emails/policy_matrix/user_settings 存 JSON 文本。
  //   group_messages：每条消息一行（拆出 messages 数组）；reactions 存 JSON 文本，
  //                   pinned INTEGER(0/1)；idx(group_id, timestamp) 支撑按时间升序读。
  db.exec(`CREATE TABLE IF NOT EXISTS groups (
    group_id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    template_id TEXT NOT NULL DEFAULT '',
    group_template_id TEXT NOT NULL DEFAULT '',
    agent_ids TEXT NOT NULL DEFAULT '[]',
    member_emails TEXT NOT NULL DEFAULT '[]',
    policy_matrix TEXT NOT NULL DEFAULT '{}',
    workspace_id TEXT,
    workspace_dir TEXT,
    team_id TEXT,
    kind TEXT NOT NULL DEFAULT 'group',
    conversation_id TEXT,
    announcement TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    user_settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_groups_workspace ON groups(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_groups_kind ON groups(kind);

  CREATE TABLE IF NOT EXISTS group_messages (
    message_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    sender_name TEXT NOT NULL DEFAULT 'user',
    sender_kind TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL,
    reply_to TEXT,
    reactions TEXT NOT NULL DEFAULT '{}',
    pinned INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, timestamp);`);

  _db = db;
  _initialized = true;
  console.log(`[sqlite] db ${dbExisted ? 'loaded' : 'initialized'} at ${file}`);
  return db;
}

/** Idempotent boot wrapper — call once from index.ts at startup. */
export function initSqlite(): Database.Database {
  return getDb();
}

/** Test helper: close handle so the next getDb() picks up a new cwd. */
export function _resetForTests(): void {
  if (_db) {
    try {
      _db.close();
    } catch {
      /* ignore */
    }
    _db = null;
    _initialized = false;
  }
}

export function isInitialized(): boolean {
  return _initialized;
}
