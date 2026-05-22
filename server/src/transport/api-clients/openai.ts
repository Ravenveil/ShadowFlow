/**
 * llm-providers/openai.ts — OpenAI provider (Story 15.18)
 *
 * Uses the official `openai` SDK against api.openai.com.
 * `deepseek.ts` reuses the same SDK with a different baseURL.
 */

import OpenAI from 'openai';
import {
  DEFAULT_MODELS,
  PROVIDER_ENV_VAR,
  PROVIDER_LABEL,
  type LLMProvider,
  type ProviderChunk,
  type ProviderErrorCode,
  type ProviderInput,
} from './types';

function classifyOpenAIError(err: unknown): ProviderErrorCode {
  const msg = (err as Error).message ?? String(err);
  const status = (err as { status?: number }).status;
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
  const resolvedKey = input.api_key ?? process.env[PROVIDER_ENV_VAR.openai];
  if (!resolvedKey) {
    yield {
      type: 'error',
      message: `未配置 ${PROVIDER_LABEL.openai} API Key。请在设置 → API 密钥 (BYOK) 中填入 sk-... 密钥。`,
      code: 'NO_API_KEY',
      provider: 'openai',
    };
    return;
  }

  const model = input.model ?? DEFAULT_MODELS.openai;

  const client = new OpenAI({ apiKey: resolvedKey });

  let stream: AsyncIterable<{
    choices?: { delta?: { content?: string | null } }[];
  }>;
  try {
    stream = (await client.chat.completions.create(
      {
        model,
        stream: true,
        ...(input.max_tokens !== undefined ? { max_tokens: input.max_tokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userMessage },
        ],
      },
      { signal: input.signal },
    )) as unknown as AsyncIterable<{
      choices?: { delta?: { content?: string | null } }[];
    }>;
  } catch (err) {
    if (input.signal?.aborted) return;
    yield {
      type: 'error',
      message: `OpenAI 流初始化失败: ${(err as Error).message ?? String(err)}`,
      code: classifyOpenAIError(err),
      provider: 'openai',
    };
    return;
  }

  try {
    for await (const chunk of stream) {
      if (input.signal?.aborted) return;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        yield { type: 'text-delta', text: delta };
      }
    }
    yield { type: 'end' };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (input.signal?.aborted || /aborted|AbortError/i.test(msg)) return;
    yield {
      type: 'error',
      message: `OpenAI 流出错: ${msg}`,
      code: classifyOpenAIError(err),
      provider: 'openai',
    };
  }
}

export const openaiProvider: LLMProvider = {
  id: 'openai',
  defaultModel: DEFAULT_MODELS.openai,
  streamCompletion,
};
