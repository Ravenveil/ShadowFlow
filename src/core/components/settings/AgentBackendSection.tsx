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
import { useEffect, useRef, useState } from 'react';
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
}

const MOCK_AGENTS: AgentEntry[] = [
  { id: 'claude',   name: 'Claude Code',  installed: true,  version: '2.1.129', path: '/usr/bin/claude' },
  { id: 'codex',    name: 'Codex CLI',    installed: true,  version: '1.0.0',   path: '/usr/bin/codex' },
  { id: 'gemini',   name: 'Gemini CLI',   installed: false, version: null,      path: null },
  { id: 'opencode', name: 'OpenCode',     installed: false, version: null,      path: null },
  { id: 'cursor',   name: 'Cursor Agent', installed: false, version: null,      path: null },
  { id: 'hermes',   name: 'Hermes',       installed: false, version: null,      path: null },
];

// Emoji/color avatars per CLI brand
const AGENT_AVATARS: Record<string, { emoji: string; color: string }> = {
  claude:   { emoji: '🤖', color: '#D97706' },
  codex:    { emoji: '⚡', color: '#3B82F6' },
  gemini:   { emoji: '✨', color: '#0EA5E9' },
  opencode: { emoji: '🔓', color: '#10B981' },
  cursor:   { emoji: '🖱',  color: '#8B5CF6' },
  hermes:   { emoji: '💬', color: '#EC4899' },
  devin:    { emoji: '🤖', color: '#6366F1' },
  kimi:     { emoji: '🌙', color: '#06B6D4' },
  kiro:     { emoji: '⭕', color: '#F59E0B' },
  kilo:     { emoji: '🔷', color: '#3B82F6' },
  vibe:     { emoji: '🎵', color: '#EC4899' },
  pi:       { emoji: 'π',  color: '#8B5CF6' },
  deepseek: { emoji: '🔍', color: '#10B981' },
  qwen:     { emoji: '🌐', color: '#F97316' },
  copilot:  { emoji: '🪁', color: '#0078D4' },
};

async function fetchAgents(): Promise<AgentEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/agents/detect`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return MOCK_AGENTS;
    const j = await res.json();
    return Array.isArray(j.agents) ? j.agents : MOCK_AGENTS;
  } catch {
    return MOCK_AGENTS;
  }
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
  { id: 'claude-opus-4-7',    name: 'Claude Opus 4.7',    provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',  name: 'Claude Sonnet 4.6',  provider: 'anthropic' },
  { id: 'claude-haiku-4-5',   name: 'Claude Haiku 4.5',   provider: 'anthropic' },
  { id: 'gpt-4o',             name: 'GPT-4o',             provider: 'openai'    },
  { id: 'gpt-4o-mini',        name: 'GPT-4o Mini',        provider: 'openai'    },
  { id: 'gemini-2.5-pro',     name: 'Gemini 2.5 Pro',     provider: 'google'    },
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

// ---- BYOK Key Row -----------------------------------------------------------

function ByokKeyRow({
  label,
  placeholder,
  maskedValue,
  model,
  onSave,
  onClear,
}: {
  label: string;
  placeholder: string;
  maskedValue: string | null | undefined;
  model: string;
  onSave: (key: string) => Promise<boolean>;
  onClear?: () => void;
}) {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const [input, setInput] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  const inputCls =
    'w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors';

  async function handleSave() {
    if (!input.trim()) return;
    setSaveState('saving');
    const ok = await onSave(input.trim());
    if (ok) {
      setInput('');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
        {label}
      </label>

      {/* Existing key indicator */}
      {maskedValue && (
        <div className="flex items-center gap-2 rounded-[7px] bg-sf-elev3 px-3 py-1.5">
          <span className="font-mono text-[10px] text-sf-fg4">{T('当前 Key：', 'Current key:')}</span>
          <span className="font-mono text-[10px] text-sf-fg2">{maskedValue}</span>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto rounded-[5px] border border-sf-border px-2 py-0.5 font-mono text-[9px] text-sf-fg4 hover:border-sf-reject hover:text-sf-reject transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Input + Save row */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder={placeholder}
          className={inputCls}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!input.trim() || saveState === 'saving'}
          className="flex-shrink-0 rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40 hover:bg-sf-accent-dim transition-colors"
        >
          {saveState === 'saving' ? '…' : T('保存', 'Save')}
        </button>
      </div>

      {saveState === 'saved' && (
        <p className="font-mono text-[11px] text-sf-ok">{T('✓ 已保存', '✓ Saved')}</p>
      )}
      {saveState === 'error' && (
        <p className="font-mono text-[11px] text-sf-reject">{T('✕ 保存失败，请重试', '✕ Save failed, please retry')}</p>
      )}
    </div>
  );
}

// ---- BYOK Panel -------------------------------------------------------------

function ByokPanel() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const [byokStatus, setByokStatus] = useState<ByokStatus | null>(null);
  const [models, setModels] = useState<ModelDef[]>(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('sf.byokModel') ?? 'claude-sonnet-4-6'
  );

  // Masked key helpers
  function maskKey(val: string | null | undefined): string | null {
    if (!val) return null;
    // Server may already return a masked value like "****xxxx"
    if (val.startsWith('*')) return val;
    return `••••${val.slice(-4)}`;
  }

  useEffect(() => {
    // Load model list
    fetchByokModels().then(setModels);
    // Load BYOK status (keys + model)
    fetchByok().then((s) => {
      if (!s) return;
      setByokStatus(s);
      // Prefer server model, but don't override if user has a local preference
      if (s.model && !localStorage.getItem('sf.byokModel')) {
        setSelectedModel(s.model);
      }
    });
  }, []);

  function handleModelChange(model: string) {
    setSelectedModel(model);
    localStorage.setItem('sf.byokModel', model);
  }

  async function handleSaveAnthropicKey(key: string): Promise<boolean> {
    const ok = await saveByokKey('anthropic', key, selectedModel);
    if (ok) {
      setByokStatus((prev) => ({
        keys: { ...(prev?.keys ?? {}), anthropic: `••••${key.slice(-4)}` },
        model: selectedModel,
      }));
    }
    return ok;
  }

  async function handleSaveOpenAIKey(key: string): Promise<boolean> {
    const ok = await saveByokKey('openai', key, selectedModel);
    if (ok) {
      setByokStatus((prev) => ({
        keys: { ...(prev?.keys ?? {}), openai: `••••${key.slice(-4)}` },
        model: selectedModel,
      }));
    }
    return ok;
  }

  async function handleSaveGoogleKey(key: string): Promise<boolean> {
    const ok = await saveByokKey('google', key, selectedModel);
    if (ok) {
      setByokStatus((prev) => ({
        keys: { ...(prev?.keys ?? {}), google: `••••${key.slice(-4)}` },
        model: selectedModel,
      }));
    }
    return ok;
  }

  async function handleSaveDeepSeekKey(key: string): Promise<boolean> {
    const ok = await saveByokKey('deepseek', key, selectedModel);
    if (ok) {
      setByokStatus((prev) => ({
        keys: { ...(prev?.keys ?? {}), deepseek: `••••${key.slice(-4)}` },
        model: selectedModel,
      }));
    }
    return ok;
  }

  const [azureKeyInput, setAzureKeyInput] = useState('');
  const [azureBaseUrl, setAzureBaseUrl] = useState(byokStatus?.baseUrls?.azure ?? '');
  const [azureSaveState, setAzureSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (byokStatus?.baseUrls?.azure) setAzureBaseUrl(byokStatus.baseUrls.azure);
  }, [byokStatus]);

  async function handleSaveAzureKey() {
    if (!azureKeyInput.trim()) return;
    setAzureSaveState('saving');
    const ok = await saveAzureByok(azureKeyInput.trim(), azureBaseUrl.trim(), selectedModel);
    if (ok) {
      setAzureKeyInput('');
      setAzureSaveState('saved');
      setTimeout(() => setAzureSaveState('idle'), 3000);
    } else {
      setAzureSaveState('error');
      setTimeout(() => setAzureSaveState('idle'), 3000);
    }
  }

  async function handleClearAzureKey() {
    await saveByokKey('azure', '', selectedModel);
    setByokStatus((prev) => ({
      keys: { ...(prev?.keys ?? {}), azure: null },
      baseUrls: { ...(prev?.baseUrls ?? {}), azure: null },
      model: selectedModel,
    }));
    setAzureBaseUrl('');
  }

  async function handleClearAnthropicKey() {
    await saveByokKey('anthropic', '', selectedModel);
    setByokStatus((prev) => ({
      keys: { ...(prev?.keys ?? {}), anthropic: null },
      model: selectedModel,
    }));
  }

  async function handleClearOpenAIKey() {
    await saveByokKey('openai', '', selectedModel);
    setByokStatus((prev) => ({
      keys: { ...(prev?.keys ?? {}), openai: null },
      model: selectedModel,
    }));
  }

  async function handleClearGoogleKey() {
    await saveByokKey('google', '', selectedModel);
    setByokStatus((prev) => ({
      keys: { ...(prev?.keys ?? {}), google: null },
      model: selectedModel,
    }));
  }

  async function handleClearDeepSeekKey() {
    await saveByokKey('deepseek', '', selectedModel);
    setByokStatus((prev) => ({
      keys: { ...(prev?.keys ?? {}), deepseek: null },
      model: selectedModel,
    }));
  }

  // Group models by provider for the <select>
  const providerOrder = ['anthropic', 'openai', 'google', 'deepseek', 'azure'];
  const grouped: Record<string, ModelDef[]> = {};
  for (const m of models) {
    (grouped[m.provider] ??= []).push(m);
  }
  for (const p of Object.keys(grouped)) {
    if (!providerOrder.includes(p)) providerOrder.push(p);
  }

  const providerLabel: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    deepseek: 'DeepSeek',
    azure: 'Azure OpenAI',
  };

  return (
    <div className="rounded-[10px] border border-sf-border bg-sf-elev2 p-4 flex flex-col gap-4">
      {/* Header */}
      <div>
        <p className="text-[12px] font-semibold text-sf-fg2">{T('直接调用模型 API', 'Call model APIs directly')}</p>
        <p className="mt-0.5 text-[11px] text-sf-fg4">
          {T(
            '无需本机 CLI，直接使用 API Key 调用 Claude / OpenAI 等模型。',
            'No local CLI required — call Claude / OpenAI and other models directly with an API key.',
          )}
        </p>
      </div>

      {/* Anthropic Key */}
      <ByokKeyRow
        label="Anthropic API Key"
        placeholder="sk-ant-…"
        maskedValue={maskKey(byokStatus?.keys?.anthropic)}
        model={selectedModel}
        onSave={handleSaveAnthropicKey}
        onClear={byokStatus?.keys?.anthropic ? handleClearAnthropicKey : undefined}
      />

      {/* OpenAI Key */}
      <ByokKeyRow
        label="OpenAI API Key"
        placeholder="sk-…"
        maskedValue={maskKey(byokStatus?.keys?.openai)}
        model={selectedModel}
        onSave={handleSaveOpenAIKey}
        onClear={byokStatus?.keys?.openai ? handleClearOpenAIKey : undefined}
      />

      {/* Google Key */}
      <ByokKeyRow
        label="GOOGLE API KEY"
        placeholder="AIza…"
        maskedValue={maskKey(byokStatus?.keys?.google)}
        model={selectedModel}
        onSave={handleSaveGoogleKey}
        onClear={byokStatus?.keys?.google ? handleClearGoogleKey : undefined}
      />

      {/* DeepSeek Key */}
      <ByokKeyRow
        label="DEEPSEEK API KEY"
        placeholder="sk-…"
        maskedValue={maskKey(byokStatus?.keys?.deepseek)}
        model={selectedModel}
        onSave={handleSaveDeepSeekKey}
        onClear={byokStatus?.keys?.deepseek ? handleClearDeepSeekKey : undefined}
      />

      {/* Azure section */}
      <div className="flex flex-col gap-2 rounded-[10px] border border-sf-border bg-sf-elev2 p-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          Azure OpenAI
        </p>
        {/* Masked current key */}
        {byokStatus?.keys?.azure && (
          <div className="flex items-center gap-2 rounded-[7px] bg-sf-elev3 px-3 py-1.5">
            <span className="font-mono text-[10px] text-sf-fg4">{T('Key：', 'Key:')}</span>
            <span className="font-mono text-[10px] text-sf-fg2">{maskKey(byokStatus.keys.azure)}</span>
            <button type="button" onClick={handleClearAzureKey}
              className="ml-auto rounded-[5px] border border-sf-border px-2 py-0.5 font-mono text-[9px] text-sf-fg4 hover:border-sf-reject hover:text-sf-reject transition-colors">
              {T('清除', 'Clear')}
            </button>
          </div>
        )}
        {/* Endpoint URL */}
        <input
          type="text"
          value={azureBaseUrl}
          onChange={(e) => setAzureBaseUrl(e.target.value)}
          placeholder="https://my-resource.openai.azure.com/"
          className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors"
        />
        {/* API Key + Save */}
        <div className="flex gap-2">
          <input
            type="password"
            value={azureKeyInput}
            onChange={(e) => setAzureKeyInput(e.target.value)}
            placeholder={T('Azure API 密钥', 'Azure API key')}
            className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors"
          />
          <button type="button" onClick={handleSaveAzureKey}
            disabled={!azureKeyInput.trim() || azureSaveState === 'saving'}
            className="flex-shrink-0 rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40 hover:bg-sf-accent-dim transition-colors">
            {azureSaveState === 'saving' ? '…' : T('保存', 'Save')}
          </button>
        </div>
        {azureSaveState === 'saved' && <p className="font-mono text-[11px] text-sf-ok">{T('✓ 已保存', '✓ Saved')}</p>}
        {azureSaveState === 'error' && <p className="font-mono text-[11px] text-sf-reject">{T('✕ 失败', '✕ Failed')}</p>}
      </div>

      {/* Model selector */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          {T('当前模型', 'Current model')}
        </label>
        <select
          value={selectedModel}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 focus:border-sf-accent focus:outline-none transition-colors"
        >
          {providerOrder
            .filter((p) => grouped[p]?.length)
            .map((provider) => (
              <optgroup key={provider} label={providerLabel[provider] ?? provider}>
                {grouped[provider].map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </div>

      {/* Footer hint */}
      <p className="font-mono text-[9px] text-sf-fg6">
        {T(
          '在 Connectors 配置 Composio 以访问 250+ 工具',
          'Configure Composio in Connectors to access 250+ tools',
        )}
      </p>
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
  const [selectedId, setSelectedId] = useState<string>(
    () => localStorage.getItem('sf.selectedAgent') ?? 'claude'
  );

  async function load() {
    const [list, serverSelection] = await Promise.all([
      fetchAgents(),
      fetchAgentSelection(),
    ]);
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
