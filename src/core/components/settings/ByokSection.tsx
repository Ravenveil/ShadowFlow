/**
 * ByokSection — BYOK · API Key 独立设置页 (Variant E design)
 *
 * Design spec: ui_kits/settings-redesign/variant-e.jsx VariantE_BYOK
 * Layout: 300px provider rail | 1fr detail panel (no tab strip)
 * Data: GET /api/settings/byok · GET /api/settings/byok/models · PUT/DELETE /api/settings/byok/:id
 */
import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// ── Brand registry ────────────────────────────────────────────────────────────

interface ProviderMeta {
  name: string;
  monogram: string;
  tint: string;
  short: string;
  defaultUrl: string;
  keyPlaceholder: string;
  noKey: boolean;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: { name: 'Anthropic',      monogram: 'A',  tint: '#D97706', short: 'Claude family',      defaultUrl: 'https://api.anthropic.com',                           keyPlaceholder: 'sk-ant-…',    noKey: false },
  openai:    { name: 'OpenAI',         monogram: 'O',  tint: '#10B981', short: 'GPT family',          defaultUrl: 'https://api.openai.com/v1',                            keyPlaceholder: 'sk-…',        noKey: false },
  google:    { name: 'Google Gemini',  monogram: 'G',  tint: '#4285F4', short: 'Gemini family',       defaultUrl: 'https://generativelanguage.googleapis.com/v1beta',     keyPlaceholder: 'AIza…',       noKey: false },
  deepseek:  { name: 'DeepSeek',       monogram: 'DS', tint: '#3D8BFD', short: 'V3 / R1',             defaultUrl: 'https://api.deepseek.com',                             keyPlaceholder: 'sk-…',        noKey: false },
  zhipu:     { name: '智谱 GLM',        monogram: 'ZP', tint: '#7C3AED', short: 'GLM-4 family',        defaultUrl: 'https://open.bigmodel.cn/api/paas/v4',                 keyPlaceholder: 'xxxx.yyyyyy', noKey: false },
  qwen:      { name: 'Qwen · 通义',    monogram: 'Qw', tint: '#A855F7', short: '阿里云百炼',           defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',    keyPlaceholder: 'sk-…',        noKey: false },
  moonshot:  { name: 'Moonshot · Kimi',monogram: 'MK', tint: '#06B6D4', short: 'K2 / K1.5',           defaultUrl: 'https://api.moonshot.cn/v1',                           keyPlaceholder: 'sk-…',        noKey: false },
  mistral:   { name: 'Mistral',        monogram: 'Mi', tint: '#FB923C', short: 'Large 2 · Codestral', defaultUrl: 'https://api.mistral.ai/v1',                            keyPlaceholder: 'sk-…',        noKey: false },
  groq:      { name: 'Groq',           monogram: 'Gr', tint: '#F97316', short: 'LPU inference',       defaultUrl: 'https://api.groq.com/openai/v1',                       keyPlaceholder: 'gsk_…',       noKey: false },
  azure:     { name: 'Azure OpenAI',   monogram: 'Az', tint: '#0078D4', short: 'Enterprise',          defaultUrl: 'https://{deployment}.openai.azure.com',                keyPlaceholder: '…',           noKey: false },
  ollama:    { name: 'Ollama',         monogram: 'Ol', tint: '#A1A1AA', short: 'Local',               defaultUrl: 'http://localhost:11434/v1',                            keyPlaceholder: '',            noKey: true  },
  lmstudio:  { name: 'LM Studio',      monogram: 'LM', tint: '#22C55E', short: 'Local',               defaultUrl: 'http://localhost:1234/v1',                             keyPlaceholder: '',            noKey: true  },
};

const PROVIDER_ORDER = ['anthropic','openai','google','deepseek','zhipu','qwen','moonshot','mistral','groq','azure','ollama','lmstudio'];

// ── API helpers ───────────────────────────────────────────────────────────────

interface ProviderData { apiKey: string; baseUrl: string; models: string[]; enabled: boolean }
interface ByokStore { providers: Record<string, ProviderData>; defaultModel?: string | null }
interface ModelDef { id: string; name: string; provider: string }

const FALLBACK_MODELS: ModelDef[] = [
  { id: 'claude-opus-4-7',    name: 'Claude Opus 4.7',    provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',  name: 'Claude Sonnet 4.6',  provider: 'anthropic' },
  { id: 'claude-haiku-4-5',   name: 'Claude Haiku 4.5',   provider: 'anthropic' },
  { id: 'claude-3-5-sonnet',  name: 'Claude 3.5 Sonnet',  provider: 'anthropic' },
  { id: 'gpt-4o',             name: 'GPT-4o',             provider: 'openai'    },
  { id: 'gpt-4o-mini',        name: 'GPT-4o Mini',        provider: 'openai'    },
  { id: 'o3',                 name: 'o3',                 provider: 'openai'    },
  { id: 'o4-mini',            name: 'o4-mini',            provider: 'openai'    },
  { id: 'gemini-2.5-pro',     name: 'Gemini 2.5 Pro',     provider: 'google'    },
  { id: 'gemini-2.5-flash',   name: 'Gemini 2.5 Flash',   provider: 'google'    },
  { id: 'deepseek-chat',      name: 'DeepSeek Chat',      provider: 'deepseek'  },
  { id: 'deepseek-reasoner',  name: 'DeepSeek Reasoner',  provider: 'deepseek'  },
  { id: 'glm-4-flash',        name: 'GLM-4 Flash',        provider: 'zhipu'     },
  { id: 'glm-4-plus',         name: 'GLM-4 Plus',         provider: 'zhipu'     },
  { id: 'qwen3-max',          name: 'Qwen3 Max',          provider: 'qwen'      },
  { id: 'qwen-plus-latest',   name: 'Qwen Plus',          provider: 'qwen'      },
  { id: 'moonshot-v1-8k',     name: 'Moonshot v1 8k',     provider: 'moonshot'  },
  { id: 'mistral-large-latest',name:'Mistral Large',      provider: 'mistral'   },
];

async function loadStore(): Promise<ByokStore> {
  try {
    const r = await fetch(`${API_BASE}/api/settings/byok`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { providers: {} };
    return r.json();
  } catch { return { providers: {} }; }
}

async function loadModels(): Promise<ModelDef[]> {
  try {
    const r = await fetch(`${API_BASE}/api/settings/byok/models`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return FALLBACK_MODELS;
    const j = await r.json();
    const arr = j?.models ?? j;
    return Array.isArray(arr) && arr.length > 0 ? arr : FALLBACK_MODELS;
  } catch { return FALLBACK_MODELS; }
}

async function saveProvider(id: string, payload: Partial<ProviderData> & { defaultModel?: string }): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/settings/byok/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
}

async function deleteProvider(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/settings/byok/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) });
    return r.status === 204;
  } catch { return false; }
}

// ── Logo components ───────────────────────────────────────────────────────────

function ProviderLogo({ id, size = 32, active = false }: { id: string; size?: number; active?: boolean }) {
  const m = PROVIDER_META[id] ?? { tint: '#71717A', monogram: '?' };
  const r = Math.round(size * 0.28);
  const fs = m.monogram.length > 1 ? Math.round(size * 0.32) : Math.round(size * 0.44);
  return (
    <div style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      background: `color-mix(in oklab, ${m.tint} 14%, var(--t-panel, var(--t-bg)))`,
      border: `1px solid color-mix(in oklab, ${m.tint} ${active ? 55 : 30}%, transparent)`,
      color: m.tint, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: fs, letterSpacing: '-0.04em',
      userSelect: 'none',
    }}>
      {m.monogram}
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 21, borderRadius: 999, position: 'relative', flexShrink: 0,
        background: on ? 'var(--t-accent)' : 'var(--t-border)',
        border: 'none', cursor: 'pointer', padding: 0, transition: 'background .2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, width: 17, height: 17, borderRadius: '50%', background: '#fff',
        transition: 'left .2s', left: on ? 17 : 2,
      }} />
    </button>
  );
}

// ── Model token ───────────────────────────────────────────────────────────────

function ModelToken({ id, name, checked, onToggle }: { id: string; name: string; checked: boolean; onToggle: () => void }) {
  return (
    <label onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
      borderRadius: 8, cursor: 'pointer',
      background: checked ? 'var(--t-accent-tint)' : 'var(--t-bg)',
      border: checked ? '1px solid color-mix(in oklab, var(--t-accent) 40%, transparent)' : '1px solid var(--t-border)',
      transition: 'background .12s, border-color .12s',
    }}>
      {checked ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11 3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
        </svg>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--t-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</div>
      </div>
    </label>
  );
}

// ── Provider rail row ─────────────────────────────────────────────────────────

function ProviderRow({
  id, configured, enabled, modelCount, active, onClick,
}: { id: string; configured: boolean; enabled: boolean; modelCount: number; active: boolean; onClick: () => void }) {
  const m = PROVIDER_META[id] ?? { name: id, short: '' };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 10, alignItems: 'center',
        padding: '9px 10px', cursor: 'pointer', borderRadius: 9, width: '100%', textAlign: 'left',
        background: active ? 'var(--t-accent-tint)' : 'transparent',
        border: active ? '1px solid color-mix(in oklab, var(--t-accent) 35%, transparent)' : '1px solid transparent',
        opacity: configured || active ? 1 : 0.75,
        transition: 'background .12s',
      }}
    >
      <ProviderLogo id={id} size={34} active={active} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--t-fg)' : 'var(--t-fg-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {m.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          {configured ? (
            <>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--t-ok)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>{modelCount} 模型 · 已配置</span>
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>{m.short}</span>
          )}
        </div>
      </div>
      {/* Toggle or plus */}
      {configured ? (
        <div style={{
          width: 26, height: 15, borderRadius: 999, position: 'relative', flexShrink: 0,
          background: enabled ? 'var(--t-accent)' : 'var(--t-border)', border: 'none',
        }}>
          <div style={{ position: 'absolute', top: 1, [enabled ? 'right' : 'left']: 1, width: 11, height: 11, borderRadius: '50%', background: enabled ? '#fff' : 'var(--t-fg-4)' }} />
        </div>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type TestState = 'idle' | 'testing' | 'ok' | 'fail';
type FilterKey = 'all' | 'configured' | 'openai-compat' | 'local';

export function ByokSection() {
  const [store, setStore]   = useState<ByokStore>({ providers: {} });
  const [allModels, setAllModels] = useState<ModelDef[]>(FALLBACK_MODELS);
  const [selectedId, setSelectedId] = useState('anthropic');
  const [railSearch, setRailSearch] = useState('');
  const [railFilter, setRailFilter] = useState<FilterKey>('all');
  const [customIds, setCustomIds] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('sf.byok.custom-meta') || '{}');
      Object.assign(PROVIDER_META, stored);
      return Object.keys(stored);
    } catch { return []; }
  });

  function addCustomProvider() {
    const name = window.prompt('提供商名称（如：My Provider）');
    if (!name?.trim()) return;
    const baseUrl = window.prompt('Base URL（OpenAI 兼容）', 'https://api.example.com/v1');
    if (!baseUrl?.trim()) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider';
    const id = `custom-${slug}-${Date.now().toString(36).slice(-4)}`;
    const meta: ProviderMeta = {
      name: name.trim(),
      monogram: name.trim().slice(0, 2).toUpperCase(),
      tint: '#71717A',
      short: 'Custom · OpenAI 兼容',
      defaultUrl: baseUrl.trim(),
      keyPlaceholder: 'sk-...',
      noKey: false,
    };
    PROVIDER_META[id] = meta;
    const next = [...customIds, id];
    setCustomIds(next);
    try {
      const map: Record<string, ProviderMeta> = {};
      next.forEach(i => { map[i] = PROVIDER_META[i]; });
      localStorage.setItem('sf.byok.custom-meta', JSON.stringify(map));
    } catch {}
    setSelectedId(id);
  }

  // Detail form state
  const [keyInput,     setKeyInput]     = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [provEnabled,  setProvEnabled]  = useState(false);
  const [showKey,      setShowKey]      = useState(false);
  const [saveState,    setSaveState]    = useState<SaveState>('idle');
  const [testState,    setTestState]    = useState<TestState>('idle');
  const [isDirty,      setIsDirty]      = useState(false);

  // Load store on mount
  useEffect(() => {
    Promise.all([loadStore(), loadModels()]).then(([s, m]) => {
      setStore(s);
      setAllModels(m);
    });
  }, []);

  const selectedMeta  = PROVIDER_META[selectedId] ?? PROVIDER_META['anthropic'];
  const savedState    = store.providers[selectedId];
  const providerModels = allModels.filter(m => m.provider === selectedId);

  // Sync form fields when provider changes
  useEffect(() => {
    const saved = store.providers[selectedId];
    setKeyInput('');
    setShowKey(false);
    setSaveState('idle');
    setTestState('idle');
    setIsDirty(false);
    setBaseUrlInput(saved?.baseUrl || selectedMeta.defaultUrl);
    setProvEnabled(saved?.enabled ?? false);
    const defaults = allModels.filter(m => m.provider === selectedId).map(m => m.id);
    setEnabledModels(saved?.models?.length ? saved.models : defaults);
  }, [selectedId, store]); // eslint-disable-line react-hooks/exhaustive-deps

  function markDirty() { setIsDirty(true); setSaveState('idle'); }

  function toggleModel(modelId: string) {
    setEnabledModels(prev => prev.includes(modelId) ? prev.filter(m => m !== modelId) : [...prev, modelId]);
    markDirty();
  }

  async function handleSave() {
    setSaveState('saving');
    const payload: Partial<ProviderData> = {
      baseUrl: baseUrlInput.trim(),
      models:  enabledModels,
      enabled: provEnabled,
    };
    if (keyInput.trim()) payload.apiKey = keyInput.trim();
    const ok = await saveProvider(selectedId, payload);
    if (ok) {
      setKeyInput('');
      setIsDirty(false);
      setSaveState('saved');
      loadStore().then(setStore);
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  async function handleRemove() {
    const ok = await deleteProvider(selectedId);
    if (ok) {
      loadStore().then(setStore);
    }
  }

  async function handleTest() {
    setTestState('testing');
    try {
      const r = await fetch(`${API_BASE}/api/settings/byok/models`, { signal: AbortSignal.timeout(5000) });
      setTestState(r.ok ? 'ok' : 'fail');
    } catch { setTestState('fail'); }
    setTimeout(() => setTestState('idle'), 4000);
  }

  // Rail: filter + search providers
  const LOCAL_IDS = new Set(['ollama', 'lmstudio']);
  const OAI_COMPAT_IDS = new Set(['openai','deepseek','zhipu','qwen','moonshot','mistral','groq','azure','ollama','lmstudio']);

  const filteredProviders = PROVIDER_ORDER.filter(id => {
    const meta = PROVIDER_META[id];
    if (railSearch) {
      const q = railSearch.toLowerCase();
      if (!meta.name.toLowerCase().includes(q) && !meta.short.toLowerCase().includes(q)) return false;
    }
    if (railFilter === 'configured') return Boolean(store.providers[id]?.apiKey || meta.noKey);
    if (railFilter === 'openai-compat') return OAI_COMPAT_IDS.has(id);
    if (railFilter === 'local') return LOCAL_IDS.has(id);
    return true;
  });

  const configuredIds = filteredProviders.filter(id => Boolean(store.providers[id]?.apiKey || (PROVIDER_META[id].noKey && store.providers[id])));
  const availableIds  = filteredProviders.filter(id => !configuredIds.includes(id));

  const hasKey = Boolean(savedState?.apiKey?.length);
  const maskedKey = savedState?.apiKey ?? '';
  const isConfigured = hasKey || (selectedMeta.noKey && Boolean(savedState));
  const isVerified = savedState?.enabled;

  const RAIL_FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',         label: '全部' },
    { key: 'configured',  label: '已配置' },
    { key: 'openai-compat', label: 'OpenAI 兼容' },
    { key: 'local',       label: '本地' },
  ];

  return (
    <div style={{
      flex: '1 1 0', minHeight: 400,
      display: 'grid', gridTemplateColumns: '300px 1fr',
      overflow: 'hidden',
    }}>
      {/* ── Provider rail ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--t-border)' }}>
        {/* Rail header */}
        <div style={{ padding: '13px 13px 10px', borderBottom: '1px solid var(--t-border)' }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
            background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input
              value={railSearch}
              onChange={e => setRailSearch(e.target.value)}
              placeholder="搜索提供商…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-2)',
              }}
            />
          </div>
          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
            {RAIL_FILTERS.map(f => {
              const count = PROVIDER_ORDER.filter(id => {
                if (f.key === 'configured')    return Boolean(store.providers[id]?.apiKey || (PROVIDER_META[id].noKey && store.providers[id]));
                if (f.key === 'openai-compat') return OAI_COMPAT_IDS.has(id);
                if (f.key === 'local')         return LOCAL_IDS.has(id);
                return true;
              }).length;
              const active = railFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setRailFilter(f.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '3px 8px', borderRadius: 5,
                    background: active ? 'var(--t-accent-tint)' : 'var(--t-bg)',
                    border: `1px solid ${active ? 'color-mix(in oklab, var(--t-accent) 35%, transparent)' : 'var(--t-border)'}`,
                    color: active ? 'var(--t-accent)' : 'var(--t-fg-3)',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    transition: 'background .12s, color .12s',
                  }}
                >
                  {f.label}
                  <span style={{ fontSize: 9, opacity: 0.65 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Provider list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {configuredIds.length > 0 && (
            <div style={{ padding: '4px 8px 6px', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-fg-5)', textTransform: 'uppercase' }}>
              已配置 · {configuredIds.length}
            </div>
          )}
          {configuredIds.map(id => (
            <ProviderRow
              key={id} id={id}
              configured={Boolean(store.providers[id]?.apiKey || (PROVIDER_META[id].noKey && store.providers[id]))}
              enabled={store.providers[id]?.enabled ?? false}
              modelCount={(store.providers[id]?.models ?? []).length}
              active={selectedId === id}
              onClick={() => setSelectedId(id)}
            />
          ))}
          {availableIds.length > 0 && (
            <div style={{ padding: '10px 8px 6px', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-fg-5)', textTransform: 'uppercase' }}>
              可用 · {availableIds.length}
            </div>
          )}
          {availableIds.map(id => (
            <ProviderRow
              key={id} id={id}
              configured={false} enabled={false} modelCount={0}
              active={selectedId === id}
              onClick={() => setSelectedId(id)}
            />
          ))}
        </div>

        {/* Rail footer */}
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--t-border)' }}>
          <button type="button" onClick={addCustomProvider} style={{
            width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px dashed var(--t-border)',
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--t-fg-4)',
            background: 'transparent', fontFamily: 'inherit',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>自定义提供商…</span>
          </button>
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Banner */}
        <div style={{
          padding: '18px 22px',
          background: 'linear-gradient(135deg, var(--t-accent-tint) 0%, transparent 70%)',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        }}>
          <ProviderLogo id={selectedId} size={48} active={isConfigured} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.015em' }}>
                {selectedMeta.name}
              </h3>
              {isConfigured && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
                  background: 'color-mix(in oklab, var(--t-accent) 18%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--t-accent) 45%, transparent)',
                  color: 'var(--t-accent)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--t-accent)', animation: 'sf-pulse 1.4s ease-in-out infinite', display: 'inline-block' }} />
                  当前已选
                </span>
              )}
              {isVerified && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
                  background: 'var(--t-ok-tint)', border: '1px solid color-mix(in oklab, var(--t-ok) 35%, transparent)',
                  color: 'var(--t-ok)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m4 12 5 5L20 6"/></svg>
                  已验证
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)' }}>
              {selectedMeta.short}
              {savedState?.models?.length ? ` · ${savedState.models.length} 模型已启用` : ''}
            </div>
          </div>
          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--t-fg-3)' }}>启用</span>
            <Toggle on={provEnabled} onChange={v => { setProvEnabled(v); markDirty(); }} />
          </div>
        </div>

        {/* Fields area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* API Key + Base URL */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {/* API Key */}
            {!selectedMeta.noKey && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-fg-4)' }}>API KEY</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)' }}>本地加密存储</span>
                </div>
                {hasKey && !keyInput && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, background: 'var(--t-bg)', marginBottom: 5 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>当前：</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-2)' }}>{maskedKey}</span>
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={e => { setKeyInput(e.target.value); markDirty(); }}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder={hasKey ? '输入新 Key 覆盖' : selectedMeta.keyPlaceholder}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '0 68px 0 12px', height: 36,
                      background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9,
                      fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t-fg)',
                      outline: 'none',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'var(--t-accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--t-border)')}
                  />
                  <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2 }}>
                    <button type="button" onClick={() => setShowKey(v => !v)} style={{ background: 'transparent', border: 'none', color: 'var(--t-fg-4)', cursor: 'pointer', padding: 4 }}>
                      {showKey ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3l18 18"/><path d="M10.6 6.2A10 10 0 0 1 12 6c7 0 10 6 10 6a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3 6 10 6c1.6 0 3-.3 4.2-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                    {keyInput && (
                      <button type="button" onClick={() => { navigator.clipboard.writeText(keyInput); }} style={{ background: 'transparent', border: 'none', color: 'var(--t-fg-4)', cursor: 'pointer', padding: 4 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Base URL */}
            <div style={selectedMeta.noKey ? { gridColumn: '1 / -1' } : {}}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-fg-4)' }}>BASE URL</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)' }}>代理 / 自定义网关可在此覆盖</span>
              </div>
              <input
                type="text"
                value={baseUrlInput}
                onChange={e => { setBaseUrlInput(e.target.value); markDirty(); }}
                placeholder={selectedMeta.defaultUrl}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '0 12px', height: 36,
                  background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9,
                  fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--t-fg)',
                  outline: 'none',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--t-accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--t-border)')}
              />
              {baseUrlInput && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)', marginTop: 4 }}>
                  预览 · {baseUrlInput.replace(/\/$/, '')}/messages
                </div>
              )}
            </div>
          </div>

          {/* Models grid */}
          {providerModels.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-fg-4)' }}>模型 · Models</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
                    background: 'var(--t-bg)', border: '1px solid var(--t-border)',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--t-fg-3)',
                  }}>
                    {enabledModels.length} / {providerModels.length} 已启用
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <button type="button" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}>↻ 拉取列表</button>
                  <button type="button" onClick={() => { setEnabledModels(providerModels.map(m => m.id)); markDirty(); }} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}>全选</button>
                  <button type="button" onClick={() => { setEnabledModels([]); markDirty(); }} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}>取消</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {providerModels.map(m => (
                  <ModelToken
                    key={m.id} id={m.id} name={m.name}
                    checked={enabledModels.includes(m.id)}
                    onToggle={() => toggleModel(m.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Defaults row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-fg-4)', marginBottom: 6 }}>默认模型</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 36, boxSizing: 'border-box',
                background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9, cursor: 'pointer',
              }}>
                <ProviderLogo id={selectedId} size={18} />
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {enabledModels[0] ?? providerModels[0]?.id ?? '(未选)'}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-fg-4)', marginBottom: 6 }}>温度 · Temp</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', height: 36, boxSizing: 'border-box',
                background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9,
              }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--t-border)', position: 'relative' }}>
                  <div style={{ width: '20%', height: '100%', background: 'var(--t-accent)', borderRadius: 2 }} />
                  <div style={{ position: 'absolute', left: '20%', top: '50%', transform: 'translate(-50%,-50%)', width: 13, height: 13, borderRadius: '50%', background: 'var(--t-accent)', border: '2px solid var(--t-bg)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-2)' }}>0.2</span>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-fg-4)', marginBottom: 6 }}>路由优先级</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 36, boxSizing: 'border-box',
                background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9, cursor: 'pointer',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
                  background: 'var(--t-accent-tint)', border: '1px solid color-mix(in oklab, var(--t-accent) 35%, transparent)',
                  color: 'var(--t-accent)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                }}>P1 · 回退首选</span>
                <div style={{ flex: 1 }} />
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </div>

          <div style={{ height: 16 }} /> {/* bottom breathing room */}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--t-border)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {/* Test */}
          <button type="button" onClick={handleTest} disabled={testState === 'testing'} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-mono)', fontSize: 11, color: testState === 'ok' ? 'var(--t-ok)' : testState === 'fail' ? 'var(--t-reject)' : 'var(--t-fg-3)',
            background: 'transparent', border: '1px solid var(--t-border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', opacity: testState === 'testing' ? 0.5 : 1,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L15 9V3"/><path d="M8 3h8M7 14h10"/>
            </svg>
            {testState === 'testing' ? '测试中…' : testState === 'ok' ? '连接正常 ✓' : testState === 'fail' ? '连接失败 ✕' : '测试连接'}
          </button>
          {/* Remove */}
          {hasKey && (
            <button type="button" onClick={handleRemove} style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-reject)',
              background: 'transparent',
              border: '1px solid color-mix(in oklab, var(--t-reject) 30%, transparent)',
              borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
            }}>移除密钥</button>
          )}
          <div style={{ flex: 1 }} />
          {/* Unsaved indicator */}
          {isDirty && saveState === 'idle' && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>有未保存的更改 · ⌘S</span>
          )}
          {saveState === 'saved'  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-ok)' }}>✓ 已保存</span>}
          {saveState === 'error'  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-reject)' }}>✕ 保存失败</span>}
          {/* Save */}
          <button type="button" onClick={handleSave} disabled={saveState === 'saving'} style={{
            fontSize: 12.5, fontWeight: 700, color: 'var(--t-accent-ink)',
            background: 'var(--t-accent)', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer',
            opacity: saveState === 'saving' ? 0.5 : 1,
          }}>
            {saveState === 'saving' ? '保存中…' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}
