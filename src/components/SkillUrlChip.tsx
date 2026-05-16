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

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm"
      data-testid="skill-url-chip"
    >
      <Link2 className="h-4 w-4 shrink-0 text-blue-400" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-blue-300 leading-tight">检测到 skill 资源 · {kindLabel}</div>
        <div className="truncate font-mono text-xs text-zinc-200">
          {preview?.inferred_name ?? url}
        </div>
        {previewError && <div className="text-xs text-red-400 mt-0.5">{previewError}</div>}
        {installError && <div className="text-xs text-red-400 mt-0.5">{installError}</div>}
      </div>
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing || !preview}
        className="flex items-center gap-1 rounded border border-blue-400/40 bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-200 hover:bg-blue-500/25 disabled:opacity-40"
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
        className="flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
      >
        <X className="h-3 w-3" />
        当普通链接
      </button>
    </div>
  );
}
