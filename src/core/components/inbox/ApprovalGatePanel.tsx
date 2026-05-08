/** ApprovalGatePanel — APPROVAL GATE section in PreviewPane (Story 7.7 AC1-AC4). */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PendingApproval } from '../../../common/types/inbox';
import { fetchPendingApprovals, approveApproval, rejectApproval } from '../../../api/approvalApi';
import { getApiBase } from '../../../api/_base';
import { useInboxStore } from '../../store/useInboxStore';
import { ApprovalItem } from './ApprovalItem';

interface Props {
  groupId: string;
}

interface ToastMsg {
  id: string;
  text: string;
  ok: boolean;
}

const MAX_VISIBLE = 5;
const SSE_INITIAL_DELAY = 1000;
const SSE_MAX_DELAY = 30000;

export function ApprovalGatePanel({ groupId }: Props) {
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const updateGroupMetrics = useInboxStore((s) => s.updateGroupMetrics);
  const updateActiveRuns = useInboxStore((s) => s.updateActiveRuns);

  // Mounted guard — prevents setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Sort items FIFO (oldest first) helper
  const sortedByFifo = (list: PendingApproval[]): PendingApproval[] =>
    [...list].sort(
      (a, b) => new Date(a.triggered_at).getTime() - new Date(b.triggered_at).getTime()
    );

  // Sync pending count to group metrics whenever items change
  useEffect(() => {
    updateGroupMetrics(groupId, { pendingApprovalsCount: items.length });
  }, [items.length, groupId, updateGroupMetrics]);

  // Load initial pending list
  useEffect(() => {
    fetchPendingApprovals(groupId)
      .then((data) => {
        if (mountedRef.current) setItems(sortedByFifo(data));
      })
      .catch(() => {
        if (mountedRef.current) setItems([]);
      });
  }, [groupId]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((text: string, ok: boolean) => {
    setToast({ id: Date.now().toString(), text, ok });
  }, []);

  // SSE subscription with exponential-backoff reconnect
  useEffect(() => {
    let es: EventSource | null = null;
    let retryDelay = SSE_INITIAL_DELAY;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource(`${getApiBase()}/api/approvals/events`);

      es.addEventListener('approval.pending', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as PendingApproval & { group_id?: string | null };
          // Filter events for other groups
          if (data.group_id != null && data.group_id !== groupId) return;
          if (!mountedRef.current) return;
          setItems((prev) => {
            if (prev.some((x) => x.approval_id === data.approval_id)) return prev;
            return sortedByFifo([...prev, data]);
          });
        } catch {
          // ignore malformed event
        }
      });

      es.addEventListener('approval.resolved', (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data) as { approval_id: string; group_id?: string | null };
          if (parsed.group_id != null && parsed.group_id !== groupId) return;
          if (!mountedRef.current) return;
          setItems((prev) => prev.filter((x) => x.approval_id !== parsed.approval_id));
        } catch {
          // ignore
        }
      });

      es.addEventListener('run.started', (e: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data) as { run_id: string; group_id?: string | null };
          if (data.group_id != null && data.group_id !== groupId) return;
          updateActiveRuns(groupId, 1);
        } catch { /* ignore malformed event */ }
      });

      es.addEventListener('run.completed', (e: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data) as { run_id: string; group_id?: string | null };
          if (data.group_id != null && data.group_id !== groupId) return;
          updateActiveRuns(groupId, -1);
        } catch { /* ignore malformed event */ }
      });

      es.onerror = () => {
        es?.close();
        if (!mountedRef.current) return;
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, SSE_MAX_DELAY);
          connect();
        }, retryDelay);
      };

      es.onopen = () => {
        // Reset backoff on successful connection
        retryDelay = SSE_INITIAL_DELAY;
      };
    }

    connect();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [groupId, updateActiveRuns]);

  const handleApprove = useCallback(
    async (approvalId: string) => {
      if (!mountedRef.current) return;
      setApprovingId(approvalId);
      try {
        await approveApproval(approvalId);
        if (mountedRef.current) {
          showToast('✓ 已通过审批', true);
          setItems((prev) => prev.filter((x) => x.approval_id !== approvalId));
        }
      } catch (err) {
        if (mountedRef.current) {
          showToast(`✗ 操作失败：${err instanceof Error ? err.message : '未知错误'}`, false);
        }
      } finally {
        if (mountedRef.current) setApprovingId(null);
      }
    },
    [showToast]
  );

  const handleReject = useCallback(
    async (approvalId: string, reason: string) => {
      if (!mountedRef.current) return;
      setRejectingId(approvalId);
      try {
        await rejectApproval(approvalId, reason);
        if (mountedRef.current) {
          showToast('✓ 已驳回', true);
          setItems((prev) => prev.filter((x) => x.approval_id !== approvalId));
        }
      } catch (err) {
        if (mountedRef.current) {
          showToast(`✗ 操作失败：${err instanceof Error ? err.message : '未知错误'}`, false);
        }
        throw err; // re-throw so ApprovalItem keeps dialog open
      } finally {
        if (mountedRef.current) setRejectingId(null);
      }
    },
    [showToast]
  );

  const visibleItems = items.slice(0, MAX_VISIBLE);
  const overflowCount = items.length - MAX_VISIBLE;
  const firstOverflow = items[MAX_VISIBLE]; // first item beyond visible window

  return (
    <section
      data-testid="approval-gate-panel"
      className="rounded-sf border border-shadowflow-accent/40 bg-shadowflow-surface px-6 py-6"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-shadowflow-accent">
          APPROVAL GATE
        </p>
        {items.length > 0 && (
          <span className="rounded-full bg-[#F59E0B]/20 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
            {items.length} pending
          </span>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`mt-3 rounded-[6px] px-3 py-2 text-xs ${
            toast.ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Content */}
      {items.length === 0 ? (
        <p className="mt-4 text-xs text-green-400">✓ 无待处理审批</p>
      ) : (
        <div className="mt-4 space-y-2">
          {visibleItems.map((item) => (
            <ApprovalItem
              key={item.approval_id}
              approval={item}
              onApprove={handleApprove}
              onReject={handleReject}
              approving={approvingId === item.approval_id}
              rejecting={rejectingId === item.approval_id}
            />
          ))}

          {overflowCount > 0 && firstOverflow && (
            <a
              href={`/runs/${encodeURIComponent(firstOverflow.run_id)}#approval-${firstOverflow.gate_id}`}
              className="mt-1 block text-right text-xs text-shadowflow-accent hover:underline"
            >
              + {overflowCount} more →
            </a>
          )}
        </div>
      )}
    </section>
  );
}
