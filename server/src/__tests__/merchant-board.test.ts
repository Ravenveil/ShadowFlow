/**
 * merchant-board.test.ts — 功能线① 契约测试（2026-11-05）。
 *
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离），覆盖：
 *   - 第一单五步链路（访客 → 下单 → 支付 → 入账 → 看板）
 *   - 支付幂等 / 交易号冲突 / 订单不存在 / 退款后营收口径
 *   - 订单流水分时（零值补齐 + total + peak）、客流曲线（UV 去重 + 分渠道）
 *   - 账实对账 balanced、脏输入不 5xx
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmp: string;
let origCwd: string;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let router: typeof import('../routes/merchant-board').default;
let sqlite: typeof import('../storage/sqlite');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/merchant', router);
  return a;
}

/** 测试窗口放宽到 ±1 天，避免跨 UTC 日界时数据落在默认窗口外。 */
const window = () => ({
  start: new Date(Date.now() - 86400000).toISOString(),
  end: new Date(Date.now() + 86400000).toISOString(),
});

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-merchant-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  router = (await import('../routes/merchant-board')).default;
  sqlite.getDb();
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe('空库与统计', () => {
  it('stats 四张表都是 0', async () => {
    const res = await request(app()).get('/api/merchant/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: 0, visits: 0, orders: 0, ledger: 0 });
  });

  it('空库 overview / first-order 不报错，链路未通', async () => {
    const o = await request(app()).get('/api/merchant/overview');
    expect(o.status).toBe(200);
    expect(o.body.revenue_cents).toBe(0);
    expect(o.body.first_order).toBeNull();
    const f = await request(app()).get('/api/merchant/first-order');
    expect(f.status).toBe(200);
    expect(f.body.complete).toBe(false);
    expect(f.body.steps.every((s: { ok: boolean }) => !s.ok)).toBe(true);
  });
});

describe('第一单交易链路', () => {
  let productId = '';
  let visitId = '';
  let orderId = '';

  it('建商品 → 埋点 → 下单 → 支付，五步全通且看板数字正确', async () => {
    const p = await request(app())
      .post('/api/merchant/products')
      .send({ name: '品牌文案包', price_cents: 19900, cost_cents: 4300 });
    expect(p.status).toBe(201);
    productId = p.body.id;

    const v = await request(app())
      .post('/api/merchant/visits')
      .send({ visitor_id: 'v-1', channel: 'wechat', trace_id: 'first-1' });
    expect(v.status).toBe(201);
    visitId = v.body.id;

    const o = await request(app())
      .post('/api/merchant/orders')
      .send({ product_id: productId, visit_id: visitId, trace_id: 'first-1' });
    expect(o.status).toBe(201);
    expect(o.body.amount_cents).toBe(19900);
    orderId = o.body.id;

    const pay = await request(app())
      .post(`/api/merchant/orders/${orderId}/pay`)
      .send({ pay_txn_id: 'txn-first-1' });
    expect(pay.status).toBe(200);
    expect(pay.body.idempotent).toBe(false);
    expect(pay.body.order.status).toBe('paid');

    const chain = await request(app()).get('/api/merchant/first-order?trace_id=first-1');
    expect(chain.status).toBe(200);
    expect(chain.body.complete).toBe(true);
    expect(chain.body.steps.map((s: { step: string }) => s.step)).toEqual([
      'visit_landed',
      'order_created',
      'order_paid',
      'ledger_income',
      'dashboard_visible',
    ]);

    const ov = await request(app()).get('/api/merchant/overview');
    expect(ov.body.revenue_cents).toBe(19900);
    expect(ov.body.cost_cents).toBe(4300);
    expect(ov.body.gross_profit_cents).toBe(15600);
    expect(ov.body.paid_orders).toBe(1);
    expect(ov.body.avg_order_cents).toBe(19900);
  });

  it('支付幂等：同一 pay_txn_id 重放返回 idempotent，不重复入账', async () => {
    const again = await request(app())
      .post(`/api/merchant/orders/${orderId}/pay`)
      .send({ pay_txn_id: 'txn-first-1' });
    expect(again.status).toBe(200);
    expect(again.body.idempotent).toBe(true);
    const ledger = await request(app()).get('/api/merchant/ledger');
    expect(ledger.body.filter((r: { kind: string }) => r.kind === 'income')).toHaveLength(1);
    expect(ledger.body.filter((r: { kind: string }) => r.kind === 'expense')).toHaveLength(1);
  });

  it('交易号被别的订单占用 → 409；订单不存在 → 404；空交易号 → 400', async () => {
    const o2 = await request(app())
      .post('/api/merchant/orders')
      .send({ product_id: productId, trace_id: 'conflict-1' });
    const clash = await request(app())
      .post(`/api/merchant/orders/${o2.body.id}/pay`)
      .send({ pay_txn_id: 'txn-first-1' });
    expect(clash.status).toBe(409);

    const missing = await request(app())
      .post('/api/merchant/orders/not-exist/pay')
      .send({ pay_txn_id: 'txn-x' });
    expect(missing.status).toBe(404);

    const empty = await request(app())
      .post(`/api/merchant/orders/${o2.body.id}/pay`)
      .send({});
    expect(empty.status).toBe(400);
  });

  it('账实对账 balanced=true', async () => {
    const res = await request(app()).get('/api/merchant/reconcile');
    expect(res.status).toBe(200);
    expect(res.body.balanced).toBe(true);
    expect(res.body.diffs).toEqual({ income_cents: 0, expense_cents: 0, refund_cents: 0, refund_rows: 0 });
  });
});

describe('分时统计与客流曲线', () => {
  it('订单流水按天补齐零值桶，total 与 peak 正确', async () => {
    const q = window();
    const res = await request(app()).get(
      `/api/merchant/orders/timeseries?granularity=day&start=${encodeURIComponent(q.start)}&end=${encodeURIComponent(q.end)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.series.length).toBeGreaterThanOrEqual(2);
    expect(res.body.series.some((b: { amount_cents: number }) => b.amount_cents === 0)).toBe(true);
    expect(res.body.total.orders).toBeGreaterThanOrEqual(1);
    expect(res.body.total.amount_cents).toBe(19900);
    expect(res.body.peak.amount_cents).toBe(19900);
  });

  it('15m / hour 粒度都能算，非法时间范围返回 400', async () => {
    const q = window();
    for (const g of ['15m', 'hour']) {
      const res = await request(app()).get(
        `/api/merchant/orders/timeseries?granularity=${g}&start=${encodeURIComponent(q.start)}&end=${encodeURIComponent(q.end)}`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.series)).toBe(true);
    }
    const bad = await request(app()).get('/api/merchant/orders/timeseries?start=2026-01-02&end=2026-01-01');
    expect(bad.status).toBe(400);
  });

  it('客流 UV 去重、转化率回写、分渠道明细', async () => {
    await request(app()).post('/api/merchant/visits').send({ visitor_id: 'v-2', channel: 'douyin' });
    await request(app()).post('/api/merchant/visits').send({ visitor_id: 'v-2', channel: 'douyin' });
    const q = window();
    const res = await request(app()).get(
      `/api/merchant/traffic/curve?granularity=day&start=${encodeURIComponent(q.start)}&end=${encodeURIComponent(q.end)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.total.pv).toBe(3);
    expect(res.body.total.uv).toBe(2);
    expect(res.body.total.converted_visits).toBe(1);
    expect(res.body.channels.some((c: { channel: string; pv: number }) => c.channel === 'wechat' && c.pv === 1)).toBe(true);
    expect(res.body.channels.some((c: { channel: string; pv: number }) => c.channel === 'douyin' && c.pv === 2)).toBe(true);
  });
});

describe('退款与脏输入', () => {
  it('退款后营收扣减、对账仍平衡、重复退款幂等', async () => {
    const list = await request(app()).get('/api/merchant/products');
    const pid = list.body[0].id;
    const o = await request(app()).post('/api/merchant/orders').send({ product_id: pid, trace_id: 'refund-1' });
    await request(app()).post(`/api/merchant/orders/${o.body.id}/pay`).send({ pay_txn_id: 'txn-refund-1' });

    const r = await request(app()).post(`/api/merchant/orders/${o.body.id}/refund`);
    expect(r.status).toBe(200);
    expect(r.body.idempotent).toBe(false);
    expect(r.body.order.status).toBe('refunded');
    const again = await request(app()).post(`/api/merchant/orders/${o.body.id}/refund`);
    expect(again.body.idempotent).toBe(true);

    const ov = await request(app()).get('/api/merchant/overview');
    expect(ov.body.refunded_orders).toBe(1);
    expect(ov.body.revenue_cents).toBe(19900); // 两单收入 39800 − 退款 19900
    const rec = await request(app()).get('/api/merchant/reconcile');
    expect(rec.body.balanced).toBe(true);
  });

  it('脏输入一律 4xx，不出现 5xx', async () => {
    const cases: Array<{ path: string; payload: unknown }> = [
      { path: '/api/merchant/products', payload: {} },
      { path: '/api/merchant/products', payload: { name: 'x', price_cents: -1 } },
      { path: '/api/merchant/products', payload: { name: 'x', price_cents: 'abc' } },
      { path: '/api/merchant/visits', payload: {} },
      { path: '/api/merchant/orders', payload: { product_id: 'not-exist' } },
      { path: '/api/merchant/orders', payload: { product_id: 123 } },
    ];
    for (const c of cases) {
      const res = await request(app()).post(c.path).send(c.payload as object);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    const nonsense = await request(app()).get('/api/merchant/orders/timeseries?granularity= nonsense');
    expect(nonsense.status).toBe(200); // 未知粒度回落到 day，不报错
  });
});

describe('口径边界（本地日界 / 客单价 / 链路归因）', () => {
  it('不传时间参数时按「今天本地零点」起算，桶键落在本地零点', async () => {
    const res = await request(app()).get('/api/merchant/orders/timeseries');
    expect(res.status).toBe(200);
    expect(res.body.granularity).toBe('day');
    expect(res.body.series.length).toBeGreaterThanOrEqual(1);
    const d = new Date(res.body.series[0].ts);
    // 本地零点：小时/分钟/秒都是 0。若按 UTC 分桶，国内会差 8 小时。
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(res.body.series[0].ts).toBe(today.getTime());
  });

  it('客单价只按未退款单算：退款后回到单笔实收，不被退款单拉低', async () => {
    const ov = await request(app()).get('/api/merchant/overview');
    expect(ov.body.paid_orders).toBe(1); // 未退款成交 1 单
    expect(ov.body.transacted_orders).toBe(2); // 成交过 2 单（含已退）
    expect(ov.body.avg_order_cents).toBe(19900);
  });

  it('按 trace_id 归因：没有来源访客的单，链路停在「落地」这步', async () => {
    const res = await request(app()).get('/api/merchant/first-order?trace_id=refund-1');
    expect(res.status).toBe(200);
    expect(res.body.order_id).toBeTruthy();
    expect(res.body.steps[0]).toEqual({ step: 'visit_landed', ok: false });
    expect(res.body.complete).toBe(false);
  });
});
