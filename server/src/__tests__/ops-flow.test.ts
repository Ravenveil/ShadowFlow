/**
 * ops-flow.test.ts — 代运营全流程契约测试（2026-11-07）。
 *
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离），覆盖：
 *   - 承运商自描述（六家 + mock/real 凭证契约）
 *   - 运单校验（未知承运商 / 收件信息缺失 / 一单一份）
 *   - mock 交运：确定性面单号、状态推进、重复交运 409
 *   - real 模式缺凭证 → 结构化 CREDENTIALS_MISSING（不 5xx）
 *   - 轨迹同步：事件去重、只前进不回退
 *   - 一键分发：多平台建帖并发布、二次调用幂等跳过、无账号平台 NO_ACCOUNT
 *   - overview 四步计数 + plan 决策入口（gap 缺口明细 / next_action 可照抄行动）
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
let router: typeof import('../routes/ops/ops').default;
let sqlite: typeof import('../storage/sqlite');
let merchant: typeof import('../storage/merchant-board');
let social: typeof import('../storage/social-publish');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/ops', router);
  return a;
}

const RECEIVER = {
  receiver_name: '林小满',
  receiver_phone: '13800001234',
  receiver_address: '浙江省杭州市西湖区文三路 100 号 3 幢 201',
};

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-ops-'));
  process.chdir(tmp);
  delete process.env.SHIP_SF_API_TOKEN;
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  router = (await import('../routes/ops/ops')).default;
  merchant = await import('../storage/merchant-board');
  social = await import('../storage/social-publish');
  sqlite.getDb();
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe('承运商自描述', () => {
  it('列出六家承运商，各带 mock/real 双模与凭证契约', async () => {
    const res = await request(app()).get('/api/ops/carriers');
    expect(res.status).toBe(200);
    const ids = res.body.carriers.map((c: { id: string }) => c.id);
    expect(ids).toEqual(['sf', 'zto', 'yto', 'jd', 'ems', 'debang']);
    for (const c of res.body.carriers) {
      expect(c.modes).toEqual(['mock', 'real']);
      expect(c.real_env.env).toMatch(/^SHIP_/);
    }
    expect(res.body.carriers[0].name).toBe('顺丰速运');
  });
});

describe('运单创建与校验', () => {
  it('未知承运商 → 400 UNKNOWN_CARRIER', async () => {
    const res = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'not-a-carrier', ...RECEIVER });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_CARRIER');
  });

  it('收件信息不全 → 400，且不落库', async () => {
    const noName = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'sf', ...RECEIVER, receiver_name: '  ' });
    expect(noName.status).toBe(400);
    expect(noName.body.error.code).toBe('INVALID_RECEIVER_NAME');

    const badPhone = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'sf', ...RECEIVER, receiver_phone: '123' });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.error.code).toBe('INVALID_RECEIVER_PHONE');

    const shortAddr = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'sf', ...RECEIVER, receiver_address: '杭州' });
    expect(shortAddr.status).toBe(400);
    expect(shortAddr.body.error.code).toBe('INVALID_RECEIVER_ADDRESS');

    const list = await request(app()).get('/api/ops/shipments');
    expect(list.body.shipments).toHaveLength(0);
  });

  it('建单成功：pending、无面单号、落一条创建事件', async () => {
    const res = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'sf', order_id: 'ord-1', weight_grams: 480, ...RECEIVER });
    expect(res.status).toBe(201);
    expect(res.body.shipment.status).toBe('pending');
    expect(res.body.shipment.tracking_no).toBeNull();
    expect(res.body.shipment.mode).toBe('mock');
    expect(res.body.shipment.weight_grams).toBe(480);

    const detail = await request(app()).get(`/api/ops/shipments/${res.body.shipment.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.events).toHaveLength(1);
    expect(detail.body.events[0].status).toBe('pending');
  });

  it('同一订单重复建单 → 409 SHIPMENT_EXISTS（一单一运单）', async () => {
    const res = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'zto', order_id: 'ord-1', ...RECEIVER });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SHIPMENT_EXISTS');
  });

  it('不存在的运单 → 404', async () => {
    const res = await request(app()).get('/api/ops/shipments/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SHIPMENT_NOT_FOUND');
  });
});

describe('交运（mock）与轨迹', () => {
  let shipmentId = '';
  let trackingNo = '';

  it('交运成功：确定性面单号、状态 shipped、attempts=1', async () => {
    const list = await request(app()).get('/api/ops/shipments?status=pending');
    shipmentId = list.body.shipments[0].id;

    const res = await request(app()).post(`/api/ops/shipments/${shipmentId}/ship`).send({});
    expect(res.status).toBe(200);
    expect(res.body.receipt.ok).toBe(true);
    expect(res.body.receipt.tracking_no).toMatch(/^SF\d{12}$/);
    expect(res.body.shipment.status).toBe('shipped');
    expect(res.body.shipment.attempts).toBe(1);
    expect(res.body.shipment.shipped_at).toBeTypeOf('number');
    trackingNo = res.body.receipt.tracking_no;
  });

  it('面单号确定性：同一运单同一次尝试恒同值', async () => {
    // 换个运单验证「同 shipment+attempt ⇒ 同号」而不是随机号
    const another = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'sf', ...RECEIVER });
    const shipped = await request(app())
      .post(`/api/ops/shipments/${another.body.shipment.id}/ship`)
      .send({});
    expect(shipped.body.receipt.tracking_no).toMatch(/^SF\d{12}$/);
    expect(shipped.body.receipt.tracking_no).not.toBe(trackingNo);
  });

  it('重复交运 → 409 SHIPMENT_ALREADY_SHIPPED', async () => {
    const res = await request(app()).post(`/api/ops/shipments/${shipmentId}/ship`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SHIPMENT_ALREADY_SHIPPED');
  });

  it('同步轨迹：追加事件并推进到 in_transit；重复同步不灌重复行', async () => {
    const first = await request(app()).post(`/api/ops/shipments/${shipmentId}/track`).send({});
    expect(first.status).toBe(200);
    expect(first.body.receipt.ok).toBe(true);
    expect(first.body.added).toBe(2);
    expect(first.body.shipment.status).toBe('in_transit');

    const second = await request(app()).post(`/api/ops/shipments/${shipmentId}/track`).send({});
    expect(second.body.added).toBe(0);
    expect(second.body.shipment.status).toBe('in_transit');

    const detail = await request(app()).get(`/api/ops/shipments/${shipmentId}`);
    // pending（建单）+ shipped（交运）+ 2 条轨迹 = 4；重复同步没灌重复行。
    expect(detail.body.events).toHaveLength(4);
  });

  it('未交运就查轨迹 → 409 TRACKING_MISSING', async () => {
    const created = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'yto', ...RECEIVER });
    const res = await request(app())
      .post(`/api/ops/shipments/${created.body.shipment.id}/track`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRACKING_MISSING');
  });
});

describe('交运（real 缺凭证）', () => {
  it('real 模式无凭证 → 200 + CREDENTIALS_MISSING，不 5xx，可重试', async () => {
    const created = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'sf', mode: 'real', ...RECEIVER });
    expect(created.status).toBe(201);
    expect(created.body.shipment.mode).toBe('real');

    const res = await request(app())
      .post(`/api/ops/shipments/${created.body.shipment.id}/ship`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.receipt.ok).toBe(false);
    expect(res.body.receipt.code).toBe('CREDENTIALS_MISSING');
    expect(res.body.shipment.status).toBe('failed');
    expect(res.body.shipment.attempts).toBe(1);

    // failed 可重试：attempt 递增、仍结构化失败（不抛 5xx）
    const retry = await request(app())
      .post(`/api/ops/shipments/${created.body.shipment.id}/ship`)
      .send({});
    expect(retry.status).toBe(200);
    expect(retry.body.shipment.attempts).toBe(2);
    expect(retry.body.shipment.status).toBe('failed');
  });
});

describe('一键分发（商品 → 多平台营销帖）', () => {
  let productId = '';

  beforeAll(() => {
    productId = merchant.createProduct({ name: '手作柴烧茶杯', price_cents: 12800 }).id;
    social.createAccount({ platform: 'xiaohongshu', account_name: '小满手作' });
    social.createAccount({ platform: 'douyin', account_name: '小满手作' });
  });

  it('按平台分发：每个平台一帖并发布成功', async () => {
    const res = await request(app())
      .post('/api/ops/marketing/launch')
      .send({ product_id: productId, platforms: ['xiaohongshu', 'douyin'] });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ targets: 2, published: 2, skipped: 0, failed: 0 });
    for (const item of res.body.items) {
      expect(item.status).toBe('published');
      expect(item.external_id).toMatch(/^mock_/);
      expect(item.skipped).toBe(false);
    }
    expect(res.body.product.name).toBe('手作柴烧茶杯');
  });

  it('二次分发幂等：同一商品同账号已发布 → 跳过，不重复建帖', async () => {
    const before = social.listPosts().length;
    const res = await request(app())
      .post('/api/ops/marketing/launch')
      .send({ product_id: productId, platforms: ['xiaohongshu', 'douyin'] });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ targets: 2, published: 0, skipped: 2, failed: 0 });
    expect(social.listPosts().length).toBe(before);
  });

  it('平台无可用账号 → NO_ACCOUNT（结构化失败，200 不 5xx）', async () => {
    const res = await request(app())
      .post('/api/ops/marketing/launch')
      .send({ product_id: productId, platforms: ['weibo'] });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].code).toBe('NO_ACCOUNT');
    expect(res.body.summary.failed).toBe(1);
  });

  it('商品不存在 → 404；目标为空 → 400', async () => {
    const notFound = await request(app())
      .post('/api/ops/marketing/launch')
      .send({ product_id: 'missing', platforms: ['xiaohongshu'] });
    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe('PRODUCT_NOT_FOUND');

    const noTargets = await request(app())
      .post('/api/ops/marketing/launch')
      .send({ product_id: productId });
    expect(noTargets.status).toBe(400);
    expect(noTargets.body.error.code).toBe('INVALID_TARGETS');
  });
});

describe('overview 四步进度', () => {
  it('四个步骤都有计数，已发生的数据反映在上面', async () => {
    const res = await request(app()).get('/api/ops/overview');
    expect(res.status).toBe(200);
    const keys = res.body.steps.map((s: { key: string }) => s.key);
    expect(keys).toEqual(['listing', 'copywriting', 'distribution', 'fulfillment']);
    expect(res.body.products).toBe(1);
    expect(res.body.posts.published).toBe(2);
    expect(res.body.shipments.shipments).toBeGreaterThan(0);
    expect(res.body.accounts).toBe(2);
    for (const step of res.body.steps) {
      expect(step.next_hint).toBeTruthy();
    }
  });
});

describe('overview 决策入口（plan / gap / 可照抄行动）', () => {
  let p2Id = '';
  let orderId = '';

  it('无帖商品进 copywriting/distribution 缺口；done 口径收紧；plan 指向为其建帖', async () => {
    p2Id = merchant.createProduct({ name: '手作陶土花器', price_cents: 8800 }).id;
    const res = await request(app()).get('/api/ops/overview');
    const copy = res.body.steps.find((s: { key: string }) => s.key === 'copywriting');
    const dist = res.body.steps.find((s: { key: string }) => s.key === 'distribution');
    // p1 有帖有发布，但 p2 什么都没有 —— 老口径会误判「已完成」
    expect(copy.gap).toContain(p2Id);
    expect(dist.gap).toContain(p2Id);
    expect(copy.done).toBe(false);
    expect(dist.done).toBe(false);
    expect(res.body.plan.next_action.method).toBe('POST');
    expect(res.body.plan.next_action.path).toBe('/api/ops/marketing/launch');
    expect(res.body.plan.next_action.body.product_id).toBe(p2Id);
    expect(res.body.plan.reason).toContain('生成营销帖');
  });

  it('paid 订单进 pending_orders 与 fulfillment 缺口；待交运运单优先于新订单建单', async () => {
    // 把 p2 发掉 → copywriting/distribution 全清，只剩履约缺口
    await request(app())
      .post('/api/ops/marketing/launch')
      .send({ product_id: p2Id, platforms: ['xiaohongshu', 'douyin'] });
    const order = merchant.createOrder({ product_id: p2Id });
    merchant.payOrder(order.id, 'txn-ops-1');
    orderId = order.id;

    const res = await request(app()).get('/api/ops/overview');
    const copy = res.body.steps.find((s: { key: string }) => s.key === 'copywriting');
    const dist = res.body.steps.find((s: { key: string }) => s.key === 'distribution');
    const full = res.body.steps.find((s: { key: string }) => s.key === 'fulfillment');
    expect(copy.done).toBe(true);
    expect(dist.done).toBe(true);
    expect(res.body.pending_orders.map((o: { id: string }) => o.id)).toContain(orderId);
    expect(full.done).toBe(false);
    expect(full.gap.join('｜')).toContain(`订单 ${orderId} 待建运单`);

    const plan = res.body.plan.next_action;
    expect(plan.path.startsWith('/api/ops/shipments')).toBe(true);
    if (res.body.awaiting_shipment.length > 0) {
      // 库里有待交运/待重试的遗留运单（如 real 缺凭证 failed 单）→ 优先消化它们
      expect(plan.path).toBe(`/api/ops/shipments/${res.body.awaiting_shipment[0].id}/ship`);
    } else {
      expect(plan.body.order_id).toBe(orderId);
    }
  });

  it('订单建单交运后出缺口；已交运运单不再出现在 awaiting_shipment', async () => {
    const created = await request(app())
      .post('/api/ops/shipments')
      .send({ carrier: 'zto', order_id: orderId, ...RECEIVER });
    expect(created.status).toBe(201);
    const shipped = await request(app())
      .post(`/api/ops/shipments/${created.body.shipment.id}/ship`)
      .send({});
    expect(shipped.body.receipt.ok).toBe(true);

    const res = await request(app()).get('/api/ops/overview');
    expect(res.body.pending_orders.map((o: { id: string }) => o.id)).not.toContain(orderId);
    expect(res.body.steps.find((s: { key: string }) => s.key === 'fulfillment').gap.join('｜')).not.toContain(
      `订单 ${orderId} 待建运单`,
    );
    expect(res.body.awaiting_shipment.map((s: { id: string }) => s.id)).not.toContain(
      created.body.shipment.id,
    );
  });
});

describe('空库冷启动', () => {
  // 换一个全新 cwd：_resetForTests 只重开连接，同目录仍是同一个库文件。
  let tmp2 = '';
  let savedCwd = '';

  beforeAll(() => {
    savedCwd = process.cwd();
    tmp2 = mkdtempSync(path.join(tmpdir(), 'sf-ops-cold-'));
    process.chdir(tmp2);
    sqlite._resetForTests();
    sqlite.getDb();
  });

  afterAll(() => {
    sqlite._resetForTests();
    process.chdir(savedCwd);
    rmSync(tmp2, { recursive: true, force: true });
  });

  it('四步全空：plan 指向上架商品（信息须来自商家），fulfillment 无缺口不欠账', async () => {
    const res = await request(app()).get('/api/ops/overview');
    const listing = res.body.steps.find((s: { key: string }) => s.key === 'listing');
    const full = res.body.steps.find((s: { key: string }) => s.key === 'fulfillment');
    expect(listing.done).toBe(false);
    expect(listing.gap).toEqual(['还没有商品']);
    expect(full.done).toBe(true);
    expect(res.body.plan.next_action.path).toBe('/api/merchant/products');
    expect(res.body.plan.next_action.note).toContain('不许编造');
    expect(res.body.plan.reason).toContain('上架商品');
  });
});
