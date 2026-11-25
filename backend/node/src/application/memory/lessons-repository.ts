/**
 * memory 域 — lessons 子域 Repository 接口（依赖倒置点）
 *
 * 领域层定义它需要的持久化能力，infra 层实现它。
 * use_case 只认识这个接口，不认识 SQLite。V1 同步签名（与现状一致）。
 */

import type { MemoryLesson } from './lessons-model';

export interface LessonListOptions {
  scope_key?: string;
  kind?: string;
  includeArchived?: boolean;
  limit?: number;
}

export interface LessonRepository {
  /** 按 id 取单条。 */
  get(id: string): MemoryLesson | undefined;
  /** 列表（带过滤）。 */
  list(opts: LessonListOptions): MemoryLesson[];
  /** 按域取候选（未归档，供召回/裁剪用），最多 limit 条。 */
  candidates(limit: number): MemoryLesson[];
  /** 同域未归档的记录（供重复检测/裁剪），按域+任务过滤。 */
  byScope(scope_key: string, task_type: string): MemoryLesson[];
  /** 新增一条。 */
  insert(lesson: MemoryLesson): void;
  /** 更新分数与 hits。 */
  bump(id: string, score: number): void;
  /** 软归档（updated_at 由 impl 写入）。 */
  archive(id: string): void;
  /** 统计：未归档按 kind 分组计数。 */
  countByKind(): Array<{ kind: string; n: number }>;
}

/** 内存实现，供 use_case 单测注入（不启 server、不碰磁盘）。 */
export class InMemoryLessonRepository implements LessonRepository {
  readonly rows = new Map<string, MemoryLesson>();
  private seq = 0;

  constructor(seed: MemoryLesson[] = []) {
    for (const r of seed) this.rows.set(r.id, { ...r });
  }

  get(id: string): MemoryLesson | undefined {
    const r = this.rows.get(id);
    return r ? { ...r } : undefined;
  }

  list(opts: LessonListOptions): MemoryLesson[] {
    let rows = Array.from(this.rows.values()).filter((r) => {
      if (opts.scope_key && r.scope_key !== opts.scope_key) return false;
      if (opts.kind && r.kind !== opts.kind) return false;
      if (!opts.includeArchived && r.archived) return false;
      return true;
    });
    rows = rows.sort((a, b) => b.score - a.score || b.updated_at - a.updated_at);
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    return rows.slice(0, limit).map((r) => ({ ...r }));
  }

  candidates(limit: number): MemoryLesson[] {
    return Array.from(this.rows.values())
      .filter((r) => !r.archived)
      .sort((a, b) => b.score - a.score || b.hits - a.hits || b.updated_at - a.updated_at)
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  byScope(scope_key: string, task_type: string): MemoryLesson[] {
    return Array.from(this.rows.values())
      .filter((r) => r.scope_key === scope_key && r.task_type === task_type && !r.archived)
      .map((r) => ({ ...r }));
  }

  insert(lesson: MemoryLesson): void {
    this.rows.set(lesson.id, { ...lesson });
  }

  bump(id: string, score: number): void {
    const r = this.rows.get(id);
    if (!r) return;
    r.score = score;
    r.hits += 1;
    r.updated_at = ++this.seq;
  }

  archive(id: string): void {
    const r = this.rows.get(id);
    if (!r) return;
    r.archived = 1;
    r.updated_at = ++this.seq;
  }

  countByKind(): Array<{ kind: string; n: number }> {
    const counts = new Map<string, number>();
    for (const r of this.rows.values()) {
      if (r.archived) continue;
      counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    }
    return Array.from(counts, ([kind, n]) => ({ kind, n }));
  }
}
