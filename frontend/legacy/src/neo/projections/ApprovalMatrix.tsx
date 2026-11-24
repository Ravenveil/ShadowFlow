/**
 * ApprovalMatrix — 编队 pane 一级「封驳矩阵」（2026-11-04 用户反馈批）。
 *
 * 背景：此前审批按钮埋在 GroupMembersPanel 内部第三节（成员网格 → 工作流
 * DAG → 审批门 → 简报），且无待办时只剩一行灰色空态文字，用户根本看不到
 * 「能点的地方」。Grok 式的门控交互应该是一眼可见、一点即决的矩阵。
 *
 * 本组件：
 *   - 常驻矩阵表头（待审批 / 等待 / ✅ 批准 / ❌ 驳回），无待办时也看得到列；
 *   - 每行右侧两个圆形大按钮：✅ 一点即批准，❌ 一点即驳回（reason 留空）；
 *   - 需要附驳回理由时点行内「附理由」展开输入，不阻塞「一键驳回」主路径；
 *   - GET /api/groups/{id}/approvals/pending + SSE approval.pending/resolved
 *     实时刷新（无 EventSource 回落 5s 轮询）；驳回留痕最多 5 条。
 *
 * 数据源与 GroupMembersPanel 同源。NeoHost 编队 pane 挂本组件时给
 * GroupMembersPanel 传 hideApprovals，避免同一群两条 SSE 订阅与重复渲染。
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import {
  approveApproval,
  listPendingApprovals,
  rejectApproval,
  subscribeApprovalEvents,
  type PendingApprovalItem,
} from '../../api/approvals';
import { useI18n } from '../../common/i18n';

export interface ApprovalMatrixProps {
  groupId: string;
}

function waitingText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h`;
}

export function ApprovalMatrix({ groupId }: ApprovalMatrixProps) {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingApprovalItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rejected, setRejected] = useState<
    Array<{ approval_id: string; label: string; reason: string }>
  >([]);

  const refresh = useCallback(() => {
    listPendingApprovals(groupId)
      .then((items) => setPending(items))
      .catch(() => setPending([]));
  }, [groupId]);

  const noteRejected = useCallback(
    (entry: { approval_id: string; label: string; reason: string }) => {
      setRejected((prev) =>
        [entry, ...prev.filter((x) => x.approval_id !== entry.approval_id)].slice(0, 5),
      );
    },
    [],
  );

  useEffect(() => {
    setPending([]);
    setRejected([]);
    setFailed(false);
    setReasonFor(null);
    refresh();
    const hasSse = typeof EventSource !== 'undefined';
    const unsubscribe = subscribeApprovalEvents((evt) => {
      if (!evt.group_id || evt.group_id === groupId) refresh();
      if (
        evt.type === 'approval.resolved' &&
        evt.decision === 'reject' &&
        evt.approval_id &&
        evt.reason
      ) {
        noteRejected({
          approval_id: evt.approval_id,
          label: evt.gate_id ?? '',
          reason: evt.reason,
        });
      }
    });
    const timer = hasSse ? null : window.setInterval(refresh, 5000);
    return () => {
      unsubscribe();
      if (timer !== null) window.clearInterval(timer);
    };
  }, [groupId, refresh, noteRejected]);

  const decide = useCallback(
    async (item: PendingApprovalItem, decision: 'approve' | 'reject', why = '') => {
      setBusy(item.approval_id);
      setFailed(false);
      try {
        if (decision === 'approve') await approveApproval(item.approval_id);
        else await rejectApproval(item.approval_id, why);
        if (decision === 'reject' && why) {
          noteRejected({
            approval_id: item.approval_id,
            label: item.submitter_name || item.gate_id,
            reason: why,
          });
        }
      } catch {
        setFailed(true);
      } finally {
        setBusy(null);
        setReasonFor(null);
        setReason('');
        refresh();
      }
    },
    [refresh, noteRejected],
  );

  return (
    <div className="neo-am" data-testid="neo-approval-matrix">
      <div className="neo-am-head">
        <span className="neo-am-head-icon">
          <ShieldCheck size={13} strokeWidth={1.9} aria-hidden />
        </span>
        <span className="neo-am-title">
          {t('neo.group.approvalMatrix', { defaultValue: '封驳矩阵' })}
        </span>
        <span className="neo-am-count" data-testid="neo-am-count">
          {t('neo.group.approvalPendingCount', {
            defaultValue: '{{count}} 待决',
            count: pending.length,
          })}
        </span>
      </div>

      {/* 矩阵表头常驻：即使没有待办，用户也能看到「批准/驳回」两列在哪 */}
      <div className="neo-am-grid-head" aria-hidden>
        <span className="neo-am-col-item">
          {t('neo.group.approvalColItem', { defaultValue: '待审批事项' })}
        </span>
        <span className="neo-am-col-wait">
          {t('neo.group.approvalColWait', { defaultValue: '等待' })}
        </span>
        <span className="neo-am-col-decide neo-am-col-approve" title={t('neo.group.approvalApprove', { defaultValue: '批准' })}>
          <Check size={13} strokeWidth={2.2} />
        </span>
        <span className="neo-am-col-decide neo-am-col-reject" title={t('neo.group.approvalReject', { defaultValue: '驳回' })}>
          <X size={13} strokeWidth={2.2} />
        </span>
      </div>

      <div className="neo-am-body">
        {pending.length === 0 && rejected.length === 0 ? (
          <div className="neo-am-empty">
            {t('neo.group.approvalEmpty', { defaultValue: '暂无待审批事项' })}
          </div>
        ) : (
          pending.map((item) => (
            <div className="neo-am-row" key={item.approval_id} data-testid="neo-am-row">
              <div className="neo-am-item">
                <div className="neo-am-item-name">{item.submitter_name || item.gate_id}</div>
                {item.summary && (
                  <div className="neo-am-item-summary" title={item.summary}>
                    {item.summary}
                  </div>
                )}
              </div>
              <span className="neo-am-wait">{waitingText(item.waiting_seconds)}</span>
              <button
                type="button"
                className="neo-am-btn neo-am-btn--approve"
                disabled={busy !== null}
                title={t('neo.group.approvalApprove', { defaultValue: '批准' })}
                aria-label={t('neo.group.approvalApprove', { defaultValue: '批准' })}
                data-testid="neo-am-approve"
                onClick={() => void decide(item, 'approve')}
              >
                <Check size={16} strokeWidth={2.4} aria-hidden />
              </button>
              <button
                type="button"
                className="neo-am-btn neo-am-btn--reject"
                disabled={busy !== null}
                title={t('neo.group.approvalReject', { defaultValue: '驳回' })}
                aria-label={t('neo.group.approvalReject', { defaultValue: '驳回' })}
                data-testid="neo-am-reject"
                onClick={() => void decide(item, 'reject')}
              >
                <X size={16} strokeWidth={2.4} aria-hidden />
              </button>
              <button
                type="button"
                className="neo-am-reason-toggle"
                disabled={busy !== null}
                onClick={() => {
                  setReasonFor((cur) => (cur === item.approval_id ? null : item.approval_id));
                  setReason('');
                }}
              >
                {t('neo.group.approvalAddReason', { defaultValue: '附理由驳回' })}
              </button>
              {reasonFor === item.approval_id && (
                <div className="neo-am-reasonbox">
                  <input
                    className="neo-am-reasonbox-input"
                    value={reason}
                    disabled={busy !== null}
                    placeholder={t('neo.group.approvalRejectReasonPlaceholder', {
                      defaultValue: '驳回理由（可选）',
                    })}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void decide(item, 'reject', reason.trim());
                    }}
                  />
                  <button
                    type="button"
                    className="neo-am-reasonbox-submit"
                    disabled={busy !== null}
                    onClick={() => void decide(item, 'reject', reason.trim())}
                  >
                    {t('neo.group.approvalConfirm', { defaultValue: '确认' })}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {rejected.map((r) => (
          <div className="neo-am-rejected" key={r.approval_id}>
            <span className="neo-am-rejected-name">{r.label}</span>
            <span className="neo-am-rejected-tag">
              {t('neo.group.approvalRejectedTag', { defaultValue: '已驳回' })}
            </span>
            <span className="neo-am-rejected-reason" title={r.reason}>
              {r.reason}
            </span>
          </div>
        ))}
        {failed && (
          <div className="neo-am-error">
            {t('neo.group.approvalFailed', { defaultValue: '操作失败，请重试' })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ApprovalMatrix;
