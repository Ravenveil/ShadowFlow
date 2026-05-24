/**
 * llm-providers/zhipu.ts — Zhipu (智谱 GLM) provider (Story 15.18)
 *
 * Pure `fetch` against the OpenAI-compatible endpoint. Two billing surfaces:
 *
 *   - /api/coding/paas/v4/chat/completions  (Coding Plan, default 2026-05-24)
 *     Subscription plan billed on a monthly quota. Covers glm-5.1, glm-4.6,
 *     glm-4.5 family. Most users on the Coding Plan are routed here.
 *
 *   - /api/paas/v4/chat/completions          (Pay-as-you-go resource packs)
 *     Per-token billing against the "API 资源包". Some accounts have only
 *     this surface; configure `base_url` in settings to override.
 *
 * Avoids dragging in a SDK that the spec calls out as "包大且更新慢"; the
 * protocol is identical to OpenAI chat completions so a hand-rolled SSE
 * reader keeps the code small.
 */

import {
  DEFAULT_MODELS,
  PROVIDER_ENV_VAR,
  PROVIDER_LABEL,
  type LLMProvider,
  type ProviderChunk,
  type ProviderErrorCode,
  type ProviderInput,
} from './types';

const ZHIPU_URL_DEFAULT = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';

function resolveZhipuUrl(baseUrl: string | undefined): string {
  if (!baseUrl || !baseUrl.trim()) return ZHIPU_URL_DEFAULT;
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  // If user already gave us a /chat/completions URL, use as-is.
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function classifyZhipuError(status: number | undefined, msg: string): ProviderErrorCode {
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

async function* streamCompletion(input: ProviderInput): AsyncGenerator<ProviderChunk> {
  const resolvedKey = input.api_key ?? process.env[PROVIDER_ENV_VAR.zhipu];
  if (!resolvedKey) {
    yield {
      type: 'error',
      message: `未配置 ${PROVIDER_LABEL.zhipu} API Key。请在设置 → API 密钥 (BYOK) 中填入智谱 key。`,
      code: 'NO_API_KEY',
      provider: 'zhipu',
    };
    return;
  }

  const model = input.model ?? DEFAULT_MODELS.zhipu;
  const url = resolveZhipuUrl(input.base_url);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedKey}`,
      },
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
      message: `Zhipu 流初始化失败: ${msg}`,
      code: classifyZhipuError(undefined, msg),
      provider: 'zhipu',
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
      message: `Zhipu HTTP ${resp.status}: ${errBody.slice(0, 200) || resp.statusText}`,
      code: classifyZhipuError(resp.status, errBody),
      provider: 'zhipu',
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
              choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
            };
            // glm-5.1 emits its chain-of-thought as `reasoning_content`
            // before the actual `content` starts. Without forwarding it
            // the user stares at a blank screen for tens of seconds while
            // the model thinks. Treat both as text-delta — front-end can
            // decide how to render them later.
            const delta = obj.choices?.[0]?.delta;
            const reasoning = delta?.reasoning_content;
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              yield { type: 'text-delta', text: reasoning };
            }
            const content = delta?.content;
            if (typeof content === 'string' && content.length > 0) {
              yield { type: 'text-delta', text: content };
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
      message: `Zhipu 流出错: ${msg}`,
      code: classifyZhipuError(undefined, msg),
      provider: 'zhipu',
    };
  }
}

export const zhipuProvider: LLMProvider = {
  id: 'zhipu',
  defaultModel: DEFAULT_MODELS.zhipu,
  streamCompletion,
};
