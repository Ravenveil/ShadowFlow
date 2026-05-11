/**
 * Shared API base URL resolver.
 *
 * Priority order:
 *   1. `localStorage['sf_secrets'].backend_url`  — user-configured via SecretsModal
 *   2. `VITE_API_BASE` env var                   — set at build time / .env file
 *   3. `http://localhost:8002`                   — development default (matched to Vite proxy target)
 *
 * ----------------------------------------------------------------------------
 * Story 15.17 — Layering boundary (read this before touching this file).
 * ----------------------------------------------------------------------------
 *
 * Everything below — `getApiBase`, the BYOK helpers (`getStoredApiKey`,
 * `setStoredApiKey`, `clearStoredApiKey`, `authHeaders`), and the legacy
 * generation-settings shims (`getGenerationSettings`, `getStoredString`,
 * `setStoredString`, `fetchGenerationOverrides`) — is **client-only**.
 *
 * Story 15.17 introduces `src/api/settings.ts` and `useSetting` hook for
 * KV settings that DO round-trip through the server. The two layers are
 * distinct on purpose:
 *
 *   - This file owns sensitive / boot-time concerns (BYOK API key,
 *     backend URL discovery). These MUST NOT be migrated to useSetting —
 *     `sf_anthropic_key` is rejected by both halves of the BYOK boundary.
 *   - `src/api/settings.ts` owns user-tunable preferences (max_tokens,
 *     temperature, theme, defaultSkill, …). These DO round-trip via
 *     `PUT /api/settings/:key` and ARE safe to wrap with `useSetting`.
 *
 * `getGenerationSettings()` in particular is kept on plain localStorage so
 * Story 15.9 keeps working without a hook rewrite. Migrating GenerationSettings
 * to `useSetting` is tracked as a follow-up in 15.17 Dev Agent Record.
 */
export function getApiBase(): string {
  try {
    const raw = localStorage.getItem('sf_secrets');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const url = parsed['backend_url'];
      if (typeof url === 'string' && url.trim()) {
        return url.trim().replace(/\/$/, '');
      }
    }
  } catch {
    // ignore parse errors
  }
  const envBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  // Empty string → relative URLs → Vite proxy handles routing to backend
  return envBase.trim().replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// BYOK (Bring-Your-Own-Key) — Multi-provider API Key persistence + fetch injection
// ---------------------------------------------------------------------------
// Story 15.7 introduced a single Anthropic key (sf_anthropic_key → X-Anthropic-Key).
// Story 15.18 extends this to 4 providers (Anthropic / OpenAI / DeepSeek / Zhipu),
// each with its own localStorage slot + header. Server reads the matching header
// based on POST body `provider` and never persists keys server-side.
//
// localStorage keys:        sf_anthropic_key / sf_openai_key / sf_deepseek_key / sf_zhipu_key
// Headers (lower-cased):    X-Anthropic-Key  / X-OpenAI-Key  / X-DeepSeek-Key  / X-Zhipu-Key
// Default-provider slot:    sf_default_provider (string)
// ---------------------------------------------------------------------------

export type ProviderId = 'anthropic' | 'openai' | 'deepseek' | 'zhipu';

export const PROVIDER_IDS: readonly ProviderId[] = [
  'anthropic',
  'openai',
  'deepseek',
  'zhipu',
];

/** localStorage slot for each provider's BYOK key. */
export const KEY_STORAGE: Record<ProviderId, string> = {
  anthropic: 'sf_anthropic_key',
  openai: 'sf_openai_key',
  deepseek: 'sf_deepseek_key',
  zhipu: 'sf_zhipu_key',
};

/** Header name sent on RunSession requests for each provider. */
export const HEADER_NAME: Record<ProviderId, string> = {
  anthropic: 'X-Anthropic-Key',
  openai: 'X-OpenAI-Key',
  deepseek: 'X-DeepSeek-Key',
  zhipu: 'X-Zhipu-Key',
};

/** localStorage key for the user's default-provider radio choice. */
export const DEFAULT_PROVIDER_STORAGE = 'sf_default_provider';

/**
 * Story 15.7 — back-compat constant; still used by ApiKeySettings.test.tsx.
 * Equivalent to `KEY_STORAGE.anthropic`.
 */
export const ANTHROPIC_KEY_STORAGE = KEY_STORAGE.anthropic;

function isProviderId(s: unknown): s is ProviderId {
  return typeof s === 'string' && (PROVIDER_IDS as readonly string[]).includes(s);
}

/**
 * Read the stored API key for `provider` (defaults to 'anthropic' for
 * back-compat with Story 15.7 callers). Returns null when absent or when
 * localStorage is unavailable (SSR / sandboxed).
 */
export function getStoredApiKey(provider: ProviderId = 'anthropic'): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE[provider]);
  } catch {
    return null;
  }
}

/**
 * Persist the API key for `provider` (defaults to 'anthropic' for back-compat).
 * Caller is responsible for any format validation (e.g. `sk-ant-` prefix).
 */
export function setStoredApiKey(key: string, provider: ProviderId = 'anthropic'): void {
  try {
    localStorage.setItem(KEY_STORAGE[provider], key);
  } catch {
    // ignore quota / unavailable errors — UI surfaces failure separately
  }
}

/** Remove the API key for `provider` (defaults to 'anthropic'). */
export function clearStoredApiKey(provider: ProviderId = 'anthropic'): void {
  try {
    localStorage.removeItem(KEY_STORAGE[provider]);
  } catch {
    // ignore
  }
}

/**
 * Read the user's chosen default provider from localStorage. Falls back to
 * `'anthropic'` when nothing stored or the value is unrecognized.
 */
export function getDefaultProvider(): ProviderId {
  try {
    const raw = localStorage.getItem(DEFAULT_PROVIDER_STORAGE);
    return isProviderId(raw) ? raw : 'anthropic';
  } catch {
    return 'anthropic';
  }
}

/** Persist the user's default-provider choice. Validates id; no-op on bad input. */
export function setDefaultProvider(id: ProviderId): void {
  if (!isProviderId(id)) return;
  try {
    localStorage.setItem(DEFAULT_PROVIDER_STORAGE, id);
  } catch {
    // ignore
  }
}

/**
 * Mask a key for display: keep first 15 + last 4 characters with `...` in the
 * middle. Short / malformed keys collapse to `****`.
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 20) return '****';
  return `${key.slice(0, 15)}...${key.slice(-4)}`;
}

/**
 * Build the auth headers to merge into a `fetch` request.
 *
 * 2026-05-11 review F5 (15.18): provider-scoped 模式 — 默认仅发当前选中
 * provider 的 1 个 key（最小披露原则）。早期实现把所有 4 key 都附到每个请求，
 * 在 dev tools / 中间人 / 反代日志里 4 key 全可见 — 真实泄漏面。
 *
 *   authHeaders()                  → 发 default provider 的 key（多数场景）
 *   authHeaders('openai')          → 仅发 openai 的 key
 *   authHeaders({ all: true })     → 发全部已存的 key（向后兼容老调用）
 *
 *   headers: { 'Content-Type': 'application/json', ...authHeaders() }
 *
 * Story 15.7 单 Anthropic key 契约仍兼容：default provider 即 anthropic 时，
 * 只发 X-Anthropic-Key（与早期 15.7 行为一致）。
 */
export function authHeaders(
  scope?: ProviderId | { all: true },
): Record<string, string> {
  const out: Record<string, string> = {};
  if (scope && typeof scope === 'object' && scope.all) {
    for (const id of PROVIDER_IDS) {
      const k = getStoredApiKey(id);
      if (k) out[HEADER_NAME[id]] = k;
    }
    return out;
  }
  const target: ProviderId =
    typeof scope === 'string' && (PROVIDER_IDS as readonly string[]).includes(scope)
      ? (scope as ProviderId)
      : (getDefaultProvider?.() ?? 'anthropic');
  const k = getStoredApiKey(target);
  if (k) out[HEADER_NAME[target]] = k;
  return out;
}

// ---------------------------------------------------------------------------
// Story 15.9 — Generation settings (model / max_tokens / temperature)
// ---------------------------------------------------------------------------
// Bug fix: `sf.maxTokens` was a localStorage-backed UI slider in
// AdvancedSection.tsx that the front-end never sent to the server, so the
// server's `runSkillAssembler` always used the hard-coded default. This module
// is now the single source of truth that `createRunSession` reads at request
// time so UI changes take effect immediately.
//
// localStorage keys (kept identical to the legacy AdvancedSection slider for
// backward compat — old user values continue to apply):
//   sf.maxTokens     → integer 1024..32768
//   sf.temperature   → float 0..1
//   sf.lastSkill     → string skill_id (set by RunSessionPage on submit)
//   sf.lastDS        → string ds_id (set by RunSessionPage on submit)
//   sf.auto_critique → '1' | '0' (UI-only placeholder until Story 15.14)
// ---------------------------------------------------------------------------

export const MAX_TOKENS_STORAGE = 'sf.maxTokens';
export const TEMPERATURE_STORAGE = 'sf.temperature';
export const LAST_SKILL_STORAGE = 'sf.lastSkill';
export const LAST_DS_STORAGE = 'sf.lastDS';
export const AUTO_CRITIQUE_STORAGE = 'sf.auto_critique';

export const MAX_TOKENS_MIN = 1024;
export const MAX_TOKENS_MAX = 32768;
export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 1;

export interface GenerationSettings {
  /**
   * Front-end currently leaves this `undefined` so the server decides
   * (env > default). The field is reserved for a future "explicit override"
   * UI; the server already accepts and validates a string when present.
   */
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * Read generation settings from localStorage. Each field is only populated
 * when the stored value is parseable AND within the allowed range — anything
 * else collapses to `undefined` so the server falls back to its default.
 */
export function getGenerationSettings(): GenerationSettings {
  const out: GenerationSettings = {};
  try {
    const t = localStorage.getItem(MAX_TOKENS_STORAGE);
    if (t) {
      const n = parseInt(t, 10);
      if (!isNaN(n) && n >= MAX_TOKENS_MIN && n <= MAX_TOKENS_MAX) {
        out.max_tokens = n;
      }
    }
    const temp = localStorage.getItem(TEMPERATURE_STORAGE);
    if (temp !== null && temp !== '') {
      const n = parseFloat(temp);
      if (!isNaN(n) && n >= TEMPERATURE_MIN && n <= TEMPERATURE_MAX) {
        out.temperature = n;
      }
    }
    // model is intentionally not read from localStorage in this iteration —
    // server-side env (SHADOWFLOW_DEFAULT_MODEL) is the source of truth and
    // the SettingsPage shows it as read-only when env-locked. The interface
    // keeps the field so a future UI can opt-in.
  } catch {
    // localStorage unavailable (SSR / sandbox) — return empty settings
  }
  return out;
}

/**
 * Read an arbitrary string from localStorage with safe fallback. Useful for
 * the front-end UI controls in GenerationSettings.tsx and for the
 * RunSessionPage preparation panel which restores `sf.lastSkill` / `sf.lastDS`.
 */
export function getStoredString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write an arbitrary string to localStorage; swallow quota / unavailable
 * errors so the UI never crashes a private-mode browser.
 */
export function setStoredString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Story 15.9 — Generation overrides discovery
// ---------------------------------------------------------------------------
// The server may pin the model via `SHADOWFLOW_DEFAULT_MODEL`. The UI fetches
// the current overrides once on mount so it can show a "locked by env" hint
// next to the Model dropdown. Failure to fetch falls back to "no overrides".
// ---------------------------------------------------------------------------

export interface GenerationOverrides {
  model_locked: boolean;
  model_value?: string;
}

export async function fetchGenerationOverrides(
  signal?: AbortSignal,
): Promise<GenerationOverrides> {
  try {
    const resp = await fetch(
      `${getApiBase()}/api/settings/generation-overrides`,
      { signal },
    );
    if (!resp.ok) return { model_locked: false };
    const data = (await resp.json()) as Partial<GenerationOverrides>;
    return {
      model_locked: Boolean(data.model_locked),
      model_value: typeof data.model_value === 'string' ? data.model_value : undefined,
    };
  } catch {
    return { model_locked: false };
  }
}
