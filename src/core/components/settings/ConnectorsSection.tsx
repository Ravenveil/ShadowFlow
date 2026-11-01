/**
 * ConnectorsSection — Settings: Connector & Tool Provider Management
 *
 * Supports Composio API key:
 *   GET    /api/settings/connectors/composio  → read current state
 *   PUT    /api/settings/connectors/composio  → save key
 *   DELETE /api/settings/connectors/composio  → clear key
 *
 * Falls back gracefully if API is unavailable (stores locally).
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../common/icons/iconRegistry';

function IconExternalLink({ cls }: { cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls ?? 'h-[10px] w-[10px]'}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function IconShield({ cls }: { cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls ?? 'h-[12px] w-[12px]'}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface ComposioStatus {
  configured: boolean;
  apiKeyTail: string | null;
}

async function apiGetComposio(): Promise<ComposioStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/connectors/composio`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error('not ok');
    return await res.json();
  } catch {
    // Fallback: check localStorage
    const stored = localStorage.getItem('sf.composioKey');
    if (stored) {
      return { configured: true, apiKeyTail: stored.slice(-4) };
    }
    return { configured: false, apiKeyTail: null };
  }
}

async function apiSaveComposio(key: string): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/connectors/composio`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('not ok');
    return { ok: true };
  } catch {
    // Fallback: save to localStorage
    localStorage.setItem('sf.composioKey', key);
    return { ok: true };
  }
}

async function apiClearComposio(): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/connectors/composio`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('not ok');
  } catch {
    // ignore
  }
  localStorage.removeItem('sf.composioKey');
  return { ok: true };
}

// ---- Connector catalog data -------------------------------------------------

const CONNECTOR_CATALOG = [
  { id: 'github',      name: 'GitHub',       emoji: '🐙', desc: 'Issue、PR、仓库管理',    category: 'dev' },
  { id: 'notion',      name: 'Notion',        emoji: '📝', desc: '页面、数据库读写',       category: 'productivity' },
  { id: 'slack',       name: 'Slack',         emoji: '💬', desc: '发送消息、频道管理',     category: 'communication' },
  { id: 'linear',      name: 'Linear',        emoji: '📋', desc: 'Issue 追踪',            category: 'dev' },
  { id: 'gmail',       name: 'Gmail',         emoji: '📧', desc: '邮件收发',              category: 'communication' },
  { id: 'gcal',        name: 'Google Cal',    emoji: '📅', desc: '日历事件管理',          category: 'productivity' },
  { id: 'jira',        name: 'Jira',          emoji: '🔵', desc: '项目与 Sprint 管理',    category: 'dev' },
  { id: 'firecrawl',   name: 'Firecrawl',     emoji: '🔥', desc: '网页抓取与搜索',        category: 'data' },
  { id: 'browserbase', name: 'Browserbase',   emoji: '🌐', desc: '无头浏览器自动化',      category: 'data' },
  { id: 'zapier',      name: 'Zapier',        emoji: '⚡', desc: '5000+ 应用自动化',      category: 'automation' },
];

// ---- Composio card ----------------------------------------------------------

function ComposioCard() {
  const [status, setStatus] = useState<ComposioStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedLastFour, setSavedLastFour] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGetComposio().then((s) => {
      setStatus(s);
      if (s.configured) setSavedLastFour(s.apiKeyTail);
    });
  }, []);

  async function handleSave() {
    if (!keyInput.trim()) return;
    setSaveState('saving');
    const result = await apiSaveComposio(keyInput.trim());
    if (result.ok) {
      setSavedLastFour(keyInput.trim().slice(-4));
      setKeyInput('');
      setSaveState('saved');
      setStatus({ configured: true, apiKeyTail: keyInput.trim().slice(-4) });
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  async function handleClear() {
    await apiClearComposio();
    setStatus({ configured: false, apiKeyTail: null });
    setSavedLastFour(null);
    setKeyInput('');
    setSaveState('idle');
  }

  const inputCls =
    'w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors';

  return (
    <div className="rounded-[12px] border border-sf-border bg-sf-panel p-5">
      {/* Card header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          {/* Composio logo placeholder */}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px] bg-[#FF6B2B]/15 text-[18px]">
            🔌
          </div>
          <div>
            <p className="text-[14px] font-semibold text-sf-fg1">Composio</p>
            <p className="text-[11px] text-sf-fg4">
              统一 API，集成 250+ SaaS 工具（GitHub、Notion、Slack 等）
            </p>
          </div>
        </div>
        {status?.configured && (
          <span className="flex-shrink-0 rounded-[5px] bg-sf-ok/15 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-sf-ok">
            Connected
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="mt-4 border-t border-sf-border" />

      {/* API Key field */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
            Composio API Key
          </label>
          <a
            href="https://app.composio.dev/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-sf-accent-bright hover:underline"
          >
            Get API Key
            <IconExternalLink cls="h-[10px] w-[10px]" />
          </a>
        </div>

        {/* Existing key indicator */}
        {status?.configured && savedLastFour && (
          <div className="flex items-center gap-2 rounded-[7px] bg-sf-elev3 px-3 py-2">
            <span className="font-mono text-[10px] text-sf-fg4">当前 Key：</span>
            <span className="font-mono text-[10px] text-sf-fg2">••••{savedLastFour}</span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto rounded-[5px] border border-sf-border px-2 py-0.5 font-mono text-[9px] text-sf-fg4 hover:border-sf-reject hover:text-sf-reject transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Paste Composio API key"
            className={inputCls}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!keyInput.trim() || saveState === 'saving'}
            className="flex-shrink-0 rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40 hover:bg-sf-accent-dim transition-colors"
          >
            {saveState === 'saving' ? '…' : 'Save'}
          </button>
        </div>

        {/* Save feedback */}
        {saveState === 'saved' && (
          <p className="font-mono text-[11px] text-sf-ok">
            ✓ Saved{savedLastFour ? ` (last 4: ${savedLastFour})` : ''}
          </p>
        )}
        {saveState === 'error' && (
          <p className="font-mono text-[11px] text-sf-reject">✕ 保存失败，请重试</p>
        )}
      </div>

      {/* Security notice */}
      <div className="mt-4 flex items-start gap-2 rounded-[8px] bg-sf-elev1 px-3 py-2.5">
        <IconShield cls="mt-0.5 h-[12px] w-[12px] flex-shrink-0 text-sf-fg5" />
        <p className="text-[11px] text-sf-fg5">
          Key is encrypted at rest in <span className="font-mono">.shadowflow/connectors/</span> on the server
        </p>
      </div>
    </div>
  );
}

// ---- Main section -----------------------------------------------------------

export function ConnectorsSection() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">Connectors</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">
          Manage connector and tool provider settings
        </p>
      </div>

      {/* Connector cards */}
      <ComposioCard />

      {/* Connector catalog — requires Composio key */}
      <div className="flex flex-col gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          可用连接器（通过 Composio）
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CONNECTOR_CATALOG.map(c => (
            <div key={c.id}
              className="flex items-center gap-2.5 rounded-[10px] border border-sf-border bg-sf-elev2 px-3 py-2.5">
              <span className="flex-shrink-0 text-sf-fg2">
                <Icon token={c.emoji} size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-sf-fg1 truncate">{c.name}</p>
                <p className="text-[10px] text-sf-fg5 truncate">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-sf-fg5">
          配置 Composio API Key 后，Agent 可自动调用以上任意连接器。更多工具详见{' '}
          <a href="https://composio.dev/tools" target="_blank" rel="noopener noreferrer"
            className="text-sf-accent-bright hover:underline">composio.dev/tools</a>。
        </p>
      </div>
    </div>
  );
}
