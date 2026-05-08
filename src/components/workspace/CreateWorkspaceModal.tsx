/**
 * CreateWorkspaceModal — Story 12.4
 *
 * Modal dialog for creating a new Workspace.
 * Offers 6 preset colors + name input. On submit calls createWorkspace API.
 */

import { useEffect, useRef, useState } from 'react';
import { createWorkspace, WorkspaceSummary } from '../../api/workspaces';

const PRESET_COLORS = [
  { hex: '#6366f1', label: '紫色' },
  { hex: '#22c55e', label: '绿色' },
  { hex: '#f59e0b', label: '橙色' },
  { hex: '#ef4444', label: '红色' },
  { hex: '#3b82f6', label: '蓝色' },
  { hex: '#a855f7', label: '玫瑰紫' },
];

interface Props {
  onClose: () => void;
  onCreated: (ws: WorkspaceSummary) => void;
}

export function CreateWorkspaceModal({ onClose, onCreated }: Props) {
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
      setError('请输入 Workspace 名称');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ws = await createWorkspace({ name: name.trim(), color });
      onCreated(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请重试');
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
        <h2 className="mb-4 text-[15px] font-semibold text-white/90">新建 Workspace</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-white/40">
              名称
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="我的工作区"
              maxLength={120}
              className="w-full rounded-lg border border-shadowflow-border bg-shadowflow-bg px-3 py-2 text-[13px] text-white/90 placeholder:text-white/20 focus:border-white/20 focus:outline-none"
              data-testid="ws-name-input"
            />
          </div>

          {/* Color picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-white/40">
              颜色
            </label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.hex)}
                  className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${
                    color === c.hex
                      ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-shadowflow-surface'
                      : ''
                  }`}
                  style={{ background: c.hex }}
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
              className="rounded-lg px-4 py-1.5 text-[12px] text-white/50 hover:bg-white/5 hover:text-white/70 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded-lg bg-[#6366f1] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="btn-create-workspace-submit"
            >
              {submitting ? '创建中…' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
