/**
 * memory-lessons.ts — 兼容装配层（DDD 迁移后，2026-11-19）
 *
 * 领域规则已迁至 domains/memory/lessons-model.ts（不变量/纯函数），
 * 用例编排已迁至 domains/memory/use_cases/lessons.ts，
 * SQL 已锁在 domains/memory/infra/sqlite-lesson.repository.ts。
 *
 * 本文件只做「装配 + 导出兼容」：用 SqliteLessonRepository 实例化用例，
 * 原样暴露迁移前的全部函数/常量/类型，调用方（groups-chat、executor、
 * run-sessions、各类测试）零改动。
 */

import { randomUUID } from 'crypto';
import { getSetting } from './settings';
import { SqliteLessonRepository } from '../domains/memory/infra/sqlite-lesson.repository';
import {
  makeRemember,
  makeRecall,
  makeContextBlock,
  makePromptBlock,
  makeListLessons,
  makeLessonStats,
  makeForgetLesson,
} from '../domains/memory/use_cases/lessons';
import {
  LessonDomainError,
  KIND_LESSON,
  KIND_PREF,
  KIND_WEAK,
  KIND_LABEL,
  CONTENT_MAX,
  RECALL_TOP_K,
  MAX_PER_SCOPE,
  type MemoryLesson,
} from '../domains/memory/lessons-model';

// ── 装配（单例 repo，行为与迁移前一致） ──────────────────────────────────────
const repo = new SqliteLessonRepository();
const rememberCase = makeRemember(repo, { newId: () => randomUUID() });
const recallCase = makeRecall(repo);
const contextBlockCase = makeContextBlock(recallCase);
const promptBlockCase = makePromptBlock(repo, recallCase);
const listCase = makeListLessons(repo);
const statsCase = makeLessonStats(repo);
const forgetCase = makeForgetLesson(repo);

// ── 常量 / 类型（原样重导出） ────────────────────────────────────────────────
export { KIND_LESSON, KIND_PREF, KIND_WEAK, KIND_LABEL, CONTENT_MAX, RECALL_TOP_K, MAX_PER_SCOPE };
export type { MemoryLesson };

/** 领域错误以旧名导出，保持 `err instanceof MemoryLessonError` 语义。 */
export class MemoryLessonError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'MemoryLessonError';
  }
}

// ── 函数（原签名 + 原行为） ──────────────────────────────────────────────────

export function remember(input: {
  content: string;
  kind?: string;
  scope_key?: string;
  task_type?: string;
  source?: string;
  source_ref?: string;
  title?: string;
  score?: number;
}): MemoryLesson {
  try {
    return rememberCase(input);
  } catch (err) {
    if (err instanceof LessonDomainError) throw new MemoryLessonError(err.message, err.status);
    throw err;
  }
}

export function recallLessons(scope_key = '', task_type = '', topK = RECALL_TOP_K): MemoryLesson[] {
  return recallCase(scope_key, task_type, topK);
}

export function contextBlock(scope_key = '', task_type = '', topK = RECALL_TOP_K): string {
  return contextBlockCase(scope_key, task_type, topK);
}

export function promptBlock(scope: string | string[] = '', task_type = ''): string {
  const autoLearn = getSetting('memory.autoLearn') !== false;
  return promptBlockCase(scope, task_type, { autoLearn, recallTopK: getSetting('memory.recallTopK') });
}

export function getLesson(id: string): MemoryLesson | undefined {
  return repo.get(id);
}

export function listLessons(opts: {
  scope_key?: string;
  kind?: string;
  includeArchived?: boolean;
  limit?: number;
}): MemoryLesson[] {
  return listCase(opts);
}

export function lessonStats(): {
  total: number;
  by_kind: Record<string, number>;
  top_k: number;
  max_per_scope: number;
} {
  return statsCase();
}

export function forgetLesson(id: string): MemoryLesson {
  try {
    return forgetCase(id);
  } catch (err) {
    if (err instanceof LessonDomainError) throw new MemoryLessonError(err.message, err.status);
    throw err;
  }
}
