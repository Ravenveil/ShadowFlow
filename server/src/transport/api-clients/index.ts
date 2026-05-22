/**
 * llm-providers/index.ts — Provider dispatch (Story 15.18)
 *
 * Single entry point: `callProvider(providerId, input)` returns the same
 * `AsyncGenerator<ProviderChunk>` shape regardless of provider. Unknown
 * provider ids surface as a `PROVIDER_ERROR` chunk (NEVER throws) so callers
 * can stay symmetric.
 *
 * 2026-05-16: expanded from 4 → 12 providers (anthropic + openai-compat
 * factory generating 10 OpenAI-shape providers + google stub).
 */

import { anthropicProvider } from './anthropic';
import { googleProvider } from './google';
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
 * Dispatch to the named provider's `streamCompletion`. If the id is unknown
 * (or coerced through `as ProviderId`), yields a single `PROVIDER_ERROR`
 * chunk and returns — callers don't need a try/catch for the dispatch.
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
