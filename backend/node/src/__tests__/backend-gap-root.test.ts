/**
 * backend-gap-root.test.ts — 根级裸路径 gap handler（single 全路径覆盖）。
 *
 * 覆盖：裸路径 GET 命中 BACKEND_GAP 并按一级前缀计数、/health/backend-gaps
 * 可查；白名单（/projects/* 静态产物、/health*、/api/*、前端 SPA 路由、
 * 静态资源、Accept: text/html 导航）绝不误伤；legacy 模式零行为变化。
 * 不碰数据库、不启真实服务，用 supertest 打内存 Express app。
 */

import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getGapSnapshot,
  installRootGapHandler,
  installSingleBackendGapHandler,
  resetGapSnapshot,
} from '../config/backend-gap';

const ORIGINAL = {
  SF_BACKEND_MODE: process.env.SF_BACKEND_MODE,
  SF_GROUPS_BACKEND: process.env.SF_GROUPS_BACKEND,
};

beforeEach(() => {
  delete process.env.SF_BACKEND_MODE;
  delete process.env.SF_GROUPS_BACKEND;
  resetGapSnapshot();
});

afterEach(() => {
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetGapSnapshot();
});

/** 模拟 index.ts 单模式挂点：/api gap → 根级 gap → 404 catch-all。 */
function makeSingleApp(): Express {
  process.env.SF_BACKEND_MODE = 'single';
  const app = express();
  installSingleBackendGapHandler(app);
  installRootGapHandler(app);
  return app;
}

function withCatchAll(app: Express): Express {
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

describe('installRootGapHandler', () => {
  it('ADR-0001：恒安装（不再有 legacy 分支）——显式设 legacy 也照样装', async () => {
    process.env.SF_BACKEND_MODE = 'legacy';
    const app = express();
    expect(installRootGapHandler(app)).toBe(true);
    withCatchAll(app);

    const res = await request(app).get('/workflow/runs/x/graph');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BACKEND_GAP');
  });

  it('默认（未设 env）现为 single：根级 handler 默认安装', async () => {
    const app = express();
    expect(installRootGapHandler(app)).toBe(true);
    withCatchAll(app);

    const res = await request(app).get('/workflow/runs/x/graph');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BACKEND_GAP');
  });

  it('single 模式：裸路径 GET → BACKEND_GAP 404，按一级前缀计数且 /health/backend-gaps 可查', async () => {
    const app = withCatchAll(makeSingleApp());

    const gap = await request(app).get('/workflow/runs/x/graph');
    expect(gap.status).toBe(404);
    expect(gap.body.error.code).toBe('BACKEND_GAP');
    expect(gap.body.error.prefix).toBe('/workflow');
    expect(gap.body.error.message).toContain('GET /workflow/runs/x/graph');
    expect(gap.body.error.hint).toContain('ADR-0001');
    expect(gap.body.error).toHaveProperty('prefix');

    // 同前缀聚合 + 另一前缀独立计数
    await request(app).get('/workflow/agents/x/status');
    await request(app).get('/tools/list');

    const snap = getGapSnapshot();
    expect(snap.find((h) => h.prefix === '/workflow')?.count).toBe(2);
    expect(snap.find((h) => h.prefix === '/tools')?.count).toBe(1);

    const stats = await request(app).get('/health/backend-gaps');
    expect(stats.status).toBe(200);
    expect(stats.body.mode).toBe('single');
    expect(stats.body.gaps.find((h: { prefix: string }) => h.prefix === '/workflow').count).toBe(2);
  });

  it('白名单：/projects/* 静态 artifact 穿过 gap 命中后续 static handler', async () => {
    const app = makeSingleApp();
    app.get('/projects/:id/:file', (_req, res) => res.status(200).json({ served: 'static' }));
    withCatchAll(app);

    const res = await request(app).get('/projects/abc/prototype.html');
    expect(res.status).toBe(200);
    expect(res.body.served).toBe('static');
    expect(getGapSnapshot()).toHaveLength(0);
  });

  it('白名单：/health 与 /health/backend-gaps 都不被 gap 吞', async () => {
    const app = makeSingleApp();
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    withCatchAll(app);

    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const stats = await request(app).get('/health/backend-gaps');
    expect(stats.status).toBe(200);
    expect(stats.body.gaps).toEqual([]);
    expect(getGapSnapshot()).toHaveLength(0);
  });

  it('浏览器导航兜底：Accept: text/html 的 GET /chat 交回后续 handler', async () => {
    const app = makeSingleApp();
    app.get('/chat', (_req, res) => res.status(200).json({ spa: true }));
    withCatchAll(app);

    const res = await request(app).get('/chat').set('Accept', 'text/html,application/xhtml+xml');
    expect(res.status).toBe(200);
    expect(res.body.spa).toBe(true);
    expect(getGapSnapshot()).toHaveLength(0);
  });

  it('浏览器深链兜底：Accept: text/html 的 GET /evals/some/page 同样不吞', async () => {
    const app = makeSingleApp();
    app.get('/evals/some/page', (_req, res) => res.status(200).json({ spa: true }));
    withCatchAll(app);

    const res = await request(app).get('/evals/some/page').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.body.spa).toBe(true);
    expect(getGapSnapshot()).toHaveLength(0);
  });

  it('SPA 白名单：无 Accept 的 /、/chat、/runs 等导航页也不吞（精确匹配）', async () => {
    const app = makeSingleApp();
    for (const route of ['/', '/chat', '/runs', '/settings', '/knowledge', '/dashboard']) {
      app.get(route, (_req, res) => res.status(200).json({ spa: route }));
    }
    withCatchAll(app);

    for (const route of ['/', '/chat', '/runs', '/settings', '/knowledge', '/dashboard']) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.body.spa).toBe(route);
    }
    expect(getGapSnapshot()).toHaveLength(0);
  });

  it('静态资源：带扩展名与常见静态目录均穿过 gap', async () => {
    const app = makeSingleApp();
    app.get('/assets/index-abc.js', (_req, res) => res.status(200).json({ asset: true }));
    withCatchAll(app);

    expect((await request(app).get('/assets/index-abc.js')).status).toBe(200);
    expect((await request(app).get('/favicon.ico')).status).toBe(404); // 落 catch-all 而非 gap
    expect((await request(app).get('/projects/abc/style.css')).status).toBe(404);

    expect(getGapSnapshot()).toHaveLength(0);
  });

  it('/api/* 仍由原 gap handler 独占，根级 handler 不重复计数', async () => {
    const app = withCatchAll(makeSingleApp());

    const res = await request(app).get('/api/memory-bank/packs/x/query?verbose=1');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BACKEND_GAP');
    expect(res.body.error.prefix).toBe('/api/memory-bank');

    const snap = getGapSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ prefix: '/api/memory-bank', count: 1, lastMethod: 'GET' });
  });

  it('非 GET 请求不被根级 handler 吞掉', async () => {
    const app = makeSingleApp();
    app.post('/workflow/runs', (_req, res) => res.status(201).json({ created: true }));
    withCatchAll(app);

    const res = await request(app).post('/workflow/runs').send({});
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(getGapSnapshot()).toHaveLength(0);
  });

  it('路径边界：/healthcare 不属于 /health 白名单，仍按裸路径 gap 计数', async () => {
    const app = withCatchAll(makeSingleApp());

    const res = await request(app).get('/healthcare/insurers');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BACKEND_GAP');
    expect(res.body.error.prefix).toBe('/healthcare');
  });

  it('query 串不进 prefix：/workflow/runs/x/graph?node=n1 → /workflow', async () => {
    const app = withCatchAll(makeSingleApp());

    const res = await request(app).get('/workflow/runs/x/graph?node=n1');
    expect(res.status).toBe(404);
    expect(res.body.error.prefix).toBe('/workflow');
    expect(res.body.error.message).toContain('/workflow/runs/x/graph');
  });
});
