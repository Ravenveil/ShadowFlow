/**
 * settings.ts — Settings router (Stories 15.9 + 15.17 + BYOK provider config)
 *
 * Original (15.9):
 *   GET /api/settings/generation-overrides
 *     → { model_locked: boolean, model_value?: string }
 *
 * Added (15.17 — KV settings server-side persistence):
 *   GET    /api/settings              → { settings: { key: value, ... } }
 *   GET    /api/settings/:key         → { key, value }   |   404
 *   PUT    /api/settings/:key         → { key, value }   body: { value }
 *   DELETE /api/settings/:key         → 204 (idempotent)
 *
 * BYOK provider config (Cherry Studio-style, mirrors Shadow's aiConfigStore):
 *   GET    /api/settings/byok                        → { providers: { [id]: ProviderData (masked) }, defaultModel, temperature, routingPriority }
 *   GET    /api/settings/byok/models                 → { models: ModelDef[] }  // static catalog
 *   GET    /api/settings/byok/:id/models/remote      → { models: ModelDef[], count, source }  // probe upstream /models
 *   PUT    /api/settings/byok/:providerId            → { apiKey, baseUrl, models, enabled, defaultModel?, temperature?, routingPriority? }  → 200
 *   DELETE /api/settings/byok/:providerId            → 204
 *
 * Route order: specific literal paths are registered BEFORE /:key so they are
 * not shadowed by the param matcher.
 */

import { Router, Request, Response } from 'express';
import {
  listSettings,
  getSetting,
  setSetting,
  deleteSetting,
} from '../storage/settings';

const router = Router();

// ── Story 15.9 — Generation overrides discovery (env-locked model) ───────────
router.get('/generation-overrides', (_req: Request, res: Response) => {
  const envModel = process.env.SHADOWFLOW_DEFAULT_MODEL;
  res.json({
    model_locked: Boolean(envModel),
    ...(envModel ? { model_value: envModel } : {}),
  });
});

// ── BYOK provider config (must be before generic /:key) ──────────────────────

interface ByokProviderData {
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  /** Model IDs last pulled from upstream /models (badge = ☁ remote) */
  syncedModels?: string[];
  /** Model IDs the user added manually that are NOT in syncedModels (badge = ✎ manual) */
  manualModels?: string[];
}

interface ByokStore {
  providers: Record<string, ByokProviderData>;
  defaultModel?: string;
  temperature?: number;
  routingPriority?: string;
}

const BYOK_KEY = 'byok';

const BYOK_MODELS = [
  // Anthropic
  { id: 'claude-opus-4-7',       name: 'Claude Opus 4.7',       provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',     name: 'Claude Sonnet 4.6',     provider: 'anthropic' },
  { id: 'claude-haiku-4-5',      name: 'Claude Haiku 4.5',      provider: 'anthropic' },
  { id: 'claude-3-5-sonnet',     name: 'Claude 3.5 Sonnet',     provider: 'anthropic' },
  // OpenAI
  { id: 'gpt-4o',                name: 'GPT-4o',                provider: 'openai'    },
  { id: 'gpt-4o-mini',           name: 'GPT-4o Mini',           provider: 'openai'    },
  { id: 'o3',                    name: 'o3',                    provider: 'openai'    },
  { id: 'o4-mini',               name: 'o4-mini',               provider: 'openai'    },
  // Google Gemini (frontend provider id is `google`)
  { id: 'gemini-2.5-pro',        name: 'Gemini 2.5 Pro',        provider: 'google'    },
  { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      provider: 'google'    },
  { id: 'gemini-2.0-flash',      name: 'Gemini 2.0 Flash',      provider: 'google'    },
  // DeepSeek
  { id: 'deepseek-chat',         name: 'DeepSeek Chat',         provider: 'deepseek'  },
  { id: 'deepseek-reasoner',     name: 'DeepSeek Reasoner',     provider: 'deepseek'  },
  // Zhipu
  { id: 'glm-4-flash',           name: 'GLM-4 Flash',           provider: 'zhipu'     },
  { id: 'glm-4-plus',            name: 'GLM-4 Plus',            provider: 'zhipu'     },
  { id: 'glm-4',                 name: 'GLM-4',                 provider: 'zhipu'     },
  // Qwen
  { id: 'qwen3-max',             name: 'Qwen3 Max',             provider: 'qwen'      },
  { id: 'qwen-plus-latest',      name: 'Qwen Plus',             provider: 'qwen'      },
  { id: 'qwen3-coder-plus',      name: 'Qwen3 Coder Plus',      provider: 'qwen'      },
  // Moonshot
  { id: 'moonshot-v1-8k',        name: 'Moonshot v1 8k',        provider: 'moonshot'  },
  { id: 'moonshot-v1-32k',       name: 'Moonshot v1 32k',       provider: 'moonshot'  },
  { id: 'moonshot-v1-128k',      name: 'Moonshot v1 128k',      provider: 'moonshot'  },
  // Mistral
  { id: 'mistral-large-latest',  name: 'Mistral Large',         provider: 'mistral'   },
  { id: 'codestral-latest',      name: 'Codestral',             provider: 'mistral'   },
  // Groq
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B',       provider: 'groq'      },
  { id: 'mixtral-8x7b-32768',    name: 'Mixtral 8x7B',          provider: 'groq'      },
];

function loadByok(): ByokStore {
  const data = getSetting(BYOK_KEY) as ByokStore | undefined;
  return data && typeof data === 'object' ? data : { providers: {} };
}

function maskApiKey(key: string): string {
  if (!key || key.length < 4) return '';
  return `••••${key.slice(-4)}`;
}

// GET /api/settings/byok → { providers: {..., apiKey: masked}, defaultModel, temperature, routingPriority }
router.get('/byok', (_req: Request, res: Response) => {
  const store = loadByok();
  const masked: Record<string, ByokProviderData> = {};
  for (const [id, p] of Object.entries(store.providers)) {
    masked[id] = {
      ...p,
      apiKey: maskApiKey(p.apiKey),
      syncedModels: Array.isArray(p.syncedModels) ? p.syncedModels : [],
      manualModels: Array.isArray(p.manualModels) ? p.manualModels : [],
    };
  }
  res.json({
    providers: masked,
    defaultModel: store.defaultModel ?? null,
    temperature: typeof store.temperature === 'number' ? store.temperature : 0.2,
    routingPriority: store.routingPriority ?? 'fallback',
  });
});

// GET /api/settings/byok/models → { models: ModelDef[] }
router.get('/byok/models', (_req: Request, res: Response) => {
  res.json({ models: BYOK_MODELS });
});

// ── Remote model probe ─────────────────────────────────────────────────────
// GET /api/settings/byok/:providerId/models/remote
//   Hits the upstream provider's /models endpoint (or per-provider equivalent)
//   with the saved API key, returning the live model list.
//   Mirrors Shadow/aiConfigStore probeProviderModels() logic.

const PROVIDER_DEFAULT_BASE: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai:    'https://api.openai.com/v1',
  google:    'https://generativelanguage.googleapis.com/v1beta',
  gemini:    'https://generativelanguage.googleapis.com/v1beta',
  deepseek:  'https://api.deepseek.com',
  zhipu:     'https://open.bigmodel.cn/api/paas/v4',
  qwen:      'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot:  'https://api.moonshot.cn/v1',
  mistral:   'https://api.mistral.ai/v1',
  groq:      'https://api.groq.com/openai/v1',
  openrouter:'https://openrouter.ai/api/v1',
  ollama:    'http://localhost:11434',
  lmstudio:  'http://localhost:1234/v1',
};

const PROVIDERS_NO_KEY = new Set(['ollama', 'lmstudio']);

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

function stripTrailingSharp(s: string): string {
  return s.replace(/#$/, '');
}

/**
 * Detect a trailing API-version segment in a URL path (`/v1`, `/v2beta`, ...).
 * Mirrors Cherry Studio's hasAPIVersion — it inspects the URL's pathname for
 * a /v<n>(alpha|beta)? segment so callers can decide whether to auto-append.
 */
function hasAPIVersion(host: string): boolean {
  const VERSION_REGEX = /\/v\d+(?:alpha|beta)?(?:\/|$)/i;
  try {
    return VERSION_REGEX.test(new URL(host).pathname);
  } catch {
    return VERSION_REGEX.test(host);
  }
}

/**
 * Cherry Studio-style API host formatter.
 *
 *   - Empty / whitespace          → ''
 *   - Trailing '#'                → strip the '#' and DO NOT append (escape hatch)
 *   - supportApiVersion === false → return as-is, no version appended
 *   - URL path already contains   → return as-is
 *     a version segment (/v1, /v2beta, ...)
 *   - Otherwise                   → append `/<apiVersion>` (default `v1`)
 *
 * The big win over a per-provider suffix table is that unknown providers
 * (SiliconFlow, Together AI, custom gateways, ...) automatically get `/v1`
 * appended too, instead of failing with HTTP 404 on `/models`.
 */
export function formatApiHost(
  host: string | undefined | null,
  supportApiVersion = true,
  apiVersion = 'v1',
): string {
  const normalizedHost = stripTrailingSlash((host ?? '').trim());
  if (!normalizedHost) return '';

  const shouldAppend = !(
    normalizedHost.endsWith('#') ||
    !supportApiVersion ||
    hasAPIVersion(normalizedHost)
  );
  return shouldAppend ? `${normalizedHost}/${apiVersion}` : stripTrailingSharp(normalizedHost);
}

/**
 * Resolve the effective base URL for a probe request.
 * Falls back to PROVIDER_DEFAULT_BASE when the user hasn't configured one.
 */
export function normalizeProviderBaseUrl(providerId: string, rawBaseUrl?: string | null): string {
  const raw = rawBaseUrl?.trim() || PROVIDER_DEFAULT_BASE[providerId] || '';
  if (!raw) return '';
  // 'custom' provider: respect user input verbatim (no version inference)
  if (providerId === 'custom') return stripTrailingSharp(stripTrailingSlash(raw));
  // Gemini insists on /v1beta — handle via fetcher, just normalize trailing slash here
  if (providerId === 'google' || providerId === 'gemini') {
    return stripTrailingSharp(stripTrailingSlash(raw));
  }
  // Ollama serves /api/tags at the root — also bypass version inference here
  if (providerId === 'ollama') {
    return stripTrailingSharp(stripTrailingSlash(raw));
  }
  // Everything else: Cherry Studio's universal /v1 inference
  return formatApiHost(raw);
}

function buildRemoteModelsRequest(
  providerId: string,
  apiKey: string,
  baseUrl: string,
): { url: string; headers: Record<string, string>; effectiveBase: string } {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  const effectiveBase = normalizeProviderBaseUrl(providerId, baseUrl);

  if (providerId === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    // Anthropic /models lives under /v1 — use formatApiHost to ensure it's there
    const versionedBase = formatApiHost(effectiveBase);
    return { url: `${versionedBase}/models?limit=1000`, headers, effectiveBase: versionedBase };
  }

  if (providerId === 'google' || providerId === 'gemini') {
    // Gemini always uses /v1beta; strip any trailing /v1 or /v1beta the user
    // may have entered, then re-append /v1beta canonically (Cherry's geminiFetcher logic).
    const stripped = effectiveBase.replace(/\/v1(beta)?$/, '');
    return {
      url: `${stripped}/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`,
      headers,
      effectiveBase: stripped,
    };
  }

  // Ollama native /api/tags lives at the root. Mirror Cherry's ollamaFetcher:
  // strip `/v1`, `/api`, `/chat` from the tail so a user-supplied
  // `http://localhost:11434/v1` or `http://localhost:11434/api` both work.
  if (providerId === 'ollama') {
    const root = stripTrailingSlash(
      effectiveBase
        .replace(/\/v1$/, '')
        .replace(/\/api$/, '')
        .replace(/\/chat$/, ''),
    );
    return { url: `${root}/api/tags`, headers, effectiveBase: root };
  }

  // OpenAI-compatible default — effectiveBase already has /v1 thanks to formatApiHost
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return { url: `${effectiveBase}/models`, headers, effectiveBase };
}

interface RemoteModelDef { id: string; name: string; provider: string; }

function dedupModels(items: RemoteModelDef[]): RemoteModelDef[] {
  const seen = new Set<string>();
  const out: RemoteModelDef[] = [];
  for (const m of items) {
    if (!m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

function parseRemoteModels(data: unknown, providerId: string): RemoteModelDef[] {
  const raw = parseRemoteModelsRaw(data, providerId);
  return dedupModels(raw);
}

function parseRemoteModelsRaw(data: unknown, providerId: string): RemoteModelDef[] {
  const out: RemoteModelDef[] = [];
  if (!data || typeof data !== 'object') return out;
  const obj = data as Record<string, unknown>;

  // Anthropic /v1/models: { data: [{ id, display_name, type, created_at }] }
  if (providerId === 'anthropic' && Array.isArray(obj.data)) {
    for (const m of obj.data as Array<Record<string, unknown>>) {
      const id = typeof m.id === 'string' ? m.id : '';
      if (!id) continue;
      out.push({
        id,
        name: typeof m.display_name === 'string' ? m.display_name : id,
        provider: 'anthropic',
      });
    }
    return out;
  }

  // Gemini: { models: [{ name: "models/gemini-1.5-pro", displayName, supportedGenerationMethods }] }
  if ((providerId === 'google' || providerId === 'gemini') && Array.isArray(obj.models)) {
    for (const m of obj.models as Array<Record<string, unknown>>) {
      const rawName = typeof m.name === 'string' ? m.name : '';
      const id = rawName.replace(/^models\//, '');
      if (!id) continue;
      const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : null;
      if (methods && !methods.includes('generateContent')) continue;
      out.push({
        id,
        name: typeof m.displayName === 'string' ? m.displayName : id,
        provider: 'google',
      });
    }
    return out;
  }

  // OpenAI-compatible: { data: [{ id }] }
  if (Array.isArray(obj.data)) {
    for (const m of obj.data as Array<Record<string, unknown>>) {
      const id = typeof m.id === 'string' ? m.id : '';
      if (!id) continue;
      out.push({ id, name: id, provider: providerId });
    }
    return out;
  }

  // Ollama /api/tags: { models: [{ name, ... }] } — also accepted at /v1/models via OpenAI shim
  if (Array.isArray(obj.models)) {
    for (const m of obj.models as Array<Record<string, unknown>>) {
      const id = typeof m.name === 'string' ? m.name : (typeof m.id === 'string' ? m.id : '');
      if (!id) continue;
      out.push({ id, name: id, provider: providerId });
    }
    return out;
  }

  return out;
}

router.get('/byok/:providerId/models/remote', async (req: Request, res: Response) => {
  const { providerId } = req.params;
  const store = loadByok();
  const cfg = store.providers[providerId];

  // Resolve apiKey + baseUrl: prefer saved config, fall back to defaults for keyless providers
  const apiKey = cfg?.apiKey?.trim() ?? '';
  const baseUrl = (cfg?.baseUrl?.trim() || PROVIDER_DEFAULT_BASE[providerId] || '');

  if (!PROVIDERS_NO_KEY.has(providerId) && !apiKey) {
    return res.status(400).json({
      error: { code: 'NOT_CONFIGURED', message: '该提供商尚未配置 API Key，无法拉取远端模型列表' },
    });
  }
  if (!baseUrl) {
    return res.status(400).json({
      error: { code: 'NO_BASE_URL', message: '该提供商缺少 Base URL' },
    });
  }

  const { url, headers, effectiveBase } = buildRemoteModelsRequest(providerId, apiKey, baseUrl);

  try {
    const upstream = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      // 404 / 405 / 501 → provider doesn't expose a model catalog endpoint.
      // Surface this distinctly so the UI can quietly fall back to the static
      // catalog instead of yelling "failed".
      const notSupported = upstream.status === 404 || upstream.status === 405 || upstream.status === 501;
      const errCode = notSupported ? 'NO_REMOTE_CATALOG'
                    : upstream.status === 401 || upstream.status === 403 ? 'UPSTREAM_AUTH'
                    : 'UPSTREAM_ERROR';
      return res.status(notSupported ? 200 : 502).json({
        models: [],
        count: 0,
        source: notSupported ? 'unavailable' : 'error',
        providerId,
        error: {
          code: errCode,
          status: upstream.status,
          message: notSupported
            ? `${providerId} 未暴露模型列表接口（HTTP ${upstream.status}）`
            : `${providerId} /models returned ${upstream.status}`,
          detail: body.slice(0, 500),
        },
      });
    }
    const data = await upstream.json();
    const models = parseRemoteModels(data, providerId);
    return res.json({
      models,
      count: models.length,
      source: 'remote',
      providerId,
      effectiveBase,
      endpoint: url.replace(/key=[^&]+/, 'key=***'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({
      models: [],
      count: 0,
      source: 'error',
      providerId,
      error: { code: 'UPSTREAM_UNREACHABLE', message },
    });
  }
});

// PUT /api/settings/byok/:providerId → save provider config
router.put('/byok/:providerId', (req: Request, res: Response) => {
  const { providerId } = req.params;
  const {
    apiKey, baseUrl, models, enabled,
    syncedModels, manualModels,
    defaultModel, temperature, routingPriority,
  } = (req.body ?? {}) as {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
    enabled?: boolean;
    syncedModels?: string[];
    manualModels?: string[];
    defaultModel?: string;
    temperature?: number;
    routingPriority?: string;
  };

  const store = loadByok();
  const existing: ByokProviderData = store.providers[providerId] ?? {
    apiKey: '', baseUrl: '', models: [], enabled: false,
  };

  // Auto-normalize baseUrl on save so the persisted form is always probe-ready
  const rawBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : existing.baseUrl;
  const normalizedBaseUrl = rawBaseUrl
    ? normalizeProviderBaseUrl(providerId, rawBaseUrl)
    : existing.baseUrl;

  store.providers[providerId] = {
    apiKey: typeof apiKey === 'string' && apiKey.trim().length > 0 ? apiKey.trim() : existing.apiKey,
    baseUrl: normalizedBaseUrl,
    models: Array.isArray(models) ? models : existing.models,
    enabled: typeof enabled === 'boolean' ? enabled : existing.enabled,
    syncedModels: Array.isArray(syncedModels) ? syncedModels : (existing.syncedModels ?? []),
    manualModels: Array.isArray(manualModels) ? manualModels : (existing.manualModels ?? []),
  };

  if (typeof defaultModel === 'string') {
    store.defaultModel = defaultModel;
  }
  if (typeof temperature === 'number' && temperature >= 0 && temperature <= 2) {
    store.temperature = temperature;
  }
  if (typeof routingPriority === 'string') {
    store.routingPriority = routingPriority;
  }

  try {
    setSetting(BYOK_KEY, store);
    const saved = store.providers[providerId];
    res.json({ provider: { ...saved, apiKey: maskApiKey(saved.apiKey) } });
  } catch (e: unknown) {
    const code = e instanceof Error ? e.message : 'UNKNOWN';
    if (code === 'VALUE_TOO_LARGE') {
      return res.status(413).json({ error: { code, message: 'config too large' } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: code } });
  }
});

// DELETE /api/settings/byok/:providerId → remove provider
router.delete('/byok/:providerId', (req: Request, res: Response) => {
  const { providerId } = req.params;
  const store = loadByok();
  delete store.providers[providerId];
  try {
    setSetting(BYOK_KEY, store);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

// ── Story 15.17 — KV settings store ──────────────────────────────────────────

// GET /api/settings → { settings: { key: value, ... } }
router.get('/', (_req: Request, res: Response) => {
  res.json({ settings: listSettings() });
});

// GET /api/settings/:key → { key, value } | 404
router.get('/:key', (req: Request, res: Response) => {
  const key = req.params.key;
  const value = getSetting(key);
  if (value === undefined) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'setting not found' },
    });
  }
  res.json({ key, value });
});

// PUT /api/settings/:key { value } → 200 { key, value }
router.put('/:key', (req: Request, res: Response) => {
  const key = req.params.key;
  const body = (req.body ?? {}) as { value?: unknown };
  if (!('value' in body)) {
    return res.status(400).json({
      error: { code: 'INVALID_BODY', message: 'body must include `value`' },
    });
  }
  try {
    setSetting(key, body.value);
    res.json({ key, value: body.value });
  } catch (e: unknown) {
    const code = e instanceof Error ? e.message : 'UNKNOWN';
    if (code === 'KEY_FORBIDDEN') {
      return res.status(400).json({
        error: { code: 'KEY_FORBIDDEN', message: 'BYOK keys must stay client-only' },
      });
    }
    if (code === 'INVALID_KEY') {
      return res.status(400).json({
        error: { code: 'INVALID_KEY', message: 'key empty or > 128 chars' },
      });
    }
    if (code === 'VALUE_TOO_LARGE') {
      return res.status(413).json({
        error: { code: 'VALUE_TOO_LARGE', message: 'value exceeds 64KB cap' },
      });
    }
    return res.status(500).json({
      error: { code: 'INTERNAL', message: code },
    });
  }
});

// DELETE /api/settings/:key → 204
router.delete('/:key', (req: Request, res: Response) => {
  deleteSetting(req.params.key);
  res.status(204).send();
});

export default router;
