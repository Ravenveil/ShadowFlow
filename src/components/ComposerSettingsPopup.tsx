/**
 * ComposerSettingsPopup — floating settings panel triggered by the composer gear icon.
 *
 * Shows mid-session tweakable settings (API key, provider, temperature, max tokens)
 * without navigating away. Reads/writes the same localStorage keys as SettingsPage
 * so changes take effect on the next send.
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey,
  maskApiKey,
  getDefaultProvider,
  setDefaultProvider,
  PROVIDER_IDS,
  MAX_TOKENS_STORAGE,
  MAX_TOKENS_MIN,
  MAX_TOKENS_MAX,
  TEMPERATURE_STORAGE,
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
  type ProviderId,
} from '../api/_base';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  zhipu: 'Zhipu (智谱)',
};

interface Props {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function ComposerSettingsPopup({ onClose, anchorRef }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);

  // ── Provider & API Key ────────────────────────────────────────────────────
  const [provider, setProvider] = useState<ProviderId>(() => getDefaultProvider());
  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey(provider));
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  // Reset key input when provider changes
  useEffect(() => {
    setApiKey(getStoredApiKey(provider));
    setKeyInput('');
    setShowKey(false);
    setKeySaved(false);
  }, [provider]);

  function handleProviderChange(p: ProviderId) {
    setProvider(p);
    setDefaultProvider(p);
  }

  function handleKeySave() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setStoredApiKey(trimmed, provider);
    setApiKey(trimmed);
    setKeyInput('');
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 1800);
  }

  function handleKeyClear() {
    clearStoredApiKey(provider);
    setApiKey(null);
    setKeyInput('');
  }

  // ── Generation settings ───────────────────────────────────────────────────
  const [maxTokens, setMaxTokens] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(MAX_TOKENS_STORAGE) ?? '', 10);
    return isNaN(v) ? 8192 : Math.min(Math.max(v, MAX_TOKENS_MIN), MAX_TOKENS_MAX);
  });
  const [temperature, setTemperature] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem(TEMPERATURE_STORAGE) ?? '');
    return isNaN(v) ? 0.7 : Math.min(Math.max(v, TEMPERATURE_MIN), TEMPERATURE_MAX);
  });

  function commitMaxTokens(v: number) {
    const clamped = Math.min(Math.max(Math.round(v / 512) * 512, MAX_TOKENS_MIN), MAX_TOKENS_MAX);
    setMaxTokens(clamped);
    localStorage.setItem(MAX_TOKENS_STORAGE, String(clamped));
  }

  function commitTemperature(v: number) {
    const clamped = Math.min(Math.max(Math.round(v * 100) / 100, TEMPERATURE_MIN), TEMPERATURE_MAX);
    setTemperature(clamped);
    localStorage.setItem(TEMPERATURE_STORAGE, String(clamped));
  }

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose, anchorRef]);

  // ── Keyboard close ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 10px)',
        left: 0,
        zIndex: 120,
        width: 320,
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-hud)',
        overflow: 'hidden',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
      role="dialog"
      aria-label="会话设置"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--t-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.01em', color: 'var(--t-fg)' }}>
          会话设置
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, borderRadius: 6, cursor: 'pointer', color: 'var(--t-fg-4)', padding: 0 }}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>

        {/* ── Provider section ─────────────────────────── */}
        <section>
          <SectionLabel>AI Provider</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {PROVIDER_IDS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderChange(p)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  border: `1px solid ${provider === p ? 'var(--t-accent)' : 'var(--t-border)'}`,
                  background: provider === p ? 'var(--t-accent-tint)' : 'transparent',
                  color: provider === p ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
                  fontSize: 11,
                  fontWeight: provider === p ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all .12s',
                }}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </section>

        {/* ── API Key section ──────────────────────────── */}
        <section>
          <SectionLabel>API Key — {PROVIDER_LABELS[provider]}</SectionLabel>
          <div style={{ marginTop: 6 }}>
            {apiKey ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                  color: 'var(--t-fg-3)', background: 'var(--t-bg)', border: '1px solid var(--t-border)',
                  borderRadius: 7, padding: '4px 8px', letterSpacing: '.04em',
                }}>
                  {maskApiKey(apiKey)}
                </span>
                <button type="button" onClick={handleKeyClear} style={iconBtnStyle} title="清除 Key">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleKeySave()}
                  placeholder="粘贴 API Key…"
                  style={{
                    flex: 1, height: 28, padding: '0 8px',
                    background: 'var(--t-bg)', border: '1px solid var(--t-border)',
                    borderRadius: 7, outline: 'none', fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)', color: 'var(--t-fg)',
                    transition: 'border-color .12s',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-border)')}
                />
                <button type="button" onClick={() => setShowKey(v => !v)} style={iconBtnStyle} title={showKey ? '隐藏' : '显示'}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    {showKey
                      ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                    }
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleKeySave}
                  disabled={!keyInput.trim()}
                  style={{
                    height: 28, padding: '0 10px', borderRadius: 7,
                    background: keyInput.trim() ? 'var(--t-accent)' : 'var(--t-bg)',
                    border: `1px solid ${keyInput.trim() ? 'var(--t-accent)' : 'var(--t-border)'}`,
                    color: keyInput.trim() ? 'var(--t-accent-ink)' : 'var(--t-fg-5)',
                    fontSize: 11, fontWeight: 500, cursor: keyInput.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all .12s',
                  }}
                >
                  {keySaved ? '已保存 ✓' : '保存'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Temperature ──────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SectionLabel>Temperature</SectionLabel>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--t-fg-3)', tabularNums: true } as React.CSSProperties}>
              {temperature.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={TEMPERATURE_MIN}
            max={TEMPERATURE_MAX}
            step={0.01}
            value={temperature}
            onChange={e => commitTemperature(parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: 6, accentColor: 'var(--t-accent)', cursor: 'pointer', height: 4 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={rangeHintStyle}>精确</span>
            <span style={rangeHintStyle}>创意</span>
          </div>
        </section>

        {/* ── Max Tokens ───────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SectionLabel>Max Output Tokens</SectionLabel>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--t-fg-3)' }}>
              {maxTokens.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={MAX_TOKENS_MIN}
            max={MAX_TOKENS_MAX}
            step={512}
            value={maxTokens}
            onChange={e => commitMaxTokens(parseInt(e.target.value, 10))}
            style={{ width: '100%', marginTop: 6, accentColor: 'var(--t-accent)', cursor: 'pointer', height: 4 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={rangeHintStyle}>{MAX_TOKENS_MIN.toLocaleString()}</span>
            <span style={rangeHintStyle}>{MAX_TOKENS_MAX.toLocaleString()}</span>
          </div>
        </section>

        {/* ── Footer link ──────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--t-border)', paddingTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <a
            href="/settings"
            style={{ fontSize: 10.5, color: 'var(--t-fg-4)', textDecoration: 'none', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '.04em' }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--t-accent-bright)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--t-fg-4)')}
          >
            更多设置 →
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Mini helpers ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '.06em',
      textTransform: 'uppercase', color: 'var(--t-fg-4)',
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      {children}
    </span>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 28, height: 28,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--t-bg)', border: '1px solid var(--t-border)',
  borderRadius: 7, cursor: 'pointer', color: 'var(--t-fg-3)',
  flexShrink: 0, padding: 0,
};

const rangeHintStyle: React.CSSProperties = {
  fontSize: 9.5, color: 'var(--t-fg-5)',
  fontFamily: 'var(--font-mono, monospace)', letterSpacing: '.04em',
};
