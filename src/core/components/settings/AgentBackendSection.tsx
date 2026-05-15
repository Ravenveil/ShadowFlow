/**
 * AgentBackendSection — Settings: Agent Backend / CLI Selector
 *
 * Calls GET /api/settings/agents/detect to list installed CLI agents.
 * Falls back to mock data if API is unavailable.
 * Selected agent is persisted to localStorage key `sf.selectedAgent`
 * and synced server-side via PUT /api/settings/agents/selection.
 *
 * BYOK panel:
 *   GET  /api/settings/byok         → { keys: {anthropic?, openai?}, model: string }
 *   GET  /api/settings/byok/models  → ModelDef[]
 *   PUT  /api/settings/byok         → { provider, apiKey, model }
 */
import { useEffect, useState } from 'react';
import { useI18n } from '../../../common/i18n';
import { Icon } from '../../../common/icons/iconRegistry';

function IconRefreshCw({ spinning, cls }: { spinning?: boolean; cls?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[cls ?? 'h-[10px] w-[10px]', spinning ? 'animate-spin' : ''].join(' ')}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

// ---- Agent types ---------------------------------------------------------------

interface AgentEntry {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  docsUrl?: string | null;
  installHint?: string | null;
}

// Emoji/color avatars per CLI brand — keys MUST match registry id exactly.
const AGENT_AVATARS: Record<string, { emoji: string; color: string }> = {
  // Core
  claude:          { emoji: '🤖', color: '#D97706' },
  codex:           { emoji: '⚡', color: '#3B82F6' },
  gemini:          { emoji: '✨', color: '#0EA5E9' },
  opencode:        { emoji: '🔓', color: '#10B981' },
  // Cursor family
  cursor:          { emoji: '🖱',  color: '#8B5CF6' },
  'cursor-agent':  { emoji: '🖱',  color: '#7C3AED' },
  // GitHub Copilot — registry id is 'gh-copilot'
  'gh-copilot':    { emoji: '🪁', color: '#0078D4' },
  // Qwen — registry id is 'qwen-coder'
  'qwen-coder':    { emoji: '🌐', color: '#F97316' },
  // DeepSeek — registry id is 'deepseek-tui'
  'deepseek-tui':  { emoji: '🔍', color: '#10B981' },
  // Others
  cline:           { emoji: '⌨', color: '#6366F1' },
  aider:           { emoji: '🔧', color: '#059669' },
  'windsurf-cli':  { emoji: '🏄', color: '#06B6D4' },
  hermes:          { emoji: '💬', color: '#EC4899' },
  devin:           { emoji: '🤖', color: '#6366F1' },
  kimi:            { emoji: '🌙', color: '#06B6D4' },
  qoder:           { emoji: '⚙',  color: '#8B5CF6' },
  pi:              { emoji: 'π',  color: '#8B5CF6' },
  kiro:            { emoji: '⭕', color: '#F59E0B' },
  kilo:            { emoji: '🔷', color: '#3B82F6' },
  vibe:            { emoji: '🎵', color: '#EC4899' },
};

async function fetchAgents(): Promise<AgentEntry[]> {
  const res = await fetch(`${API_BASE}/api/settings/agents/detect`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.agents) ? j.agents : [];
}

async function fetchAgentSelection(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/agents/selection`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j.selectedId === 'string' ? j.selectedId : null;
  } catch {
    return null;
  }
}

function syncAgentSelection(id: string) {
  // Fire-and-forget: persist selection server-side
  fetch(`${API_BASE}/api/settings/agents/selection`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedId: id }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => { /* ignore */ });
}

// ---- CLI card ---------------------------------------------------------------

function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const avatar = AGENT_AVATARS[agent.id] ?? { emoji: '🤖', color: '#71717A' };

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!agent.installed}
      className={[
        'flex w-full items-center gap-3 rounded-[10px] border p-3.5 text-left transition-all',
        selected
          ? 'border-sf-accent bg-sf-accent-tint shadow-[0_0_0_1px_#A855F7]'
          : agent.installed
            ? 'border-sf-border bg-sf-elev2 hover:border-sf-fg5 hover:bg-sf-elev3'
            : 'border-sf-border bg-sf-elev1 opacity-40 cursor-not-allowed',
      ].join(' ')}
    >
      {/* Avatar */}
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: `${avatar.color}22`, color: avatar.color }}
      >
        <Icon token={avatar.emoji} size={18} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-sf-fg1">{agent.name}</span>
          {agent.installed ? (
            <span className="rounded-[4px] bg-sf-ok/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-sf-ok">
              {T('已安装', 'installed')}
            </span>
          ) : (
            <span className="rounded-[4px] bg-sf-elev3 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-sf-fg5">
              {T('未找到', 'not found')}
            </span>
          )}
          {selected && (
            <span className="ml-auto text-[10px] font-bold text-sf-accent-bright">{T('✓ 使用中', '✓ Active')}</span>
          )}
        </div>
        {agent.installed && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-sf-fg5">
            {agent.version ? `v${agent.version}` : ''}
            {agent.path ? ` · ${agent.path}` : ''}
          </p>
        )}
        {!agent.installed && (agent.installHint || agent.docsUrl) && (
          <div className="mt-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {agent.installHint && (
              <span
                className="font-mono text-[9px] text-sf-fg5 bg-sf-elev3 px-1.5 py-0.5 rounded select-all cursor-text"
                title={agent.installHint}
              >
                {agent.installHint.length > 28 ? agent.installHint.slice(0, 28) + '…' : agent.installHint}
              </span>
            )}
            {agent.docsUrl && (
              <a
                href={agent.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[9px] text-sf-accent hover:underline"
              >
                {T('文档', 'Docs')}
              </a>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ---- BYOK types & helpers ---------------------------------------------------

interface ModelDef {
  id: string;
  name: string;
  provider: string;
}

const FALLBACK_MODELS: ModelDef[] = [
  { id: 'claude-opus-4-7',       name: 'Claude Opus 4.7',       provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',     name: 'Claude Sonnet 4.6',     provider: 'anthropic' },
  { id: 'claude-haiku-4-5',      name: 'Claude Haiku 4.5',      provider: 'anthropic' },
  { id: 'claude-3-5-sonnet',     name: 'Claude 3.5 Sonnet',     provider: 'anthropic' },
  { id: 'gpt-4o',                name: 'GPT-4o',                provider: 'openai'    },
  { id: 'gpt-4o-mini',           name: 'GPT-4o Mini',           provider: 'openai'    },
  { id: 'o3',                    name: 'o3',                    provider: 'openai'    },
  { id: 'o4-mini',               name: 'o4-mini',               provider: 'openai'    },
  { id: 'gemini-2.5-pro',        name: 'Gemini 2.5 Pro',        provider: 'google'    },
  { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      provider: 'google'    },
  { id: 'gemini-2.0-flash',      name: 'Gemini 2.0 Flash',      provider: 'google'    },
  { id: 'deepseek-chat',         name: 'DeepSeek Chat',         provider: 'deepseek'  },
  { id: 'deepseek-reasoner',     name: 'DeepSeek Reasoner',     provider: 'deepseek'  },
];

interface ByokStatus {
  keys: {
    anthropic?: string | null;
    openai?: string | null;
    google?: string | null;
    deepseek?: string | null;
    azure?: string | null;
  };
  baseUrls?: {
    azure?: string | null;
  };
  model: string;
}

async function fetchByok(): Promise<ByokStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/byok`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchByokModels(): Promise<ModelDef[]> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/byok/models`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return FALLBACK_MODELS;
    const j = await res.json();
    const arr = j?.models ?? j;
    return Array.isArray(arr) && arr.length > 0 ? arr : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

async function saveByokKey(provider: string, apiKey: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/byok`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey, model }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function saveAzureByok(apiKey: string, baseUrl: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/byok`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'azure', apiKey, model, baseUrl }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ---- BYOK Provider definitions ----------------------------------------------

const BYOK_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic',     placeholder: 'sk-ant-…',           baseUrl: 'https://api.anthropic.com' },
  { id: 'openai',    name: 'OpenAI',        placeholder: 'sk-…',               baseUrl: 'https://api.openai.com/v1' },
  { id: 'azure',     name: 'Azure OpenAI',  placeholder: 'Azure API key…',      baseUrl: '' },
  { id: 'google',    name: 'Google Gemini', placeholder: 'AIza…',              baseUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'deepseek',  name: 'DeepSeek',      placeholder: 'sk-…',               baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'ollama',    name: 'Ollama',        placeholder: '无需 API Key',        baseUrl: 'http://localhost:11434' },
] as const;

type ProviderID = typeof BYOK_PROVIDERS[number]['id'];

function maskKey(val: string | null | undefined): string | null {
  if (!val) return null;
  if (val.startsWith('*') || val.startsWith('•')) return val;
  return `••••${val.slice(-4)}`;
}

// ---- BYOK Panel (tabbed) ----------------------------------------------------

function ByokPanel() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const [byokStatus, setByokStatus] = useState<ByokStatus | null>(null);
  const [models, setModels] = useState<ModelDef[]>(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('sf.byokModel') ?? 'claude-sonnet-4-6'
  );
  const [activeProvider, setActiveProvider] = useState<ProviderID>('anthropic');
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    fetchByokModels().then(setModels);
    fetchByok().then((s) => {
      if (!s) return;
      setByokStatus(s);
      if (s.model && !localStorage.getItem('sf.byokModel')) {
        setSelectedModel(s.model);
      }
    });
  }, []);

  const provider = BYOK_PROVIDERS.find(p => p.id === activeProvider)!;

  // Reset key input + baseUrl when switching provider tabs
  useEffect(() => {
    setKeyInput('');
    setShowKey(false);
    setSaveState('idle');
    setTestState('idle');
    if (activeProvider === 'azure') {
      setBaseUrlInput(byokStatus?.baseUrls?.azure ?? '');
    } else {
      setBaseUrlInput(provider.baseUrl);
    }
  }, [activeProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep Azure base URL in sync when byokStatus loads
  useEffect(() => {
    if (activeProvider === 'azure' && byokStatus?.baseUrls?.azure) {
      setBaseUrlInput(byokStatus.baseUrls.azure);
    }
  }, [byokStatus, activeProvider]);

  async function handleSave() {
    if (activeProvider !== 'ollama' && !keyInput.trim()) return;
    setSaveState('saving');
    let ok = false;
    if (activeProvider === 'azure') {
      ok = await saveAzureByok(keyInput.trim(), baseUrlInput.trim(), selectedModel);
    } else if (activeProvider === 'ollama') {
      // Ollama: just save empty key with base URL
      ok = await saveAzureByok('', baseUrlInput.trim(), selectedModel);
    } else {
      ok = await saveByokKey(activeProvider, keyInput.trim(), selectedModel);
    }
    if (ok) {
      const maskedNew = keyInput ? `••••${keyInput.slice(-4)}` : null;
      setKeyInput('');
      setSaveState('saved');
      setByokStatus(prev => ({
        keys: { ...(prev?.keys ?? {}), [activeProvider]: maskedNew },
        model: selectedModel,
        baseUrls: activeProvider === 'azure' || activeProvider === 'ollama'
          ? { ...(prev?.baseUrls ?? {}), [activeProvider]: baseUrlInput.trim() }
          : prev?.baseUrls,
      }));
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  async function handleTest() {
    setTestState('testing');
    try {
      const res = await fetch(`${API_BASE}/api/settings/byok/models`, { signal: AbortSignal.timeout(5000) });
      setTestState(res.ok ? 'ok' : 'fail');
    } catch {
      setTestState('fail');
    }
    setTimeout(() => setTestState('idle'), 3000);
  }

  // Filtered models for active provider tab
  const filteredModels = models.filter(m => {
    if (activeProvider === 'anthropic') return m.provider === 'anthropic';
    if (activeProvider === 'openai' || activeProvider === 'azure') return m.provider === 'openai';
    if (activeProvider === 'google') return m.provider === 'google';
    if (activeProvider === 'deepseek') return m.provider === 'deepseek';
    return true; // ollama: show all
  });
  // Fall back to all models if none match
  const modelOptions = filteredModels.length > 0 ? filteredModels : models;

  const currentMaskedKey = maskKey(byokStatus?.keys?.[activeProvider as keyof ByokStatus['keys']]);

  return (
    <div className="rounded-[10px] border border-sf-border bg-sf-elev2 p-4 flex flex-col gap-4">
      {/* Header */}
      <p className="text-[12px] font-semibold text-sf-fg2">{T('直接调用模型 API', 'Call model APIs directly')}</p>

      {/* Provider tabs */}
      <div className="flex gap-1 flex-wrap">
        {BYOK_PROVIDERS.map(p => {
          const hasKey = Boolean(byokStatus?.keys?.[p.id as keyof ByokStatus['keys']]);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProvider(p.id)}
              className={[
                'px-3 py-1.5 rounded-[7px] text-[11px] font-semibold transition-colors flex items-center gap-1',
                activeProvider === p.id
                  ? 'bg-sf-accent text-white'
                  : 'bg-sf-elev3 text-sf-fg4 hover:text-sf-fg2',
              ].join(' ')}
            >
              {p.name}
              {hasKey && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-sf-ok" />
              )}
            </button>
          );
        })}
      </div>

      {/* Provider form */}
      <div className="flex flex-col gap-3">
        {/* Current key indicator */}
        {currentMaskedKey && (
          <div className="flex items-center gap-2 rounded-[7px] bg-sf-elev3 px-3 py-1.5">
            <span className="font-mono text-[10px] text-sf-fg4">{T('当前 Key：', 'Current key:')}</span>
            <span className="font-mono text-[10px] text-sf-fg2">{currentMaskedKey}</span>
          </div>
        )}

        {/* API Key input */}
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
            API Key
            {activeProvider === 'ollama' && (
              <span className="ml-1 normal-case font-normal text-sf-fg5">
                {T('（本地服务无需填写）', '(not required for local service)')}
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder={activeProvider === 'ollama' ? T('无需 API Key', 'No API key needed') : provider.placeholder}
                disabled={activeProvider === 'ollama'}
                className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 pr-9 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors disabled:opacity-40"
              />
              {activeProvider !== 'ollama' && (
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sf-fg5 hover:text-sf-fg2 transition-colors"
                >
                  {showKey ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                (activeProvider !== 'ollama' && !keyInput.trim()) ||
                saveState === 'saving'
              }
              className="flex-shrink-0 rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40 hover:bg-sf-accent-dim transition-colors"
            >
              {saveState === 'saving' ? '…' : T('保存', 'Save')}
            </button>
          </div>
          {saveState === 'saved' && (
            <p className="font-mono text-[11px] text-sf-ok">✓ {T('已保存', 'Saved')}</p>
          )}
          {saveState === 'error' && (
            <p className="font-mono text-[11px] text-sf-reject">✕ {T('保存失败', 'Save failed')}</p>
          )}
        </div>

        {/* Base URL — always visible for Ollama & Azure, hidden for others */}
        {(activeProvider === 'ollama' || activeProvider === 'azure') && (
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
              Base URL
            </label>
            <input
              type="text"
              value={baseUrlInput}
              onChange={e => setBaseUrlInput(e.target.value)}
              placeholder={provider.baseUrl || 'https://…'}
              className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] font-mono text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors"
            />
            <p className="font-mono text-[9px] text-sf-fg6">
              {activeProvider === 'ollama'
                ? T('默认 http://localhost:11434', 'Default: http://localhost:11434')
                : T('Azure 资源端点，如 https://your-resource.openai.azure.com/', 'Azure resource endpoint')}
            </p>
          </div>
        )}

        {/* Model list */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
              {T('模型', 'Models')}{' '}
              <span className="normal-case font-normal text-sf-fg6">({modelOptions.length})</span>
            </label>
            <button
              type="button"
              onClick={() => fetchByokModels().then(setModels)}
              className="flex items-center gap-1 rounded-[6px] border border-sf-border px-2 py-1 text-[10px] text-sf-fg4 hover:text-sf-fg1 hover:border-sf-fg5 transition-colors"
            >
              <IconRefreshCw cls="h-[9px] w-[9px]" />
              {T('刷新列表', 'Refresh')}
            </button>
          </div>
          <div
            className="flex flex-col rounded-[8px] border border-sf-border overflow-hidden"
            style={{ background: 'var(--t-panel)', maxHeight: 200, overflowY: 'auto' }}
          >
            {modelOptions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedModel(m.id);
                  localStorage.setItem('sf.byokModel', m.id);
                }}
                className={[
                  'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                  'border-b border-sf-border/40 last:border-0',
                  selectedModel === m.id ? 'bg-sf-accent/15' : 'hover:bg-sf-elev2',
                ].join(' ')}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-sf-fg1 truncate">{m.name}</div>
                  <div className="font-mono text-[9px] text-sf-fg5 truncate">{m.id}</div>
                </div>
                {selectedModel === m.id && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    className="text-sf-accent flex-shrink-0 shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Test button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testState === 'testing'}
            className="flex items-center gap-1.5 rounded-[7px] border border-sf-border px-3 py-1.5 text-[11px] font-semibold text-sf-fg3 hover:border-sf-fg4 hover:text-sf-fg1 disabled:opacity-40 transition-colors"
          >
            {testState === 'testing' && (
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            {T('测试连接', 'Test connection')}
          </button>
          {testState === 'ok' && (
            <span className="font-mono text-[11px] text-sf-ok">✓ {T('连接正常', 'Connected')}</span>
          )}
          {testState === 'fail' && (
            <span className="font-mono text-[11px] text-sf-reject">✕ {T('连接失败', 'Connection failed')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main section -----------------------------------------------------------

export function AgentBackendSection() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(
    () => localStorage.getItem('sf.selectedAgent') ?? 'claude'
  );

  async function load() {
    setError(null);
    let list: AgentEntry[];
    let serverSelection: string | null;
    try {
      [list, serverSelection] = await Promise.all([
        fetchAgents(),
        fetchAgentSelection(),
      ]);
    } catch {
      setAgents([]);
      setError('CLI 检测服务不可用，请确认后端已启动');
      setLoading(false);
      return;
    }
    setAgents(list);

    // Use server selection if the agent is installed; else fall back to localStorage
    if (serverSelection) {
      const isInstalled = list.some((a) => a.id === serverSelection && a.installed);
      if (isInstalled) {
        setSelectedId(serverSelection);
        localStorage.setItem('sf.selectedAgent', serverSelection);
      }
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleRescan() {
    setScanning(true);
    await load();
    setScanning(false);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    localStorage.setItem('sf.selectedAgent', id);
    syncAgentSelection(id); // fire-and-forget server sync
    // 2026-05-11 Bug fix — this panel writes the cosmetic `sf.selectedAgent`
    // key, but `createRunSession` (src/api/_base.ts → getGenerationSettings)
    // reads `sf.defaultExecutor` to decide which CLI / direct path to invoke.
    // Without this mirror write the "✓ Active" indicator was purely visual
    // and the spawned skill always fell back to anthropic-direct.
    // Mapping: agent.id → executor token
    //   'claude' / 'codex' / 'gemini' / 'cursor-agent' / 'qwen-coder' / ... → 'cli:<id>'
    //   'anthropic' / 'byok' / 'openai' → 'anthropic-direct' (BYOK direct path)
    const cliIds = new Set([
      'claude', 'codex', 'gh-copilot', 'cursor-agent', 'cursor',
      'gemini', 'qwen-coder', 'cline', 'aider', 'windsurf-cli',
      'devin', 'hermes', 'kimi', 'qoder', 'pi', 'kiro', 'kilo', 'vibe', 'deepseek-tui',
    ]);
    const executor = cliIds.has(id) ? `cli:${id}` : 'anthropic-direct';
    localStorage.setItem('sf.defaultExecutor', executor);
  }

  const installed = agents.filter((a) => a.installed);
  const notInstalled = agents.filter((a) => !a.installed);

  return (
    <div className="flex flex-col gap-6">
      {/* Section header */}
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">{T('执行后端', 'Execution backend')}</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">
          {T(
            '选择 ShadowFlow 调用哪个本机 CLI 来执行 Agent 工作流。',
            'Choose which local CLI ShadowFlow uses to execute Agent workflows.',
          )}
        </p>
      </div>

      {/* Two-column grid: Local CLI | BYOK */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── Left: Local CLI ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
              {T('本机 CLI', 'Local CLI')}
            </span>
            <button
              type="button"
              onClick={handleRescan}
              disabled={scanning || loading}
              className="flex items-center gap-1.5 rounded-[7px] border border-sf-border px-2.5 py-1.5 font-mono text-[10px] text-sf-fg3 hover:border-sf-fg5 hover:text-sf-fg1 disabled:opacity-50 transition-colors"
            >
              <IconRefreshCw spinning={scanning} cls="h-[10px] w-[10px]" />
              {scanning ? T('扫描中…', 'Scanning…') : T('重新扫描', 'Rescan')}
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[62px] animate-pulse rounded-[10px] bg-sf-elev2" />
              ))}
            </div>
          ) : error ? (
            <p className="rounded-[8px] border border-sf-reject/30 bg-sf-reject/10 px-3 py-2 font-mono text-[11px] text-sf-reject">
              {error}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {installed.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  selected={selectedId === a.id}
                  onSelect={() => handleSelect(a.id)}
                />
              ))}
              {notInstalled.length > 0 && (
                <>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-sf-fg6">
                    {T('未检测到', 'Not detected')}
                  </p>
                  {notInstalled.map((a) => (
                    <AgentCard
                      key={a.id}
                      agent={a}
                      selected={false}
                      onSelect={() => {}}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Right: BYOK (API Key mode) ── */}
        <div className="flex flex-col gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
            {T('BYOK（API Key 模式）', 'BYOK (API key mode)')}
          </span>
          <ByokPanel />
        </div>
      </div>
    </div>
  );
}
