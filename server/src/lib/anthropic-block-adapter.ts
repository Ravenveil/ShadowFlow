/**
 * anthropic-block-adapter.ts — wire-shape ↔ internal-shape converter for
 * ContentBlock (S1) and ConversationMessage (S1).
 *
 * Why this module exists
 * ──────────────────────
 * Our internal `ContentBlock` (conversation-types.ts) uses `kind` as the
 * discriminant. The Anthropic Messages API uses `type` on the wire. Without a
 * single dedicated translation layer, every call site that talks to the LLM
 * (S5 ConversationRuntime, S6 assembler re-wiring, future provider adapters)
 * would do its own ad-hoc `kind ↔ type` mapping and we'd drift.
 *
 * S1-S3 Checker P1 review (design §5 line 1083) explicitly calls out that S5
 * needs this mapping and that it must be **centralized in one file**, not
 * scattered through the Runtime. So we ship the adapter as its own S5-companion
 * module ahead of ConversationRuntime.
 *
 * Scope
 * ─────
 * Pure data conversion. NO I/O, NO SSE emission, NO business logic. Importing
 * this module is side-effect free. It only knows about two shapes:
 *
 *   - Internal:  ContentBlock  (kind: 'text' | 'tool_use' | 'tool_result')
 *   - Wire:      AnthropicBlock (type: 'text' | 'tool_use' | 'tool_result')
 *
 * Asymmetry: ToolResult.tool_name
 * ───────────────────────────────
 * Our internal ToolResult carries `tool_name` for debug / logging. The
 * Anthropic wire format does NOT — it only references the prior ToolUse by id
 * (`tool_use_id`). When converting wire → internal we therefore leave
 * `tool_name` as empty string; the caller (ConversationRuntime) knows the
 * pending ToolUse's name and is responsible for enriching the block. Round-
 * trip tests must skip this field (or pre-fill it on the internal side before
 * comparing).
 */

import type { ContentBlock, ConversationMessage } from './conversation-types';

/**
 * AnthropicBlock — exactly the shape that goes on the wire to the Anthropic
 * Messages API in the `messages[].content[]` array. Mirrors @anthropic-ai/sdk
 * ContentBlock types but kept local so this module has zero external imports.
 *
 * Notes:
 *  - `tool_use.input` is `unknown` (Anthropic types it as `Record<string,
 *    unknown>` but in practice provider models can emit any JSON value).
 *  - `tool_result.content` is a string here (the JSON-stringified output).
 *    Anthropic supports a richer multi-part content shape but we only ever
 *    send/receive plain strings, matching the Rust port's behavior.
 */
export type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/**
 * Internal ContentBlock → wire-format AnthropicBlock. Total — every variant
 * is mapped explicitly. The switch is exhaustive on `kind`; TS will complain
 * if a new variant is added without updating this function.
 */
export function toAnthropicBlock(b: ContentBlock): AnthropicBlock {
  switch (b.kind) {
    case 'text':
      return { type: 'text', text: b.text };
    case 'tool_use':
      return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: b.tool_use_id,
        content: b.output,
        is_error: b.is_error,
      };
  }
}

/**
 * Wire-format AnthropicBlock → internal ContentBlock.
 *
 * ToolResult.tool_name is filled with empty string here — the Anthropic wire
 * format does not carry the original tool name, only `tool_use_id`. The
 * caller (ConversationRuntime) is expected to enrich `tool_name` from the
 * pending ToolUse before storing the block in session.messages.
 *
 * For ToolResult.is_error: wire field is optional (`undefined` means "not
 * error"). Internally we keep it as a required boolean, so undefined → false.
 */
export function fromAnthropicBlock(b: AnthropicBlock): ContentBlock {
  switch (b.type) {
    case 'text':
      return { kind: 'text', text: b.text };
    case 'tool_use':
      return { kind: 'tool_use', id: b.id, name: b.name, input: b.input };
    case 'tool_result':
      return {
        kind: 'tool_result',
        tool_use_id: b.tool_use_id,
        tool_name: '',
        output: b.content,
        is_error: b.is_error ?? false,
      };
  }
}

/**
 * One Anthropic messages[].content[] envelope. Note: Anthropic's API does not
 * accept `role: 'tool'` directly — tool_result blocks live inside a `user`
 * message. We collapse our internal `role: 'tool'` into a `user` role on the
 * wire to match. The internal session keeps the distinction for debugging /
 * UI display.
 */
export interface AnthropicMessage {
  role: 'user' | 'assistant' | 'system';
  content: AnthropicBlock[];
}

/**
 * Convert a slice of internal ConversationMessage[] to the Anthropic
 * `messages` field shape.
 *
 *   - `role: 'tool'` is folded into `role: 'user'` per Anthropic convention.
 *   - `role: 'system'` passes through; callers are responsible for ensuring
 *     system messages live in the top-level `system` field instead (Anthropic
 *     API requires that) — we don't filter here, that's policy not data.
 *   - `usage` is dropped (request-side messages don't carry usage; usage only
 *     comes back on the assistant turn's stream).
 */
export function toAnthropicMessages(messages: ConversationMessage[]): AnthropicMessage[] {
  return messages.map((m) => ({
    role: m.role === 'tool' ? 'user' : m.role,
    content: m.blocks.map(toAnthropicBlock),
  }));
}
