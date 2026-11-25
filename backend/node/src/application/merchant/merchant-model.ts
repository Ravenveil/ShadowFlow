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

// ── 维度经济口径（渠道 / 产品 / 客户三张卡同源）───────────────────────────────
//
// channelEconomics / productEconomics / customerEconomics 原本各自内联一份
// 「营收=收入−退款、毛利=营收−成本、占比、单均」循环（三份近重复 ~350 行）。
// 这里抽成纯规则：SQL 在 storage 只按维度键聚合出原始三项/三数，口径全在此。

/** 一行维度里「钱 + 单」的共有字段；各卡在此基础上加自己的专属列。 */
export interface EconomicCore {
  orders_total: number;
  paid_orders: number;
  refunded_orders: number;
  revenue_cents: number;
  cost_cents: number;
  gross_profit_cents: number;
  gross_margin_pct: number | null;
}

/** SQL 侧输入：按维度键聚合好的流水三项。 */
export interface DimensionMoneyRow {
  income: number;
  refund: number;
  expense: number;
}

/** SQL 侧输入：按维度键聚合好的订单三数。 */
export interface DimensionOrderRow {
  total: number;
  paid: number;
  refunded: number;
}

/** 0.1% 精度占比；分母为 0 → null（不编占比）。毛利/份额共用这条规则。 */
export function sharePct(part: number, total: number): number | null {
  return total ? Math.round((part / total) * 1000) / 10 : null;
}

/** 整数分摊（单均实收 / 单均毛利）；分母为 0 → null（没成交过就没有「单均」）。 */
export function unitAvg(part: number, total: number): number | null {
  return total ? Math.round(part / total) : null;
}

/**
 * 钱 + 单两侧合并出各维度行的核心口径。
 * 两侧谁有数谁建行（blankRow 给该维度的空行，含专属列缺省）——渠道可能只有
 * 流水没订单、产品可能只有订单没流水，钱和单都不丢。
 * 口径与 buildOverviewCore 单一同源：营收 = income − refund；毛利 = 营收 − 成本。
 */
export function mergeDimensionRows<K extends string, R extends EconomicCore>(
  money: Array<{ key: K; income: number; refund: number; expense: number }>,
  orders: Array<{ key: K; total: number; paid: number; refunded: number }>,
  blankRow: (key: K) => R,
): Map<K, R> {
  const map = new Map<K, R>();
  const row = (key: K): R => {
    const r = map.get(key) ?? blankRow(key);
    map.set(key, r);
    return r;
  };
  for (const m of money) {
    const r = row(m.key);
    r.revenue_cents = m.income - m.refund;
    r.cost_cents = m.expense;
    r.gross_profit_cents = r.revenue_cents - r.cost_cents;
    r.gross_margin_pct = sharePct(r.gross_profit_cents, r.revenue_cents);
  }
  for (const o of orders) {
    const r = row(o.key);
    r.orders_total = o.total;
    r.paid_orders = o.paid;
    r.refunded_orders = o.refunded;
  }
  return map;
}

/** 维度合计：逐字段累加，比率字段按合计重算（不是平均平均数），可当场对账。 */
export function sumEconomicCore<R extends EconomicCore>(rows: R[]): EconomicCore {  const t: EconomicCore = {
    orders_total: 0,
    paid_orders: 0,
    refunded_orders: 0,
    revenue_cents: 0,
    cost_cents: 0,
    gross_profit_cents: 0,
    gross_margin_pct: null,
  };
  for (const r of rows) {
    t.orders_total += r.orders_total;
    t.paid_orders += r.paid_orders;
    t.refunded_orders += r.refunded_orders;
    t.revenue_cents += r.revenue_cents;
    t.cost_cents += r.cost_cents;
    t.gross_profit_cents += r.gross_profit_cents;
  }
  t.gross_margin_pct = sharePct(t.gross_profit_cents, t.revenue_cents);
  return t;
}

/** 客户卡专属列：成交单数（已付+已退）与复购标记（成交 ≥2 单即复购客户）。 */
export interface RepeatMark {
  paid_orders: number;
  refunded_orders: number;
  transacted_orders: number;
  is_repeat: boolean;
}

/**
 * 客户行的成交/复购派生（复购规则单一真源：transacted = 已付 + 已退，≥2 即复购）。
 * 在 mergeDimensionRows 之后对客户行调用一次。
 */
export function markRepeatRows<R extends RepeatMark>(rows: R[]): void {
  for (const r of rows) {
    r.transacted_orders = r.paid_orders + r.refunded_orders;
    r.is_repeat = r.transacted_orders >= 2;
  }
}

/** 复购拆分的最小行：客户卡在钱口径上多「成交单数 + 是否复购」。 */
export interface RepeatRow {
  revenue_cents: number;
  transacted_orders: number;
  is_repeat: boolean;
}

export interface RepeatSummary {
  /** 有成交（≥1 单已付/已退）的客户数；只下单未付的不算 */
  customers: number;
  /** 成交 ≥2 单的客户数 */
  repeat_customers: number;
  /** 复购率 = repeat_customers ÷ customers（0.1% 精度）；没有客户时为 null */
  repeat_rate_pct: number | null;
  /** 复购客户（成交≥2）在窗口内的营收合计 */
  repeat_customer_revenue_cents: number;
  /** 单次/未成交客户的营收合计；与上一行相加恒等于总营收 */
  single_customer_revenue_cents: number;
  /** 复购客户营收占比（0.1% 精度）；总营收为 0 时为 null */
  repeat_revenue_share_pct: number | null;
  /** 客户均贡献 = 营收 ÷ 客户数；没有客户时为 null */
  avg_revenue_per_customer_cents: number | null;
}

/**
 * 复购摘要（人群口径，一眼可对账）：成交 ≥1 单算客户，≥2 单是复购客户；
 * 复购人群营收 + 其余人群营收恒等于总营收，不会出现拆不平的缺口。
 */
export function buildRepeatSummary(rows: RepeatRow[]): RepeatSummary {
  const totalRevenue = rows.reduce((a, r) => a + r.revenue_cents, 0);
  let customers = 0;
  let repeatCustomers = 0;
  let repeatRevenue = 0;
  for (const r of rows) {
    if (r.transacted_orders >= 1) customers += 1;
    if (r.is_repeat) {
      repeatCustomers += 1;
      repeatRevenue += r.revenue_cents;
    }
  }
  return {
    customers,
    repeat_customers: repeatCustomers,
    repeat_rate_pct: sharePct(repeatCustomers, customers),
    repeat_customer_revenue_cents: repeatRevenue,
    single_customer_revenue_cents: totalRevenue - repeatRevenue,
    repeat_revenue_share_pct: sharePct(repeatRevenue, totalRevenue),
    avg_revenue_per_customer_cents: unitAvg(totalRevenue, customers),
  };
}
