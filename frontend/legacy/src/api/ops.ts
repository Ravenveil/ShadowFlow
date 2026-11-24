/**
 * Ops API client — 代运营域前端数据层（2026-11-07）。
 *
 * 后端：server/src/routes/ops/ops.ts（挂载在 /api/ops）。四步链路
 * 「上架商品 → 自动生营销帖 → 多平台分发 → 快递寄出」的 UI 侧只做取数与
 * 展示，口径全部以 overview 直出为准（gap / next_action / plan）。
 *
 * 写接口（launch / ship / track）走 apiGuard：服务端设了 SF_API_TOKEN 时
 * 需 Bearer 鉴权（远程部署场景）；默认仅回环。失败抛带后端 code 的 Error，
 * 由面板如实显示 —— 与后端「不吞错误」的铁律一致。
 *
 * 附带 fetchPublishAccounts（/api/social-publish/accounts）：一键分发前
 * 读「哪些平台有 active 账号」，没账号的平台不进分发目标（NO_ACCOUNT 是
 * 结构化失败，但 UI 主动少打一发更干净）。
 */

import { getApiBase } from './_base';

const BASE = `${getApiBase()}/api/ops`;
const SOCIAL_BASE = `${getApiBase()}/api/social-publish`;

/** 可照抄的下一步动作（overview.plan.next_action / steps[].next_action）。 */
export interface OpsNextAction {
  method: 'POST';
  path: string;
  body?: Record<string, unknown>;
  note: string;
}

export interface OpsStep {
  key: 'listing' | 'copywriting' | 'distribution' | 'fulfillment';
  name: string;
  count: number;
  done: boolean;
  /** 缺口明细（具体 id 或说明），最多 10 条。 */
  gap: string[];
  next_action: OpsNextAction | null;
  next_hint: string;
}

export interface OpsPlan {
  next_action: OpsNextAction | null;
  reason: string;
}

export interface OpsShipmentStats {
  shipments: number;
  pending: number;
  shipped: number;
  in_transit: number;
  delivered: number;
  failed: number;
  events: number;
}

/** 已付款未建运单的订单（只读关联 mb_orders）。 */
export interface UnshippedOrder {
  id: string;
  product_id: string;
  amount_cents: number;
  created_at: number;
}

export interface AwaitingShipment {
  id: string;
  order_id: string;
  status: 'pending' | 'failed';
  attempts: number;
}

export interface OpsOverview {
  steps: OpsStep[];
  plan: OpsPlan;
  products: number;
  posts: { total: number; draft: number; publishing: number; published: number; failed: number };
  shipments: OpsShipmentStats;
  accounts: number;
  pending_orders: UnshippedOrder[];
  awaiting_shipment: AwaitingShipment[];
}

export type ShipmentStatus = 'pending' | 'shipped' | 'in_transit' | 'delivered' | 'failed';

export interface ShipmentRow {
  id: string;
  order_id: string;
  carrier: string;
  mode: 'mock' | 'real';
  tracking_no: string | null;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  weight_grams: number;
  remark: string;
  status: ShipmentStatus;
  attempts: number;
  error: string | null;
  created_at: number;
  shipped_at: number | null;
  updated_at: number;
}

/** 一键分发单目标回执（成功/失败/跳过都是结构化对象）。 */
export interface LaunchItem {
  account_id: string;
  platform: string;
  post_id: string | null;
  status: string;
  external_id: string | null;
  code: string | null;
  error: string | null;
  skipped: boolean;
}

export interface LaunchResult {
  product: { id: string; name: string; price_cents: number };
  items: LaunchItem[];
  summary: { targets: number; published: number; skipped: number; failed: number };
}

export interface ShipResult {
  shipment: ShipmentRow;
  receipt: {
    ok: boolean;
    tracking_no?: string;
    code?: string;
    error?: string;
  };
  attempt: number;
}

export interface TrackResult {
  shipment: ShipmentRow;
  receipt: {
    ok: boolean;
    status?: string;
    code?: string;
    error?: string;
  };
  added: number;
}

/** 发布账号（社交发布域）：平台分发就绪度用。 */
export interface PublishAccount {
  id: string;
  platform: string;
  account_name: string;
  status: 'active' | 'paused' | string;
}

class OpsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  } & T;
  if (!res.ok) {
    throw new OpsApiError(
      res.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? res.statusText,
    );
  }
  return body;
}

function post<T>(url: string, payload: Record<string, unknown> = {}): Promise<T> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => handle<T>(r));
}

// ── 取数 ─────────────────────────────────────────────────────────────────────

export function fetchOpsOverview(): Promise<OpsOverview> {
  return fetch(`${BASE}/overview`).then((r) => handle(r));
}

export function fetchOpsShipments(status?: ShipmentStatus): Promise<{ shipments: ShipmentRow[] }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetch(`${BASE}/shipments${qs}`).then((r) => handle(r));
}

export function fetchPublishAccounts(): Promise<{ accounts: PublishAccount[] }> {
  return fetch(`${SOCIAL_BASE}/accounts`).then((r) => handle(r));
}

// ── 写操作 ───────────────────────────────────────────────────────────────────

/** 一键分发：商品 → 目标平台自动选 active 账号 → 建帖并发布（幂等，可重跑即重试）。 */
export function launchMarketing(product_id: string, platforms: string[]): Promise<LaunchResult> {
  return post<LaunchResult>(`${BASE}/marketing/launch`, { product_id, platforms });
}

export function shipOpsShipment(id: string): Promise<ShipResult> {
  return post<ShipResult>(`${BASE}/shipments/${encodeURIComponent(id)}/ship`);
}

export function trackOpsShipment(id: string): Promise<TrackResult> {
  return post<TrackResult>(`${BASE}/shipments/${encodeURIComponent(id)}/track`);
}

export { OpsApiError };
