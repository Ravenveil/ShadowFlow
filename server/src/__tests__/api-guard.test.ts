/**
 * api-guard.test.ts — 写接口访问控制（功能线①③加固，2026-11-05）。
 *
 * 覆盖：未配 token 时只放行回环 / 配了 token 时校验 Bearer / 两个 Router 真的挂了 guard。
 * 不碰数据库：所有被拒的请求在 guard 处就返回了；回环放行由既有路由测试覆盖。
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiGuard, isLoopbackAddress } from '../middleware/api-guard';
import merchantBoardRouter from '../routes/merchant-board';
import memoryHandoffRouter from '../routes/memory-handoff';

const ORIGINAL_TOKEN = process.env.SF_API_TOKEN;

/** 构造一个「远端」应用：trust proxy + 用 X-Forwarded-For 伪造来源 IP。 */
function appWithGuard(): express.Express {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(apiGuard());
  app.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

function remote(req: request.Test): request.Test {
  return req.set('X-Forwarded-For', '203.0.113.9');
}

beforeEach(() => {
  delete process.env.SF_API_TOKEN;
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.SF_API_TOKEN;
  else process.env.SF_API_TOKEN = ORIGINAL_TOKEN;
});

describe('isLoopbackAddress', () => {
  it('认得 IPv4 / IPv6 / IPv4 映射三种写法', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('外网与空值一律不是回环', () => {
    expect(isLoopbackAddress('203.0.113.9')).toBe(false);
    expect(isLoopbackAddress('10.0.0.5')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress('')).toBe(false);
  });
});

describe('未配置 SF_API_TOKEN：只放行本机', () => {
  it('回环请求放行', async () => {
    const res = await request(appWithGuard()).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('远端请求 403，并说明怎么开', async () => {
    const res = await remote(request(appWithGuard()).get('/ping'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LOOPBACK_ONLY');
    expect(String(res.body.error.message)).toContain('SF_API_TOKEN');
  });
});

describe('配置了 SF_API_TOKEN：校验 Bearer', () => {
  beforeEach(() => {
    process.env.SF_API_TOKEN = 'secret-token-123';
  });

  it('没带 Authorization → 401', async () => {
    const res = await remote(request(appWithGuard()).get('/ping'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('token 不对 → 403', async () => {
    const res = await remote(request(appWithGuard()).get('/ping')).set(
      'Authorization',
      'Bearer wrong-token',
    );
    expect(res.status).toBe(403);
  });

  it('长度相同但内容不同也拒（定长比较不能漏）', async () => {
    const res = await remote(request(appWithGuard()).get('/ping')).set(
      'Authorization',
      'Bearer secret-token-124',
    );
    expect(res.status).toBe(403);
  });

  it('token 正确 → 放行，且远端也能用', async () => {
    const res = await remote(request(appWithGuard()).get('/ping')).set(
      'Authorization',
      'Bearer secret-token-123',
    );
    expect(res.status).toBe(200);
  });

  it('Bearer 前缀大小写不敏感', async () => {
    const res = await remote(request(appWithGuard()).get('/ping')).set(
      'Authorization',
      'bearer secret-token-123',
    );
    expect(res.status).toBe(200);
  });
});

describe('两条功能线的 Router 确实挂了 guard', () => {
  it('/api/merchant 远端无 token → 403（在 guard 处就拦下，不碰数据库）', async () => {
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/merchant', merchantBoardRouter);
    const res = await remote(request(app).get('/api/merchant/stats'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LOOPBACK_ONLY');
  });

  it('/api/memory/handoff 远端无 token → 403', async () => {
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/memory/handoff', memoryHandoffRouter);
    const res = await remote(request(app).get('/api/memory/handoff/stats'));
    expect(res.status).toBe(403);
  });

  it('配了 token 后远端带对 token 能过 guard（401/403 消失）', async () => {
    process.env.SF_API_TOKEN = 'guard-wired';
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/memory/handoff', memoryHandoffRouter);
    const denied = await remote(request(app).get('/api/memory/handoff/stats'));
    expect([401, 403]).toContain(denied.status);
    // 带对 token：guard 放行，可能因库未初始化报 5xx，但不是鉴权拒绝
    const passed = await remote(request(app).get('/api/memory/handoff/stats')).set(
      'Authorization',
      'Bearer guard-wired',
    );
    expect([401, 403]).not.toContain(passed.status);
  });
});
