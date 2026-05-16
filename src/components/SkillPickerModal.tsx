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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      data-testid="skill-picker-modal"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-200">选择 Skill</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Add new from URL */}
        <div className="border-b border-zinc-800 p-4">
          <div className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">
            从 URL 或文本添加
          </div>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5">
              <Link2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://github.com/... 或粘贴 SKILL.md 内容"
                className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFromUrl();
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleAddFromUrl}
              disabled={busy || !urlInput.trim()}
              className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              装并用
            </button>
          </div>
          {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
        </div>

        {/* Installed list */}
        <div className="p-4 max-h-80 overflow-y-auto">
          <div className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">
            已装 Skill ({installed?.length ?? '…'})
          </div>
          {installed === null && (
            <div className="text-xs text-zinc-500 py-4 text-center">加载中…</div>
          )}
          {installed && installed.length === 0 && (
            <div className="text-xs text-zinc-500 py-4 text-center">
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
                    className="w-full text-left rounded border border-zinc-800 bg-zinc-900 px-3 py-2 hover:border-zinc-600 hover:bg-zinc-800/50"
                    data-testid={`skill-picker-installed-${item.id}`}
                  >
                    <div className="text-sm font-medium text-zinc-100">{item.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate font-mono">
                      {item.source}
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-400">
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
