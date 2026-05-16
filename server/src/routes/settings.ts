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
 *   GET    /api/settings/byok              → { providers: { [id]: ProviderData (masked key) } }
 *   GET    /api/settings/byok/models       → { models: ModelDef[] }
 *   PUT    /api/settings/byok/:providerId  → { apiKey, baseUrl, models, enabled }  → 200
 *   DELETE /api/settings/byok/:providerId  → 204
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
}

const BYOK_KEY = 'byok';

const BYOK_MODELS = [
  { id: 'claude-opus-4-7',       name: 'Claude Opus 4.7',       provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',     name: 'Claude Sonnet 4.6',     provider: 'anthropic' },
  { id: 'claude-haiku-4-5',      name: 'Claude Haiku 4.5',      provider: 'anthropic' },
  { id: 'claude-3-5-sonnet',     name: 'Claude 3.5 Sonnet',     provider: 'anthropic' },
  { id: 'gpt-4o',                name: 'GPT-4o',                provider: 'openai'    },
  { id: 'gpt-4o-mini',           name: 'GPT-4o Mini',           provider: 'openai'    },
  { id: 'o3',                    name: 'o3',                    provider: 'openai'    },
  { id: 'o4-mini',               name: 'o4-mini',               provider: 'openai'    },
  { id: 'gemini-2.5-pro',        name: 'Gemini 2.5 Pro',        provider: 'gemini'    },
  { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      provider: 'gemini'    },
  { id: 'gemini-2.0-flash',      name: 'Gemini 2.0 Flash',      provider: 'gemini'    },
  { id: 'deepseek-chat',         name: 'DeepSeek Chat',         provider: 'deepseek'  },
  { id: 'deepseek-reasoner',     name: 'DeepSeek Reasoner',     provider: 'deepseek'  },
  { id: 'glm-4-flash',           name: 'GLM-4 Flash',           provider: 'zhipu'     },
  { id: 'glm-4-plus',            name: 'GLM-4 Plus',            provider: 'zhipu'     },
  { id: 'glm-4',                 name: 'GLM-4',                 provider: 'zhipu'     },
  { id: 'qwen3-max',             name: 'Qwen3 Max',             provider: 'qwen'      },
  { id: 'qwen-plus-latest',      name: 'Qwen Plus',             provider: 'qwen'      },
];

function loadByok(): ByokStore {
  const data = getSetting(BYOK_KEY) as ByokStore | undefined;
  return data && typeof data === 'object' ? data : { providers: {} };
}

function maskApiKey(key: string): string {
  if (!key || key.length < 4) return '';
  return `••••${key.slice(-4)}`;
}

// GET /api/settings/byok → { providers: {..., apiKey: masked}, defaultModel }
router.get('/byok', (_req: Request, res: Response) => {
  const store = loadByok();
  const masked: Record<string, ByokProviderData> = {};
  for (const [id, p] of Object.entries(store.providers)) {
    masked[id] = { ...p, apiKey: maskApiKey(p.apiKey) };
  }
  res.json({ providers: masked, defaultModel: store.defaultModel ?? null });
});

// GET /api/settings/byok/models → { models: ModelDef[] }
router.get('/byok/models', (_req: Request, res: Response) => {
  res.json({ models: BYOK_MODELS });
});

// PUT /api/settings/byok/:providerId → save provider config
router.put('/byok/:providerId', (req: Request, res: Response) => {
  const { providerId } = req.params;
  const { apiKey, baseUrl, models, enabled, defaultModel } = (req.body ?? {}) as {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
    enabled?: boolean;
    defaultModel?: string;
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
