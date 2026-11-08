/**
 * web-hosting.ts — 单端口 SPA 托管（公网演示稳定性批 2026-11-08）。
 *
 * 让 Node 网关同服前端构建产物：`SF_WEB_DIST=<dir>` 指定 dist 目录（'auto'
 * = 自动探测仓库根 frontend/dist）。命中静态文件直出；其余 GET/HEAD（非
 * /api、非 /projects 前缀）回落 index.html —— 深链接/刷新全兼容，公网
 * 链接一端口出全部（cloudflared → :8002 即可，不必再经 vite dev）。
 *
 * 默认不启用（未设 SF_WEB_DIST 时零行为变化）；只挂非 API 前缀，永不
 * 影响 proxyFallback 的 /api 代理语义。
 */

import express from 'express';
import fs from 'fs';
import path from 'path';

/** 'auto' → 探测 <cwd>/frontend/dist；否则视为显式目录。目录不存在返回 null。 */
export function resolveWebDist(
  spec: string | undefined,
  cwd: string = process.cwd(),
): string | null {
  if (!spec || spec.trim() === '') return null;
  const dir = spec.trim() === 'auto'
    ? path.join(cwd, 'frontend', 'dist')
    : path.resolve(cwd, spec.trim());
  try {
    return fs.statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

/**
 * SPA 托管路由：express.static + index.html 回落。
 * 带前缀守卫（/api、/projects）——即使误挂到 app 根也绝不吞 API。
 */
export function webHosting(distDir: string): express.Router {
  const router = express.Router();
  const indexHtml = path.join(distDir, 'index.html');

  router.use((req, _res, next) => {
    const p = req.path;
    // next('router') = 逃出本 router，落回 app 后续中间件（/api 走 proxyFallback）。
    if (p === '/api' || p.startsWith('/api/') || p === '/projects' || p.startsWith('/projects/')) {
      return next('router');
    }
    next();
  });
  router.use(express.static(distDir, { index: false, maxAge: '1h' }));
  router.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!fs.existsSync(indexHtml)) return next();
    res.sendFile(indexHtml);
  });
  return router;
}
