/**
 * memory 域 — lessons 子域领域模型（内部，业务变化驱动）
 *
 * 经验记忆的业务规则与不变量，纯函数，禁止 import：
 *   - express / HTTP
 *   - ./sqlite / storage/*（数据访问属 infra）
 *   - crypto（id 生成属 infra，通过 deps 注入）
 *
 * 迁移自原 storage/memory-lessons.ts，规则逐条对齐（分数加权、内容归一、
 * 每域上限、分域召回、多域合并），保证行为逐字不变。
 */

/** 记忆种类 */
export const KIND_LESSON = 'lesson';
export const KIND_PREF = 'preference';
export const KIND_WEAK = 'weakness';
export const VALID_KINDS: readonly string[] = [KIND_LESSON, KIND_PREF, KIND_WEAK];

export const KIND_LABEL: Record<string, string> = {
  [KIND_LESSON]: '教训',
  [KIND_PREF]: '偏好',
  [KIND_WEAK]: '弱项',
};

/** 领域常量 —— 规则的单一真源 */
export const RECALL_TOP_K = 4;
export const MAX_PER_SCOPE = 8;
export const CONTENT_MAX = 600;
export const DEFAULT_SCORE = 0.6;
export const SCORE_STEP = 0.1;
export const SCORE_MAX = 1.0;
export const MAX_RECALL_ROWS = 60;
export const MAX_TOP_K = 12;

/** 实体：一条经验记忆。 */
export interface MemoryLesson {
  id: string;
  kind: string;
  scope_key: string;
  task_type: string;
  title: string;
  content: string;
  source: string;
  source_ref: string;
  score: number;
  hits: number;
  archived: number;
  created_at: number;
  updated_at: number;
}

/** 领域错误：与 HTTP 状态解耦，adapter 决定映射。 */
export class LessonDomainError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'LessonDomainError';
  }
}

// ── 值对象级纯函数 ────────────────────────────────────────────────────────────

/** 内容归一化：去标点空白，用于重复检测。 */
export function normalizeContent(s: string): string {
  return (s || '').replace(/[\s，。、！？；：,.!?;:（）()「」"']/g, '');
}

/** 两条内容是否"同一条"（归一后相等）。 */
export function sameContent(a: string, b: string): boolean {
  return normalizeContent(a) === normalizeContent(b);
}

/** 自动标题：取第一句，截 30 字。 */
export function autoTitle(content: string): string {
  const head = content.trim().split(/[。！？\n]/)[0];
  return (head || content).slice(0, 30);
}

/** 分数加权：+0.1 但不超过 1.0，保留 3 位小数。 */
export function bumpScore(score: number): number {
  const base = typeof score === 'number' ? score : DEFAULT_SCORE;
  return Math.min(SCORE_MAX, Math.round((base + SCORE_STEP) * 1000) / 1000);
}

/** 写入分数规整：保留 3 位小数。 */
export function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

/** 内容校验 + 截断：非空，最长 CONTENT_MAX。 */
export function assertAndTrimContent(content: unknown): string {
  if (typeof content !== 'string') throw new LessonDomainError('记忆内容不能为空');
  const trimmed = content.trim();
  if (!trimmed) throw new LessonDomainError('记忆内容不能为空');
  return trimmed.length > CONTENT_MAX ? trimmed.slice(0, CONTENT_MAX) : trimmed;
}

/** 新建实体工厂。id/time 通过 deps 注入，便于单测。 */
export function createLesson(
  input: {
    content: string;
    kind?: string;
    scope_key?: string;
    task_type?: string;
    source?: string;
    source_ref?: string;
    title?: string;
    score?: number;
  },
  deps: { newId?: () => string; now?: () => number } = {},
): MemoryLesson {
  const content = assertAndTrimContent(input.content);
  const now = (deps.now ?? (() => Date.now()))();
  const score = typeof input.score === 'number' ? input.score : DEFAULT_SCORE;
  return {
    id: (deps.newId ?? (() => ''))(),
    kind: input.kind || KIND_LESSON,
    scope_key: input.scope_key || '',
    task_type: input.task_type || '',
    title: input.title || autoTitle(content),
    content,
    source: input.source || '',
    source_ref: input.source_ref || '',
    score: roundScore(score),
    hits: 0,
    archived: 0,
    created_at: now,
    updated_at: now,
  };
}

/** 分域召回判定：库里域为空=通用谁都能吃；有域则只有同域请求能召回。 */
export function inScope(row: MemoryLesson, scope_key: string, task_type: string): boolean {
  if (row.scope_key && (!scope_key || row.scope_key !== scope_key)) return false;
  if (row.task_type && (!task_type || row.task_type !== task_type)) return false;
  return true;
}

/** 软归档排序优先级：score↓ hits↓ created_at↓（用于每域裁剪）。 */
export function byRetentionPriority(a: MemoryLesson, b: MemoryLesson): number {
  return b.score - a.score || b.hits - a.hits || b.created_at - a.created_at;
}

/** 召回排序优先级：score↓ hits↓ updated_at↓。 */
export function byRecallPriority(a: MemoryLesson, b: MemoryLesson): number {
  return b.score - a.score || b.hits - a.hits || b.updated_at - a.updated_at;
}

/** 提示词条数上限规整：1..MAX_TOP_K，缺省 RECALL_TOP_K。 */
export function normalizeTopK(value: unknown): number {
  return typeof value === 'number' && value > 0
    ? Math.min(Math.round(value), MAX_TOP_K)
    : RECALL_TOP_K;
}

/** 列表 limit 规整：1..500，缺省 100。 */
export function normalizeLimit(value: unknown): number {
  return Math.min(Math.max((value as number) ?? 100, 1), 500);
}

/** 格式化进提示词的一行。 */
export function formatRow(row: MemoryLesson): string {
  return `- [${KIND_LABEL[row.kind] ?? '经验'}] ${row.content}`;
}

/** 经验块标题（单域 / 多域共用）。 */
export const PROMPT_HEADING = '\n\n## 过往经验（自动沉淀，供参考）\n\n';
