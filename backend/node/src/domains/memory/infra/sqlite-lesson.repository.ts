/**
 * memory 域 — lessons SQLite Repository 实现（外部，技术变化驱动）
 *
 * 这是「换存储只改这一处」的落点。SQL 全部锁在本文件，
 * use_cases 与 adapters 只认 LessonRepository 接口。
 * 逐字对齐原 storage/memory-lessons.ts 的 SQL，保证零回归。
 */

import { getDb } from '../../../storage/sqlite';
import { getSetting } from '../../../storage/settings';
import type { MemoryLesson } from '../lessons-model';
import type { LessonListOptions, LessonRepository } from '../lessons-repository';

function now(): number {
  return Date.now();
}

export class SqliteLessonRepository implements LessonRepository {
  get(id: string): MemoryLesson | undefined {
    return getDb().prepare(`SELECT * FROM memory_lessons WHERE id = ?`).get(id) as
      | MemoryLesson
      | undefined;
  }

  list(opts: LessonListOptions): MemoryLesson[] {
    let sql = `SELECT * FROM memory_lessons WHERE 1=1`;
    const args: unknown[] = [];
    if (opts.scope_key) {
      sql += ` AND scope_key = ?`;
      args.push(opts.scope_key);
    }
    if (opts.kind) {
      sql += ` AND kind = ?`;
      args.push(opts.kind);
    }
    if (!opts.includeArchived) sql += ` AND archived = 0`;
    sql += ` ORDER BY score DESC, updated_at DESC LIMIT ?`;
    args.push(Math.min(Math.max(opts.limit ?? 100, 1), 500));
    return getDb().prepare(sql).all(...args) as MemoryLesson[];
  }

  candidates(limit: number): MemoryLesson[] {
    return getDb()
      .prepare(
        `SELECT * FROM memory_lessons
         WHERE archived = 0
         ORDER BY score DESC, hits DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as MemoryLesson[];
  }

  byScope(scope_key: string, task_type: string): MemoryLesson[] {
    return getDb()
      .prepare(
        `SELECT id, content, score, hits, created_at FROM memory_lessons
         WHERE scope_key = ? AND task_type = ? AND archived = 0
         ORDER BY score DESC, hits DESC, created_at DESC`,
      )
      .all(scope_key, task_type) as MemoryLesson[];
  }

  insert(lesson: MemoryLesson): void {
    getDb()
      .prepare(
        `INSERT INTO memory_lessons (id, kind, scope_key, task_type, title, content,
                                     source, source_ref, score, hits, archived, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        lesson.id,
        lesson.kind,
        lesson.scope_key,
        lesson.task_type,
        lesson.title,
        lesson.content,
        lesson.source,
        lesson.source_ref,
        lesson.score,
        lesson.hits,
        lesson.archived,
        lesson.created_at,
        lesson.updated_at,
      );
  }

  bump(id: string, score: number): void {
    getDb()
      .prepare(`UPDATE memory_lessons SET score = ?, hits = hits + 1, updated_at = ? WHERE id = ?`)
      .run(score, now(), id);
  }

  archive(id: string): void {
    getDb()
      .prepare(`UPDATE memory_lessons SET archived = 1, updated_at = ? WHERE id = ?`)
      .run(now(), id);
  }

  countByKind(): Array<{ kind: string; n: number }> {
    return getDb()
      .prepare(
        `SELECT kind, COUNT(*) AS n FROM memory_lessons WHERE archived = 0 GROUP BY kind`,
      )
      .all() as Array<{ kind: string; n: number }>;
  }
}
