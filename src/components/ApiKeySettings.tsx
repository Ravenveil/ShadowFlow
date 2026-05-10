/**
 * ApiKeySettings — Story 15.7 BYOK panel, Story 15.18 multi-provider extension.
 *
 * BYOK BOUNDARY (Story 15.17 reminder):
 *   This component intentionally does NOT use the `useSetting` hook from
 *   `src/core/hooks/useSettings.ts`. BYOK API keys are sensitive data and
 *   must remain client-only — they are never PUT to the server. Both halves
 *   of the BYOK boundary reject any key prefixed with `sf_*_key`. If you
 *   ever need to migrate this component, replace the `_base.ts` BYOK helpers
 *   with another LOCAL-ONLY mechanism — never useSetting.
 *
 * Story 15.18 — 4 providers (Anthropic / OpenAI / DeepSeek / Zhipu) each with
 * their own card + a default-provider radio group on top. Each card preserves
 * the Story 15.7 mask + Eye toggle + Trash2 clear UX.
 *
 *   Provider          Storage key             Header             Required prefix
 *   anthropic         sf_anthropic_key        X-Anthropic-Key    sk-ant-
 *   openai            sf_openai_key           X-OpenAI-Key       sk-
 *   deepseek          sf_deepseek_key         X-DeepSeek-Key     sk-
 *   zhipu             sf_zhipu_key            X-Zhipu-Key        (none — accepts anything)
 *
 * Compact mode renders only the Anthropic card (used inside the RunSession
 * banner where space is tight) and is preserved for back-compat with the
 * single-provider banner from Story 15.7.
 */
import { useState } from 'react';
import { Key, Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey,
  maskApiKey,
  getDefaultProvider,
  setDefaultProvider,
  PROVIDER_IDS,
  type ProviderId,
} from '../api/_base';
import { useI18n } from '../common/i18n';

interface ProviderConfig {
  id: ProviderId;
  label: string;
  /** Required prefix for save-time format check; null = accept anything non-empty. */
  requiredPrefix: string | null;
  placeholder: string;
  docsLabel: string;
  docsUrl: string;
}

const PROVIDER_CONFIGS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    requiredPrefix: 'sk-ant-',
    placeholder: 'sk-ant-api03-...',
    docsLabel: 'platform.anthropic.com',
    docsUrl: 'https://platform.anthropic.com',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    requiredPrefix: 'sk-',
    placeholder: 'sk-...',
    docsLabel: 'platform.openai.com',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    requiredPrefix: 'sk-',
    placeholder: 'sk-...',
    docsLabel: 'platform.deepseek.com',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  zhipu: {
    id: 'zhipu',
    label: 'Zhipu (智谱)',
    requiredPrefix: null,
    placeholder: 'xxxx.yyyyyy',
    docsLabel: 'open.bigmodel.cn',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
};

export interface ApiKeySettingsProps {
  /** Optional callback fired when the Anthropic key changes (set or cleared). */
  onChange?: (key: string | null) => void;
  /**
   * Compact rendering — used inside RunSessionPage banner. Only renders the
   * Anthropic card (Story 15.7 banner contract); skips the default-provider
   * radio + the other 3 provider cards.
   */
  compact?: boolean;
}

// ── Per-provider sub-component ─────────────────────────────────────────────

interface ProviderKeyRowProps {
  provider: ProviderId;
  /** Story 15.7 callback contract — only fires for the anthropic provider. */
  onAnthropicChange?: (key: string | null) => void;
  compact?: boolean;
}

function ProviderKeyRow({ provider, onAnthropicChange, compact }: ProviderKeyRowProps) {
  const { t } = useI18n();
  const cfg = PROVIDER_CONFIGS[provider];
  const [draft, setDraft] = useState('');
  const [stored, setStored] = useState<string | null>(() => getStoredApiKey(provider));
  const [showFull, setShowFull] = useState(false);
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (cfg.requiredPrefix && !trimmed.startsWith(cfg.requiredPrefix)) {
      // Reuse the Story 15.7 i18n message for anthropic; fall back to a
      // localized message for other providers without adding new keys.
      if (provider === 'anthropic') {
        setError(t('skillStudio.byok.invalidPrefix', { prefix: cfg.requiredPrefix }));
      } else {
        setError(`Invalid format — ${cfg.label} Key must start with ${cfg.requiredPrefix}`);
      }
      return;
    }
    setStoredApiKey(trimmed, provider);
    setStored(trimmed);
    setDraft('');
    setError('');
    if (provider === 'anthropic') onAnthropicChange?.(trimmed);
  };

  const handleClear = () => {
    clearStoredApiKey(provider);
    setStored(null);
    setShowFull(false);
    setError('');
    if (provider === 'anthropic') onAnthropicChange?.(null);
  };

  const cardPadding = compact ? '12px 14px' : '16px';

  return (
    <div
      data-testid={
        provider === 'anthropic' ? 'api-key-settings' : `api-key-settings-${provider}`
      }
      data-provider={provider}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 10 : 14,
        padding: cardPadding,
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--t-fg-2, var(--t-fg))',
        }}
      >
        <Key size={14} strokeWidth={2} />
        <span>
          {provider === 'anthropic'
            ? t('skillStudio.byok.title')
            : `${cfg.label} API Key (BYOK)`}
        </span>
      </div>

      {stored ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code
            data-testid={
              provider === 'anthropic'
                ? 'api-key-masked'
                : `api-key-masked-${provider}`
            }
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 6,
              background: 'var(--t-bg)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-fg-3, var(--t-fg))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {showFull ? stored : maskApiKey(stored)}
          </code>
          <button
            type="button"
            aria-label={showFull ? 'Hide key' : 'Show key'}
            onClick={() => setShowFull(v => !v)}
            style={iconBtnStyle}
          >
            {showFull ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            aria-label="Clear key"
            onClick={handleClear}
            data-testid={
              provider === 'anthropic' ? 'api-key-clear' : `api-key-clear-${provider}`
            }
            style={{ ...iconBtnStyle, color: 'var(--t-err, #ef4444)' }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="password"
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && draft.trim()) handleSave();
              }}
              placeholder={
                provider === 'anthropic'
                  ? t('skillStudio.byok.placeholder')
                  : cfg.placeholder
              }
              data-testid={
                provider === 'anthropic' ? 'api-key-input' : `api-key-input-${provider}`
              }
              style={{
                flex: 1,
                background: 'var(--t-bg)',
                border: '1px solid var(--t-border)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--t-fg)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!draft.trim()}
              data-testid={
                provider === 'anthropic' ? 'api-key-save' : `api-key-save-${provider}`
              }
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                background: draft.trim() ? 'var(--t-accent-tint)' : 'transparent',
                color: draft.trim() ? 'var(--t-accent-bright, var(--t-accent))' : 'var(--t-fg-5, var(--t-fg-4))',
                border: `1px solid ${draft.trim() ? 'var(--t-accent)' : 'var(--t-border)'}`,
                borderRadius: 6,
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              {t('common.save')}
            </button>
          </div>
          {error && (
            <p
              data-testid={
                provider === 'anthropic' ? 'api-key-error' : `api-key-error-${provider}`
              }
              role="alert"
              style={{ fontSize: 11, color: 'var(--t-err, #ef4444)', margin: 0 }}
            >
              {error}
            </p>
          )}
          <p style={{ fontSize: 11, color: 'var(--t-fg-4)', margin: 0 }}>
            {provider === 'anthropic' ? t('skillStudio.byok.docsHint') : 'Get a key: '}
            <a
              href={cfg.docsUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--t-accent-bright, var(--t-accent))' }}
            >
              {cfg.docsLabel}
            </a>
          </p>
          {/* Story 15.17 — anthropic-only client-only reassurance preserved
              verbatim. Other providers reuse the section-level note. */}
          {provider === 'anthropic' && (
            <p
              data-testid="api-key-client-only-note"
              style={{
                fontSize: 10,
                color: 'var(--t-fg-5, var(--t-fg-4))',
                margin: 0,
                fontStyle: 'italic',
              }}
            >
              {t('skillStudio.byok.clientOnlyNote')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Default-provider radio group (Story 15.18 AC7) ────────────────────────

function DefaultProviderRadio() {
  const [active, setActive] = useState<ProviderId>(() => getDefaultProvider());

  return (
    <div
      data-testid="default-provider-radio"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--t-fg-2, var(--t-fg))',
        }}
      >
        Default Provider
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {PROVIDER_IDS.map(id => {
          const hasKey = !!getStoredApiKey(id);
          const isActive = active === id;
          return (
            <label
              key={id}
              data-testid={`default-provider-option-${id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 6,
                border: `1px solid ${isActive ? 'var(--t-accent)' : 'var(--t-border)'}`,
                background: isActive ? 'var(--t-accent-tint)' : 'transparent',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              <input
                type="radio"
                name="sf-default-provider"
                value={id}
                checked={isActive}
                onChange={() => {
                  setActive(id);
                  setDefaultProvider(id);
                }}
                style={{ accentColor: 'var(--t-accent)' }}
              />
              <span style={{ fontWeight: 500 }}>{PROVIDER_CONFIGS[id].label}</span>
              {!hasKey && (
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--t-fg-5, var(--t-fg-4))',
                  }}
                >
                  (no key)
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Top-level component ───────────────────────────────────────────────────

export function ApiKeySettings({ onChange, compact = false }: ApiKeySettingsProps) {
  // Compact mode (RunSessionPage banner) keeps the Story 15.7 contract:
  // one Anthropic card, no radio, no other providers.
  if (compact) {
    return <ProviderKeyRow provider="anthropic" onAnthropicChange={onChange} compact />;
  }

  return (
    <div
      data-testid="api-key-settings-multi"
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <DefaultProviderRadio />
      {PROVIDER_IDS.map(id => (
        <ProviderKeyRow
          key={id}
          provider={id}
          onAnthropicChange={id === 'anthropic' ? onChange : undefined}
        />
      ))}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--t-border)',
  borderRadius: 6,
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--t-fg-4)',
  cursor: 'pointer',
  flexShrink: 0,
};

export default ApiKeySettings;
