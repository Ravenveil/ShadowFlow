/**
 * runs.ts — GET /api/runs (list) + projection placeholders
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
import { listRuns } from '../storage/runs';

const router = Router();

// GET /runs → RunRecord[] (raw array, NOT envelope — see contract note above)
router.get('/', (_req: Request, res: Response) => {
  res.json(listRuns());
});

// GET /runs/:runId → placeholder 404 with JSON body
router.get('/:runId', (req: Request, res: Response) => {
  res.status(404).json({ error: `Run ${req.params.runId} not found` });
});

// GET /runs/:runId/graph
router.get('/:runId/graph', (req: Request, res: Response) => {
  res.status(404).json({ error: `Run ${req.params.runId} not found` });
});

// GET /runs/:runId/task-tree
router.get('/:runId/task-tree', (req: Request, res: Response) => {
  res.status(404).json({ error: `Run ${req.params.runId} not found` });
});

// GET /runs/:runId/artifact-lineage
router.get('/:runId/artifact-lineage', (req: Request, res: Response) => {
  res.status(404).json({ error: `Run ${req.params.runId} not found` });
});

// GET /runs/:runId/memory-graph
router.get('/:runId/memory-graph', (req: Request, res: Response) => {
  res.status(404).json({ error: `Run ${req.params.runId} not found` });
});

// GET /runs/:runId/checkpoint-lineage
router.get('/:runId/checkpoint-lineage', (req: Request, res: Response) => {
  res.status(404).json({ error: `Run ${req.params.runId} not found` });
});

// GET /runs/:runId/training-dataset
router.get('/:runId/training-dataset', (req: Request, res: Response) => {
  res.status(404).json({ error: `Run ${req.params.runId} not found` });
});

export default router;
