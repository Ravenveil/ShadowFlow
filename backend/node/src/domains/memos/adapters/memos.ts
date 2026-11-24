/**
 * memos 域 — Web 适配层（薄壳）
 *
 * GET    /api/memos        → 备忘列表（updated_at 倒序）
 * POST   /api/memos        → 新建 → 201
 * PATCH  /api/memos/:id    → 局部更新
 * DELETE /api/memos/:id    → 204
 *
 * 只做 HTTP → 用例 Result 映射，不含业务规则。
 */

import { Router, Request, Response } from 'express';
import { JsonMemoRepository } from '../infra/json-memo.repository';
import {
  makeCreateMemo,
  makeDeleteMemo,
  makeListMemos,
  makeUpdateMemo,
  type Result,
} from '../use_cases/memos';

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
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Memo not found' } });
      break;
    case 'invalid':
      res.status(400).json({ error: { code: result.code, message: result.code } });
      break;
  }
}

export function createMemosRouter(repo: JsonMemoRepository): Router {
  const router = Router();
  const list = makeListMemos(repo);
  const create = makeCreateMemo(repo);
  const update = makeUpdateMemo(repo);
  const remove = makeDeleteMemo(repo);

  router.get('/', (_req: Request, res: Response) => {
    res.json(list());
  });

  router.post('/', (req: Request, res: Response) => {
    sendResult(res, create(req.body), 201);
  });

  router.patch('/:id', (req: Request, res: Response) => {
    sendResult(res, update(req.params.id, req.body), 200);
  });

  router.delete('/:id', (req: Request, res: Response) => {
    sendResult(res, remove(req.params.id), 204, () => res.status(204).send());
  });

  return router;
}

export default createMemosRouter(new JsonMemoRepository());
