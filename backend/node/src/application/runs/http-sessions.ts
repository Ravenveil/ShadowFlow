/**
 * routes/runs/sessions.ts — 单后端迁移：Sessions API（Story 11.5）
 *
 * 移植自 python backend/python/shadowflow/api/runs/sessions.py +
 * runtime/workspace_context.py。四个端点：
 *
 *   GET    /:session_id/context   — 工作区上下文（含 recent_steps / checkpoint_summaries）
 *   DELETE /:session_id/context   — 清空上下文（restart）→ {deleted:true, session_id}
 *   GET    /:session_id/report    — 结构化复现报告（LRU 缓存 miss → in_progress / 404）
 *   POST   /:session_id/checkpoint — 手动检查点（中文默认文案照抄）
 *
 * 存储同构：Python WorkspaceContextStore 是进程内 dict（TTL 24h），Node 侧用
 * Map + 时间戳同语义；report 缓存同 LRU（容量 1000）。单后端下 single 模式
 * 不再起 Python 进程，进程内存即唯一真源，legacy 模式下 Python 侧不可达，
 * 两侧无共享文件可迁移。
 *
 * 错误体照抄 Python HTTPException detail 纯字符串（顶层 {detail}）：
 *   404 "Session context not found" / "Session not found"
 */

import { Router, Request, Response } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// WorkspaceContextStore — python workspace_context.py 同构（进程内存 + TTL）
// ---------------------------------------------------------------------------

export interface TaskStep {
  index: number;
  description: string;
  tool_called: string;
  /** truncated to 2000 chars */
  result_summary: string;
  status: 'done' | 'failed' | 'recovered';
  /** ISO-8601 */
  timestamp: string;
}

export interface CheckpointSummary {
  segment_index: number;
  steps_in_segment: number;
  /** ≤200 chars */
  summary: string;
  created_at: string;
}

export interface AgentWorkspaceContext {
  agent_id: string;
  session_id: string;
  task_description: string;
  working_dir: string;
  completed_steps: TaskStep[];
  environment: Record<string, string>;
  checkpoint_summaries: CheckpointSummary[];
  /** ISO-8601 */
  last_updated: string;
  current_error_attempts: number;
}

/** Python _TTL = 86400 s（24 h）。 */
const CONTEXT_TTL_MS = 86_400_000;

interface ContextEntry {
  ctx: AgentWorkspaceContext;
  expiresAt: number;
}

const store = new Map<string, ContextEntry>();

function storeKey(agentId: string, sessionId: string): string {
  return `${agentId}:${sessionId}`;
}

function ctxSave(ctx: AgentWorkspaceContext): void {
  store.set(storeKey(ctx.agent_id, ctx.session_id), {
    ctx,
    expiresAt: Date.now() + CONTEXT_TTL_MS,
  });
}

function ctxLoad(agentId: string, sessionId: string): AgentWorkspaceContext | null {
  const key = storeKey(agentId, sessionId);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.ctx;
}

function ctxDelete(agentId: string, sessionId: string): boolean {
  return store.delete(storeKey(agentId, sessionId));
}

/** 测试辅助：清空 store（不跨文件导出污染）。 */
export function _resetForTests(): void {
  store.clear();
  reportCache.clear();
}

/**
 * 测试辅助：直接注入一份上下文（Python 侧 ctx 由运行时 run_agent_with_tools
 * 写入，无 HTTP 创建路径；测试同构注入）。
 */
export function _seedForTests(ctx: AgentWorkspaceContext): void {
  ctxSave(ctx);
}

// ---------------------------------------------------------------------------
// Report LRU 缓存（sessions.py _report_cache 同构：容量 1000，LRU 驱逐）
// ---------------------------------------------------------------------------

const REPORT_CACHE_MAX_SIZE = 1000;
const reportCache = new Map<string, unknown>();

/** 供未来 TaskReport 生产方调用（Python 同名 set_report 对齐）。 */
export function setReport(agentId: string, sessionId: string, report: unknown): void {
  const key = `${agentId}:${sessionId}`;
  reportCache.delete(key);
  reportCache.set(key, report);
  while (reportCache.size > REPORT_CACHE_MAX_SIZE) {
    const oldest = reportCache.keys().next().value;
    if (oldest === undefined) break;
    reportCache.delete(oldest);
  }
}

function getReport(agentId: string, sessionId: string): unknown {
  return reportCache.get(`${agentId}:${sessionId}`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function utcNowIso(): string {
  return new Date().toISOString();
}

/** HTTPException(status_code=404, detail="...") 的 JSON 等价体（顶层 {detail}）。 */
function failDetail(res: Response, status: number, detail: string): void {
  res.status(status).json({ detail });
}

// ---------------------------------------------------------------------------
// Endpoints（与 python 同一路由形状；挂载 prefix 由 index.ts 收口为 /api/sessions）
// ---------------------------------------------------------------------------

// GET /:session_id/context?agent_id= — 获取工作区上下文
router.get('/:session_id/context', (req: Request, res: Response) => {
  const sessionId = req.params.session_id;
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : '';
  if (!agentId) {
    // FastAPI：缺必填 query 参数 → 422
    failDetail(res, 422, 'Field required: agent_id');
    return;
  }
  const ctx = ctxLoad(agentId, sessionId);
  if (!ctx) {
    failDetail(res, 404, 'Session context not found');
    return;
  }
  res.json({
    agent_id: ctx.agent_id,
    session_id: ctx.session_id,
    task_description: ctx.task_description,
    working_dir: ctx.working_dir,
    steps_taken: ctx.completed_steps.length,
    segments: ctx.checkpoint_summaries.length,
    last_updated: ctx.last_updated,
    recent_steps: ctx.completed_steps.slice(-10).map((s) => ({
      index: s.index,
      tool_called: s.tool_called,
      description: s.description,
      result_summary: s.result_summary.slice(0, 300),
      status: s.status,
    })),
    checkpoint_summaries: ctx.checkpoint_summaries.map((c) => ({
      segment_index: c.segment_index,
      summary: c.summary,
      steps: c.steps_in_segment,
    })),
  });
});

// DELETE /:session_id/context?agent_id= — 清空工作区上下文，从头开始
router.delete('/:session_id/context', (req: Request, res: Response) => {
  const sessionId = req.params.session_id;
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : '';
  if (!agentId) {
    failDetail(res, 422, 'Field required: agent_id');
    return;
  }
  const deleted = ctxDelete(agentId, sessionId);
  if (!deleted) {
    failDetail(res, 404, 'Session context not found');
    return;
  }
  res.json({ deleted: true, session_id: sessionId });
});

// GET /:session_id/report?agent_id= — 获取结构化复现报告
router.get('/:session_id/report', (req: Request, res: Response) => {
  const sessionId = req.params.session_id;
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : '';
  if (!agentId) {
    failDetail(res, 422, 'Field required: agent_id');
    return;
  }
  const report = getReport(agentId, sessionId);
  if (report === undefined || report === null) {
    // Check if context exists (task in progress)
    const ctx = ctxLoad(agentId, sessionId);
    if (!ctx) {
      failDetail(res, 404, 'Session not found');
      return;
    }
    res.json({
      status: 'in_progress',
      steps_taken: ctx.completed_steps.length,
      segments: ctx.checkpoint_summaries.length,
    });
    return;
  }
  res.json(report);
});

// POST /:session_id/checkpoint — 手动创建检查点
router.post('/:session_id/checkpoint', (req: Request, res: Response) => {
  const sessionId = req.params.session_id;
  const body = (req.body ?? {}) as { agent_id?: unknown; summary?: unknown };
  const agentId = typeof body.agent_id === 'string' ? body.agent_id : '';
  if (!agentId) {
    // FastAPI：缺必填 body 字段 → 422
    failDetail(res, 422, 'Field required: agent_id');
    return;
  }
  const ctx = ctxLoad(agentId, sessionId);
  if (!ctx) {
    failDetail(res, 404, 'Session context not found');
    return;
  }
  const segmentIdx = ctx.checkpoint_summaries.length;
  const summary =
    (typeof body.summary === 'string' && body.summary) ||
    `手动检查点 — 段 ${segmentIdx + 1}，共 ${ctx.completed_steps.length} 步`;
  // add_checkpoint_summary 同构：steps_in_segment = 总步数 - 之前段已计入步数
  let stepsInSegment = ctx.completed_steps.length;
  if (ctx.checkpoint_summaries.length > 0) {
    stepsInSegment -= ctx.checkpoint_summaries.reduce((acc, c) => acc + c.steps_in_segment, 0);
  }
  stepsInSegment = Math.max(0, stepsInSegment);
  ctx.checkpoint_summaries.push({
    segment_index: segmentIdx,
    steps_in_segment: stepsInSegment,
    summary: summary.slice(0, 200),
    created_at: utcNowIso(),
  });
  ctx.last_updated = utcNowIso();
  ctxSave(ctx);
  res.json({
    checkpoint_index: segmentIdx,
    summary,
    steps_taken: ctx.completed_steps.length,
  });
});

export default router;
