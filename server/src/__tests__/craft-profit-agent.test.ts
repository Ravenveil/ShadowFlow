/**
 * craft-profit-agent.test.ts — 代卖运营智能体契约测试（2026-11-07）。
 *
 * 案例：为残障伙伴卖手工艺品 —— 智能体自动营销、出单（快照记账）、
 * 联系快递员寄出，看板数据由经营活动自动产生。
 *
 * 覆盖：空库轮次友好提示、一轮运营的事件序列与销售入账、运营动态可查、
 * 自动模式开/关与间隔校验、演示数据回填动态、脏输入不 5xx。
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离），rand 注入可控。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmp: string;
let origCwd: string;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let router: typeof import('../routes/dashboard/craft-profit').default;
let sqlite: typeof import('../storage/sqlite');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let agent: typeof import('../storage/craft-profit-agent');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/craft-profit', router);
  return a;
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-craft-agent-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  router = (await import('../routes/dashboard/craft-profit')).default;
  agent = await import('../storage/craft-profit-agent');
  sqlite.getDb();
  // cp_* 建表是懒执行（首次 storage 调用时 DDL），先触发一次，否则
  // beforeEach 的 DELETE 会撞 no such table。
  await import('../storage/craft-profit').then((m) => m.listProducts());
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.getDb().exec('DELETE FROM cp_agent_events; DELETE FROM cp_sales; DELETE FROM cp_products;');
});

async function listProduct(name = '手工编织收纳篮'): Promise<string> {
  const res = await request(app())
    .post('/api/craft-profit/products')
    .send({ name, price_cents: 8900, artisan_cents: 4200, shipping_cents: 800, marketing_cents: 600 });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('runRound — 一轮代卖运营', () => {
  it('空库不报错：友好提示，不产生事件与销售', async () => {
    const res = await request(app()).post('/api/craft-profit/agent/run');
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
    expect(res.body.sales).toBe(0);
    expect(res.body.units).toBe(0);
    expect(res.body.note).toMatch(/还没有商品/);
  });

  it('一轮运营 = 营销推广 → 出单记账 → 联系快递员寄出（rand=0.5 可控）', async () => {
    await listProduct();
    const round = agent.runRound(() => 0.5);
    // rand=0.5：推广 2 次同商品（Set 去重 → 1 条营销）、出 2 单、每单 2 件
    expect(round.sales).toBe(2);
    expect(round.units).toBe(4);
    expect(round.note).toBeUndefined();
    const kinds = round.events.map((e) => e.kind);
    expect(kinds[0]).toBe('marketing');
    expect(kinds.filter((k) => k === 'order')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'shipping')).toHaveLength(2);
    // 每单后紧跟一条快递事件
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === 'order') expect(kinds[i + 1]).toBe('shipping');
    }
    expect(round.events[0].text).toMatch(/推广/);
    expect(round.events[1].text).toMatch(/售出 2 件，入账 ¥178\.00/);

    // 销售入账：4 件 × 每件赚 33 元 = 132.00 元净利
    const ov = await request(app()).get('/api/craft-profit/overview');
    expect(ov.body.units).toBe(4);
    expect(ov.body.profit_cents).toBe(13200);
  });

  it('运营动态可查：GET /agent/events 时间倒序、含营销/出单/快递三类', async () => {
    await listProduct();
    agent.runRound(() => 0.999); // 3 单 × 3 件 + 1 条营销
    const res = await request(app()).get('/api/craft-profit/agent/events?limit=50');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(7); // 1 marketing + 3 order + 3 shipping
    const kinds = new Set(res.body.items.map((e: { kind: string }) => e.kind));
    expect(kinds).toEqual(new Set(['marketing', 'order', 'shipping']));
    const ts = res.body.items.map((e: { ts: number }) => e.ts);
    expect([...ts].sort((a, b) => b - a)).toEqual(ts);
  });
});

describe('自动运营模式 — agent 自动更新看板', () => {
  it('开启自动运营（5 分钟一轮）→ status 反映；关掉即停', async () => {
    const on = await request(app())
      .post('/api/craft-profit/agent/auto')
      .send({ enabled: true, interval_min: 5 });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ enabled: true, interval_min: 5 });

    const st = await request(app()).get('/api/craft-profit/agent/status');
    expect(st.body).toMatchObject({ enabled: true, interval_min: 5 });
    expect(st.body).toHaveProperty('rounds');

    const off = await request(app())
      .post('/api/craft-profit/agent/auto')
      .send({ enabled: false });
    expect(off.body.enabled).toBe(false);
    const st2 = await request(app()).get('/api/craft-profit/agent/status');
    expect(st2.body.enabled).toBe(false);
  });

  it('非法间隔（0 / 超 1440）→ 400，不 5xx', async () => {
    const a = await request(app()).post('/api/craft-profit/agent/auto').send({ interval_min: 0 });
    expect(a.status).toBe(400);
    const b = await request(app()).post('/api/craft-profit/agent/auto').send({ interval_min: 99999 });
    expect(b.status).toBe(400);
  });
});

describe('演示数据回填运营动态', () => {
  it('demo-seed 后动态流水里有营销/出单/快递三类历史', async () => {
    const seeded = await request(app()).post('/api/craft-profit/demo-seed');
    expect(seeded.body).toEqual({ seeded: true, products: 8, sales: 40 });
    const ev = await request(app()).get('/api/craft-profit/agent/events?limit=500');
    const kinds = new Set(ev.body.items.map((e: { kind: string }) => e.kind));
    expect(kinds).toEqual(new Set(['marketing', 'order', 'shipping']));
    expect(ev.body.items.length).toBeGreaterThanOrEqual(92); // 40 单 ×2 + 12 营销
  });
});
