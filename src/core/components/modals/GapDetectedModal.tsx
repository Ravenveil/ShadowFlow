import { useEffect, useRef, useState } from 'react';
import type { PendingGap } from '../../stores/useRunStore';

interface GapDetectedModalProps {
  open: boolean;
  gap: PendingGap | null;
  submitting?: boolean;
  onSubmit: (choice: 'A' | 'B' | 'C', userInput?: string) => void;
  onClose?: () => void;
}

export function GapDetectedModal({
  open,
  gap,
  submitting = false,
  onSubmit,
  onClose,
}: GapDetectedModalProps) {
  const [draft, setDraft] = useState('');
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !gap) return;
    setDraft(gap.userInput ?? '');
    primaryRef.current?.focus();
  }, [open, gap]);

  useEffect(() => {
    if (!open || !gap) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === '1') onSubmit('A', draft);
      if (event.key === '2') onSubmit('B', draft);
      if (event.key === '3') onSubmit('C', draft);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [draft, gap, onClose, onSubmit, open]);

  if (!open || !gap) return null;

  return (
    <div
      data-testid="gap-detected-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gap-detected-modal-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(5, 8, 17, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={() => onClose?.()}
    >
      <div
        style={{ width: 520, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-elev-2)', border: '1px solid rgba(245, 158, 11, .35)', borderRadius: 18, boxShadow: '0 24px 64px rgba(0, 0, 0, .45)', overflow: 'hidden' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 8 }}>
            Agent Gap Detected
          </div>
          <h2 id="gap-detected-modal-title" style={{ margin: 0, fontSize: 20, lineHeight: 1.15, color: 'var(--fg-0)' }}>
            这个节点缺少关键信息，先别让 Agent 瞎填
          </h2>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
            {gap.nodeId} · {gap.gapType}
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--fg-2)' }}>
            {gap.description}
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-3)' }}>可选补充输入</span>
            <textarea
              data-testid="gap-detected-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="如果你选 A，可以把补充数据写在这里。"
              style={{ minHeight: 88, resize: 'vertical', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elev-3)', color: 'var(--fg-1)', padding: '12px 14px', fontSize: 13, lineHeight: 1.5 }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <button
              data-testid="gap-choice-A"
              ref={primaryRef}
              type="button"
              disabled={submitting}
              onClick={() => onSubmit('A', draft)}
              style={{ borderRadius: 12, border: '1px solid rgba(59, 130, 246, .35)', background: 'rgba(30, 64, 175, .18)', color: '#dbeafe', padding: '12px 10px', fontWeight: 700, cursor: 'pointer' }}
            >
              1. 补充数据
            </button>
            <button
              data-testid="gap-choice-B"
              type="button"
              disabled={submitting}
              onClick={() => onSubmit('B', draft)}
              style={{ borderRadius: 12, border: '1px solid rgba(244, 114, 182, .35)', background: 'rgba(131, 24, 67, .18)', color: '#fbcfe8', padding: '12px 10px', fontWeight: 700, cursor: 'pointer' }}
            >
              2. 移除此对比
            </button>
            <button
              data-testid="gap-choice-C"
              type="button"
              disabled={submitting}
              onClick={() => onSubmit('C', draft)}
              style={{ borderRadius: 12, border: '1px solid rgba(245, 158, 11, .35)', background: 'rgba(146, 64, 14, .18)', color: '#fde68a', padding: '12px 10px', fontWeight: 700, cursor: 'pointer' }}
            >
              3. 标记稍后更新
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
