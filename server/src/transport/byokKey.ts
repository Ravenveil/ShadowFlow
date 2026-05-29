/**
 * byokKey.ts — resolve a provider's BYOK API key, server-side.
 *
 * Extracted from run-sessions.ts so the Node chat gateway (groups-chat.ts) and
 * run-sessions share ONE key-resolution policy. Priority order:
 *   1. Per-request HTTP header (e.g. `x-zhipu-key`)        — overrides everything
 *   2. ByokSection's saved key in settings/byok           — the UI-configured path
 *   3. Per-provider env var (e.g. ZHIPU_API_KEY)          — last-resort default
 *
 * (2) is the "前端做了后端没接上" fix: ByokSection writes apiKey to
 * byok-config.json via PUT /api/settings/byok.
 *
 * NB: this is the server-side key store (`getSetting('byok')`), which is a
 * DIFFERENT source from the browser's localStorage KEY_STORAGE used by the
 * Python /api/chat/completions path. The Node gateway uses this resolver so
 * chat replies pick up the same key run-sessions uses.
 */
import { getSetting } from '../storage/settings';
import { PROVIDER_ENV_VAR, type ProviderId } from './api-clients';

/** Lower-cased request header carrying each provider's key (per-request override). */
export const HEADER_BY_PROVIDER: Record<ProviderId, string> = {
  anthropic: 'x-anthropic-key',
  openai: 'x-openai-key',
  deepseek: 'x-deepseek-key',
  zhipu: 'x-zhipu-key',
  google: 'x-google-key',
  qwen: 'x-qwen-key',
  moonshot: 'x-moonshot-key',
  mistral: 'x-mistral-key',
  groq: 'x-groq-key',
  openrouter: 'x-openrouter-key',
  ollama: 'x-ollama-key',
  lmstudio: 'x-lmstudio-key',
  azure: 'x-azure-key',
};

/**
 * Resolve the API key for `provider`. `headers` is the incoming request's
 * headers map (lower-cased keys, as Express provides). Returns undefined when
 * no key is found in any source (CLI executors don't need one).
 */
export function resolveProviderKey(
  provider: ProviderId,
  headers: Record<string, string | string[] | undefined> = {},
): string | undefined {
  const headerName = HEADER_BY_PROVIDER[provider];
  const fromHeader = headers[headerName];
  const headerVal = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;
  if (typeof headerVal === 'string' && headerVal.trim()) return headerVal.trim();

  try {
    const cfg = getSetting('byok') as
      | { providers?: Record<string, { apiKey?: string }> }
      | undefined;
    const k = cfg?.providers?.[provider]?.apiKey;
    if (typeof k === 'string' && k.trim()) return k.trim();
  } catch {
    /* settings unavailable — fall through to env */
  }

  const envVal = process.env[PROVIDER_ENV_VAR[provider]];
  return typeof envVal === 'string' && envVal.trim() ? envVal.trim() : undefined;
}
