/** Approvals API client — L6 审批工作流接线（2026-08-23）。
 *
 * 后端：shadowflow/api/approvals.py（FastAPI，经 Node 网关 proxyFallback 可达）。
 *   GET  /api/groups/{group_id}/approvals/pending → { items: PendingApprovalItem[] }
 *   POST /api/approvals/{approval_id}/approve     → { status, run_id, gate_id }
 *   POST /api/approvals/{approval_id}/reject      → body { reason? } → { status, run_id, gate_id }
 *   GET  /api/approvals/events                    — SSE 命名事件
 *        approval.pending（新待审批）/ approval.resolved（含 decision / reason）
 *
 * 失败语义与 groupApi 对齐：读端点 !ok → 返回空；写端点 !ok → throw（调用方提示）。
 */

import { getApiBase } from './_base';

export interface PendingApprovalItem {
  approval_id: string;
  run_id: string;
  gate_id: string;
  submitter_name: string;
  submitter_kind: string;
  /** 风险/动作摘要（后端注册时写入，可能为空串） */
  summary: string;
  triggered_at: string;
  waiting_seconds: number;
}

export interface ApprovalDecisionResult {
  status: string;
  run_id: string;
  gate_id: string;
}

/** SSE 事件载荷（_format_sse 的 data JSON，自带 type 字段）。 */
export interface ApprovalStreamEvent {
  type: string;
  approval_id?: string;
  run_id?: string;
  gate_id?: string;
  group_id?: string | null;
  decision?: string;
  reason?: string;
  [key: string]: unknown;
}

export async function listPendingApprovals(groupId: string): Promise<PendingApprovalItem[]> {
  const res = await fetch(
    `${getApiBase()}/api/groups/${encodeURIComponent(groupId)}/approvals/pending`,
  );
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({} as { items?: PendingApprovalItem[] }));
  return (json.items ?? []) as PendingApprovalItem[];
}

export async function approveApproval(approvalId: string): Promise<ApprovalDecisionResult> {
  const res = await fetch(
    `${getApiBase()}/api/approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ApprovalDecisionResult;
}

export async function rejectApproval(
  approvalId: string,
  reason = '',
): Promise<ApprovalDecisionResult> {
  const res = await fetch(
    `${getApiBase()}/api/approvals/${encodeURIComponent(approvalId)}/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ApprovalDecisionResult;
}

/**
 * 订阅审批生命周期 SSE。返回取消函数（close EventSource）。
 * 环境无 EventSource（如 jsdom 测试）时返回 no-op，调用方应回落轮询。
 */
export function subscribeApprovalEvents(
  onEvent: (evt: ApprovalStreamEvent) => void,
): () => void {
  if (typeof EventSource === 'undefined') return () => {};
  const es = new EventSource(`${getApiBase()}/api/approvals/events`);
  const handler = (ev: MessageEvent) => {
    try {
      onEvent(JSON.parse(ev.data) as ApprovalStreamEvent);
    } catch {
      // 非 JSON 帧（心跳等）忽略
    }
  };
  es.addEventListener('approval.pending', handler);
  es.addEventListener('approval.resolved', handler);
  return () => es.close();
}
