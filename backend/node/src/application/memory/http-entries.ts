/**
 * memory-entries.ts — River Memory CRUD 的 Web 适配层（薄壳）
 *
 * GET    /api/memory-entries              → list (optional ?scope=user|project|session)
 * POST   /api/memory-entries              → create → 201
 * GET    /api/memory-entries/settings     → read enabled flag
 * PUT    /api/memory-entries/settings     → update enabled flag
 * PATCH  /api/memory-entries/:id          → partial update
 * DELETE /api/memory-entries/:id          → 204
 *
 * 职责：解析 HTTP → 调用例 → 把 Result 映射成状态码。
 * 不含业务规则（在 model）、不含数据访问（在 infra）、不含编排（在 use_case）。
 *
 * IMPORTANT: /settings registered BEFORE /:id so Express doesn't read it as an id.
 */

import { Router, Request, Response } from 'express';
import type { MemoryEntryRepository } from './repository';
import { JsonMemoryEntryRepository } from './infra/json-memory-entry.repository';
import {
  makeCreateEntry,
  makeDeleteEntry,
  makeGetSettings,
  makeListEntries,
  makeUpdateEntry,
  makeUpdateSettings,
  type Result,
} from './use_cases/entries';

/** 把用例 Result 统一映射成 HTTP 响应；业务层不认识 status code。 */
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
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entry not found' } });
      break;
    case 'invalid':
      res.status(400).json({ error: { code: result.code, message: result.code } });
      break;
  }
}

/**
 * 工厂：接收 repository（依赖倒置），装配出路由。
 * 装配根决定注入哪个实现；路由本身不知道 JSON 还是 SQLite。
 */
export function createMemoryEntriesRouter(repo: MemoryEntryRepository): Router {
  const router = Router();
  const list = makeListEntries(repo);
  const create = makeCreateEntry(repo);
  const update = makeUpdateEntry(repo);
  const remove = makeDeleteEntry(repo);
  const getSettings = makeGetSettings(repo);
  const updateSettings = makeUpdateSettings(repo);

  router.get('/', (req: Request, res: Response) => {
    res.json(list(req.query.scope));
  });

  router.post('/', (req: Request, res: Response) => {
    sendResult(res, create(req.body), 201);
  });

  router.get('/settings', (_req: Request, res: Response) => {
    res.json(getSettings());
  });

  router.put('/settings', (req: Request, res: Response) => {
    sendResult(res, updateSettings(req.body), 200);
  });

  router.patch('/:id', (req: Request, res: Response) => {
    sendResult(res, update(req.params.id, req.body), 200);
  });

  router.delete('/:id', (req: Request, res: Response) => {
    sendResult(res, remove(req.params.id), 204, () => res.status(204).send());
  });

  return router;
}

/**
 * 过渡装配：保持与重构前一致的默认导出（Router 实例），index.ts 与兼容存根零改动。
 * 【待办·装配根收口】将来在 index.ts 统一 new JsonMemoryEntryRepository() 并注入；
 * 届时本文件的默认装配删除，只保留 createMemoryEntriesRouter 工厂。
 */
const router = createMemoryEntriesRouter(new JsonMemoryEntryRepository());
export default router;
