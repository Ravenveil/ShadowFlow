/**
 * ByokSection — BYOK · API Key 独立设置页 (Variant E design)
 *
 * Design spec: ui_kits/settings-redesign/variant-e.jsx VariantE_BYOK
 * Layout: 300px provider rail | 1fr detail panel (no tab strip)
 * Data: GET /api/settings/byok · GET /api/settings/byok/models · PUT/DELETE /api/settings/byok/:id
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../common/i18n';

const RECOMMENDED_TEMP = 0.2;

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
  /** Cherry Studio-style "点击这里获取密钥" link target */
  docsUrl?: string;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: { name: 'Anthropic',       monogram: 'A',  tint: '#D97706', short: 'Claude family',            defaultUrl: 'https://api.anthropic.com',                           keyPlaceholder: 'sk-ant-…',    noKey: false, docsUrl: 'https://console.anthropic.com/settings/keys' },
  openai:    { name: 'OpenAI',          monogram: 'O',  tint: '#10B981', short: 'GPT family',                defaultUrl: 'https://api.openai.com/v1',                            keyPlaceholder: 'sk-…',        noKey: false, docsUrl: 'https://platform.openai.com/api-keys' },
  google:    { name: 'Google Gemini',   monogram: 'G',  tint: '#4285F4', short: 'Gemini family',             defaultUrl: 'https://generativelanguage.googleapis.com/v1beta',     keyPlaceholder: 'AIza…',       noKey: false, docsUrl: 'https://aistudio.google.com/app/apikey' },
  deepseek:  { name: 'DeepSeek',        monogram: 'DS', tint: '#3D8BFD', short: 'V3 / R1',                  defaultUrl: 'https://api.deepseek.com',                             keyPlaceholder: 'sk-…',        noKey: false, docsUrl: 'https://platform.deepseek.com/api_keys' },
  zhipu:     { name: 'Zhipu GLM',       monogram: 'ZP', tint: '#7C3AED', short: 'GLM-4 family',             defaultUrl: 'https://open.bigmodel.cn/api/paas/v4',                 keyPlaceholder: 'xxxx.yyyyyy', noKey: false, docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  qwen:      { name: 'Qwen · Alibaba',  monogram: 'Qw', tint: '#A855F7', short: 'Alibaba Cloud Bailian',    defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',    keyPlaceholder: 'sk-…',        noKey: false, docsUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
  moonshot:  { name: 'Moonshot · Kimi', monogram: 'MK', tint: '#06B6D4', short: 'K2 / K1.5',               defaultUrl: 'https://api.moonshot.cn/v1',                           keyPlaceholder: 'sk-…',        noKey: false, docsUrl: 'https://platform.moonshot.cn/console/api-keys' },
  mistral:   { name: 'Mistral',         monogram: 'Mi', tint: '#FB923C', short: 'Large 2 · Codestral',      defaultUrl: 'https://api.mistral.ai/v1',                            keyPlaceholder: 'sk-…',        noKey: false, docsUrl: 'https://console.mistral.ai/api-keys/' },
  groq:      { name: 'Groq',            monogram: 'Gr', tint: '#F97316', short: 'LPU inference',            defaultUrl: 'https://api.groq.com/openai/v1',                       keyPlaceholder: 'gsk_…',       noKey: false, docsUrl: 'https://console.groq.com/keys' },
  azure:     { name: 'Azure OpenAI',    monogram: 'Az', tint: '#0078D4', short: 'Enterprise',               defaultUrl: 'https://{deployment}.openai.azure.com',                keyPlaceholder: '…',           noKey: false, docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/' },
  ollama:    { name: 'Ollama',          monogram: 'Ol', tint: '#A1A1AA', short: 'Local',                    defaultUrl: 'http://localhost:11434/v1',                            keyPlaceholder: '',            noKey: true,  docsUrl: 'https://ollama.com' },
  lmstudio:  { name: 'LM Studio',       monogram: 'LM', tint: '#22C55E', short: 'Local',                    defaultUrl: 'http://localhost:1234/v1',                             keyPlaceholder: '',            noKey: true,  docsUrl: 'https://lmstudio.ai' },
};

const PROVIDER_ORDER = ['anthropic','openai','google','deepseek','zhipu','qwen','moonshot','mistral','groq','azure','ollama','lmstudio'];

// ── API helpers ───────────────────────────────────────────────────────────────

interface ProviderData {
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  /** Model IDs last pulled from upstream /models */
  syncedModels?: string[];
  /** Model IDs the user added manually (not present in last sync) */
  manualModels?: string[];
}
interface ByokStore {
  providers: Record<string, ProviderData>;
  defaultModel?: string | null;
  temperature?: number;
  routingPriority?: string;
}
type ModelCapability =
  | 'vision'
  | 'embedding'
  | 'function_calling'
  | 'reasoning'
  | 'image_generation'
  | 'audio'
  | 'rerank'
  | 'web_search';

interface ModelDef {
  id: string;
  name: string;
  provider: string;
  /** Family label for UI grouping (e.g. "GLM-4.5", "Claude 4", "GPT-5", "Embedding") */
  group?: string;
  /** Inferred capabilities for badges + filtering */
  capabilities?: ModelCapability[];
  owned_by?: string;
  description?: string;
}

const FALLBACK_MODELS: ModelDef[] = [
  { id: 'claude-opus-4-7',     name: 'Claude Opus 4.7',    provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',   name: 'Claude Sonnet 4.6',  provider: 'anthropic' },
  { id: 'claude-haiku-4-5',    name: 'Claude Haiku 4.5',   provider: 'anthropic' },
  { id: 'claude-3-5-sonnet',   name: 'Claude 3.5 Sonnet',  provider: 'anthropic' },
  { id: 'gpt-4o',              name: 'GPT-4o',             provider: 'openai'    },
  { id: 'gpt-4o-mini',         name: 'GPT-4o Mini',        provider: 'openai'    },
  { id: 'o3',                  name: 'o3',                 provider: 'openai'    },
  { id: 'o4-mini',             name: 'o4-mini',            provider: 'openai'    },
  { id: 'gemini-2.5-pro',      name: 'Gemini 2.5 Pro',     provider: 'google'    },
  { id: 'gemini-2.5-flash',    name: 'Gemini 2.5 Flash',   provider: 'google'    },
  { id: 'deepseek-chat',       name: 'DeepSeek Chat',      provider: 'deepseek'  },
  { id: 'deepseek-reasoner',   name: 'DeepSeek Reasoner',  provider: 'deepseek'  },
  { id: 'glm-4-flash',         name: 'GLM-4 Flash',        provider: 'zhipu'     },
  { id: 'glm-4-plus',          name: 'GLM-4 Plus',         provider: 'zhipu'     },
  { id: 'qwen3-max',           name: 'Qwen3 Max',          provider: 'qwen'      },
  { id: 'qwen-plus-latest',    name: 'Qwen Plus',          provider: 'qwen'      },
  { id: 'moonshot-v1-8k',      name: 'Moonshot v1 8k',     provider: 'moonshot'  },
  { id: 'mistral-large-latest',name: 'Mistral Large',      provider: 'mistral'   },
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

interface RemoteModelsResult {
  models: ModelDef[];
  count: number;
  /** 'remote' = live fetch ok, 'unavailable' = provider has no /models endpoint, 'error' = upstream failure */
  source: 'remote' | 'unavailable' | 'error';
  /** Normalized base URL returned by the backend (after applying provider suffix rules) */
  effectiveBase?: string;
  errorCode?: string;
  errorMessage?: string;
}

async function loadRemoteModels(providerId: string): Promise<RemoteModelsResult> {
  try {
    const r = await fetch(`${API_BASE}/api/settings/byok/${providerId}/models/remote`, {
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => null);
    const arr: ModelDef[] = Array.isArray(j?.models) ? j.models : [];
    const effectiveBase = typeof j?.effectiveBase === 'string' ? j.effectiveBase : undefined;
    if (!r.ok) {
      return {
        models: arr, count: arr.length, source: 'error', effectiveBase,
        errorCode: j?.error?.code,
        errorMessage: j?.error?.message ?? `HTTP ${r.status}`,
      };
    }
    // 200 with explicit source='unavailable' → provider has no remote catalog endpoint
    if (j?.source === 'unavailable') {
      return {
        models: arr, count: arr.length, source: 'unavailable', effectiveBase,
        errorCode: j?.error?.code,
        errorMessage: j?.error?.message,
      };
    }
    return { models: arr, count: arr.length, source: 'remote', effectiveBase };
  } catch (err) {
    return {
      models: [], count: 0, source: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

async function saveProvider(id: string, payload: Partial<ProviderData> & { defaultModel?: string; temperature?: number; routingPriority?: string }): Promise<boolean> {
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

/** Fetch the full plaintext key for the eye-toggle reveal. null on failure. */
async function revealProviderKey(id: string): Promise<string | null> {
  try {
    const r = await fetch(`${API_BASE}/api/settings/byok/${id}/reveal`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return typeof j?.apiKey === 'string' ? j.apiKey : null;
  } catch { return null; }
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

function InlineDot({ tint }: { tint: string }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%',
      background: tint,
      animation: 'sf-pulse 1.2s ease-in-out infinite',
      display: 'inline-block', flexShrink: 0,
    }} />
  );
}

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

type ModelSource = 'synced' | 'manual' | 'fallback';

function SourceBadge({ source }: { source: ModelSource }) {
  const map: Record<ModelSource, { label: string; tint: string }> = {
    synced:   { label: '远端', tint: 'var(--t-accent)' },
    manual:   { label: '本地', tint: 'var(--t-warn, #d97706)' },
    fallback: { label: '内置', tint: 'var(--t-fg-5)' },
  };
  const m = map[source];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', flexShrink: 0,
      padding: '1px 5px', borderRadius: 3,
      background: `color-mix(in oklab, ${m.tint} 14%, transparent)`,
      border: `1px solid color-mix(in oklab, ${m.tint} 30%, transparent)`,
      color: m.tint,
      fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700,
      letterSpacing: '0.06em',
    }}>{m.label}</span>
  );
}

const CAPABILITY_META: Record<ModelCapability, { glyph: string; label: string; tint: string }> = {
  vision:           { glyph: '👁', label: '视觉',  tint: '#8b5cf6' },
  embedding:        { glyph: '⊚', label: '嵌入',  tint: '#d97706' },
  function_calling: { glyph: 'ƒ', label: '函数',  tint: '#10b981' },
  reasoning:        { glyph: '∴', label: '推理',  tint: '#3b82f6' },
  image_generation: { glyph: '◧', label: '绘图',  tint: '#ec4899' },
  audio:            { glyph: '♪', label: '音频',  tint: '#06b6d4' },
  rerank:           { glyph: '⇅', label: '重排',  tint: '#a855f7' },
  web_search:       { glyph: '⌕', label: '搜索',  tint: '#0ea5e9' },
};

function CapabilityBadges({ caps }: { caps?: ModelCapability[] }) {
  if (!caps || caps.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
      {caps.map(c => {
        const m = CAPABILITY_META[c];
        if (!m) return null;
        return (
          <span
            key={c}
            title={m.label}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 14, height: 14, borderRadius: 3,
              background: `color-mix(in oklab, ${m.tint} 16%, transparent)`,
              border: `1px solid color-mix(in oklab, ${m.tint} 32%, transparent)`,
              color: m.tint,
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, lineHeight: 1,
            }}
          >{m.glyph}</span>
        );
      })}
    </span>
  );
}

function ModelToken({ id, name, checked, source, capabilities, onToggle }: {
  id: string; name: string; checked: boolean; source: ModelSource;
  capabilities?: ModelCapability[]; onToggle: () => void;
}) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--t-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <CapabilityBadges caps={capabilities} />
          <SourceBadge source={source} />
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</div>
      </div>
    </label>
  );
}

// ── Custom Select (flat) ──────────────────────────────────────────────────────

interface SelectOption { value: string; label: string; hint?: string }

function CustomSelect({
  value, onChange, options, ariaLabel,
}: { value: string; onChange: (v: string) => void; options: SelectOption[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', height: 36, boxSizing: 'border-box',
          padding: '0 10px 0 12px',
          background: 'var(--t-bg)',
          border: `1px solid ${open ? 'var(--t-accent)' : 'var(--t-border)'}`,
          borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-2)',
          cursor: 'pointer', textAlign: 'left',
          transition: 'border-color .12s',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.label ?? value}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
             style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--t-panel, var(--t-bg))',
          border: '1px solid var(--t-border)',
          borderRadius: 9,
          padding: 4,
          boxShadow: '0 12px 32px rgba(0,0,0,.25), 0 2px 8px rgba(0,0,0,.15)',
          zIndex: 100,
          maxHeight: 280, overflow: 'auto',
        }}>
          {options.map(opt => {
            const sel = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: sel ? 'var(--t-accent-tint)' : 'transparent',
                  border: 'none', borderRadius: 6,
                  cursor: 'pointer',
                  color: sel ? 'var(--t-accent)' : 'var(--t-fg-2)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: sel ? 700 : 500,
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLButtonElement).style.background = 'var(--t-bg)'; }}
                onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ width: 12, flexShrink: 0, color: 'var(--t-accent)' }}>
                  {sel && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m4 12 5 5L20 6"/>
                    </svg>
                  )}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                {opt.hint && (
                  <span style={{ fontSize: 9.5, color: sel ? 'var(--t-accent)' : 'var(--t-fg-5)', flexShrink: 0, opacity: sel ? 0.7 : 1 }}>{opt.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Custom Select (grouped by provider) ───────────────────────────────────────

function ModelSelect({
  value, onChange, models, placeholder,
}: { value: string; onChange: (v: string) => void; models: ModelDef[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const grouped = useMemo(() => {
    const map: Record<string, ModelDef[]> = {};
    for (const m of models) {
      (map[m.provider] ??= []).push(m);
    }
    return map;
  }, [models]);

  const current = models.find(m => m.id === value);
  const currentMeta = current ? PROVIDER_META[current.provider] : undefined;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', height: 36, boxSizing: 'border-box',
          padding: '0 10px 0 10px',
          background: 'var(--t-bg)',
          border: `1px solid ${open ? 'var(--t-accent)' : 'var(--t-border)'}`,
          borderRadius: 9,
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', textAlign: 'left',
          transition: 'border-color .12s',
        }}
      >
        {current ? (
          <>
            <ProviderLogo id={current.provider} size={20} active={true} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600, color: 'var(--t-fg-2)' }}>
              {current.name}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)', flexShrink: 0 }}>
              {currentMeta?.name ?? current.provider}
            </span>
          </>
        ) : (
          <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-5)' }}>
            {placeholder}
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
             style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      {open && (
        <div role="listbox" style={{
          position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--t-panel, var(--t-bg))',
          border: '1px solid var(--t-border)',
          borderRadius: 9,
          padding: 4,
          boxShadow: '0 -12px 32px rgba(0,0,0,.25), 0 -2px 8px rgba(0,0,0,.15)',
          zIndex: 100,
          maxHeight: 320, overflow: 'auto',
        }}>
          {Object.entries(grouped).map(([providerId, list]) => {
            const meta = PROVIDER_META[providerId];
            return (
              <div key={providerId}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 10px 4px',
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-fg-5)',
                }}>
                  <ProviderLogo id={providerId} size={14} />
                  <span>{meta?.name ?? providerId}</span>
                </div>
                {list.map(m => {
                  const sel = m.id === value;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onClick={() => { onChange(m.id); setOpen(false); }}
                      style={{
                        width: '100%', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px 7px 22px',
                        background: sel ? 'var(--t-accent-tint)' : 'transparent',
                        border: 'none', borderRadius: 6,
                        cursor: 'pointer',
                        color: sel ? 'var(--t-accent)' : 'var(--t-fg-2)',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLButtonElement).style.background = 'var(--t-bg)'; }}
                      onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <span style={{ width: 12, flexShrink: 0, color: 'var(--t-accent)' }}>
                        {sel && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m4 12 5 5L20 6"/>
                          </svg>
                        )}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: sel ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: sel ? 'var(--t-accent)' : 'var(--t-fg-5)', opacity: sel ? 0.7 : 1, flexShrink: 0 }}>
                        {m.id}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Provider rail row ─────────────────────────────────────────────────────────

function ProviderRow({
  id, configured, enabled, modelCount, active, onClick, onToggleEnabled,
}: {
  id: string; configured: boolean; enabled: boolean; modelCount: number; active: boolean;
  onClick: () => void;
  onToggleEnabled?: (next: boolean) => void;
}) {
  const { language } = useI18n();
  const T = (zh: string, en: string) => language === 'zh' ? zh : en;
  const m = PROVIDER_META[id] ?? { name: id, short: '' };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{
        display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 10, alignItems: 'center',
        padding: '9px 10px', cursor: 'pointer', borderRadius: 9, width: '100%', textAlign: 'left',
        background: active ? 'var(--t-accent-tint)' : 'transparent',
        border: active ? '1px solid color-mix(in oklab, var(--t-accent) 35%, transparent)' : '1px solid transparent',
        opacity: configured || active ? 1 : 0.75,
        transition: 'background .12s',
        outline: 'none',
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>
                {T(`${modelCount} 模型 · 已配置`, `${modelCount} models · configured`)}
              </span>
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>{m.short}</span>
          )}
        </div>
      </div>
      {configured ? (
        <button
          type="button"
          aria-label={T(enabled ? '禁用' : '启用', enabled ? 'Disable' : 'Enable')}
          aria-pressed={enabled}
          onClick={(e) => { e.stopPropagation(); onToggleEnabled?.(!enabled); }}
          style={{
            width: 26, height: 15, borderRadius: 999, position: 'relative', flexShrink: 0,
            background: enabled ? 'var(--t-accent)' : 'var(--t-border)',
            border: 'none', padding: 0, cursor: 'pointer',
            transition: 'background .15s',
          }}
        >
          <div style={{
            position: 'absolute', top: 1, [enabled ? 'right' : 'left']: 1,
            width: 11, height: 11, borderRadius: '50%',
            background: enabled ? '#fff' : 'var(--t-fg-4)',
            transition: 'left .15s, right .15s',
          }} />
        </button>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type TestState = 'idle' | 'testing' | 'ok' | 'fail';
type FilterKey = 'all' | 'configured' | 'openai-compat' | 'local';

export function ByokSection() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => language === 'zh' ? zh : en;

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
    const name = window.prompt(T('提供商名称（如：My Provider）', 'Provider name (e.g. My Provider)'));
    if (!name?.trim()) return;
    const baseUrl = window.prompt(T('Base URL（OpenAI 兼容）', 'Base URL (OpenAI-compatible)'), 'https://api.example.com/v1');
    if (!baseUrl?.trim()) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider';
    const id = `custom-${slug}-${Date.now().toString(36).slice(-4)}`;
    const meta: ProviderMeta = {
      name: name.trim(),
      monogram: name.trim().slice(0, 2).toUpperCase(),
      tint: '#71717A',
      short: T('Custom · OpenAI 兼容', 'Custom · OpenAI-compatible'),
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
  // Cherry Studio-style editing: when isEditing=false the input value is
  // the saved key (browser masks via type=password). On focus we lift the
  // saved key into keyInput so the user can backspace / select-all to edit.
  const [isEditing,    setIsEditing]    = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [provEnabled,  setProvEnabled]  = useState(false);
  const [showKey,      setShowKey]      = useState(false);
  // Full plaintext lifted from the server on demand (eye-toggle reveal of a
  // saved key). null = not revealed; falls back to the masked tail.
  const [revealedKey,  setRevealedKey]  = useState<string | null>(null);
  const [saveState,    setSaveState]    = useState<SaveState>('idle');
  const [testState,    setTestState]    = useState<TestState>('idle');
  const [, setIsDirty] = useState(false);  // retained as no-op setter for legacy markDirty callers
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [defaultModelId, setDefaultModelId] = useState<string>('');
  const [temperature,    setTemperature]    = useState<number>(0.2);
  const [routingPriority, setRoutingPriority] = useState<string>('fallback');

  useEffect(() => {
    Promise.all([loadStore(), loadModels()]).then(([s, m]) => {
      setStore(s);
      setAllModels(m);
      if (typeof s.temperature === 'number') setTemperature(s.temperature);
      if (typeof s.routingPriority === 'string') setRoutingPriority(s.routingPriority);
      if (typeof s.defaultModel === 'string' && s.defaultModel) setDefaultModelId(s.defaultModel);
    });
  }, []);

  const [refreshNote, setRefreshNote] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  async function refreshModels() {
    setRefreshingModels(true);
    setRefreshNote(null);
    try {
      const result = await loadRemoteModels(selectedId);

      // Provider doesn't expose a remote model catalog (e.g. Zhipu's paas/v4)
      // → quietly fall back to the static catalog and surface a neutral hint.
      if (result.source === 'unavailable') {
        const fallback = await loadModels();
        setAllModels(fallback);
        setRefreshNote({
          tone: 'warn',
          text: T(
            '该提供商未提供模型列表接口，已使用本地目录',
            'Provider has no model catalog endpoint; using local catalog',
          ),
        });
        return;
      }

      // Genuine upstream failure (network / auth / 5xx)
      if (result.source === 'error') {
        const fallback = await loadModels();
        setAllModels(fallback);
        const msg = result.errorCode === 'UPSTREAM_AUTH'
          ? T('鉴权失败，请检查 API Key', 'Auth failed — check API key')
          : T(`远端拉取失败：${result.errorMessage}`, `Remote fetch failed: ${result.errorMessage}`);
        setRefreshNote({ tone: 'err', text: msg });
        return;
      }

      // result.source === 'remote'
      if (result.count === 0) {
        setRefreshNote({
          tone: 'warn',
          text: T('远端响应正常，但未返回模型', 'Upstream returned 0 models'),
        });
        return;
      }

      // Merge synced (remote) + manual (locally added) + static fallback for this provider
      const syncedIds = new Set(result.models.map(m => m.id));
      const existing = store.providers[selectedId];
      // Anything we had before that the remote no longer returns → reclassify as manual
      const prevModelIds = existing?.models ?? [];
      const prevManual = existing?.manualModels ?? [];
      const newManual = Array.from(new Set([
        ...prevManual,
        ...prevModelIds.filter(id => !syncedIds.has(id)),
      ]));

      // Build manual ModelDef entries (use existing names from allModels/FALLBACK if available)
      const knownById = new Map<string, ModelDef>();
      for (const m of [...allModels, ...FALLBACK_MODELS]) knownById.set(m.id, m);
      const manualDefs: ModelDef[] = newManual.map(id => knownById.get(id) ?? {
        id, name: id, provider: selectedId,
      });

      setAllModels(prev => {
        const others = prev.filter(m => m.provider !== selectedId);
        // Remote entries first (so the menu groups them at the top), then manual-only
        const remoteIds = new Set(result.models.map(m => m.id));
        const manualOnly = manualDefs.filter(m => !remoteIds.has(m.id));
        return [...others, ...result.models, ...manualOnly];
      });

      // Persist: syncedModels = remote IDs, manualModels = leftover, baseUrl = effectiveBase
      const persistedSynced = Array.from(syncedIds);
      const persistPatch: Partial<ProviderData> = {
        syncedModels: persistedSynced,
        manualModels: newManual,
      };
      if (result.effectiveBase && result.effectiveBase !== existing?.baseUrl) {
        persistPatch.baseUrl = result.effectiveBase;
        setBaseUrlInput(result.effectiveBase);
      }
      await saveProvider(selectedId, persistPatch);
      loadStore().then(setStore);

      setRefreshNote({
        tone: 'ok',
        text: newManual.length > 0
          ? T(`已同步 ${result.count} 个远端模型，保留 ${newManual.length} 个本地补录`,
              `Synced ${result.count} remote, kept ${newManual.length} local`)
          : T(`已从远端拉取 ${result.count} 个模型`,
              `Pulled ${result.count} models from upstream`),
      });
    } finally {
      setRefreshingModels(false);
      setTimeout(() => setRefreshNote(null), 4000);
    }
  }

  async function toggleProviderEnabled(id: string, next: boolean) {
    // Optimistically reflect in local store so the rail toggle moves immediately
    setStore(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [id]: { ...(prev.providers[id] ?? { apiKey: '', baseUrl: '', models: [], enabled: false }), enabled: next },
      },
    }));
    await saveProvider(id, { enabled: next });
    loadStore().then(setStore);
  }

  async function persistPref(patch: { defaultModel?: string; temperature?: number; routingPriority?: string }) {
    await saveProvider(selectedId, patch);
    loadStore().then(setStore);
  }

  const selectedMeta  = PROVIDER_META[selectedId] ?? PROVIDER_META['anthropic'];
  const savedState    = store.providers[selectedId];
  const providerModels = allModels.filter(m => m.provider === selectedId);

  useEffect(() => {
    const saved = store.providers[selectedId];
    setKeyInput('');
    setShowKey(false);
    setRevealedKey(null);
    setSaveState('idle');
    setTestState('idle');
    setIsDirty(false);
    setBaseUrlInput(saved?.baseUrl || selectedMeta.defaultUrl);
    setProvEnabled(saved?.enabled ?? false);
    const defaults = allModels.filter(m => m.provider === selectedId).map(m => m.id);
    setEnabledModels(saved?.models?.length ? saved.models : defaults);
  }, [selectedId, store]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cherry Studio-style auto-save: every input/toggle flushes immediately to
  // the backend. No "保存配置" button — markDirty/handleSave are kept only
  // for backwards compat with code paths that still reference them.
  function markDirty() { setSaveState('idle'); }

  async function autoSave(patch: Partial<ProviderData>) {
    setSaveState('saving');
    const ok = await saveProvider(selectedId, patch);
    if (ok) {
      setSaveState('saved');
      loadStore().then(setStore);
      setTimeout(() => setSaveState(s => s === 'saved' ? 'idle' : s), 1500);
    } else {
      setSaveState('error');
      setTimeout(() => setSaveState(s => s === 'error' ? 'idle' : s), 3000);
    }
    return ok;
  }

  async function toggleModel(modelId: string) {
    const next = enabledModels.includes(modelId)
      ? enabledModels.filter(m => m !== modelId)
      : [...enabledModels, modelId];
    setEnabledModels(next);
    await autoSave({ models: next });
  }


  async function handleRemove() {
    const ok = await deleteProvider(selectedId);
    if (ok) {
      loadStore().then(setStore);
    }
  }

  interface KeyCheckResult {
    keyTail: string;
    status: 'ok' | 'failed' | 'unavailable';
    latencyMs?: number;
    statusCode?: number;
    error?: string;
  }
  const [checkResults, setCheckResults] = useState<KeyCheckResult[] | null>(null);
  const [checkOverall, setCheckOverall] = useState<'idle' | 'checking' | 'ok' | 'failed' | 'unavailable'>('idle');

  async function handleTest() {
    setTestState('testing');
    setCheckOverall('checking');
    setCheckResults(null);
    try {
      const r = await fetch(`${API_BASE}/api/settings/byok/${selectedId}/check`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setTestState('fail');
        setCheckOverall('failed');
        setCheckResults([{
          keyTail: '(error)',
          status: 'failed',
          error: j?.error?.message ?? `HTTP ${r.status}`,
        }]);
      } else {
        const overall = j?.overall as 'ok' | 'failed' | 'unavailable';
        setCheckOverall(overall);
        setCheckResults(Array.isArray(j?.results) ? j.results : []);
        setTestState(overall === 'ok' ? 'ok' : overall === 'unavailable' ? 'ok' : 'fail');
      }
    } catch (err) {
      setTestState('fail');
      setCheckOverall('failed');
      setCheckResults([{
        keyTail: '(network)',
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }]);
    }
    setTimeout(() => setTestState('idle'), 6000);
  }

  const LOCAL_IDS = new Set(['ollama', 'lmstudio']);
  const OAI_COMPAT_IDS = new Set(['openai','deepseek','zhipu','qwen','moonshot','mistral','groq','azure','ollama','lmstudio']);

  const RAIL_FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',          label: T('全部', 'All') },
    { key: 'configured',   label: T('已配置', 'Configured') },
    { key: 'openai-compat',label: 'OpenAI' },
    { key: 'local',        label: T('本地', 'Local') },
  ];

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
  const isConfigured = hasKey || (selectedMeta.noKey && Boolean(savedState));
  const isVerified = savedState?.enabled;

  return (
    <div className="sf-settings-bg" style={{
      flex: '1 1 0', minHeight: 400,
      display: 'grid', gridTemplateColumns: '300px 1fr',
      overflow: 'hidden',
    }}>
      {/* ── Provider rail ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--t-border)' }}>
        {/* Rail header */}
        <div style={{ padding: '13px 13px 10px', borderBottom: '1px solid var(--t-border)' }}>
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
              placeholder={T('搜索提供商…', 'Search providers…')}
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
              {T(`已配置 · ${configuredIds.length}`, `Configured · ${configuredIds.length}`)}
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
              onToggleEnabled={(next) => toggleProviderEnabled(id, next)}
            />
          ))}
          {availableIds.length > 0 && (
            <div style={{ padding: '10px 8px 6px', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-fg-5)', textTransform: 'uppercase' }}>
              {T(`可用 · ${availableIds.length}`, `Available · ${availableIds.length}`)}
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{T('自定义提供商…', 'Custom provider…')}</span>
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
                  {T('当前已选', 'Active')}
                </span>
              )}
              {isVerified && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
                  background: 'var(--t-ok-tint)', border: '1px solid color-mix(in oklab, var(--t-ok) 35%, transparent)',
                  color: 'var(--t-ok)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m4 12 5 5L20 6"/></svg>
                  {T('已验证', 'Verified')}
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)' }}>
              {selectedMeta.short}
              {savedState?.models?.length ? T(` · ${savedState.models.length} 模型已启用`, ` · ${savedState.models.length} models enabled`) : ''}
            </div>
          </div>
          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--t-fg-3)' }}>
              {T('启用', 'Enable')}
            </span>
            <Toggle on={provEnabled} onChange={v => { setProvEnabled(v); autoSave({ enabled: v }); }} />
          </div>
        </div>

        {/* Fields area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* API Key + Base URL */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {/* API Key — server returns the saved key already masked as
                "••••XXXX" (settings.ts:197 maskApiKey); the real plaintext is
                never sent to the client. When saved we display that masked
                value so the eye toggle can reveal the last-4 tail. On focus we
                clear into a fresh editing buffer because we cannot
                round-trip the real key for in-place editing anyway.
                (2026-05-24 fix; 2026-05-29 reveal-tail fix.) */}
            {!selectedMeta.noKey && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-fg)', letterSpacing: '-0.005em' }}>
                    {T('API 密钥', 'API Key')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--t-fg-5)' }}>
                    {/* Honest label: keys are stored as plaintext JSON locally
                        (server/src/storage/settings.ts), not encrypted at rest.
                        The eye-reveal endpoint returns that plaintext. */}
                    {T('本地存储', 'Stored locally')}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    // Value resolution (not editing):
                    //  • eye ON + plaintext fetched → full key (revealedKey)
                    //  • otherwise saved → masked tail (`••••XXXX`, the server
                    //    default; settings.ts:197 maskApiKey)
                    //  • no key → empty (placeholder shows)
                    // Editing always reflects the user's live keyInput.
                    // (2026-05-29: eye reveal now fetches the full plaintext via
                    // /byok/:id/reveal; previously rendered a fixed 40-bullet
                    // string that made "显示" a no-op.)
                    value={
                      isEditing
                        ? keyInput
                        : (showKey && revealedKey != null
                            ? revealedKey
                            : (hasKey ? (savedState?.apiKey ?? '') : ''))
                    }
                    onChange={e => {
                      setKeyInput(e.target.value);
                      markDirty();
                    }}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && keyInput.trim()) {
                        const ok = await autoSave({ apiKey: keyInput.trim() });
                        if (ok) {
                          setKeyInput('');
                          setIsEditing(false);
                        }
                      }
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'var(--t-accent)';
                      if (!isEditing) {
                        // Start fresh — user types a new value to replace the
                        // saved key (or leaves empty to keep it). Drop any
                        // revealed plaintext so the editing buffer starts clean.
                        setKeyInput('');
                        setRevealedKey(null);
                        setIsEditing(true);
                      }
                    }}
                    onBlur={async e => {
                      e.target.style.borderColor = 'var(--t-border)';
                      if (isEditing) {
                        const trimmed = keyInput.trim();
                        if (trimmed.length > 0) {
                          // User typed a new key — save it
                          await autoSave({ apiKey: trimmed });
                        } else if (hasKey && keyInput === '') {
                          // Field was emptied but user didn't type anything
                          // new. Treat as "no-op cancel" (do NOT delete the
                          // saved key on bare-blur — too easy to lose it).
                          // If user actually wants to delete, they can
                          // use the 移除密钥 button.
                        }
                      }
                      setKeyInput('');
                      setIsEditing(false);
                    }}
                    placeholder={hasKey ? T('输入新值替换保存的密钥', 'Type to replace saved key') : selectedMeta.keyPlaceholder}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '0 130px 0 14px', height: 40,
                      background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 10,
                      fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t-fg)',
                      letterSpacing: showKey ? 'normal' : '0.05em',
                      outline: 'none',
                    }}
                  />
                  <div style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', gap: 4, alignItems: 'center',
                  }}>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = !showKey;
                        setShowKey(next);
                        if (!next) { setRevealedKey(null); return; }
                        // Turning ON for a saved key (not mid-edit) → fetch the
                        // full plaintext. While editing, keyInput already holds
                        // what the user typed, so no fetch needed.
                        if (!isEditing && hasKey && revealedKey == null) {
                          const full = await revealProviderKey(selectedId);
                          if (full != null) setRevealedKey(full);
                        }
                      }}
                      title={showKey ? T('隐藏', 'Hide') : T('显示', 'Show')}
                      style={{
                        background: 'transparent', border: 'none',
                        color: 'var(--t-fg-4)', cursor: 'pointer', padding: 4,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {showKey ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3l18 18"/><path d="M10.6 6.2A10 10 0 0 1 12 6c7 0 10 6 10 6a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3 6 10 6c1.6 0 3-.3 4.2-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                    {/* 检测 button — Cherry Studio style, sans-serif.
                        2026-05-18: gate on `hasKey || keyInput.trim()` so the
                        button stays clickable even when the daemon's
                        `apiKey` field comes back as a masked string the
                        client can't decrypt, OR when the user just typed a
                        key but autosave hasn't fired yet. handleTest itself
                        falls back to the live input when savedState is
                        empty. */}
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={checkOverall === 'checking' || (!hasKey && !keyInput.trim())}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        padding: '5px 12px', borderRadius: 7,
                        background: checkOverall === 'ok' ? 'var(--t-ok-tint)'
                                   : checkOverall === 'failed' ? 'color-mix(in oklab, var(--t-reject) 12%, transparent)'
                                   : checkOverall === 'unavailable' ? 'color-mix(in oklab, var(--t-warn, #d97706) 12%, transparent)'
                                   : 'var(--t-bg)',
                        border: `1px solid ${
                          checkOverall === 'ok' ? 'color-mix(in oklab, var(--t-ok) 40%, transparent)'
                          : checkOverall === 'failed' ? 'color-mix(in oklab, var(--t-reject) 40%, transparent)'
                          : checkOverall === 'unavailable' ? 'color-mix(in oklab, var(--t-warn, #d97706) 40%, transparent)'
                          : 'var(--t-border)'}`,
                        color: checkOverall === 'ok' ? 'var(--t-ok)'
                              : checkOverall === 'failed' ? 'var(--t-reject)'
                              : checkOverall === 'unavailable' ? 'var(--t-warn, #d97706)'
                              : 'var(--t-fg-2)',
                        cursor: checkOverall === 'checking' || (!hasKey && !keyInput.trim()) ? 'not-allowed' : 'pointer',
                        opacity: (!hasKey && !keyInput.trim()) ? 0.5 : 1,
                      }}
                      title={(!hasKey && !keyInput.trim()) ? T('需要先输入或保存密钥', 'Enter or save a key first') : T('检测密钥连通性', 'Check key connectivity')}
                    >
                      {checkOverall === 'checking' ? T('检测中…', 'Checking…')
                        : checkOverall === 'ok' ? T('通过 ✓', 'OK ✓')
                        : checkOverall === 'failed' ? T('失败 ✕', 'Failed ✕')
                        : checkOverall === 'unavailable' ? T('不支持', 'Unsupported')
                        : T('检测', 'Check')}
                    </button>
                  </div>
                </div>
                {/* Lower hints row: docs link (left) + multi-key hint (right) */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 6, gap: 8, flexWrap: 'wrap',
                }}>
                  {selectedMeta.docsUrl ? (
                    <a
                      href={selectedMeta.docsUrl}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        fontSize: 11, color: 'var(--t-accent)',
                        textDecoration: 'none',
                      }}
                    >{T('点击这里获取密钥', 'Click here to get a key')}</a>
                  ) : <span />}
                  <span style={{ fontSize: 11, color: 'var(--t-fg-5)' }}>
                    {T('多个密钥使用逗号分隔', 'Multiple keys: separate with ","')}
                  </span>
                </div>
                {/* Per-key check results strip */}
                {checkResults && checkResults.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                    {checkResults.map((r, i) => {
                      const tint = r.status === 'ok' ? 'var(--t-ok)'
                                 : r.status === 'unavailable' ? 'var(--t-warn, #d97706)'
                                 : 'var(--t-reject)';
                      const errorShort = r.error
                        ? r.error.length > 60 ? r.error.slice(0, 60) + '…' : r.error
                        : '';
                      return (
                        <span
                          key={i}
                          title={r.error ?? `${r.statusCode ?? ''} ${r.latencyMs ?? '-'}ms`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '3px 9px', borderRadius: 6,
                            background: `color-mix(in oklab, ${tint} 12%, transparent)`,
                            border: `1px solid color-mix(in oklab, ${tint} 30%, transparent)`,
                            color: tint, fontSize: 11, fontWeight: 500,
                          }}
                        >
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{r.keyTail}</span>
                          <span style={{ fontWeight: 700 }}>
                            {r.status === 'ok' ? '✓' : r.status === 'unavailable' ? '?' : '✕'}
                          </span>
                          {typeof r.latencyMs === 'number' && r.status === 'ok' && (
                            <span style={{ opacity: 0.65, fontFamily: 'var(--font-mono)' }}>{r.latencyMs}ms</span>
                          )}
                          {r.status === 'failed' && r.statusCode && (
                            <span style={{ opacity: 0.65, fontFamily: 'var(--font-mono)' }}>HTTP {r.statusCode}</span>
                          )}
                          {r.status === 'failed' && errorShort && (
                            <span style={{ opacity: 0.8 }}>· {errorShort}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Base URL */}
            <div style={selectedMeta.noKey ? { gridColumn: '1 / -1' } : {}}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-fg)', letterSpacing: '-0.005em' }}>
                  {T('API 地址', 'API Address')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--t-fg-5)' }}>
                    {T('代理 / 自定义网关可在此覆盖', 'Override for proxy / custom gateway')}
                  </span>
                  {baseUrlInput !== selectedMeta.defaultUrl && (
                    <button
                      type="button"
                      onClick={async () => {
                        setBaseUrlInput(selectedMeta.defaultUrl);
                        await autoSave({ baseUrl: selectedMeta.defaultUrl });
                      }}
                      title={T('重置为默认地址', 'Reset to default')}
                      style={{
                        fontSize: 11, fontWeight: 500,
                        padding: '2px 9px', borderRadius: 5,
                        background: 'transparent',
                        border: '1px solid color-mix(in oklab, var(--t-reject) 30%, transparent)',
                        color: 'var(--t-reject)', cursor: 'pointer',
                      }}
                    >
                      {T('重置', 'Reset')}
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={baseUrlInput}
                onChange={e => { setBaseUrlInput(e.target.value); markDirty(); }}
                placeholder={selectedMeta.defaultUrl}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '0 14px', height: 40,
                  background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 10,
                  fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t-fg)',
                  outline: 'none',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--t-accent)')}
                onBlur={async e => {
                  e.target.style.borderColor = 'var(--t-border)';
                  // Auto-save baseUrl on blur if changed
                  const trimmed = baseUrlInput.trim();
                  const saved = savedState?.baseUrl ?? '';
                  if (trimmed && trimmed !== saved) {
                    await autoSave({ baseUrl: trimmed });
                  }
                }}
              />
              {baseUrlInput && (
                <div style={{ fontSize: 11, color: 'var(--t-fg-5)', marginTop: 6, display: 'flex', gap: 6 }}>
                  <span>{T('预览', 'Preview')}</span>
                  <span style={{ color: 'var(--t-fg-5)' }}>·</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--t-fg-4)' }}>
                    {baseUrlInput.replace(/\/$/, '')}/chat/completions
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Models grid */}
          {providerModels.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-fg)', letterSpacing: '-0.005em' }}>
                    {T('模型', 'Models')}
                  </span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
                    background: 'var(--t-bg)', border: '1px solid var(--t-border)',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--t-fg-3)',
                  }}>
                    {T(`${enabledModels.length} / ${providerModels.length} 已启用`, `${enabledModels.length} / ${providerModels.length} enabled`)}
                  </span>
                  {refreshNote && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                      background: refreshNote.tone === 'ok' ? 'var(--t-ok-tint)'
                                : refreshNote.tone === 'err' ? 'color-mix(in oklab, var(--t-reject) 14%, transparent)'
                                : 'color-mix(in oklab, var(--t-warn, #d97706) 14%, transparent)',
                      border: `1px solid ${refreshNote.tone === 'ok' ? 'color-mix(in oklab, var(--t-ok) 35%, transparent)'
                                          : refreshNote.tone === 'err' ? 'color-mix(in oklab, var(--t-reject) 35%, transparent)'
                                          : 'color-mix(in oklab, var(--t-warn, #d97706) 35%, transparent)'}`,
                      color: refreshNote.tone === 'ok' ? 'var(--t-ok)'
                           : refreshNote.tone === 'err' ? 'var(--t-reject)'
                           : 'var(--t-warn, #d97706)',
                    }}>
                      {refreshNote.text}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <button type="button" onClick={refreshModels} disabled={refreshingModels} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', background: 'transparent', border: 'none', cursor: refreshingModels ? 'wait' : 'pointer', opacity: refreshingModels ? 0.5 : 1 }}>
                    {refreshingModels ? T('↻ 拉取中…', '↻ Fetching…') : T('↻ 拉取列表', '↻ Refresh')}
                  </button>
                  <button type="button" onClick={async () => {
                    const all = providerModels.map(m => m.id);
                    setEnabledModels(all);
                    await autoSave({ models: all });
                  }} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    {T('全选', 'All')}
                  </button>
                  <button type="button" onClick={async () => {
                    setEnabledModels([]);
                    await autoSave({ models: [] });
                  }} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    {T('取消', 'None')}
                  </button>
                </div>
              </div>
              {(() => {
                // Group models by their `group` field (family label) — Cherry Studio
                // does this so users see "GLM-4.5", "GLM-4.6V", "Embedding" headings
                // instead of a flat 80-row list. Models without a group fall under '其他'.
                const grouped = new Map<string, ModelDef[]>();
                for (const m of providerModels) {
                  const key = m.group || '其他';
                  const arr = grouped.get(key) ?? [];
                  arr.push(m);
                  grouped.set(key, arr);
                }
                // Stable ordering: Embedding / Rerank / Image / Audio last, families A-Z
                const SPECIAL_ORDER = ['Embedding', 'Rerank', 'Image', 'Audio', '其他'];
                const families = [...grouped.keys()]
                  .filter(g => !SPECIAL_ORDER.includes(g))
                  .sort((a, b) => a.localeCompare(b));
                const groups = [...families, ...SPECIAL_ORDER.filter(g => grouped.has(g))];

                const synced = savedState?.syncedModels ?? [];
                const manual = savedState?.manualModels ?? [];

                return groups.map(groupName => {
                  const list = grouped.get(groupName)!;
                  return (
                    <div key={groupName} style={{ marginBottom: 12 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 0 4px',
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.08em', color: 'var(--t-fg-3)',
                      }}>
                        <span>{groupName}</span>
                        <span style={{ color: 'var(--t-fg-5)', fontWeight: 500 }}>·</span>
                        <span style={{ color: 'var(--t-fg-5)', fontWeight: 500 }}>{list.length}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                        {list.map(m => {
                          const source: ModelSource =
                            synced.includes(m.id) ? 'synced'
                            : manual.includes(m.id) ? 'manual'
                            : 'fallback';
                          return (
                            <ModelToken
                              key={m.id} id={m.id} name={m.name} source={source}
                              capabilities={m.capabilities}
                              checked={enabledModels.includes(m.id)}
                              onToggle={() => toggleModel(m.id)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Defaults row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-fg-4)', marginBottom: 6 }}>
                {T('默认模型', 'Default Model')}
              </div>
              <ModelSelect
                value={defaultModelId || (enabledModels[0] ?? providerModels[0]?.id ?? '')}
                onChange={(v) => { setDefaultModelId(v); persistPref({ defaultModel: v }); }}
                models={allModels}
                placeholder={T('(未选)', '(none)')}
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-fg-4)' }}>
                  {T('温度', 'Temperature')}
                </span>
                <button
                  type="button"
                  onClick={() => { setTemperature(RECOMMENDED_TEMP); persistPref({ temperature: RECOMMENDED_TEMP }); }}
                  title={T('点击重置为建议值', 'Click to reset to suggested value')}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9.5,
                    color: Math.abs(temperature - RECOMMENDED_TEMP) < 0.01 ? 'var(--t-accent)' : 'var(--t-fg-5)',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  {T('建议', 'Suggested')} {RECOMMENDED_TEMP.toFixed(1)} ↺
                </button>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', height: 36, boxSizing: 'border-box',
                background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9, position: 'relative',
              }}>
                {/* Suggested-value tick mark under the track */}
                <div style={{
                  position: 'absolute', pointerEvents: 'none',
                  left: `calc(12px + (100% - 24px - 36px) * ${RECOMMENDED_TEMP / 2})`,
                  bottom: 4, width: 2, height: 4, borderRadius: 1,
                  background: 'color-mix(in oklab, var(--t-accent) 60%, transparent)',
                }} />
                <input
                  type="range" min={0} max={2} step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  onMouseUp={() => persistPref({ temperature })}
                  onTouchEnd={() => persistPref({ temperature })}
                  style={{ flex: 1, accentColor: 'var(--t-accent)' }}
                />
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  color: Math.abs(temperature - RECOMMENDED_TEMP) < 0.01 ? 'var(--t-accent)' : 'var(--t-fg-2)',
                  minWidth: 24, textAlign: 'right',
                }}>{temperature.toFixed(1)}</span>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-fg-4)', marginBottom: 6 }}>
                {T('路由优先级', 'Routing Priority')}
              </div>
              <CustomSelect
                value={routingPriority}
                onChange={(v) => { setRoutingPriority(v); persistPref({ routingPriority: v }); }}
                ariaLabel={T('路由优先级', 'Routing Priority')}
                options={[
                  { value: 'fallback', label: T('回退首选', 'Fallback'), hint: 'P1' },
                  { value: 'primary',  label: T('主选', 'Primary'),     hint: 'P0' },
                  { value: 'backup',   label: T('备份', 'Backup'),      hint: 'P2' },
                  { value: 'disabled', label: T('已禁用', 'Disabled'),  hint: '—'  },
                ]}
              />
            </div>
          </div>

          <div style={{ height: 16 }} />
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--t-border)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button type="button" onClick={handleTest} disabled={testState === 'testing'} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: testState === 'ok' ? 'var(--t-ok)' : testState === 'fail' ? 'var(--t-reject)' : 'var(--t-fg-3)',
            background: 'transparent', border: '1px solid var(--t-border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
            opacity: testState === 'testing' ? 0.5 : 1,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L15 9V3"/><path d="M8 3h8M7 14h10"/>
            </svg>
            {testState === 'testing' ? T('测试中…', 'Testing…')
              : testState === 'ok'     ? T('连接正常 ✓', 'Connected ✓')
              : testState === 'fail'   ? T('连接失败 ✕', 'Failed ✕')
              : T('测试连接', 'Test Connection')}
          </button>
          {hasKey && (
            <button type="button" onClick={handleRemove} style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-reject)',
              background: 'transparent',
              border: '1px solid color-mix(in oklab, var(--t-reject) 30%, transparent)',
              borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
            }}>
              {T('移除密钥', 'Remove Key')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {/* Auto-save indicator — Cherry Studio is silent on idle, briefly
              shows 保存中… / ✓ 已保存 / ✕ 保存失败 next to where the save
              button used to be. No explicit save button. */}
          {saveState === 'saving' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: 'var(--t-fg-4)',
            }}>
              <InlineDot tint="var(--t-fg-4)" />
              {T('保存中…', 'Saving…')}
            </span>
          )}
          {saveState === 'saved' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color: 'var(--t-ok)',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 12 5 5L20 6"/>
              </svg>
              {T('已自动保存', 'Auto-saved')}
            </span>
          )}
          {saveState === 'error' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color: 'var(--t-reject)',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
              {T('保存失败 · 请重试', 'Save failed · retry')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
