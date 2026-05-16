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

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

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

interface ByokProviderData {
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
}

interface ByokStore {
  providers: Record<string, ByokProviderData>;
  defaultModel?: string | null;
}

const FALLBACK_MODELS: ModelDef[] = [
  { id: 'claude-opus-4-7',    name: 'Claude Opus 4.7',    provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',  name: 'Claude Sonnet 4.6',  provider: 'anthropic' },
  { id: 'claude-haiku-4-5',   name: 'Claude Haiku 4.5',   provider: 'anthropic' },
  { id: 'claude-3-5-sonnet',  name: 'Claude 3.5 Sonnet',  provider: 'anthropic' },
  { id: 'gpt-4o',             name: 'GPT-4o',             provider: 'openai'    },
  { id: 'gpt-4o-mini',        name: 'GPT-4o Mini',        provider: 'openai'    },
  { id: 'o3',                 name: 'o3',                 provider: 'openai'    },
  { id: 'o4-mini',            name: 'o4-mini',            provider: 'openai'    },
  { id: 'gemini-2.5-pro',     name: 'Gemini 2.5 Pro',     provider: 'gemini'    },
  { id: 'gemini-2.5-flash',   name: 'Gemini 2.5 Flash',   provider: 'gemini'    },
  { id: 'gemini-2.0-flash',   name: 'Gemini 2.0 Flash',   provider: 'gemini'    },
  { id: 'deepseek-chat',      name: 'DeepSeek Chat',      provider: 'deepseek'  },
  { id: 'deepseek-reasoner',  name: 'DeepSeek Reasoner',  provider: 'deepseek'  },
  { id: 'glm-4-flash',        name: 'GLM-4 Flash',        provider: 'zhipu'     },
  { id: 'glm-4-plus',         name: 'GLM-4 Plus',         provider: 'zhipu'     },
  { id: 'glm-4',              name: 'GLM-4',              provider: 'zhipu'     },
  { id: 'qwen3-max',          name: 'Qwen3 Max',          provider: 'qwen'      },
  { id: 'qwen-plus-latest',   name: 'Qwen Plus',          provider: 'qwen'      },
];

interface ByokProviderDef {
  id: string;
  name: string;
  placeholder: string;
  defaultBaseUrl: string;
  color: string;
  letter: string;
  noKey: boolean;
}

const BYOK_PROVIDERS: ByokProviderDef[] = [
  { id: 'anthropic', name: 'Anthropic',      placeholder: 'sk-ant-…',    defaultBaseUrl: 'https://api.anthropic.com',                        color: '#D97706', letter: 'A',  noKey: false },
  { id: 'openai',    name: 'OpenAI',         placeholder: 'sk-…',        defaultBaseUrl: 'https://api.openai.com/v1',                        color: '#10A37F', letter: 'O',  noKey: false },
  { id: 'gemini',    name: 'Google Gemini',  placeholder: 'AIza…',       defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',  color: '#4285F4', letter: 'G',  noKey: false },
  { id: 'deepseek',  name: 'DeepSeek',       placeholder: 'sk-…',        defaultBaseUrl: 'https://api.deepseek.com/v1',                      color: '#0A74DA', letter: 'DS', noKey: false },
  { id: 'zhipu',     name: '智谱 GLM',       placeholder: 'xxxx.yyyyyy', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',             color: '#6366F1', letter: 'ZP', noKey: false },
  { id: 'qwen',      name: 'Qwen / 通义',   placeholder: 'sk-…',        defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', color: '#F97316', letter: 'Q',  noKey: false },
  { id: 'moonshot',  name: 'Moonshot / Kimi',placeholder: 'sk-…',        defaultBaseUrl: 'https://api.moonshot.cn/v1',                       color: '#06B6D4', letter: 'MK', noKey: false },
  { id: 'mistral',   name: 'Mistral',        placeholder: 'sk-…',        defaultBaseUrl: 'https://api.mistral.ai/v1',                        color: '#FF7000', letter: 'Mi', noKey: false },
  { id: 'groq',      name: 'Groq',           placeholder: 'gsk_…',       defaultBaseUrl: 'https://api.groq.com/openai/v1',                   color: '#F43F5E', letter: 'Gr', noKey: false },
  { id: 'azure',     name: 'Azure OpenAI',   placeholder: 'Azure key…',  defaultBaseUrl: '',                                                 color: '#0078D4', letter: 'Az', noKey: false },
  { id: 'ollama',    name: 'Ollama',         placeholder: '',             defaultBaseUrl: 'http://localhost:11434',                           color: '#10B981', letter: 'Ol', noKey: true  },
  { id: 'lmstudio',  name: 'LM Studio',      placeholder: '',             defaultBaseUrl: 'http://localhost:1234',                            color: '#8B5CF6', letter: 'LM', noKey: true  },
];

async function loadByokStore(): Promise<ByokStore> {
  try {
    const res = await fetch('/api/settings/byok', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { providers: {} };
    return await res.json();
  } catch {
    return { providers: {} };
  }
}

async function loadByokModels(): Promise<ModelDef[]> {
  try {
    const res = await fetch('/api/settings/byok/models', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return FALLBACK_MODELS;
    const j = await res.json();
    const arr = j?.models ?? j;
    return Array.isArray(arr) && arr.length > 0 ? arr : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

async function saveByokProvider(
  id: string,
  payload: { apiKey?: string; baseUrl?: string; models?: string[]; enabled?: boolean },
): Promise<boolean> {
  try {
    const res = await fetch(`/api/settings/byok/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ---- Provider logo (letter-based, no emoji) ----------------------------------

function ProviderLogo({ def, size = 32 }: { def: ByokProviderDef; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.28),
        background: `${def.color}22`, color: def.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.34, fontWeight: 700, flexShrink: 0,
        letterSpacing: def.letter.length > 1 ? '-0.03em' : undefined,
        userSelect: 'none',
      }}
    >
      {def.letter}
    </div>
  );
}

// ---- BYOK Panel — Cherry Studio two-panel layout ----------------------------

function ByokPanel() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const [store, setStore] = useState<ByokStore>({ providers: {} });
  const [allModels, setAllModels] = useState<ModelDef[]>(FALLBACK_MODELS);
  const [selectedId, setSelectedId] = useState('anthropic');

  const [keyInput, setKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [providerEnabled, setProviderEnabled] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    Promise.all([loadByokStore(), loadByokModels()]).then(([s, m]) => {
      setStore(s);
      setAllModels(m);
    });
  }, []);

  const selectedDef = BYOK_PROVIDERS.find(p => p.id === selectedId) ?? BYOK_PROVIDERS[0];
  const savedState = store.providers[selectedId];

  useEffect(() => {
    const saved = store.providers[selectedId];
    setKeyInput('');
    setShowKey(false);
    setSaveState('idle');
    setTestState('idle');
    setBaseUrlInput(saved?.baseUrl || selectedDef.defaultBaseUrl);
    setProviderEnabled(saved?.enabled ?? false);
    const defaults = allModels.filter(m => m.provider === selectedId).map(m => m.id);
    setEnabledModels(saved?.models?.length ? saved.models : defaults);
  }, [selectedId, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const providerModels = allModels.filter(m => m.provider === selectedId);

  function toggleModel(modelId: string) {
    setEnabledModels(prev =>
      prev.includes(modelId) ? prev.filter(m => m !== modelId) : [...prev, modelId]
    );
  }

  async function handleSave() {
    setSaveState('saving');
    const payload: Parameters<typeof saveByokProvider>[1] = {
      baseUrl: baseUrlInput.trim(),
      models: enabledModels,
      enabled: providerEnabled,
    };
    if (keyInput.trim()) payload.apiKey = keyInput.trim();
    const ok = await saveByokProvider(selectedId, payload);
    if (ok) {
      setKeyInput('');
      setSaveState('saved');
      loadByokStore().then(setStore);
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  async function handleTest() {
    setTestState('testing');
    try {
      const res = await fetch('/api/settings/byok/models', { signal: AbortSignal.timeout(5000) });
      setTestState(res.ok ? 'ok' : 'fail');
    } catch {
      setTestState('fail');
    }
    setTimeout(() => setTestState('idle'), 4000);
  }

  const maskedKey = savedState?.apiKey ?? null;
  const hasKey = Boolean(maskedKey && maskedKey.length > 0);

  return (
    <div className="rounded-[10px] border border-sf-border bg-sf-elev2 overflow-hidden flex" style={{ minHeight: 440 }}>

      {/* ── Left: Provider list ──────────────────────────────── */}
      <div className="w-[168px] flex-shrink-0 border-r border-sf-border flex flex-col overflow-y-auto">
        {BYOK_PROVIDERS.map(p => {
          const saved = store.providers[p.id];
          const active = saved?.enabled && (p.noKey || Boolean(saved?.apiKey));
          const isSel = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={[
                'flex items-center gap-2 px-2.5 py-2 text-left transition-colors border-b border-sf-border/30 last:border-0',
                isSel ? 'bg-sf-accent/15' : 'hover:bg-sf-elev3',
              ].join(' ')}
            >
              <ProviderLogo def={p} size={26} />
              <span className={['flex-1 min-w-0 text-[11px] font-semibold truncate', isSel ? 'text-sf-fg1' : 'text-sf-fg3'].join(' ')}>
                {p.name}
              </span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-sf-ok flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* ── Right: Config form ───────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3.5 p-4 overflow-y-auto">

        {/* Provider header */}
        <div className="flex items-center gap-3">
          <ProviderLogo def={selectedDef} size={34} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-sf-fg1">{selectedDef.name}</div>
            {selectedDef.defaultBaseUrl && (
              <div className="font-mono text-[9px] text-sf-fg5 truncate">{selectedDef.defaultBaseUrl}</div>
            )}
          </div>
          {/* Enable toggle */}
          <button
            type="button"
            onClick={() => setProviderEnabled(v => !v)}
            title={providerEnabled ? T('点击禁用', 'Disable') : T('点击启用', 'Enable')}
            className={[
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors',
              providerEnabled ? 'bg-sf-ok' : 'bg-sf-elev3',
            ].join(' ')}
          >
            <span className={[
              'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              providerEnabled ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')} />
          </button>
        </div>

        {/* API Key */}
        {!selectedDef.noKey && (
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">API Key</label>
            {hasKey && !keyInput && (
              <div className="flex items-center gap-2 rounded-[7px] bg-sf-elev3 px-3 py-1.5">
                <span className="font-mono text-[10px] text-sf-fg4">{T('当前：', 'Current:')}</span>
                <span className="font-mono text-[10px] text-sf-fg2">{maskedKey}</span>
              </div>
            )}
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder={hasKey ? T('输入新 Key 覆盖', 'Enter new key to replace') : selectedDef.placeholder}
                className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 pr-9 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sf-fg5 hover:text-sf-fg2 transition-colors"
              >
                {showKey ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Base URL */}
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">Base URL</label>
          <input
            type="text"
            value={baseUrlInput}
            onChange={e => setBaseUrlInput(e.target.value)}
            placeholder={selectedDef.defaultBaseUrl || 'http://localhost:…'}
            className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 font-mono text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors"
          />
        </div>

        {/* Local service hint */}
        {selectedDef.noKey && (
          <p className="font-mono text-[10px] text-sf-fg5">
            {T('本地服务无需 API Key，启动后点保存即可。', 'No API key needed — just start the service and save.')}
          </p>
        )}

        {/* Model list */}
        {providerModels.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
                {T('模型', 'Models')}{' '}
                <span className="normal-case font-normal text-sf-fg6">({enabledModels.length}/{providerModels.length})</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const all = providerModels.map(m => m.id);
                  setEnabledModels(all.every(id => enabledModels.includes(id)) ? [] : all);
                }}
                className="font-mono text-[9px] text-sf-fg5 hover:text-sf-fg2 transition-colors"
              >
                {T('全选/取消', 'All/None')}
              </button>
            </div>
            <div className="flex flex-col rounded-[8px] border border-sf-border overflow-hidden" style={{ maxHeight: 168, overflowY: 'auto' }}>
              {providerModels.map(m => {
                const on = enabledModels.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleModel(m.id)}
                    className={[
                      'flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-sf-border/30 last:border-0',
                      on ? 'bg-sf-accent/10' : 'hover:bg-sf-elev3',
                    ].join(' ')}
                  >
                    <div className={[
                      'h-3.5 w-3.5 flex-shrink-0 rounded-[3px] border flex items-center justify-center transition-colors',
                      on ? 'border-sf-accent bg-sf-accent' : 'border-sf-border',
                    ].join(' ')}>
                      {on && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-sf-fg1 truncate">{m.name}</div>
                      <div className="font-mono text-[9px] text-sf-fg5 truncate">{m.id}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Status */}
        {saveState === 'saved' && (
          <p className="font-mono text-[11px] text-sf-ok">✓ {T('已保存', 'Saved')}</p>
        )}
        {saveState === 'error' && (
          <p className="font-mono text-[11px] text-sf-reject">✕ {T('保存失败，请确认后端已启动', 'Save failed — check server')}</p>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-3 border-t border-sf-border/40">
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
            {T('测试连接', 'Test')}
            {testState === 'ok' && <span className="ml-1 text-sf-ok">✓</span>}
            {testState === 'fail' && <span className="ml-1 text-sf-reject">✕</span>}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === 'saving'}
            className="flex-1 rounded-[8px] bg-sf-accent px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40 hover:bg-sf-accent-dim transition-colors"
          >
            {saveState === 'saving' ? '…' : T('保存配置', 'Save')}
          </button>
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
                <div key={i} className="h-[62px] animate-pulse rounded-[10px]"
                  style={{ background: 'var(--t-border-2)' }} />
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
