/**
 * backend-gap.ts — 未迁移端点的「显式 404 进度条」。
 *
 * 2026-11-24 ADR-0001：Python 后端已退役，proxyFallback 已删除 —— 命中本
 * handler 的端点族现在是**永久 404**（不再是“暂时转 Python”）。三件事不变：
 *   1. installSingleBackendGapHandler()：对未迁移的 /api/* 返回结构化 404
 *      （code=BACKEND_GAP），前端能明确识别“这个端点还没迁到 Node”。
 *   2. installRootGapHandler()：同口径覆盖裸路径（/workflow/*、/tools/* 等
 *      Python 侧未加 /api 前缀的端点），排除静态资源、健康检查与前端 SPA。
 *   3. getGapSnapshot()：按一级前缀聚合命中次数，供 /health/backend-gaps 查询。
 *
 * 纯内存计数，进程重启清零；不持久化、不影响任何业务路径。
 */

import type { Express, Request, Response, NextFunction } from 'express';

export interface BackendGapHit {
  prefix: string;
  count: number;
  lastMethod: string;
  lastPath: string;
  lastAt: string;
}

const hits = new Map<string, BackendGapHit>();

/** 取一级前缀：/api/memory-bank/packs/x → /api/memory-bank */
export function gapPrefix(path: string): string {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts[0] !== 'api') return '/' + (parts[0] ?? '');
  return '/' + parts.slice(0, 2).join('/');
}

function record(req: Request): void {
  const path = req.originalUrl || req.path;
  const prefix = gapPrefix(path);
  const prev = hits.get(prefix);
  const now = new Date().toISOString();
  hits.set(prefix, {
    prefix,
    count: (prev?.count ?? 0) + 1,
    lastMethod: req.method,
    lastPath: path,
    lastAt: now,
  });
}

export function getGapSnapshot(): BackendGapHit[] {
  return Array.from(hits.values()).sort((a, b) => b.count - a.count);
}

export function resetGapSnapshot(): void {
  hits.clear();
}

/**
 * 在 index.ts 的（已删除的）proxyFallback 位置调用：挂 gap handler，
 * 暴露命中 + /health/backend-gaps 查询端点。必须在 404 catch-all 之前挂载。
 */
export function installSingleBackendGapHandler(app: Express): boolean {
  app.get('/health/backend-gaps', (_req: Request, res: Response) => {
    res.json({
      mode: 'single',
      note: 'Python 已退役（ADR-0001）：这些是未迁移到 Node 的端点，命中即永久 404',
      gaps: getGapSnapshot(),
    });
  });

  app.use('/api', (req: Request, res: Response, _next: NextFunction) => {
    record(req);
    const path = req.originalUrl || req.path;
    res.status(404).json({
      error: {
        code: 'BACKEND_GAP',
        message: `此端点尚未迁移到单后端（Node）：${req.method} ${path}`,
        hint: 'Python 后端已退役（ADR-0001），不会再转发；迁移清单见 documentation/ADR-0001-single-backend.md。',
        prefix: gapPrefix(path),
      },
    });
  });

  return true;
}

// ── 根级裸路径 gap ─────────────────────────────────────────────────────
// Python 侧有一批未加 /api 前缀的裸路径端点（/workflow/*、/builder/*、
// /evals/*、/tools/*、/regression/*、/runs/*、/chat/sessions/*、/citations/*、
// /archive/*、/ops/*、/policy/*、/templates/* 等）。/api gap handler 只挂在
// /api 上，这些请求会静默落 404 catch-all，既不进 gap 统计也无从观测。
// installRootGapHandler 用一个根级 middleware 兜住它们。
//
// 为什么是独立函数而不是给 installSingleBackendGapHandler 加参数：两者挂点
// 不同——/api handler 在（已删的）proxyFallback 位置，根级 handler 必须在
// static /projects 之后、404 catch-all 之前（见 index.ts）。

/**
 * 纯前端导航路由（无扩展名）。生产由 nginx、dev 由 Vite 服务，Node 不该吞。
 * 只做「整路径精确匹配」：/runs 是 SPA 页，/runs/graph 仍是裸路径 gap。
 * 前 6 个来自全路径覆盖任务约束，其余来自 frontend/legacy/src/AppRoutes.tsx。
 */
const SPA_PAGE_ROUTES = new Set([
  '/',
  '/chat',
  '/evals',
  '/builder',
  '/agents',
  '/runs',
  '/neo',
  '/group',
  '/settings',
  '/loop-engine',
  '/knowledge',
  '/memory',
  '/dashboard',
  '/clawhub',
]);

/** 静态资源目录（Vite/webpack 产物 + 框架内部路径）。 */
const STATIC_PATH_PREFIXES = [
  '/assets/',
  '/static/',
  '/public/',
  '/@vite/',
  '/@fs/',
  '/node_modules/',
];

/** 根目录静态小文件（favicon 等）。 */
const STATIC_ROOT_FILES = new Set([
  '/favicon.ico',
  '/favicon.svg',
  '/vite.svg',
  '/robots.txt',
  '/manifest.json',
  '/index.html',
]);

/** 末段带常见资源扩展名 → 静态文件，不是后端端点。 */
const STATIC_EXTENSION = /\.[a-zA-Z0-9]{1,8}$/;

/** 前缀匹配但要求路径边界：/health 与 /health/... 命中，/healthcare 不命中。 */
function hasPathBoundary(path: string, segment: string): boolean {
  return path === segment || path.startsWith(segment + '/');
}

/**
 * 裸路径 gap 白名单——命中任一条即交回 next()，绝不返回 BACKEND_GAP。
 * 顺序无关，纯判定；抽出来便于单测直接覆盖每一类豁免。
 */
function isRootGapExempt(path: string): boolean {
  // 服务端可观测端点（含 /health/backend-gaps）与真实业务路径 /healthcare 区分开
  if (hasPathBoundary(path, '/health')) return true;
  // 静态 artifact：/projects/<session>/prototype.html（Story 15.2/15.3）
  if (hasPathBoundary(path, '/projects')) return true;
  // /api/* 已由 installSingleBackendGapHandler 处理，避免重复计数
  if (hasPathBoundary(path, '/api')) return true;
  // 前端 SPA 导航页（整路径精确匹配）
  if (SPA_PAGE_ROUTES.has(path)) return true;
  // 静态资源
  if (STATIC_ROOT_FILES.has(path)) return true;
  if (STATIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  if (STATIC_EXTENSION.test(lastSegment)) return true;
  return false;
}

/** 浏览器导航兜底：Accept 含 text/html 的请求交回 nginx/Vite 处理 SPA。 */
function acceptsHtml(req: Request): boolean {
  const accept = req.headers.accept;
  return typeof accept === 'string' && accept.includes('text/html');
}

/**
 * 在 static /projects 挂载之后、404 catch-all 之前调用：installRootGapHandler(app)。
 * 只拦「GET + 裸路径 + 非白名单 + 非浏览器导航」，其余交回 next()。
 * 信封与计数口径与 /api gap handler 完全一致（两条 handler 必须保持同步）。
 */
export function installRootGapHandler(app: Express): boolean {
  app.use((req: Request, res: Response, next: NextFunction): void => {
    // 写端点未来可能在 Node 原生实现，非 GET 一律不吞
    if (req.method !== 'GET') {
      next();
      return;
    }

    const rawPath = req.originalUrl || req.path || '';
    const path = rawPath.split('?')[0];
    if (!path.startsWith('/')) {
      next();
      return;
    }

    if (isRootGapExempt(path) || acceptsHtml(req)) {
      next();
      return;
    }

    record(req);
    res.status(404).json({
      error: {
        code: 'BACKEND_GAP',
        message: `此端点尚未迁移到单后端（Node）：${req.method} ${path}`,
        hint: 'Python 后端已退役（ADR-0001），不会再转发；迁移清单见 documentation/ADR-0001-single-backend.md。',
        prefix: gapPrefix(path),
      },
    });
  });

  return true;
}
