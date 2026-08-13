/**
 * runs.ts — GET /api/runs (list) + DELETE /api/runs/:runId
 *
 * Projection endpoints (/runs/:runId/graph, /task-tree, etc.) are now proxied
 * to Python FastAPI backend (shadowflow/api/runs.py) which exposes RuntimeService's
 * export_* methods.
 *
 * Contract (2026-05-10 review B2 — 守 Story 15.1 决议)：返回 raw array `RunRecord[]`，
 * 与前端 `listRuns(): Promise<RunRecord[]>` (src/api/runs.ts:295) 直接对齐。
 *
 * 15.8 dev 早期把响应改成 `{runs, total}` envelope，违反了 15.1 review 的明确决议
 * （runs 走 raw array，agents 走 envelope，skills 走 raw array）。已回退。
 *
 * 历史：15.1 placeholder `[]` → 15.8 envelope（错误）→ 此次修正回到 raw array。
 */

import { Router, Request, Response } from 'express';
import { listRuns, deleteRun } from '../storage/runs';

const router = Router();

// GET /runs → RunRecord[] (raw array, NOT envelope — see contract note above)
router.get('/', (_req: Request, res: Response) => {
  res.json(listRuns());
});

// DELETE /runs/:runId
router.delete('/:runId', (req: Request, res: Response) => {
  const deleted = deleteRun(req.params.runId);
  if (deleted) res.json({ ok: true });
  else res.status(404).json({ error: `Run ${req.params.runId} not found` });
});

// Projection endpoints are now proxied to Python:
// - GET /runs/:runId/graph → shadowflow/api/runs.py:get_run_graph
// - GET /runs/:runId/task-tree → shadowflow/api/runs.py:get_task_tree
// - GET /runs/:runId/artifact-lineage → shadowflow/api/runs.py:get_artifact_lineage
// - GET /runs/:runId/memory-graph → shadowflow/api/runs.py:get_memory_graph
// - GET /runs/:runId/checkpoint-lineage → shadowflow/api/runs.py:get_checkpoint_lineage
// - GET /runs/:runId/training-dataset → shadowflow/api/runs.py:get_training_dataset
//
// The proxy-fallback middleware handles these by forwarding to the Python backend.

export default router;
