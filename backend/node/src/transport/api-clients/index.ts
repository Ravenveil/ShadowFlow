/**
 * transport/api-clients/index.ts — Compat shim (Phase 2 consolidation).
 *
 * Phase 2 collapsed the duplicate provider abstractions:
 *   - Track A (formerly here): `LLMProvider` + `callProvider()` simple
 *     AsyncGenerator<ProviderChunk> (single-turn, no tool_use)
 *   - Track B (formerly under `lib/api-clients/`): `ApiClient` + `stream()`
 *     AssistantEvent (multi-turn, tool_use, usage accounting)
 * into a single home at `transport/api-clients/`. ApiClient is the canonical
 * contract; `callProvider()` is preserved here as a thin adapter over
 * `ApiClient.stream({ tools: [] })` so legacy single-turn callers
 * (routes/llm.ts, transport/spawners/anthropic.ts) keep working unchanged.
 *
 * Long-term: those callers should migrate to `new XxxApiClient(...).stream(...)`
 * directly, or move through `ApiClientCallable` → `LlmCallable.turn()`. This
 * file's `callProvider` is a transition shim, not a forever API.
 *
 * Re-exports the data tables (DEFAULT_MODELS, PROVIDER_ENV_VAR, etc.) from
 * `./types` verbatim — those constants are still the single source of truth
 * for the 13 provider catalog.
 */

import { AnthropicApiClient } from './anthropic-api-client';
import { GoogleApiClient } from './google-api-client';
import { OpenAiCompatApiClient } from './openai-compat-api-client';
import { resolveProviderBaseUrl } from '../providerBaseUrl';
import {
  PROVIDER_ENV_VAR,
  PROVIDERS_NO_KEY,
  isProviderId,
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

// OpenAI 兼容族（全部经 OpenAiCompatApiClient）：内置 11 家
// （openai/deepseek/zhipu/qwen/moonshot/mistral/groq/openrouter/ollama/
// lmstudio）+ azure + 带 baseURL 的 custom-* 自定义 provider。2026-11-07 起
// 不再维护显式白名单集合——非 anthropic/google 的一律走 OpenAI 兼容构造
// （这也顺带修掉了 mimo 此前不在集合里、被误判 "Unsupported provider" 的断点）。

/**
 * Single-turn streaming entry — adapts ApiClient.stream() into the simple
 * AsyncGenerator<ProviderChunk> shape that older callers expect. Used by:
 *   - routes/llm.ts (proxy/back-compat endpoint)
 *   - transport/spawners/anthropic.ts (default-executor SSE runner)
 *
 * Behavior contract preserved from the original Track A `callProvider`:
 *   - Unknown provider id              → yield single 'error' chunk, return
 *   - text deltas                      → yield { type: 'text-delta', text }
 *   - normal end                       → yield { type: 'end' }
 *   - any throw from ApiClient.stream  → yield { type: 'error', ... }, return
 *
 * Tool-use / usage / message_stop AssistantEvents are intentionally dropped
 * — single-turn callers don't consume them.
 */
export async function* callProvider(
  providerId: string,
  input: ProviderInput,
): AsyncGenerator<ProviderChunk> {
  // 2026-11-07 模型链路断点全清：settings/byok 的自定义 baseUrl 在此兜底
  // （显式 input.base_url > settings 配置 > client 内置默认），与 byok:*
  // 执行器的 dispatcher 同口径。此前本 shim 不认 settings，用户在设置页配了
  // 自定义网关/本地端点，chat / spawner 链路上仍打默认公网地址。
  const baseURL = input.base_url ?? resolveProviderBaseUrl(providerId);

  // 未知 provider（custom-* 等 settings 注册的自定义 id）：只要能解析出
  // baseURL 就按 OpenAI 兼容端点走（fallback 见下）；否则保留大声报错契约。
  if (!isProviderId(providerId) && !baseURL) {
    yield {
      type: 'error',
      message: `Unknown provider: "${providerId}"`,
      code: 'PROVIDER_ERROR',
    };
    return;
  }

  // Missing-key gate — restores the documented taxonomy (types.ts): emit
  // `NO_API_KEY` when input.api_key + env are both empty. The ApiClient
  // adapters throw plain Errors on missing keys (their own tested policy),
  // which this shim would otherwise collapse into generic PROVIDER_ERROR;
  // routes/llm.ts maps NO_API_KEY → 401 via errorCodeToStatus.
  // Keyed providers only — ollama/lmstudio don't need keys.
  if (!(PROVIDERS_NO_KEY as ReadonlySet<string>).has(providerId)) {
    // 类型擦除同 byokKey.ts：providerId 允许 byok:*/custom-* 泛化 string，
    // PROVIDER_ENV_VAR 只覆盖内置 13 家（byok:* 无 env 名，envVar=undefined 即可）。
    const envVar = (PROVIDER_ENV_VAR as Record<string, string | undefined>)[providerId];
    const envKey = envVar ? process.env[envVar] : undefined;
    const hasKey =
      (typeof input.api_key === 'string' && input.api_key.length > 0) ||
      (typeof envKey === 'string' && envKey.length > 0);
    if (!hasKey) {
      yield {
        type: 'error',
        message: `${providerId} API key not configured`,
        code: 'NO_API_KEY',
        provider: providerId,
      };
      return;
    }
  }

  const apiKey = input.api_key;
  const model = input.model;
  const max_tokens = input.max_tokens;
  const temperature = input.temperature;
  const signal = input.signal ?? new AbortController().signal;

  let client;
  try {
    if (providerId === 'anthropic') {
      client = new AnthropicApiClient({ apiKey, baseURL, model, max_tokens, temperature });
    } else if (providerId === 'google') {
      client = new GoogleApiClient({ apiKey, baseURL, model, max_tokens, temperature });
    } else {
      // OpenAI 兼容族：内置 11 家 + azure + 带 baseURL 的 custom-* 自定义
      // provider（2026-11-07）。baseURL 缺省时 client 回退内置默认地址。
      client = new OpenAiCompatApiClient({
        providerId,
        apiKey,
        model,
        max_tokens,
        temperature,
        ...(baseURL && baseURL.length > 0 ? { baseURL } : {}),
      });
    }
  } catch (err) {
    yield {
      type: 'error',
      message: (err as Error).message ?? String(err),
      code: 'PROVIDER_ERROR',
      provider: providerId,
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
      if (ev.kind === 'text_delta') {
        yield { type: 'text-delta', text: ev.text };
      }
      // tool_use / usage / message_stop events are not surfaced on this
      // single-turn back-compat path because callers (routes/llm.ts,
      // transport/spawners/anthropic.ts) only consume text. Round 4 PR-D
      // ConversationRuntime callers should NOT use `callProvider`; they
      // construct an ApiClient directly and observe the full AssistantEvent
      // stream — see `assembler.ts` Branch 2 + `workflow/executor.ts`
      // `buildRuntimeStream` for the wiring.
    }
    yield { type: 'end' };
  } catch (err) {
    if (signal.aborted) return;
    yield {
      type: 'error',
      message: (err as Error).message ?? String(err),
      code: 'PROVIDER_ERROR',
      provider: providerId,
    };
  }
}
