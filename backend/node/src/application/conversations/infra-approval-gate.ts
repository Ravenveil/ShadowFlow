/**
 * approval-gate.ts — chat DAG approve 边的人工审批门（2026-11-05 纪律，2026-11-24 归位）。
 *
 * 从 groups-chat.ts 拆出的审批状态 module：挂起注册表 + 三条决定路径
 *   ① 显式 API：POST /api/groups/:id/approvals/:nodeId { decision, comment? }
 *   ② 会话内自然语言（解析规则在 domains/collaboration/approval-model.ts）
 *   ③ 换轮拒收场（swapDagRun）+ 30 分钟兜底超时
 * 处理器仍是路由薄壳（形状转换 + 400/409 映射），裁定语义都在 approval-model。
 * 处理器导出供回归测试直打（不起真 Express）。
 */
import {
  parseApprovalVerdict,
  type ApprovalVerdict,
} from '../teams/collaboration-models/approval-model';
import { recordAction } from '../../application/connectors/infra-journal';

// 老引用兼容：groups-chat.ts 曾从这里一并 re-export 纯规则，继续给。
export { parseApprovalDecision, parseApprovalVerdict } from '../teams/collaboration-models/approval-model';
export type { ApprovalVerdict } from '../teams/collaboration-models/approval-model.ts';

const pendingApprovals = new Map<string, (v: ApprovalVerdict) => void>();

/** 测试可见：清空审批注册表（groups-chat 路由单测隔离用）。 */
export function clearPendingApprovals(): void {
  pendingApprovals.clear();
}

/** 处理该群下一条用户消息里可能隐含的审批决定。返回是否消费了一条 pending。 */
export function tryResolveApprovalFromText(groupId: string, text: string): boolean {
  const entries = [...pendingApprovals.entries()].filter(([k]) => k.startsWith(`${groupId}:`));
  if (entries.length === 0) return false;
  const verdict = parseApprovalVerdict(text);
  if (!verdict) return false;
  for (const [key, resolve] of entries) {
    pendingApprovals.delete(key);
    try {
      resolve(verdict);
    } catch {
      /* resolver 异常不阻断聊天主链路 */
    }
  }
  return true;
}

/**
 * 注册一次节点审批挂起，返回等决定的 Promise（决定路径①②③的单一注册真源）。
 * deps.approval.request 接线与回归测试共用。外部取消（用户插话换轮/停止生成）
 * 由 swapDagRun 拒收场；这里另挂 30 分钟兜底超时（与 run 超时同量级，避免永久
 * pending 占内存）——超时视作拒绝，审批 promise 永不悬挂。
 */
export function registerPendingApproval(groupId: string, nodeId: string): Promise<ApprovalVerdict> {
  return new Promise<ApprovalVerdict>((resolve) => {
    const key = `${groupId}:${nodeId}`;
    pendingApprovals.set(key, resolve);
    setTimeout(() => {
      if (pendingApprovals.delete(key)) {
        try { resolve({ decision: 'rejected' }); } catch { /* settled */ }
      }
    }, 30 * 60_000).unref?.();
  });
}

// 测试可见:登记本轮 controller 并取消同 group 上一轮,返回本轮 controller。
export function swapDagRun(groupId: string, registry: Map<string, AbortController>): AbortController {
  registry.get(groupId)?.abort();
  // 2026-11-05 审批门 — 换轮即取消上一轮挂起的节点审批（视作拒绝收场）：
  // 用户插话/重发 = 放弃上一轮，审批 promise 不悬挂（executor 侧 blocked 收口）。
  for (const key of [...pendingApprovals.keys()]) {
    if (!key.startsWith(`${groupId}:`)) continue;
    const resolve = pendingApprovals.get(key);
    pendingApprovals.delete(key);
    try { resolve?.({ decision: 'rejected' }); } catch { /* settled */ }
  }
  const ac = new AbortController();
  registry.set(groupId, ac);
  return ac;
}

/**
 * POST /api/groups/:id/approvals/:nodeId — 显式审批决定（2026-11-05，决定路径①）。
 * body: { decision: 'approve' | 'reject', comment?: string }（BE-06：可附审批意见，
 * ≤500 字，落 action journal 留痕 + 响应带回）。
 * 命中挂起 → resolve 执行器 promise（执行器会补系统留痕消息 + plan_card blocked）；
 * 未命中 → 409（已决定/超时/无此挂起）。
 */
export function approvalDecisionHandler(
  req: { params: { id: string; nodeId: string }; body?: unknown },
  res: { status(code: number): { json(body: unknown): void }; json(body: unknown): void },
): void {
  const groupId = req.params.id;
  const nodeId = req.params.nodeId;
  const body = (req.body ?? {}) as { decision?: unknown; comment?: unknown };
  const decision = body.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    res.status(400).json({
      error: { code: 'BAD_DECISION', message: "decision must be 'approve' or 'reject'" },
    });
    return;
  }
  // BE-06 审批意见：显式 API 路径的意见是自由文本，类型/长度校验，不静默截断。
  let comment: string | undefined;
  if (body.comment !== undefined) {
    if (typeof body.comment !== 'string' || body.comment.trim().length > 500) {
      res.status(400).json({
        error: { code: 'BAD_COMMENT', message: 'comment must be a string of at most 500 characters' },
      });
      return;
    }
    const trimmedComment = body.comment.trim();
    if (trimmedComment) comment = trimmedComment;
  }
  const key = `${groupId}:${nodeId}`;
  const resolve = pendingApprovals.get(key);
  if (!resolve) {
    res.status(409).json({
      error: { code: 'NO_PENDING_APPROVAL', message: `no pending approval for node ${nodeId} in group ${groupId}` },
    });
    return;
  }
  pendingApprovals.delete(key);
  // BE-06 留痕：裁定（连同意见）落 action journal，「谁批/拒了什么、说了什么」可回放。
  recordAction({
    tool_name: 'group.approval',
    phase: 'decided',
    decision: decision === 'approve' ? 'approve' : 'deny',
    detail: { group_id: groupId, node_id: nodeId, ...(comment ? { comment } : {}) },
  });
  try {
    resolve({ decision: decision === 'approve' ? 'approved' : 'rejected', ...(comment ? { comment } : {}) });
  } catch { /* resolver 已 settle — 幂等 */ }
  res.json({ group_id: groupId, node_id: nodeId, decision, ...(comment ? { comment } : {}) });
}

/**
 * GET /api/groups/:id/approvals — 当前挂起的人工审批门（2026-11-24，paper 前端用）。
 * 返回 { group_id, pending: string[] }（nodeId 列表）；空数组 = 无挂起。
 * 只读注册表，不做任何裁定 —— 形状转换，业务判定都在执行器与 approval-model。
 */
export function pendingApprovalsHandler(
  req: { params: { id: string } },
  res: { json(body: unknown): void },
): void {
  const groupId = req.params.id;
  const pending = [...pendingApprovals.keys()]
    .filter((k) => k.startsWith(`${groupId}:`))
    .map((k) => k.slice(groupId.length + 1));
  res.json({ group_id: groupId, pending });
}
