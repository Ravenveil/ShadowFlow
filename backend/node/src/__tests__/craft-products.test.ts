/**
 * craft-products.test.ts — 商品目录 CRUD 契约测试（2026-11-08，craft 域扩展）。
 *
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离），覆盖：
 *   - 建商品：默认 active/空图/无来源、product_id 与 id 同值、盈利口径可算
 *   - 脏输入不 5xx（缺名 / 负价格 / 小数价格 / 非法 status）
 *   - source_post_id 引用校验（不存在 422 / 清空）
 *   - 列表 status 过滤；PATCH 上下架双向、字段局部更新、404
 *   - 与盈利域共存：同一行同时出现在 /api/craft-profit/products 且可记销售
 *     （扩展 cp_products 而非重复建表的回归护栏）
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
let productsRouter: typeof import('../routes/dashboard/craft-products').default;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let profitRouter: typeof import('../routes/dashboard/craft-profit').default;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let sqlite: typeof import('../storage/sqlite');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let profit: typeof import('../storage/craft-profit');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let posts: typeof import('../storage/craft-posts');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/craft-products', productsRouter);
  a.use('/api/craft-profit', profitRouter);
  return a;
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-craft-products-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  productsRouter = (await import('../routes/dashboard/craft-products')).default;
  profitRouter = (await import('../routes/dashboard/craft-profit')).default;
  profit = await import('../storage/craft-profit');
  posts = await import('../storage/craft-posts');
  sqlite.getDb();
  posts.listPosts(); // 触发 craft_posts 懒建表
  profit.listProducts(); // 触发 cp_* 懒建表
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.getDb().exec(
    'DELETE FROM craft_posts; DELETE FROM cp_agent_events; DELETE FROM cp_sales; DELETE FROM cp_products;',
  );
});

describe('建商品', () => {
  it('最小建单：默认目录字段 + 盈利口径可算，product_id 与 id 同值', async () => {
    const res = await request(app())
      .post('/api/craft-products')
      .send({ name: '陶艺茶杯', price_cents: 12800, cost_cents: 6000, shipping_cents: 1000 });
    expect(res.status).toBe(201);
    expect(res.body.product_id).toBe(res.body.id);
    expect(res.body.status).toBe('active');
    expect(res.body.image_url).toBe('');
    expect(res.body.source_post_id).toBeNull();
    expect(res.body.profit_per_unit_cents).toBe(5800);
    expect(res.body.created_at).toBeGreaterThan(0);
  });

  it('image_url/status 可随建单带上', async () => {
    const res = await request(app())
      .post('/api/craft-products')
      .send({
        name: '剪纸礼盒',
        price_cents: 5900,
        image_url: 'http://x/jianzhi.jpg',
        status: 'off_shelf',
      });
    expect(res.status).toBe(201);
    expect(res.body.image_url).toBe('http://x/jianzhi.jpg');
    expect(res.body.status).toBe('off_shelf');
  });

  it('脏输入不 5xx：缺名 / 负价格 / 小数价格 / 非法 status → 400', async () => {
    for (const payload of [
      { price_cents: 100 },
      { name: 'x', price_cents: -1 },
      { name: 'x', price_cents: 12.5 },
      { name: 'x', status: 'deleted' },
    ]) {
      const res = await request(app()).post('/api/craft-products').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    }
  });

  it('source_post_id 引用校验：不存在 422、存在挂上', async () => {
    const bad = await request(app())
      .post('/api/craft-products')
      .send({ name: 'x', source_post_id: 'ghost' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('POST_NOT_FOUND');

    const post = posts.createPost({ title: '来源帖' });
    const ok = await request(app())
      .post('/api/craft-products')
      .send({ name: 'x', source_post_id: post.post_id });
    expect(ok.status).toBe(201);
    expect(ok.body.source_post_id).toBe(post.post_id);
  });
});

describe('列表与更新', () => {
  it('?status 过滤；非法过滤值 400', async () => {
    await request(app()).post('/api/craft-products').send({ name: '在售', price_cents: 100 });
    await request(app())
      .post('/api/craft-products')
      .send({ name: '下架', price_cents: 100, status: 'off_shelf' });

    const onSale = await request(app()).get('/api/craft-products?status=active');
    expect(onSale.body.items).toHaveLength(1);
    expect(onSale.body.items[0].name).toBe('在售');

    const bad = await request(app()).get('/api/craft-products?status=bogus');
    expect(bad.status).toBe(400);
  });

  it('PATCH：局部更新 + 上下架双向 + 清来源', async () => {
    const post = posts.createPost({ title: '来源帖' });
    const created = await request(app())
      .post('/api/craft-products')
      .send({ name: '旧名', price_cents: 100, source_post_id: post.post_id });
    const id = created.body.product_id as string;

    const patch = await request(app())
      .patch(`/api/craft-products/${id}`)
      .send({ name: '新名', price_cents: 200, image_url: 'http://x/p.jpg' });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('新名');
    expect(patch.body.price_cents).toBe(200);
    expect(patch.body.cost_cents).toBe(0); // 未带的字段不动

    const off = await request(app()).patch(`/api/craft-products/${id}`).send({ status: 'off_shelf' });
    expect(off.body.status).toBe('off_shelf');
    const on = await request(app()).patch(`/api/craft-products/${id}`).send({ status: 'active' });
    expect(on.body.status).toBe('active'); // 下架可再上架（双向合法）

    const clear = await request(app())
      .patch(`/api/craft-products/${id}`)
      .send({ source_post_id: null });
    expect(clear.body.source_post_id).toBeNull();
  });

  it('PATCH 不存在 404；价格非法 400', async () => {
    const missing = await request(app()).patch('/api/craft-products/ghost').send({ name: 'x' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PRODUCT_NOT_FOUND');

    const created = await request(app()).post('/api/craft-products').send({ name: 'x' });
    const bad = await request(app())
      .patch(`/api/craft-products/${created.body.product_id}`)
      .send({ price_cents: -5 });
    expect(bad.status).toBe(400);
  });
});

describe('与盈利域共存（扩展 cp_products 而非重复建表）', () => {
  it('同一行同时出现在 /api/craft-profit/products 且可记销售', async () => {
    const created = await request(app())
      .post('/api/craft-products')
      .send({ name: '手工编织收纳篮', price_cents: 8900, cost_cents: 4200, shipping_cents: 800 });
    const id = created.body.product_id as string;

    // 盈利域排行（id 口径）看到同一件商品
    const rows = await request(app()).get('/api/craft-profit/products');
    expect(rows.body.items).toHaveLength(1);
    expect(rows.body.items[0].id).toBe(id);
    expect(rows.body.items[0].profit_per_unit_cents).toBe(3900);

    // [order] 同款记销售通道照常工作
    const sale = await request(app())
      .post('/api/craft-profit/sales')
      .send({ product_id: id, qty: 2 });
    expect(sale.status).toBe(201);
    expect(sale.body.profit_cents).toBe(7800);
  });

  it('老建单通道（[intake] 口径 createProduct）新列取默认值', () => {
    const p = profit.createProduct({ name: '中国结挂饰', price_cents: 4500 });
    expect(p.status).toBe('active');
    expect(p.image_url).toBe('');
    expect(p.source_post_id).toBeNull();
  });
});
