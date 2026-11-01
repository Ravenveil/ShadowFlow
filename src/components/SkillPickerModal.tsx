/**
 * SkillPickerModal — popover that lists user-installed skills + lets the user
 * paste a fresh URL to ingest one inline.
 *
 * Acts as the explicit `@skill` entry point (vs. the implicit URL-chip path).
 * The two paths share the same end state: a `SkillIngestSummary` returned to
 * the caller, who pins it as `pendingSkill` so the next run-session uses it.
 */

import { useEffect, useState } from 'react';
import { Link2, Loader2, Plus, X } from 'lucide-react';
import {
  ingestSkill,
  listInstalledSkills,
  type InstalledSkill,
  type SkillIngestSummary,
} from '../api/skillIngest';

export interface SkillPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPicked: (skill: SkillIngestSummary) => void;
}

export function SkillPickerModal({ open, onClose, onPicked }: SkillPickerModalProps) {
  const [installed, setInstalled] = useState<InstalledSkill[] | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUrlInput('');
    listInstalledSkills()
      .then((items) => setInstalled(items))
      .catch(() => setInstalled([]));
  }, [open]);

  if (!open) return null;

  async function handleAddFromUrl() {
    const src = urlInput.trim();
    if (!src) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ingestSkill(src);
      onPicked(result);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handlePickInstalled(item: InstalledSkill) {
    // Synthesize the summary shape the parent expects so picking an already-
    // installed skill goes through the same code path as a fresh ingest.
    onPicked({
      skill_id: item.id,
      name: item.name,
      is_new: false,
      source_label: item.source,
      counts: item.counts,
      truncated: false,
    });
    onClose();
  }

  return (
    <div
      className="ui50-overlay fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      data-testid="skill-picker-modal"
    >
      {/* UI5.0（2026-08-14）：暗色 zinc 硬编码 → --t-* 令牌 + 统一 modal 卡
          （圆角 16 + 软阴影 + 淡入缩放），day/night 双主题自适应。 */}
      <div
        className="ui50-modal ui50-pop w-full max-w-lg border"
        style={{ background: 'var(--t-panel)', borderColor: 'var(--t-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--t-border)' }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t-fg)' }}>选择 Skill</div>
          <button
            type="button"
            onClick={onClose}
            className="ui50-ibtn rounded-md p-1"
            style={{ color: 'var(--t-fg-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Add new from URL */}
        <div className="p-4" style={{ borderBottom: '1px solid var(--t-border)' }}>
          <div
            className="mb-2 uppercase"
            style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', color: 'var(--t-fg-4)' }}
          >
            从 URL 或文本添加
          </div>
          <div className="flex gap-2">
            <div
              className="flex-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5"
              style={{ border: '1px solid var(--t-border)', background: 'var(--t-bg)' }}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--t-fg-4)' }} />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://github.com/... 或粘贴 SKILL.md 内容"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--t-fg)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFromUrl();
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleAddFromUrl}
              disabled={busy || !urlInput.trim()}
              className="ui50-pri flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              装并用
            </button>
          </div>
          {error && <div className="mt-2 text-xs" style={{ color: 'var(--t-err, #ef4444)' }}>{error}</div>}
        </div>

        {/* Installed list */}
        <div className="p-4 max-h-80 overflow-y-auto">
          <div
            className="mb-2 uppercase"
            style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', color: 'var(--t-fg-4)' }}
          >
            已装 Skill ({installed?.length ?? '…'})
          </div>
          {installed === null && (
            <div className="text-xs py-4 text-center" style={{ color: 'var(--t-fg-4)' }}>加载中…</div>
          )}
          {installed && installed.length === 0 && (
            <div className="text-xs py-4 text-center" style={{ color: 'var(--t-fg-4)' }}>
              还没装任何 skill。把 github URL 粘到上面即可。
            </div>
          )}
          {installed && installed.length > 0 && (
            <ul className="flex flex-col gap-1">
              {installed.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handlePickInstalled(item)}
                    className="ui50-opt w-full text-left px-3 py-2"
                    style={{
                      border: '1px solid var(--t-border)',
                      background: 'var(--t-panel)',
                      cursor: 'pointer',
                    }}
                    data-testid={`skill-picker-installed-${item.id}`}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t-fg)' }}>{item.name}</div>
                    <div
                      className="truncate font-mono"
                      style={{ fontSize: 11, color: 'var(--t-fg-4)' }}
                    >
                      {item.source}
                    </div>
                    <div className="mt-1" style={{ fontSize: 10, color: 'var(--t-fg-3)' }}>
                      {Object.entries(item.counts)
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => `${k}=${n}`)
                        .join(' · ') || 'empty'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
