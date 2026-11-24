/**
 * news 域 — Web 适配层（薄壳）
 *
 * GET    /api/news/items?limit=&feed_id=  → 聚合条目 + 订阅源
 * GET    /api/news/feeds                  → 订阅源列表
 * POST   /api/news/feeds                  → 新增订阅源 → 201
 * DELETE /api/news/feeds/:id              → 删除订阅源 → 204
 * POST   /api/news/refresh                → 刷新全部订阅源
 *
 * 只做 HTTP ↔ 用例映射，业务规则在 model / use_cases。
 */

import { Router, Request, Response } from 'express';
import { JsonNewsRepository } from '../infra/json-news.repository';
import { fetchFeed } from '../infra/rss';
import {
  addFeed,
  listFeeds,
  listItems,
  refreshNews,
  removeFeed,
  type NewsDeps,
  type Result,
} from '../use_cases/news';

function sendResult<T>(
  res: Response,
  result: Result<T>,
  okStatus: number,
  present: (value: T) => void = (value) => res.json(value),
): void {
  switch (result.kind) {
    case 'ok':
      res.status(okStatus);
      present(result.value);
      break;
    case 'not_found':
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feed not found' } });
      break;
    case 'invalid':
      res.status(400).json({ error: { code: result.code, message: result.code } });
      break;
  }
}

export function createNewsRouter(deps: NewsDeps): Router {
  const router = Router();

  router.get('/feeds', (_req: Request, res: Response) => {
    res.json(listFeeds(deps));
  });

  router.get('/items', (req: Request, res: Response) => {
    const limit = Number(req.query.limit);
    res.json(
      listItems(deps, {
        feedId: typeof req.query.feed_id === 'string' ? req.query.feed_id : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      }),
    );
  });

  router.post('/feeds', (req: Request, res: Response) => {
    sendResult(res, addFeed(deps, req.body ?? {}), 201);
  });

  router.delete('/feeds/:id', (req: Request, res: Response) => {
    sendResult(res, removeFeed(deps, req.params.id), 204, () => res.status(204).send());
  });

  router.post('/refresh', async (_req: Request, res: Response) => {
    try {
      res.json(await refreshNews(deps));
    } catch (err) {
      res.status(502).json({
        error: { code: 'REFRESH_FAILED', message: err instanceof Error ? err.message : 'refresh failed' },
      });
    }
  });

  return router;
}

export default createNewsRouter({ repo: new JsonNewsRepository(), fetchFeed });
