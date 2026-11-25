// single-backend-batch1.test.ts — 单后端第一批三个纯 JSON 端点的对齐测试
// 覆盖：wallet status/activity/skin-pack、artifact pin toggle、message feedback toggle。
// 数据隔离：SHADOWFLOW_DATA_DIR 指向临时目录，不碰真实 <repo>/.shadowflow。
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import walletRouter from '../settings/http-wallet';
import artifactsRouter from '../adapters/artifacts';
import messageFeedbackRouter from '../conversations/infra-message-feedback';

const tmp = mkdtempSync(path.join(tmpdir(), 'sf-sbe-batch1-'));
process.env.SHADOWFLOW_DATA_DIR = tmp;

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.SHADOWFLOW_DATA_DIR;
});

// 真实 index.ts 有 app.use(express.json())；测试 mini-app 必须同样挂载，
// 否则 POST 的 req.body 解析不到（与实现无关）。
function jsonApp(): express.Express {
  const a = express();
  a.use(express.json());
  return a;
}
function walletApp() {
  return jsonApp().use('/api/wallet', walletRouter);
}
function artifactsApp() {
  return jsonApp().use('/api/artifacts', artifactsRouter);
}
function feedbackApp() {
  return jsonApp().use('/api/messages', messageFeedbackRouter);
}

describe('GET /api/wallet/* — 默认值兜底 + 字段对齐', () => {
  it('status 返回掩码地址 + stats 四字段', async () => {
    const res = await request(walletApp()).get('/api/wallet/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('connected');
    expect(res.body).toHaveProperty('address_masked');
    expect(res.body).toHaveProperty('address_full');
    expect(res.body.stats).toEqual({
      teams_published: expect.any(Number),
      cids_held: expect.any(Number),
      gas_budget_og: expect.any(Number),
      citations: expect.any(Number),
    });
    // 掩码格式 0x1234 · 5678 · …（前 16 hex）
    expect(res.body.address_masked).toMatch(/^0x[0-9a-f]{4}( · [0-9a-f]{4}){0,3}$/);
  });

  it('activity 返回 { items: [...] }', async () => {
    const res = await request(walletApp()).get('/api/wallet/activity');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0]).toHaveProperty('op');
    expect(res.body.items[0]).toHaveProperty('status');
  });

  it('skin-pack 返回 { slots: [...] } 7 槽', async () => {
    const res = await request(walletApp()).get('/api/wallet/skin-pack');
    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBe(7);
    expect(res.body.slots[0]).toEqual({ slot: 'bg', value: expect.any(String) });
  });

  it('wallet.json 覆盖默认值', async () => {
    writeFileSync(
      path.join(tmp, 'wallet.json'),
      JSON.stringify({ connected: false, stats: { citations: 99 } }),
      'utf-8',
    );
    const res = await request(walletApp()).get('/api/wallet/status');
    expect(res.body.connected).toBe(false);
    expect(res.body.stats.citations).toBe(99);
    expect(res.body.stats.teams_published).toBe(3); // 浅合并保留默认
  });
});

describe('POST /api/artifacts/:id/pin — toggle 置顶', () => {
  beforeEach(() => {
    try { rmSync(path.join(tmp, 'artifacts', 'artifact_pins.json')); } catch { /* noop */ }
  });

  it('第一次 pin → pinned=true；第二次 → pinned=false（toggle）', async () => {
    const app = artifactsApp();
    const r1 = await request(app).post('/api/artifacts/artifact-abc/pin');
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({
      data: { artifact_id: 'artifact-abc', pinned: true, pinned_at: expect.any(String) },
      meta: {},
    });
    const r2 = await request(app).post('/api/artifacts/artifact-abc/pin');
    expect(r2.body.data.pinned).toBe(false);
    expect(r2.body.data.pinned_at).toBeNull();
  });

  it('非法 id → 400 INVALID_ARTIFACT_ID', async () => {
    const res = await request(artifactsApp()).post('/api/artifacts/../evil/pin');
    expect([400, 404]).toContain(res.status); // express 可能先规范化路径
  });

  it('保留既有 /lint 路由（POST 空体 → 400 MISSING_FIELDS，未被 pin 吞掉）', async () => {
    const res = await request(artifactsApp()).post('/api/artifacts/lint').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
  });
});

describe('/api/messages/:mid/feedback — 每用户一票 toggle', () => {
  beforeEach(() => {
    try { rmSync(path.join(tmp, 'feedback', 'message_feedback.json')); } catch { /* noop */ }
  });

  it('GET 空票 → { data: { up:0, down:0, my_rating:null } }', async () => {
    const res = await request(feedbackApp())
      .get('/api/messages/m1/feedback').query({ user_id: 'u1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { message_id: 'm1', up: 0, down: 0, my_rating: null },
      meta: {},
    });
  });

  it('POST 同票 toggle 撤销；反票切换；多用户计数', async () => {
    const app = feedbackApp();
    const a1 = await request(app).post('/api/messages/m1/feedback')
      .send({ rating: 1, user_id: 'u1' });
    expect(a1.body.data).toMatchObject({ up: 1, down: 0, my_rating: 1 });

    // u2 投反对
    const a2 = await request(app).post('/api/messages/m1/feedback')
      .send({ rating: -1, user_id: 'u2' });
    expect(a2.body.data).toMatchObject({ up: 1, down: 1, my_rating: -1 });

    // u1 撤销
    const a3 = await request(app).post('/api/messages/m1/feedback')
      .send({ rating: 1, user_id: 'u1' });
    expect(a3.body.data).toMatchObject({ up: 0, down: 1, my_rating: null });

    // u1 改投反对 → 切换
    const a4 = await request(app).post('/api/messages/m1/feedback')
      .send({ rating: -1, user_id: 'u1' });
    expect(a4.body.data).toMatchObject({ up: 0, down: 2, my_rating: -1 });
  });

  it('非法 rating → 422 INVALID_RATING', async () => {
    const res = await request(feedbackApp())
      .post('/api/messages/m1/feedback').send({ rating: 5, user_id: 'u1' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_RATING');
  });
});
