/**
 * ops-shipping.ts — 代运营履约域存储层（2026-11-07）。
 *
 * 产业方向（手工艺人代运营）的「寄出」侧：营销发出去、有人下单之后，得真的把
 * 东西寄到买家手上。本模块管运单（ops_shipments）+ 轨迹事件（ops_ship_events），
 * 出口走 lib/shipping 的承运商适配器（mock/real 双模）。
 *
 * 定位：挂在现有 Node/Express 后端上的外接模块，自带幂等 DDL，不改 sqlite.ts
 * 也不碰他人模块；`order_id` 只是普通文本列，只读关联 mb_orders（不写对方的表）。
 *
 * 状态机：
 *   pending ──ship()──▶ shipped ──track()──▶ in_transit ──track()──▶ delivered
 *      └──────ship() 失败──▶ failed ──ship() 重试──▶ shipped | failed
 *
 * delivered 是终态（不因一次轨迹查询回退）；failed 可重试，attempts 递增，
 * 每次尝试都落一条事件。所有写路径参数绑定；金额/重量口径均为整数分/整数克。
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from './sqlite';
import {
  findCarrier,
  getCarrierAdapter,
  type CarrierStatus,
  type ShipMode,
  type ShipReceipt,
  type TrackReceipt,
} from '../lib/shipping';

const DDL = `
CREATE TABLE IF NOT EXISTS ops_shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL DEFAULT '',
  carrier TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'mock',
  tracking_no TEXT,
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  weight_grams INTEGER NOT NULL DEFAULT 0,
  remark TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  shipped_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_shipments_order
  ON ops_shipments(order_id) WHERE order_id <> '';
CREATE INDEX IF NOT EXISTS idx_ops_shipments_status ON ops_shipments(status, created_at);
CREATE TABLE IF NOT EXISTS ops_ship_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_events_shipment ON ops_ship_events(shipment_id, created_at);
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

export class OpsShipError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ShipmentStatus = 'pending' | 'shipped' | 'in_transit' | 'delivered' | 'failed';

export interface ShipmentRow {
  id: string;
  order_id: string;
  carrier: string;
  mode: ShipMode;
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

export interface ShipEventRow {
  id: string;
  shipment_id: string;
  status: string;
  note: string;
  created_at: number;
}

/** 状态推进次序（failed 不参与比较，单独处理）。 */
const RANK: Record<string, number> = { pending: 0, shipped: 1, in_transit: 2, delivered: 3 };

function appendEvent(
  conn: Database.Database,
  shipmentId: string,
  status: string,
  note: string,
  at = Date.now(),
): void {
  conn
    .prepare(
      `INSERT INTO ops_ship_events (id, shipment_id, status, note, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), shipmentId, status, note, at);
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// ── 运单 ──────────────────────────────────────────────────────────────────────

export interface CreateShipmentInput {
  order_id?: string;
  carrier: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  weight_grams?: number;
  remark?: string;
  mode?: string;
}

export function createShipment(input: CreateShipmentInput): ShipmentRow {
  const carrierId = text(input.carrier, 32);
  const carrier = findCarrier(carrierId);
  if (!carrier) {
    throw new OpsShipError(400, 'UNKNOWN_CARRIER', `不支持的承运商: ${carrierId || '(空)'}`);
  }
  const receiverName = text(input.receiver_name, 64);
  const receiverPhone = text(input.receiver_phone, 32);
  const receiverAddress = text(input.receiver_address, 512);
  if (!receiverName) {
    throw new OpsShipError(400, 'INVALID_RECEIVER_NAME', '收件人姓名不能为空');
  }
  // 只做「像不像号码」的粗校验：真实号码格式各国各异，过严会把海外件挡在门外。
  if (receiverPhone.replace(/[^0-9]/g, '').length < 6) {
    throw new OpsShipError(400, 'INVALID_RECEIVER_PHONE', '收件人电话至少 6 位数字');
  }
  if (receiverAddress.length < 6) {
    throw new OpsShipError(400, 'INVALID_RECEIVER_ADDRESS', '收件地址过短，无法寄达');
  }
  const weight = Number(input.weight_grams ?? 0);
  if (!Number.isFinite(weight) || weight < 0) {
    throw new OpsShipError(400, 'INVALID_WEIGHT', 'weight_grams 必须是非负数');
  }
  const orderId = text(input.order_id, 64);
  const conn = db();
  if (orderId) {
    const dup = conn
      .prepare('SELECT id FROM ops_shipments WHERE order_id = ?')
      .get(orderId) as { id: string } | undefined;
    if (dup) {
      throw new OpsShipError(409, 'SHIPMENT_EXISTS', `该订单已有运单: ${dup.id}`);
    }
  }
  const now = Date.now();
  const row: ShipmentRow = {
    id: randomUUID(),
    order_id: orderId,
    carrier: carrier.id,
    mode: input.mode === 'real' ? 'real' : 'mock',
    tracking_no: null,
    receiver_name: receiverName,
    receiver_phone: receiverPhone,
    receiver_address: receiverAddress,
    weight_grams: Math.round(weight),
    remark: text(input.remark, 256),
    status: 'pending',
    attempts: 0,
    error: null,
    created_at: now,
    shipped_at: null,
    updated_at: now,
  };
  conn
    .prepare(
      `INSERT INTO ops_shipments (id, order_id, carrier, mode, tracking_no, receiver_name,
        receiver_phone, receiver_address, weight_grams, remark, status, attempts, error,
        created_at, shipped_at, updated_at)
       VALUES (@id, @order_id, @carrier, @mode, @tracking_no, @receiver_name,
        @receiver_phone, @receiver_address, @weight_grams, @remark, @status, @attempts,
        @error, @created_at, @shipped_at, @updated_at)`,
    )
    .run(row);
  appendEvent(conn, row.id, 'pending', `运单已创建（${carrier.name}，待交运）`, now);
  return row;
}

export function listShipments(status?: string): ShipmentRow[] {
  const conn = db();
  if (status) {
    return conn
      .prepare('SELECT * FROM ops_shipments WHERE status = ? ORDER BY created_at DESC')
      .all(status) as ShipmentRow[];
  }
  return conn.prepare('SELECT * FROM ops_shipments ORDER BY created_at DESC').all() as ShipmentRow[];
}

export function getShipment(id: string): ShipmentRow | undefined {
  return db().prepare('SELECT * FROM ops_shipments WHERE id = ?').get(id) as
    | ShipmentRow
    | undefined;
}

export function listShipEvents(shipmentId: string): ShipEventRow[] {
  return db()
    .prepare('SELECT * FROM ops_ship_events WHERE shipment_id = ? ORDER BY created_at ASC')
    .all(shipmentId) as ShipEventRow[];
}

/** 待寄出订单（只读关联 mb_orders）：已付款但还没有运单的订单，按下单时间先到先寄。 */
export interface UnshippedOrder {
  id: string;
  product_id: string;
  amount_cents: number;
  created_at: number;
}

/**
 * 已付款（paid）且尚无运单的订单。只读对方模块的表 —— 不写 mb_orders，
 * 表不存在（未初始化商家域）时优雅降级为空数组，不抛错。
 * 口径：refunded 不寄、created（未付款）不寄，避免错寄。
 */
export function listUnshippedOrders(limit = 10): UnshippedOrder[] {
  try {
    return db()
      .prepare(
        `SELECT o.id, o.product_id, o.amount_cents, o.created_at
         FROM mb_orders o
         WHERE o.status = 'paid'
           AND NOT EXISTS (SELECT 1 FROM ops_shipments s WHERE s.order_id = o.id)
         ORDER BY o.created_at ASC
         LIMIT ?`,
      )
      .all(limit) as UnshippedOrder[];
  } catch {
    return [];
  }
}

// ── 交运 / 轨迹 ───────────────────────────────────────────────────────────────

/**
 * 交运（或重试）：向承运商下单取面单号。mock/real 由运单 mode 决定；无论成败
 * 都落一条事件，失败不 5xx（回执结构化返回，运单置 failed 可重试）。
 */
export async function shipShipment(id: string): Promise<{
  shipment: ShipmentRow;
  receipt: ShipReceipt;
  attempt: number;
}> {
  const shipment = getShipment(id);
  if (!shipment) {
    throw new OpsShipError(404, 'SHIPMENT_NOT_FOUND', `运单不存在: ${id}`);
  }
  if (shipment.tracking_no && RANK[shipment.status] >= RANK.shipped) {
    throw new OpsShipError(409, 'SHIPMENT_ALREADY_SHIPPED', '运单已交运，不能重复交运');
  }

  const conn = db();
  const attempt = shipment.attempts + 1;
  const adapter = getCarrierAdapter(shipment.carrier, shipment.mode);
  const receipt = await adapter.ship(
    {
      shipment_id: shipment.id,
      order_id: shipment.order_id,
      name: shipment.receiver_name,
      phone: shipment.receiver_phone,
      address: shipment.receiver_address,
      weight_grams: shipment.weight_grams,
      remark: shipment.remark,
    },
    attempt,
  );

  const now = Date.now();
  if (receipt.ok) {
    conn
      .prepare(
        `UPDATE ops_shipments SET status = 'shipped', tracking_no = ?, error = NULL,
           attempts = ?, shipped_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(receipt.tracking_no ?? null, attempt, now, now, id);
    appendEvent(conn, id, 'shipped', `已交运，面单号 ${receipt.tracking_no ?? '(空)'}`, now);
  } else {
    conn
      .prepare(
        `UPDATE ops_shipments SET status = 'failed', error = ?, attempts = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(receipt.error ?? receipt.code ?? 'ship failed', attempt, now, id);
    appendEvent(
      conn,
      id,
      'failed',
      `第 ${attempt} 次交运失败：${receipt.code ?? 'ERROR'} ${receipt.error ?? ''}`.trim(),
      now,
    );
  }

  return { shipment: getShipment(id) as ShipmentRow, receipt, attempt };
}

/**
 * 同步轨迹：拿承运商回传的事件追加到事件表（按 status+note 去重，重复拉不会
 * 灌一堆重复行），并推进运单状态（只前进不回退，delivered 终态）。
 */
export async function syncShipmentTracking(id: string): Promise<{
  shipment: ShipmentRow;
  receipt: TrackReceipt;
  added: number;
}> {
  const shipment = getShipment(id);
  if (!shipment) {
    throw new OpsShipError(404, 'SHIPMENT_NOT_FOUND', `运单不存在: ${id}`);
  }
  if (!shipment.tracking_no) {
    throw new OpsShipError(409, 'TRACKING_MISSING', '运单还没有面单号，先交运再查轨迹');
  }

  const adapter = getCarrierAdapter(shipment.carrier, shipment.mode);
  const receipt = await adapter.track(shipment.tracking_no);
  if (!receipt.ok) {
    return { shipment, receipt, added: 0 };
  }

  const conn = db();
  const existing = new Set(
    listShipEvents(id).map((e) => `${e.status}\u0000${e.note}`),
  );
  let added = 0;
  for (const ev of receipt.events ?? []) {
    const key = `${ev.status}\u0000${ev.note}`;
    if (existing.has(key)) continue;
    existing.add(key);
    appendEvent(conn, id, ev.status, ev.note, ev.at || Date.now());
    added += 1;
  }

  const next = receipt.status as CarrierStatus | undefined;
  if (next && RANK[next] !== undefined) {
    const cur = RANK[shipment.status] ?? -1;
    if (RANK[next] > cur) {
      conn
        .prepare('UPDATE ops_shipments SET status = ?, updated_at = ? WHERE id = ?')
        .run(next, Date.now(), id);
    }
  }

  return { shipment: getShipment(id) as ShipmentRow, receipt, added };
}

export function stats(): {
  shipments: number;
  pending: number;
  shipped: number;
  in_transit: number;
  delivered: number;
  failed: number;
  events: number;
} {
  const conn = db();
  const count = (sql: string, ...args: unknown[]): number =>
    (conn.prepare(sql).get(...args) as { n: number }).n;
  return {
    shipments: count('SELECT COUNT(*) AS n FROM ops_shipments'),
    pending: count('SELECT COUNT(*) AS n FROM ops_shipments WHERE status = ?', 'pending'),
    shipped: count('SELECT COUNT(*) AS n FROM ops_shipments WHERE status = ?', 'shipped'),
    in_transit: count('SELECT COUNT(*) AS n FROM ops_shipments WHERE status = ?', 'in_transit'),
    delivered: count('SELECT COUNT(*) AS n FROM ops_shipments WHERE status = ?', 'delivered'),
    failed: count('SELECT COUNT(*) AS n FROM ops_shipments WHERE status = ?', 'failed'),
    events: count('SELECT COUNT(*) AS n FROM ops_ship_events'),
  };
}
