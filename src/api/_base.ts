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
/**
 * Backend URL 独立 localStorage key（2026-05-29 统一 BYOK 存储）。
 * 此前 backend_url 只存在旧的 `sf_secrets` JSON 里（A 套）；统一到 B 套
 * KEY_STORAGE 体系后，backend_url 作为独立 key 与各 provider key 并列。
 * `getApiBase` 优先读它，并兼容回退到老 `sf_secrets.backend_url`（迁移过渡期）。
 */
export const BACKEND_URL_STORAGE = 'sf_backend_url';

export function getBackendUrl(): string | null {
  try {
    const v = localStorage.getItem(BACKEND_URL_STORAGE);
    if (v && v.trim()) return v.trim().replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  return null;
}

export function setBackendUrl(url: string): void {
  try {
    const v = url.trim();
    if (v) localStorage.setItem(BACKEND_URL_STORAGE, v);
    else localStorage.removeItem(BACKEND_URL_STORAGE);
  } catch {
    /* ignore */
  }
}

export function getApiBase(): string {
  // 1) 新独立 key（统一后的真相源）
  const direct = getBackendUrl();
  if (direct) return direct;
  // 2) 兼容：老 sf_secrets.backend_url（迁移前的用户值）
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

/**
 * 一次性把老的 `sf_secrets` JSON（A 套）迁移进 B 套 KEY_STORAGE，2026-05-29
 * 统一 BYOK 存储。app 启动调一次（main.tsx）。规则：
 *   - 4 个 provider key（zhipu/openai/claude/deepseek）→ setStoredApiKey
 *     （claude→anthropic 映射）；**仅当 B 套对应位为空才搬**，不覆盖用户在
 *     设置页已配的新值。
 *   - backend_url → sf_backend_url（同样不覆盖已有）。
 *   - 打标记 `sf_secrets_migrated_v1`，迁移一次后不再重复（幂等）。
 * 老 sf_secrets 保留只读（不删），万一回退还能找回。
 */
const _MIGRATION_FLAG = 'sf_secrets_migrated_v1';

export function migrateLegacySecrets(): void {
  try {
    if (localStorage.getItem(_MIGRATION_FLAG)) return;
    const raw = localStorage.getItem('sf_secrets');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // provider key 映射：sf_secrets 字段名 → B 套 ProviderId
      const map: Array<[string, ProviderId]> = [
        ['zhipu_key', 'zhipu'],
        ['openai_key', 'openai'],
        ['claude_key', 'anthropic'],
        ['deepseek_key', 'deepseek'],
      ];
      for (const [field, pid] of map) {
        const val = parsed[field];
        if (typeof val === 'string' && val.trim() && !getStoredApiKey(pid)) {
          setStoredApiKey(val.trim(), pid);
        }
      }
      const burl = parsed['backend_url'];
      if (typeof burl === 'string' && burl.trim() && !getBackendUrl()) {
        setBackendUrl(burl.trim());
      }
    }
    localStorage.setItem(_MIGRATION_FLAG, '1');
  } catch {
    // 迁移失败不应阻塞 app 启动；下次仍会尝试（未打标记）
  }
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

// 2026-05-16 — Expanded 4 → 12 to match BYOK UI. Server's ProviderId union
// in llm-providers/types.ts is the source of truth; this list mirrors it.
export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'zhipu'
  | 'google'
  | 'qwen'
  | 'moonshot'
  | 'mistral'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'azure';

export const PROVIDER_IDS: readonly ProviderId[] = [
  'anthropic',
  'openai',
  'deepseek',
  'zhipu',
  'google',
  'qwen',
  'moonshot',
  'mistral',
  'groq',
  'openrouter',
  'ollama',
  'lmstudio',
  'azure',
];

/** localStorage slot for each provider's BYOK key. */
export const KEY_STORAGE: Record<ProviderId, string> = {
  anthropic:  'sf_anthropic_key',
  openai:     'sf_openai_key',
  deepseek:   'sf_deepseek_key',
  zhipu:      'sf_zhipu_key',
  google:     'sf_google_key',
  qwen:       'sf_qwen_key',
  moonshot:   'sf_moonshot_key',
  mistral:    'sf_mistral_key',
  groq:       'sf_groq_key',
  openrouter: 'sf_openrouter_key',
  ollama:     'sf_ollama_key',
  lmstudio:   'sf_lmstudio_key',
  azure:      'sf_azure_key',
};

/** Header name sent on RunSession requests for each provider. */
export const HEADER_NAME: Record<ProviderId, string> = {
  anthropic:  'X-Anthropic-Key',
  openai:     'X-OpenAI-Key',
  deepseek:   'X-DeepSeek-Key',
  zhipu:      'X-Zhipu-Key',
  google:     'X-Google-Key',
  qwen:       'X-Qwen-Key',
  moonshot:   'X-Moonshot-Key',
  mistral:    'X-Mistral-Key',
  groq:       'X-Groq-Key',
  openrouter: 'X-OpenRouter-Key',
  ollama:     'X-Ollama-Key',
  lmstudio:   'X-LMStudio-Key',
  azure:      'X-Azure-Key',
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

/**
 * Bug fix 2026-05-11 — keep in sync with `GenerationSettings.tsx`
 * `DEFAULT_EXECUTOR_STORAGE`. Previously `createRunSession` did NOT read this
 * key, so even after the user picked `cli:claude` in the Settings panel and
 * saw "✓ Active" on the CLI card, the request body went without an `executor`
 * field — the server fell back to `anthropic-direct` and the spawned CLI was
 * never actually used.
 */
export const DEFAULT_EXECUTOR_STORAGE = 'sf.defaultExecutor';

export interface GenerationSettings {
  /**
   * Model id from `sf.model` (GenerationSettings) or `sf.byokModel`
   * (AgentBackendSection legacy). Server validates against MODEL_ALLOWLIST;
   * unknown values silently fall back. SHADOWFLOW_DEFAULT_MODEL env still
   * overrides at the server boundary.
   */
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /** Story 15.19 v2 / 15.23 — picked CLI / ACP / MCP executor. */
  executor?: string;
  /** Story 15.14 — disable auto critique pass when explicitly false. */
  auto_critique?: boolean;
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
    // 2026-05-11 Bug fix — previously the model field was intentionally NOT
    // read from localStorage ("env wins") which left the GenerationSettings
    // model dropdown + AgentBackendSection BYOK model dropdown as cosmetic
    // UI. Now we read both `sf.model` (new GenerationSettings) and
    // `sf.byokModel` (legacy AgentBackendSection) so the user's pick is
    // honored. Server still env-locks via SHADOWFLOW_DEFAULT_MODEL when set,
    // and allowlist-validates the value (unknown → silently fall back to
    // default). UI shows the lock state via /api/settings/generation-overrides.
    const m1 = localStorage.getItem('sf.model');
    const m2 = localStorage.getItem('sf.byokModel');
    const picked = (m1 && m1.trim()) || (m2 && m2.trim()) || '';
    if (picked) out.model = picked;

    // Story 15.19 v2 / 15.23 — read default executor selection so the request
    // actually targets the local CLI / remote agent the user picked.
    const ex = localStorage.getItem(DEFAULT_EXECUTOR_STORAGE);
    if (typeof ex === 'string' && ex.trim().length > 0) {
      out.executor = ex.trim();
    }

    // 2026-05-11 — read auto_critique so disabling it actually skips the
    // critique pass on the server (Story 15.14). '0' = disabled, anything
    // else (or missing) = enabled (default ON).
    const ac = localStorage.getItem(AUTO_CRITIQUE_STORAGE);
    if (ac === '0') out.auto_critique = false;
    else if (ac === '1') out.auto_critique = true;
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
