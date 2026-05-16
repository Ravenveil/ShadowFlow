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
    masked[id] = { ...p, apiKey: maskApiKey(p.apiKey) };
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
  ollama:    'http://localhost:11434/v1',
  lmstudio:  'http://localhost:1234/v1',
};

const PROVIDERS_NO_KEY = new Set(['ollama', 'lmstudio']);

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

function buildRemoteModelsRequest(
  providerId: string,
  apiKey: string,
  baseUrl: string,
): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  const base = stripTrailingSlash(baseUrl || PROVIDER_DEFAULT_BASE[providerId] || '');

  if (providerId === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return { url: `${base.replace(/\/v1$/, '')}/v1/models?limit=1000`, headers };
  }

  if (providerId === 'google' || providerId === 'gemini') {
    return {
      url: `${base}/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`,
      headers,
    };
  }

  // OpenAI-compatible default
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return { url: `${base}/models`, headers };
}

interface RemoteModelDef { id: string; name: string; provider: string; }

function parseRemoteModels(data: unknown, providerId: string): RemoteModelDef[] {
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

  const { url, headers } = buildRemoteModelsRequest(providerId, apiKey, baseUrl);

  try {
    const upstream = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      return res.status(502).json({
        error: {
          code: 'UPSTREAM_ERROR',
          status: upstream.status,
          message: `${providerId} /models returned ${upstream.status}`,
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
      endpoint: url.replace(/key=[^&]+/, 'key=***'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({
      error: { code: 'UPSTREAM_UNREACHABLE', message },
    });
  }
});

// PUT /api/settings/byok/:providerId → save provider config
router.put('/byok/:providerId', (req: Request, res: Response) => {
  const { providerId } = req.params;
  const { apiKey, baseUrl, models, enabled, defaultModel, temperature, routingPriority } = (req.body ?? {}) as {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
    enabled?: boolean;
    defaultModel?: string;
    temperature?: number;
    routingPriority?: string;
  };

  const store = loadByok();
  const existing: ByokProviderData = store.providers[providerId] ?? {
    apiKey: '', baseUrl: '', models: [], enabled: false,
  };

  store.providers[providerId] = {
    apiKey: typeof apiKey === 'string' && apiKey.trim().length > 0 ? apiKey.trim() : existing.apiKey,
    baseUrl: typeof baseUrl === 'string' ? baseUrl.trim() : existing.baseUrl,
    models: Array.isArray(models) ? models : existing.models,
    enabled: typeof enabled === 'boolean' ? enabled : existing.enabled,
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
