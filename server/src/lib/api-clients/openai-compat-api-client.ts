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
} from '../conversation-runtime';
import type {
  ContentBlock,
  ConversationMessage,
  TokenUsage,
} from '../conversation-types';
import type { ToolSpec } from '../tool-spec';
import { DEFAULT_MODELS } from '../../llm-providers/types';

/**
 * Provider id → default baseURL. Sourced from
 * `server/src/llm-providers/openai-compat-instances.ts` — DO NOT duplicate /
 * diverge; this table must be a strict mirror so adding a new provider is a
 * single-file change in BOTH places (the legacy single-call factory + this
 * multi-turn client).
 *
 * Note: these are SDK base URLs (no `/chat/completions` suffix). The OpenAI
 * SDK appends `/chat/completions` itself given a `baseURL` of e.g.
 * `https://api.deepseek.com/v1`.
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  // azure is deliberately omitted — see assembler.buildApiClient docstring
  // (Checker S14.1 P0-1). If anyone constructs this client directly with
  // providerId='azure' and no explicit baseURL, resolveBaseURL() throws so
  // the request body never leaves the machine.
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
type OpenAiMessage =
  | { role: 'system'; content: string }
  | {
      role: 'user';
      content:
        | string
        | Array<{ type: 'text'; text: string }>;
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
      const text = m.blocks
        .map((b) => (b.kind === 'text' ? b.text : ''))
        .join('');
      out.push({ role: 'user', content: text });
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

    const client = new OpenAI({
      apiKey: effectiveKey,
      ...(baseURL.length > 0 ? { baseURL } : {}),
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
        signal: args.signal,
      })) as unknown as AsyncIterable<unknown>;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
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
      if (args.signal.aborted) return;
      const chunk = chunkRaw as {
        choices?: Array<{
          delta?: {
            content?: string | null;
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
        // 1) text content
        const txt = choice.delta.content;
        if (typeof txt === 'string' && txt.length > 0) {
          yield { kind: 'text_delta', text: txt };
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
        yield* flush();
        stopEmitted = true;
      }
    }

    // Stream ended without a finish_reason chunk (edge case: some compat
    // proxies cut off early). flush() still emits message_stop with
    // finishReason='unknown' so the runtime terminates cleanly.
    if (!stopEmitted) {
      yield* flush();
    }
  }
}

// Suppress unused export warning for ContentBlock — it's referenced via type
// imports only and tsc would otherwise complain about the bare type import.
void (null as unknown as ContentBlock);
