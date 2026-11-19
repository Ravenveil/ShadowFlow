/**
 * memory 域 — lessons 用例（application 层，内部）
 *
 * 每个用例 = 一个业务动作，动词命名，与 HTTP/SQL 无关。
 * 只依赖 lessons-model（规则）+ lessons-repository（接口），可注入内存 repo 单测。
 *
 * 行为逐字对齐原 storage/memory-lessons.ts，保证零回归。
 */

import {
  MAX_PER_SCOPE,
  MAX_RECALL_ROWS,
  PROMPT_HEADING,
  bumpScore,
  byRecallPriority,
  byRetentionPriority,
  createLesson,
  formatRow,
  inScope,
  LessonDomainError,
  normalizeContent,
  normalizeLimit,
  normalizeTopK,
  roundScore,
  type MemoryLesson,
} from '../lessons-model';
import type { LessonRepository } from '../lessons-repository';

export interface RememberInput {
  content: string;
  kind?: string;
  scope_key?: string;
  task_type?: string;
  source?: string;
  source_ref?: string;
  title?: string;
  score?: number;
}

export type LessonDeps = { newId?: () => string; now?: () => number };

/** 记一条经验：重复内容加权，否则新增并裁剪超额。 */
export const makeRemember =
  (repo: LessonRepository, deps: LessonDeps = {}) =>
  (input: RememberInput): MemoryLesson => {
    // 校验 + 截断在领域工厂里（会抛 LessonDomainError）
    const draft = createLesson(
      { ...input, content: input?.content },
      {
        newId: deps.newId ?? (() => ''),
        now: deps.now ?? (() => Date.now()),
      },
    );
    const scope_key = draft.scope_key;
    const task_type = draft.task_type;
    const content = draft.content;

    // 重复检测：同域未归档里归一后内容相等 → 加权不新增
    for (const row of repo.byScope(scope_key, task_type)) {
      if (normalizeContent(row.content) === normalizeContent(content)) {
        const newScore = bumpScore(row.score);
        repo.bump(row.id, newScore);
        return repo.get(row.id)!;
      }
    }

    const now = (deps.now ?? (() => Date.now()))();
    draft.id = (deps.newId ?? (() => ''))() || draft.id;
    repo.insert(draft);

    // 每域上限：按保留优先级排序，超额软归档
    const scoped = repo.byScope(scope_key, task_type).sort(byRetentionPriority);
    for (const row of scoped.slice(MAX_PER_SCOPE)) {
      repo.archive(row.id);
      void now; // 时间戳由 impl 写入，保持与现状一致
    }
    return repo.get(draft.id)!;
  };

/** 召回：分域过滤 + 排序 + 截 topK。 */
export const makeRecall =
  (repo: LessonRepository) =>
  (scope_key = '', task_type = '', topK = 4): MemoryLesson[] => {
    const hits: MemoryLesson[] = [];
    for (const row of repo.candidates(MAX_RECALL_ROWS)) {
      if (!inScope(row, scope_key, task_type)) continue;
      hits.push(row);
      if (hits.length >= topK) break;
    }
    return hits;
  };

/** 上下文块（无标题的纯文本行）。 */
export const makeContextBlock =
  (recall: ReturnType<typeof makeRecall>) =>
  (scope_key = '', task_type = '', topK = 4): string => {
    const hits = recall(scope_key, task_type, topK);
    return hits.length ? hits.map(formatRow).join('\n') : '';
  };

/** 提示词经验块（含标题）：单域 / 多域合并召回，绝不抛错。 */
export const makePromptBlock =
  (repo: LessonRepository, recall: ReturnType<typeof makeRecall>) =>
  (scope: string | string[] = '', task_type = '', opts: { autoLearn?: boolean; recallTopK?: unknown } = {}): string => {
    try {
      if (opts.autoLearn === false) return '';
      const k = normalizeTopK(opts.recallTopK);
      const scopes = Array.isArray(scope) ? scope : [scope];
      if (scopes.length === 1) {
        const block = recall(scopes[0], task_type, k).map(formatRow).join('\n');
        return block ? `${PROMPT_HEADING}${block}` : '';
      }
      const seen = new Set<string>();
      const merged: MemoryLesson[] = [];
      for (const s of scopes) {
        for (const row of recall(s, task_type, k)) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          merged.push(row);
        }
      }
      const block = merged.sort(byRecallPriority).slice(0, k).map(formatRow).join('\n');
      return block ? `${PROMPT_HEADING}${block}` : '';
    } catch {
      return '';
    }
  };

/** 列表（带过滤）。 */
export const makeListLessons =
  (repo: LessonRepository) =>
  (opts: { scope_key?: string; kind?: string; includeArchived?: boolean; limit?: unknown } = {}) =>
    repo.list({
      ...opts,
      limit: opts.limit === undefined ? undefined : normalizeLimit(opts.limit),
    });

/** 统计。 */
export const makeLessonStats =
  (repo: LessonRepository) =>
  () => {
    const by_kind: Record<string, number> = {};
    let total = 0;
    for (const { kind, n } of repo.countByKind()) {
      by_kind[kind] = n;
      total += n;
    }
    return { total, by_kind, top_k: 4, max_per_scope: MAX_PER_SCOPE };
  };

/** 软删：不存在返回 not_found 语义（抛领域错误由 adapter 映射）。 */
export const makeForgetLesson =
  (repo: LessonRepository) =>
  (id: string): MemoryLesson => {
    if (!repo.get(id)) {
      // 领域错误，adapter 据 status 映射 404
      throw new LessonDomainError('记忆不存在', 404);
    }
    repo.archive(id);
    return repo.get(id)!;
  };

/** 保留导出以对齐原模块的分数规整工具（测试可能引用）。 */
export { roundScore };
