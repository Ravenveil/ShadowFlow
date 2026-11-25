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
import { getDb } from '../../../../storage/sqlite';
import { getSetting } from '../../../../storage/settings';
// 成本/聚合口径已迁至 domains/analytics/usage/usage-model.ts（纯规则，可独立单测）；
// 本文件保留 SQL 与装配，导出名原样保留。
import {
  bucketByDay,
  estimateCostUsd,
  normalizeDimension,
  normalizeDurationMs,
  normalizeLimit,
  normalizeTokens,
  parsePriceTable,
  PRICE_TABLE_KEY,
  startOfDay,
  type ModelPrice,
} from '../usage-model';

/** settings.llm.priceTable 的 settings key */
export { PRICE_TABLE_KEY };

/** 读单价表（缺失/损坏返回 undefined，成本按 0 计——宁可少算不虚报）。 */
export function readPriceTable(): Record<string, ModelPrice> | undefined {
  return parsePriceTable(getSetting(PRICE_TABLE_KEY));
}

export interface TokenUsageRecord {
  id: string;
  ts: number;
  session_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_est_usd: number;
  /** 一轮 run 的归属（群 turn id / DAG run session）。空串=未知。 */
  run_id: string;
  /** 执行 agent 归属（node.id / agent id）。空串=未知。 */
  agent_id: string;
  /** 项目归属。空串=未知。 */
  project_id: string;
  /** 本次模型调用墙钟耗时（毫秒）。0=未计时（旧流水）。 */
  duration_ms: number;
}

/** 每百万 token 美元单价（settings.llm.priceTable 的条目形状）——单一真源在 usage-model。 */
export type { ModelPrice };

/**
 * 归属戳（2026-11-07 T12/BE-07）— 一次模型调用关联到 run/agent/project，
 * 供经营指标「交付成本」按项目/agent 维度核算。全字段可选，缺省记空串。
 */
export interface UsageStamp {
  model?: string;
  session_id?: string;
  run_id?: string;
  agent_id?: string;
  project_id?: string;
}

export interface UsageToRecord extends UsageStamp {
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  ts?: number;
}

/**
 * 落一条用量流水。内部捕获所有异常——记录失败只少一条统计数据，
 * 不能让 LLM 调用方为此买单。
 */
export function recordUsage(usage: UsageToRecord, priceTable?: Record<string, ModelPrice>): void {
  try {
    const input = normalizeTokens(usage.input_tokens);
    const output = normalizeTokens(usage.output_tokens);
    const model = usage.model || '';
    const cost = estimateCostUsd(input, output, model, priceTable ?? readPriceTable());
    getDb()
      .prepare(
        `INSERT INTO token_usage (id, ts, session_id, model, input_tokens, output_tokens, cost_est_usd,
                                  run_id, agent_id, project_id, duration_ms)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        usage.ts ?? Date.now(),
        usage.session_id || '',
        model,
        input,
        output,
        cost,
        usage.run_id || '',
        usage.agent_id || '',
        usage.project_id || '',
        normalizeDurationMs(usage.duration_ms),
      );
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
  return bucketByDay(rows);
}

/** 按维度 TopN（model / session / run / agent / project）。 */
export function usageBreakdown(
  fromTs: number,
  toTs: number,
  by: 'model' | 'session_id' | 'run_id' | 'agent_id' | 'project_id',
  limit = 10,
): Array<{ key: string; calls: number; input_tokens: number; output_tokens: number; cost_est_usd: number }> {
  const col = normalizeDimension(by);
  const cap = normalizeLimit(limit, 10);
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
    .all(fromTs, toTs, cap) as Array<{
    key: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_est_usd: number;
  }>;
}

/** 本地零点——单一真源在 usage-model，此处转出兼容。 */
export { startOfDay };
