/**
 * token-usage.ts — Token 用量流水（2026-11-05，ledger 思想平移自 OPC-OS PR#3 company.py）。
 *
 * 对方每完成一单写一条成本流水（tokens×模型单价 + 工时分摊）；我们没有订单域，
 * 但 llm.ts 每次调用都返回 usage——之前直接丢掉，看板无米下锅。本模块把每次
 * LLM 调用的 usage 落一条流水（best-effort，失败静默，绝不影响主链路）。
 *
 * 成本估算：cost_est_usd = (input×单价_in + output×单价_out)，单价来自
 * settings 的 llm.priceTable（model → {input, output} 每百万 token 美元价），
 * 表里没有的模型按 0 计（宁可少算不虚报）。写入点：routes/llm.ts 三条调用路径。
 *
 * 聚合一律现算（routes/dashboard.ts group by），不预建聚合表——数据量到
 * 日增万级流水再议。
 */

import { randomUUID } from 'crypto';
import { getDb } from './sqlite';
import { getSetting } from './settings';

/** settings.llm.priceTable 的 settings key（model → {input,output} 每百万 token 美元价）。 */
export const PRICE_TABLE_KEY = 'llm.priceTable';

/** 读单价表（缺失/损坏返回 undefined，成本按 0 计——宁可少算不虚报）。 */
export function readPriceTable(): Record<string, ModelPrice> | undefined {
  const raw = getSetting(PRICE_TABLE_KEY);
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, ModelPrice> = {};
  for (const [model, p] of Object.entries(raw as Record<string, unknown>)) {
    if (
      p &&
      typeof p === 'object' &&
      typeof (p as Record<string, unknown>).input === 'number' &&
      typeof (p as Record<string, unknown>).output === 'number'
    ) {
      out[model] = { input: (p as ModelPrice).input, output: (p as ModelPrice).output };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export interface TokenUsageRecord {
  id: string;
  ts: number;
  session_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_est_usd: number;
}

/** 每百万 token 美元单价（settings.llm.priceTable 的条目形状）。 */
export interface ModelPrice {
  input: number;
  output: number;
}

export interface UsageToRecord {
  session_id?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  ts?: number;
}

/**
 * 落一条用量流水。内部捕获所有异常——记录失败只少一条统计数据，
 * 不能让 LLM 调用方为此买单。
 */
export function recordUsage(usage: UsageToRecord, priceTable?: Record<string, ModelPrice>): void {
  try {
    const input = Math.max(0, Math.round(Number(usage.input_tokens) || 0));
    const output = Math.max(0, Math.round(Number(usage.output_tokens) || 0));
    const model = usage.model || '';
    const price = (priceTable ?? readPriceTable())?.[model];
    const cost =
      price && (input || output)
        ? (input * price.input + output * price.output) / 1_000_000
        : 0;
    getDb()
      .prepare(
        `INSERT INTO token_usage (id, ts, session_id, model, input_tokens, output_tokens, cost_est_usd)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(randomUUID(), usage.ts ?? Date.now(), usage.session_id || '', model, input, output, cost);
  } catch {
    /* best-effort — 统计流水绝不影响主链路 */
  }
}

export function sumUsageBetween(fromTs: number, toTs: number): {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_est_usd: number;
} {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(cost_est_usd), 0) AS cost_est_usd
       FROM token_usage WHERE ts >= ? AND ts < ?`,
    )
    .get(fromTs, toTs) as {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_est_usd: number;
  };
  return {
    calls: row.calls,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    cost_est_usd: row.cost_est_usd,
  };
}

/** 按天聚合（本地时区日界）。返回 ts 升序数组，天 key 为当日 0 点时间戳。 */
export function usageDailyBetween(fromTs: number, toTs: number): Array<{
  day: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_est_usd: number;
}> {
  const rows = getDb()
    .prepare(
      `SELECT ts, input_tokens, output_tokens, cost_est_usd
       FROM token_usage WHERE ts >= ? AND ts < ? ORDER BY ts`,
    )
    .all(fromTs, toTs) as Array<Pick<TokenUsageRecord, 'ts' | 'input_tokens' | 'output_tokens' | 'cost_est_usd'>>;
  const byDay = new Map<number, { calls: number; input_tokens: number; output_tokens: number; cost_est_usd: number }>();
  for (const r of rows) {
    const day = startOfDay(r.ts);
    const bucket = byDay.get(day) ?? { calls: 0, input_tokens: 0, output_tokens: 0, cost_est_usd: 0 };
    bucket.calls += 1;
    bucket.input_tokens += r.input_tokens;
    bucket.output_tokens += r.output_tokens;
    bucket.cost_est_usd += r.cost_est_usd;
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, v]) => ({ day, ...v }));
}

/** 按维度 TopN（model / session）。 */
export function usageBreakdown(
  fromTs: number,
  toTs: number,
  by: 'model' | 'session_id',
  limit = 10,
): Array<{ key: string; calls: number; input_tokens: number; output_tokens: number; cost_est_usd: number }> {
  const col = by === 'session_id' ? 'session_id' : 'model';
  return getDb()
    .prepare(
      `SELECT COALESCE(${col}, '') AS key,
              COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(cost_est_usd), 0) AS cost_est_usd
       FROM token_usage WHERE ts >= ? AND ts < ?
       GROUP BY COALESCE(${col}, '')
       ORDER BY input_tokens + output_tokens DESC
       LIMIT ?`,
    )
    .all(fromTs, toTs, limit) as Array<{
    key: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_est_usd: number;
  }>;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
