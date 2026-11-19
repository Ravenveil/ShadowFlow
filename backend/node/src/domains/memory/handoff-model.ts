/**
 * memory 域 — handoff 子域领域模型（纯规则层，2026-11-19 提取）
 *
 * handoff 是 1222 行的多子域复合模块（交接/上下文/画像写回/反馈队列）。
 * 本文件只收拢「可脱离 SQLite 独立判定」的业务规则与不变量：
 *   - 画像写回的置信度决策（高者胜 / 同置信冲突 / 人工 override / keep）
 *   - 反馈关键词规则匹配与命中片段提取
 *   - 去重哈希输入归一化、数字上限截断、文本字段规整
 *
 * 纯函数，禁止 import express / sqlite / storage / crypto / fs。
 * 输入校验通过返回领域错误或直接规整，SQL 与装配仍留在 storage/memory-handoff.ts。
 */

// ── 常量（规则单一真源） ──────────────────────────────────────────────────────

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_TEXT = 600;
export const PROFILE_EVENT_KEEP = 200;
export const CONTEXT_READ_KEEP = 200;
export const DEFAULT_CONFIDENCE = 0.7;
export const FEEDBACK_CONFIDENCE = 0.7;
export const FEEDBACK_TEXT_MAX = 1000;
export const SNIPPET_MAX = 120;

/** 反馈自动提炼的确定性规则（零模型，按 key 分组的关键词）。 */
export const FEEDBACK_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['preference', ['偏好', '喜欢', '更倾向', '不要', '别用', '排斥', '简洁']],
  ['budget', ['预算', '价位', '报价', '多少钱', '价格接受']],
  ['industry', ['行业', '主营', '做的是', '赛道']],
  ['deadline', ['截止', 'deadline', '时限', '交期']],
  ['weakness', ['返工', '投诉', '不满意', '反复', '太慢']],
];

export type WritebackAction = 'create' | 'update' | 'conflict' | 'keep' | 'override' | 'dismiss';
export type FeedbackStatus = 'pending' | 'processed' | 'skipped' | 'failed';

// ── 领域错误 ──────────────────────────────────────────────────────────────────

export class HandoffDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandoffDomainError';
  }
}

// ── 画像写回决策（核心不变量） ────────────────────────────────────────────────

export interface CurrentValue {
  value: string;
  confidence: number;
}

export interface WritebackDecision {
  action: WritebackAction;
  /** 最终落库的值。 */
  value: string;
  /** 最终落库的置信度。 */
  confidence: number;
  /** 是否真正改变了当前值。 */
  changed: boolean;
}

/**
 * 置信度合并决策 —— writeback 的核心业务规则。
 *
 * 规则（逐字对齐原实现）：
 *   - 无当前值        → create
 *   - force 且值不同  → override（置信度取 max，保留审计链）
 *   - force 且值相同  → keep（不把"确认一次"记成覆盖）
 *   - 新置信度更高    → update
 *   - 同置信不同说法  → conflict（不覆盖，等人工裁决）
 *   - 其余（同值/更低）→ keep
 */
export function decideWriteback(
  cur: CurrentValue | undefined,
  input: { value: string; confidence: number; force?: boolean },
): WritebackDecision {
  const { value, confidence } = input;
  const force = input.force === true;
  let action: WritebackAction;
  let finalValue: string;
  let finalConfidence: number;

  if (!cur) {
    action = 'create';
    finalValue = value;
    finalConfidence = confidence;
  } else if (force) {
    action = value === cur.value ? 'keep' : 'override';
    finalValue = action === 'override' ? value : cur.value;
    finalConfidence =
      action === 'override' ? Math.max(confidence, cur.confidence) : cur.confidence;
  } else if (confidence > cur.confidence) {
    action = 'update';
    finalValue = value;
    finalConfidence = confidence;
  } else if (confidence === cur.confidence && value !== cur.value) {
    action = 'conflict';
    finalValue = cur.value;
    finalConfidence = cur.confidence;
  } else {
    action = 'keep';
    finalValue = cur.value;
    finalConfidence = cur.confidence;
  }

  return {
    action,
    value: finalValue,
    confidence: finalConfidence,
    changed: action === 'create' || action === 'update' || action === 'override',
  };
}

/** 置信度输入校验：0~1 之间。 */
export function assertConfidence(confidence: number): number {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new HandoffDomainError('confidence 必须在 0~1 之间');
  }
  return confidence;
}

// ── 反馈规则（纯判定） ────────────────────────────────────────────────────────

/** 从反馈文本匹配出命中的规则（key + 关键词）。 */
export function matchFeedbackRules(text: string): Array<readonly [string, readonly string[]]> {
  return FEEDBACK_RULES.filter(([, words]) => words.some((w) => text.includes(w)));
}

/**
 * 画像里存"命中关键词的那一小句"而非整段反馈：按标点切句，取第一句命中片段，
 * 截 SNIPPET_MAX。零模型、结果确定，同一说法重复投递能落成 keep。
 */
export function feedbackSnippet(text: string, words: readonly string[]): string {
  const parts = text
    .split(/[，,。；;！!？?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hit = parts.find((p) => words.some((w) => p.includes(w)));
  return (hit ?? text).trim().slice(0, SNIPPET_MAX);
}

/** 反馈投递字段规整：subject_id / text 非空校验 + 截断。 */
export function normalizeFeedbackInput(input: {
  subject_id: unknown;
  text: unknown;
  subject_type?: unknown;
  source?: unknown;
  source_ref?: unknown;
  actor?: unknown;
}): {
  subject_id: string;
  text: string;
  subject_type: string;
  source: string;
  source_ref: string;
  actor: string;
} {
  const text = ((input.text as string) ?? '').trim().slice(0, FEEDBACK_TEXT_MAX);
  const subject_id = ((input.subject_id as string) ?? '').trim();
  if (!text || !subject_id) throw new HandoffDomainError('subject_id / text 不能为空');
  return {
    subject_id,
    text,
    subject_type: ((input.subject_type as string) || 'customer').trim().slice(0, 32) || 'customer',
    source: ((input.source as string) || 'api').trim().slice(0, 64) || 'api',
    source_ref: ((input.source_ref as string) ?? '').trim().slice(0, 120),
    actor: ((input.actor as string) || 'system').trim().slice(0, 64) || 'system',
  };
}

/** 数字上限截断：有限正数 → trunc 后封顶，否则回退默认值。 */
export function capNum(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), max) : fallback;
}

/** 去重哈希的输入归一化：主体类型 + NUL + 主体 id + NUL + 文本。 */
export function dedupHashInput(subject_type: string, subject_id: string, text: string): string {
  return `${subject_type}\u0000${subject_id}\u0000${text}`;
}

/** JSON 数组字段解析（容错：非数组返回空）。 */
export function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
