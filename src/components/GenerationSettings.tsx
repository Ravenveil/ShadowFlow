/**
 * GenerationSettings.tsx — Story 15.9
 *
 * Single-source-of-truth UI for the generation overrides that
 * `getGenerationSettings()` reads from localStorage and `createRunSession`
 * forwards to the server. This panel is mounted in SettingsPage right after
 * the BYOK section (`skill-studio-key`).
 *
 * Bug fix context: prior to this story the legacy `MaxTokensBlock` slider
 * inside `core/components/settings/AdvancedSection.tsx` wrote to
 * `localStorage.sf.maxTokens` but that value was never sent to the server.
 * The sole authoritative writer is now this component (the legacy block
 * remains for backward compat with old user values; both share the same
 * localStorage key so the values stay in sync).
 *
 * Controls:
 *   1. Model dropdown (write `sf.model` for symmetry — getGenerationSettings
 *      currently does NOT read this; reserved for future opt-in. Server-locked
 *      indication shown when env-pinned via `/api/settings/generation-overrides`).
 *   2. Max output tokens slider + numeric input (`sf.maxTokens`).
 *   3. Temperature slider + numeric input (`sf.temperature`).
 *   4. Auto-critique toggle (`sf.auto_critique`) — UI placeholder.
 *   5. Default Skill dropdown (`sf.lastSkill`) — restored by RunSessionPage.
 *   6. Default Design System dropdown (`sf.lastDS`).
 *
 * No new dependencies — uses lucide-react icons that are already in the bundle.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { useI18n } from '../common/i18n';
import {
  AUTO_CRITIQUE_STORAGE,
  LAST_DS_STORAGE,
  LAST_SKILL_STORAGE,
  MAX_TOKENS_MAX,
  MAX_TOKENS_MIN,
  MAX_TOKENS_STORAGE,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
  TEMPERATURE_STORAGE,
  fetchGenerationOverrides,
  getStoredString,
  setStoredString,
  type GenerationOverrides,
} from '../api/_base';
import { LOCAL_SKILLS, listSkills, type SkillInfo } from '../api/skills';
import {
  LOCAL_DS,
  listDesignSystems,
  type DesignSystemInfo,
} from '../api/designSystems';
// Story 15.19 v2 — populate "Default Executor" dropdown with detected CLIs.
import { listDetectedClis, type DetectedCli } from '../api/cli';
// Story 15.23 — ACP / MCP remote agents in the same dropdown.
import { listAcpAgents, type DetectedAcpAgent } from '../api/acp';
// Story 15.18 — Default Provider dropdown (Anthropic / OpenAI / DeepSeek / Zhipu).
import {
  PROVIDER_IDS,
  getDefaultProvider,
  setDefaultProvider,
  type ProviderId,
} from '../api/_base';

const DEFAULT_EXECUTOR_STORAGE = 'sf.defaultExecutor';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  zhipu: 'Zhipu (智谱)',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TOKENS_DEFAULT = 8192;
const MAX_TOKENS_STEP = 512;

const TEMPERATURE_DEFAULT = 0.7;
const TEMPERATURE_STEP = 0.1;

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (default)' },
  { value: 'claude-opus-4', label: 'Claude Opus 4' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampMaxTokens(v: number): number {
  return Math.min(MAX_TOKENS_MAX, Math.max(MAX_TOKENS_MIN, Math.floor(v)));
}

function clampTemperature(v: number): number {
  return Math.min(TEMPERATURE_MAX, Math.max(TEMPERATURE_MIN, v));
}

function readMaxTokens(): number {
  const raw = getStoredString(MAX_TOKENS_STORAGE);
  if (!raw) return MAX_TOKENS_DEFAULT;
  const n = parseInt(raw, 10);
  return isNaN(n) ? MAX_TOKENS_DEFAULT : clampMaxTokens(n);
}

function readTemperature(): number {
  const raw = getStoredString(TEMPERATURE_STORAGE);
  if (raw === null) return TEMPERATURE_DEFAULT;
  const n = parseFloat(raw);
  return isNaN(n) ? TEMPERATURE_DEFAULT : clampTemperature(n);
}

function readAutoCritique(): boolean {
  const raw = getStoredString(AUTO_CRITIQUE_STORAGE);
  // Default ON per AC1; only explicit '0' opts out.
  return raw !== '0';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerationSettings() {
  const { t } = useI18n();

  // ── Local state mirrors localStorage; writes happen on blur / change. ──
  const [maxTokens, setMaxTokens] = useState<number>(() => readMaxTokens());
  const [temperature, setTemperature] = useState<number>(() => readTemperature());
  const [autoCritique, setAutoCritique] = useState<boolean>(() => readAutoCritique());

  const [skills, setSkills] = useState<SkillInfo[]>(LOCAL_SKILLS);
  const [designSystems, setDesignSystems] = useState<DesignSystemInfo[]>(LOCAL_DS);

  const [skillId, setSkillId] = useState<string>(
    () => getStoredString(LAST_SKILL_STORAGE) ?? LOCAL_SKILLS[0]?.skill_id ?? '',
  );
  const [dsId, setDsId] = useState<string>(
    () => getStoredString(LAST_DS_STORAGE) ?? '',
  );

  const [modelValue, setModelValue] = useState<string>(
    () => getStoredString('sf.model') ?? MODEL_OPTIONS[0].value,
  );

  const [overrides, setOverrides] = useState<GenerationOverrides>({
    model_locked: false,
  });

  // Story 15.19 v2 — detected CLIs feed the "Default Executor" dropdown.
  const [detectedClis, setDetectedClis] = useState<DetectedCli[]>([]);
  // Story 15.23 — detected ACP / MCP remote agents.
  const [acpAgents, setAcpAgents] = useState<DetectedAcpAgent[]>([]);
  const [executorValue, setExecutorValue] = useState<string>(
    // 2026-05-11 Story 15.30 (OpenDesign 模式): 默认 'cli:auto' — 有 CLI 用 CLI
    // (无需 BYOK)，无 CLI 才退到 anthropic-direct (需要 BYOK)。
    () => getStoredString(DEFAULT_EXECUTOR_STORAGE) ?? 'cli:auto',
  );

  // Story 15.18 — Default Provider for the BYOK abstraction.
  const [providerValue, setProviderValue] = useState<ProviderId>(() =>
    getDefaultProvider(),
  );

  const savedToastRef = useRef<HTMLSpanElement>(null);

  // Fetch real skills / DS / overrides on mount. Each falls back to LOCAL_*.
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const [s, d, o, clis, acps] = await Promise.all([
          listSkills().catch(() => LOCAL_SKILLS),
          listDesignSystems().catch(() => LOCAL_DS),
          fetchGenerationOverrides(ac.signal).catch(
            () => ({ model_locked: false }) as GenerationOverrides,
          ),
          listDetectedClis()
            .then((r) => r.items)
            .catch(() => [] as DetectedCli[]),
          listAcpAgents()
            .then((r) => r.items)
            .catch(() => [] as DetectedAcpAgent[]),
        ]);
        if (cancelled) return;
        if (Array.isArray(s) && s.length > 0) setSkills(s);
        if (Array.isArray(d) && d.length > 0) setDesignSystems(d);
        setOverrides(o);
        setDetectedClis(clis);
        setAcpAgents(acps);
      } catch {
        // network blip — keep LOCAL_* fallbacks already in state
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  // Effective model display: env-locked value wins as the *displayed* selection
  // but the user can still change the dropdown for future opt-in. The hint
  // makes clear the server overrides anything they pick.
  const effectiveModelValue = overrides.model_locked
    ? overrides.model_value ?? modelValue
    : modelValue;

  // ── Persisters — fired on blur / change. ──
  function persistMaxTokens(next: number) {
    const clamped = clampMaxTokens(next);
    setMaxTokens(clamped);
    setStoredString(MAX_TOKENS_STORAGE, String(clamped));
    pulseSavedToast();
  }

  function persistTemperature(next: number) {
    const clamped = clampTemperature(next);
    // Round to 1 decimal so the slider step matches what we store.
    const rounded = Math.round(clamped * 10) / 10;
    setTemperature(rounded);
    setStoredString(TEMPERATURE_STORAGE, String(rounded));
    pulseSavedToast();
  }

  function persistAutoCritique(next: boolean) {
    setAutoCritique(next);
    setStoredString(AUTO_CRITIQUE_STORAGE, next ? '1' : '0');
    pulseSavedToast();
  }

  function persistSkill(next: string) {
    setSkillId(next);
    setStoredString(LAST_SKILL_STORAGE, next);
    pulseSavedToast();
  }

  function persistDs(next: string) {
    setDsId(next);
    setStoredString(LAST_DS_STORAGE, next);
    pulseSavedToast();
  }

  function persistModel(next: string) {
    setModelValue(next);
    setStoredString('sf.model', next);
    pulseSavedToast();
  }

  function persistExecutor(next: string) {
    setExecutorValue(next);
    setStoredString(DEFAULT_EXECUTOR_STORAGE, next);
    pulseSavedToast();
  }

  function persistProvider(next: ProviderId) {
    setProviderValue(next);
    setDefaultProvider(next);
    pulseSavedToast();
  }

  function pulseSavedToast() {
    const el = savedToastRef.current;
    if (!el) return;
    el.style.opacity = '1';
    window.setTimeout(() => {
      if (el) el.style.opacity = '0';
    }, 1200);
  }

  // Memoize options for cheap rerenders.
  const skillOptions = useMemo(
    () =>
      skills.map((s) => (
        <option key={s.skill_id} value={s.skill_id}>
          {s.name}
        </option>
      )),
    [skills],
  );

  const dsOptions = useMemo(
    () => [
      <option key="__none__" value="">
        {t('skillStudio.generation.defaultDsNone')}
      </option>,
      ...designSystems
        .filter((d) => d.ds_id !== 'none')
        .map((d) => (
          <option key={d.ds_id} value={d.ds_id}>
            {d.name}
          </option>
        )),
    ],
    [designSystems, t],
  );

  // ── Render ──
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--t-fg-2)',
    display: 'block',
    marginBottom: 6,
  };
  const hintStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--t-fg-4)',
    marginTop: 4,
  };
  const inputStyle: React.CSSProperties = {
    background: 'var(--t-panel)',
    border: '1px solid var(--t-border)',
    borderRadius: 6,
    color: 'var(--t-fg)',
    fontSize: 12,
    padding: '7px 10px',
    fontFamily: 'inherit',
    outline: 'none',
  };
  const cardStyle: React.CSSProperties = {
    border: '1px solid var(--t-border)',
    borderRadius: 12,
    background: 'var(--t-panel)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };

  return (
    <div data-testid="generation-settings" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="hf-label" style={{ color: 'var(--t-accent)' }}>
          {t('skillStudio.generation.sectionEyebrow')}
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            marginTop: 4,
            letterSpacing: '-.02em',
            color: 'var(--t-fg)',
          }}
        >
          {t('skillStudio.generation.sectionTitle')}
        </div>
        <p style={{ fontSize: 13, color: 'var(--t-fg-3)', marginTop: 6 }}>
          {t('skillStudio.generation.sectionDesc')}
        </p>
      </div>

      <div style={cardStyle}>
        {/* Saved toast (live region) — pulses on every persist */}
        <span
          ref={savedToastRef}
          aria-live="polite"
          style={{
            position: 'absolute',
            right: 18,
            marginTop: -2,
            opacity: 0,
            transition: 'opacity 200ms ease-out',
            fontSize: 10,
            color: 'var(--t-ok, #10b981)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          ✓ {t('skillStudio.generation.savedHint')}
        </span>

        {/* 1. Model */}
        <div>
          <label htmlFor="gen-model" style={labelStyle}>
            {t('skillStudio.generation.modelLabel')}
          </label>
          <select
            id="gen-model"
            data-testid="gen-model-select"
            value={effectiveModelValue}
            disabled={overrides.model_locked}
            onChange={(e) => persistModel(e.target.value)}
            style={{
              ...inputStyle,
              width: 280,
              cursor: overrides.model_locked ? 'not-allowed' : 'pointer',
              opacity: overrides.model_locked ? 0.7 : 1,
            }}
          >
            {/* Always include the env-locked value even if it's outside the canonical list. */}
            {overrides.model_locked &&
            overrides.model_value &&
            !MODEL_OPTIONS.some((m) => m.value === overrides.model_value) ? (
              <option value={overrides.model_value}>{overrides.model_value}</option>
            ) : null}
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {overrides.model_locked && (
            <div
              data-testid="gen-model-locked"
              style={{
                ...hintStyle,
                marginTop: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--t-warn, #f59e0b)',
              }}
            >
              <Lock size={11} strokeWidth={2} />
              {t('skillStudio.generation.modelLockedHint', {
                value: overrides.model_value ?? '(env)',
              })}
            </div>
          )}
        </div>

        {/* 2. Max tokens */}
        <div>
          <label htmlFor="gen-max-tokens" style={labelStyle}>
            {t('skillStudio.generation.maxTokensLabel')}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              id="gen-max-tokens"
              data-testid="gen-max-tokens-range"
              type="range"
              min={MAX_TOKENS_MIN}
              max={MAX_TOKENS_MAX}
              step={MAX_TOKENS_STEP}
              value={maxTokens}
              onChange={(e) => persistMaxTokens(parseInt(e.target.value, 10))}
              style={{ flex: 1, maxWidth: 360, accentColor: 'var(--t-accent)' }}
            />
            <input
              data-testid="gen-max-tokens-input"
              type="number"
              min={MAX_TOKENS_MIN}
              max={MAX_TOKENS_MAX}
              step={MAX_TOKENS_STEP}
              value={maxTokens}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setMaxTokens(isNaN(n) ? MAX_TOKENS_MIN : n);
              }}
              onBlur={() => persistMaxTokens(maxTokens)}
              style={{
                ...inputStyle,
                width: 110,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>tokens</span>
          </div>
          <div style={hintStyle}>{t('skillStudio.generation.maxTokensHint')}</div>
        </div>

        {/* 3. Temperature */}
        <div>
          <label htmlFor="gen-temperature" style={labelStyle}>
            {t('skillStudio.generation.temperatureLabel')}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              id="gen-temperature"
              data-testid="gen-temperature-range"
              type="range"
              min={TEMPERATURE_MIN}
              max={TEMPERATURE_MAX}
              step={TEMPERATURE_STEP}
              value={temperature}
              onChange={(e) => persistTemperature(parseFloat(e.target.value))}
              style={{ flex: 1, maxWidth: 360, accentColor: 'var(--t-accent)' }}
            />
            <input
              data-testid="gen-temperature-input"
              type="number"
              min={TEMPERATURE_MIN}
              max={TEMPERATURE_MAX}
              step={TEMPERATURE_STEP}
              value={temperature}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                setTemperature(isNaN(n) ? TEMPERATURE_MIN : n);
              }}
              onBlur={() => persistTemperature(temperature)}
              style={{
                ...inputStyle,
                width: 80,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>
          <div style={hintStyle}>{t('skillStudio.generation.temperatureHint')}</div>
        </div>

        {/* 4. Auto-critique */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              role="switch"
              aria-checked={autoCritique}
              data-testid="gen-auto-critique"
              onClick={() => persistAutoCritique(!autoCritique)}
              style={{
                width: 36,
                height: 20,
                borderRadius: 999,
                border: '1px solid var(--t-border)',
                background: autoCritique ? 'var(--t-accent)' : 'var(--t-panel-2)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 150ms ease-out',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 1,
                  left: autoCritique ? 17 : 1,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 150ms ease-out',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                }}
              />
            </button>
            <label htmlFor="gen-auto-critique" style={{ ...labelStyle, marginBottom: 0 }}>
              {t('skillStudio.generation.autoCritiqueLabel')}
            </label>
          </div>
          <div style={hintStyle}>{t('skillStudio.generation.autoCritiqueHint')}</div>
        </div>

        {/* 5. Default Skill */}
        <div>
          <label htmlFor="gen-default-skill" style={labelStyle}>
            {t('skillStudio.generation.defaultSkillLabel')}
          </label>
          <select
            id="gen-default-skill"
            data-testid="gen-default-skill"
            value={skillId}
            onChange={(e) => persistSkill(e.target.value)}
            style={{ ...inputStyle, width: 280, cursor: 'pointer' }}
          >
            {skillOptions}
          </select>
          <div style={hintStyle}>{t('skillStudio.generation.defaultSkillHint')}</div>
        </div>

        {/* 6. Default Design System */}
        <div>
          <label htmlFor="gen-default-ds" style={labelStyle}>
            {t('skillStudio.generation.defaultDsLabel')}
          </label>
          <select
            id="gen-default-ds"
            data-testid="gen-default-ds"
            value={dsId}
            onChange={(e) => persistDs(e.target.value)}
            style={{ ...inputStyle, width: 280, cursor: 'pointer' }}
          >
            {dsOptions}
          </select>
        </div>

        {/* 7. Default Executor (Story 15.19 v2) */}
        <div>
          <label htmlFor="gen-default-executor" style={labelStyle}>
            Default Executor
          </label>
          <select
            id="gen-default-executor"
            data-testid="gen-default-executor"
            value={executorValue}
            onChange={(e) => persistExecutor(e.target.value)}
            style={{ ...inputStyle, width: 320, cursor: 'pointer' }}
          >
            <optgroup label="Direct">
              <option value="anthropic-direct">Anthropic SDK (default)</option>
            </optgroup>
            <optgroup label="Local CLIs">
              <option value="cli:auto">Auto — first detected CLI</option>
              {detectedClis.map((c) => (
                <option
                  key={c.id}
                  value={`cli:${c.id}`}
                  disabled={!c.installed}
                >
                  {`cli:${c.id}${c.version ? ` (${c.version})` : ''}${c.installed ? '' : ' (not detected)'}`}
                </option>
              ))}
            </optgroup>
            <optgroup label="ACP Agents">
              {acpAgents.filter((a) => a.type === 'acp').length === 0 && (
                <option value="" disabled>
                  (none registered)
                </option>
              )}
              {acpAgents
                .filter((a) => a.type === 'acp')
                .map((a) => (
                  <option key={a.id} value={`acp:${a.id}`}>
                    {`acp:${a.id}${a.installed ? '' : ' (offline)'}`}
                  </option>
                ))}
            </optgroup>
            <optgroup label="MCP Tools">
              {acpAgents.filter((a) => a.type === 'mcp').length === 0 && (
                <option value="" disabled>
                  (configure via .shadowflow/mcp.json)
                </option>
              )}
              {acpAgents
                .filter((a) => a.type === 'mcp')
                .map((a) => (
                  <option key={a.id} value={`mcp:${a.id}`}>
                    {`mcp:${a.id}${a.installed ? '' : ' (offline)'}`}
                  </option>
                ))}
            </optgroup>
          </select>
          <div style={hintStyle}>
            {detectedClis.filter((c) => c.installed).length === 0 && acpAgents.filter((a) => a.installed).length === 0
              ? 'No local CLIs or remote agents detected — see Skill Studio · Local CLIs / Remote Agents.'
              : `${detectedClis.filter((c) => c.installed).length} CLI(s) + ${acpAgents.filter((a) => a.installed).length} remote agent(s) detected. Skill frontmatter executor takes precedence.`}
          </div>
        </div>

        {/* 8. Default Provider (Story 15.18) */}
        <div>
          <label htmlFor="gen-default-provider" style={labelStyle}>
            Default Provider
          </label>
          <select
            id="gen-default-provider"
            data-testid="gen-default-provider"
            value={providerValue}
            onChange={(e) => persistProvider(e.target.value as ProviderId)}
            style={{ ...inputStyle, width: 320, cursor: 'pointer' }}
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDER_LABELS[id]}
              </option>
            ))}
          </select>
          <div style={hintStyle}>
            BYOK — set per-provider API key in the API Keys section above. The
            anthropic-direct executor dispatches to the chosen provider; CLI /
            ACP / MCP executors ignore this field.
          </div>
        </div>
      </div>
    </div>
  );
}

export default GenerationSettings;
