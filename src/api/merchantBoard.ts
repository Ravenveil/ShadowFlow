/**
 * Merchant Board API client — 功能线① 商家数据看板（2026-11-05）。
 *
 * 后端：server/src/routes/merchant-board.ts（挂载在 /api/merchant）。
 * 与 dashboard.ts（AI 用量看板）并存互不覆盖：那边是 tokens/calls/cost，
 * 这边是订单流水/客流/营收，口径由后端算好，前端不自己算。
 * /evidence* 是演示证据包（①③ 留痕汇总 + Markdown / CSV 下载），同样只读。
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

/** 上一等长区间的口径 + 变化率；compare=1 且给了 start 时才有值。 */
export interface MerchantOverviewComparison {
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
  /** 上期为 0 且本期 >0 时是 null（显示「新增」，不编造百分比） */
  delta_pct: { revenue: number | null; gross_profit: number | null; orders: number | null };
}

export interface MerchantOverview {
  /** 统计区间；from/to 为 null 表示「全量」 */
  range?: { from: number | null; to: number | null };
  comparison?: MerchantOverviewComparison | null;
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

/** 渠道获客经济性一行：渠道维度的钱口径（营收/成本/毛利/占比）+ 单量拆分。 */
export interface ChannelEconomicRow {
  channel: string;
  orders_total: number;
  paid_orders: number;
  refunded_orders: number;
  revenue_cents: number;
  cost_cents: number;
  gross_profit_cents: number;
  gross_margin_pct: number | null;
  /** 该渠道营收占比（%）；全量营收为 0 时为 null */
  revenue_share_pct: number | null;
}

export interface ChannelEconomics {
  range: { from: number | null; to: number | null };
  channels: ChannelEconomicRow[];
  /** 各渠道合计，与 overview 同窗口逐字段一致 */
  total: Omit<ChannelEconomicRow, 'channel' | 'revenue_share_pct'>;
}

export interface ReconcileResult {
  ledger: { income: number; refund: number; expense: number };
  orders: { amount: number; cost: number };
  diffs: { income_cents: number; expense_cents: number; refund_cents: number; refund_rows: number };
  /** 账实不一致时逐项说清差在哪；balanced=true 时为空数组 */
  issues: string[];
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

function windowQuery(opts: {
  granularity?: Granularity; start?: string; end?: string; compare?: boolean;
}): string {
  const qs = new URLSearchParams();
  if (opts.granularity) qs.set('granularity', opts.granularity);
  if (opts.start) qs.set('start', opts.start);
  if (opts.end) qs.set('end', opts.end);
  if (opts.compare) qs.set('compare', '1');
  return qs.toString();
}

export function fetchMerchantStats(): Promise<{ products: number; visits: number; orders: number; ledger: number }> {
  return fetch(`${BASE}/stats`).then((r) => handle(r));
}

/**
 * 概览。不传 start/end = 全量（老行为）；传了就按记账时间只看这段区间，
 * 用来回答「这个月赚多少」。
 */
export function fetchMerchantOverview(
  opts: { start?: string; end?: string; compare?: boolean } = {},
): Promise<MerchantOverview> {
  const qs = windowQuery(opts);
  return fetch(`${BASE}/overview${qs ? `?${qs}` : ''}`).then((r) => handle(r));
}

export function fetchOrderTimeseries(opts: { granularity?: Granularity; start?: string; end?: string } = {}): Promise<OrderTimeseries> {
  const qs = windowQuery(opts);
  return fetch(`${BASE}/orders/timeseries${qs ? `?${qs}` : ''}`).then((r) => handle(r));
}

export function fetchTrafficCurve(opts: { granularity?: Granularity; start?: string; end?: string } = {}): Promise<TrafficCurve> {
  const qs = windowQuery(opts);
  return fetch(`${BASE}/traffic/curve${qs ? `?${qs}` : ''}`).then((r) => handle(r));
}

/** 渠道获客经济性。start/end 与概览共用同一组（kpiWindow），合计才能和 KPI 对上。 */
export function fetchChannelEconomics(opts: { start?: string; end?: string } = {}): Promise<ChannelEconomics> {
  const qs = windowQuery(opts);
  return fetch(`${BASE}/channels${qs ? `?${qs}` : ''}`).then((r) => handle(r));
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

/** 订单列表行：比下单返回多商品名和单笔毛利，省得前端再拿 product_id 去对。
 *  gross_profit_cents 只有 status='paid' 才有意义，其余状态后端返回 0（钱没进来/已冲回）。 */
export interface MerchantOrderRow extends MerchantOrder {
  product_name: string;
  gross_profit_cents: number;
}

/** 订单分页：total 是满足筛选条件的总单数，前端据此决定还有没有下一页。 */
export interface MerchantOrderPage {
  items: MerchantOrderRow[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export function fetchMerchantOrders(
  opts: { limit?: number; offset?: number; status?: string; start?: string; end?: string } = {},
): Promise<MerchantOrderPage> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.offset) qs.set('offset', String(opts.offset));
  if (opts.status) qs.set('status', opts.status);
  if (opts.start) qs.set('start', opts.start);
  if (opts.end) qs.set('end', opts.end);
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

// ── 演示证据包（①③ 运行记录导出） ─────────────────────────────────────────────

/**
 * 前端只消费摘要投影；完整结构见 server/src/storage/evidence.ts 的 EvidenceReport。
 * 这里不重新定义所有明细数组，避免后端加字段时两边类型反复漂移。
 */
export interface EvidenceSummary {
  schema_version: string;
  generated_at: number;
  window: { from: number | null; to: number | null; label: string };
  merchant: {
    overview: MerchantOverview;
    reconcile: ReconcileResult;
    first_order: FirstOrderChain;
    orders: { total: number; shown: number };
  };
  memory: {
    stats: {
      handoffs: number;
      accepted: number;
      profile_events: number;
      pending_conflicts: number;
      /** 反馈队列模块上线后才有这三个字段（老库/未启用时不返回） */
      feedback_total?: number;
      feedback_pending?: number;
      feedback_failed?: number;
    };
    audit: { total: number; resolutions: number; by_action: Record<string, number> };
    feedback: { available: boolean };
  };
  /** 协作 DAG 执行留痕（只读 agent_hops）：异常处理与人工审批的计数 */
  collaboration: {
    available: boolean;
    total: number;
    failures: number;
    reworks: number;
    approval_rejections: number;
    open: number;
  };
  human_decisions: {
    pending_conflicts: number;
    resolutions: number;
    failed_feedback: number;
    pending_feedback: number;
    hop_failures: number;
    hop_approval_rejections: number;
    note: string;
  };
  notes: string[];
}

/** 导出区间与 KPI 区间共用，保证「页面上看到的」与「附件里的」是同一段。 */
export interface EvidenceWindow {
  start?: string;
  end?: string;
}

function evidenceQuery(opts: EvidenceWindow): string {
  const qs = new URLSearchParams();
  if (opts.start) qs.set('start', opts.start);
  if (opts.end) qs.set('end', opts.end);
  return qs.toString();
}

export function fetchEvidence(opts: EvidenceWindow = {}): Promise<EvidenceSummary> {
  const qs = evidenceQuery(opts);
  return fetch(`${BASE}/evidence${qs ? `?${qs}` : ''}`).then((r) => handle(r));
}

/**
 * 下载走 fetch + Blob，不用 <a href>：
 *   1. 服务端开了 SF_API_TOKEN 时能在同一处统一带鉴权头；
 *   2. 401/400 时返回的是 JSON 错误，直接跳转会把错误体当成附件下载下来，
 *      演示现场看起来像「下载成功但打不开」。这里会把错误 visibly 显示在面板上。
 */
async function download(path: string, qs: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // 非 JSON 错误体用 statusText
    }
    throw new MerchantBoardError(res.status, msg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/i.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // 立刻 revoke 在部分浏览器会取消下载，延后释放。
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export type EvidenceExportKind = 'md' | 'csv' | 'scorecard';

const EVIDENCE_EXPORT: Record<EvidenceExportKind, { path: string; fallback: string }> = {
  md: { path: '/evidence.md', fallback: 'shadowflow-evidence.md' },
  scorecard: { path: '/evidence/scorecard.md', fallback: 'shadowflow-scorecard.md' },
  csv: { path: '/evidence/orders.csv', fallback: 'shadowflow-orders.csv' },
};

export function downloadEvidence(kind: EvidenceExportKind, opts: EvidenceWindow = {}): Promise<void> {
  const qs = evidenceQuery(opts);
  const { path, fallback } = EVIDENCE_EXPORT[kind];
  return download(path, qs, fallback);
}
