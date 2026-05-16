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

/**
 * Endpoint protocol type (Cherry Studio-style).
 * Determines which request shape / response parser we use when probing a
 * provider's model catalog, independent of the provider id. A user-defined
 * "custom" provider can pick any of these.
 */
export type EndpointType = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'azure-openai';

const VALID_ENDPOINT_TYPES: ReadonlySet<EndpointType> = new Set([
  'openai', 'anthropic', 'gemini', 'ollama', 'azure-openai',
] as const);

interface ByokProviderData {
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  /** Override the endpoint protocol type (falls back to PROVIDER_DEFAULT_TYPE) */
  type?: EndpointType;
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
      type: resolveEndpointType(id, p.type),
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

/**
 * Default endpoint type per known provider id. Anything not in this map
 * defaults to 'openai' (covers SiliconFlow, Together, custom gateways, ...).
 */
const PROVIDER_DEFAULT_TYPE: Record<string, EndpointType> = {
  anthropic:  'anthropic',
  openai:     'openai',
  google:     'gemini',
  gemini:     'gemini',
  deepseek:   'openai',
  zhipu:      'openai',
  qwen:       'openai',
  moonshot:   'openai',
  mistral:    'openai',
  groq:       'openai',
  openrouter: 'openai',
  ollama:     'ollama',
  lmstudio:   'openai',
  azure:      'azure-openai',
};

function resolveEndpointType(providerId: string, override?: string): EndpointType {
  if (override && VALID_ENDPOINT_TYPES.has(override as EndpointType)) {
    return override as EndpointType;
  }
  return PROVIDER_DEFAULT_TYPE[providerId] ?? 'openai';
}

/**
 * Parse a comma/newline-separated apiKey field into individual keys.
 * Mirrors Cherry Studio's formatApiKeys + getApiKey split logic.
 */
function parseApiKeys(raw: string): string[] {
  if (!raw) return [];
  return raw
    .replace(/，/g, ',')   // full-width comma (common when pasted from Chinese sources)
    .replace(/\n/g, ',')   // newline → comma so users can paste multi-line
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

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

// ── Probe request builders (per endpoint type) ─────────────────────────────

/**
 * Default header bundle. Cherry Studio sends BOTH `Authorization: Bearer` and
 * `X-Api-Key` so the request works against proxies / gateways that only check
 * one of the two.
 */
function dualKeyHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) return {};
  return { 'Authorization': `Bearer ${apiKey}`, 'X-Api-Key': apiKey };
}

interface ProbeRequest { url: string; headers: Record<string, string>; effectiveBase: string; }

function buildOpenAIProbe(apiKey: string, effectiveBase: string): ProbeRequest {
  return {
    url: `${effectiveBase}/models`,
    headers: { 'Accept': 'application/json', ...dualKeyHeaders(apiKey) },
    effectiveBase,
  };
}

function buildAnthropicProbe(apiKey: string, effectiveBase: string): ProbeRequest {
  // Anthropic /models lives under /v1 — formatApiHost guarantees it's there
  const versionedBase = formatApiHost(effectiveBase);
  return {
    url: `${versionedBase}/models?limit=1000`,
    headers: {
      'Accept': 'application/json',
      'x-api-key': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
    },
    effectiveBase: versionedBase,
  };
}

function buildGeminiProbe(apiKey: string, effectiveBase: string): ProbeRequest {
  // Gemini always uses /v1beta. Strip any trailing /v1 or /v1beta the user
  // entered, then re-append canonically.
  const stripped = effectiveBase.replace(/\/v1(beta)?$/, '');
  return {
    url: `${stripped}/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`,
    headers: { 'Accept': 'application/json' },
    effectiveBase: stripped,
  };
}

function buildOllamaProbe(apiKey: string, effectiveBase: string): ProbeRequest {
  // /api/tags lives at the root. Strip /v1, /api, /chat tails so users can
  // paste any of `http://host:11434`, `…/v1`, `…/api`, `…/chat`.
  const root = stripTrailingSlash(
    effectiveBase
      .replace(/\/v1$/, '')
      .replace(/\/api$/, '')
      .replace(/\/chat$/, ''),
  );
  return {
    url: `${root}/api/tags`,
    headers: { 'Accept': 'application/json', ...dualKeyHeaders(apiKey) },
    effectiveBase: root,
  };
}

function buildProbeRequest(type: EndpointType, apiKey: string, effectiveBase: string): ProbeRequest {
  switch (type) {
    case 'anthropic':    return buildAnthropicProbe(apiKey, effectiveBase);
    case 'gemini':       return buildGeminiProbe(apiKey, effectiveBase);
    case 'ollama':       return buildOllamaProbe(apiKey, effectiveBase);
    case 'azure-openai':
    case 'openai':
    default:             return buildOpenAIProbe(apiKey, effectiveBase);
  }
}

// ── Response parsers (per endpoint type) ───────────────────────────────────

/** Capability tags surfaced to the UI for badges & filtering */
export type ModelCapability =
  | 'vision'
  | 'embedding'
  | 'function_calling'
  | 'reasoning'
  | 'image_generation'
  | 'audio'
  | 'rerank'
  | 'web_search';

interface RemoteModelDef {
  id: string;
  name: string;
  provider: string;
  /** Family label for UI grouping (e.g. "GLM-4.5", "Claude 4", "GPT-5") */
  group?: string;
  /** Inferred capabilities — embedding / vision / reasoning / etc */
  capabilities?: ModelCapability[];
  owned_by?: string;
  description?: string;
}

/** Pattern-based capability detection. Lossy but covers ~90% of major providers. */
function inferCapabilities(id: string, raw?: Record<string, unknown>): ModelCapability[] {
  const caps = new Set<ModelCapability>();
  const lower = id.toLowerCase();

  // Embedding (also accept explicit type from upstream)
  if (
    /embed|embedding|ada-002|text-embedding|bge|m3e|gte-|voyage-/i.test(lower) ||
    (raw && typeof raw.type === 'string' && raw.type === 'embedding')
  ) caps.add('embedding');

  // Rerank
  if (/rerank|reranker/i.test(lower)) caps.add('rerank');

  // Image generation
  if (/dall-?e|gpt-image|flux|stable-diffusion|sd-|midjourney|imagen/i.test(lower)) {
    caps.add('image_generation');
  }

  // Audio / speech
  if (/whisper|tts|audio|speech|voice/i.test(lower)) caps.add('audio');

  // Vision (multimodal)
  if (/vision|gpt-4o|gpt-4-turbo|gpt-5|claude-3|claude-4|claude-sonnet-4|claude-opus-4|claude-haiku-4|gemini|glm-4\.\d+v|glm-4v|qwen.*vl|qwen2\.5-vl|llava|pixtral/i.test(lower)) {
    caps.add('vision');
  }

  // Reasoning ("thinking" models)
  if (/^o\d|deepseek-reasoner|deepseek-r\d|gpt-5.*thinking|claude.*thinking|qwq|glm-zero/i.test(lower)) {
    caps.add('reasoning');
  }

  // Function calling — most modern chat models support it; exclude embeddings/images/audio
  if (
    !caps.has('embedding') && !caps.has('image_generation') && !caps.has('audio') && !caps.has('rerank') &&
    /gpt-4|gpt-3\.5-turbo-(0613|1106|0125)|gpt-5|gpt-4o|claude-3|claude-4|claude-sonnet|claude-opus|claude-haiku|deepseek-(chat|coder|v)|qwen|glm-4|kimi|moonshot|mistral-(small|medium|large)|codestral|gemini|llama-3|llama-4/i.test(lower)
  ) caps.add('function_calling');

  return Array.from(caps);
}

/**
 * Infer the family/group label for UI grouping. Mirrors the way Cherry Studio
 * groups models under headings like "GLM-4.5", "GLM-4.6V", "Embedding".
 */
function inferGroup(id: string, capabilities: ModelCapability[]): string {
  if (capabilities.includes('embedding')) return 'Embedding';
  if (capabilities.includes('rerank')) return 'Rerank';
  if (capabilities.includes('image_generation')) return 'Image';
  if (capabilities.includes('audio')) return 'Audio';

  // OpenRouter-style vendor/model — take the vendor as the group
  const slashIdx = id.indexOf('/');
  if (slashIdx > 0) return id.slice(0, slashIdx);

  // Extract <family>-<major>[.<minor>][letter] (e.g. glm-4.5v, claude-sonnet-4, gpt-4o, gemini-2.5)
  const m = id.match(/^([a-z][a-z]+(?:-[a-z]+)*(?:-\d+(?:\.\d+)?[a-z]?)?)/i);
  if (m) return m[1].toUpperCase();

  return id.toUpperCase();
}

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

function annotateModel(base: RemoteModelDef, raw?: Record<string, unknown>): RemoteModelDef {
  const capabilities = inferCapabilities(base.id, raw);
  return {
    ...base,
    capabilities,
    group: base.group ?? inferGroup(base.id, capabilities),
  };
}

function parseOpenAIResponse(data: unknown, providerId: string): RemoteModelDef[] {
  const obj = (data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(obj.data)) return [];
  return (obj.data as Array<Record<string, unknown>>)
    .filter(m => typeof m.id === 'string' && (m.id as string).length > 0)
    .map(m => annotateModel({
      id: m.id as string,
      name: m.id as string,
      provider: providerId,
      owned_by: typeof m.owned_by === 'string' ? m.owned_by : undefined,
    }, m));
}

function parseAnthropicResponse(data: unknown, providerId: string): RemoteModelDef[] {
  const obj = (data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(obj.data)) return [];
  return (obj.data as Array<Record<string, unknown>>)
    .filter(m => typeof m.id === 'string' && (m.id as string).length > 0)
    .map(m => annotateModel({
      id: m.id as string,
      name: typeof m.display_name === 'string' ? m.display_name : (m.id as string),
      provider: providerId,
    }, m));
}

function parseGeminiResponse(data: unknown, providerId: string): RemoteModelDef[] {
  const obj = (data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(obj.models)) return [];
  return (obj.models as Array<Record<string, unknown>>)
    .filter(m => typeof m.name === 'string' && (m.name as string).length > 0)
    .filter(m => {
      const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : null;
      // Accept models that support generateContent OR embedContent (we want both)
      return !methods || methods.includes('generateContent') || methods.includes('embedContent');
    })
    .map(m => {
      const id = (m.name as string).replace(/^models\//, '');
      const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      const base: RemoteModelDef = {
        id,
        name: typeof m.displayName === 'string' ? m.displayName : id,
        provider: providerId,
        description: typeof m.description === 'string' ? m.description : undefined,
      };
      const annotated = annotateModel(base, m);
      // Gemini explicitly declares embedding support via supportedGenerationMethods
      if (methods.includes('embedContent') && !annotated.capabilities?.includes('embedding')) {
        annotated.capabilities = [...(annotated.capabilities ?? []), 'embedding'];
        annotated.group = 'Embedding';
      }
      return annotated;
    });
}

function parseOllamaResponse(data: unknown, providerId: string): RemoteModelDef[] {
  const obj = (data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(obj.models)) return [];
  return (obj.models as Array<Record<string, unknown>>)
    .filter(m => typeof m.name === 'string' && (m.name as string).length > 0)
    .map(m => annotateModel({
      id: m.name as string,
      name: m.name as string,
      provider: providerId,
      owned_by: 'ollama',
    }, m));
}

function parseProbeResponse(data: unknown, type: EndpointType, providerId: string): RemoteModelDef[] {
  let parsed: RemoteModelDef[];
  switch (type) {
    case 'anthropic':    parsed = parseAnthropicResponse(data, providerId); break;
    case 'gemini':       parsed = parseGeminiResponse(data, providerId); break;
    case 'ollama':       parsed = parseOllamaResponse(data, providerId); break;
    case 'azure-openai':
    case 'openai':
    default:             parsed = parseOpenAIResponse(data, providerId); break;
  }
  return dedupModels(parsed);
}

router.get('/byok/:providerId/models/remote', async (req: Request, res: Response) => {
  const { providerId } = req.params;
  const store = loadByok();
  const cfg = store.providers[providerId];

  const apiKeys = parseApiKeys(cfg?.apiKey ?? '');
  const baseUrl = (cfg?.baseUrl?.trim() || PROVIDER_DEFAULT_BASE[providerId] || '');
  const type = resolveEndpointType(providerId, cfg?.type);

  if (!PROVIDERS_NO_KEY.has(providerId) && apiKeys.length === 0) {
    return res.status(400).json({
      error: { code: 'NOT_CONFIGURED', message: '该提供商尚未配置 API Key，无法拉取远端模型列表' },
    });
  }
  if (!baseUrl) {
    return res.status(400).json({
      error: { code: 'NO_BASE_URL', message: '该提供商缺少 Base URL' },
    });
  }

  // Try keys in order. Failover ONLY on auth errors (401/403) or network
  // errors — 404 etc. are deterministic per endpoint and won't be fixed by
  // swapping keys.
  const keysToTry = apiKeys.length > 0 ? apiKeys : [''];
  type FetchResponse = globalThis.Response;
  let upstream: FetchResponse | null = null;
  let lastError: unknown = null;
  let probeUrl = '';
  let effectiveBase = '';
  let keysAttempted = 0;
  let keyIndexUsed = -1;

  for (let i = 0; i < keysToTry.length; i++) {
    const key = keysToTry[i];
    const probe = buildProbeRequest(type, key, normalizeProviderBaseUrl(providerId, baseUrl));
    probeUrl = probe.url;
    effectiveBase = probe.effectiveBase;
    keysAttempted++;
    try {
      const resp = await fetch(probe.url, {
        headers: probe.headers,
        signal: AbortSignal.timeout(15000),
      });
      // Auth failure with more keys available → try next
      if ((resp.status === 401 || resp.status === 403) && i < keysToTry.length - 1) {
        continue;
      }
      upstream = resp;
      keyIndexUsed = i;
      break;
    } catch (err) {
      lastError = err;
      if (i < keysToTry.length - 1) continue;
    }
  }

  if (!upstream) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    return res.status(502).json({
      models: [], count: 0, source: 'error', providerId,
      keysAttempted,
      error: { code: 'UPSTREAM_UNREACHABLE', message },
    });
  }

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    const notSupported = upstream.status === 404 || upstream.status === 405 || upstream.status === 501;
    const errCode = notSupported ? 'NO_REMOTE_CATALOG'
                  : upstream.status === 401 || upstream.status === 403 ? 'UPSTREAM_AUTH'
                  : 'UPSTREAM_ERROR';
    return res.status(notSupported ? 200 : 502).json({
      models: [], count: 0,
      source: notSupported ? 'unavailable' : 'error',
      providerId,
      endpointType: type,
      keysAttempted,
      effectiveBase,
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
  const models = parseProbeResponse(data, type, providerId);
  return res.json({
    models,
    count: models.length,
    source: 'remote',
    providerId,
    endpointType: type,
    effectiveBase,
    keysAttempted,
    keyIndexUsed,
    endpoint: probeUrl.replace(/key=[^&]+/, 'key=***'),
  });
});

// PUT /api/settings/byok/:providerId → save provider config
router.put('/byok/:providerId', (req: Request, res: Response) => {
  const { providerId } = req.params;
  const {
    apiKey, baseUrl, models, enabled, type,
    syncedModels, manualModels,
    defaultModel, temperature, routingPriority,
  } = (req.body ?? {}) as {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
    enabled?: boolean;
    type?: string;
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
    type: typeof type === 'string' && VALID_ENDPOINT_TYPES.has(type as EndpointType)
      ? (type as EndpointType)
      : existing.type,
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
