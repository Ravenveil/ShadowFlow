/**
 * settings-key-guard.test.ts — 密钥材料接口的公网防护（2026-11-08 隧道加固）。
 *
 * 背景：cloudflared 隧道把 :8443 映射成公网链接后，GET /api/settings 全量 dump
 * 与 /byok/:id/reveal 等接口把 BYOK 明文 apiKey 暴露给任何拿到链接的人。
 * 本文件覆盖：
 *   - reveal / 通用 KV dump / 写入 / 花费接口：伪造 X-Forwarded-For 的远端 403，
 *     本机（supertest 回环）放行
 *   - GET /api/settings 与 /:key 深度脱敏：密钥形状字段 + sk- 形状值不出明文
 *   - 只读脱敏列表（GET /byok、/embedding）远端仍可用（设置页可渲染）
 *   - cf-connecting-ip（隧道入口头）出现即判远端（伪造值也一样）；
 *     XFF 只有回环 hop 仍算本机；伪造回环前缀 + 真实公网 hop 判远端
 *
 * 存储落在临时 cwd（storage/settings.ts 按 process.cwd() 解析），不碰开发库。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import settingsRouter from '../routes/system/settings';
import { apiGuard } from '../middleware/api-guard';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/settings', settingsRouter);

/** 独立小应用：直接验证 apiGuard 的转发头来源解析（不经 settings 路由）。 */
const probeApp = express();
probeApp.use(apiGuard({ loopbackAlways: true }));
probeApp.get('/ping', (_req, res) => {
  res.json({ ok: true });
});

const KEY = 'sk-test-1234567890abcd';
const KEY_TAIL = '••••abcd';

let tmpDir = '';
let prevCwd = '';

beforeAll(() => {
  prevCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-keyguard-test-'));
  process.chdir(tmpDir);
});

afterAll(() => {
  process.chdir(prevCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const ORIGINAL_TOKEN = process.env.SF_API_TOKEN;

beforeEach(() => {
  delete process.env.SF_API_TOKEN;
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.SF_API_TOKEN;
  else process.env.SF_API_TOKEN = ORIGINAL_TOKEN;
});

/** 伪造公网来源（与 api-guard.test.ts 同手法）。 */
function remote(req: request.Test): request.Test {
  return req.set('X-Forwarded-For', '203.0.113.9');
}

/** 通过（本机）API 种一个带明文密钥的 byok provider。 */
async function seedProvider(): Promise<void> {
  const res = await request(app).put('/api/settings/byok/mimo').send({
    apiKey: KEY,
    baseUrl: 'https://api.xiaomimimo.com/v1',
    models: [],
    enabled: true,
  });
  expect(res.status).toBe(200);
}

describe('密钥材料接口：远端一律拦，本机放行', () => {
  it('本机 reveal 明文照常返回（owner 路径不受影响）', async () => {
    await seedProvider();
    const res = await request(app).get('/api/settings/byok/mimo/reveal');
    expect(res.status).toBe(200);
    expect(res.body.apiKey).toBe(KEY);
  });

  it('远端 reveal → 403 LOOPBACK_ONLY', async () => {
    await seedProvider();
    const res = await remote(request(app).get('/api/settings/byok/mimo/reveal'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LOOPBACK_ONLY');
  });

  it('远端 GET /api/settings 全量 dump → 403', async () => {
    const res = await remote(request(app).get('/api/settings'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LOOPBACK_ONLY');
  });

  it('远端 GET /api/settings/:key 原值读取 → 403', async () => {
    await seedProvider();
    const res = await remote(request(app).get('/api/settings/byok'));
    // 注意：/byok 是脱敏列表（下方单独覆盖），这里用通用 KV 单键读取验证
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(KEY);

    const raw = await remote(request(app).get('/api/settings/craft_profit.team'));
    expect(raw.status).toBe(403);
    expect(raw.body.error.code).toBe('LOOPBACK_ONLY');
  });

  it('远端 PUT / DELETE byok → 403（防偷改/清空密钥）', async () => {
    await seedProvider();
    const put = await remote(
      request(app).put('/api/settings/byok/mimo').send({ apiKey: 'sk-attacker-key-12345678' }),
    );
    expect(put.status).toBe(403);
    const del = await remote(request(app).delete('/api/settings/byok/mimo'));
    expect(del.status).toBe(403);
  });

  it('远端通用 KV 写入（PUT /:key，可整体覆盖 byok 存储）→ 403', async () => {
    const res = await remote(request(app).put('/api/settings/anything').send({ value: 1 }));
    expect(res.status).toBe(403);
  });

  it('远端花费接口（check / models/remote / image）→ 403', async () => {
    await seedProvider();
    for (const [method, url] of [
      ['post', '/api/settings/byok/mimo/check'],
      ['get', '/api/settings/byok/mimo/models/remote'],
      ['post', '/api/settings/embedding/check'],
      ['post', '/api/settings/image/generations'],
    ] as const) {
      const res = await remote((request(app) as any)[method](url).send({}));
      expect(res.status, `${method} ${url}`).toBe(403);
    }
  });

  it('远端 embedding reveal / 写入 → 403（先于 404/业务校验）', async () => {
    const reveal = await remote(request(app).get('/api/settings/embedding/reveal'));
    expect(reveal.status).toBe(403);
    const put = await remote(request(app).put('/api/settings/embedding').send({ apiKey: 'sk-x' }));
    expect(put.status).toBe(403);
  });
});

describe('通用 KV dump 深度脱敏（防御纵深，本机也脱敏）', () => {
  it('GET /api/settings：byok 明文 apiKey 不出网，只留尾 4 位', async () => {
    await seedProvider();
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(KEY);
    expect(res.text).toContain(KEY_TAIL);
  });

  it('GET /api/settings/:key：嵌套 apiKey 字段脱敏', async () => {
    // 注：'byok' 键本身会被字面路由 GET /byok 接住（脱敏列表），
    // 通用 /:key 用自定义键验证嵌套脱敏。
    const put = await request(app)
      .put('/api/settings/my_team_cfg')
      .send({ value: { providers: { mimo: { apiKey: KEY } } } });
    expect(put.status).toBe(200);
    const res = await request(app).get('/api/settings/my_team_cfg');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(KEY);
    expect(res.body.value.providers.mimo.apiKey).toBe(KEY_TAIL);
  });

  it('无害字段名下的 sk- 形状字符串值同样脱敏', async () => {
    const put = await request(app)
      .put('/api/settings/my_cfg')
      .send({ value: { note: 'sk-abcdefghijklmnop' } });
    expect(put.status).toBe(200);
    const res = await request(app).get('/api/settings/my_cfg');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('sk-abcdefghijklmnop');
    expect(res.body.value.note).toBe('••••mnop');
  });

  it('非密钥字段不受影响（preferences 等照常可见）', async () => {
    const put = await request(app).put('/api/settings/preferences').send({ theme: 'light' });
    expect(put.status).toBe(200);
    const res = await request(app).get('/api/settings');
    expect(res.body.settings.preferences.theme).toBe('light');
  });
});

describe('只读脱敏列表远端仍可用（设置页可渲染）', () => {
  it('GET /byok 远端 200 且已脱敏', async () => {
    await seedProvider();
    const res = await remote(request(app).get('/api/settings/byok'));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(KEY);
    expect(res.body.providers.mimo.apiKey).toBe(KEY_TAIL);
  });

  it('GET /embedding 远端 200（脱敏视图）', async () => {
    const res = await remote(request(app).get('/api/settings/embedding'));
    expect(res.status).toBe(200);
    expect(res.body.hasKey).toBe(false);
  });
});

describe('转发头来源解析（api-guard 隧道加固）', () => {
  it('cf-connecting-ip 出现即判远端——伪造回环值也拦', async () => {
    const res = await request(probeApp).get('/ping').set('Cf-Connecting-Ip', '127.0.0.1');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LOOPBACK_ONLY');
  });

  it('XFF 只有回环 hop（Vite dev proxy 场景）→ 仍算本机', async () => {
    const res = await request(probeApp).get('/ping').set('X-Forwarded-For', '127.0.0.1');
    expect(res.status).toBe(200);
  });

  it('伪造回环前缀 + 真实公网 hop（隧道场景）→ 远端 403', async () => {
    const res = await request(probeApp)
      .get('/ping')
      .set('X-Forwarded-For', '127.0.0.1, 203.0.113.9');
    expect(res.status).toBe(403);
  });
});

describe('loopbackAlways：配了 SF_API_TOKEN 本机仍放行', () => {
  it('本机 reveal 200；远端无 token 401', async () => {
    process.env.SF_API_TOKEN = 'secret-token-123';
    await seedProvider();
    const local = await request(app).get('/api/settings/byok/mimo/reveal');
    expect(local.status).toBe(200);
    expect(local.body.apiKey).toBe(KEY);

    const r1 = await remote(request(app).get('/api/settings/byok/mimo/reveal'));
    expect(r1.status).toBe(401);

    const r2 = await remote(request(app).get('/api/settings/byok/mimo/reveal')).set(
      'Authorization',
      'Bearer secret-token-123',
    );
    expect(r2.status).toBe(200);
    expect(r2.body.apiKey).toBe(KEY);
  });
});
