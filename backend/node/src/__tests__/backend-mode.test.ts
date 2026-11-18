/**
 * backend-mode.test.ts — 单后端模式开关 + gap handler（2026-11-18 第一批）。
 *
 * 覆盖：默认 legacy 零变化 / single 强制 groups=node 且不挂 proxyFallback /
 * gap handler 对未迁移端点返回结构化 404 并计数、/health/backend-gaps 可查。
 * 不碰数据库、不启真实服务，用 supertest 打内存 Express app。
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getBackendMode,
  isSingleBackend,
  groupsBackendEnv,
  shouldMountProxyFallback,
} from '../config/backend-mode';
import {
  gapPrefix,
  getGapSnapshot,
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

describe('getBackendMode', () => {
  it('默认（未设）→ legacy，行为零变化', () => {
    expect(getBackendMode()).toBe('legacy');
    expect(isSingleBackend()).toBe(false);
    expect(shouldMountProxyFallback()).toBe(true);
  });

  it('无法识别的值 → legacy（安全默认）', () => {
    process.env.SF_BACKEND_MODE = 'banana';
    expect(getBackendMode()).toBe('legacy');
  });

  it('single → 强制 groups=node、不挂 proxyFallback', () => {
    process.env.SF_BACKEND_MODE = 'single';
    expect(getBackendMode()).toBe('single');
    expect(isSingleBackend()).toBe(true);
    expect(groupsBackendEnv()).toBe('node');
    expect(shouldMountProxyFallback()).toBe(false);
  });

  it('single 覆盖已设的 SF_GROUPS_BACKEND=python', () => {
    process.env.SF_BACKEND_MODE = 'single';
    process.env.SF_GROUPS_BACKEND = 'python';
    expect(groupsBackendEnv()).toBe('node');
  });

  it('legacy 下沿用既有 SF_GROUPS_BACKEND', () => {
    process.env.SF_GROUPS_BACKEND = 'dual';
    expect(groupsBackendEnv()).toBe('dual');
    process.env.SF_GROUPS_BACKEND = 'node';
    expect(groupsBackendEnv()).toBe('node');
  });
});

describe('gapPrefix', () => {
  it('取一级 /api 前缀并丢弃 query', () => {
    expect(gapPrefix('/api/memory-bank/packs/x/query?verbose=1')).toBe('/api/memory-bank');
    expect(gapPrefix('/api/schedules')).toBe('/api/schedules');
    expect(gapPrefix('/runs/graph')).toBe('/runs');
  });
});

describe('installSingleBackendGapHandler', () => {
  it('legacy 模式不安装', () => {
    const app = express();
    expect(installSingleBackendGapHandler(app)).toBe(false);
  });

  it('single 模式：native 路由照常、未迁移端点返回 BACKEND_GAP 404 并计数', async () => {
    process.env.SF_BACKEND_MODE = 'single';
    const app = express();
    app.use(express.json());
    app.get('/api/health', (_req, res) => res.json({ ok: true }));
    const installed = installSingleBackendGapHandler(app);
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
    expect(installed).toBe(true);

    // native 路由不受影响
    const ok = await request(app).get('/api/health');
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);

    // 未迁移端点 → 结构化 gap 404
    const gap = await request(app).get('/api/memory-bank/packs/x/query?verbose=1');
    expect(gap.status).toBe(404);
    expect(gap.body.error.code).toBe('BACKEND_GAP');
    expect(gap.body.error.prefix).toBe('/api/memory-bank');

    const gap2 = await request(app).post('/api/memory-bank/packs').send({});
    expect(gap2.status).toBe(404);
    expect(gap2.body.error.code).toBe('BACKEND_GAP');

    // 计数按前缀聚合
    const snap = getGapSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].prefix).toBe('/api/memory-bank');
    expect(snap[0].count).toBe(2);

    // 查询端点可读
    const stats = await request(app).get('/health/backend-gaps');
    expect(stats.status).toBe(200);
    expect(stats.body.mode).toBe('single');
    expect(stats.body.gaps[0].count).toBe(2);
  });
});
