/**
 * CreateWorkspaceModal — Story 12.4
 *
 * Modal dialog for creating a new Workspace.
 * Offers 6 preset colors + name input. On submit calls createWorkspace API.
 */

import { useEffect, useRef, useState } from 'react';
import { createWorkspace, WorkspaceSummary } from '../../api/workspaces';
import { useI18n } from '../../common/i18n';

// UI5.0 — 紫色系（#6366f1 / #a855f7）按 clawsgo DNA 收敛：主色改 accent 蓝，玫瑰紫改中性岩灰。
const PRESET_COLORS = [
  { hex: '#1447e6', label: '蓝色' },
  { hex: '#22c55e', label: '绿色' },
  { hex: '#f59e0b', label: '橙色' },
  { hex: '#ef4444', label: '红色' },
  { hex: '#0ea5e9', label: '天青' },
  { hex: '#64748b', label: '岩灰' },
];

interface Props {
  onClose: () => void;
  onCreated: (ws: WorkspaceSummary) => void;
}

export function CreateWorkspaceModal({ onClose, onCreated }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0].hex);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('workspace.errorEmptyName'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ws = await createWorkspace({ name: name.trim(), color });
      onCreated(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workspace.errorCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="create-workspace-modal"
    >
      <div className="w-full max-w-sm rounded-xl border border-shadowflow-border bg-shadowflow-surface p-6 shadow-2xl">
        {/* UI5.0 — 文字/边框/hover 全部走 --t-* 令牌（原 dark-only white/* 类在 day 主题下不可读） */}
        <h2 className="mb-4 text-[15px] font-semibold" style={{ color: 'var(--t-fg)' }}>{t('workspace.createWorkspace')}</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t-fg-4)' }}>
              {t('workspace.fieldName')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('workspace.namePlaceholder')}
              maxLength={120}
              className="w-full rounded-lg border border-shadowflow-border bg-shadowflow-bg px-3 py-2 text-[13px] focus:outline-none"
              style={{ color: 'var(--t-fg)' }}
              data-testid="ws-name-input"
            />
          </div>

          {/* Color picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t-fg-4)' }}>
              {t('workspace.fieldColor')}
            </label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.hex)}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c.hex,
                    boxShadow: color === c.hex ? `0 0 0 2px var(--t-panel), 0 0 0 4px ${c.hex}` : undefined,
                  }}
                  data-testid={`color-option-${c.hex.replace('#', '')}`}
                />
              ))}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-[12px] text-red-400" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="mt-1 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-4 py-1.5 text-[12px] disabled:opacity-50"
              style={{ color: 'var(--t-fg-3)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded-lg px-4 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
              data-testid="btn-create-workspace-submit"
            >
              {submitting ? t('workspace.creating') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
