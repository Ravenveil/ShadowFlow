/**
 * commerce 域 — merchant-board 子域领域模型（纯规则层）
 *
 * 商家看板口径与分桶规则，纯函数，禁止 import express/sqlite/crypto/fs。
 * 移植自 storage/merchant-board.ts，行为逐字对齐。
 *
 * 核心口径：
 *   营收 = income − refund；成本 = expense；毛利 = 营收 − 成本
 *   客单价 = 净营收 / 未退款成交单数（退款单不进分母）
 *   按天分桶用本地零点（不是 UTC）
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const MIN15_MS = 15 * 60 * 1000;
export const MAX_BUCKETS = 2000;

export type OrderStatus = 'created' | 'paid' | 'refunded';
export const ORDER_STATUSES: readonly OrderStatus[] = ['created', 'paid', 'refunded'];

/** 领域错误。 */
export class MerchantDomainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'MerchantDomainError';
  }
}

// ── 输入校验 ──────────────────────────────────────────────────────────────────

export function parseText(v: unknown, max: number, field: string, required = false): string {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  if (required && !s) throw new MerchantDomainError(`${field} is required`);
  return s;
}

export function parseCents(v: unknown, field: string, required = false): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (required && (v === undefined || v === null || v === '')) {
    throw new MerchantDomainError(`${field} is required`);
  }
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new MerchantDomainError(`${field} must be a non-negative integer (cents)`);
  }
  return n;
}

// ── 分桶规则 ──────────────────────────────────────────────────────────────────

export function bucketSize(granularity: unknown): number {
  if (granularity === '15m') return MIN15_MS;
  if (granularity === 'hour') return HOUR_MS;
  return DAY_MS;
}

/** 本地零点（国内商家日界，避免早上 8 点前的单落到昨天）。 */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 时间戳 → 桶键。day 用本地零点，其余按 epoch 整除。 */
export function bucketKey(ts: number, size: number): number {
  return size === DAY_MS ? dayStart(ts) : Math.floor(ts / size) * size;
}

/** 下一个桶键。day 走 dayStart 跨夏令时也不错位。 */
export function nextBucket(key: number, size: number): number {
  return size === DAY_MS ? dayStart(key + DAY_MS) : key + size;
}

/** 画曲线用区间：ISO/毫秒 → {from,to,size,granularity}，最多 MAX_BUCKETS 桶。 */
export function timeWindow(
  startRaw: unknown,
  endRaw: unknown,
  granularity: unknown,
  now: () => number,
): { from: number; to: number; size: number; granularity: '15m' | 'hour' | 'day' } {
  const t = now();
  const end = typeof endRaw === 'string' && endRaw ? Date.parse(endRaw) : t;
  const start = typeof startRaw === 'string' && startRaw ? Date.parse(startRaw) : dayStart(t);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new MerchantDomainError('start/end must be valid ISO8601 with start < end');
  }
  const size = bucketSize(granularity);
  if (Math.ceil((end - start) / size) > MAX_BUCKETS) {
    throw new MerchantDomainError('time range too wide for this granularity');
  }
  const g = granularity === '15m' || granularity === 'hour' ? granularity : 'day';
  return { from: start, to: end, size, granularity: g };
}

/** 聚合/列表用可选区间：不给就是全量（null），只做边界校验。 */
export function rangeWindow(
  startRaw: unknown,
  endRaw: unknown,
): { from: number | null; to: number | null } {
  const parse = (v: unknown, field: string): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const s = typeof v === 'string' ? v : String(v);
    const n = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
    if (!Number.isFinite(n)) throw new MerchantDomainError(`${field} must be ISO8601 or epoch millis`);
    return n;
  };
  const from = parse(startRaw, 'start');
  const to = parse(endRaw, 'end');
  if (from !== null && to !== null && from >= to) {
    throw new MerchantDomainError('start must be earlier than end');
  }
  return { from, to };
}

/** 把区间拼成 WHERE 片段（含前导 AND），参数按顺序塞进 params。 */
export function rangeClause(
  column: string,
  from: number | null,
  to: number | null,
  params: unknown[],
): string {
  let sql = '';
  if (from !== null) { sql += ` AND ${column} >= ?`; params.push(from); }
  if (to !== null) { sql += ` AND ${column} < ?`; params.push(to); }
  return sql;
}

// ── 看板核心口径 ──────────────────────────────────────────────────────────────

export interface LedgerSums {
  income: number;
  refund: number;
  expense: number;
}

export interface OrderStats {
  total: number;
  paid: number;
  refunded: number;
}

export interface OverviewCore {
  range: { from: number | null; to: number | null };
  revenue_cents: number;
  cost_cents: number;
  gross_profit_cents: number;
  gross_margin_pct: number | null;
  orders_total: number;
  paid_orders: number;
  refunded_orders: number;
  transacted_orders: number;
  avg_order_cents: number;
}

/** 上期分母为 0 时不编造增长率：两边都 0 记 0，从 0 涨起来记 null（显示「新增」）。 */
export function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

/**
 * 核心口径计算：给定区间内的流水汇总与订单统计，算出营收/成本/毛利/客单价。
 * SQL 查询由 storage 提供，规则在此（单一真源）。
 */
export function buildOverviewCore(
  range: { from: number | null; to: number | null },
  sums: LedgerSums,
  orderStats: OrderStats,
): OverviewCore {
  const revenue = sums.income - sums.refund;
  const gross = revenue - sums.expense;
  const paidOnly = orderStats.paid;
  return {
    range,
    revenue_cents: revenue,
    cost_cents: sums.expense,
    gross_profit_cents: gross,
    gross_margin_pct: revenue ? Math.round((gross / revenue) * 1000) / 10 : null,
    orders_total: orderStats.total,
    paid_orders: paidOnly,
    refunded_orders: orderStats.refunded,
    transacted_orders: paidOnly + orderStats.refunded,
    avg_order_cents: paidOnly ? Math.round(revenue / paidOnly) : 0,
  };
}

/** compare=1 判定（布尔/1/'1'/'true'）。 */
export function wantsCompare(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

/** 转化率：uv 为 0 时 0。 */
export function conversionRate(converted: number, uv: number): number {
  return uv ? Math.round((converted / uv) * 1000) / 10 : 0;
}
