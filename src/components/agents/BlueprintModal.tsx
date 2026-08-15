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
 *
 * UI5.0（页面批A）:去暗色硬编码（#141414 / white/*）与紫色按钮，改 var(--t-*)
 * 主题变量 + clawsgo 式遮罩淡入/面板缩放动效。仅样式层，导入导出逻辑不变。
 */
import { useEffect, useRef, useState } from 'react';
import { Inbox as BlueprintInbox } from '../../common/icons/iconRegistry';
import type { AgentRecord } from '../../api/agents';
import { quickCreateAgent } from '../../api/agents';
import { useWorkspaceStore } from '../../store/workspaceStore';
// UI5.0 — 页面批A共享视觉层
import ui5 from '../../pages/ui5-pages.module.css';

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
    <div
      className="flex flex-col gap-3 rounded-[14px] border p-4"
      style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel-2)' }}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-base font-semibold"
          style={{ background: 'var(--t-panel-3)', color: 'var(--t-fg-2)', border: '1px solid var(--t-border)' }}
        >
          {agent.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--t-fg)' }}>{agent.name}</p>
          <p className="text-[10px] font-mono" style={{ color: 'var(--t-fg-5)' }}>{agent.agent_id.slice(0, 12)}…</p>
        </div>
      </div>

      {/* Soul preview */}
      <p className="text-xs leading-relaxed" style={{ color: 'var(--t-fg-3)' }}>{soulPreview}</p>

      {/* Badges — UI5.0: 中性 chip */}
      <div className="flex flex-wrap gap-1.5">
        <span
          className="rounded px-2 py-0.5 font-mono text-[10px]"
          style={{ background: 'var(--t-panel-3)', color: 'var(--t-fg-4)', border: '1px solid var(--t-border)' }}
        >
          memory: {memoryLabel}
        </span>
        {skillCount > 0 && (
          <span
            className="rounded px-2 py-0.5 font-mono text-[10px]"
            style={{ background: 'var(--t-panel-3)', color: 'var(--t-fg-4)', border: '1px solid var(--t-border)' }}
          >
            {skillCount} item{skillCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Package includes */}
      <div className="pt-3" style={{ borderTop: '1px solid var(--t-border)' }}>
        <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wide" style={{ color: 'var(--t-fg-5)' }}>Package includes</p>
        <ul className="space-y-0.5 text-[11px]" style={{ color: 'var(--t-fg-4)' }}>
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
  // 导入创建也带上当前工作区,避免落 "default" 而在工作区找不到。
  const currentId = useWorkspaceStore((s) => s.currentId);

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
        workspace_id: currentId ?? undefined,
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
          workspace_id: currentId ?? undefined,
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
      className={`fixed inset-0 z-50 flex items-center justify-center ${ui5.overlayIn}`}
      style={{ background: 'rgba(15, 23, 42, 0.32)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="blueprint-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`mx-4 flex w-full max-w-[680px] flex-col rounded-[18px] border ${ui5.modalIn}`}
        style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel)', color: 'var(--t-fg)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--t-border)' }}
        >
          <h2 id="blueprint-modal-title" className="text-sm font-semibold" style={{ color: 'var(--t-fg)' }}>
            Blueprint — {agent.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:text-[var(--t-fg)]"
            style={{ color: 'var(--t-fg-5)' }}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Body: two-column */}
        <div className="flex flex-col gap-0 overflow-y-auto sm:flex-row">
          {/* Left: preview (40%) */}
          <div
            className="w-full shrink-0 p-5 sm:w-[40%] sm:border-b-0 sm:border-r"
            style={{ borderBottom: '1px solid var(--t-border)', borderColor: 'var(--t-border)' }}
          >
            {isImportOnly ? (
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-[14px] border p-6 text-center"
                style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel-2)' }}
              >
                <span className="inline-flex items-center justify-center" style={{ color: 'var(--t-fg-3)' }}>
                  <BlueprintInbox size={24} strokeWidth={1.5} />
                </span>
                <p className="text-sm font-medium" style={{ color: 'var(--t-fg-2)' }}>Import Blueprint</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t-fg-4)' }}>
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
                  {/* UI5.0: 原紫色按钮(accent→#9333EA hover)→ 近黑主按钮(day)/accent(night) */}
                  <button
                    ref={firstFocusRef}
                    onClick={handleExportJson}
                    className={`w-full ${ui5.priBtn}`}
                    style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={handleCopyLink}
                    className="w-full rounded-lg border px-4 py-2.5 text-sm transition-colors hover:border-[var(--t-border-2,_var(--t-border))] hover:text-[var(--t-fg)]"
                    style={{ borderColor: 'var(--t-border)', color: 'var(--t-fg-3)', background: 'transparent' }}
                  >
                    {copyState === 'copied' ? '✓ Copied!' : 'Copy share link'}
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--t-border)' }} />
              </>
            )}

            {/* Import */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium" style={{ color: 'var(--t-fg-3)' }}>Import Blueprint</p>

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
                className={`w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none placeholder:text-[var(--t-fg-5)] ${ui5.inputLine}`}
                style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg)', color: 'var(--t-fg-2)' }}
              />

              {/* File upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed px-4 py-2.5 text-xs transition-colors hover:border-[var(--t-border-2,_var(--t-border))] hover:text-[var(--t-fg-2)]"
                style={{ borderColor: 'var(--t-border)', color: 'var(--t-fg-4)', background: 'transparent' }}
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
                <p className="text-[11px]" style={{ color: 'var(--t-err)' }}>{importError}</p>
              )}

              {/* Preview card */}
              {importPreview && (
                <div
                  className="rounded-[10px] border p-3"
                  style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel-2)' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs"
                      style={{ background: 'var(--t-panel-3)', color: 'var(--t-fg-3)', border: '1px solid var(--t-border)' }}
                    >
                      {importPreview.name.charAt(0).toUpperCase()}
                    </span>
                    <p className="text-sm font-medium" style={{ color: 'var(--t-fg-2)' }}>{importPreview.name}</p>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--t-fg-4)' }}>
                    {importPreview.soul.length > 80
                      ? importPreview.soul.slice(0, 80) + '…'
                      : importPreview.soul}
                  </p>
                </div>
              )}

              {importErrorMsg && (
                <p className="text-[11px]" style={{ color: 'var(--t-err)' }}>{importErrorMsg}</p>
              )}

              {importStatus === 'done' && (
                <p className="text-[11px]" style={{ color: 'var(--t-ok)' }}>✓ Agent 已导入，已添加到列表</p>
              )}

              {importPreview && importStatus !== 'done' && (
                <button
                  onClick={handleImport}
                  disabled={importStatus === 'loading'}
                  className={`w-full ${ui5.priBtn}`}
                  style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600 }}
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
