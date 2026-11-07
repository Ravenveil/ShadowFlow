/**
 * craft-profit.test.ts — 产品盈利看板契约测试（2026-11-07）。
 *
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离），覆盖：
 *   - 空库 overview / timeseries / products 不报错
 *   - 上架商品 → 记销售：分项盈利口径（售价 − 给手艺人 − 快递 − 营销）
 *   - 每 100 元去向（per100）与环比（delta_pct）
 *   - timeseries 本地零点归桶 + 零值补齐
 *   - 演示数据幂等（已有商品不覆盖）
 *   - 脏输入不 5xx（缺名 / 负价格 / 非法 qty / 商品不存在）
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
let router: typeof import('../routes/dashboard/craft-profit').default;
let sqlite: typeof import('../storage/sqlite');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/craft-profit', router);
  return a;
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-craft-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  router = (await import('../routes/dashboard/craft-profit')).default;
  sqlite.getDb();
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe('空库不报错', () => {
  it('overview 全零：0 收入 0 盈利，margin 为 null', async () => {
    const res = await request(app()).get('/api/craft-profit/overview');
    expect(res.status).toBe(200);
    expect(res.body.revenue_cents).toBe(0);
    expect(res.body.profit_cents).toBe(0);
    expect(res.body.margin_pct).toBeNull();
    expect(res.body.sales_count).toBe(0);
  });

  it('timeseries 零值补齐（每天一行），products 空数组', async () => {
    const ts = await request(app()).get('/api/craft-profit/timeseries?days=7');
    expect(ts.status).toBe(200);
    expect(ts.body.series.length).toBeGreaterThan(0);
    expect(ts.body.series.every((d: { units: number }) => d.units === 0)).toBe(true);
    const ps = await request(app()).get('/api/craft-profit/products');
    expect(ps.status).toBe(200);
    expect(ps.body.items).toEqual([]);
  });
});

describe('上架商品与分项盈利口径', () => {
  let productId = '';

  it('上架商品：售价 89 元、给手艺人 42、快递 8、营销 6 → 每件盈利 33 元', async () => {
    const res = await request(app())
      .post('/api/craft-profit/products')
      .send({
        name: '手工编织收纳篮',
        price_cents: 8900,
        artisan_cents: 4200,
        shipping_cents: 800,
        marketing_cents: 600,
      });
    expect(res.status).toBe(201);
    expect(res.body.profit_per_unit_cents).toBe(3300);
    productId = res.body.id;
  });

  it('记一笔销售 2 件：盈利 = 2 × 33 元，overview 分项齐全', async () => {
    const sale = await request(app())
      .post('/api/craft-profit/sales')
      .send({ product_id: productId, qty: 2 });
    expect(sale.status).toBe(201);
    expect(sale.body.profit_cents).toBe(6600);

    const ov = await request(app()).get('/api/craft-profit/overview');
    expect(ov.body.revenue_cents).toBe(17800);
    expect(ov.body.artisan_cents).toBe(8400);
    expect(ov.body.shipping_cents).toBe(1600);
    expect(ov.body.marketing_cents).toBe(1200);
    expect(ov.body.cost_cents).toBe(11200);
    expect(ov.body.profit_cents).toBe(6600);
    expect(ov.body.units).toBe(2);
    expect(ov.body.sales_count).toBe(1);
    expect(ov.body.margin_pct).toBeCloseTo(37.1, 0);
  });

  it('per100 每卖 100 元去向：手艺人 47.2 / 快递 9 / 营销 6.7 / 盈利 37.1', async () => {
    const ov = await request(app()).get('/api/craft-profit/overview');
    expect(ov.body.per100).toEqual({ artisan: 47.2, shipping: 9, marketing: 6.7, profit: 37.1 });
  });

  it('商品盈利排行：sold_units/revenue/profit 按窗口聚合', async () => {
    const ps = await request(app()).get('/api/craft-profit/products?days=30');
    expect(ps.body.items.length).toBe(1);
    const row = ps.body.items[0];
    expect(row.sold_units).toBe(2);
    expect(row.revenue_cents).toBe(17800);
    expect(row.profit_cents).toBe(6600);
    expect(row.profit_per_unit_cents).toBe(3300);
  });

  it('timeseries：今天的桶里有 2 件、盈利 66 元', async () => {
    const ts = await request(app()).get('/api/craft-profit/timeseries?days=7');
    const today = ts.body.series[ts.body.series.length - 1];
    expect(today.units).toBe(2);
    expect(today.profit_cents).toBe(6600);
  });

  it('销售快照：改商品定价不影响历史盈利', async () => {
    // 商品改价（成本也改），已记的销售行快照金额不变
    await request(app()).post('/api/craft-profit/products').send({
      name: '改价测试商品',
      price_cents: 10000,
      artisan_cents: 1000,
      shipping_cents: 1000,
      marketing_cents: 1000,
    });
    const created = await request(app())
      .post('/api/craft-profit/products')
      .send({ name: '快照商品', price_cents: 5000, artisan_cents: 1000, shipping_cents: 500, marketing_cents: 500 });
    await request(app()).post('/api/craft-profit/sales').send({ product_id: created.body.id, qty: 1 });
    // 只读路径能算出 30 元盈利（快照），与商品当前配置一致
    const sales = await request(app()).get('/api/craft-profit/sales');
    const row = sales.body.items.find((s: { product_id: string }) => s.product_id === created.body.id);
    expect(row.profit_cents).toBe(3000);
  });
});

describe('环比 delta_pct', () => {
  it('上期为 0 且本期 >0 → null（前端显示「新增」）', async () => {
    const ov = await request(app()).get('/api/craft-profit/overview?days=1');
    // 前序用例的销售都发生在刚才（本期 >0），昨天一单没有（上期 0）→ 三项环比都是 null
    expect(ov.body.delta_pct).toEqual({ profit: null, revenue: null, units: null });
  });
});

describe('演示数据', () => {
  it('空库灌入：8 件商品 + 40 笔销售；再次调用幂等跳过', async () => {
    // 演示数据幂等靠「已有商品就跳过」，先清空前序用例的数据再验证。
    // （_resetForTests 只关句柄，库文件还在同一 tmp cwd，数据不会消失。）
    sqlite.getDb().exec('DELETE FROM cp_sales; DELETE FROM cp_products;');

    const first = await request(app()).post('/api/craft-profit/demo-seed');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ seeded: true, products: 8, sales: 40 });

    const second = await request(app()).post('/api/craft-profit/demo-seed');
    expect(second.body.seeded).toBe(false);

    const ps = await request(app()).get('/api/craft-profit/products');
    expect(ps.body.items.length).toBe(8);
    const ov = await request(app()).get('/api/craft-profit/overview?days=30');
    expect(ov.body.sales_count).toBe(40);
    expect(ov.body.profit_cents).toBeGreaterThan(0);
  });
});

describe('脏输入不 5xx', () => {
  it('缺 name / 负价格 / 非法 qty / 商品不存在', async () => {
    const noName = await request(app()).post('/api/craft-profit/products').send({ price_cents: 100 });
    expect(noName.status).toBe(400);

    const negPrice = await request(app())
      .post('/api/craft-profit/products')
      .send({ name: 'x', price_cents: -1 });
    expect(negPrice.status).toBe(400);

    const badQty = await request(app())
      .post('/api/craft-profit/products')
      .send({ name: 'x', price_cents: 100 });
    const sale = await request(app())
      .post('/api/craft-profit/sales')
      .send({ product_id: badQty.body.id, qty: 0 });
    expect(sale.status).toBe(400);

    const missing = await request(app()).post('/api/craft-profit/sales').send({ product_id: 'nope' });
    expect(missing.status).toBe(404);
  });
});
