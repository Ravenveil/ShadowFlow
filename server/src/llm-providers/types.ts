/**
 * llm-providers/types.ts — Shared Provider abstraction (Story 15.18)
 *
 * Story 15.18 introduces multi-provider BYOK (Anthropic / OpenAI / DeepSeek /
 * Zhipu). Every provider implements the same `streamCompletion` async generator
 * shape so callers (`skill-runners/anthropic.ts` wrapper) stay provider-agnostic.
 *
 * IMPORTANT — error contract:
 *   Providers NEVER throw inside `streamCompletion`. All errors must be yielded
 *   as `{ type: 'error', message, code }` chunks; the generator then `return`s.
 *   This keeps the dispatcher / runner code symmetric across all 4 providers.
 */

/** All supported provider identifiers. */
export type ProviderId = 'anthropic' | 'openai' | 'deepseek' | 'zhipu';

/** Inputs every provider accepts. */
export interface ProviderInput {
  /** Final composed system prompt. */
  systemPrompt: string;
  /** User goal (single-turn user message). */
  userMessage: string;
  /** Provider-specific model id. Falls back to provider's defaultModel. */
  model?: string;
  /** Generation cap; provider may interpret slightly differently. */
  max_tokens?: number;
  /** 0..1 sampling temperature; omitted when undefined. */
  temperature?: number;
  /** BYOK key passed in by route handler. */
  api_key?: string;
  /** AbortSignal — provider must wire to its underlying SDK / fetch. */
  signal?: AbortSignal;
}

/**
 * Cross-provider error taxonomy. Front-end can map these to localized user
 * messages without caring which provider emitted them.
 *   NO_API_KEY        — input.api_key + env both empty
 *   AUTH_FAILED       — provider returned 401 / invalid_api_key
 *   RATE_LIMITED      — provider returned 429
 *   MODEL_NOT_FOUND   — provider returned 404 / model_not_found
 *   NETWORK_ERROR     — fetch failed / DNS / timeout
 *   PROVIDER_ERROR    — generic catch-all
 */
export type ProviderErrorCode =
  | 'NO_API_KEY'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR';

/** Streaming chunk yielded by every provider. */
export type ProviderChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'end' }
  | {
      type: 'error';
      message: string;
      code?: ProviderErrorCode;
      /** Provider id that emitted the error (used for prefix). */
      provider?: ProviderId;
    };

/** Per-provider implementation. */
export interface LLMProvider {
  id: ProviderId;
  defaultModel: string;
  /**
   * Stream a chat completion from this provider. Implementation contract:
   *   - For each text delta: `yield { type: 'text-delta', text }`
   *   - On normal end: `yield { type: 'end' }` then return
   *   - On error (incl. NO_API_KEY): `yield { type: 'error', ... }` then return
   *   - On signal.aborted: silently return without yielding error
   */
  streamCompletion(input: ProviderInput): AsyncGenerator<ProviderChunk>;
}

/** Per-provider default model fallback table (Story 15.18 spec). */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  zhipu: 'glm-4-plus',
};

/** localStorage / env var name for each provider's BYOK key. */
export const PROVIDER_ENV_VAR: Record<ProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
};

/** Display name for error messages. */
export const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  zhipu: 'Zhipu',
};

/** All provider ids — useful for validation. */
export const PROVIDER_IDS: ReadonlyArray<ProviderId> = [
  'anthropic',
  'openai',
  'deepseek',
  'zhipu',
];

export function isProviderId(s: unknown): s is ProviderId {
  return typeof s === 'string' && (PROVIDER_IDS as ReadonlyArray<string>).includes(s);
}
