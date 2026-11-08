/**
 * craft-posts.test.ts — 小红书博文数据层 + REST 契约测试（2026-11-08）。
 *
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离），覆盖：
 *   - 建博文：默认 draft、topics/images 归一（{name,path,url,is_image}）
 *   - 脏输入不 5xx（topics 非数组 / images 项非对象 / 非法 status / 商品引用不存在）
 *   - 列表：status 过滤、days 窗口过滤；单条读取与 404
 *   - 状态机单向：draft→confirmed→published，非法迁移 422 且整单不落库
 *   - 发布即冻结：published 后内容字段改动 422 FROZEN，同值幂等 no-op 放行
 *   - 发布同步落 [post] 社媒标记（sp_posts + 营销运营动态），同状态重试不重发
 *   - 商品关联：挂接 / 清空 / 引用不存在 422
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
let postsRouter: typeof import('../routes/dashboard/craft-posts').default;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let productsRouter: typeof import('../routes/dashboard/craft-products').default;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let sqlite: typeof import('../storage/sqlite');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let profit: typeof import('../storage/craft-profit');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let posts: typeof import('../storage/craft-posts');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let social: typeof import('../storage/social-publish');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/craft-posts', postsRouter);
  a.use('/api/craft-products', productsRouter);
  return a;
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-craft-posts-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  postsRouter = (await import('../routes/dashboard/craft-posts')).default;
  productsRouter = (await import('../routes/dashboard/craft-products')).default;
  profit = await import('../storage/craft-profit');
  posts = await import('../storage/craft-posts');
  social = await import('../storage/social-publish');
  sqlite.getDb();
  posts.listPosts(); // 触发 craft_posts 懒建表
  profit.listProducts(); // 触发 cp_* 懒建表
  social.listAccounts(); // 触发 sp_* 懒建表
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.getDb().exec(
    'DELETE FROM craft_posts; DELETE FROM cp_agent_events; DELETE FROM cp_sales; DELETE FROM cp_products;' +
      'DELETE FROM sp_publish_log; DELETE FROM sp_posts; DELETE FROM sp_accounts;',
  );
});

const IMG_FIXTURE = [
  { name: '苗绣.jpg', path: 'C:/tmp/a.jpg', url: 'http://x/a.jpg', is_image: true },
  { name: '产品说明.pdf', path: 'C:/tmp/b.pdf', url: 'http://x/b.pdf' },
];

describe('建博文与字段归一', () => {
  it('默认 draft：topics/images 归一、时间戳齐全、product_id 为空', async () => {
    const res = await request(app())
      .post('/api/craft-posts')
      .send({
        title: '山里来的温柔',
        body: '残障匠人手作苗绣杯垫',
        topics: ['手作', '  苗绣  ', ''],
        images: IMG_FIXTURE,
      });
    expect(res.status).toBe(201);
    expect(res.body.post_id).toBeTruthy();
    expect(res.body.status).toBe('draft');
    expect(res.body.topics).toEqual(['手作', '苗绣']); // 空项滤掉、trim
    expect(res.body.images[0]).toEqual({
      name: '苗绣.jpg',
      path: 'C:/tmp/a.jpg',
      url: 'http://x/a.jpg',
      is_image: true,
    });
    // is_image 缺省按扩展名猜：pdf → false
    expect(res.body.images[1].is_image).toBe(false);
    expect(res.body.product_id).toBeNull();
    expect(res.body.published_at).toBeNull();
    expect(res.body.created_at).toBeGreaterThan(0);
    expect(res.body.updated_at).toBe(res.body.created_at);
  });

  it('创建可带 confirmed；直接 published 400（发布必须走 PATCH 状态迁移）', async () => {
    const ok = await request(app())
      .post('/api/craft-posts')
      .send({ title: '已确认', status: 'confirmed' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('confirmed');

    const bad = await request(app())
      .post('/api/craft-posts')
      .send({ title: '想直接发', status: 'published' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_INPUT');
  });

  it('脏输入不 5xx：topics 非数组 / images 项非对象 / 非法 status → 400', async () => {
    for (const payload of [
      { title: 'a', topics: '手作,苗绣' },
      { title: 'a', images: ['http://x/a.jpg'] },
      { title: 'a', status: 'bogus' },
    ]) {
      const res = await request(app()).post('/api/craft-posts').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    }
  });

  it('关联商品引用不存在 → 422 PRODUCT_NOT_FOUND', async () => {
    const res = await request(app())
      .post('/api/craft-posts')
      .send({ title: 'a', product_id: 'nope' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});

describe('列表与读取', () => {
  it('列表新→旧排序；?status= 过滤；?status 非法 400', async () => {
    await request(app()).post('/api/craft-posts').send({ title: '第一条' });
    await request(app()).post('/api/craft-posts').send({ title: '第二条', status: 'confirmed' });

    const all = await request(app()).get('/api/craft-posts');
    expect(all.status).toBe(200);
    expect(all.body.items.map((p: { title: string }) => p.title)).toEqual(['第二条', '第一条']);

    const confirmed = await request(app()).get('/api/craft-posts?status=confirmed');
    expect(confirmed.body.items).toHaveLength(1);
    expect(confirmed.body.items[0].title).toBe('第二条');

    const bad = await request(app()).get('/api/craft-posts?status=bogus');
    expect(bad.status).toBe(400);
  });

  it('?days 窗口过滤：窗口外的博文不出现', async () => {
    const res = await request(app()).post('/api/craft-posts').send({ title: '十天前的' });
    // 直接把 created_at 拨回 10 天前（API 不提供伪造时间的口子）
    sqlite
      .getDb()
      .prepare('UPDATE craft_posts SET created_at = ? WHERE post_id = ?')
      .run(Date.now() - 10 * 24 * 60 * 60 * 1000, res.body.post_id);

    const win = await request(app()).get('/api/craft-posts?days=3');
    expect(win.body.items).toHaveLength(0);
    const all = await request(app()).get('/api/craft-posts');
    expect(all.body.items).toHaveLength(1);
  });

  it('GET 单条返回解析后的 topics/images；不存在 404', async () => {
    const created = await request(app())
      .post('/api/craft-posts')
      .send({ title: '单条', topics: ['手作'], images: IMG_FIXTURE });
    const one = await request(app()).get(`/api/craft-posts/${created.body.post_id}`);
    expect(one.status).toBe(200);
    expect(one.body.topics).toEqual(['手作']);
    expect(Array.isArray(one.body.images)).toBe(true);

    const missing = await request(app()).get('/api/craft-posts/missing-id');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('POST_NOT_FOUND');
  });
});

describe('状态机（单向 draft→confirmed→published）', () => {
  async function newPost(): Promise<string> {
    const res = await request(app()).post('/api/craft-posts').send({ title: '原始标题', body: '正文' });
    return res.body.post_id as string;
  }

  it('draft→confirmed ✓，同 PATCH 可带内容更新', async () => {
    const id = await newPost();
    const res = await request(app())
      .patch(`/api/craft-posts/${id}`)
      .send({ status: 'confirmed', title: '确认后的标题' });
    expect(res.status).toBe(200);
    expect(res.body.post.status).toBe('confirmed');
    expect(res.body.post.title).toBe('确认后的标题');
  });

  it('非法迁移 422 且整单不落库：confirmed→draft 回退被拒', async () => {
    const id = await newPost();
    await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'confirmed' });
    const res = await request(app())
      .patch(`/api/craft-posts/${id}`)
      .send({ status: 'draft', title: '不该落库' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    const after = await request(app()).get(`/api/craft-posts/${id}`);
    expect(after.body.title).toBe('原始标题'); // 回退被拒 → 内容更新一并不落
    expect(after.body.status).toBe('confirmed');
  });

  it('draft→published 直跳 422（必须先确认）', async () => {
    const id = await newPost();
    const res = await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'published' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('confirmed→published ✓：published_at 落值 + [post] 社媒标记落库', async () => {
    const id = await newPost();
    await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'confirmed' });
    const res = await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'published' });
    expect(res.status).toBe(200);
    expect(res.body.post.status).toBe('published');
    expect(res.body.post.published_at).toBeGreaterThan(0);
    expect(res.body.marker.ok).toBe(true);

    // [post] 标记走既有落库通道：社媒发布域帖子 + 营销运营动态
    const spPosts = social.listPosts();
    expect(spPosts).toHaveLength(1);
    expect(spPosts[0].title).toBe('原始标题');
    const events = profit.listAgentEvents();
    expect(events.some((e) => e.kind === 'marketing')).toBe(true);
  });

  it('同状态重试幂等：published→published 不重复落标记', async () => {
    const id = await newPost();
    await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'confirmed' });
    await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'published' });
    const again = await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'published' });
    expect(again.status).toBe(200);
    expect(again.body.marker).toBeUndefined();
    expect(social.listPosts()).toHaveLength(1); // 标记没重发
  });

  it('published 是终态：→confirmed 422', async () => {
    const id = await newPost();
    await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'confirmed' });
    await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'published' });
    const res = await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'confirmed' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('PATCH status 非法值 400', async () => {
    const id = await newPost();
    const res = await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'shipped' });
    expect(res.status).toBe(400);
  });
});

describe('发布即冻结（published 后内容不可改）', () => {
  async function publishedWithLink(): Promise<{ id: string; productId: string; updatedAt: number }> {
    const created = await request(app()).post('/api/craft-posts').send({
      title: '冻结帖',
      body: '正文',
      topics: ['手作'],
      images: IMG_FIXTURE,
    });
    const id = created.body.post_id as string;
    const product = await request(app())
      .post('/api/craft-products')
      .send({ name: '陶艺茶杯', price_cents: 12800 });
    const productId = product.body.product_id as string;
    await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'confirmed' });
    await request(app()).patch(`/api/craft-posts/${id}`).send({ product_id: productId });
    const pub = await request(app()).patch(`/api/craft-posts/${id}`).send({ status: 'published' });
    return { id, productId, updatedAt: pub.body.post.updated_at as number };
  }

  it('published 后改任一内容字段 → 422 FROZEN，整单不落库', async () => {
    const { id, productId } = await publishedWithLink();
    const other = await request(app())
      .post('/api/craft-products')
      .send({ name: '另一件', price_cents: 100 });

    for (const payload of [
      { title: '改标题' },
      { body: '改正文' },
      { topics: ['改话题'] },
      { images: [{ name: 'x.jpg', url: 'http://x/x.jpg', is_image: true }] },
      { product_id: other.body.product_id },
    ]) {
      const res = await request(app()).patch(`/api/craft-posts/${id}`).send(payload);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FROZEN');
    }

    // 整单不落库：全部字段仍是发布时的值
    const after = await request(app()).get(`/api/craft-posts/${id}`);
    expect(after.body.title).toBe('冻结帖');
    expect(after.body.body).toBe('正文');
    expect(after.body.topics).toEqual(['手作']);
    expect(after.body.images).toHaveLength(2);
    expect(after.body.product_id).toBe(productId);
    expect(after.body.status).toBe('published');
  });

  it('published 后同值幂等 no-op 放行：不写库、不落标记', async () => {
    const { id, productId, updatedAt } = await publishedWithLink();
    const res = await request(app())
      .patch(`/api/craft-posts/${id}`)
      .send({ title: '冻结帖', product_id: productId, status: 'published' });
    expect(res.status).toBe(200);
    expect(res.body.marker).toBeUndefined(); // 标记没重发
    expect(res.body.post.updated_at).toBe(updatedAt); // 幂等 no-op 不动 updated_at
    expect(social.listPosts()).toHaveLength(1); // 社媒帖仍只有一条
  });

  it('标准序列不受影响：publish 前挂 product_id，发布后关联保留', async () => {
    const { id, productId } = await publishedWithLink();
    const after = await request(app()).get(`/api/craft-posts/${id}`);
    expect(after.body.status).toBe('published');
    expect(after.body.product_id).toBe(productId);
    expect(social.listPosts()).toHaveLength(1); // 发布时 [post] 标记已落
  });
});

describe('商品关联', () => {
  async function newProductId(): Promise<string> {
    const res = await request(app())
      .post('/api/craft-products')
      .send({ name: '陶艺茶杯', price_cents: 12800, cost_cents: 6000, shipping_cents: 1000 });
    return res.body.product_id as string;
  }

  it('挂接 → 清空：product_id 双向可改', async () => {
    const created = await request(app()).post('/api/craft-posts').send({ title: '带货帖' });
    const id = created.body.post_id as string;
    const productId = await newProductId();

    const link = await request(app()).patch(`/api/craft-posts/${id}`).send({ product_id: productId });
    expect(link.status).toBe(200);
    expect(link.body.post.product_id).toBe(productId);

    const clear = await request(app()).patch(`/api/craft-posts/${id}`).send({ product_id: null });
    expect(clear.status).toBe(200);
    expect(clear.body.post.product_id).toBeNull();
  });

  it('挂接不存在的商品 → 422 PRODUCT_NOT_FOUND', async () => {
    const created = await request(app()).post('/api/craft-posts').send({ title: '带货帖' });
    const res = await request(app())
      .patch(`/api/craft-posts/${created.body.post_id}`)
      .send({ product_id: 'ghost' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});
