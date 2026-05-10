/**
 * projects.ts — Story 15.16 — REST API for the Project resource.
 *
 *   GET    /api/projects             → list (newest first)
 *   POST   /api/projects             → create  → 201
 *   GET    /api/projects/:id         → fetch   / 404
 *   PATCH  /api/projects/:id         → partial / 404
 *   DELETE /api/projects/:id         → 204     / 404
 *
 * Response shape mirrors the storage record verbatim — no envelope, no
 * camel/snake translation. Frontend can reflect the row directly.
 */

import { Router, Request, Response } from 'express';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../storage/projects';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(listProjects());
});

router.post('/', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    name?: unknown;
    workspace_path?: unknown;
    skill_id?: unknown;
    design_system_id?: unknown;
  };
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_NAME', message: 'name is required' } });
    return;
  }
  const project = createProject({
    name: body.name.trim(),
    workspace_path:
      typeof body.workspace_path === 'string' && body.workspace_path.trim().length > 0
        ? body.workspace_path.trim()
        : undefined,
    skill_id: typeof body.skill_id === 'string' ? body.skill_id : null,
    design_system_id:
      typeof body.design_system_id === 'string' ? body.design_system_id : null,
  });
  res.status(201).json(project);
});

router.get('/:id', (req: Request, res: Response) => {
  const p = getProject(req.params.id);
  if (!p) {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return;
  }
  res.json(p);
});

router.patch('/:id', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Parameters<typeof updateProject>[1] = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (typeof body.workspace_path === 'string')
    patch.workspace_path = body.workspace_path.trim();
  if ('skill_id' in body)
    patch.skill_id = typeof body.skill_id === 'string' ? body.skill_id : null;
  if ('design_system_id' in body)
    patch.design_system_id =
      typeof body.design_system_id === 'string' ? body.design_system_id : null;

  const updated = updateProject(req.params.id, patch);
  if (!updated) {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return;
  }
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const ok = deleteProject(req.params.id);
  if (!ok) {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return;
  }
  res.status(204).send();
});

export default router;
