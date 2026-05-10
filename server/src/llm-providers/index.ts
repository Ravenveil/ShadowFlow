/**
 * llm-providers/index.ts — Provider dispatch (Story 15.18)
 *
 * Single entry point: `callProvider(providerId, input)` returns the same
 * `AsyncGenerator<ProviderChunk>` shape regardless of provider. Unknown
 * provider ids surface as a `PROVIDER_ERROR` chunk (NEVER throws) so callers
 * can stay symmetric.
 */

import { anthropicProvider } from './anthropic';
import { openaiProvider } from './openai';
import { deepseekProvider } from './deepseek';
import { zhipuProvider } from './zhipu';
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
  isProviderId,
} from './types';

const PROVIDERS: Record<ProviderId, LLMProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  deepseek: deepseekProvider,
  zhipu: zhipuProvider,
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
