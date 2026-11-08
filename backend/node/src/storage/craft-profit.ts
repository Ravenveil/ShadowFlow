/**
 * craft-profit.ts — 产品盈利看板存储层（2026-11-07）。
 *
 * 业务口径（2026-11-07 二次定版：我们是手艺人自己在平台营销售卖）：
 * 手艺人在平台自产自销，平台团队负责品牌策划、营销推广、联系快递员寄出。
 * 所以每件商品的成本分两项：成本（材料+制作）/ 快递费，
 *   每件盈利 = 售价 − 成本 − 快递费
 * （原「给手艺人」槽位改叫「成本」，「营销分摊」整项删除——营销平台自己做）。
 *
 * 与 merchant-board 同仓库风格：外接模块、自带幂等 DDL、金额一律整数分。
 * 快照口径：记一笔销售时把商品的各项金额快照进销售行，事后改商品定价
 * 不回写历史 —— 业务看到的「上个月赚了多少」不会因为今天改价而变脸。
 *
 * 表：
 *   cp_products 商品（上架时定好售价与成本/快递费）
 *   cp_sales    销售流水（qty 件 × 单件快照金额，created_at 即卖出时间）
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { addColumnIfMissing, getDb } from './sqlite';

const DAY_MS = 24 * 60 * 60 * 1000;

const DDL = `
CREATE TABLE IF NOT EXISTS cp_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cp_sales (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'shipped',
  tracking TEXT NOT NULL DEFAULT '',
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

/**
 * 口径迁移（2026-11-07：给手艺人/营销分摊 → 成本）：老库补 cost_cents 列，
 * 原「给手艺人」就是我们的拿货/制作成本 → 原值回填（营销分摊概念删除，不再
 * 进盈利公式）。幂等：列已存在（新建库/已迁移）直接跳过。
 */
function migrate(conn: Database.Database): void {
  for (const table of ['cp_products', 'cp_sales']) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('cost_cents')) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0`);
      if (names.has('artisan_cents')) {
        conn.exec(`UPDATE ${table} SET cost_cents = artisan_cents`);
      }
    }
    if (table === 'cp_sales') {
      // 订单状态跟踪（2026-11-08）：老库补 status/tracking；历史行视为已发货
      //（当时只有「记账即寄出」口径），新口径 [order] 待发货 → [ship] 已发货。
      if (!names.has('status')) {
        conn.exec(`ALTER TABLE cp_sales ADD COLUMN status TEXT NOT NULL DEFAULT 'shipped'`);
      }
      if (!names.has('tracking')) {
        conn.exec(`ALTER TABLE cp_sales ADD COLUMN tracking TEXT NOT NULL DEFAULT ''`);
      }
      // 扫码购买（2026-11-08）：老库补买家字段；[order] 标记落库的行为空串。
      if (!names.has('buyer_name')) {
        conn.exec(`ALTER TABLE cp_sales ADD COLUMN buyer_name TEXT NOT NULL DEFAULT ''`);
      }
      if (!names.has('buyer_contact')) {
        conn.exec(`ALTER TABLE cp_sales ADD COLUMN buyer_contact TEXT NOT NULL DEFAULT ''`);
      }
    }
  }
  // 商品目录扩展（2026-11-08，博文/商品数据层对齐）：cp_products 补
  // image_url/status/source_post_id —— 扩展盈利域既有商品表，不另建目录表。
  // addColumnIfMissing 幂等（列已存在跳过），且必须跑在建表 DDL 之后（db()
  // 里 DDL → migrate 顺序保证）；老行由 DEFAULT 回填（status='active'）。
  addColumnIfMissing(conn, 'cp_products', 'image_url', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(conn, 'cp_products', 'status', "TEXT NOT NULL DEFAULT 'active'");
  addColumnIfMissing(conn, 'cp_products', 'source_post_id', 'TEXT');
}

/** 以库文件为 key 记已建表；测试 _resetForTests() 换库后会自动重建。 */
const ready = new Set<string>();

function db(): Database.Database {
  const conn = getDb();
  const key = (conn as { name?: string }).name ?? 'default';
  if (!ready.has(key)) {
    conn.exec(DDL);
    migrate(conn);
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

/** 商品上下架状态（目录域，2026-11-08）：active 在售 / off_shelf 已下架。 */
export type ProductStatus = 'active' | 'off_shelf';

export interface CraftProduct {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  shipping_cents: number;
  /** 商品图（聊天附件 url / 本地路径，目录展示用，可空串）。 */
  image_url: string;
  /** active | off_shelf（2026-11-08 目录扩展；老行默认 active）。 */
  status: ProductStatus;
  /** 来源博文（craft_posts.post_id，可空；空 = 未关联博文）。 */
  source_post_id: string | null;
  created_at: number;
  /** 每件盈利 = 售价 − 成本 − 快递（后端算好，前端不自己减）。 */
  profit_per_unit_cents: number;
}

export interface CraftSale {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  /** 单件快照金额（记账那一刻的商品口径）。 */
  price_cents: number;
  cost_cents: number;
  shipping_cents: number;
  profit_cents: number;
  /** 订单状态跟踪：pending 待发货 → shipped 已发货（历史行缺省 shipped）。 */
  status: string;
  /** 运单号（[ship] 登记后回填）。 */
  tracking: string;
  /** 买家称呼/联系电话（扫码购买下单时留；[order] 标记落库为空串）。 */
  buyer_name: string;
  buyer_contact: string;
  created_at: number;
}

// ── 商品（上架）──────────────────────────────────────────────────────────────

/** 商品状态校验（目录域）：active|off_shelf，其余 400。 */
function productStatus(v: unknown): ProductStatus {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s !== 'active' && s !== 'off_shelf') {
    throw new CraftProfitError('status 非法（可选 active|off_shelf）');
  }
  return s;
}

/** 来源博文引用：空/null 清空（存 NULL），有值截 128（存在性由路由校验，避免循环依赖）。 */
function sourcePostRef(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v.trim().slice(0, 128) : '';
  return s || null;
}

export function createProduct(input: {
  name?: unknown;
  price_cents?: unknown;
  cost_cents?: unknown;
  shipping_cents?: unknown;
  image_url?: unknown;
  status?: unknown;
  source_post_id?: unknown;
}): CraftProduct {
  const row = {
    id: randomUUID(),
    name: text(input.name, 200, 'name', true),
    price_cents: cents(input.price_cents ?? 0, 'price_cents'),
    cost_cents: cents(input.cost_cents ?? 0, 'cost_cents'),
    shipping_cents: cents(input.shipping_cents ?? 0, 'shipping_cents'),
    image_url: text(input.image_url, 2048, 'image_url'),
    status: input.status === undefined ? ('active' as ProductStatus) : productStatus(input.status),
    source_post_id: sourcePostRef(input.source_post_id),
    created_at: Date.now(),
  };
  db()
    .prepare(
      `INSERT INTO cp_products
         (id, name, price_cents, cost_cents, shipping_cents, image_url, status, source_post_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.name,
      row.price_cents,
      row.cost_cents,
      row.shipping_cents,
      row.image_url,
      row.status,
      row.source_post_id,
      row.created_at,
    );
  return { ...row, profit_per_unit_cents: profitPerUnit(row) };
}

function profitPerUnit(p: {
  price_cents: number;
  cost_cents: number;
  shipping_cents: number;
}): number {
  return p.price_cents - p.cost_cents - p.shipping_cents;
}

export function listProducts(filter: { status?: string } = {}): CraftProduct[] {
  const status = typeof filter.status === 'string' && filter.status.trim() ? filter.status.trim() : '';
  if (status) productStatus(status); // 非法过滤值直接 400，不静默全量
  const rows = db()
    .prepare(
      `SELECT * FROM cp_products ${status ? 'WHERE status = ?' : ''} ORDER BY created_at DESC`,
    )
    .all(...(status ? [status] : [])) as Array<Omit<CraftProduct, 'profit_per_unit_cents'>>;
  return rows.map((r) => ({ ...r, profit_per_unit_cents: profitPerUnit(r) }));
}

/** 单商品查找（目录/引用校验用）；没有返回 undefined。 */
export function getProduct(id: string): CraftProduct | undefined {
  const row = db().prepare(`SELECT * FROM cp_products WHERE id = ?`).get(id) as
    | Omit<CraftProduct, 'profit_per_unit_cents'>
    | undefined;
  return row ? { ...row, profit_per_unit_cents: profitPerUnit(row) } : undefined;
}

/**
 * 商品目录 PATCH（2026-11-08）：字段缺省（undefined）不动、null/空串清空引用；
 * created_id 不可改。找不到商品抛 404。source_post_id 存在性由路由层校验
 * （storage 层不引 craft_posts，避免 craft-profit ↔ craft-posts 循环依赖）。
 */
export function updateProduct(
  id: string,
  patch: {
    name?: unknown;
    price_cents?: unknown;
    cost_cents?: unknown;
    shipping_cents?: unknown;
    image_url?: unknown;
    status?: unknown;
    source_post_id?: unknown;
  },
): CraftProduct {
  const conn = db();
  const existing = conn.prepare(`SELECT * FROM cp_products WHERE id = ?`).get(id) as
    | Omit<CraftProduct, 'profit_per_unit_cents'>
    | undefined;
  if (!existing) throw new CraftProfitError('product not found', 404);
  const row = {
    id,
    name: patch.name !== undefined ? text(patch.name, 200, 'name', true) : existing.name,
    price_cents: patch.price_cents !== undefined ? cents(patch.price_cents, 'price_cents') : existing.price_cents,
    cost_cents: patch.cost_cents !== undefined ? cents(patch.cost_cents, 'cost_cents') : existing.cost_cents,
    shipping_cents:
      patch.shipping_cents !== undefined ? cents(patch.shipping_cents, 'shipping_cents') : existing.shipping_cents,
    image_url: patch.image_url !== undefined ? text(patch.image_url, 2048, 'image_url') : existing.image_url,
    status: patch.status !== undefined ? productStatus(patch.status) : existing.status,
    source_post_id:
      patch.source_post_id !== undefined ? sourcePostRef(patch.source_post_id) : existing.source_post_id,
    created_at: existing.created_at,
  };
  conn
    .prepare(
      `UPDATE cp_products
          SET name = ?, price_cents = ?, cost_cents = ?, shipping_cents = ?,
              image_url = ?, status = ?, source_post_id = ?
        WHERE id = ?`,
    )
    .run(
      row.name,
      row.price_cents,
      row.cost_cents,
      row.shipping_cents,
      row.image_url,
      row.status,
      row.source_post_id,
      id,
    );
  return { ...row, profit_per_unit_cents: profitPerUnit(row) };
}

/**
 * 删除商品（2026-11-08 商品售卖列表）：硬删除商品行。销售流水保留金额快照
 * （listSales 对已删商品显示「(商品已删除)」），历史盈利口径不受影响。
 * 找不到商品抛 404。
 */
export function deleteProduct(id: string): void {
  const res = db()
    .prepare(`DELETE FROM cp_products WHERE id = ?`)
    .run(String(id ?? ''));
  if (res.changes === 0) throw new CraftProfitError('product not found', 404);
}

// ── 销售（记一笔）────────────────────────────────────────────────────────────

export function createSale(input: {
  product_id?: unknown;
  qty?: unknown;
  /** 缺省 'pending'（待发货）；出单即寄出的场景传 'shipped'。 */
  status?: unknown;
}): CraftSale {
  const productId = text(input.product_id, 128, 'product_id', true);
  const product = db().prepare(`SELECT * FROM cp_products WHERE id = ?`).get(productId) as
    | Omit<CraftProduct, 'profit_per_unit_cents'>
    | undefined;
  if (!product) throw new CraftProfitError('product not found', 404);
  const n = qty(input.qty);
  const status = input.status === 'shipped' ? 'shipped' : 'pending';

  const row = {
    id: randomUUID(),
    product_id: productId,
    product_name: product.name,
    qty: n,
    price_cents: product.price_cents,
    cost_cents: product.cost_cents,
    shipping_cents: product.shipping_cents,
    status,
    tracking: '',
    created_at: Date.now(),
  };
  db()
    .prepare(
      `INSERT INTO cp_sales
         (id, product_id, qty, price_cents, cost_cents, shipping_cents, status, tracking, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.product_id,
      row.qty,
      row.price_cents,
      row.cost_cents,
      row.shipping_cents,
      row.status,
      row.tracking,
      row.created_at,
    );
  return { ...row, profit_cents: profitPerUnit(row) * n };
}

/**
 * 订单状态跟踪：把销售标记为已发货并回填运单号（幂等覆盖 tracking）。
 * 找不到销售抛 404（调用方（标记落库）会记失败动态，不静默）。
 */
export function markSaleShipped(saleId: string, tracking = ''): CraftSale {
  const conn = db();
  const row = conn
    .prepare(
      `SELECT s.*, COALESCE(p.name, '(商品已删除)') AS product_name
         FROM cp_sales s
         LEFT JOIN cp_products p ON p.id = s.product_id
        WHERE s.id = ?`,
    )
    .get(saleId) as Omit<CraftSale, 'profit_cents'> | undefined;
  if (!row) throw new CraftProfitError('sale not found', 404);
  const t = text(tracking, 100, 'tracking');
  conn.prepare(`UPDATE cp_sales SET status = 'shipped', tracking = ? WHERE id = ?`).run(t, saleId);
  return { ...row, tracking: t, status: 'shipped', profit_cents: profitPerUnit(row) * row.qty };
}

/**
 * 找该商品最近一笔待发货销售（[ship] 落库时配对订单用）。
 * 无待发货返回 null（调用方兜底：没有可配对订单时只记发货动态）。
 */
export function findPendingSale(productId: string): CraftSale | null {
  const row = db()
    .prepare(
      `SELECT s.*, COALESCE(p.name, '(商品已删除)') AS product_name
         FROM cp_sales s
         LEFT JOIN cp_products p ON p.id = s.product_id
        WHERE s.product_id = ? AND s.status = 'pending'
        ORDER BY s.created_at ASC
        LIMIT 1`,
    )
    .get(productId) as Omit<CraftSale, 'profit_cents'> | undefined;
  return row ? { ...row, profit_cents: profitPerUnit(row) * row.qty } : null;
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
  cost_cents: number;
  shipping_cents: number;
  profit_cents: number;
  margin_pct: number | null;
  /** 每卖 100 元的钱去向（百分比，1 位小数）—— 页面「钱花在哪儿」直接用。 */
  per100: { cost: number; shipping: number; profit: number };
  /** 环比上一等长周期的变化（%）；上期为 0 且本期 >0 时为 null（显示「新增」）。 */
  delta_pct: { profit: number | null; revenue: number | null; units: number | null };
}

interface Sums {
  sales_count: number;
  units: number;
  revenue_cents: number;
  cost_cents: number;
  shipping_cents: number;
}

function sumBetween(from: number, to: number): Sums {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS sales_count,
              COALESCE(SUM(qty), 0) AS units,
              COALESCE(SUM(qty * price_cents), 0) AS revenue_cents,
              COALESCE(SUM(qty * cost_cents), 0) AS cost_cents,
              COALESCE(SUM(qty * shipping_cents), 0) AS shipping_cents
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

  const cost = cur.cost_cents;
  const profit = cur.revenue_cents - cost - cur.shipping_cents;
  const prevProfit = prev.revenue_cents - prev.cost_cents - prev.shipping_cents;

  return {
    days: d,
    window: { from, to },
    sales_count: cur.sales_count,
    units: cur.units,
    revenue_cents: cur.revenue_cents,
    cost_cents: cur.cost_cents,
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
              COALESCE(SUM(s.qty * (s.price_cents - s.cost_cents - s.shipping_cents)), 0)
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
      `SELECT qty, price_cents, cost_cents, shipping_cents, created_at
         FROM cp_sales
        WHERE created_at >= ? AND created_at < ?`,
    )
    .all(from, to) as Array<{
    qty: number;
    price_cents: number;
    cost_cents: number;
    shipping_cents: number;
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

const DEMO_PRODUCTS: Array<[string, number, number, number]> = [
  // [名称, 售价, 成本, 快递]（分）
  ['手工编织收纳篮', 8900, 4200, 800],
  ['陶艺手作茶杯', 12800, 6000, 1000],
  ['剪纸窗花礼盒', 5900, 2600, 700],
  ['中国结挂饰', 4500, 2000, 600],
  ['手工皂礼盒', 7800, 3500, 800],
  ['刺绣手帕', 3900, 1800, 500],
  ['木质手工书签', 2900, 1200, 500],
  ['手绘帆布包', 9900, 4600, 900],
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
       (id, name, price_cents, cost_cents, shipping_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertSale = conn.prepare(
    `INSERT INTO cp_sales
       (id, product_id, qty, price_cents, cost_cents, shipping_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const ids: string[] = [];
  conn.transaction(() => {
    for (const [name, price, cost, shipping] of DEMO_PRODUCTS) {
      const id = randomUUID();
      ids.push(id);
      insertProduct.run(id, name, price, cost, shipping, now - 30 * DAY_MS);
    }
    // 近 30 天随机 40 笔：随机产品、1-3 件、随机落在窗口内。
    for (let i = 0; i < 40; i++) {
      const p = DEMO_PRODUCTS[Math.floor(Math.random() * DEMO_PRODUCTS.length)];
      const productId = ids[DEMO_PRODUCTS.indexOf(p)];
      const n = 1 + Math.floor(Math.random() * 3);
      const ts = now - Math.floor(Math.random() * 30 * DAY_MS);
      insertSale.run(randomUUID(), productId, n, p[1], p[2], p[3], ts);
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
