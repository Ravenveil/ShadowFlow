/**
 * llm-providers/anthropic.ts — Anthropic provider (Story 15.18)
 *
 * Pure extraction of the Anthropic SDK `messages.stream` path from
 * `skill-runners/anthropic.ts`. The runner now constructs ProviderInput and
 * delegates here via `callProvider('anthropic', ...)`. Behavior is unchanged
 * for the existing default executor path.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_MODELS,
  PROVIDER_ENV_VAR,
  PROVIDER_LABEL,
  type LLMProvider,
  type ProviderChunk,
  type ProviderErrorCode,
  type ProviderInput,
} from './types';

function classifyAnthropicError(err: unknown): ProviderErrorCode {
  const msg = (err as Error).message ?? String(err);
  // Anthropic SDK errors carry a `status` field; fall back to message regex.
  const status = (err as { status?: number }).status;
  if (status === 401 || /invalid[\s_-]?api[\s_-]?key|unauthorized/i.test(msg)) {
    return 'AUTH_FAILED';
  }
  if (status === 429 || /rate[\s_-]?limit/i.test(msg)) return 'RATE_LIMITED';
  if (status === 404 || /model[\s_-]?not[\s_-]?found/i.test(msg)) return 'MODEL_NOT_FOUND';
  if (/network|fetch|ECONN|ENOTFOUND|ETIMEDOUT/i.test(msg)) return 'NETWORK_ERROR';
  return 'PROVIDER_ERROR';
}

async function* streamCompletion(input: ProviderInput): AsyncGenerator<ProviderChunk> {
  const resolvedKey = input.api_key ?? process.env[PROVIDER_ENV_VAR.anthropic];
  if (!resolvedKey) {
    yield {
      type: 'error',
      message: `未配置 ${PROVIDER_LABEL.anthropic} API Key。请在设置 → API 密钥 (BYOK) 中填入 sk-ant-... 密钥。`,
      code: 'NO_API_KEY',
      provider: 'anthropic',
    };
    return;
  }

  const model = input.model ?? process.env.SHADOWFLOW_DEFAULT_MODEL ?? DEFAULT_MODELS.anthropic;
  const max_tokens = input.max_tokens ?? 8192;

  const client = new Anthropic({ apiKey: resolvedKey });

  let stream: ReturnType<Anthropic['messages']['stream']>;
  try {
    stream = client.messages.stream({
      model,
      max_tokens,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userMessage }],
    });
  } catch (err) {
    yield {
      type: 'error',
      message: `Anthropic 流初始化失败: ${(err as Error).message ?? String(err)}`,
      code: classifyAnthropicError(err),
      provider: 'anthropic',
    };
    return;
  }

  if (input.signal) {
    if (input.signal.aborted) {
      try {
        stream.abort();
      } catch {
        /* ignore */
      }
      return;
    }
    input.signal.addEventListener(
      'abort',
      () => {
        try {
          stream.abort();
        } catch {
          /* ignore */
        }
      },
      { once: true },
    );
  }

  try {
    for await (const event of stream) {
      if (input.signal?.aborted) return;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text-delta', text: event.delta.text };
      }
    }
    yield { type: 'end' };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (input.signal?.aborted || /aborted|AbortError/i.test(msg)) {
      // Silent return on abort — no error event.
      return;
    }
    yield {
      type: 'error',
      message: `Anthropic 流出错: ${msg}`,
      code: classifyAnthropicError(err),
      provider: 'anthropic',
    };
  }
}

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  defaultModel: DEFAULT_MODELS.anthropic,
  streamCompletion,
};
