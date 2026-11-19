/**
 * routes/memory/memory-state.ts — 单后端迁移：三层记忆摘要端点（Story 9.4 stub）。
 *
 * 移植自 python shadowflow/api/memory/memory.py :182-193：
 *   GET /state/{agent_id} → {data:{agent_id, working/episodic/semantic}, meta:{note}}
 *
 * Python 侧为纯 stub（不校验 agent_id、不读任何存储，恒定空骨架）——
 * Node 侧同构：任何 agent_id 原样回显，三层 {summary:null, item_count:0}。
 * 挂载：app.use('/api/memory', memoryStateRouter) → /api/memory/state/:agent_id。
 * 注意与 routes/agents/agent-state.ts（裸 /state 前缀，真实状态服务）互不相干。
 */

import { Router, Request, Response } from 'express';

const router = Router();

router.get('/state/:agent_id', (req: Request, res: Response) => {
  const { agent_id: agentId } = req.params;
  res.json({
    data: {
      agent_id: agentId,
      working: { summary: null, item_count: 0 },
      episodic: { summary: null, item_count: 0 },
      semantic: { summary: null, item_count: 0 },
    },
    meta: { note: 'stub — full implementation in Story 9.4' },
  });
});

export default router;
