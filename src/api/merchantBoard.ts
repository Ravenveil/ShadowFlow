/**
 * Merchant Board API client — 功能线① 商家数据看板（2026-11-05）。
 *
 * 后端：server/src/routes/merchant-board.ts（挂载在 /api/merchant）。
 * 与 dashboard.ts（AI 用量看板）并存互不覆盖：那边是 tokens/calls/cost，
 * 这边是订单流水/客流/营收，口径由后端算好，前端不自己算。
 */

import { getApiBase } from './_base';

const BASE = `${getApiBase()}/api/merchant`;

export type Granularity = '15m' | 'hour' | 'day';

export interface MerchantProduct {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  created_at: number;
}

export interface MerchantOrder {
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

export interface MerchantOverview {
  revenue_cents: number;
  cost_cents: number;
  gross_profit_cents: number;
  gross_margin_pct: number | null;
  orders_total: number;
  /** 未退款成交单数（客单价的分母） */
  paid_orders: number;
  refunded_orders: number;
  /** 成交过的单数 = paid_orders + refunded_orders */
  transacted_orders: number;
  avg_order_cents: number;
  first_order: { id: string; trace_id: string; paid_at: number } | null;
}

export interface OrderBucket {
  ts: number;
  orders: number;
  paid_orders: number;
  amount_cents: number;
  avg_order_cents: number;
}

export interface OrderTimeseries {
  granularity: Granularity;
  from: number;
  to: number;
  series: OrderBucket[];
  total: { orders: number; paid_orders: number; amount_cents: number };
  peak: OrderBucket | null;
}

export interface TrafficBucket {
  ts: number;
  pv: number;
  uv: number;
  converted_visits: number;
  conversion_rate: number;
}

export interface TrafficCurve {
  granularity: Granularity;
  from: number;
  to: number;
  series: TrafficBucket[];
  channels: Array<TrafficBucket & { channel: string }>;
  total: Omit<TrafficBucket, 'ts'>;
}

export interface ReconcileResult {
  ledger: { income: number; refund: number; expense: number };
  orders: { amount: number; cost: number };
  diffs: { income_cents: number; expense_cents: number; refund_cents: number; refund_rows: number };
  balanced: boolean;
}

export interface FirstOrderChain {
  complete: boolean;
  trace_id: string;
  order_id: string | null;
  steps: Array<{ step: string; ok: boolean }>;
}

export class MerchantBoardError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // 非 JSON 错误体（SPA fallback 回了 index.html）用 statusText。
    }
    throw new MerchantBoardError(res.status, msg);
  }
  return (await res.json()) as T;
}

function post<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => handle<T>(r));
}

function windowQuery(opts: { granularity?: Granularity; start?: string; end?: string }): string {
  const qs = new URLSearchParams();
  if (opts.granularity) qs.set('granularity', opts.granularity);
  if (opts.start) qs.set('start', opts.start);
  if (opts.end) qs.set('end', opts.end);
  return qs.toString();
}

export function fetchMerchantStats(): Promise<{ products: number; visits: number; orders: number; ledger: number }> {
  return fetch(`${BASE}/stats`).then((r) => handle(r));
}

export function fetchMerchantOverview(): Promise<MerchantOverview> {
  return fetch(`${BASE}/overview`).then((r) => handle(r));
}

export function fetchOrderTimeseries(opts: { granularity?: Granularity; start?: string; end?: string } = {}): Promise<OrderTimeseries> {
  const qs = windowQuery(opts);
  return fetch(`${BASE}/orders/timeseries${qs ? `?${qs}` : ''}`).then((r) => handle(r));
}

export function fetchTrafficCurve(opts: { granularity?: Granularity; start?: string; end?: string } = {}): Promise<TrafficCurve> {
  const qs = windowQuery(opts);
  return fetch(`${BASE}/traffic/curve${qs ? `?${qs}` : ''}`).then((r) => handle(r));
}

export function fetchMerchantLedger(limit = 100, kind = ''): Promise<Array<{
  id: string; kind: string; amount_cents: number; order_id: string; trace_id: string; created_at: number;
}>> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (kind) qs.set('kind', kind);
  return fetch(`${BASE}/ledger?${qs}`).then((r) => handle(r));
}

export function fetchReconcile(): Promise<ReconcileResult> {
  return fetch(`${BASE}/reconcile`).then((r) => handle(r));
}

/** 订单列表行：比下单返回多商品名和单笔毛利，省得前端再拿 product_id 去对。 */
export interface MerchantOrderRow extends MerchantOrder {
  product_name: string;
  gross_profit_cents: number;
}

export function fetchMerchantOrders(opts: { limit?: number; status?: string } = {}): Promise<MerchantOrderRow[]> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.status) qs.set('status', opts.status);
  const q = qs.toString();
  return fetch(`${BASE}/orders${q ? `?${q}` : ''}`).then((r) => handle(r));
}

export function fetchFirstOrderChain(traceId = ''): Promise<FirstOrderChain> {
  const qs = traceId ? `?trace_id=${encodeURIComponent(traceId)}` : '';
  return fetch(`${BASE}/first-order${qs}`).then((r) => handle(r));
}

export function listMerchantProducts(): Promise<MerchantProduct[]> {
  return fetch(`${BASE}/products`).then((r) => handle(r));
}

export function createMerchantProduct(payload: {
  name: string; price_cents: number; cost_cents?: number;
}): Promise<MerchantProduct> {
  return post(`${BASE}/products`, payload);
}

export function recordMerchantVisit(payload: {
  visitor_id: string; channel?: string; trace_id?: string;
}): Promise<{ id: string; visitor_id: string; channel: string; trace_id: string; created_at: number }> {
  return post(`${BASE}/visits`, payload);
}

export function createMerchantOrder(payload: {
  product_id: string; visit_id?: string; trace_id?: string;
}): Promise<MerchantOrder> {
  return post(`${BASE}/orders`, payload);
}

export function payMerchantOrder(orderId: string, payTxnId: string): Promise<{ order: MerchantOrder; idempotent: boolean }> {
  return post(`${BASE}/orders/${encodeURIComponent(orderId)}/pay`, { pay_txn_id: payTxnId });
}

export function refundMerchantOrder(orderId: string): Promise<{ order: MerchantOrder; idempotent: boolean }> {
  return post(`${BASE}/orders/${encodeURIComponent(orderId)}/refund`, {});
}
