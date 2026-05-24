/**
 * transport/api-clients/index.ts — Provider dispatch (Phase 2 consolidation,
 * commit 1 of 3 — interim shim).
 *
 * Phase 2 collapsed the duplicate provider abstractions: the simple
 * single-turn `LLMProvider` (Track A) and the multi-turn `ApiClient` (Track B,
 * formerly under `lib/api-clients/`). This commit moves Track B in and
 * routes anthropic + google through the new in-tree ApiClient classes; the
 * OpenAI-compat family still goes through the legacy `openai-compat-instances`
 * factory and is replaced by `OpenAiCompatApiClient` in commit 2.
 *
 * Public surface is unchanged: `callProvider`, `getProvider`, plus the
 * provider catalog tables from `./types`. Callers (routes/llm.ts,
 * routes/run-sessions.ts, transport/spawners/anthropic.ts) need no edits.
 */

import {
  azureProviderInstance,
  deepseekProviderInstance,
  groqProviderInstance,
  lmstudioProviderInstance,
  mistralProviderInstance,
  moonshotProviderInstance,
  ollamaProviderInstance,
  openaiProviderInstance,
  openrouterProviderInstance,
  qwenProviderInstance,
  zhipuProviderInstance,
} from './openai-compat-instances';
import { AnthropicApiClient } from './anthropic-api-client';
import { GoogleApiClient } from './google-api-client';
import {
  isProviderId,
  type LLMProvider,
  type ProviderChunk,
  type ProviderId,
  type ProviderInput,
} from './types';

export type {
  LLMProvider,
  ProviderChunk,
  ProviderErrorCode,
  ProviderId,
  ProviderInput,
} from './types';
export {
  DEFAULT_MODELS,
  PROVIDER_ENV_VAR,
  PROVIDER_IDS,
  PROVIDER_LABEL,
  PROVIDERS_NO_KEY,
  isProviderId,
} from './types';

/**
 * Adapter — wraps an ApiClient class as an LLMProvider so the existing
 * `streamCompletion(ProviderInput)` dispatch pattern keeps working. Only
 * `text_delta` AssistantEvents are forwarded; tool_use / usage / message_stop
 * are dropped (single-turn back-compat path has no consumer for them).
 */
type ApiClientLike = {
  stream(args: {
    system_prompt: string;
    messages: Array<{ role: 'user'; blocks: Array<{ kind: 'text'; text: string }> }>;
    tools: never[];
    signal: AbortSignal;
  }): AsyncIterable<{ kind: string; text?: string }>;
};

function adapt(id: ProviderId, build: (input: ProviderInput) => ApiClientLike): LLMProvider {
  return {
    id,
    defaultModel: '', // unused on this path; ApiClient reads its own DEFAULT_MODELS fallback
    async *streamCompletion(input: ProviderInput): AsyncGenerator<ProviderChunk> {
      const signal = input.signal ?? new AbortController().signal;
      let client: ApiClientLike;
      try {
        client = build(input);
      } catch (err) {
        yield {
          type: 'error',
          message: (err as Error).message ?? String(err),
          code: 'PROVIDER_ERROR',
          provider: id,
        };
        return;
      }
      try {
        const stream = client.stream({
          system_prompt: input.systemPrompt,
          messages: [
            { role: 'user', blocks: [{ kind: 'text', text: input.userMessage }] },
          ],
          tools: [],
          signal,
        });
        for await (const ev of stream) {
          if (signal.aborted) return;
          if (ev.kind === 'text_delta' && typeof ev.text === 'string') {
            yield { type: 'text-delta', text: ev.text };
          }
        }
        yield { type: 'end' };
      } catch (err) {
        if (signal.aborted) return;
        yield {
          type: 'error',
          message: (err as Error).message ?? String(err),
          code: 'PROVIDER_ERROR',
          provider: id,
        };
      }
    },
  };
}

const anthropicProvider: LLMProvider = adapt('anthropic', (input) =>
  new AnthropicApiClient({
    apiKey: input.api_key,
    model: input.model,
    max_tokens: input.max_tokens,
    temperature: input.temperature,
  }),
);

const googleProvider: LLMProvider = adapt('google', (input) =>
  new GoogleApiClient({
    apiKey: input.api_key,
    model: input.model,
    max_tokens: input.max_tokens,
    temperature: input.temperature,
  }),
);

const PROVIDERS: Record<ProviderId, LLMProvider> = {
  anthropic:  anthropicProvider,
  openai:     openaiProviderInstance,
  deepseek:   deepseekProviderInstance,
  zhipu:      zhipuProviderInstance,
  google:     googleProvider,
  qwen:       qwenProviderInstance,
  moonshot:   moonshotProviderInstance,
  mistral:    mistralProviderInstance,
  groq:       groqProviderInstance,
  openrouter: openrouterProviderInstance,
  ollama:     ollamaProviderInstance,
  lmstudio:   lmstudioProviderInstance,
  azure:      azureProviderInstance,
};

export function getProvider(id: ProviderId): LLMProvider {
  return PROVIDERS[id];
}

/**
 * Dispatch to the named provider's `streamCompletion`. Behavior preserved
 * from the original Track A implementation: unknown id → single error chunk
 * + return; otherwise delegate to the provider's stream.
 */
export async function* callProvider(
  providerId: string,
  input: ProviderInput,
): AsyncGenerator<ProviderChunk> {
  if (!isProviderId(providerId)) {
    yield {
      type: 'error',
      message: `Unknown provider: "${providerId}"`,
      code: 'PROVIDER_ERROR',
    };
    return;
  }
  yield* PROVIDERS[providerId].streamCompletion(input);
}
