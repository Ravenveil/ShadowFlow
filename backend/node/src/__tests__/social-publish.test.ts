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
 *   - C5 审核状态机 + 人工门：draft→pending_review→approved/rejected→published，
 *     pending_review/rejected 卡发布（REVIEW_PENDING/REVIEW_REJECTED），
 *     review_json 行内留痕；draft 直发保留（人工点发布即人工门本身）
 *   - mock 回执 real_prerequisites 元数据（envs/flow/assets，防 mock 被当真发布）
 *   - POST /copy 内容契约九字段（T1-T8 八格式、product_id brief、price 覆盖）
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

// ── C5 审核状态机 + 人工门（2026-11-07，内容规范第五章四道检查）──────────────

describe('审核状态机与人工门', () => {
  let accountId = '';

  beforeAll(async () => {
    const acc = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'xiaohongshu', account_name: '审核流测试号' });
    accountId = acc.body.account.id;
  });

  async function newPost(content: string): Promise<string> {
    const res = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: accountId, content });
    expect(res.status).toBe(201);
    return res.body.post.id as string;
  }

  it('主流程：draft → pending_review → approved → publish 成功', async () => {
    const id = await newPost('手作陶杯上新，温润如玉');

    const submit = await request(app()).post(`/api/social-publish/posts/${id}/submit-review`);
    expect(submit.status).toBe(200);
    expect(submit.body.post.status).toBe('pending_review');

    // 人工门：pending_review 不可外发
    const blocked = await request(app()).post(`/api/social-publish/posts/${id}/publish`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('REVIEW_PENDING');

    const review = await request(app())
      .post(`/api/social-publish/posts/${id}/review`)
      .send({ decision: 'approve', comment: '文案合规，发', reviewer: '运营小王' });
    expect(review.status).toBe(200);
    expect(review.body.post.status).toBe('approved');
    expect(review.body.review.decision).toBe('approve');
    expect(review.body.review.comment).toBe('文案合规，发');
    expect(review.body.review.reviewer).toBe('运营小王');

    // review_json 行内留痕（最新审核决定）
    const got = await request(app()).get(`/api/social-publish/posts/${id}`);
    expect(got.status).toBe(200);
    const reviewJson = JSON.parse(got.body.post.review_json);
    expect(reviewJson.decision).toBe('approve');
    expect(reviewJson.comment).toBe('文案合规，发');

    const pub = await request(app()).post(`/api/social-publish/posts/${id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.receipt.ok).toBe(true);
    expect(pub.body.post.status).toBe('published');
  });

  it('退回流程：rejected 卡发布 → 重新提审 → 再审通过可发', async () => {
    const id = await newPost('绝对全网最低价，速抢');

    await request(app()).post(`/api/social-publish/posts/${id}/submit-review`);
    const reject = await request(app())
      .post(`/api/social-publish/posts/${id}/review`)
      .send({ decision: 'reject', comment: '含绝对化用语，改后再提' });
    expect(reject.status).toBe(200);
    expect(reject.body.post.status).toBe('rejected');
    expect(reject.body.review.comment).toBe('含绝对化用语，改后再提');

    const blocked = await request(app()).post(`/api/social-publish/posts/${id}/publish`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('REVIEW_REJECTED');

    // rejected 可重新提审（改后重走人工门）
    const resubmit = await request(app()).post(`/api/social-publish/posts/${id}/submit-review`);
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.post.status).toBe('pending_review');

    const approve = await request(app())
      .post(`/api/social-publish/posts/${id}/review`)
      .send({ decision: 'approve' });
    expect(approve.status).toBe(200);
    expect(approve.body.review.comment).toBeUndefined();
    const pub = await request(app()).post(`/api/social-publish/posts/${id}/publish`);
    expect(pub.status).toBe(200);
  });

  it('状态闸门：draft/published 不可审、approved/published 不可再提审', async () => {
    const id = await newPost('手作木勺，纹理天然');
    // draft 直接审 → 409
    const early = await request(app())
      .post(`/api/social-publish/posts/${id}/review`)
      .send({ decision: 'approve' });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('INVALID_STATUS');

    await request(app()).post(`/api/social-publish/posts/${id}/submit-review`);
    await request(app()).post(`/api/social-publish/posts/${id}/review`).send({ decision: 'approve' });
    // approved 再提审 → 409
    const again = await request(app()).post(`/api/social-publish/posts/${id}/submit-review`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATUS');

    await request(app()).post(`/api/social-publish/posts/${id}/publish`);
    // published 提审 → 409
    const late = await request(app()).post(`/api/social-publish/posts/${id}/submit-review`);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATUS');
  });

  it('decision 非 approve/reject → 400 BAD_DECISION', async () => {
    const id = await newPost('待审短帖');
    await request(app()).post(`/api/social-publish/posts/${id}/submit-review`);
    const bad = await request(app())
      .post(`/api/social-publish/posts/${id}/review`)
      .send({ decision: 'maybe' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_DECISION');
    // 校验失败不动状态
    const got = await request(app()).get(`/api/social-publish/posts/${id}`);
    expect(got.body.post.status).toBe('pending_review');
  });

  it('draft 直发保留（人工点发布即人工门本身，回归）', async () => {
    const id = await newPost('手作银戒，独一无二');
    const pub = await request(app()).post(`/api/social-publish/posts/${id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.post.status).toBe('published');
    // published 后再提审被卡
    const submit = await request(app()).post(`/api/social-publish/posts/${id}/submit-review`);
    expect(submit.status).toBe(409);
  });
});

// ── C3/P0 建议：mock 回执带 real 前置元数据（防 mock 被当真发布）─────────────

describe('mock 回执 real_prerequisites 元数据', () => {
  it('mock 发布回执附带 real 前置（envs/flow/assets），标明切真实还缺什么', async () => {
    const acc = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'kuaishou', account_name: '快手测试号' });
    const post = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: acc.body.account.id, content: '手作陶艺过程记录' });
    const res = await request(app()).post(`/api/social-publish/posts/${post.body.post.id}/publish`);
    expect(res.status).toBe(200);
    const prereq = res.body.receipt.real_prerequisites;
    expect(prereq).toBeDefined();
    expect(prereq.envs.every((e: string) => /^SP_/.test(e))).toBe(true);
    expect(prereq.envs.length).toBeGreaterThan(0);
    expect(prereq.flow.length).toBeGreaterThan(0);
    expect(prereq.assets).toEqual(['video', 'cover']); // 快手 real 需视频+封面
  });

  it('无 real 资产要求的平台 assets 为空数组（小红书图文）', async () => {
    const acc = await request(app())
      .post('/api/social-publish/accounts')
      .send({ platform: 'xiaohongshu', account_name: '小红书测试号' });
    const post = await request(app())
      .post('/api/social-publish/posts')
      .send({ account_id: acc.body.account.id, content: '手作笔记一则' });
    const res = await request(app()).post(`/api/social-publish/posts/${post.body.post.id}/publish`);
    expect(res.body.receipt.real_prerequisites.assets).toEqual([]);
  });
});

// ── 内容契约生成 /copy（内容生成规范第三章 九字段）───────────────────────────

describe('POST /copy 内容契约生成', () => {
  let productId = '';

  beforeAll(() => {
    const product = merchant.createProduct({ name: '扎染帆布包', price_cents: 8900, cost_cents: 3000 });
    productId = product.id;
  });

  it.each([
    'note', 'short_video', 'moments', 'article',
    'detail_page', 'csr_proposal', 'product_card', 'service_reply',
  ])('format=%s → 九字段契约完整', async (format) => {
    const res = await request(app())
      .post('/api/social-publish/copy')
      .send({ format, name: '扎染帆布包', price_cents: 8900, platform: 'xiaohongshu' });
    expect(res.status).toBe(200);
    const c = res.body.contract;
    expect(c.platform).toBe('xiaohongshu');
    expect(c.format).toBe(format);
    expect(typeof c.title).toBe('string');
    expect(c.title.length).toBeGreaterThan(0);
    expect(typeof c.content).toBe('string');
    expect(c.content.length).toBeGreaterThan(0);
    expect(Array.isArray(c.tags)).toBe(true);
    expect(typeof c.cta).toBe('string');
    expect(Array.isArray(c.media)).toBe(true);
    expect(c.ai_label).toBe(true); // AI 生成内容显式标识
    expect(typeof c.label_text).toBe('string');
    expect(c.compliance).toBeDefined();
    expect(c.compliance.checked).toBe(true);
    expect(typeof c.compliance.passed).toBe('boolean');
  });

  it('product_id 建 brief：文案含商品名与价格；price_cents 可覆盖', async () => {
    const res = await request(app())
      .post('/api/social-publish/copy')
      .send({ format: 'note', product_id: productId });
    expect(res.status).toBe(200);
    expect(res.body.contract.content).toContain('扎染帆布包');
    expect(res.body.contract.content).toContain('¥89');

    const override = await request(app())
      .post('/api/social-publish/copy')
      .send({ format: 'note', product_id: productId, price_cents: 7900 });
    expect(override.body.contract.content).toContain('¥79');
  });

  it('未知 format 400；缺 brief 400；商品不存在 404', async () => {
    const badFormat = await request(app())
      .post('/api/social-publish/copy')
      .send({ format: 'vlog', name: 'x' });
    expect(badFormat.status).toBe(400);
    expect(badFormat.body.error.code).toBe('UNKNOWN_FORMAT');

    const noBrief = await request(app()).post('/api/social-publish/copy').send({ format: 'note' });
    expect(noBrief.status).toBe(400);
    expect(noBrief.body.error.code).toBe('INVALID_BRIEF');

    const noProduct = await request(app())
      .post('/api/social-publish/copy')
      .send({ format: 'note', product_id: 'ghost' });
    expect(noProduct.status).toBe(404);
  });
});
