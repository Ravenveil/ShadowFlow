import { useEffect, useRef } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open, title, message,
  confirmLabel = '确认', cancelLabel = '取消',
  onConfirm, onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const TITLE_ID = 'confirm-modal-title';

  // P19: Esc key dismisses modal
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  // P19: Auto-focus confirm button when modal opens (accessibility)
  useEffect(() => { if (open) confirmRef.current?.focus(); }, [open]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 32px', minWidth: 360, boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={TITLE_ID} style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: 'var(--fg-0)', letterSpacing: '-.02em' }}>{title}</h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--bg-elev-3)', border: '1px solid var(--border)', color: 'var(--fg-2)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} onClick={onConfirm} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--status-reject)', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
