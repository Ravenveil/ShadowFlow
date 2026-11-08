/**
 * conversation-types.ts — multi-turn message + tool-use data model.
 *
 * S1 (skill-team-conversion-design-v1.md §5 / §3.1.b) — TypeScript port of
 * `claw-code-reference rust/crates/runtime/src/session.rs` ContentBlock /
 * ConversationMessage. Aligns with Anthropic Messages API content-block shape:
 *
 *   - `text` block        ← model emits prose
 *   - `tool_use` block    ← model invokes a tool (id + name + JSON input)
 *   - `tool_result` block ← runtime returns tool output for a prior tool_use_id
 *
 * D8 (design §6): session-store v0 records (pre-S1) have no `messages` field.
 * Loader injects an empty array + bumps `version` 0 → 1 on read so the in-memory
 * shape is uniform from here on. See `session-store.ts` loadAll().
 *
 * This module is pure types; no I/O, no runtime behavior. Importing it must be
 * side-effect free so the contracts can be shared between routes / assembler /
 * future ConversationRuntime (S5) without dependency cycles.
 */

/**
 * TokenUsage — Anthropic-compatible per-message accounting.
 *
 * Defined here (not contracts.ts) because it's tightly coupled to a single
 * ConversationMessage. Mirrors the four fields the Anthropic Messages API
 * returns on every `message_delta` final event:
 *   input_tokens, output_tokens, cache_creation_input_tokens,
 *   cache_read_input_tokens.
 *
 * All fields optional so partial usage payloads (e.g. GLM provider that only
 * reports output_tokens) round-trip cleanly through JSON without spurious 0s.
 *
 * CLI-only telemetry (cost_usd / duration_ms / ttft_ms) is populated solely
 * by the Claude Code CLI ApiClient — the Anthropic direct SDK does not
 * surface per-turn cost, and other providers (openai-compat / google / codex)
 * leave these fields `undefined`. Front-end / wire layer must treat them as
 * optional best-effort BYOK observability, not invariants.
 */
export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  /** CLI-only: per-turn cost in USD. From Claude Code CLI `result` event `total_cost_usd`. */
  cost_usd?: number;
  /** CLI-only: per-turn wall-clock in ms. From Claude Code CLI `result` event `duration_ms`. */
  duration_ms?: number;
  /** CLI-only: time to first token in ms. From Claude Code CLI `stream_event.message_start.ttft_ms`. */
  ttft_ms?: number;
}

/**
 * ContentBlock — discriminated union, one per Anthropic block type we use.
 *
 * `kind` is the discriminant (Anthropic calls it `type` on the wire — we
 * rename to avoid shadowing JS `typeof`/TS `type` keyword grep noise).
 * Serializers / API adapters translate `kind` ↔ `type` at the boundary.
 */
export type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | {
      kind: 'tool_result';
      tool_use_id: string;
      tool_name: string;
      output: string;
      is_error: boolean;
    }
  /**
   * 图片块（2026-11-08 视觉注入，修草拟"盲写"）——base64 图片字节随 user
   * 消息进模型。**只进瞬态 turn 消息**（ApiClientCallable.turn 按次合成的那条
   * user 消息），绝不写入 session.messages 历史/会话存储——所以
   * SESSION_SCHEMA_VERSION 不 bump（序列化面零变化，无 base64 膨胀）。
   *
   * wire 翻译：Anthropic 走 `image.source{type:'base64'}`（anthropic-block-adapter
   * 映射）；OpenAI-compat 走 `image_url` data URI（openai-compat-api-client）。
   * 其余 client（google/codex/claude-code CLI）现阶段按未知块跳过（text-only），
   * 由草拟 prompt 的「无法读取图片内容必须明说」硬规则兜底防编造。
   */
  | { kind: 'image'; media_type: string; data: string };

/** Conversation message role — matches Anthropic + the Rust `MessageRole`. */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * ConversationMessage — one turn in the rolling history.
 *
 * `usage` is optional because only assistant messages carry it (user/tool/
 * system turns have no token accounting from the model side).
 */
export interface ConversationMessage {
  role: MessageRole;
  blocks: ContentBlock[];
  usage?: TokenUsage;
}

/**
 * Current session schema version. Bump when ConversationMessage / ContentBlock
 * gain non-backward-compatible fields. Loader migrates 0 → CURRENT on read.
 */
export const SESSION_SCHEMA_VERSION = 1 as const;
