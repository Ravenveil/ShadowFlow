/**
 * SkillUrlChip — appears above the chat composer when a skill-shaped URL is
 * pasted/typed. Lets the user explicitly opt in to "install this skill" vs.
 * "treat it as a regular link" — no silent magic.
 *
 * Mounts itself only when `url` is non-null. The parent owns:
 *   - URL detection (extractSkillUrl on composer change)
 *   - dismissal state (user clicked "当普通链接")
 *   - the post-install callback (typically: kick off run-session with skill_id)
 */

import { useEffect, useState } from 'react';
import { Link2, Loader2, Check, X } from 'lucide-react';
import {
  ingestSkill,
  previewSkill,
  type SkillIngestSummary,
  type SkillPreview,
} from '../api/skillIngest';

export interface SkillUrlChipProps {
  url: string;
  onInstalled: (skill: SkillIngestSummary) => void;
  onDismiss: () => void;
}

export function SkillUrlChip({ url, onInstalled, onDismiss }: SkillUrlChipProps) {
  const [preview, setPreview] = useState<SkillPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    previewSkill(url)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((err: Error) => {
        if (!cancelled) setPreviewError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function handleInstall() {
    setInstalling(true);
    setInstallError(null);
    try {
      const result = await ingestSkill(url);
      onInstalled(result);
    } catch (err) {
      setInstallError((err as Error).message);
    } finally {
      setInstalling(false);
    }
  }

  const kindLabel =
    preview?.kind === 'git-repo'
      ? 'github 仓库'
      : preview?.kind === 'raw-file'
        ? '远程 markdown'
        : preview
          ? '文本'
          : '识别中…';

  // UI5.0（2026-08-14）：blue/zinc 硬编码 → --t-* 令牌；accent 只给识别提示
  // 与主操作，中性色承载其余（clawsgo 克制用色）。
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
      style={{
        border: '1px solid color-mix(in oklab, var(--t-accent) 35%, transparent)',
        background: 'var(--t-accent-tint)',
      }}
      data-testid="skill-url-chip"
    >
      <Link2 className="h-4 w-4 shrink-0" style={{ color: 'var(--t-accent)' }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs leading-tight" style={{ color: 'var(--t-accent-bright, var(--t-accent))' }}>
          检测到 skill 资源 · {kindLabel}
        </div>
        <div className="truncate font-mono text-xs" style={{ color: 'var(--t-fg)' }}>
          {preview?.inferred_name ?? url}
        </div>
        {previewError && <div className="text-xs mt-0.5" style={{ color: 'var(--t-err, #ef4444)' }}>{previewError}</div>}
        {installError && <div className="text-xs mt-0.5" style={{ color: 'var(--t-err, #ef4444)' }}>{installError}</div>}
      </div>
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing || !preview}
        className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium disabled:opacity-40"
        style={{
          border: '1px solid var(--t-accent)',
          background: 'var(--t-accent)',
          color: 'var(--t-accent-ink, #fff)',
          cursor: installing || !preview ? 'not-allowed' : 'pointer',
        }}
      >
        {installing ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            装中
          </>
        ) : (
          <>
            <Check className="h-3 w-3" />
            装并用
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="ui50-ibtn flex items-center gap-1 rounded px-2.5 py-1 text-xs"
        style={{
          border: '1px solid var(--t-border)',
          background: 'transparent',
          color: 'var(--t-fg-3)',
          cursor: 'pointer',
        }}
      >
        <X className="h-3 w-3" />
        当普通链接
      </button>
    </div>
  );
}
