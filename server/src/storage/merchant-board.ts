/**
 * merchant-board.ts — 功能线①「商家数据看板」存储层（2026-11-05）。
 *
 * 定位：挂在现有 Node/Express 后端上的**外接模块**，不是新服务、不另起端口。
 * 自带幂等 DDL，不修改 sqlite.ts，也不碰队友的 token_usage / dashboard
 * （那边是 AI 用量看板，本模块是商家商业化数据，两条线互不依赖）。
 *
 * 补的三个评审缺口：
 *   1. 订单流水分时统计（15m/hour/day + 零值补齐 + 峰值）
 *   2. 客流量曲线（PV/UV 去重/转化率/分渠道）
 *   3. 第一单交易链路打通（访客 → 下单 → 支付 → 入账 → 看板，幂等 + 账实对账）
 *
 * 口径写死在这里，前端不自己算：
 *   营收 = income − refund；成本 = expense；毛利 = 营收 − 成本。
 *   客单价 = 营收 / 未退款成交单数（退款单不进分母，否则客单价被压低）。
 *   分时的 amount_cents 是「成交流水（含后续退款的历史成交）」，与净营收口径不同。
 *   按天分桶用本地零点（不是 UTC），否则国内商家早上 8 点前的单会落到昨天。
 *
 * 金额一律整数分，避免浮点误差。所有写路径参数绑定，事务内一次完成支付链路。
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './sqlite';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN15_MS = 15 * 60 * 1000;

const DDL = `
CREATE TABLE IF NOT EXISTS mb_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mb_visits (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  trace_id TEXT NOT NULL DEFAULT '',
  converted INTEGER NOT NULL DEFAULT 0,
  order_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mb_visits_ts ON mb_visits(created_at);
CREATE INDEX IF NOT EXISTS idx_mb_visits_trace ON mb_visits(trace_id);
CREATE TABLE IF NOT EXISTS mb_orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  visit_id TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'created',
  pay_txn_id TEXT,
  trace_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mb_orders_pay_txn
  ON mb_orders(pay_txn_id) WHERE pay_txn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mb_orders_created ON mb_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_mb_orders_trace ON mb_orders(trace_id);
CREATE TABLE IF NOT EXISTS mb_ledger (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  order_id TEXT NOT NULL DEFAULT '',
  trace_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mb_ledger_order ON mb_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_mb_ledger_trace ON mb_ledger(trace_id);
`;

/** 以库文件为 key 记已建表；测试 _resetForTests() 换库后会自动重建。 */
const ready = new Set<string>();

function db(): Database.Database {
  const conn = getDb();
  const key = (conn as { name?: string }).name ?? 'default';
  if (!ready.has(key)) {
    conn.exec(DDL);
    ready.add(key);
  }
  // 把 JS 的分桶函数注册给 SQLite：聚合在 SQL 里做，就不用把整段区间的明细
  // 捞进 Node 再循环（十万单 = 十万行）。口径与 bucketKey 完全同源。
  conn.function('mb_bucket', { deterministic: true }, (ts: unknown, size: unknown) =>
    bucketKey(Number(ts), Number(size)),
  );
  return conn;
}

export class MerchantError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── 输入校验 ──────────────────────────────────────────────────────────────────

function text(v: unknown, max: number, field: string, required = false): string {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  if (required && !s) throw new MerchantError(`${field} is required`);
  return s;
}

function cents(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new MerchantError(`${field} must be a non-negative integer (cents)`);
  }
  return n;
}

function bucketSize(granularity: unknown): number {
  if (granularity === '15m') return MIN15_MS;
  if (granularity === 'hour') return HOUR_MS;
  return DAY_MS;
}

/** 本地零点。按天分桶必须用本地日界：用 UTC 零点的话，国内商家早上 8 点前的
 *  订单会落到「昨天」，开门做生意第一件事看到的就是错的数。 */
function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 时间戳 → 桶键。day 用本地零点，其余按 epoch 整除。 */
function bucketKey(ts: number, size: number): number {
  return size === DAY_MS ? dayStart(ts) : Math.floor(ts / size) * size;
}

/** 下一个桶键。day 走 dayStart 而不是直接 +24h，跨夏令时也不会错位。 */
function nextBucket(key: number, size: number): number {
  return size === DAY_MS ? dayStart(key + DAY_MS) : key + size;
}

/** ISO8601 或毫秒时间戳；没给就取「今天 00:00（本地）到现在」。 */
function timeWindow(startRaw: unknown, endRaw: unknown, granularity: string) {
  const now = Date.now();
  const end = typeof endRaw === 'string' && endRaw ? Date.parse(endRaw) : now;
  const start = typeof startRaw === 'string' && startRaw ? Date.parse(startRaw) : dayStart(now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new MerchantError('start/end must be valid ISO8601 with start < end');
  }
  const size = bucketSize(granularity);
  // 最多 2000 个桶，避免有人传十年范围把内存打爆
  if (Math.ceil((end - start) / size) > 2000) {
    throw new MerchantError('time range too wide for this granularity');
  }
  return { from: start, to: end, size, granularity: granularity === '15m' || granularity === 'hour' ? granularity : 'day' };
}

// ── 商品 / 访客 / 订单 ────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  created_at: number;
}

export function createProduct(input: { name?: unknown; price_cents?: unknown; cost_cents?: unknown }): Product {
  const row: Product = {
    id: randomUUID(),
    name: text(input.name, 200, 'name', true),
    price_cents: cents(input.price_cents ?? 0, 'price_cents'),
    cost_cents: cents(input.cost_cents ?? 0, 'cost_cents'),
    created_at: Date.now(),
  };
  db()
    .prepare(
      `INSERT INTO mb_products (id, name, price_cents, cost_cents, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.name, row.price_cents, row.cost_cents, row.created_at);
  return row;
}

export function listProducts(): Product[] {
  return db().prepare(`SELECT * FROM mb_products ORDER BY created_at DESC`).all() as Product[];
}

export interface Visit {
  id: string;
  visitor_id: string;
  channel: string;
  trace_id: string;
  converted: number;
  order_id: string | null;
  created_at: number;
}

export function recordVisit(input: { visitor_id?: unknown; channel?: unknown; trace_id?: unknown }): Visit {
  const row: Visit = {
    id: randomUUID(),
    visitor_id: text(input.visitor_id, 128, 'visitor_id', true),
    channel: text(input.channel, 64, 'channel'),
    trace_id: text(input.trace_id, 128, 'trace_id'),
    converted: 0,
    order_id: null,
    created_at: Date.now(),
  };
  db()
    .prepare(
      `INSERT INTO mb_visits (id, visitor_id, channel, trace_id, converted, order_id, created_at)
       VALUES (?, ?, ?, ?, 0, NULL, ?)`,
    )
    .run(row.id, row.visitor_id, row.channel, row.trace_id, row.created_at);
  return row;
}

export interface Order {
  id: string;
  product_id: string;
  visit_id: string;
  amount_cents: number;
  cost_cents: number;
  status: 'created' | 'paid' | 'refunded';
  pay_txn_id: string | null;
  trace_id: string;
  created_at: number;
  paid_at: number | null;
}

export function createOrder(input: { product_id?: unknown; visit_id?: unknown; trace_id?: unknown }): Order {
  const productId = text(input.product_id, 128, 'product_id', true);
  const product = db().prepare(`SELECT * FROM mb_products WHERE id = ?`).get(productId) as Product | undefined;
  if (!product) throw new MerchantError('product not found', 404);

  const row: Order = {
    id: randomUUID(),
    product_id: productId,
    visit_id: text(input.visit_id, 128, 'visit_id'),
    amount_cents: product.price_cents,
    cost_cents: product.cost_cents,
    status: 'created',
    pay_txn_id: null,
    trace_id: text(input.trace_id, 128, 'trace_id'),
    created_at: Date.now(),
    paid_at: null,
  };
  db()
    .prepare(
      `INSERT INTO mb_orders
       (id, product_id, visit_id, amount_cents, cost_cents, status, pay_txn_id, trace_id, created_at, paid_at)
       VALUES (?, ?, ?, ?, ?, 'created', NULL, ?, ?, NULL)`,
    )
    .run(row.id, row.product_id, row.visit_id, row.amount_cents, row.cost_cents, row.trace_id, row.created_at);
  return row;
}

/** 支付事务：订单状态 + 流水收入/成本 + 访客转化回写，一次完成。 */
export function payOrder(orderId: string, payTxnId: unknown): { order: Order; idempotent: boolean } {
  const txn = text(payTxnId, 128, 'pay_txn_id', true);
  const conn = db();

  return conn.transaction(() => {
    const order = conn.prepare(`SELECT * FROM mb_orders WHERE id = ?`).get(orderId) as Order | undefined;
    if (!order) throw new MerchantError('order not found', 404);
    if (order.status === 'paid' || order.status === 'refunded') {
      if (order.pay_txn_id === txn) return { order, idempotent: true };
      throw new MerchantError('order already paid with a different transaction', 409);
    }
    const clash = conn.prepare(`SELECT id FROM mb_orders WHERE pay_txn_id = ?`).get(txn);
    if (clash) throw new MerchantError('pay_txn_id already used by another order', 409);

    const now = Date.now();
    conn.prepare(`UPDATE mb_orders SET status = 'paid', pay_txn_id = ?, paid_at = ? WHERE id = ?`).run(txn, now, orderId);
    conn
      .prepare(
        `INSERT INTO mb_ledger (id, kind, amount_cents, order_id, trace_id, created_at)
         VALUES (?, 'income', ?, ?, ?, ?)`,
      )
      .run(randomUUID(), order.amount_cents, orderId, order.trace_id, now);
    conn
      .prepare(
        `INSERT INTO mb_ledger (id, kind, amount_cents, order_id, trace_id, created_at)
         VALUES (?, 'expense', ?, ?, ?, ?)`,
      )
      .run(randomUUID(), order.cost_cents, orderId, order.trace_id, now);
    if (order.visit_id) {
      conn.prepare(`UPDATE mb_visits SET converted = 1, order_id = ? WHERE id = ?`).run(orderId, order.visit_id);
    }
    const paid = conn.prepare(`SELECT * FROM mb_orders WHERE id = ?`).get(orderId) as Order;
    return { order: paid, idempotent: false };
  })();
}

export function refundOrder(orderId: string): { order: Order; idempotent: boolean } {
  const conn = db();
  return conn.transaction(() => {
    const order = conn.prepare(`SELECT * FROM mb_orders WHERE id = ?`).get(orderId) as Order | undefined;
    if (!order) throw new MerchantError('order not found', 404);
    if (order.status !== 'paid') {
      if (order.status === 'refunded') return { order, idempotent: true };
      throw new MerchantError('only paid orders can be refunded', 409);
    }
    const now = Date.now();
    conn.prepare(`UPDATE mb_orders SET status = 'refunded' WHERE id = ?`).run(orderId);
    conn
      .prepare(
        `INSERT INTO mb_ledger (id, kind, amount_cents, order_id, trace_id, created_at)
         VALUES (?, 'refund', ?, ?, ?, ?)`,
      )
      .run(randomUUID(), order.amount_cents, orderId, order.trace_id, now);
    return { order: conn.prepare(`SELECT * FROM mb_orders WHERE id = ?`).get(orderId) as Order, idempotent: false };
  })();
}

// ── 看板口径 ──────────────────────────────────────────────────────────────────

export function overview() {
  const conn = db();
  const sums = conn
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount_cents ELSE 0 END), 0) AS refund,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense
       FROM mb_ledger`,
    )
    .get() as { income: number; refund: number; expense: number };
  const orderStats = conn
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END), 0) AS refunded
       FROM mb_orders`,
    )
    .get() as { total: number; paid: number; refunded: number };

  const revenue = sums.income - sums.refund;
  const gross = revenue - sums.expense;
  // 客单价 = 净营收 / 未退款成交单数。把已退款单算进分母会把客单价压低 ——
  // 退了款那单不算还留着钱，商家看到的「一单挣多少」就不是真的。
  const paidOnly = orderStats.paid;
  return {
    revenue_cents: revenue,
    cost_cents: sums.expense,
    gross_profit_cents: gross,
    gross_margin_pct: revenue ? Math.round((gross / revenue) * 1000) / 10 : null,
    orders_total: orderStats.total,
    paid_orders: paidOnly,
    refunded_orders: orderStats.refunded,
    transacted_orders: paidOnly + orderStats.refunded,
    avg_order_cents: paidOnly ? Math.round(revenue / paidOnly) : 0,
    first_order: conn.prepare(`SELECT id, trace_id, paid_at FROM mb_orders WHERE paid_at IS NOT NULL ORDER BY paid_at ASC LIMIT 1`).get() ?? null,
  };
}

export interface Bucket {
  ts: number;
  orders: number;
  paid_orders: number;
  amount_cents: number;
  avg_order_cents: number;
}

export function orderTimeseries(input: { granularity?: unknown; start?: unknown; end?: unknown }) {
  const { from, to, size, granularity } = timeWindow(input.start, input.end, String(input.granularity ?? 'day'));
  const conn = db();

  // 下单量按 created_at 归桶，成交额按 paid_at 归桶 —— 两个时间轴，两条 GROUP BY。
  // 之前是 SELECT 整段明细再在 JS 里循环，单量大时每次刷新都要把行全捞出来。
  const createdRows = conn
    .prepare(
      `SELECT mb_bucket(created_at, ?) AS k, COUNT(*) AS n
         FROM mb_orders
        WHERE created_at >= ? AND created_at < ?
        GROUP BY k`,
    )
    .all(size, from, to) as Array<{ k: number; n: number }>;

  const paidRows = conn
    .prepare(
      `SELECT mb_bucket(paid_at, ?) AS k, COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS amt
         FROM mb_orders
        WHERE paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?
        GROUP BY k`,
    )
    .all(size, from, to) as Array<{ k: number; n: number; amt: number }>;

  const map = new Map<number, Bucket>();
  const at = (key: number): Bucket => {
    const b = map.get(key) ?? { ts: key, orders: 0, paid_orders: 0, amount_cents: 0, avg_order_cents: 0 };
    map.set(key, b);
    return b;
  };

  for (const r of createdRows) at(r.k).orders += r.n;
  for (const r of paidRows) {
    const b = at(r.k);
    b.paid_orders += r.n;
    b.amount_cents += r.amt;
  }

  // 零值补齐：无单的桶也要有，前端曲线不跳轴
  const series: Bucket[] = [];
  for (let t = bucketKey(from, size); t < to; t = nextBucket(t, size)) {
    const b = map.get(t) ?? { ts: t, orders: 0, paid_orders: 0, amount_cents: 0, avg_order_cents: 0 };
    b.avg_order_cents = b.paid_orders ? Math.round(b.amount_cents / b.paid_orders) : 0;
    series.push(b);
  }
  const total = series.reduce(
    (acc, b) => ({
      orders: acc.orders + b.orders,
      paid_orders: acc.paid_orders + b.paid_orders,
      amount_cents: acc.amount_cents + b.amount_cents,
    }),
    { orders: 0, paid_orders: 0, amount_cents: 0 },
  );
  let peak: Bucket | null = null;
  for (const b of series) {
    if (!peak || b.amount_cents > peak.amount_cents) peak = b;
  }
  return { granularity, from, to, series, total, peak };
}

export function trafficCurve(input: { granularity?: unknown; start?: unknown; end?: unknown }) {
  const { from, to, size, granularity } = timeWindow(input.start, input.end, String(input.granularity ?? 'day'));
  const conn = db();

  // PV / UV / 转化访客都在 SQL 里算完：COUNT(DISTINCT ...) 让去重也在索引侧完成，
  // 不再把 visitor_id 全捞进 Set。
  const agg = `COUNT(*) AS pv,
               COUNT(DISTINCT visitor_id) AS uv,
               COUNT(DISTINCT CASE WHEN converted = 1 THEN visitor_id END) AS cv`;

  const bucketRows = conn
    .prepare(
      `SELECT mb_bucket(created_at, ?) AS k, ${agg}
         FROM mb_visits
        WHERE created_at >= ? AND created_at < ?
        GROUP BY k`,
    )
    .all(size, from, to) as Array<{ k: number; pv: number; uv: number; cv: number }>;

  const channelRows = conn
    .prepare(
      `SELECT COALESCE(NULLIF(channel, ''), '(unknown)') AS channel, ${agg}
         FROM mb_visits
        WHERE created_at >= ? AND created_at < ?
        GROUP BY channel`,
    )
    .all(from, to) as Array<{ channel: string; pv: number; uv: number; cv: number }>;

  const totalRow = conn
    .prepare(
      `SELECT ${agg}
         FROM mb_visits
        WHERE created_at >= ? AND created_at < ?`,
    )
    .get(from, to) as { pv: number; uv: number; cv: number };

  const pack = (x: { pv: number; uv: number; cv: number }) => ({
    pv: x.pv,
    uv: x.uv,
    converted_visits: x.cv,
    conversion_rate: x.uv ? Math.round((x.cv / x.uv) * 1000) / 10 : 0,
  });

  const empty = { pv: 0, uv: 0, cv: 0 };
  const byKey = new Map(bucketRows.map((r) => [r.k, r]));

  const series: Array<{ ts: number; pv: number; uv: number; converted_visits: number; conversion_rate: number }> = [];
  for (let t = bucketKey(from, size); t < to; t = nextBucket(t, size)) {
    series.push({ ts: t, ...pack(byKey.get(t) ?? empty) });
  }
  return {
    granularity,
    from,
    to,
    series,
    channels: channelRows.map((r) => ({ channel: r.channel, ...pack(r) })),
    total: pack(totalRow ?? empty),
  };
}

export function listLedger(limit = 100, kind = '') {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(Math.round(limit), 500) : 100;
  const k = ['income', 'expense', 'refund'].includes(kind) ? kind : '';
  const conn = db();
  const rows = k
    ? conn.prepare(`SELECT * FROM mb_ledger WHERE kind = ? ORDER BY created_at DESC LIMIT ?`).all(k, cap)
    : conn.prepare(`SELECT * FROM mb_ledger ORDER BY created_at DESC LIMIT ?`).all(cap);
  return rows;
}

/** 账实对账：流水与订单事实双向核对，数字对不上 balanced=false。 */
export function reconcile() {
  const conn = db();
  const ledger = conn
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount_cents ELSE 0 END), 0) AS refund,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense
       FROM mb_ledger`,
    )
    .get() as { income: number; refund: number; expense: number };
  const orders = conn
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS amount, COALESCE(SUM(cost_cents), 0) AS cost
       FROM mb_orders WHERE paid_at IS NOT NULL`,
    )
    .get() as { amount: number; cost: number };
  const refundCount = conn.prepare(`SELECT COUNT(*) AS n FROM mb_ledger WHERE kind = 'refund'`).get() as { n: number };
  const refundAmount = conn
    .prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS n FROM mb_orders WHERE status = 'refunded'`)
    .get() as { n: number };

  const diffs = {
    income_cents: ledger.income - orders.amount,
    expense_cents: ledger.expense - orders.cost,
    refund_cents: ledger.refund - refundAmount.n,
    refund_rows: refundCount.n - (conn.prepare(`SELECT COUNT(*) AS n FROM mb_orders WHERE status = 'refunded'`).get() as { n: number }).n,
  };
  return { ledger, orders, diffs, balanced: Object.values(diffs).every((d) => d === 0) };
}

/** 第一单五步链路：一个 trace_id 从落地到看板是否全通（事实表判定，不靠事件总线）。 */
export function firstOrderChain(traceId = '') {
  const conn = db();
  const row = traceId
    ? (conn.prepare(`SELECT * FROM mb_orders WHERE trace_id = ? AND paid_at IS NOT NULL ORDER BY paid_at ASC LIMIT 1`).get(traceId) as Order | undefined)
    : (conn.prepare(`SELECT * FROM mb_orders WHERE paid_at IS NOT NULL ORDER BY paid_at ASC LIMIT 1`).get() as Order | undefined);

  if (!row) {
    return {
      complete: false,
      trace_id: traceId,
      order_id: null,
      steps: [
        { step: 'visit_landed', ok: false },
        { step: 'order_created', ok: false },
        { step: 'order_paid', ok: false },
        { step: 'ledger_income', ok: false },
        { step: 'dashboard_visible', ok: false },
      ],
    };
  }
  // 落地这一步只看「这笔单有没有来源访客」，不看是否转化 —— 转化是后面几步的事，
  // 混在一起会让链路停在第一步，看不出到底是没流量还是没成交。
  const visit = row.visit_id ? conn.prepare(`SELECT id FROM mb_visits WHERE id = ?`).get(row.visit_id) : null;
  const income = conn.prepare(`SELECT id FROM mb_ledger WHERE order_id = ? AND kind = 'income'`).get(row.id);
  const board = overview();
  const steps = [
    { step: 'visit_landed', ok: !!visit },
    { step: 'order_created', ok: true },
    { step: 'order_paid', ok: row.paid_at != null },
    { step: 'ledger_income', ok: !!income },
    { step: 'dashboard_visible', ok: board.paid_orders > 0 && board.revenue_cents > 0 },
  ];
  return { complete: steps.every((s) => s.ok), trace_id: row.trace_id, order_id: row.id, steps };
}

export function stats() {
  const conn = db();
  const count = (table: string) => (conn.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    products: count('mb_products'),
    visits: count('mb_visits'),
    orders: count('mb_orders'),
    ledger: count('mb_ledger'),
  };
}
