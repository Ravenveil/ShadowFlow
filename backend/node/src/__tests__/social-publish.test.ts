/**
 * social-publish.test.ts — 社交发布域契约测试（2026-11-07）。
 *
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离），覆盖：
 *   - 六大平台自描述（规格 + mock/real 凭证契约）
 *   - 账号 CRUD（未知平台 / 空名拒绝；有帖删号 409）
 *   - 商品一键生成营销帖（复用 mb_products，文案含商品名与价格）
 *   - mock 发布全链路（状态机 + 确定性 external_id + 回执落 log）
 *   - 重复发布 409 / failed 可重试（attempt 递增）
 *   - real 模式缺凭证 → 结构化 CREDENTIALS_MISSING 回执（不 5xx）
 *   - 平台长度/图片数校验、脏输入不 5xx
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
let router: typeof import('../routes/social/social-publish').default;
let sqlite: typeof import('../storage/sqlite');
let merchant: typeof import('../storage/merchant-board');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/social-publish', router);
  return a;
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-social-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  router = (await import('../routes/social/social-publish')).default;
  merchant = await import('../storage/merchant-board');
  sqlite.getDb();
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe('平台自描述', () => {
  it('列出六大平台，各带规格与 real 凭证契约', async () => {
    const res = await request(app()).get('/api/social-publish/platforms');
    expect(res.status).toBe(200);
    const ids = res.body.platforms.map((p: { id: string }) => p.id);
    expect(ids).toEqual(['wechat_mp', 'xiaohongshu', 'douyin', 'weibo', 'shipinhao', 'kuaishou']);
    for (const p of res.body.platforms) {
      expect(p.modes).toEqual(['mock', 'real']);
      expect(p.content_max).toBeGreaterThan(0);
      expect(p.real_env.envs.length).toBeGreaterThan(0);
      expect(p.real_env.envs.every((e: string) => /^SP_/.test(e))).toBe(true);
      expect(p.real_flow.length).toBeGreaterThan(0);
    }
  });

  it('stats 空库全 0', async () => {
    const res = await request(app()).get('/api/social-publish/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accounts: 0, posts: 0, published: 0, failed: 0, logs: 0 });
  });
});

describe('账号管理', () => {
  let accountId = '';

  it('建 mock 账号成功', async () => {
    const res = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'xiaohongshu', account_name: '手作小店官方号' });
    expect(res.status).toBe(201);
    expect(res.body.account.platform).toBe('xiaohongshu');
    expect(res.body.account.auth_mode).toBe('mock');
    accountId = res.body.account.id;
  });

  it('未知平台 / 空名被拒（400，不 5xx）', async () => {
    const bad1 = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'telegram', account_name: 'x' });
    expect(bad1.status).toBe(400);
    expect(bad1.body.error.code).toBe('UNKNOWN_PLATFORM');
    const bad2 = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'weibo', account_name: '   ' });
    expect(bad2.status).toBe(400);
    expect(bad2.body.error.code).toBe('INVALID_ACCOUNT_NAME');
  });

  it('删不存在的账号 404；有帖删号 409', async () => {
    const missing = await request(app()).delete('/api/social-publish/accounts/nope');
    expect(missing.status).toBe(404);

    const post = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, content: '先发一帖占位' });
    expect(post.status).toBe(201);
    const blocked = await request(app()).delete(`/api/social-publish/accounts/${accountId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ACCOUNT_HAS_POSTS');
  });
});

describe('商品一键生成营销帖 + mock 发布', () => {
  let accountId = '';
  let productId = '';
  let postId = '';

  it('建账号 + 建商品 → 带 product_id 建帖，文案含商品名与价格', async () => {
    const acc = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'xiaohongshu', account_name: '手作小店' });
    accountId = acc.body.account.id;

    const product = merchant.createProduct({ name: '蓝染手作围巾', price_cents: 12900, cost_cents: 4300 });
    productId = product.id;

    const res = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, product_id: productId });
    expect(res.status).toBe(201);
    expect(res.body.post.product_id).toBe(productId);
    expect(res.body.post.status).toBe('draft');
    expect(res.body.post.title).toContain('蓝染手作围巾');
    expect(res.body.post.content).toContain('蓝染手作围巾');
    expect(res.body.post.content).toContain('¥129');
    expect(res.body.post.title.length).toBeLessThanOrEqual(20); // 小红书标题上限
  });

  it('商品不存在 404；账号不存在 404', async () => {
    const noProduct = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, product_id: 'ghost' });
    expect(noProduct.status).toBe(404);
    expect(noProduct.body.error.code).toBe('PRODUCT_NOT_FOUND');
    const noAccount = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: 'ghost', content: 'x' });
    expect(noAccount.status).toBe(404);
    expect(noAccount.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('mock 发布：draft → published，确定性 external_id，回执落 log', async () => {
    const list = await request(app()).get('/api/social-publish/posts');
    postId = list.body.posts.find((p: { product_id: string }) => p.product_id === productId).id;

    const res = await request(app()).post(`/api/social-publish/posts/${postId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.receipt.ok).toBe(true);
    expect(res.body.receipt.audit).toBe('passed');
    expect(res.body.receipt.external_id).toMatch(/^mock_xiaohongshu_[0-9a-f]{12}$/);
    expect(res.body.attempt).toBe(1);
    expect(res.body.post.status).toBe('published');
    expect(res.body.post.published_at).toBeGreaterThan(0);

    const log = await request(app()).get(`/api/social-publish/posts/${postId}/log`);
    expect(log.status).toBe(200);
    expect(log.body.log).toHaveLength(1);
    expect(log.body.log[0].status).toBe('success');
    expect(log.body.log[0].attempt).toBe(1);
    expect(JSON.parse(log.body.log[0].response).external_id).toBe(res.body.receipt.external_id);
  });

  it('重复发布 409（published 终态，防重复发到真实平台）', async () => {
    const res = await request(app()).post(`/api/social-publish/posts/${postId}/publish`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('POST_ALREADY_PUBLISHED');
  });
});

describe('real 模式与重试', () => {
  let accountId = '';
  let postId = '';

  it('real 账号缺凭证 → 结构化 CREDENTIALS_MISSING 回执，帖子 failed 不 5xx', async () => {
    delete process.env.SP_WEIBO_ACCESS_TOKEN;
    const acc = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'weibo', account_name: '官微', auth_mode: 'real' });
    accountId = acc.body.account.id;
    expect(acc.body.account.auth_mode).toBe('real');

    const post = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, content: '#手作好物# 测试发布' });
    postId = post.body.post.id;

    const res = await request(app()).post(`/api/social-publish/posts/${postId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.receipt.ok).toBe(false);
    expect(res.body.receipt.code).toBe('CREDENTIALS_MISSING');
    expect(res.body.post.status).toBe('failed');
  });

  it('failed 可重试，attempt 递增且每次都落 log', async () => {
    const res = await request(app()).post(`/api/social-publish/posts/${postId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.attempt).toBe(2);
    const log = await request(app()).get(`/api/social-publish/posts/${postId}/log`);
    expect(log.body.log).toHaveLength(2);
    expect(log.body.log.map((l: { attempt: number }) => l.attempt)).toEqual([1, 2]);
    expect(log.body.log.every((l: { status: string }) => l.status === 'failed')).toBe(true);
  });
});

describe('校验与脏输入', () => {
  let accountId = '';

  beforeAll(async () => {
    const acc = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'kuaishou', account_name: '快手号' });
    accountId = acc.body.account.id;
  });

  it('空 content 400；平台长度上限 400', async () => {
    const empty = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, content: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('INVALID_CONTENT');

    const tooLong = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, content: 'x'.repeat(501) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('CONTENT_LIMIT');
  });

  it('media 类型/数量校验 400', async () => {
    const badType = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, content: 'ok', media: 'not-array' });
    expect(badType.status).toBe(400);
    expect(badType.body.error.code).toBe('INVALID_MEDIA');

    // 抖音规格 max_media=1，2 张图应被拒
    const douyin = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'douyin', account_name: '抖音号' });
    const tooMany = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: douyin.body.account.id, content: 'ok', media: ['a.png', 'b.png'] });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe('MEDIA_LIMIT');
  });

  it('脏 body 不 5xx', async () => {
    // content 被抹成空串 → 400 校验错；缺账号 → 404
    const res = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, title: { nested: true }, content: 42 });
    expect(res.status).toBe(400);
    const noAccount = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: 12345, content: 'x' });
    expect(noAccount.status).toBe(404);
    const statsRes = await request(app()).get('/api/social-publish/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.posts).toBeGreaterThanOrEqual(0);
  });
});
