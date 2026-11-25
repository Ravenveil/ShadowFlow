/**
 * approvals.ts — 审批域端点（单后端迁移第三批）。
 *
 * 移植自 Python 两模块，响应信封/状态码逐字段对齐：
 *   1. shadowflow/api/runs/approvals.py（Story 7.7 Inbox ApprovalGatePanel）：
 *        GET  /api/approvals/events                     — SSE 审批生命周期流
 *        GET  /api/groups/{group_id}/approvals/pending  — { items: [] }
 *        POST /api/approvals/{approval_id}/approve      — {status, run_id, gate_id}
 *        POST /api/approvals/{approval_id}/reject       — 同上（reason 走 body）
 *   2. shadowflow/api/dashboard/ops.py 的 GET /approvals/pending（无 /api 前缀，
 *      ops router 无前缀挂载）——裸 List[PendingApproval]。
 *
 * 数据源桥接（Python 的 RuntimeService 在 Node 不存在；Node 现成审批门是
 * lib/tool-approval.ts 的 run-sessions 权限门 toolApprovals，复用）：
 *   approval_id ↔ request_id、run_id ↔ session_id、gate_id ↔ tool_name。
 *   submitter_name/summary 无对应记录 → 回退 gate_id / ''（Python rec.get 兜底同形）。
 *
 * SSE 语义对齐（runtime/approval/service.py make_event_stream）：
 *   - 轮询 1s，先发帧后 sleep；diff 出 approval.pending / approval.resolved，
 *     resolved 携带 decision/reason（Python decision_rec.get('decision','') 同形——
 *     经 run-sessions 权限端点决策的帧 decision 为 ''，经本 router 决策的带值）。
 *   - run.started / run.completed 不发：Node 侧本 router 无 run store 接入；
 *     Python svc 为 None 时同样整块跳过——行为等价（遗留：run 事件归后续批次）。
 *   - _redact_sse_payload 未移植：payload 只含 tool_name/request_id，无密钥面。
 *
 * 500 分支（RuntimeUnavailableError / RejectionChainError）在 Node 不可达：
 * toolApprovals 进程单例恒存在，无需运行时可用性检查。
 *
 * ops 形状的 waiting_seconds 硬编码 0（Python ops.py:216 同款——其 15min TTL
 * 缓存本就让该值无意义；审批面板语义的活值走 /api/approvals/events）。
 *
 * 挂载：app.use('/', approvalsRouter)——覆盖 /api/approvals 前缀端点、
 * /api/groups/{gid}/approvals/pending 与裸 /approvals/pending 三种形状；
 * index.ts 统一收口。
 */

import { Router, type Request, type Response } from 'express';import { toolApprovals } from '../../application/runtime/tool-approval';

const router = Router();

// ─── 决策记录：SSE resolved 帧的 decision/reason 来源 ────────────────────────
// 只覆盖经本 router 的 approve/reject；run-sessions 端点的决策不经过这里，
// resolved 帧回空串（Python decision_rec.get('decision','') 同形）。有界增长。

const resolvedDecisions = new Map<string, { decision: string; reason: string }>();

function recordDecision(approvalId: string, decision: 'approved' | 'rejected', reason: string): void {
  resolvedDecisions.set(approvalId, { decision, reason });
  if (resolvedDecisions.size > 500) {
    const oldest = resolvedDecisions.keys().next();
    if (!oldest.done) resolvedDecisions.delete(oldest.value);
  }
}

const waitingSeconds = (requestedAtMs: number, nowMs: number): number =>
  Math.max(0, Math.trunc((nowMs - requestedAtMs) / 1000));

// ─── GET /api/approvals/events — SSE ──────────────────────────────────────────

const APPROVAL_POLL_MS = 1000;

router.get('/api/approvals/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.on('error', () => {});
  const write = (s: string) => {
    try {
      res.write(s);
    } catch {
      /* 客户端已断开 */
    }
  };
  const fmt = (event: string, payload: Record<string, unknown>): string =>
    `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  interface PendingSnap {
    run_id: string;
    gate_id: string;
    requested_at: number;
  }
  let known = new Map<string, PendingSnap>();
  let seq = 0;

  const poll = (): void => {
    const now = Date.now();
    const current = new Map<string, PendingSnap>(
      toolApprovals.listPending().map((p) => [
        p.request_id,
        { run_id: p.session_id, gate_id: p.tool_name, requested_at: p.requested_at },
      ]),
    );

    for (const [aid, snap] of current) {
      if (known.has(aid)) continue;
      write(
        fmt('approval.pending', {
          type: 'approval.pending',
          approval_id: aid,
          run_id: snap.run_id,
          gate_id: snap.gate_id,
          group_id: null, // Node 无 run↔group 映射（Python 端也常为 None）
          submitter_name: snap.gate_id, // rec.get('submitter_name', node_id) 兜底同形
          submitter_kind: 'acp',
          summary: '',
          triggered_at: new Date(snap.requested_at).toISOString(),
          waiting_seconds: waitingSeconds(snap.requested_at, now),
          seq: seq++,
        }),
      );
    }
    for (const [aid, snap] of known) {
      if (current.has(aid)) continue;
      const dec = resolvedDecisions.get(aid) ?? { decision: '', reason: '' };
      resolvedDecisions.delete(aid); // resolved 后不再需要
      write(
        fmt('approval.resolved', {
          type: 'approval.resolved',
          approval_id: aid,
          run_id: snap.run_id,
          gate_id: snap.gate_id,
          group_id: null,
          decision: dec.decision,
          reason: dec.reason,
          seq: seq++,
        }),
      );
    }
    known = current;
  };

  poll(); // Python 循环先干活后 sleep —— 连接即出首批
  const timer = setInterval(poll, APPROVAL_POLL_MS);
  req.on('close', () => clearInterval(timer));
});

// ─── GET /api/groups/{group_id}/approvals/pending ─────────────────────────────
// Python svc 为 None 时返回 []（run↔group 映射在 Node 数据模型同样缺失）——
// 恒 { items: [] }，与 service.list_pending_for_group 的降级行为逐字段一致。

router.get('/api/groups/:group_id/approvals/pending', (_req: Request, res: Response) => {
  res.json({ items: [] });
});

// ─── GET /approvals/pending — ops 形状（无 /api 前缀，裸 List） ────────────────

router.get('/approvals/pending', (_req: Request, res: Response) => {
  const items = toolApprovals.listPending().map((p) => ({
    run_id: p.session_id,
    template: '',
    sender: '',
    receiver: p.tool_name,
    policy_name: 'default',
    field: '',
    waiting_seconds: 0, // ops.py:216 硬编码 0（TTL 缓存语义）
    assignee: '',
  }));
  res.json(items);
});

// ─── POST /api/approvals/{approval_id}/approve ────────────────────────────────

router.post('/api/approvals/:approval_id/approve', (req: Request, res: Response) => {
  const approvalId = req.params.approval_id;
  const pending = toolApprovals.listPending().find((p) => p.request_id === approvalId);
  if (!pending) {
    // Python: registry 命中但 evt 已 set → "already resolved"；记录不存在 →
    // "not found"。Node 侧以 resolvedDecisions（SSE 未消费的近期决议）复刻窗口。
    res.status(404).json({
      detail: resolvedDecisions.has(approvalId)
        ? `Approval not found or already resolved: ${approvalId}`
        : `Approval not found: ${approvalId}`,
    });
    return;
  }
  if (!toolApprovals.decide(approvalId, 'approve')) {
    // find 与 decide 之间被并发决议
    res.status(404).json({ detail: `Approval not found or already resolved: ${approvalId}` });
    return;
  }
  recordDecision(approvalId, 'approved', '');
  res.json({ status: 'approved', run_id: pending.session_id, gate_id: pending.tool_name });
});

// ─── POST /api/approvals/{approval_id}/reject ─────────────────────────────────

router.post('/api/approvals/:approval_id/reject', (req: Request, res: Response) => {
  const approvalId = req.params.approval_id;
  // Python body: RejectRequest（必填 body）——缺 JSON 体 → pydantic 422。
  if (req.body === undefined) {
    res.status(422).json({ detail: [{ loc: ['body'], msg: 'field required', type: 'value_error.missing' }] });
    return;
  }
  const body = req.body as { reason?: unknown };
  // RejectRequest.reason: Optional[str] = ""——非字符串 → 422（pydantic 类型错）。
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
    res.status(422).json({
      detail: [{ loc: ['body', 'reason'], msg: 'value is not a valid string', type: 'type_error.str' }],
    });
    return;
  }
  const pending = toolApprovals.listPending().find((p) => p.request_id === approvalId);
  if (!pending) {
    res.status(404).json({
      detail: resolvedDecisions.has(approvalId)
        ? `Approval not found or already resolved: ${approvalId}`
        : `Approval not found: ${approvalId}`,
    });
    return;
  }
  // Python service.reject: reason = (reason or '').strip()
  const reason = (typeof body.reason === 'string' ? body.reason : '').trim();
  if (!toolApprovals.decide(approvalId, 'deny', reason)) {
    res.status(404).json({ detail: `Approval not found or already resolved: ${approvalId}` });
    return;
  }
  recordDecision(approvalId, 'rejected', reason);
  res.json({ status: 'rejected', run_id: pending.session_id, gate_id: pending.tool_name });
});

export default router;
