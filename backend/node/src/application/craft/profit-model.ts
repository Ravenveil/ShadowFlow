/**
 * craft 域 — profit 子域领域模型（纯规则层）
 *
 * 手工艺品自产自销的盈利口径与报表规则，纯函数。禁止 import express/sqlite/crypto/fs。
 * 移植自 storage/craft-profit.ts，行为逐字对齐。
 *
 * 核心口径（2026-11-07 二次定版）：
 *   每件盈利 = 售价 − 成本 − 快递费
 *   快照：记销售时把商品金额快照进销售行，事后改价不回写历史。
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_QTY = 1;
export const MAX_QTY = 999;
export const NAME_MAX = 200;
export const PRODUCT_ID_MAX = 128;
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 500;
export const MIN_DAYS = 1;
export const MAX_DAYS = 365;
export const DEFAULT_DAYS = 30;

/** 领域错误：金额/数量/字段校验失败，adapter 映射状态码。 */
export class CraftProfitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'CraftProfitError';
  }
}

export interface CraftProduct {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  shipping_cents: number;
  created_at: number;
  profit_per_unit_cents: number;
}

export interface CraftSale {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  price_cents: number;
  cost_cents: number;
  shipping_cents: number;
  profit_cents: number;
  created_at: number;
}

export interface AgentEvent {
  id: string;
  ts: number;
  kind: 'marketing' | 'order' | 'shipping';
  text: string;
}

// ── 输入校验（纯） ────────────────────────────────────────────────────────────

export function parseText(v: unknown, max: number, field: string, required = false): string {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  if (required && !s) throw new CraftProfitError(`${field} is required`);
  return s;
}

/** 分项金额：非负整数分。 */
export function parseCents(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new CraftProfitError(`${field} must be a non-negative integer (cents)`);
  }
  return n;
}

/** 数量：1..999 整数。 */
export function parseQty(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 1);
  if (!Number.isInteger(n) || n < MIN_QTY || n > MAX_QTY) {
    throw new CraftProfitError('qty must be an integer between 1 and 999');
  }
  return n;
}

/** 列表 limit 规整：有限正数截 500，否则默认 20。 */
export function parseListLimit(limit: number): number {
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.round(limit), MAX_LIST_LIMIT) : DEFAULT_LIST_LIMIT;
}

/** 天数规整：1..365，非法/0 回退 30。 */
export function parseDays(days: number): number {
  return Math.min(Math.max(Math.round(days) || DEFAULT_DAYS, MIN_DAYS), MAX_DAYS);
}

// ── 核心口径 ──────────────────────────────────────────────────────────────────

/** 每件盈利 = 售价 − 成本 − 快递。 */
export function profitPerUnit(p: { price_cents: number; cost_cents: number; shipping_cents: number }): number {
  return p.price_cents - p.cost_cents - p.shipping_cents;
}

/** 商品附加计算字段（列表用）：注入 profit_per_unit_cents。 */
export function withProductProfit<T extends { price_cents: number; cost_cents: number; shipping_cents: number }>(
  row: T,
): T & { profit_per_unit_cents: number } {
  return { ...row, profit_per_unit_cents: profitPerUnit(row) };
}

/** 销售行附加计算字段：单件盈利 × 件数。 */
export function withSaleProfit<T extends { price_cents: number; cost_cents: number; shipping_cents: number; qty: number }>(
  row: T,
): T & { profit_cents: number } {
  return { ...row, profit_cents: profitPerUnit(row) * row.qty };
}

// ── 报表规则（纯） ────────────────────────────────────────────────────────────

/** 环比：上期为 0 时，本期 0 记 0、本期>0 记 null（前端显示「新增」）。 */
export function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

/** 百分比份额：1 位小数；总额为 0 时全 0（不画假的 100%）。 */
export function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export interface Sums {
  sales_count: number;
  units: number;
  revenue_cents: number;
  cost_cents: number;
  shipping_cents: number;
}

export interface OverviewResult {
  days: number;
  window: { from: number; to: number };
  sales_count: number;
  units: number;
  revenue_cents: number;
  cost_cents: number;
  shipping_cents: number;
  profit_cents: number;
  margin_pct: number | null;
  per100: { cost: number; shipping: number; profit: number };
  delta_pct: { profit: number | null; revenue: number | null; units: number | null };
}

/**
 * 概览组装：给定本期/上期汇总，算盈利、毛利率、每100元去向、环比。
 * 时间窗口与 SQL 查询由调用方（storage）提供，规则在此。
 */
export function buildOverview(
  daysInput: number,
  window: { from: number; to: number },
  cur: Sums,
  prev: Sums,
): OverviewResult {
  const d = parseDays(daysInput);
  const cost = cur.cost_cents;
  const profit = cur.revenue_cents - cost - cur.shipping_cents;
  const prevProfit = prev.revenue_cents - prev.cost_cents - prev.shipping_cents;
  return {
    days: d,
    window,
    sales_count: cur.sales_count,
    units: cur.units,
    revenue_cents: cur.revenue_cents,
    cost_cents: cost,
    shipping_cents: cur.shipping_cents,
    profit_cents: profit,
    margin_pct: cur.revenue_cents > 0 ? Math.round((profit / cur.revenue_cents) * 1000) / 10 : null,
    per100: {
      cost: share(cur.cost_cents, cur.revenue_cents),
      shipping: share(cur.shipping_cents, cur.revenue_cents),
      profit: share(profit, cur.revenue_cents),
    },
    delta_pct: {
      profit: pctDelta(profit, prevProfit),
      revenue: pctDelta(cur.revenue_cents, prev.revenue_cents),
      units: pctDelta(cur.units, prev.units),
    },
  };
}

export interface DayPoint {
  day: number;
  units: number;
  revenue_cents: number;
  profit_cents: number;
}

/** 本地零点归桶（国内商家凌晨的单算前一天）。 */
export function startOfDay(ts: number): number {
  const x = new Date(ts);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * 每日趋势组装：给定窗口内销售行，按本地零点聚合，零值补齐。
 */
export function buildTimeseries(
  daysInput: number,
  window: { from: number; to: number },
  rows: Array<{ qty: number; price_cents: number; cost_cents: number; shipping_cents: number; created_at: number }>,
): { days: number; series: DayPoint[] } {
  const d = parseDays(daysInput);
  const map = new Map<number, DayPoint>();
  for (const r of rows) {
    const key = startOfDay(r.created_at);
    const b = map.get(key) ?? { day: key, units: 0, revenue_cents: 0, profit_cents: 0 };
    b.units += r.qty;
    b.revenue_cents += r.qty * r.price_cents;
    b.profit_cents += r.qty * profitPerUnit(r);
    map.set(key, b);
  }
  const series: DayPoint[] = [];
  for (let t = startOfDay(window.from); t <= startOfDay(window.to); t += DAY_MS) {
    series.push(map.get(t) ?? { day: t, units: 0, revenue_cents: 0, profit_cents: 0 });
  }
  return { days: d, series };
}
