/**
 * RejectionToast + RejectionToastContainer — Story 4.3 AC1 + AC2.
 *
 * - Large red toast (≥ 18px / text-xl) for policy.violation / node.rejected
 * - 5-second auto-dismiss (no hover-to-pause)
 * - Click to expand reason + highlight PolicyMatrix cell
 * - Max 3 visible, extras queue
 */

import React, { useEffect, useState, memo } from 'react';
import { useRejectionToastStore, RejectionToastItem } from '../../stores/useRejectionToastStore';
import { usePolicyStore } from '../../hooks/usePolicyStore';

const DISMISS_MS = 5000;

interface SingleToastProps {
  toast: RejectionToastItem;
}

const SingleToast = memo(({ toast }: SingleToastProps) => {
  const dismiss = useRejectionToastStore((s) => s.dismiss);
  const highlightCell = usePolicyStore((s) => s.highlightCell);
  const [expanded, setExpanded] = useState(false);

  // Auto-dismiss after 5 s (no hover-to-pause per FR21)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  function handleClick() {
    setExpanded((e) => !e);
    if (toast.sender && toast.receiver) {
      highlightCell(toast.sender, toast.receiver);
    }
  }

  return (
    <div
      role="alert"
      data-testid={`rejection-toast-${toast.id}`}
      onClick={handleClick}
      className="animate-toast-in cursor-pointer select-none rounded-xl bg-red-600 text-white shadow-2xl px-5 py-4"
      style={{ fontSize: '18px', fontWeight: 700 }}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden style={{ fontSize: 22 }}>⚠️</span>
        <span className="flex-1">
          Policy Matrix: <strong>{toast.sender}</strong> 驳回{' '}
          <strong>{toast.receiver}</strong>
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
          className="text-white/70 hover:text-white text-sm font-normal"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {expanded && toast.reason && (
        <div className="mt-2 text-sm font-normal bg-red-700/60 rounded-lg px-3 py-2">
          <span className="opacity-70">原因：</span>{toast.reason}
        </div>
      )}
    </div>
  );
});

SingleToast.displayName = 'SingleToast';

/** Mount at the app root to display rejection toasts. */
export const RejectionToastContainer = memo(() => {
  const visible = useRejectionToastStore((s) => s.visible);

  if (visible.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-[min(480px,90vw)]"
    >
      {visible.map((t) => (
        <SingleToast key={t.id} toast={t} />
      ))}
    </div>
  );
});

RejectionToastContainer.displayName = 'RejectionToastContainer';
