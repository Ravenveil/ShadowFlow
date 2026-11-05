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

describe('聚合下推到 SQL（分桶口径不能串）', () => {
  it('下单与支付落在不同的天：下单量归下单日，成交额归支付日', async () => {
    const product = await request(app())
      .post('/api/merchant/products')
      .send({ name: '跨桶商品', price_cents: 800, cost_cents: 100 });
    const order = await request(app())
      .post('/api/merchant/orders')
      .send({ product_id: product.body.id, channel: 'cross-bucket' });
    await request(app())
      .post(`/api/merchant/orders/${order.body.id}/pay`)
      .send({ pay_txn_id: 'txn-cross-bucket' });

    // 把这一单改成「昨天下单、今天付款」，制造两个不同的桶
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);
    sqlite
      .getDb()
      .prepare('UPDATE mb_orders SET created_at = ?, paid_at = ? WHERE id = ?')
      .run(yesterday.getTime() + 3600000, today.getTime() + 3600000, order.body.id);

    const q = {
      start: new Date(yesterday.getTime()).toISOString(),
      end: new Date(today.getTime() + 86400000).toISOString(),
    };
    const res = await request(app()).get(
      `/api/merchant/orders/timeseries?granularity=day&start=${encodeURIComponent(q.start)}&end=${encodeURIComponent(q.end)}`,
    );
    expect(res.status).toBe(200);
    const y = res.body.series.find((b: { ts: number }) => b.ts === yesterday.getTime());
    const t = res.body.series.find((b: { ts: number }) => b.ts === today.getTime());
    // 昨天：只有下单，没有成交
    expect(y.orders).toBe(1);
    expect(y.paid_orders).toBe(0);
    expect(y.amount_cents).toBe(0);
    // 今天：有成交额（今天还有别的用例建的单，所以只断言 >=）
    expect(t.paid_orders).toBeGreaterThanOrEqual(1);
    expect(t.amount_cents).toBeGreaterThanOrEqual(800);

    // 更强的口径断言：各桶求和必须等于「区间内该字段的全部行」，分桶不能丢也不能重复
    const db = sqlite.getDb();
    const expectedOrders = (
      db
        .prepare('SELECT COUNT(*) AS n FROM mb_orders WHERE created_at >= ? AND created_at < ?')
        .get(yesterday.getTime(), today.getTime() + 86400000) as { n: number }
    ).n;
    const expectedAmount = (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS amt FROM mb_orders
            WHERE paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?`,
        )
        .get(yesterday.getTime(), today.getTime() + 86400000) as { amt: number }
    ).amt;
    const sumOrders = res.body.series.reduce((a: number, b: { orders: number }) => a + b.orders, 0);
    const sumAmount = res.body.series.reduce((a: number, b: { amount_cents: number }) => a + b.amount_cents, 0);
    expect(sumOrders).toBe(expectedOrders);
    expect(sumAmount).toBe(expectedAmount);
  });

  it('同一访客跨两天访问：分桶 UV 各算 1，渠道口径 UV 去重为 1', async () => {
    const visitor = 'v-cross-day';
    await request(app()).post('/api/merchant/visits').send({ visitor_id: visitor, channel: 'cross-day' });
    await request(app()).post('/api/merchant/visits').send({ visitor_id: visitor, channel: 'cross-day' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);
    const rows = sqlite
      .getDb()
      .prepare(`SELECT id FROM mb_visits WHERE visitor_id = ? ORDER BY created_at ASC`)
      .all(visitor) as Array<{ id: string }>;
    sqlite
      .getDb()
      .prepare('UPDATE mb_visits SET created_at = ? WHERE id = ?')
      .run(yesterday.getTime() + 3600000, rows[0].id);
    sqlite
      .getDb()
      .prepare('UPDATE mb_visits SET created_at = ? WHERE id = ?')
      .run(today.getTime() + 3600000, rows[1].id);

    const q = {
      start: new Date(yesterday.getTime()).toISOString(),
      end: new Date(today.getTime() + 86400000).toISOString(),
    };
    const res = await request(app()).get(
      `/api/merchant/traffic/curve?granularity=day&start=${encodeURIComponent(q.start)}&end=${encodeURIComponent(q.end)}`,
    );
    expect(res.status).toBe(200);
    const y = res.body.series.find((b: { ts: number }) => b.ts === yesterday.getTime());
    const t = res.body.series.find((b: { ts: number }) => b.ts === today.getTime());
    expect(y.pv).toBe(1);
    expect(y.uv).toBe(1);
    expect(t.uv).toBeGreaterThanOrEqual(1);

    const ch = res.body.channels.find((c: { channel: string }) => c.channel === 'cross-day');
    expect(ch.pv).toBe(2);
    expect(ch.uv).toBe(1); // 同一访客两天只算一个 UV
  });
});

describe('退款要冲回成本（否则全额退款后毛利为负）', () => {
  it('卖一单再全退：这笔带来的营收/成本/毛利全部归零', async () => {
    const before = (await request(app()).get('/api/merchant/overview')).body;

    const p = await request(app())
      .post('/api/merchant/products')
      .send({ name: '全退测试品', price_cents: 5000, cost_cents: 2000 });
    const o = await request(app()).post('/api/merchant/orders').send({ product_id: p.body.id });
    await request(app())
      .post(`/api/merchant/orders/${o.body.id}/pay`)
      .send({ pay_txn_id: 'txn-cost-back-1' });

    const mid = (await request(app()).get('/api/merchant/overview')).body;
    expect(mid.revenue_cents - before.revenue_cents).toBe(5000);
    expect(mid.cost_cents - before.cost_cents).toBe(2000);
    expect(mid.gross_profit_cents - before.gross_profit_cents).toBe(3000);

    await request(app()).post(`/api/merchant/orders/${o.body.id}/refund`);

    const after = (await request(app()).get('/api/merchant/overview')).body;
    // 关键：退干净之后，这一单不能再留下任何成本
    expect(after.revenue_cents).toBe(before.revenue_cents);
    expect(after.cost_cents).toBe(before.cost_cents);
    expect(after.gross_profit_cents).toBe(before.gross_profit_cents);
  });

  it('两单卖出一单退款：成本只留未退那单', async () => {
    const before = (await request(app()).get('/api/merchant/overview')).body;

    const p = await request(app())
      .post('/api/merchant/products')
      .send({ name: '部分退款品', price_cents: 1000, cost_cents: 400 });
    const keep = await request(app()).post('/api/merchant/orders').send({ product_id: p.body.id });
    const drop = await request(app()).post('/api/merchant/orders').send({ product_id: p.body.id });
    await request(app())
      .post(`/api/merchant/orders/${keep.body.id}/pay`)
      .send({ pay_txn_id: 'txn-cost-back-keep' });
    await request(app())
      .post(`/api/merchant/orders/${drop.body.id}/pay`)
      .send({ pay_txn_id: 'txn-cost-back-drop' });
    await request(app()).post(`/api/merchant/orders/${drop.body.id}/refund`);

    const after = (await request(app()).get('/api/merchant/overview')).body;
    expect(after.revenue_cents - before.revenue_cents).toBe(1000);
    expect(after.cost_cents - before.cost_cents).toBe(400);
    expect(after.gross_profit_cents - before.gross_profit_cents).toBe(600);
  });

  it('退款后账实仍然相符（负数 expense 与「排除退款单的 cost」口径对齐）', async () => {
    const rec = await request(app()).get('/api/merchant/reconcile');
    expect(rec.status).toBe(200);
    expect(rec.body.diffs.expense_cents).toBe(0);
    expect(rec.body.diffs.income_cents).toBe(0);
    expect(rec.body.balanced).toBe(true);
  });
});

describe('订单列表 GET /orders（看状态不该靠流水反推）', () => {
  it('返回订单明细：商品名、状态、金额、成本、单笔毛利', async () => {
    const p = await request(app())
      .post('/api/merchant/products')
      .send({ name: '列表商品', price_cents: 2500, cost_cents: 1000 });
    const o = await request(app()).post('/api/merchant/orders').send({ product_id: p.body.id });
    await request(app())
      .post(`/api/merchant/orders/${o.body.id}/pay`)
      .send({ pay_txn_id: 'txn-list-1' });

    const res = await request(app()).get('/api/merchant/orders?limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const row = res.body.find((x: { id: string }) => x.id === o.body.id);
    expect(row).toBeTruthy();
    expect(row.product_name).toBe('列表商品');
    expect(row.status).toBe('paid');
    expect(row.amount_cents).toBe(2500);
    expect(row.cost_cents).toBe(1000);
    expect(row.gross_profit_cents).toBe(1500);
    expect(row.pay_txn_id).toBe('txn-list-1');
  });

  it('按状态筛选：created / paid / refunded 各自只返回对应单', async () => {
    const p = await request(app())
      .post('/api/merchant/products')
      .send({ name: '状态筛选品', price_cents: 700, cost_cents: 100 });
    const unpaid = await request(app()).post('/api/merchant/orders').send({ product_id: p.body.id });
    const paid = await request(app()).post('/api/merchant/orders').send({ product_id: p.body.id });
    await request(app())
      .post(`/api/merchant/orders/${paid.body.id}/pay`)
      .send({ pay_txn_id: 'txn-status-filter' });
    const refunded = await request(app()).post('/api/merchant/orders').send({ product_id: p.body.id });
    await request(app())
      .post(`/api/merchant/orders/${refunded.body.id}/pay`)
      .send({ pay_txn_id: 'txn-status-filter-2' });
    await request(app()).post(`/api/merchant/orders/${refunded.body.id}/refund`);

    const onlyCreated = await request(app()).get('/api/merchant/orders?status=created&limit=500');
    expect(onlyCreated.status).toBe(200);
    expect(onlyCreated.body.every((x: { status: string }) => x.status === 'created')).toBe(true);
    expect(onlyCreated.body.some((x: { id: string }) => x.id === unpaid.body.id)).toBe(true);

    const onlyRefunded = await request(app()).get('/api/merchant/orders?status=refunded&limit=500');
    expect(onlyRefunded.body.every((x: { status: string }) => x.status === 'refunded')).toBe(true);
    expect(onlyRefunded.body.some((x: { id: string }) => x.id === refunded.body.id)).toBe(true);
    expect(onlyRefunded.body.some((x: { id: string }) => x.id === paid.body.id)).toBe(false);
  });

  it('非法 status 返回 400（不静默返回空列表）', async () => {
    const res = await request(app()).get('/api/merchant/orders?status=whatever');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('status must be one of');
  });

  it('limit 越界收敛到 1..500，不报错', async () => {
    expect((await request(app()).get('/api/merchant/orders?limit=0')).status).toBe(200);
    expect((await request(app()).get('/api/merchant/orders?limit=-5')).status).toBe(200);
    expect((await request(app()).get('/api/merchant/orders?limit=99999')).status).toBe(200);
  });
});

describe('历史数据回填（已退款却没冲销成本的单）', () => {
  it('补一条负数 expense，且重复执行不会重复冲', async () => {
    const storage = await import('../storage/merchant-board');
    const p = await request(app())
      .post('/api/merchant/products')
      .send({ name: '回填测试品', price_cents: 3000, cost_cents: 1200 });
    const o = await request(app()).post('/api/merchant/orders').send({ product_id: p.body.id });
    await request(app())
      .post(`/api/merchant/orders/${o.body.id}/pay`)
      .send({ pay_txn_id: 'txn-backfill-1' });
    await request(app()).post(`/api/merchant/orders/${o.body.id}/refund`);

    // 模拟老数据：把冲销行删掉，只留收入/退款
    sqlite
      .getDb()
      .prepare(`DELETE FROM mb_ledger WHERE order_id = ? AND kind = 'expense' AND amount_cents < 0`)
      .run(o.body.id);
    const missing = sqlite
      .getDb()
      .prepare(`SELECT COUNT(*) AS n FROM mb_ledger WHERE order_id = ? AND kind = 'expense' AND amount_cents < 0`)
      .get(o.body.id) as { n: number };
    expect(missing.n).toBe(0);

    storage._backfillRefundCostForTests();
    const restored = sqlite
      .getDb()
      .prepare(`SELECT amount_cents FROM mb_ledger WHERE order_id = ? AND kind = 'expense' AND amount_cents < 0`)
      .get(o.body.id) as { amount_cents: number } | undefined;
    expect(restored?.amount_cents).toBe(-1200);

    // 再跑一次：幂等，不会变成 -2400 两条
    storage._backfillRefundCostForTests();
    const rows = sqlite
      .getDb()
      .prepare(`SELECT COUNT(*) AS n FROM mb_ledger WHERE order_id = ? AND kind = 'expense' AND amount_cents < 0`)
      .get(o.body.id) as { n: number };
    expect(rows.n).toBe(1);

    const rec = await request(app()).get('/api/merchant/reconcile');
    expect(rec.body.balanced).toBe(true);
  });
});
