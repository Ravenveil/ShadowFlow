/** ApprovalItem — individual pending approval row (Story 7.7 AC2/AC3). */

import { useRef, useState, useEffect } from 'react';
import type { PendingApproval } from '../../../common/types/inbox';

interface Props {
  approval: PendingApproval;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => Promise<void>;
  approving: boolean;
  rejecting: boolean;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const KIND_LABELS: Record<string, string> = {
  acp: 'ACP',
  cli: 'CLI',
  mcp: 'MCP',
  local: 'LOCAL',
};

export function ApprovalItem({ approval, onApprove, onReject, approving, rejecting }: Props) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isWaiting = approval.waiting_seconds > 300;
  const loading = approving || rejecting;

  // Close reject dialog on outside click
  useEffect(() => {
    if (!showRejectDialog) return;
    function handleClick(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setShowRejectDialog(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showRejectDialog]);

  // Keyboard Escape closes reject dialog
  useEffect(() => {
    if (!showRejectDialog) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowRejectDialog(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showRejectDialog]);

  // Auto-focus textarea when dialog opens
  useEffect(() => {
    if (showRejectDialog) {
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [showRejectDialog]);

  const initial = approval.submitter_name.charAt(0).toUpperCase();
  const kindLabel = KIND_LABELS[approval.submitter_kind] ?? approval.submitter_kind.toUpperCase();
  const summary = approval.summary.length > 120 ? approval.summary.slice(0, 117) + '…' : approval.summary;

  const handleConfirmReject = async () => {
    setSubmitting(true);
    try {
      await onReject(approval.approval_id, rejectReason);
      // Only close dialog on success
      setShowRejectDialog(false);
      setRejectReason('');
    } catch {
      // Keep dialog open with reason preserved so user can retry
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative rounded-[6px] border border-white/8 bg-shadowflow-bg/50 px-3 py-3">
      {/* Header row: avatar + name + kind badge + wait time */}
      <div className="flex items-center gap-2">
        {/* Avatar */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-shadowflow-accent/25 font-mono text-[10px] font-bold text-shadowflow-accent">
          {initial}
        </div>

        {/* Name */}
        <span className="truncate text-xs font-bold text-white">{approval.submitter_name}</span>

        {/* Kind badge */}
        <span className="rounded-[4px] border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[9px] text-white/50">
          {kindLabel}
        </span>

        {/* Wait time */}
        <span
          className={`ml-auto shrink-0 text-[10px] font-mono ${isWaiting ? 'text-[#F59E0B]' : 'text-white/40'}`}
        >
          {formatWait(approval.waiting_seconds)}
        </span>
      </div>

      {/* Summary */}
      {summary && (
        <p className="mt-1.5 line-clamp-2 text-xs text-white/70">{summary}</p>
      )}

      {/* Action buttons */}
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onApprove(approval.approval_id)}
          className="flex items-center gap-1 rounded-[6px] bg-green-500/80 px-2 py-1 text-xs text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approving ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" />
          ) : null}
          通过
        </button>

        <div className="relative" ref={dialogRef}>
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowRejectDialog((v) => !v)}
            className="flex items-center gap-1 rounded-[6px] bg-red-500/80 px-2 py-1 text-xs text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rejecting ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" />
            ) : null}
            驳回
          </button>

          {/* Inline reject dialog */}
          {showRejectDialog && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="驳回原因"
              className="absolute left-0 top-full z-20 mt-1 w-56 rounded-[8px] border border-white/15 bg-shadowflow-surface p-3 shadow-lg"
            >
              <p className="mb-2 text-[10px] font-mono uppercase tracking-wide text-white/50">
                驳回原因
              </p>
              <textarea
                ref={textareaRef}
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="说明驳回原因..."
                className="w-full resize-none rounded-[6px] border border-white/10 bg-shadowflow-bg px-2 py-1.5 text-xs text-white placeholder-white/30 focus:border-white/25 focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmReject}
                  className="flex-1 rounded-[6px] bg-red-500/80 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {submitting ? '处理中…' : '确认驳回'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectDialog(false)}
                  className="flex-1 rounded-[6px] border border-white/15 py-1 text-xs text-white/60 hover:text-white"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
