/**
 * BlueprintModal — D3 Blueprint Export/Import
 *
 * Two-column modal (40% preview + 60% actions):
 *   Left:  agent card preview (soul, memory profile, skills)
 *   Right: Export JSON + Copy share link + Import section
 *
 * Share URL: base64-encoded agent JSON appended as ?import=<base64>
 * Import duplicate name: auto-appends "-copy"
 * Field mapping:
 *   agent.soul → first 120 chars
 *   blueprint.memory_profile.working_memory_limit → working limit
 *   blueprint.memory_profile.episodic_retention_days → retention days
 *   blueprint.role_profiles.length → role count
 *   blueprint.tool_policies.length → tool policy count
 */
import { useEffect, useRef, useState } from 'react';
import { Inbox as BlueprintInbox } from '../../common/icons/iconRegistry';
import type { AgentRecord } from '../../api/agents';
import { quickCreateAgent } from '../../api/agents';

interface BlueprintModalProps {
  agent: AgentRecord;
  onClose: () => void;
  onImported?: (agent: AgentRecord) => void;
  initialImport?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildShareUrl(agent: AgentRecord): string {
  const payload = JSON.stringify({
    name: agent.name,
    soul: agent.soul,
    blueprint: agent.blueprint,
  });
  const encoded = btoa(unescape(encodeURIComponent(payload)));
  const url = new URL(window.location.href);
  url.pathname = '/agents';
  url.search = '';
  url.searchParams.set('import', encoded);
  return url.toString();
}

function parseBlueprint(raw: string): { name: string; soul: string; blueprint: Record<string, unknown> } | null {
  try {
    const decoded = decodeURIComponent(escape(atob(raw.trim())));
    const parsed = JSON.parse(decoded);
    if (typeof parsed.name === 'string' && typeof parsed.soul === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

function getMemoryLabel(blueprint: Record<string, unknown>): string {
  const mp = blueprint?.memory_profile as Record<string, unknown> | undefined;
  if (!mp) return '—';
  const limit = mp.working_memory_limit as number | undefined;
  const days = mp.episodic_retention_days as number | undefined;
  const parts: string[] = [];
  if (limit != null) parts.push(`${limit} tokens`);
  if (days != null) parts.push(`${days}d retention`);
  return parts.length ? parts.join(' · ') : '—';
}

function getSkillCount(blueprint: Record<string, unknown>): number {
  const rp = blueprint?.role_profiles as unknown[] | undefined;
  const tp = blueprint?.tool_policies as unknown[] | undefined;
  return (rp?.length ?? 0) + (tp?.length ?? 0);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentPreviewCard({ agent }: { agent: AgentRecord }) {
  const soulPreview = agent.soul.length > 120 ? agent.soul.slice(0, 120) + '…' : agent.soul;
  const memoryLabel = getMemoryLabel(agent.blueprint as Record<string, unknown>);
  const skillCount = getSkillCount(agent.blueprint as Record<string, unknown>);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      {/* Avatar + name */}
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-semibold text-white/80">
          {agent.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <p className="text-sm font-medium text-white/90">{agent.name}</p>
          <p className="text-[10px] font-mono text-white/30">{agent.agent_id.slice(0, 12)}…</p>
        </div>
      </div>

      {/* Soul preview */}
      <p className="text-xs leading-relaxed text-white/50">{soulPreview}</p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/40">
          memory: {memoryLabel}
        </span>
        {skillCount > 0 && (
          <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/40">
            {skillCount} item{skillCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Package includes */}
      <div className="border-t border-white/5 pt-3">
        <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wide text-white/25">Package includes</p>
        <ul className="space-y-0.5 text-[11px] text-white/40">
          <li>✓ name + soul</li>
          <li>✓ memory profile</li>
          {getSkillCount(agent.blueprint as Record<string, unknown>) > 0 && <li>✓ tool & role config</li>}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function BlueprintModal({ agent, onClose, onImported, initialImport }: BlueprintModalProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const isImportOnly = !agent.agent_id;

  // Import section state
  const [importRaw, setImportRaw] = useState(initialImport ?? '');
  const [importPreview, setImportPreview] = useState<{ name: string; soul: string; blueprint: Record<string, unknown> } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Focus trap on mount
  useEffect(() => {
    (isImportOnly ? importInputRef.current : firstFocusRef.current)?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Auto-parse initialImport (e.g. from ?import= URL param)
  useEffect(() => {
    if (initialImport) parseAndPreview(initialImport);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  function handleExportJson() {
    const payload = {
      name: agent.name,
      soul: agent.soul,
      blueprint: agent.blueprint,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent.name.replace(/\s+/g, '_')}_blueprint.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyLink() {
    const shareUrl = buildShareUrl(agent);
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    });
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  function parseAndPreview(raw: string) {
    setImportError(null);
    setImportPreview(null);
    if (!raw.trim()) return;
    let encoded = raw.trim();
    // Accept full URL or bare base64
    try {
      const url = new URL(encoded);
      encoded = url.searchParams.get('import') ?? encoded;
    } catch {
      // not a URL, use as-is
    }
    const parsed = parseBlueprint(encoded);
    if (!parsed) {
      setImportError('无法解析蓝图 — 请粘贴有效的分享链接或 JSON 文件内容');
      return;
    }
    setImportPreview(parsed);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed.name === 'string' && typeof parsed.soul === 'string') {
          setImportPreview(parsed);
          setImportError(null);
        } else {
          setImportError('JSON 格式无效 — 缺少 name 或 soul 字段');
        }
      } catch {
        setImportError('无法解析 JSON 文件');
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!importPreview) return;
    setImportStatus('loading');
    setImportErrorMsg(null);
    try {
      const imported = await quickCreateAgent({
        name: importPreview.name,
        soul: importPreview.soul,
      });
      setImportStatus('done');
      onImported?.(imported);
    } catch {
      setImportStatus('error');
      // Duplicate name: retry with "-copy"
      try {
        const imported = await quickCreateAgent({
          name: `${importPreview.name}-copy`,
          soul: importPreview.soul,
        });
        setImportStatus('done');
        onImported?.(imported);
      } catch (err2) {
        setImportErrorMsg(err2 instanceof Error ? err2.message : '导入失败，请重试');
        setImportStatus('idle');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blueprint-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mx-4 flex w-full max-w-[680px] flex-col rounded-[14px] border border-white/15 bg-[#141414] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 id="blueprint-modal-title" className="text-sm font-semibold text-white/90">
            Blueprint — {agent.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/70"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Body: two-column */}
        <div className="flex flex-col gap-0 overflow-y-auto sm:flex-row">
          {/* Left: preview (40%) */}
          <div className="w-full shrink-0 border-b border-white/10 p-5 sm:w-[40%] sm:border-b-0 sm:border-r">
            {isImportOnly ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-6 text-center">
                <span className="inline-flex items-center justify-center text-white/70"><BlueprintInbox size={24} strokeWidth={2} /></span>
                <p className="text-sm font-medium text-white/70">Import Blueprint</p>
                <p className="text-xs text-white/35 leading-relaxed">
                  粘贴分享链接、base64 字符串，或上传 JSON 文件来导入 Agent。
                </p>
              </div>
            ) : (
              <AgentPreviewCard agent={agent} />
            )}
          </div>

          {/* Right: actions (60%) */}
          <div className="flex flex-1 flex-col gap-5 p-5">
            {/* Export — hidden in import-only mode */}
            {!isImportOnly && (
              <>
                <div className="flex flex-col gap-2">
                  <button
                    ref={firstFocusRef}
                    onClick={handleExportJson}
                    className="w-full rounded-lg bg-[var(--t-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9333EA]"
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={handleCopyLink}
                    className="w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white/90"
                  >
                    {copyState === 'copied' ? '✓ Copied!' : 'Copy share link'}
                  </button>
                </div>

                <div className="border-t border-white/10" />
              </>
            )}

            {/* Import */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-white/50">Import Blueprint</p>

              {/* URL input */}
              <input
                ref={importInputRef}
                type="text"
                placeholder="粘贴分享链接或 base64…"
                value={importRaw}
                onChange={(e) => {
                  setImportRaw(e.target.value);
                  parseAndPreview(e.target.value);
                }}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/80 placeholder-white/20 outline-none focus:border-white/25"
              />

              {/* File upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-white/15 px-4 py-2.5 text-xs text-white/40 transition-colors hover:border-white/30 hover:text-white/60"
              >
                或拖入 / 选择 JSON 文件
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
              />

              {importError && (
                <p className="text-[11px] text-red-400">{importError}</p>
              )}

              {/* Preview card */}
              {importPreview && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-white/60">
                      {importPreview.name.charAt(0).toUpperCase()}
                    </span>
                    <p className="text-sm font-medium text-white/80">{importPreview.name}</p>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
                    {importPreview.soul.length > 80
                      ? importPreview.soul.slice(0, 80) + '…'
                      : importPreview.soul}
                  </p>
                </div>
              )}

              {importErrorMsg && (
                <p className="text-[11px] text-red-400">{importErrorMsg}</p>
              )}

              {importStatus === 'done' && (
                <p className="text-[11px] text-emerald-400">✓ Agent 已导入，已添加到列表</p>
              )}

              {importPreview && importStatus !== 'done' && (
                <button
                  onClick={handleImport}
                  disabled={importStatus === 'loading'}
                  className="w-full rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition-colors hover:border-white/30 disabled:opacity-40"
                >
                  {importStatus === 'loading' ? '导入中…' : 'Import Agent'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BlueprintModal;
