/**
 * storage/embedding.ts — Embedding model config for knowledge-base vectorization.
 *
 * Storage: $CWD/.shadowflow/embedding-config.json (atomic write, chmod 0600).
 *
 * Cross-process contract: the Python MemoryBank (backend/python/shadowflow/
 * memory/memory_bank.py → SettingsBackedEmbedder) reads the SAME file to build
 * its OpenAI-compatible /embeddings client, so changes saved from the settings
 * UI take effect on the next ingest/query without a restart.
 *
 * Shape:
 *   {
 *     "enabled":   boolean,     // master switch; false → BM25 keyword mode
 *     "provider":  string,      // 'qwen' | 'openai' | 'custom' | ...
 *     "model":     string,      // e.g. 'text-embedding-v4'
 *     "baseUrl":   string,      // OpenAI-compatible base, no trailing /embeddings
 *     "apiKey":    string,      // plaintext (local single-user app, same as BYOK)
 *     "updatedAt": string       // ISO-8601
 *   }
 *
 * Defaults follow the product spec: qwen (DashScope compatible-mode) with the
 * latest qwen embedding model. API keys are NEVER baked in — the file is
 * created only when the user saves config, and ships with an empty apiKey.
 */

import fs from 'fs';
import path from 'path';

export interface EmbeddingConfig {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  updatedAt?: string;
}

/** Product defaults: qwen embedding via DashScope OpenAI-compatible endpoint. */
export const EMBEDDING_DEFAULTS: EmbeddingConfig = {
  enabled: false,
  provider: 'qwen',
  model: 'text-embedding-v4',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
};

const VALID_PROVIDERS = new Set(['qwen', 'openai', 'zhipu', 'mimo', 'deepseek', 'custom']);

function configPath(): string {
  return path.join(process.cwd(), '.shadowflow', 'embedding-config.json');
}

/** Merge file contents over defaults; tolerant of partial / corrupt files. */
export function loadEmbeddingConfig(): EmbeddingConfig {
  const file = configPath();
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return { ...EMBEDDING_DEFAULTS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<EmbeddingConfig> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...EMBEDDING_DEFAULTS };
    }
    return {
      enabled: parsed.enabled === true,
      provider:
        typeof parsed.provider === 'string' && VALID_PROVIDERS.has(parsed.provider)
          ? parsed.provider
          : EMBEDDING_DEFAULTS.provider,
      model:
        typeof parsed.model === 'string' && parsed.model.trim()
          ? parsed.model.trim()
          : EMBEDDING_DEFAULTS.model,
      baseUrl:
        typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
          ? parsed.baseUrl.trim()
          : EMBEDDING_DEFAULTS.baseUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return { ...EMBEDDING_DEFAULTS };
  }
}

/** Atomic write with restrictive perms (mirrors storage/settings.ts). */
export function saveEmbeddingConfig(config: EmbeddingConfig): void {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    // Windows: chmod is best-effort.
  }
  fs.renameSync(tmp, file);
}

/** '****abcd' shoulder-surf guard for the default view. */
export function maskApiKey(key: string): string | null {
  if (!key) return null;
  return `****${key.slice(-4)}`;
}
