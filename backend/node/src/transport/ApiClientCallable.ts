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

import type { ApiClient, AssistantEvent } from '../lib/conversation-runtime';
import type { TokenUsage } from '../lib/conversation-types';
import { AnthropicApiClient } from './api-clients/anthropic-api-client';
import { OpenAiCompatApiClient } from './api-clients/openai-compat-api-client';
import { GoogleApiClient } from './api-clients/google-api-client';
import { ClaudeCodeCliApiClient } from './api-clients/claude-code-cli-api-client';
import { CodexCliApiClient } from './api-clients/codex-cli-api-client';
import { DEFAULT_MODELS, type ProviderId } from './api-clients/types';
import type {
  LlmCallable,
  LlmCallableCapabilities,
  LlmCallableTurnInput,
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
 * BE-07（2026-11-08）— 两个字段逐取已定义值的最大值合并。适用于本仓全部
 * ApiClient 实现的 usage 事件语义：
 *   - anthropic：message_start 报 input、message_delta 报 output——互补部分块；
 *   - claude-code-cli：stream_event 部分块 + result 尾部完整汇总块；
 *   - openai-compat / google / codex：单条完整块。
 * 「部分块求和」会把 claude-cli 双计，「取末块」会把 anthropic 的 output-only
 * 尾块当全量——逐字段 max 对三类语义都给出正确整次调用总量（计量在一次
 * stream() 内单调不减：部分块 ≤ 汇总块）。
 */
export function foldUsageEvents(a: TokenUsage | undefined, b: TokenUsage): TokenUsage {
  if (!a) return { ...b };
  const out: TokenUsage = { ...a };
  for (const key of [
    'input_tokens',
    'output_tokens',
    'cache_read_input_tokens',
    'cache_creation_input_tokens',
    'cost_usd',
    'duration_ms',
    'ttft_ms',
  ] as const) {
    const av = a[key];
    const bv = b[key];
    if (typeof bv === 'number') {
      out[key] = typeof av === 'number' ? Math.max(av, bv) : bv;
    }
  }
  return out;
}

/**
 * BE-07 — usage 计量归一层。一次 stream() = 一次模型调用：吞掉客户端的
 * 部分 usage 块，在流自然收尾（或中游抛错）时补发**一条**折叠后的完整
 * usage 事件（带 model / duration_ms 归因），使下游（executor 落 token_usage
 * 流水、ConversationRuntime 逐轮汇总）拿到「每调用一整块」的统一契约。
 *
 * 已知取舍：消费者中途 break（abort 放弃消费）时折叠块无法补发——被取消的
 * 调用不入账。中游抛错路径先补发用量再原样重抛，消费方仍按 CL3 收 error。
 */
export class UsageFoldingApiClient implements ApiClient {
  constructor(
    /** 被包装的真实客户端（decorator 暴露被装饰者，诊断/测试可读底层 opts）。 */
    readonly inner: ApiClient,
    /** 计量归属模型（该 stream 的请求模型；事件自带 model 时以事件为准）。 */
    private readonly billingModel: string,
  ) {}

  async *stream(args: Parameters<ApiClient['stream']>[0]): AsyncIterable<AssistantEvent> {
    const startedAt = Date.now();
    let folded: TokenUsage | undefined;
    try {
      for await (const ev of this.inner.stream(args)) {
        if (ev.kind === 'usage') {
          folded = foldUsageEvents(folded, ev.usage);
          continue;
        }
        yield ev;
      }
    } catch (err) {
      if (folded) yield this.seal(folded, startedAt);
      throw err;
    }
    if (folded) yield this.seal(folded, startedAt);
  }

  private seal(folded: TokenUsage, startedAt: number): AssistantEvent {
    return {
      kind: 'usage',
      usage: {
        ...folded,
        model: folded.model ?? (this.billingModel || undefined),
        duration_ms: folded.duration_ms ?? Date.now() - startedAt,
      },
    };
  }
}

/**
 * 计量归属模型解析——镜像各客户端 stream() 内部的实际兜底链，best-effort：
 *   - anthropic / google：pin > SHADOWFLOW_DEFAULT_MODEL > DEFAULT_MODELS；
 *   - openai-compat 系（含 custom-*）：pin > DEFAULT_MODELS[id]（不读 env）；
 *   - cli 系：pin（CLI 进程自选模型，无法在传输层知悉，宁缺不错标）。
 * 与 /api/llm 老路径的「按请求 model 记账」口径一致；查不到单价表成本记 0
 * （宁可少算不虚报）。
 */
export function resolveBillingModel(provider: string, pinned?: string): string {
  if (pinned) return pinned;
  if (provider === 'anthropic' || provider === 'google') {
    return process.env.SHADOWFLOW_DEFAULT_MODEL ?? DEFAULT_MODELS[provider] ?? '';
  }
  if (provider === 'claude-code-cli' || provider === 'codex-cli') {
    return '';
  }
  return DEFAULT_MODELS[provider as ProviderId] ?? '';
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
    // BE-07 — 包 usage 计量归一层：turn() 与 getApiClient() 两条消费路径都
    // 拿到「每调用一整块」的 usage 事件（此前 anthropic 一次调用发两个部分块、
    // CLI 发部分+汇总混合块，落库口径无从下手）。
    this.client = new UsageFoldingApiClient(client, resolveBillingModel(provider, opts.model));
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
    const messages = [
      ...input.history,
      {
        role: 'user' as const,
        blocks: [{ kind: 'text' as const, text: input.prompt }],
      },
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
        model?: string;
        duration_ms?: number;
        cost_usd?: number;
      };
      return {
        type: 'usage',
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
          // BE-07 — 计量归因三件套透传（折叠层/CLI 实测值已放在这几个字段上）。
          model: usage.model,
          duration_ms: usage.duration_ms,
          cost_usd: usage.cost_usd,
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
