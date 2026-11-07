/**
 * craft-profit.ts — 产品盈利看板存储层（2026-11-07）。
 *
 * 业务口径（2026-11-07 用户定版）：帮残障伙伴卖手工艺品 —— 他们只负责上架
 * 商品，我们负责营销、联系快递员寄出商品。所以每件商品的成本分三项：
 *   给手艺人 / 快递费 / 营销分摊，
 *   每件盈利 = 售价 − 给手艺人 − 快递费 − 营销分摊。
 *
 * 与 merchant-board 同仓库风格：外接模块、自带幂等 DDL、金额一律整数分。
 * 快照口径：记一笔销售时把商品的四项金额快照进销售行，事后改商品定价
 * 不回写历史 —— 业务看到的「上个月赚了多少」不会因为今天改价而变脸。
 *
 * 表：
 *   cp_products 商品（上架时定好售价与三项成本）
 *   cp_sales    销售流水（qty 件 × 单件快照金额，created_at 即卖出时间）
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './sqlite';

const DAY_MS = 24 * 60 * 60 * 1000;

const DDL = `
CREATE TABLE IF NOT EXISTS cp_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  artisan_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  marketing_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cp_sales (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL,
  artisan_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  marketing_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cp_sales_created ON cp_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_cp_sales_product ON cp_sales(product_id);
CREATE TABLE IF NOT EXISTS cp_agent_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cp_agent_events_ts ON cp_agent_events(ts);
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
  return conn;
}

export class CraftProfitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── 输入校验（分项金额一律非负整数分）────────────────────────────────────────

function text(v: unknown, max: number, field: string, required = false): string {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  if (required && !s) throw new CraftProfitError(`${field} is required`);
  return s;
}

function cents(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new CraftProfitError(`${field} must be a non-negative integer (cents)`);
  }
  return n;
}

function qty(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 999) {
    throw new CraftProfitError('qty must be an integer between 1 and 999');
  }
  return n;
}

// ── 类型 ─────────────────────────────────────────────────────────────────────

export interface CraftProduct {
  id: string;
  name: string;
  price_cents: number;
  artisan_cents: number;
  shipping_cents: number;
  marketing_cents: number;
  created_at: number;
  /** 每件盈利 = 售价 − 给手艺人 − 快递 − 营销（后端算好，前端不自己减）。 */
  profit_per_unit_cents: number;
}

export interface CraftSale {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  /** 单件快照金额（记账那一刻的商品口径）。 */
  price_cents: number;
  artisan_cents: number;
  shipping_cents: number;
  marketing_cents: number;
  profit_cents: number;
  created_at: number;
}

// ── 商品（上架）──────────────────────────────────────────────────────────────

export function createProduct(input: {
  name?: unknown;
  price_cents?: unknown;
  artisan_cents?: unknown;
  shipping_cents?: unknown;
  marketing_cents?: unknown;
}): CraftProduct {
  const row = {
    id: randomUUID(),
    name: text(input.name, 200, 'name', true),
    price_cents: cents(input.price_cents ?? 0, 'price_cents'),
    artisan_cents: cents(input.artisan_cents ?? 0, 'artisan_cents'),
    shipping_cents: cents(input.shipping_cents ?? 0, 'shipping_cents'),
    marketing_cents: cents(input.marketing_cents ?? 0, 'marketing_cents'),
    created_at: Date.now(),
  };
  db()
    .prepare(
      `INSERT INTO cp_products
         (id, name, price_cents, artisan_cents, shipping_cents, marketing_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.name, row.price_cents, row.artisan_cents, row.shipping_cents, row.marketing_cents, row.created_at);
  return { ...row, profit_per_unit_cents: profitPerUnit(row) };
}

function profitPerUnit(p: {
  price_cents: number;
  artisan_cents: number;
  shipping_cents: number;
  marketing_cents: number;
}): number {
  return p.price_cents - p.artisan_cents - p.shipping_cents - p.marketing_cents;
}

export function listProducts(): CraftProduct[] {
  const rows = db().prepare(`SELECT * FROM cp_products ORDER BY created_at DESC`).all() as Array<
    Omit<CraftProduct, 'profit_per_unit_cents'>
  >;
  return rows.map((r) => ({ ...r, profit_per_unit_cents: profitPerUnit(r) }));
}

// ── 销售（记一笔）────────────────────────────────────────────────────────────

export function createSale(input: { product_id?: unknown; qty?: unknown }): CraftSale {
  const productId = text(input.product_id, 128, 'product_id', true);
  const product = db().prepare(`SELECT * FROM cp_products WHERE id = ?`).get(productId) as
    | Omit<CraftProduct, 'profit_per_unit_cents'>
    | undefined;
  if (!product) throw new CraftProfitError('product not found', 404);
  const n = qty(input.qty);

  const row = {
    id: randomUUID(),
    product_id: productId,
    product_name: product.name,
    qty: n,
    price_cents: product.price_cents,
    artisan_cents: product.artisan_cents,
    shipping_cents: product.shipping_cents,
    marketing_cents: product.marketing_cents,
    created_at: Date.now(),
  };
  db()
    .prepare(
      `INSERT INTO cp_sales
         (id, product_id, qty, price_cents, artisan_cents, shipping_cents, marketing_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.product_id, row.qty, row.price_cents, row.artisan_cents, row.shipping_cents, row.marketing_cents, row.created_at);
  return { ...row, profit_cents: profitPerUnit(row) * n };
}

// ── 运营动态（智能体活动流水）────────────────────────────────────────────────

export interface AgentEvent {
  id: string;
  ts: number;
  kind: 'marketing' | 'order' | 'shipping';
  text: string;
}

export function insertAgentEvent(kind: AgentEvent['kind'], text: string, ts = Date.now()): AgentEvent {
  const ev: AgentEvent = { id: randomUUID(), ts, kind, text };
  db()
    .prepare(`INSERT INTO cp_agent_events (id, ts, kind, text) VALUES (?, ?, ?, ?)`)
    .run(ev.id, ev.ts, ev.kind, ev.text);
  return ev;
}

export function listAgentEvents(limit = 20): AgentEvent[] {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(Math.round(limit), 500) : 20;
  return db()
    .prepare(`SELECT * FROM cp_agent_events ORDER BY ts DESC, id DESC LIMIT ?`)
    .all(cap) as AgentEvent[];
}

export function listSales(limit = 20): CraftSale[] {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(Math.round(limit), 500) : 20;
  const rows = db()
    .prepare(
      `SELECT s.*, COALESCE(p.name, '(商品已删除)') AS product_name
         FROM cp_sales s
         LEFT JOIN cp_products p ON p.id = s.product_id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ?`,
    )
    .all(cap) as Array<Omit<CraftSale, 'profit_cents'>>;
  return rows.map((r) => ({ ...r, profit_cents: profitPerUnit(r) * r.qty }));
}

// ── 概览 / 分解 / 趋势 ───────────────────────────────────────────────────────

export interface CraftOverview {
  days: number;
  window: { from: number; to: number };
  sales_count: number;
  units: number;
  revenue_cents: number;
  artisan_cents: number;
  shipping_cents: number;
  marketing_cents: number;
  cost_cents: number;
  profit_cents: number;
  margin_pct: number | null;
  /** 每卖 100 元的钱去向（百分比，1 位小数）—— 页面「钱花在哪儿」直接用。 */
  per100: { artisan: number; shipping: number; marketing: number; profit: number };
  /** 环比上一等长周期的变化（%）；上期为 0 且本期 >0 时为 null（显示「新增」）。 */
  delta_pct: { profit: number | null; revenue: number | null; units: number | null };
}

interface Sums {
  sales_count: number;
  units: number;
  revenue_cents: number;
  artisan_cents: number;
  shipping_cents: number;
  marketing_cents: number;
}

function sumBetween(from: number, to: number): Sums {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS sales_count,
              COALESCE(SUM(qty), 0) AS units,
              COALESCE(SUM(qty * price_cents), 0) AS revenue_cents,
              COALESCE(SUM(qty * artisan_cents), 0) AS artisan_cents,
              COALESCE(SUM(qty * shipping_cents), 0) AS shipping_cents,
              COALESCE(SUM(qty * marketing_cents), 0) AS marketing_cents
         FROM cp_sales
        WHERE created_at >= ? AND created_at < ?`,
    )
    .get(from, to) as Sums;
  return row;
}

/** 环比：上期为 0 时不编造增长率，两边都 0 记 0，从 0 涨起来记 null（前端显示「新增」）。 */
function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

/** 百分比份额：1 位小数；总额为 0 时全 0（不画假的 100%）。 */
function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export function overview(days = 30): CraftOverview {
  const d = Math.min(Math.max(Math.round(days) || 30, 1), 365);
  const to = Date.now();
  const from = to - d * DAY_MS;
  const cur = sumBetween(from, to);
  const prev = sumBetween(from - d * DAY_MS, from);

  const cost = cur.artisan_cents + cur.shipping_cents + cur.marketing_cents;
  const profit = cur.revenue_cents - cost;
  const prevCost = prev.artisan_cents + prev.shipping_cents + prev.marketing_cents;
  const prevProfit = prev.revenue_cents - prevCost;

  return {
    days: d,
    window: { from, to },
    sales_count: cur.sales_count,
    units: cur.units,
    revenue_cents: cur.revenue_cents,
    artisan_cents: cur.artisan_cents,
    shipping_cents: cur.shipping_cents,
    marketing_cents: cur.marketing_cents,
    cost_cents: cost,
    profit_cents: profit,
    margin_pct: cur.revenue_cents > 0 ? Math.round((profit / cur.revenue_cents) * 1000) / 10 : null,
    per100: {
      artisan: share(cur.artisan_cents, cur.revenue_cents),
      shipping: share(cur.shipping_cents, cur.revenue_cents),
      marketing: share(cur.marketing_cents, cur.revenue_cents),
      profit: share(profit, cur.revenue_cents),
    },
    delta_pct: {
      profit: pctDelta(profit, prevProfit),
      revenue: pctDelta(cur.revenue_cents, prev.revenue_cents),
      units: pctDelta(cur.units, prev.units),
    },
  };
}

export interface ProductRow extends CraftProduct {
  sold_units: number;
  revenue_cents: number;
  profit_cents: number;
}

/** 商品盈利排行：窗口内卖了多少、赚了多少，按总盈利从高到低。 */
export function productBreakdown(days = 30): ProductRow[] {
  const d = Math.min(Math.max(Math.round(days) || 30, 1), 365);
  const to = Date.now();
  const from = to - d * DAY_MS;
  const rows = db()
    .prepare(
      `SELECT p.*,
              COALESCE(SUM(s.qty), 0) AS sold_units,
              COALESCE(SUM(s.qty * s.price_cents), 0) AS revenue_cents,
              COALESCE(SUM(s.qty * (s.price_cents - s.artisan_cents - s.shipping_cents - s.marketing_cents)), 0)
                AS profit_cents
         FROM cp_products p
         LEFT JOIN cp_sales s ON s.product_id = p.id AND s.created_at >= ? AND s.created_at < ?
        GROUP BY p.id
        ORDER BY profit_cents DESC, p.created_at DESC`,
    )
    .all(from, to) as Array<Omit<CraftProduct, 'profit_per_unit_cents'> & ProductRow>;
  return rows.map((r) => ({ ...r, profit_per_unit_cents: profitPerUnit(r) }));
}

export interface DayPoint {
  day: number;
  units: number;
  revenue_cents: number;
  profit_cents: number;
}

/** 每日盈利趋势：本地零点归桶（国内商家凌晨的单算前一天的生意），零值补齐。 */
export function timeseries(days = 30): { days: number; series: DayPoint[] } {
  const d = Math.min(Math.max(Math.round(days) || 30, 1), 365);
  const to = Date.now();
  const from = to - d * DAY_MS;
  const startOfDay = (ts: number): number => {
    const x = new Date(ts);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };

  const rows = db()
    .prepare(
      `SELECT qty, price_cents, artisan_cents, shipping_cents, marketing_cents, created_at
         FROM cp_sales
        WHERE created_at >= ? AND created_at < ?`,
    )
    .all(from, to) as Array<{
    qty: number;
    price_cents: number;
    artisan_cents: number;
    shipping_cents: number;
    marketing_cents: number;
    created_at: number;
  }>;

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
  for (let t = startOfDay(from); t <= startOfDay(to); t += DAY_MS) {
    series.push(map.get(t) ?? { day: t, units: 0, revenue_cents: 0, profit_cents: 0 });
  }
  return { days: d, series };
}

// ── 演示数据（一批手工艺品 + 近 30 天销售）───────────────────────────────────

const DEMO_PRODUCTS: Array<[string, number, number, number, number]> = [
  // [名称, 售价, 给手艺人, 快递, 营销]（分）
  ['手工编织收纳篮', 8900, 4200, 800, 600],
  ['陶艺手作茶杯', 12800, 6000, 1000, 900],
  ['剪纸窗花礼盒', 5900, 2600, 700, 500],
  ['中国结挂饰', 4500, 2000, 600, 400],
  ['手工皂礼盒', 7800, 3500, 800, 600],
  ['刺绣手帕', 3900, 1800, 500, 300],
  ['木质手工书签', 2900, 1200, 500, 300],
  ['手绘帆布包', 9900, 4600, 900, 700],
];

/**
 * 灌一批演示数据：8 件手工艺品 + 近 30 天约 40 笔销售。
 * 幂等：已有商品就跳过（不覆盖业务真录的数据），返回 seeded=false。
 */
export function seedDemo(): { seeded: boolean; products: number; sales: number } {
  const conn = db();
  const existing = conn.prepare(`SELECT COUNT(*) AS n FROM cp_products`).get() as { n: number };
  if (existing.n > 0) return { seeded: false, products: 0, sales: 0 };

  const now = Date.now();
  const insertProduct = conn.prepare(
    `INSERT INTO cp_products
       (id, name, price_cents, artisan_cents, shipping_cents, marketing_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSale = conn.prepare(
    `INSERT INTO cp_sales
       (id, product_id, qty, price_cents, artisan_cents, shipping_cents, marketing_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const ids: string[] = [];
  conn.transaction(() => {
    for (const [name, price, artisan, shipping, marketing] of DEMO_PRODUCTS) {
      const id = randomUUID();
      ids.push(id);
      insertProduct.run(id, name, price, artisan, shipping, marketing, now - 30 * DAY_MS);
    }
    // 近 30 天随机 40 笔：随机产品、1-3 件、随机落在窗口内。
    for (let i = 0; i < 40; i++) {
      const p = DEMO_PRODUCTS[Math.floor(Math.random() * DEMO_PRODUCTS.length)];
      const productId = ids[DEMO_PRODUCTS.indexOf(p)];
      const n = 1 + Math.floor(Math.random() * 3);
      const ts = now - Math.floor(Math.random() * 30 * DAY_MS);
      insertSale.run(randomUUID(), productId, n, p[1], p[2], p[3], p[4], ts);
      // 运营动态回填：出单 + 联系快递员寄出（智能体经营流水，时间与销售对齐）
      insertAgentEvent('order', `「${p[0]}」售出 ${n} 件，入账 ¥${((p[1] * n) / 100).toFixed(2)}`, ts);
      insertAgentEvent('shipping', `已联系快递员上门取件，寄出「${p[0]}」×${n}`, ts);
    }
    // 营销推广动态：12 条散在窗口内
    for (let i = 0; i < 12; i++) {
      const p = DEMO_PRODUCTS[Math.floor(Math.random() * DEMO_PRODUCTS.length)];
      insertAgentEvent('marketing', `给「${p[0]}」做朋友圈 + 短视频推广`, now - Math.floor(Math.random() * 30 * DAY_MS));
    }
  })();

  return { seeded: true, products: ids.length, sales: 40 };
}
