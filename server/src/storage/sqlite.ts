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
