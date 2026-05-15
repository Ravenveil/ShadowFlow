/**
 * projects.ts — Story 15.16 — REST API for the Project resource.
 *
 *   GET    /api/projects                    → list (newest first)
 *   POST   /api/projects                    → create  → 201
 *   GET    /api/projects/:id                → fetch   / 404
 *   PATCH  /api/projects/:id                → partial / 404
 *   DELETE /api/projects/:id                → 204     / 404
 *   GET    /api/projects/:id/artifacts      → artifact list from runs table
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
import { getDb } from '../storage/sqlite';

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

/**
 * GET /api/projects/:id/artifacts
 *
 * Returns all runs for the project that produced an artifact (artifact_filename IS NOT NULL).
 * Response shape per item:
 *   artifact_id    — run_id
 *   title          — artifact_filename (basename) or goal as fallback
 *   file_type      — artifact_type ('html'|'md'|'yaml'|'pdf')
 *   generated_at   — completed_at
 *   download_url   — artifact_url (may be null)
 *   preview_url    — same as download_url for html; null otherwise
 *   size_bytes     — null (not stored yet)
 *   run_id         — run_id (for linking to run detail)
 */
router.get('/:id/artifacts', (req: Request, res: Response) => {
  const p = getProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return;
  }

  interface ArtifactRow {
    run_id: string;
    goal: string;
    artifact_type: string | null;
    artifact_filename: string | null;
    artifact_url: string | null;
    completed_at: string;
  }

  const rows = getDb()
    .prepare(
      `SELECT run_id, goal, artifact_type, artifact_filename, artifact_url, completed_at
       FROM runs
       WHERE project_id = ? AND artifact_filename IS NOT NULL
       ORDER BY completed_at DESC`,
    )
    .all(req.params.id) as ArtifactRow[];

  const artifacts = rows.map((r) => {
    const ft = (r.artifact_type ?? 'md').toLowerCase().replace('markdown', 'md');
    const isHtml = ft === 'html';
    return {
      artifact_id: r.run_id,
      title: r.artifact_filename ?? r.goal,
      file_type: ft,
      generated_at: r.completed_at,
      download_url: r.artifact_url ?? null,
      preview_url: isHtml ? (r.artifact_url ?? null) : null,
      size_bytes: null,
      run_id: r.run_id,
    };
  });

  res.json(artifacts);
});

export default router;
