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
  type EnrichDeps,
  type NewsDeps,
  type Result,
} from '../use_cases/news';
import { DEFAULT_MODELS } from '../../../transport/api-clients';
import { resolveProviderKey } from '../../../transport/byokKey';
import { enrichBatch, ENRICH_BATCH_SIZE, ENRICH_MAX_ITEMS, type VerdictInput } from '../enrich';
import { mapLimit } from '../../../lib/chat-dag/map-limit';
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

/**
 * 默认内容管线：zhipu GLM（与 run-suggestions 同一 provider 选择），
 * 分批（ENRICH_BATCH_SIZE）有界并发评完；任一批失败只丢该批。
 */
export function defaultEnrichDeps(
  headers: Record<string, string | string[] | undefined>,
): EnrichDeps {
  const provider = 'zhipu' as const;
  const apiKey = resolveProviderKey(provider, headers);
  console.log(`[news-enrich] key=${apiKey ? 'resolved(' + apiKey.length + ')' : 'MISSING'} batches start`);
  return {
    runEnrich: async (items) => {
      console.log(`[news-enrich] runEnrich called with ${items.length} items`);
      const pending: VerdictInput[] = items.slice(0, ENRICH_MAX_ITEMS).map((i) => ({
        item_id: i.item_id,
        title: i.title,
        summary: i.summary,
      }));
      const merged = new Map<string, import('../model').NewsVerdict>();
      const batches: VerdictInput[][] = [];
      for (let i = 0; i < pending.length; i += ENRICH_BATCH_SIZE) {
        batches.push(pending.slice(i, i + ENRICH_BATCH_SIZE));
      }
      const results = await mapLimit(batches, 3, (batch) => enrichBatch({ provider, apiKey, model: DEFAULT_MODELS[provider] }, batch));
      for (const result of results) {
        if (!result) continue;
        for (const [id, verdict] of result) merged.set(id, verdict);
      }
      return merged;
    },
  };
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

  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      res.json(await refreshNews(deps, defaultEnrichDeps(req.headers)));
    } catch (err) {
      res.status(502).json({
        error: { code: 'REFRESH_FAILED', message: err instanceof Error ? err.message : 'refresh failed' },
      });
    }
  });

  return router;
}

export default createNewsRouter({ repo: new JsonNewsRepository(), fetchFeed });
