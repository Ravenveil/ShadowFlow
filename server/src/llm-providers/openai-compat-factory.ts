/**
 * openai-compat-factory.ts — One implementation for all OpenAI-compatible
 * providers. 90% of supported providers (openai / deepseek / zhipu / qwen /
 * moonshot / mistral / groq / openrouter / ollama / lmstudio) speak the
 * exact same `/chat/completions` SSE protocol — only the URL, default model,
 * and key envelope differ. Spawning 10 near-identical files would be DRY
 * abuse, so we generate them all from this factory.
 *
 * Anthropic + Gemini have distinct protocols and live in their own files.
 */

import {
  DEFAULT_MODELS,
  PROVIDER_ENV_VAR,
  PROVIDER_LABEL,
  PROVIDERS_NO_KEY,
  type LLMProvider,
  type ProviderChunk,
  type ProviderErrorCode,
  type ProviderId,
  type ProviderInput,
} from './types';

export interface OpenAICompatConfig {
  /** Provider id (must already be in the ProviderId union). */
  id: ProviderId;
  /**
   * Full chat-completions URL. May be overridden per-request by
   * `input.base_url`. Example: 'https://api.deepseek.com/v1/chat/completions'.
   */
  defaultUrl: string;
  /**
   * Optional URL transform for when the user supplies `base_url`. Most
   * providers just append `/chat/completions` to whatever base the user
   * gave; some (e.g. ollama) need a different suffix.
   */
  buildUrl?: (baseUrl: string) => string;
  /**
   * Extra HTTP headers to add. Default sets Authorization: Bearer <key>.
   * Override for providers that need an x-api-key header instead, etc.
   */
  buildHeaders?: (apiKey: string) => Record<string, string>;
  /**
   * Provider id used in the human-readable error message prefix. Falls
   * back to PROVIDER_LABEL[id].
   */
  errorLabel?: string;
}

function classifyError(status: number | undefined, msg: string): ProviderErrorCode {
  if (status === 401 || /invalid[\s_-]?api[\s_-]?key|unauthorized/i.test(msg)) {
    return 'AUTH_FAILED';
  }
  if (status === 429 || /rate[\s_-]?limit/i.test(msg)) return 'RATE_LIMITED';
  if (status === 404 || /model[\s_-]?not[\s_-]?found|does not exist/i.test(msg)) {
    return 'MODEL_NOT_FOUND';
  }
  if (/network|fetch|ECONN|ENOTFOUND|ETIMEDOUT/i.test(msg)) return 'NETWORK_ERROR';
  return 'PROVIDER_ERROR';
}

function defaultBuildUrl(base: string): string {
  // If user supplied a full /chat/completions URL, respect it; otherwise append.
  const stripped = base.replace(/\/+$/, '');
  return /\/chat\/completions(\?.*)?$/.test(stripped)
    ? stripped
    : `${stripped}/chat/completions`;
}

function defaultBuildHeaders(apiKey: string): Record<string, string> {
  const out: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    out['Authorization'] = `Bearer ${apiKey}`;
    // Dual-header for proxy compatibility (mirrors Cherry Studio's defaultHeaders).
    out['X-Api-Key'] = apiKey;
  }
  return out;
}

export function createOpenAICompatProvider(config: OpenAICompatConfig): LLMProvider {
  const label = config.errorLabel ?? PROVIDER_LABEL[config.id];
  const buildUrl = config.buildUrl ?? defaultBuildUrl;
  const buildHeaders = config.buildHeaders ?? defaultBuildHeaders;

  async function* streamCompletion(input: ProviderInput): AsyncGenerator<ProviderChunk> {
    const resolvedKey =
      input.api_key ?? process.env[PROVIDER_ENV_VAR[config.id]] ?? '';

    if (!resolvedKey && !PROVIDERS_NO_KEY.has(config.id)) {
      yield {
        type: 'error',
        message: `未配置 ${label} API Key。请在设置 → API 密钥 (BYOK) 中填入 key。`,
        code: 'NO_API_KEY',
        provider: config.id,
      };
      return;
    }

    const url = input.base_url ? buildUrl(input.base_url) : config.defaultUrl;
    const model = input.model ?? DEFAULT_MODELS[config.id];

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(resolvedKey),
        body: JSON.stringify({
          model,
          stream: true,
          ...(input.max_tokens !== undefined ? { max_tokens: input.max_tokens } : {}),
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userMessage },
          ],
        }),
        signal: input.signal,
      });
    } catch (err) {
      if (input.signal?.aborted) return;
      const msg = (err as Error).message ?? String(err);
      yield {
        type: 'error',
        message: `${label} 流初始化失败: ${msg}`,
        code: classifyError(undefined, msg),
        provider: config.id,
      };
      return;
    }

    if (!resp.ok || !resp.body) {
      let errBody = '';
      try {
        errBody = await resp.text();
      } catch {
        /* ignore */
      }
      yield {
        type: 'error',
        message: `${label} HTTP ${resp.status}: ${errBody.slice(0, 200) || resp.statusText}`,
        code: classifyError(resp.status, errBody),
        provider: config.id,
      };
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        if (input.signal?.aborted) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE framing: events split by `\n\n`; each event has `data: <payload>` lines.
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of rawEvent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') {
              yield { type: 'end' };
              return;
            }
            if (!payload) continue;
            try {
              const obj = JSON.parse(payload) as {
                choices?: { delta?: { content?: string | null } }[];
              };
              const delta = obj.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                yield { type: 'text-delta', text: delta };
              }
            } catch {
              // Skip malformed lines silently.
            }
          }
        }
      }
      yield { type: 'end' };
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      if (input.signal?.aborted || /aborted|AbortError/i.test(msg)) return;
      yield {
        type: 'error',
        message: `${label} 流出错: ${msg}`,
        code: classifyError(undefined, msg),
        provider: config.id,
      };
    }
  }

  return {
    id: config.id,
    defaultModel: DEFAULT_MODELS[config.id],
    streamCompletion,
  };
}
