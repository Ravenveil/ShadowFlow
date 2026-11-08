/**
 * openai-compat-api-client.ts — ApiClient (S5) implementation backed by the
 * OpenAI Chat Completions protocol, covering 11+ OpenAI-compatible providers
 * (openai / deepseek / zhipu / qwen / moonshot / mistral / groq / openrouter /
 * ollama / lmstudio / azure).
 *
 * S14.1 (skill-team-conversion-design-v1.md §3.1.b §5 S5/S6) — companion to
 * AnthropicApiClient. With this in place, team-backed skills running on GLM
 * (zhipu), DeepSeek, OpenAI, Qwen, etc. get the same multi-turn / tool_use /
 * usage-accounting capabilities as Anthropic, instead of falling back to the
 * legacy single-call path.
 *
 * Why an OpenAI-compat shim instead of one client per provider:
 *   The /v1/chat/completions wire protocol (request body shape, SSE event
 *   shape, tool_calls delta accumulation, finish_reason semantics, usage in
 *   the trailing chunk) is identical across this provider family — only the
 *   baseURL, default model, and (for Azure) the auth header differ. Adding a
 *   new compatible provider is then a 4-line entry in PROVIDER_BASE_URLS,
 *   mirroring the existing `openai-compat-instances.ts` factory pattern.
 *
 * Protocol differences vs Anthropic (significant ones — affects translation):
 *   Concept          | Anthropic                          | OpenAI
 *   ─────────────────┼────────────────────────────────────┼─────────────────────
 *   tool_result      | role='user' + tool_result block    | role='tool' + tool_call_id
 *   tool call emit   | content_block_start type='tool_use'| choices[0].delta.tool_calls[i]
 *                    | + input_json_delta increments      | .function.arguments string deltas
 *   tool spec        | {name, description, input_schema}  | {type:'function', function:{...}}
 *   stop reason      | message_delta.delta.stop_reason    | choices[0].finish_reason
 *   usage timing     | message_start (input) +            | last chunk (one shot)
 *                    | message_delta (output)             |
 *   system prompt    | top-level `system` request field   | first messages[] entry, role='system'
 *
 * Tool_calls delta accumulation: OpenAI streams tool_calls as
 *   {index, id?, function: {name?, arguments?}} fragments that must be glued
 * by `index` (NOT by id — the id sometimes only appears on the first delta).
 * Each subsequent delta with the same index appends arguments (a JSON string
 * fragment) to that index's buffer. On finish_reason='tool_calls' we flush
 * the buffer and yield 'tool_use' AssistantEvents in index order.
 *
 * Anthropic ContentBlock → OpenAI message shape:
 *   role='user' + blocks=[text]                    → {role:'user', content:text}
 *   role='assistant' + blocks=[text, tool_use, ...] → {role:'assistant', content:text, tool_calls:[...]}
 *   role='tool' + blocks=[tool_result]             → {role:'tool', tool_call_id, content}
 *
 * stop_reason translation (OpenAI → our normalized string):
 *   'stop'           → 'end_turn'
 *   'tool_calls'     → 'tool_use'
 *   'length'         → 'max_tokens'
 *   'content_filter' → 'content_filter'
 *   'function_call'  → 'tool_use'  (legacy)
 *   anything else passes through verbatim.
 */

import OpenAI from 'openai';
import type {
  ApiClient,
  AssistantEvent,
} from '../../lib/conversation-runtime';
import type {
  ContentBlock,
  ConversationMessage,
  TokenUsage,
} from '../../lib/conversation-types';
import type { ToolSpec } from '../../lib/tool-spec';
import { DEFAULT_MODELS } from './types';
import { withDefaultLlmTimeout } from './llm-timeout';

/**
 * Provider id → default baseURL. Post Phase 2 consolidation this is now the
 * SINGLE source of truth for OpenAI-compatible base URLs (the legacy
 * `llm-providers/openai-compat-instances.ts` factory was deleted; that table
 * has been folded into this one).
 *
 * Note: these are SDK base URLs (no `/chat/completions` suffix). The OpenAI
 * SDK appends `/chat/completions` itself given a `baseURL` of e.g.
 * `https://api.deepseek.com/v1`.
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  // Zhipu has TWO billing surfaces: Coding Plan (subscription) vs pay-as-you-go
  // resource packs. Coding Plan covers glm-4.5/4.6/4.7/5.x family and is the
  // default for most users. Override via settings → BYOK → API 地址 if you're
  // on per-token billing only (paas/v4). 2026-05-24 default flipped to coding.
  zhipu: 'https://open.bigmodel.cn/api/coding/paas/v4',
  // 小米 MiMo — OpenAI Chat Completions 兼容；另有 Anthropic 兼容端点
  // https://api.xiaomimimo.com/anthropic（本 client 走 OpenAI 协议）。
  mimo: 'https://api.xiaomimimo.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  // azure 的部署级地址（…/openai/deployments/<name>?api-version=…）刻意不进
  // 这张表——Azure 没有"默认部署名"可言，必须由用户在 settings/byok 显式配
  // baseUrl（2026-11-07 起 buildApiClient 已把 azure 路由到本 client，query
  // 里的 api-version 会拆进 SDK defaultQuery）。无显式 baseURL 时
  // resolveBaseURL() 照旧抛错，请求体不会外泄。
};

/** Providers that allow an empty api_key (local runtimes). Mirror of
 * `llm-providers/types.ts` PROVIDERS_NO_KEY but local so this module stays
 * dependency-cycle-free. */
const PROVIDERS_NO_KEY = new Set(['ollama', 'lmstudio']);

export interface OpenAiCompatApiClientOptions {
  /** Provider id (zhipu / deepseek / qwen / openai / ...). Used to pick
   * baseURL + default model fallback. */
  providerId: string;
  /** Optional override of the default baseURL for this provider. */
  baseURL?: string;
  /** BYOK key. May be empty for ollama / lmstudio. */
  apiKey?: string;
  /** Model id (e.g. 'glm-4.5-flash'). Falls back to DEFAULT_MODELS[providerId]. */
  model?: string;
  /** Per-turn output cap. Falls back to 8192 to match anthropic-api-client.ts. */
  max_tokens?: number;
  /** 0..1 sampling temp; omitted from request when undefined. */
  temperature?: number;
}

// ─── ContentBlock → OpenAI message translation ────────────────────────────

/**
 * Anthropic-shape ToolSpec → OpenAI tool entry.
 * `parameters` is the same JSON Schema we already store in `input_schema`.
 */
function toOpenAiTool(t: ToolSpec): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  };
}

/**
 * One OpenAI wire message envelope. Mirrors the subset of
 * `OpenAI.Chat.Completions.ChatCompletionMessageParam` we actually emit; kept
 * local so this module has no SDK-internal type imports.
 */
type OpenAiTextPart = { type: 'text'; text: string };
/** 2026-11-08 视觉注入 — OpenAI-compat 多模态 content part（data URI 或 URL）。 */
type OpenAiImagePart = { type: 'image_url'; image_url: { url: string } };
type OpenAiUserPart = OpenAiTextPart | OpenAiImagePart;

type OpenAiMessage =
  | { role: 'system'; content: string }
  | {
      role: 'user';
      content: string | OpenAiUserPart[];
    }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

/**
 * Convert our internal ConversationMessage[] to OpenAI's messages[] shape.
 *
 *   - user with [text]            → {role:'user', content: text}
 *   - user with text + image      → {role:'user', content:[text part,
 *                                   image_url part(data:…;base64,…), …]}
 *     （2026-11-08 视觉注入：ContentBlock image 块 → image_url content part；
 *     无 image 块时维持纯 string content，旧行为零变化）
 *   - assistant with text +       → {role:'assistant', content: text,
 *     tool_use blocks                tool_calls: [...]}
 *   - tool with tool_result       → {role:'tool', tool_call_id, content: output}
 *
 * Important contrast with Anthropic (toAnthropicMessages):
 *   - We do NOT fold consecutive tool messages into user — OpenAI has a
 *     dedicated 'tool' role and accepts multiple tool messages in a row.
 *   - Assistant content can be null when the message is purely tool_calls.
 */
export function toOpenAiMessages(messages: ConversationMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      const text = m.blocks
        .map((b) => (b.kind === 'text' ? b.text : ''))
        .join('');
      out.push({ role: 'system', content: text });
    } else if (m.role === 'user') {
      const hasImage = m.blocks.some((b) => b.kind === 'image');
      if (!hasImage) {
        // 纯文本 user 消息维持 string content（零回归）。
        const text = m.blocks
          .map((b) => (b.kind === 'text' ? b.text : ''))
          .join('');
        out.push({ role: 'user', content: text });
      } else {
        // 含 image 块 → content parts 数组（text part + image_url part）。
        const parts: OpenAiUserPart[] = [];
        for (const b of m.blocks) {
          if (b.kind === 'text') {
            if (b.text.length > 0) parts.push({ type: 'text', text: b.text });
          } else if (b.kind === 'image') {
            // 空字节的 image 块不发（防 data URI 残缺被 provider 400）。
            if (!b.data) continue;
            const mime = b.media_type || 'image/png';
            parts.push({
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${b.data}` },
            });
          }
          // tool_use / tool_result 不会出现在 user 消息；防御性跳过。
        }
        // 兜底：图片块全被过滤（data 空）→ 退化为 string content。
        out.push({
          role: 'user',
          content: parts.some((p) => p.type === 'image_url')
            ? parts
            : parts.map((p) => (p as OpenAiTextPart).text).join(''),
        });
      }
    } else if (m.role === 'assistant') {
      let textBuf = '';
      const toolCalls: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }> = [];
      for (const b of m.blocks) {
        if (b.kind === 'text') {
          textBuf += b.text;
        } else if (b.kind === 'tool_use') {
          toolCalls.push({
            id: b.id,
            type: 'function',
            function: {
              name: b.name,
              arguments:
                typeof b.input === 'string'
                  ? b.input
                  : JSON.stringify(b.input ?? {}),
            },
          });
        }
        // tool_result blocks can't legally appear in an assistant message in
        // our model — silently skip.
      }
      const entry: OpenAiMessage = {
        role: 'assistant',
        content: textBuf.length > 0 ? textBuf : null,
      };
      if (toolCalls.length > 0) {
        (entry as { tool_calls?: typeof toolCalls }).tool_calls = toolCalls;
      }
      out.push(entry);
    } else if (m.role === 'tool') {
      // Each tool_result block becomes one role:'tool' message. Runtime
      // currently emits one tool message per tool_result, so this loop is
      // typically a single iteration, but we handle the multi-block case
      // defensively.
      for (const b of m.blocks) {
        if (b.kind === 'tool_result') {
          out.push({
            role: 'tool',
            tool_call_id: b.tool_use_id,
            content: b.output,
          });
        }
      }
    }
  }
  return out;
}

// ─── 视觉降级（provider 不收 image_url 时的优雅回退）────────────────────────

/** 降级注记：图片没随消息送达时替换进 user 文本，让模型按「看不到图」硬规则走。 */
export const IMAGE_DROPPED_NOTE =
  '（图片未随消息送达：本模型不支持图片输入，无法读取图片内容——请勿虚构画面）';

/**
 * 去图降级（纯函数）：把 user content 里的 image_url part 换成降级注记文本，
 * 并把 parts 归并回 string content（其余消息原样）。用于 provider 对
 * image_url 一律 400 的线：去掉图片重发一次，不崩、不静默丢图（模型拿到
 * 明示注记 → prompt 硬规则要求它声明「无法读取图片内容」而非编造）。
 */
export function deimageWireMessages(messages: OpenAiMessage[]): OpenAiMessage[] {
  return messages.map((m) => {
    if (m.role !== 'user' || typeof m.content === 'string') return m;
    const parts = m.content;
    if (!parts.some((p) => p.type === 'image_url')) return m;
    const texts: string[] = [];
    for (const p of parts) {
      if (p.type === 'text') texts.push(p.text);
      else texts.push(IMAGE_DROPPED_NOTE);
    }
    return { role: 'user', content: texts.join('\n') };
  });
}

/** 该消息面是否带 image_url part（决定 400 时要不要走去图重试）。 */
function hasImageParts(messages: OpenAiMessage[]): boolean {
  return messages.some(
    (m) => m.role === 'user' && typeof m.content !== 'string' && m.content.some((p) => p.type === 'image_url'),
  );
}

/**
 * 判定「可能是 provider 拒收图片」类失败（400/404/415/422 请求被拒不兼容）。
 * 调用方仅在消息真带 image_url part 时才拿它决定去图重试；非图片类 400
 * 重试去图版仍会失败 → 第二次错误照实上抛，代价只有一次多余请求。
 */
function isImageRejection(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number };
  const status = e?.status ?? e?.statusCode;
  return status === 400 || status === 404 || status === 415 || status === 422;
}

// ─── stop_reason normalization ────────────────────────────────────────────

/**
 * Map OpenAI `finish_reason` → our normalized stop_reason string. We keep the
 * normalized vocabulary aligned with Anthropic's so the runtime's per-turn
 * branching (clean break vs tool_use loop continuation) stays provider-
 * agnostic. Unknown values pass through verbatim.
 */
function normalizeFinishReason(reason: string | null | undefined): string {
  if (!reason) return 'unknown';
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return reason;
  }
}

// ─── usage extraction ─────────────────────────────────────────────────────

/**
 * Extract OpenAI usage block (`prompt_tokens` / `completion_tokens` /
 * `cached_tokens`) and map to our TokenUsage shape.
 * - `prompt_tokens`     → `input_tokens`
 * - `completion_tokens` → `output_tokens`
 * - `prompt_tokens_details.cached_tokens` → `cache_read_input_tokens`
 *
 * Returns undefined when nothing useful is present, so the runtime doesn't
 * emit empty 'usage' events.
 */
function extractUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, unknown>;
  const out: TokenUsage = {};
  if (typeof u.prompt_tokens === 'number') out.input_tokens = u.prompt_tokens;
  if (typeof u.completion_tokens === 'number') out.output_tokens = u.completion_tokens;
  const details = u.prompt_tokens_details;
  if (details && typeof details === 'object') {
    const d = details as Record<string, unknown>;
    if (typeof d.cached_tokens === 'number') out.cache_read_input_tokens = d.cached_tokens;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ─── Client ───────────────────────────────────────────────────────────────

export class OpenAiCompatApiClient implements ApiClient {
  constructor(private readonly opts: OpenAiCompatApiClientOptions) {}

  /**
   * Resolve the effective baseURL for this client.
   * Priority:
   *   1. opts.baseURL (explicit override)
   *   2. PROVIDER_BASE_URLS[providerId]
   *
   * Throws if neither is set. We DO NOT fall back to an empty string — the
   * OpenAI SDK silently routes an absent baseURL to https://api.openai.com/v1,
   * which would leak the full request body (system prompt + tools + history)
   * to OpenAI when the caller intended a different provider. Loud failure is
   * the only safe option.
   */
  private resolveBaseURL(): string {
    if (this.opts.baseURL && this.opts.baseURL.length > 0) return this.opts.baseURL;
    const fromTable = PROVIDER_BASE_URLS[this.opts.providerId];
    if (fromTable && fromTable.length > 0) return fromTable;
    throw new Error(
      `OpenAiCompatApiClient: no baseURL configured for provider '${this.opts.providerId}' — pass opts.baseURL or use a registered provider id`,
    );
  }

  private resolveModel(): string {
    if (this.opts.model && this.opts.model.length > 0) return this.opts.model;
    const id = this.opts.providerId as keyof typeof DEFAULT_MODELS;
    return DEFAULT_MODELS[id] ?? 'gpt-4o';
  }

  /**
   * Stream one LLM turn. See file header for protocol translation contract.
   *
   * Tool_calls accumulation state machine:
   *   On each chunk's `choices[0].delta.tool_calls?` array:
   *     for each entry (keyed by `index`):
   *       - if entry.id present     → set / overwrite pending.id
   *       - if entry.function.name  → set / overwrite pending.name
   *       - if entry.function.arguments → append to pending.argsBuf
   *   On `choices[0].finish_reason='tool_calls'` (or stream end with any
   *   accumulated entries), emit one `tool_use` AssistantEvent per index in
   *   ascending index order, parsing argsBuf as JSON.
   *
   * Malformed JSON in arguments → wrapped in `{__parse_error: true, raw}`
   * so the runtime can still dispatch the call and let the tool executor
   * surface a structured error to the LLM (same policy as Anthropic client).
   */
  async *stream(args: {
    system_prompt: string;
    messages: ConversationMessage[];
    tools: ToolSpec[];
    signal: AbortSignal;
  }): AsyncIterable<AssistantEvent> {
    // 公网稳定性（2026-11-08）：叠加默认总超时（SF_LLM_TIMEOUT_MS），防网络抖动无限挂起。
    const signal = withDefaultLlmTimeout(args.signal);
    const apiKey = this.opts.apiKey ?? '';
    if (!apiKey && !PROVIDERS_NO_KEY.has(this.opts.providerId)) {
      throw new Error(
        `${this.opts.providerId} API key not configured (BYOK)`,
      );
    }

    const baseURL = this.resolveBaseURL();
    const model = this.resolveModel();
    const max_tokens = this.opts.max_tokens ?? 8192;

    // OpenAI SDK is forgiving — empty apiKey throws at request time unless
    // base allows; for ollama/lmstudio we pass a dummy non-empty string so
    // SDK validation doesn't reject the call upfront.
    const effectiveKey = apiKey.length > 0 ? apiKey : 'sk-no-key';

    // 2026-11-07 azure 打通：Azure 的 `?api-version=` 是 query 参数，而 OpenAI
    // SDK 只会把 `/chat/completions` 拼在 baseURL 后面（query 夹在中间会拼坏）。
    // 统一把 baseURL 里的 query 拆进 SDK `defaultQuery`（对任何需要 query 的
    // 网关都成立）；azure 另补 `api-key` 头（Azure 门户鉴权头，与 Bearer 双发，
    // 与 settings.ts 探针的 dualKeyHeaders 同策略，对普通网关无副作用）。
    let wireBaseURL = baseURL;
    let defaultQuery: Record<string, string> | undefined;
    const qIdx = baseURL.indexOf('?');
    if (qIdx >= 0) {
      wireBaseURL = baseURL.slice(0, qIdx);
      defaultQuery = Object.fromEntries(new URLSearchParams(baseURL.slice(qIdx + 1)));
    }

    const client = new OpenAI({
      apiKey: effectiveKey,
      ...(wireBaseURL.length > 0 ? { baseURL: wireBaseURL } : {}),
      ...(defaultQuery ? { defaultQuery } : {}),
      ...(this.opts.providerId === 'azure'
        ? { defaultHeaders: { 'api-key': effectiveKey } }
        : {}),
    });

    // Build wire messages: system_prompt becomes the first system entry
    // (OpenAI convention), then the rolling history.
    const wireMessages: OpenAiMessage[] = [];
    if (args.system_prompt.length > 0) {
      wireMessages.push({ role: 'system', content: args.system_prompt });
    }
    wireMessages.push(...toOpenAiMessages(args.messages));

    // Per-stream tool_calls accumulator: keyed by index since the id can
    // arrive on the first delta only.
    interface PendingToolCall {
      id: string;
      name: string;
      argsBuf: string;
    }
    const pendingByIndex = new Map<number, PendingToolCall>();

    // Cache the last seen finish_reason — OpenAI sends it on the final
    // chunk's choices[0]; we yield 'message_stop' once we observe it.
    let finishReason: string | null = null;
    // Track whether we've emitted message_stop already (defensive: some
    // proxies emit a redundant empty chunk after the finish_reason chunk).
    let stopEmitted = false;
    // Some compat providers ignore stream_options.include_usage and never
    // send a usage chunk; some send a partial usage mid-stream. We accept
    // only the LAST usage value seen and emit it exactly once at message_stop
    // time, so the runtime doesn't double-count via addUsage().
    let lastUsage: TokenUsage | undefined;
    // Once we've warned about a synthesized tool_call id we don't keep
    // spamming the log on every subsequent tool call in this stream.
    let warnedSyntheticId = false;

    // reasoning_content → <sf:thinking> packaging state machine.
    //
    // Providers like Zhipu glm-5.x emit chain-of-thought via
    // `delta.reasoning_content` BEFORE the regular `delta.content` answer
    // begins. If we forward both as plain `text_delta` the downstream parser
    // can't tell them apart — thinking ends up rendered as the final answer.
    //
    // Solution: wrap reasoning_content in <sf:thinking>...</sf:thinking> so
    // server/src/parser.ts:343's existing extractor catches it and emits a
    // dedicated `thinking-chunk` event (which the timeline-projector routes
    // to the ThinkCard slot in the UI).
    //
    // Phases:
    //   'init'     — nothing yielded yet
    //   'thinking' — currently inside an open <sf:thinking> block
    //   'content'  — past thinking, streaming the actual answer
    //
    // Transitions:
    //   init → thinking : on first reasoning_content delta; prepend opener tag
    //   thinking → content : on first content delta; prepend closer tag
    //   stream end while phase='thinking' : emit standalone closer tag
    let phase: 'init' | 'thinking' | 'content' = 'init';

    // OpenAI SDK's `create()` is overloaded by `stream: boolean` literal —
    // TS can't always pick the streaming overload when other fields use loose
    // types (Record<string, unknown> in `parameters` etc.). Casting to a
    // permissive shape lets us declare `stream: true` without losing the
    // streaming Stream<ChatCompletionChunk> at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model,
      max_tokens,
      stream: true,
      // Request usage in the stream tail. OpenAI / openrouter / groq /
      // mistral honor this; providers that ignore it just return the
      // chunk without usage and we skip the emit.
      stream_options: { include_usage: true },
      ...(this.opts.temperature !== undefined
        ? { temperature: this.opts.temperature }
        : {}),
      messages: wireMessages,
      ...(args.tools.length > 0 ? { tools: args.tools.map(toOpenAiTool) } : {}),
    };
    let stream: AsyncIterable<unknown>;
    try {
      stream = (await client.chat.completions.create(createParams, {
        signal,
      })) as unknown as AsyncIterable<unknown>;
    } catch (err) {
      // 视觉降级（2026-11-08，修草拟"盲写"兜底）：provider 拒收 image_url
      // （400/404/415/422）且消息真带图 → 去图重发一次（降级注记替换进 user
      // 文本，prompt 硬规则要求模型声明「无法读取图片内容」而非编造画面）。
      // 仍失败、非图片类错误或已中止 → 照旧上抛，不无限重试。
      if (!(hasImageParts(wireMessages) && isImageRejection(err) && !signal.aborted)) {
        throw err instanceof Error ? err : new Error(String(err));
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[OpenAiCompatApiClient] provider rejected image parts (${err instanceof Error ? err.message : String(err)}), retrying once without images`,
      );
      createParams.messages = deimageWireMessages(wireMessages);
      try {
        stream = (await client.chat.completions.create(createParams, {
          signal,
        })) as unknown as AsyncIterable<unknown>;
      } catch (err2) {
        throw err2 instanceof Error ? err2 : new Error(String(err2));
      }
    }

    /**
     * Flush pending tool_calls in ascending index order, then emit usage (if
     * any was observed) and message_stop. Used both on finish_reason and on
     * stream-end-without-finish-reason fallback paths.
     *
     * tool_call id: OpenAI normally sends `id` on the first delta of each
     * tool_call. Some proxies (older zhipu/qwen) omit it entirely; in that
     * case we synthesize one of the form `oc_<idx>_<ts36>` so the runtime
     * can still round-trip the tool_result. We warn once per stream so the
     * proxy quirk is visible without flooding logs.
     */
    const flush = async function* (
      this: void,
    ): AsyncGenerator<AssistantEvent> {
      const indexes = Array.from(pendingByIndex.keys()).sort((a, b) => a - b);
      for (const idx of indexes) {
        const p = pendingByIndex.get(idx)!;
        let input: unknown = {};
        if (p.argsBuf.length > 0) {
          try {
            input = JSON.parse(p.argsBuf);
          } catch {
            input = { __parse_error: true, raw: p.argsBuf };
          }
        }
        let id = p.id;
        if (id.length === 0) {
          id = `oc_${idx}_${Date.now().toString(36)}`;
          if (!warnedSyntheticId) {
            // eslint-disable-next-line no-console
            console.warn(
              `[OpenAiCompatApiClient] provider omitted tool_call id, synthesizing '${id}' for index=${idx} name='${p.name}'`,
            );
            warnedSyntheticId = true;
          }
        }
        yield { kind: 'tool_use', id, name: p.name, input };
      }
      pendingByIndex.clear();
      if (lastUsage) {
        yield { kind: 'usage', usage: lastUsage };
        lastUsage = undefined;
      }
      yield {
        kind: 'message_stop',
        stop_reason: normalizeFinishReason(finishReason),
      };
    };

    for await (const chunkRaw of stream) {
      if (signal.aborted) return;
      const chunk = chunkRaw as {
        choices?: Array<{
          delta?: {
            content?: string | null;
            // Zhipu glm-5.x family emits chain-of-thought here BEFORE the
            // actual content starts. Without forwarding it the UI shows a
            // blank screen for 30+ seconds while the model thinks.
            reasoning_content?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: unknown;
      };

      const choice = chunk.choices?.[0];
      if (choice?.delta) {
        // 1a) thinking / chain-of-thought (glm-5.x reasoning_content).
        // Wrap in <sf:thinking> so the downstream parser routes it to the
        // ThinkCard slot rather than the answer body. See `phase` declaration
        // above for the full state machine contract.
        const reasoning = choice.delta.reasoning_content;
        if (typeof reasoning === 'string' && reasoning.length > 0) {
          if (phase === 'init') {
            yield { kind: 'text_delta', text: '<sf:thinking>' + reasoning };
            phase = 'thinking';
          } else {
            yield { kind: 'text_delta', text: reasoning };
          }
        }
        // 1b) text content — close any open thinking block before yielding.
        const txt = choice.delta.content;
        if (typeof txt === 'string' && txt.length > 0) {
          if (phase === 'thinking') {
            yield { kind: 'text_delta', text: '</sf:thinking>' + txt };
          } else {
            yield { kind: 'text_delta', text: txt };
          }
          phase = 'content';
        }
        // 2) tool_calls deltas — fold by index
        const tcDeltas = choice.delta.tool_calls;
        if (Array.isArray(tcDeltas)) {
          for (const tc of tcDeltas) {
            const idx = tc.index;
            let pending = pendingByIndex.get(idx);
            if (!pending) {
              pending = { id: '', name: '', argsBuf: '' };
              pendingByIndex.set(idx, pending);
            }
            if (typeof tc.id === 'string' && tc.id.length > 0) pending.id = tc.id;
            if (tc.function) {
              if (typeof tc.function.name === 'string' && tc.function.name.length > 0) {
                pending.name = tc.function.name;
              }
              if (typeof tc.function.arguments === 'string') {
                pending.argsBuf += tc.function.arguments;
              }
            }
          }
        }
      }

      if (choice?.finish_reason && !stopEmitted) {
        finishReason = choice.finish_reason;
      }

      // 3) usage — providers send this either in the final chunk after
      //    finish_reason (per spec) or sprinkled mid-stream (some proxies).
      //    We accept the LAST value and emit it once inside flush(); this
      //    avoids the runtime's addUsage() double-counting when multiple
      //    usage chunks arrive.
      const usage = extractUsage(chunk.usage);
      if (usage) lastUsage = usage;

      // 4) If finish_reason was set in this chunk and there's no more
      //    expected payload, flush pending tool_calls + emit message_stop.
      //    Why flush only once finish_reason is observed: tool_calls deltas
      //    can keep arriving until the finish chunk, so flushing earlier
      //    risks emitting a half-assembled tool_use.
      if (choice?.finish_reason && !stopEmitted) {
        // Close any open <sf:thinking> block before the tool_use / usage /
        // message_stop terminators. Happens when the model emits only
        // reasoning_content with no follow-up `content` (e.g. a pure-tool
        // turn after extended thinking).
        if (phase === 'thinking') {
          yield { kind: 'text_delta', text: '</sf:thinking>' };
          phase = 'content';
        }
        yield* flush();
        stopEmitted = true;
      }
    }

    // Stream ended without a finish_reason chunk (edge case: some compat
    // proxies cut off early). flush() still emits message_stop with
    // finishReason='unknown' so the runtime terminates cleanly.
    if (!stopEmitted) {
      if (phase === 'thinking') {
        yield { kind: 'text_delta', text: '</sf:thinking>' };
        phase = 'content';
      }
      yield* flush();
    }
  }
}

// Suppress unused export warning for ContentBlock — it's referenced via type
// imports only and tsc would otherwise complain about the bare type import.
void (null as unknown as ContentBlock);
