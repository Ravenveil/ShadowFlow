/**
 * ApiClientCallable.ts — `LlmCallable` adapter for the 15 in-process
 * `ApiClient` implementations under `lib/api-clients/`.
 *
 * Phase 2 decision A6 (O1): every Transport backend exposes a uniform
 * `turn(input): AsyncGenerator<TurnChunk>` interface. This file is the
 * adapter from that interface to the existing `ApiClient.stream(args):
 * AsyncIterable<AssistantEvent>` shape that `ConversationRuntime` already
 * speaks. The factory matches `assembler.ts:487-541` `buildApiClient` so
 * routing semantics stay identical — Lane 2 deliberately mirrors that
 * function instead of re-importing it, both to avoid coupling the transport
 * layer to assembler internals and so this file can compile in isolation
 * (Lane 3 will eventually delete the assembler copy).
 *
 * Translation contract (AssistantEvent → TurnChunk):
 *   text_delta(text)            → { type: 'text-delta', value }
 *   tool_use(id, name, input)   → { type: 'tool-use', tool: {tool_name, tool_input, call_id} }
 *   usage(usage)                → { type: 'usage', usage: {input_tokens, output_tokens, ...} }
 *   message_stop(stop_reason)   → { type: 'done' }
 *
 * Error model (CL3):
 *   - apiKey resolution failure → throw `LlmCallError('auth')` BEFORE first yield
 *   - unknown provider id       → throw `LlmCallError('provider-error')` BEFORE first yield
 *   - stream-mid throw          → yield `{type: 'error', error}` then return
 *
 * Cancellation (C1): `input.signal` is forwarded verbatim to the underlying
 * `ApiClient.stream({signal})`. The 15 ApiClient implementations are each
 * responsible for honouring it (SDK abort / fetch abort / subprocess SIGTERM
 * for the CLI variants).
 */

import type { ApiClient } from '../lib/conversation-runtime';
import type { ConversationMessage } from '../lib/conversation-types';
import { AnthropicApiClient } from './api-clients/anthropic-api-client';
import { OpenAiCompatApiClient } from './api-clients/openai-compat-api-client';
import { GoogleApiClient } from './api-clients/google-api-client';
import { ClaudeCodeCliApiClient } from './api-clients/claude-code-cli-api-client';
import { CodexCliApiClient } from './api-clients/codex-cli-api-client';
import type {
  LlmCallable,
  LlmCallableCapabilities,
  LlmCallableTurnInput,
  LlmImageContent,
} from './LlmCallable';
import { LlmCallError, type TurnChunk } from '../workflow/types';

/**
 * Provider ids the 13 ApiClient instances cover. Mirror of
 * `assembler.ts:487-541` plus the two CLI-backed clients (S14.2). Keep this
 * set in lockstep with `buildApiClient`; when a 14th provider is added it
 * should appear in both places.
 *
 * 2026-11-07 模型链路断点全清：补入 azure。此前 azure 故意缺席（担心请求体
 * 泄漏到默认公网地址），但 PROVIDER_IDS 含 azure → run-sessions 接受后炸在
 * resolve 阶段，是条"半开的死路"。现在 azure 经 OpenAiCompatApiClient 走
 * 显式部署地址（无 baseURL 时 client.resolveBaseURL() 照旧大声抛错）。
 */
const OPENAI_COMPAT_PROVIDERS = new Set([
  'openai',
  'deepseek',
  'zhipu',
  'mimo',
  'qwen',
  'moonshot',
  'mistral',
  'groq',
  'openrouter',
  'ollama',
  'lmstudio',
  'azure',
]);

export interface ApiClientCallableOptions {
  /** BYOK key. Optional for ollama / lmstudio; otherwise required at turn time. */
  apiKey?: string;
  /**
   * BYOK 自定义 API 地址（2026-11-07 Day1 打通修复）。目前透传给
   * OpenAI-compat 系 client 的 `baseURL`；未配置时回退各 provider 内置
   * 默认地址。此前该字段缺失，settings/byok 里配的自定义网关/本地端点
   * 在 run-session 管线上被静默忽略，请求打到默认公网地址后超时。
   */
  baseUrl?: string;
  /** Model pin; falls back to provider's default via DEFAULT_MODELS. */
  model?: string;
  /** Per-turn output cap; falls back to each ApiClient's internal 8192 default. */
  maxTokens?: number;
  /** 0..1 temperature; omitted from request when undefined. */
  temperature?: number;
}

function buildApiClient(
  provider: string,
  opts: ApiClientCallableOptions,
): ApiClient | null {
  const { apiKey, baseUrl, model, maxTokens: max_tokens, temperature } = opts;
  if (provider === 'anthropic') {
    // 2026-11-07：baseURL 透传（Anthropic SDK 自拼 /v1/messages，传主机根）。
    return new AnthropicApiClient({ apiKey, baseURL: baseUrl, model, max_tokens, temperature });
  }
  if (provider === 'google') {
    // 2026-11-07：baseURL 透传（Gemini SDK 自拼 /{apiVersion}/…，传主机根）。
    return new GoogleApiClient({ apiKey, baseURL: baseUrl, model, max_tokens, temperature });
  }
  if (provider === 'claude-code-cli') {
    return new ClaudeCodeCliApiClient({ apiKey, model, max_tokens });
  }
  if (provider === 'codex-cli') {
    return new CodexCliApiClient({ apiKey, model, max_tokens });
  }
  if (OPENAI_COMPAT_PROVIDERS.has(provider)) {
    return new OpenAiCompatApiClient({
      providerId: provider,
      apiKey,
      ...(baseUrl && baseUrl.length > 0 ? { baseURL: baseUrl } : {}),
      model,
      max_tokens,
      temperature,
    });
  }
  // 2026-11-07：settings/byok 注册的自定义 provider（custom-* 等）——只要有
  // 显式/配置的 baseUrl 就按 OpenAI 兼容端点构造（dispatcher 已从 settings
  // 兜底解析 baseUrl）。无 baseUrl 的未知 id 维持 null → 下面大声抛错。
  if (baseUrl && baseUrl.length > 0) {
    return new OpenAiCompatApiClient({
      providerId: provider,
      apiKey,
      baseURL: baseUrl,
      model,
      max_tokens,
      temperature,
    });
  }
  return null;
}

/**
 * 合成单轮 user 消息（纯函数，2026-11-08 视觉注入）：prompt 文本块在前，
 * 随行图片（base64）以 `image` 块附后。图片块**只活在本条瞬态消息里**——
 * 不写 history、不落会话存储（见 conversation-types image 变体注释）。
 * 无 images 时退化为单 text 块（旧行为零变化）。
 */
export function buildUserTurnMessage(
  prompt: string,
  images?: LlmImageContent[],
): ConversationMessage {
  const blocks: ConversationMessage['blocks'] = [{ kind: 'text', text: prompt }];
  for (const img of images ?? []) {
    if (!img?.data) continue;
    blocks.push({ kind: 'image', media_type: img.media_type, data: img.data });
  }
  return { role: 'user', blocks };
}

/**
 * In-process ApiClient → LlmCallable adapter. One instance binds one
 * provider id + credentials/model pinning; reusable across turns.
 */
export class ApiClientCallable implements LlmCallable {
  readonly id: string;
  readonly capabilities: LlmCallableCapabilities = {
    // All 15 ApiClient impls accept `tools` in stream() — even the OpenAI-compat
    // adapter translates Anthropic-shape ToolSpec into OpenAI tools. Tool support
    // is uniformly true at the Transport contract; whether the user-facing model
    // actually emits tool_use is the model's choice.
    supportsToolUse: true,
    supportsMultiTurn: true,
    supportsStreamingDelta: true,
  };

  private readonly client: ApiClient;

  constructor(
    private readonly provider: string,
    opts: ApiClientCallableOptions,
  ) {
    this.id = provider === 'anthropic' ? 'anthropic-direct' : `byok:${provider}`;
    const client = buildApiClient(provider, opts);
    if (!client) {
      throw new LlmCallError(
        'provider-error',
        `ApiClientCallable: unknown provider "${provider}". Expected one of: ` +
          `anthropic, google, claude-code-cli, codex-cli, ${[...OPENAI_COMPAT_PROVIDERS].join(', ')}` +
          ` — 或一个 settings/byok 里配置了 API 地址的自定义 provider（custom-* 需先配 baseUrl）`,
      );
    }
    this.client = client;
  }

  /**
   * Accessor for the wrapped `ApiClient`. Round 4 PR-D Lane 1 needs this so
   * the assembler / workflow executor can route tool-use scenarios through
   * `ConversationRuntime` (which speaks the `ApiClient.stream(...)` shape
   * directly) instead of the single-turn `turn()` adapter above.
   *
   * Returns the same instance each call — safe to use across multiple
   * `ConversationRuntime` constructions; the underlying SDK clients are
   * stateless per-request.
   */
  getApiClient(): ApiClient {
    return this.client;
  }

  async *turn(input: LlmCallableTurnInput): AsyncGenerator<TurnChunk> {
    // Synthesise a single-user-message conversation. The Phase 2 contract is
    // "one turn = one stream call"; multi-turn history is the orchestrator's
    // job. We forward `input.history` verbatim so any callable that DOES want
    // a rolling history (non-team / single-skill flows) still gets it.
    // 2026-11-08 视觉注入 — 随行图片（is_image 附件真实字节）以 image 块附进
    // 本条瞬态 user 消息；OpenAI-compat 译成 image_url data URI、Anthropic 译
    // 成 image.source，其余 client 按未知块跳过（text-only）。
    const messages = [
      ...input.history,
      buildUserTurnMessage(input.prompt, input.images),
    ];

    let stream: AsyncIterable<unknown>;
    try {
      stream = this.client.stream({
        system_prompt: input.system,
        messages,
        tools:
          input.tools?.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as object,
            // Transport-layer-injected tools count as "base" (always present)
            // in the runtime's tool registry. Conditional tools are an
            // orchestration concept and would be filtered upstream.
            source: 'base' as const,
          })) ?? [],
        signal: input.signal,
      });
    } catch (err) {
      // Synchronous construction failure (e.g. AnthropicApiClient missing key
      // throws before the first yield). Convert to typed throw per CL3.
      throw mapToCallError(err);
    }

    try {
      for await (const ev of stream) {
        if (input.signal.aborted) return;
        const chunk = assistantEventToChunk(ev);
        if (chunk) yield chunk;
      }
    } catch (err) {
      // Stream-mid throw — surface as error chunk and return per CL3 / E3.
      const wrapped = mapToCallError(err);
      const chunk: TurnChunk = { type: 'error', error: wrapped };
      yield chunk;
    }
  }
}

/**
 * Map an AssistantEvent (untyped here to avoid leaking the runtime's enum
 * shape into the transport public surface) to a TurnChunk. Returns `null`
 * when the event is not part of the public TurnChunk taxonomy (defensive,
 * but in practice the 4 kinds below cover everything ApiClient emits).
 */
export function assistantEventToChunk(ev: unknown): TurnChunk | null {
  if (!ev || typeof ev !== 'object') return null;
  const e = ev as { kind?: string };
  switch (e.kind) {
    case 'text_delta': {
      const text = (e as { text?: unknown }).text;
      return typeof text === 'string'
        ? { type: 'text-delta', value: text }
        : null;
    }
    case 'thinking_delta': {
      // Gap-close (2026-05-31): without this case, extended-thinking on the
      // no-tools API path (`callable.turn()`, executor.ts:186 else-branch) was
      // silently dropped — only the with-tools ConversationRuntime path
      // surfaced it. Map it to the typed thinking-delta channel so thinking is
      // structured on EVERY path (Law 2: text/thinking/tool are independent).
      const text = (e as { text?: unknown }).text;
      return typeof text === 'string'
        ? { type: 'thinking-delta', value: text }
        : null;
    }
    case 'tool_use': {
      const x = e as { id?: string; name?: string; input?: unknown };
      return {
        type: 'tool-use',
        tool: {
          tool_name: x.name ?? '',
          tool_input: x.input,
          call_id: x.id,
        },
      };
    }
    case 'usage': {
      const u = (e as { usage?: Record<string, unknown> }).usage ?? {};
      const usage = u as {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      return {
        type: 'usage',
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
        },
      };
    }
    case 'message_stop':
      return { type: 'done' };
    default:
      return null;
  }
}

/**
 * Classify an unknown thrown value into one of `LlmCallErrorKind`. Keeps the
 * heuristic conservative — anything we can't recognise becomes
 * `provider-error` so the front-end still gets a readable message.
 */
function mapToCallError(err: unknown): LlmCallError {
  if (err instanceof LlmCallError) return err;
  const e = err as { message?: string; status?: number; name?: string };
  const msg = e?.message ?? String(err);
  if (e?.name === 'AbortError') {
    return new LlmCallError('timeout', msg, { cause: err });
  }
  if (e?.status === 429 || /rate.?limit/i.test(msg)) {
    return new LlmCallError('rate-limit', msg, { cause: err });
  }
  if (e?.status === 401 || e?.status === 403 || /api.?key|auth/i.test(msg)) {
    return new LlmCallError('auth', msg, { cause: err });
  }
  if (/context.?length|too.?many.?tokens/i.test(msg)) {
    return new LlmCallError('context-length', msg, { cause: err });
  }
  if (/network|ENOTFOUND|ECONN|fetch failed/i.test(msg)) {
    return new LlmCallError('network', msg, { cause: err });
  }
  return new LlmCallError('provider-error', msg, { cause: err });
}
