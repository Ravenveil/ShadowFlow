/**
 * mcp 域 — Web 适配层（薄壳）
 *
 *   GET    /api/mcp/servers        → { servers }
 *   POST   /api/mcp/servers        → 201 { server }；400 校验失败；409 重名
 *   PATCH  /api/mcp/servers/:name  → { server }；404
 *   DELETE /api/mcp/servers/:name  → 204；404
 *   POST   /api/mcp/servers/:name/test → { ok, tools, duration_ms, error? }
 *   POST   /api/mcp/probe          → 同上（保存前试连）
 *
 * 只做 HTTP → 用例 Result 映射，不含业务规则。
 */

import { Router, type Request, type Response } from 'express';
import { JsonMcpRepository } from './infra/json-mcp.repository';
import { probeTarget } from './infra/probe';
import {
  createServer,
  deleteServer,
  listServers,
  probeAdHoc,
  probeByName,
  updateServer,
  type McpDeps,
  type Result,
} from './use_cases/servers';

function send<T>(
  res: Response,
  result: Result<T>,
  okStatus: number,
  present: (value: T) => void = (value) => res.json(value),
): void {
  if (result.kind === 'error') {
    res.status(result.error.status).json({ error: result.error.code, message: result.error.message });
    return;
  }
  res.status(okStatus);
  present(result.value);
}

export function createMcpRouter(
  deps: McpDeps = { repo: new JsonMcpRepository(), probe: probeTarget },
): Router {
  const router = Router();

  router.get('/servers', async (_req: Request, res: Response) => {
    const result = await listServers(deps);
    send(res, result, 200, (servers) => res.json({ servers }));
  });

  router.post('/servers', async (req: Request, res: Response) => {
    const result = await createServer(deps, req.body);
    send(res, result, 201, (server) => res.json({ server }));
  });

  router.patch('/servers/:name', async (req: Request, res: Response) => {
    const result = await updateServer(deps, req.params.name, req.body);
    send(res, result, 200, (server) => res.json({ server }));
  });

  router.delete('/servers/:name', async (req: Request, res: Response) => {
    const result = await deleteServer(deps, req.params.name);
    send(res, result, 204, () => res.status(204).send());
  });

  router.post('/servers/:name/test', async (req: Request, res: Response) => {
    const result = await probeByName(deps, req.params.name);
    send(res, result, 200, (probe) => res.json(probe));
  });

  router.post('/probe', async (req: Request, res: Response) => {
    const result = await probeAdHoc(deps, req.body);
    send(res, result, 200, (probe) => res.json(probe));
  });

  return router;
}

export default createMcpRouter();
