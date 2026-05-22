/**
 * conversation-runtime.ts — Transport-layer types for ApiClient adapters.
 *
 * Phase 2 (2026-05-22) — the `ConversationRuntime` multi-turn tool_use loop
 * has been removed; the daemon-led DAG (`workflow/scheduler.ts`) + artifact
 * handoff (decision A3) replaces it. This file now retains ONLY the type
 * surface that the Transport layer's ApiClient adapters
 * (`lib/api-clients/*-api-client.ts`) implement, plus the `addUsage` helper.
 *
 * Retained exports (used by Transport layer):
 *   - `ApiClient` / `AssistantEvent`           — per-provider streaming contract
 *   - `ToolExecutor` / `ToolExecutionResult`   — tool dispatcher contract
 *     (kept for skill-anchors.ts schema; no runtime caller in Phase 2)
 *   - `RuntimeSession` / `SseEvent`            — shared shape definitions
 *   - `addUsage`                                — TokenUsage accumulator
 *
 * Removed (Phase 2):
 *   - `ConversationRuntime` class              — LLM tool_use multi-turn driver
 *   - `ConversationRuntimeOptions`             — its options bag
 *
 * Historical note (pre-Phase 2, preserved for context):
 *   S5 (skill-team-conversion-design-v1.md §5 line 900-952) — TypeScript port
 *   of `claw-code-reference rust/crates/runtime/src/conversation.rs`. Replaced
 *   the single-LLM-call `runSkillAssembler` shape with an iterative loop:
 *
 *   user input
 *     → push as user message
 *     → loop ≤ maxIterations:
 *         · call ApiClient.stream(system + messages + tools)
 *         · stream assistant blocks (text + tool_use) into session
 *         · if no tool_use this turn → break (assistant ended turn)
 *         · for each tool_use: PermissionPolicy.authorize → ToolExecutor.execute
 *           → push ToolResult back into session.messages
 *         · loop continues with new tool_result in context
 *     → yield 'complete' SSE
 *
 * Why we wrote this instead of using the @anthropic-ai/sdk built-in tool loop
 * ─────────────────────────────────────────────────────────────────────────
 * design §6 D-fallback: keeping our own loop means
 *   (a) provider-agnostic (GLM / OpenAI etc plug into ApiClient)
 *   (b) we control the SSE wire format and can yield mid-turn events
 *       (text_delta, tool side-effects) at our own pace
 *   (c) compaction / max_iter / abort semantics are testable without an
 *       SDK mock
 *
 * Key design points
 * ─────────────────
 * 1. **ApiClient is an interface, not a class**. S5 ships only the contract +
 *    a Fake for testing. S6 wires the real Anthropic provider (and other
 *    providers in server/src/llm-providers/) by implementing this interface.
 * 2. **ToolExecutor is an interface too**. S5 also ships only the contract.
 *    The skill-anchor executors from S4 will be wrapped into one
 *    ToolExecutor in S6.
 * 3. **max_iterations = 50** (D2 decision 2026-05-20). Rust upstream's 16 is
 *    too small — measured 4-agent skill runs take 25-30 turns. 50 gives
 *    headroom; if we ever blow through it that's a real runaway, surface it.
 * 4. **AbortSignal end-to-end**. Checked at the top of every iteration AND
 *    before every tool execution. ApiClient implementations must also honor
 *    the signal mid-stream (their problem; we just propagate).
 * 5. **text_delta buffering**. We accumulate text into a single buffer per
 *    turn and flush to ONE `text` ContentBlock when:
 *      - a tool_use arrives (text → block before tool_use block)
 *      - MessageStop arrives (final flush)
 *    We do NOT make a new block per delta — that would explode
 *    session.messages and break the Anthropic round-trip shape.
 * 6. **tool_name enrichment**. The Anthropic wire format's tool_result block
 *    doesn't carry the original tool name (only tool_use_id), but our
 *    internal ContentBlock requires `tool_name` for debug. Runtime fills it
 *    in from the pending ToolUse it just dispatched. AnthropicBlockAdapter
 *    leaves it empty by design (see that module's JSDoc).
 * 7. **Error policy**:
 *      - ApiClient throws (rate limit / network)  → yield 'error' SSE, then
 *                                                     re-throw to upstream
 *                                                     for retry / SSE close
 *      - Tool throws / tool returns isError=true → packed as tool_result
 *                                                     is_error=true, fed
 *                                                     back to LLM, loop
 *                                                     continues
 *      - PermissionPolicy deny                    → tool_result is_error=true
 *                                                     with deny reason, fed
 *                                                     back, loop continues
 *      - max_iterations hit without MessageStop  → yield 'error' SSE with
 *                                                     code MAX_ITERATIONS,
 *                                                     then 'complete' with
 *                                                     stop_reason='max_iter'
 *      - signal.aborted                           → yield 'aborted' SSE,
 *                                                     return early (NO
 *                                                     'complete')
 * 8. **Usage accounting**. Each AssistantEvent of kind 'usage' adds into the
 *    running totalUsage. We attach the snapshot to the assistant message
 *    when it's pushed. The final 'complete' event also carries cumulative
 *    usage so the upstream SSE handler can record it.
 */

import type { ConversationMessage, TokenUsage } from './conversation-types';
import type { ToolSpec } from './tool-spec';

// ─── Public interfaces ─────────────────────────────────────────────────────

/**
 * AssistantEvent — what the ApiClient yields per LLM stream chunk. Aligned
 * with Anthropic Messages API stream events but normalized to our internal
 * kinds (matching the Rust port's `AssistantEvent` enum).
 */
export type AssistantEvent =
  | { kind: 'text_delta'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'usage'; usage: TokenUsage }
  | {
      kind: 'message_stop';
      /**
       * Anthropic stop_reason. 'end_turn' | 'tool_use' | 'max_tokens' |
       * 'stop_sequence' | other provider strings. We keep it as a free string
       * to stay forward-compatible with new reasons.
       */
      stop_reason: string;
    };

/**
 * ApiClient — abstract LLM streaming contract. One LLM turn = one call to
 * `stream()`. Implementations:
 *
 *   - real Anthropic Messages API streaming (S6)
 *   - GLM / OpenAI provider adapters (S6 follow-ons)
 *   - FakeApiClient (tests, this file's __tests__/)
 *
 * The async iterable MUST terminate eventually (either by yielding a
 * `message_stop` event then returning, or by throwing). Implementations are
 * expected to honor `signal` and abort mid-stream when it fires.
 */
export interface ApiClient {
  stream(args: {
    system_prompt: string;
    messages: ConversationMessage[];
    tools: ToolSpec[];
    signal: AbortSignal;
  }): AsyncIterable<AssistantEvent>;
}

/**
 * ToolExecutionResult — what one tool returns to the runtime. Identical
 * shape to S4 SkillAnchorTool's ToolExecutionResult; re-declared here to
 * keep this module free of cross-imports from lib/tools/.
 *
 *   - `output` is fed back to the LLM verbatim as the tool_result content.
 *     Non-strings get JSON.stringify'd before push.
 *   - `sseEvents` is the side-channel (D4) — runtime yields each entry
 *     downstream so the wire SSE keeps existing event names (node / edge /
 *     ...). [S6 contract: parser.ts maps <sf:node>→'node' and <sf:edge>→
 *     'edge'; tool side-effects must use the same SSE event names — see
 *     skill-anchors.ts register_agent / register_edge.]
 *   - `isError` flips the tool_result's `is_error` flag so the LLM can
 *     distinguish success from failure.
 */
export interface ToolExecutionResult {
  output: unknown;
  sseEvents?: Array<{ event: string; data: unknown }>;
  isError?: boolean;
}

/**
 * ToolExecutor — abstract tool dispatcher. S6 will wrap the S4 skill-anchor
 * executors and any future per-skill conditional tools into one of these.
 *
 *   - `toolSpecs()` is called once per LLM turn to populate the `tools` arg
 *     to `ApiClient.stream`. Returning a fresh array per turn allows the
 *     executor to add/remove conditional tools mid-conversation.
 *   - `execute(name, input)` is called once per pending tool_use block from
 *     the assistant. May throw — runtime catches and packs into tool_result.
 */
export interface ToolExecutor {
  toolSpecs(): ToolSpec[];
  execute(name: string, input: unknown): Promise<ToolExecutionResult>;
}

/**
 * SseEvent — what runTurn yields. Upstream (S6 SSE handler) writes each one
 * as a single `event: <name>\ndata: <json>\n\n` chunk on the HTTP response.
 */
export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Session shape ConversationRuntime owns. Just enough to mutate the rolling
 * message stack. The full server/src/lib/session-store SessionRecord has more
 * fields but the runtime only needs `id` (for the complete event) and
 * `messages` (mutable history). Keeping the contract narrow lets tests use
 * `{id, messages: []}` literals without faking the whole record.
 */
export interface RuntimeSession {
  id: string;
  messages: ConversationMessage[];
}

// ─── Implementation ────────────────────────────────────────────────────────

/**
 * Sum two TokenUsage snapshots, treating `undefined` fields as 0 so partial
 * provider payloads (e.g. GLM only reports output_tokens) compose cleanly.
 * Returns a fresh object — does not mutate args.
 *
 * CLI-only fields (cost_usd / duration_ms / ttft_ms) have special semantics:
 *   - cost_usd / duration_ms: SUM (total cost / total wall-clock across turns
 *     is meaningful). Result stays `undefined` if both sides are `undefined`
 *     so providers that never emit these don't accumulate spurious 0s.
 *   - ttft_ms: LAST-WRITE (b.ttft_ms ?? a.ttft_ms). Time-to-first-token is a
 *     per-turn latency — summing across turns makes no sense. We keep the
 *     most recent non-undefined value so the UI can show "this turn's TTFT".
 */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const sumOrUndef = (x?: number, y?: number): number | undefined =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0);
  return {
    input_tokens: (a.input_tokens ?? 0) + (b.input_tokens ?? 0),
    output_tokens: (a.output_tokens ?? 0) + (b.output_tokens ?? 0),
    cache_creation_input_tokens:
      (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cost_usd: sumOrUndef(a.cost_usd, b.cost_usd),
    duration_ms: sumOrUndef(a.duration_ms, b.duration_ms),
    ttft_ms: b.ttft_ms ?? a.ttft_ms,
  };
}
