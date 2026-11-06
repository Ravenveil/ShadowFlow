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
CREATE INDEX IF NOT EXISTS idx_mb_orders_status_created ON mb_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_mb_orders_trace ON mb_orders(trace_id);
CREATE TABLE IF NOT EXISTS mb_ledger (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  order_id TEXT NOT NULL DEFAULT '',
  trace_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mb_ledger_created ON mb_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_mb_ledger_order ON mb_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_mb_ledger_trace ON mb_ledger(trace_id);
`;

/** 以库文件为 key 记已建表；测试 _resetForTests() 换库后会自动重建。 */
const ready = new Set<string>();

/**
 * 幂等回填：把「已退款但成本没冲回」的历史订单补一条负数 expense。
 *
 * 2026-11-05 之前的 refundOrder 只冲收入、不冲成本，结果是全额退款之后
 * 营收 0 而成本还在，毛利变成负数 —— 明明一单没成交却显示亏钱。
 * 幂等靠 NOT EXISTS：已经有冲销行就跳过，进程重启多少遍都不会重复冲。
 * 时间取该订单 refund 行的时间，保证流水顺序和历史一致。
 */
function backfillRefundCost(conn: Database.Database): void {
  conn.exec(`
    INSERT INTO mb_ledger (id, kind, amount_cents, order_id, trace_id, created_at)
    SELECT lower(hex(randomblob(16))), 'expense', -o.cost_cents, o.id, o.trace_id,
           COALESCE(
             (SELECT l.created_at FROM mb_ledger l
               WHERE l.order_id = o.id AND l.kind = 'refund'
               ORDER BY l.created_at ASC LIMIT 1),
             o.created_at
           )
      FROM mb_orders o
     WHERE o.status = 'refunded'
       AND o.cost_cents > 0
       AND NOT EXISTS (
         SELECT 1 FROM mb_ledger l
          WHERE l.order_id = o.id AND l.kind = 'expense' AND l.amount_cents < 0
       );
  `);
}

function db(): Database.Database {
  const conn = getDb();
  const key = (conn as { name?: string }).name ?? 'default';
  if (!ready.has(key)) {
    conn.exec(DDL);
    backfillRefundCost(conn);
    ready.add(key);
  }
  // 把 JS 的分桶函数注册给 SQLite：聚合在 SQL 里做，就不用把整段区间的明细
  // 捞进 Node 再循环（十万单 = 十万行）。口径与 bucketKey 完全同源。
  conn.function('mb_bucket', { deterministic: true }, (ts: unknown, size: unknown) =>
    bucketKey(Number(ts), Number(size)),
  );
  return conn;
}

/** 仅供测试：模拟「新进程第一次连上这个库」，把幂等回填跑一遍。 */
export function _backfillRefundCostForTests(): void {
  backfillRefundCost(db());
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

/**
 * 可选时间区间（用于「本月赚多少」这类问法）。
 *
 * 与 timeWindow 的区别：那个是画曲线用的，必须给区间并补零值桶；
 * 这个是给聚合/列表用的，**不给就是全量**（保持老行为零变化），
 * 且只做边界校验，不生成桶。
 *
 * 返回 null 表示该侧不设限。
 */
function rangeWindow(startRaw: unknown, endRaw: unknown): { from: number | null; to: number | null } {
  const parse = (v: unknown, field: string): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const s = typeof v === 'string' ? v : String(v);
    // 纯数字字符串当毫秒时间戳，其余按 ISO8601
    const n = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
    if (!Number.isFinite(n)) throw new MerchantError(`${field} must be ISO8601 or epoch millis`);
    return n;
  };
  const from = parse(startRaw, 'start');
  const to = parse(endRaw, 'end');
  if (from !== null && to !== null && from >= to) {
    throw new MerchantError('start must be earlier than end');
  }
  return { from, to };
}

/** 把 rangeWindow 的结果拼成 WHERE 片段（含前导 AND），参数按顺序塞进 params。 */
function rangeClause(column: string, from: number | null, to: number | null, params: unknown[]): string {
  let sql = '';
  if (from !== null) { sql += ` AND ${column} >= ?`; params.push(from); }
  if (to !== null) { sql += ` AND ${column} < ?`; params.push(to); }
  return sql;
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

export type OrderStatus = 'created' | 'paid' | 'refunded';
const ORDER_STATUSES: OrderStatus[] = ['created', 'paid', 'refunded'];

export interface OrderRow extends Order {
  product_name: string;
  gross_profit_cents: number;
}

/**
 * 订单列表。之前只有聚合（分时/流水），业务想看「第 3 单是什么状态」只能靠
 * 流水里有没有 income/refund 行去猜 —— 状态机是 orders.status 说了算，不该让
 * 人反推。按创建时间倒序，支持按状态筛。
 * 商品名 LEFT JOIN 出来，商品被删了也不丢这一单（显示占位而不是整行消失）。
 */
/** 订单列表分页。以前只能取最近 N 条 —— 单量一多，三个月前的单再也翻不到。 */
export interface OrderPage {
  items: OrderRow[];
  /** 满足筛选条件的总单数（不是本页条数），前端据此决定还有没有下一页 */
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export function listOrders(
  input: { limit?: unknown; offset?: unknown; status?: unknown; start?: unknown; end?: unknown } = {},
): OrderPage {
  const rawLimit = Number(input.limit ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 100;
  const rawOffset = Number(input.offset ?? 0);
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
  const status = text(input.status, 16, 'status');
  if (status && !ORDER_STATUSES.includes(status as OrderStatus)) {
    throw new MerchantError(`status must be one of ${ORDER_STATUSES.join('|')}`);
  }
  const { from, to } = rangeWindow(input.start, input.end);

  const params: unknown[] = [];
  let where = status ? 'WHERE o.status = ?' : 'WHERE 1 = 1';
  if (status) params.push(status);
  where += rangeClause('o.created_at', from, to, params);

  const total = (
    db().prepare(`SELECT COUNT(*) AS n FROM mb_orders o ${where}`).get(...params) as { n: number }
  ).n;

  // ORDER BY 加 id 兜底：created_at 毫秒相同的两单在翻页时不能因为排序不稳定而重复/漏掉
  // 单笔毛利只对「已支付且未退款」的单成立：待支付的钱还没进来，已退款的收入和
  // 成本都已红字冲回。以前对所有状态一律 amount − cost，结果一单没成交也显示
  // 「毛利 +12 元」、全额退款的单还挂着正毛利 —— 与上方 KPI 的净口径直接打架。
  const sql = `
    SELECT o.*, COALESCE(p.name, '(商品已删除)') AS product_name,
           CASE WHEN o.status = 'paid' THEN o.amount_cents - o.cost_cents ELSE 0 END
             AS gross_profit_cents
      FROM mb_orders o
      LEFT JOIN mb_products p ON p.id = o.product_id
     ${where}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT ? OFFSET ?`;
  const items = db().prepare(sql).all(...params, limit, offset) as OrderRow[];
  return { items, total, limit, offset, has_more: offset + items.length < total };
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
    // 成本必须跟着一起冲回。只冲收入不冲成本的话，一单 38 元卖 12 元成本、退款之后
    // 会算成「营收 0、成本 12、毛利 −12」—— 货都退回来了还挂着成本，商家看到的利润是假的。
    // 用负数 expense 行冲销（红字），账本仍然自洽，reconcile 也能对上。
    if (order.cost_cents > 0) {
      conn
        .prepare(
          `INSERT INTO mb_ledger (id, kind, amount_cents, order_id, trace_id, created_at)
           VALUES (?, 'expense', ?, ?, ?, ?)`,
        )
        .run(randomUUID(), -order.cost_cents, orderId, order.trace_id, now);
    }
    return { order: conn.prepare(`SELECT * FROM mb_orders WHERE id = ?`).get(orderId) as Order, idempotent: false };
  })();
}

// ── 看板口径 ──────────────────────────────────────────────────────────────────

/** 单段区间的核心口径（本期与环比上期共用同一份形状）。 */
interface OverviewCore {
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

/** 上期分母为 0 时不编造增长率：两边都 0 记 0，从 0 涨起来记 null（前端显示「新增」）。 */
function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

/** 单段区间的核心口径，抽出来给「本期 / 上期」复用，保证环比两边算法同源。 */
function computeOverview(conn: Database.Database, from: number | null, to: number | null): OverviewCore {
  const ledgerParams: unknown[] = [];
  const ledgerWhere = `WHERE 1 = 1${rangeClause('created_at', from, to, ledgerParams)}`;
  const sums = conn
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount_cents ELSE 0 END), 0) AS refund,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense
       FROM mb_ledger ${ledgerWhere}`,
    )
    .get(...ledgerParams) as { income: number; refund: number; expense: number };

  const orderParams: unknown[] = [];
  const orderWhere = `WHERE 1 = 1${rangeClause('created_at', from, to, orderParams)}`;
  const orderStats = conn
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END), 0) AS refunded
       FROM mb_orders ${orderWhere}`,
    )
    .get(...orderParams) as { total: number; paid: number; refunded: number };

  const revenue = sums.income - sums.refund;
  const gross = revenue - sums.expense;
  // 客单价 = 净营收 / 未退款成交单数。把已退款单算进分母会把客单价压低 ——
  // 退了款那单不算还留着钱，商家看到的「一单挣多少」就不是真的。
  const paidOnly = orderStats.paid;
  return {
    range: { from, to },
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

export interface OverviewComparison extends OverviewCore {
  /** 相对上一等长区间的变化百分比；上期为 0 且本期 >0 时为 null。 */
  delta_pct: {
    revenue: number | null;
    gross_profit: number | null;
    orders: number | null;
  };
}

/**
 * 看板概览。默认全量（老行为不变）；传 start/end 就只看这段区间 ——
 * 业务最常问的是「这个月赚多少」，而不是「开张到现在赚多少」。
 *
 * 口径说明：区间按**记账时间**（流水 created_at / 订单 created_at）切，不是按订单支付时间。
 * 所以一笔上月成交、本月退款的单，会把退款算进本月 —— 这才是「本月净收入」的真实含义。
 *
 * compare=1 时额外算一份「上一等长区间」：[from−span, from)，span = (to ?? now) − from。
 * 只给 end 不给 start、或压根没给区间（全量）时无法定义等长窗口，返回 null 而不是硬编。
 * 百分比由后端算，前端不自己除，避免两边口径漂移。
 */
export function overview(input: { start?: unknown; end?: unknown; compare?: unknown } = {}) {
  const conn = db();
  const { from, to } = rangeWindow(input.start, input.end);
  const core = computeOverview(conn, from, to);

  const firstOrderParams: unknown[] = [];
  const firstOrderWhere = `WHERE paid_at IS NOT NULL${rangeClause('created_at', from, to, firstOrderParams)}`;
  const first_order = conn
    .prepare(`SELECT id, trace_id, paid_at FROM mb_orders ${firstOrderWhere} ORDER BY paid_at ASC LIMIT 1`)
    .get(...firstOrderParams) ?? null;

  let comparison: OverviewComparison | null = null;
  const wantCompare =
    input.compare === true || input.compare === 1 || input.compare === '1' || input.compare === 'true';
  if (wantCompare && from !== null) {
    const span = Math.max((to ?? Date.now()) - from, 1);
    const previous = computeOverview(conn, from - span, from);
    comparison = {
      ...previous,
      delta_pct: {
        revenue: pctDelta(core.revenue_cents, previous.revenue_cents),
        gross_profit: pctDelta(core.gross_profit_cents, previous.gross_profit_cents),
        orders: pctDelta(core.orders_total, previous.orders_total),
      },
    };
  }
  return { ...core, first_order, comparison };
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

/** 账实对账：流水与订单事实双向核对，数字对不上 balanced=false 并逐项给出 issues。 */
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
      `SELECT COALESCE(SUM(amount_cents), 0) AS amount,
              COALESCE(SUM(CASE WHEN status <> 'refunded' THEN cost_cents ELSE 0 END), 0) AS cost
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
  // 只给 balanced=false 不给原因，业务在页面上只能看到「账实有差额」却不知道差在哪、
  // 该找谁修。这里把每一项非零差额翻成人话，前端直接列出来即可。
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;
  const issues: string[] = [];
  if (diffs.income_cents !== 0) issues.push(`收入流水比订单实收多 ${signed(diffs.income_cents)} 分`);
  if (diffs.expense_cents !== 0) issues.push(`成本流水比订单成本多 ${signed(diffs.expense_cents)} 分`);
  if (diffs.refund_cents !== 0) issues.push(`退款流水金额比退款订单金额多 ${signed(diffs.refund_cents)} 分`);
  if (diffs.refund_rows !== 0) issues.push(`退款流水比退款订单多 ${signed(diffs.refund_rows)} 行`);
  return { ledger, orders, diffs, issues, balanced: issues.length === 0 };
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
