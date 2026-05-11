/**
 * runs.ts — sqlite persistence for RunRecord.
 *
 * Story 15.8 — original JSON file implementation.
 * Story 15.16 — internals migrated to sqlite. Public API (listRuns, saveRun,
 *               MAX_RUNS, _resetForTests) and types are byte-compatible with
 *               the JSON era so 15.8 callers and tests don't change.
 *
 * MAX_RUNS cap is preserved in saveRun(): after every insert we delete
 * everything older than the MAX_RUNS most recent rows.
 */

import fs from 'fs';
import path from 'path';
import { getDb, _resetForTests as _resetSqliteForTests } from './sqlite';

export const MAX_RUNS = 100;

export type ArtifactType = 'yaml' | 'html' | 'markdown';
export type RunStatus = 'completed' | 'failed';

export interface RunRecord {
  run_id: string;
  session_id: string;
  goal: string;
  skill_name: string;
  skill_display_name: string;
  artifact_type: ArtifactType | null;
  artifact_filename: string | null;
  artifact_url: string | null;
  status: RunStatus;
  created_at: string;
  completed_at: string;
  project_dir: string;
}

interface RunRow {
  run_id: string;
  session_id: string;
  project_id: string | null;
  conversation_id: string | null;
  goal: string;
  skill_name: string | null;
  skill_display_name: string | null;
  artifact_type: ArtifactType | null;
  artifact_filename: string | null;
  artifact_url: string | null;
  project_dir: string | null;
  status: string;
  created_at: string;
  completed_at: string;
}

function rowToRecord(r: RunRow): RunRecord {
  // Coerce status to the 15.8-public union — anything weird falls back to
  // 'completed' to keep the type system honest.
  const status: RunStatus =
    r.status === 'completed' || r.status === 'failed' ? r.status : 'completed';
  return {
    run_id: r.run_id,
    session_id: r.session_id,
    goal: r.goal,
    skill_name: r.skill_name ?? '',
    skill_display_name: r.skill_display_name ?? '',
    artifact_type: r.artifact_type,
    artifact_filename: r.artifact_filename,
    artifact_url: r.artifact_url,
    status,
    created_at: r.created_at,
    completed_at: r.completed_at,
    project_dir: r.project_dir ?? '',
  };
}

/**
 * listRuns — all persisted runs sorted by completed_at DESC (newest first).
 * Safe to call with an empty table (returns []).
 */
export function listRuns(): RunRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM runs ORDER BY completed_at DESC`)
    .all() as RunRow[];
  return rows.map(rowToRecord);
}

/**
 * saveRun — UPSERT then trim to MAX_RUNS most recent rows.
 *
 * Uses INSERT OR REPLACE so re-saving the same run_id (rare but possible if
 * a callback fires twice) doesn't blow up. The trim step deletes everything
 * older than the MAX_RUNS-th newest row.
 */
export function saveRun(record: RunRecord): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO runs
       (run_id, session_id, project_id, conversation_id, goal,
        skill_name, skill_display_name, artifact_type, artifact_filename,
        artifact_url, project_dir, status, created_at, completed_at)
       VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      record.run_id,
      record.session_id,
      record.goal,
      record.skill_name,
      record.skill_display_name,
      record.artifact_type,
      record.artifact_filename,
      record.artifact_url,
      record.project_dir,
      record.status,
      record.created_at,
      record.completed_at,
    );

    // Trim: delete every row whose completed_at is older than the MAX_RUNS-th
    // newest. Sub-select picks the cutoff timestamp; if there are fewer than
    // MAX_RUNS rows the LIMIT/OFFSET yields no row → no-op.
    db.prepare(
      `DELETE FROM runs
       WHERE completed_at < (
         SELECT completed_at FROM runs ORDER BY completed_at DESC LIMIT 1 OFFSET ?
       )`,
    ).run(MAX_RUNS - 1);
  });
  tx();
}

export function deleteRun(runId: string): boolean {
  const result = getDb().prepare(`DELETE FROM runs WHERE run_id = ?`).run(runId);
  return result.changes > 0;
}

/**
 * Test-only: drop the sqlite handle AND remove any db file in the current
 * cwd's .shadowflow/ dir.
 *
 * The legacy 15.8 test pattern (see runs.test.ts) chdirs into a fresh tmp
 * dir per test and calls _resetForTests() before/after. To make that pattern
 * work after the sqlite migration we need to (a) close the connection so
 * the next getDb() opens a fresh file in the new cwd, and (b) wipe any
 * leftover sqlite + JSON files so each test really starts empty.
 */
export function _resetForTests(): void {
  _resetSqliteForTests();
  const dir = path.join(process.cwd(), '.shadowflow');
  for (const name of [
    'app.sqlite',
    'app.sqlite-wal',
    'app.sqlite-shm',
    'app.sqlite-journal',
    'runs.json',
  ]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}
