/**
 * agents.ts — Agent CRUD router (Story 15.1)
 *
 * Frontend client: src/api/agents.ts
 *   - All success responses wrap payload in { data, meta } (Envelope<T>).
 *   - DELETE returns 204 with no body.
 */

import { Router, Request, Response } from 'express';
import { listAgents, createAgent, deleteAgent } from '../storage/agents';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const workspaceId =
    typeof req.query.workspace_id === 'string' ? req.query.workspace_id : undefined;
  res.json({ data: listAgents(workspaceId), meta: {} });
});

router.post('/', (req: Request, res: Response) => {
  const { name, soul, workspace_id } = (req.body ?? {}) as {
    name?: unknown;
    soul?: unknown;
    workspace_id?: unknown;
  };

  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: { code: 'INVALID_NAME', message: 'name is required' } });
    return;
  }
  if (typeof soul !== 'string' || soul.trim().length === 0) {
    res.status(400).json({ error: { code: 'INVALID_SOUL', message: 'soul is required' } });
    return;
  }

  const ws = typeof workspace_id === 'string' && workspace_id.trim().length > 0
    ? workspace_id.trim()
    : 'default';

  const agent = createAgent(name.trim(), soul.trim(), ws);
  res.status(201).json({ data: agent, meta: {} });
});

router.delete('/:id', (req: Request, res: Response) => {
  const ok = deleteAgent(req.params.id);
  if (!ok) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } });
    return;
  }
  res.status(204).send();
});

export default router;
