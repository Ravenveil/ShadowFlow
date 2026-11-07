/**
 * routes/system/actions.ts — 行动留痕查询端点（2026-11-07，OpenBot 对齐批）。
 *
 *   GET /api/actions?limit=&session_id=&tool_name=&phase=
 *     → { entries: ActionJournalEntry[] }（新→旧）
 *
 * 「执行后留痕」的读侧：配合 tool-approval 的 permission_check 事件流，
 * 构成 OpenBot 式「每个动作决策为命名事件、结果可回放」的完整闭环。
 */

import { Router, type Request, type Response } from 'express';
import { listActions, type ActionPhase } from '../../lib/action-journal';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const limitRaw = Number(q.limit);
  const phase = q.phase === 'decided' || q.phase === 'recorded' ? (q.phase as ActionPhase) : undefined;
  try {
    const entries = listActions({
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      sessionId: typeof q.session_id === 'string' && q.session_id ? q.session_id : undefined,
      toolName: typeof q.tool_name === 'string' && q.tool_name ? q.tool_name : undefined,
      phase,
    });
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'list failed', message: (err as Error).message });
  }
});

export default router;
