/**
 * analytics 域 — usage 子域领域模型（纯规则层）
 *
 * Token 用量流水的成本估算与聚合口径，纯函数，禁止 import express/sqlite/crypto/fs。
 *
 * 核心口径：
 *   cost_est_usd = (input × 单价in + output × 单价out) / 1_000_000
 *   单价表缺失/损坏 → 该模型按 0 计（宁可少算，不虚报）
 *   token 数一律 max(0, round(Number(v) || 0))
 *   按天分桶用本地零点（不是 UTC）
 */

/** settings.llm.priceTable 的 settings key（model → {input,output} 每百万 token 美元价）。 */
export const PRICE_TABLE_KEY = 'llm.priceTable';

export const TOKENS_PER_UNIT = 1_000_000;

/** 每百万 token 美元单价。 */
export interface ModelPrice {
  input: number;
  output: number;
}

/** breakdown 允许的维度白名单；其余一律按 model 聚合（防 SQL 注入列名）。 */
export const BREAKDOWN_DIMENSIONS = [
  'model',
  'session_id',
  'run_id',
  'agent_id',
  'project_id',
] as const;

export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

/** 维度归一：不在白名单内的按 model 处理。 */
export function normalizeDimension(v: string): BreakdownDimension {
  return (BREAKDOWN_DIMENSIONS as readonly string[]).includes(v)
    ? (v as BreakdownDimension)
    : 'model';
}

/** token 数规整：非数/负数/NaN 一律归 0，四舍五入到整数。 */
export function normalizeTokens(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** 耗时规整：同上口径（毫秒整数，负数归 0）。 */
export function normalizeDurationMs(v: unknown): number {
  return normalizeTokens(v);
}

/**
 * 单价表解析：只收 input/output 都是有限数字的条目（损坏条目丢弃，
 * 不让脏数据把成本算成 NaN）。全空 → undefined（调用方按 0 计）。
 */
export function parsePriceTable(raw: unknown): Record<string, ModelPrice> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, ModelPrice> = {};
  for (const [model, p] of Object.entries(raw as Record<string, unknown>)) {
    if (!p || typeof p !== 'object') continue;
    const entry = p as Record<string, unknown>;
    if (typeof entry.input === 'number' && typeof entry.output === 'number') {
      if (!Number.isFinite(entry.input) || !Number.isFinite(entry.output)) continue;
      out[model] = { input: entry.input, output: entry.output };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 成本估算。表里没有该模型、或本次零 token → 0（宁可少算不虚报）。
 * 单价是「每百万 token」美元价，所以除以 1e6。
 */
export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  model: string,
  priceTable?: Record<string, ModelPrice>,
): number {
  const price = priceTable?.[model];
  if (!price) return 0;
  if (!inputTokens && !outputTokens) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / TOKENS_PER_UNIT;
}

/** 本地零点（按天分桶的日界）。 */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** TopN 条数规整：非数/<=0 → 默认 10，上限 200。 */
export function normalizeLimit(limit: unknown, fallback = 10, max = 200): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.round(n), max);
}

export interface UsageBucket {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_est_usd: number;
}

/** 空桶（聚合初值）。 */
export function emptyBucket(): UsageBucket {
  return { calls: 0, input_tokens: 0, output_tokens: 0, cost_est_usd: 0 };
}

/** 累加一行流水到桶（纯，返回新对象）。 */
export function addToBucket(
  bucket: UsageBucket,
  row: { input_tokens: number; output_tokens: number; cost_est_usd: number },
): UsageBucket {
  return {
    calls: bucket.calls + 1,
    input_tokens: bucket.input_tokens + row.input_tokens,
    output_tokens: bucket.output_tokens + row.output_tokens,
    cost_est_usd: bucket.cost_est_usd + row.cost_est_usd,
  };
}

/** 按本地日界把流水聚成天桶，返回 day 升序。 */
export function bucketByDay(
  rows: ReadonlyArray<{
    ts: number;
    input_tokens: number;
    output_tokens: number;
    cost_est_usd: number;
  }>,
): Array<{ day: number } & UsageBucket> {
  const byDay = new Map<number, UsageBucket>();
  for (const r of rows) {
    const day = startOfDay(r.ts);
    byDay.set(day, addToBucket(byDay.get(day) ?? emptyBucket(), r));
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, v]) => ({ day, ...v }));
}
