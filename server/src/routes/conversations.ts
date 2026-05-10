/**
 * conversations.ts — Story 15.16 — REST API for Conversation + Message.
 *
 *   GET  /api/projects/:pid/conversations          → list (newest first)
 *   POST /api/projects/:pid/conversations          → create → 201 (404 if project missing)
 *   GET  /api/conversations/:cid/messages          → list ASC by created_at
 *   POST /api/conversations/:cid/messages          → append → 201 (404 if convo missing)
 *
 * Two routers are exported because the routes live under different mount
 * points. index.ts mounts them at /api/projects and /api/conversations.
 */

import { Router, Request, Response } from 'express';
import {
  appendMessage,
  createConversation,
  getConversation,
  listConversations,
  listMessages,
} from '../storage/conversations';
import { getProject } from '../storage/projects';

// Mounted at /api/projects — handles per-project conversation listing/creation.
export const projectScopedConversationsRouter = Router({ mergeParams: true });

projectScopedConversationsRouter.get(
  '/:pid/conversations',
  (req: Request, res: Response) => {
    if (!getProject(req.params.pid)) {
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
      return;
    }
    res.json(listConversations(req.params.pid));
  },
);

projectScopedConversationsRouter.post(
  '/:pid/conversations',
  (req: Request, res: Response) => {
    if (!getProject(req.params.pid)) {
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
      return;
    }
    const body = (req.body ?? {}) as { title?: unknown };
    const title =
      typeof body.title === 'string' && body.title.trim().length > 0
        ? body.title.trim()
        : undefined;
    const c = createConversation(req.params.pid, title);
    res.status(201).json(c);
  },
);

// Mounted at /api/conversations — message endpoints keyed on conversation_id.
const router = Router();

router.get('/:cid/messages', (req: Request, res: Response) => {
  if (!getConversation(req.params.cid)) {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    return;
  }
  res.json(listMessages(req.params.cid));
});

router.post('/:cid/messages', (req: Request, res: Response) => {
  if (!getConversation(req.params.cid)) {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    return;
  }
  const body = (req.body ?? {}) as {
    role?: unknown;
    content?: unknown;
    run_id?: unknown;
  };
  if (
    body.role !== 'user' &&
    body.role !== 'assistant' &&
    body.role !== 'system'
  ) {
    res.status(400).json({
      error: { code: 'INVALID_ROLE', message: 'role must be user|assistant|system' },
    });
    return;
  }
  if (typeof body.content !== 'string' || body.content.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_CONTENT', message: 'content is required' },
    });
    return;
  }
  const m = appendMessage(req.params.cid, {
    role: body.role,
    content: body.content,
    run_id: typeof body.run_id === 'string' ? body.run_id : null,
  });
  res.status(201).json(m);
});

export default router;
