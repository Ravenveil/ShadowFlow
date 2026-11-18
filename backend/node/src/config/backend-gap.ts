/**
 * backend-gap.ts — 单后端迁移「进度条」：记录仍漏向 Python 的路由。
 *
 * 单后端不是一次切换，而是一批端点迁移。此模块提供两件事：
 *   1. installSingleBackendGapHandler()：single 模式下替代 proxyFallback，
 *      对未迁移的 /api/* 返回结构化 404（code=BACKEND_GAP），前端能明确
 *      识别"这个端点还没迁到 Node"，而不是拿到含糊的 503 或 HTML。
 *   2. getGapSnapshot()：按一级前缀聚合命中次数，供 /health/backend-gaps
 *      查询。跑一轮前端 e2e 后拉一次，就知道还剩哪些端点、优先级多高。
 *
 * 纯内存计数，进程重启清零；不持久化、不影响任何业务路径。
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { isSingleBackend } from './backend-mode';

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
 * 在 index.ts 的 proxyFallback 位置调用：
 *   - legacy：什么都不做（仍挂原 proxyFallback）
 *   - single：挂一个 gap handler，暴露命中 + 暴露 /health/backend-gaps 查询端点
 *
 * 必须在 404 catch-all 之前挂载。
 */
export function installSingleBackendGapHandler(app: Express, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isSingleBackend(env)) return false;

  app.get('/health/backend-gaps', (_req: Request, res: Response) => {
    res.json({
      mode: 'single',
      note: '仍命中未迁移端点的请求；prefix 计数越高越该优先迁到 Node',
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
        hint: '在 legacy 模式（SF_BACKEND_MODE=legacy）下此请求会转发给 Python；请迁移该端点后再切 single。',
        prefix: gapPrefix(path),
      },
    });
  });

  return true;
}
