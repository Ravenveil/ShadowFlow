/**
 * craftProfit.ts — 产品盈利看板 API 客户端（2026-11-07）。
 * 后端：server/src/routes/dashboard/craft-profit.ts（/api/craft-profit/*）。
 *
 * 业务：帮残障伙伴卖手工艺品 —— 他们上架商品，我们营销 + 联系快递发货。
 * 盈利 = 售价 − 给手艺人 − 快递费 − 营销分摊（后端算好，前端只展示）。
 * 金额一律整数分，页面输入用「元」，换算只发生在提交/展示两头。
 */
import { getApiBase, authHeaders } from './_base';

const base = () => getApiBase();

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
  /** 每卖 100 元的钱去向（%）。 */
  per100: { artisan: number; shipping: number; marketing: number; profit: number };
  /** 环比上一等长周期（%）；上期为 0 时 null（显示「新增」）。 */
  delta_pct: { profit: number | null; revenue: number | null; units: number | null };
}

export interface CraftDayPoint {
  day: number;
  units: number;
  revenue_cents: number;
  profit_cents: number;
}

export interface CraftProductRow {
  id: string;
  name: string;
  price_cents: number;
  artisan_cents: number;
  shipping_cents: number;
  marketing_cents: number;
  profit_per_unit_cents: number;
  created_at: number;
  sold_units: number;
  revenue_cents: number;
  profit_cents: number;
}

export interface CraftSale {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  price_cents: number;
  artisan_cents: number;
  shipping_cents: number;
  marketing_cents: number;
  profit_cents: number;
  created_at: number;
}

export interface CraftProductInput {
  name: string;
  /** 以下均为整数分。 */
  price_cents: number;
  artisan_cents: number;
  shipping_cents: number;
  marketing_cents: number;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `POST ${path}: ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data.error?.message) msg = data.error.message;
    } catch {
      /* 非 JSON 响应，保留状态码信息 */
    }
    throw new Error(msg);
  }
  return res.json();
}

export function fetchCraftOverview(days = 30): Promise<CraftOverview> {
  return getJson(`/api/craft-profit/overview?days=${days}`);
}

export function fetchCraftTimeseries(days = 30): Promise<{ days: number; series: CraftDayPoint[] }> {
  return getJson(`/api/craft-profit/timeseries?days=${days}`);
}

export function fetchCraftProducts(days = 30): Promise<{ items: CraftProductRow[] }> {
  return getJson(`/api/craft-profit/products?days=${days}`);
}

export function fetchCraftSales(limit = 20): Promise<{ items: CraftSale[] }> {
  return getJson(`/api/craft-profit/sales?limit=${limit}`);
}

export function createCraftProduct(input: CraftProductInput): Promise<CraftProductRow> {
  return postJson('/api/craft-profit/products', input);
}

export function createCraftSale(productId: string, qty: number): Promise<CraftSale> {
  return postJson('/api/craft-profit/sales', { product_id: productId, qty });
}

export function seedCraftDemo(): Promise<{ seeded: boolean; products: number; sales: number }> {
  return postJson('/api/craft-profit/demo-seed', {});
}
