/**
 * web-hosting.test.ts — 单端口 SPA 托管（2026-11-08 公网兼容批）。
 *
 * 覆盖：resolveWebDist 解析（auto/显式/缺失）、静态直出、深链接回落
 * index.html、/api 与 /projects 前缀绝不被吞（next('router') 逃生）。
 */

import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveWebDist, webHosting } from '../lib/web-hosting';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-web-dist-'));
  fs.writeFileSync(path.join(tmp, 'index.html'), '<html><body>SPA-INDEX</body></html>');
  fs.mkdirSync(path.join(tmp, 'assets'));
  fs.writeFileSync(path.join(tmp, 'assets', 'app.css'), 'body{color:red}');
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('resolveWebDist', () => {
  it('未设置 / 空串 → null（默认不启用）', () => {
    expect(resolveWebDist(undefined, tmp)).toBeNull();
    expect(resolveWebDist('', tmp)).toBeNull();
    expect(resolveWebDist('   ', tmp)).toBeNull();
  });

  it('auto 探测 <cwd>/frontend/dist', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-auto-'));
    fs.mkdirSync(path.join(cwd, 'frontend', 'dist'), { recursive: true });
    expect(resolveWebDist('auto', cwd)).toBe(path.join(cwd, 'frontend', 'dist'));
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('auto 但目录不存在 → null；显式目录存在 → 解析绝对路径', () => {
    expect(resolveWebDist('auto', tmp)).toBeNull();
    expect(resolveWebDist(tmp, tmp)).toBe(path.resolve(tmp, tmp));
  });

  it('显式路径缺失或不是目录 → null', () => {
    expect(resolveWebDist(path.join(tmp, 'nope'), tmp)).toBeNull();
    expect(resolveWebDist(path.join(tmp, 'index.html'), tmp)).toBeNull();
  });
});

describe('webHosting', () => {
  function app(): express.Express {
    const a = express();
    a.use('/api', (_req, res) => res.json({ via: 'api-fallback' }));
    a.use('/projects', (_req, res) => res.json({ via: 'projects-static' }));
    a.use(webHosting(tmp));
    a.use((_req, res) => res.status(404).json({ via: 'app-404' }));
    return a;
  }

  it('GET / → index.html', async () => {
    const res = await request(app()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SPA-INDEX');
  });

  it('深链接 /dashboard/xyz → 回落 index.html（SPA 刷新兼容）', async () => {
    const res = await request(app()).get('/dashboard/xyz');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SPA-INDEX');
  });

  it('静态文件直出（带 cache 头）', async () => {
    const res = await request(app()).get('/assets/app.css');
    expect(res.status).toBe(200);
    expect(res.text).toBe('body{color:red}');
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });

  it('/api/* 不被 SPA 托管吞掉（落 proxyFallback 语义）', async () => {
    const res = await request(app()).get('/api/anything');
    expect(res.body).toEqual({ via: 'api-fallback' });
  });

  it('/projects/* 不被吞掉（落 projects 静态语义）', async () => {
    const res = await request(app()).get('/projects/x/y.html');
    expect(res.body).toEqual({ via: 'projects-static' });
  });

  it('非 GET/HEAD 不回落 index.html（落 app 404）', async () => {
    const res = await request(app()).post('/whatever');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ via: 'app-404' });
  });
});
