/**
 * conversation-runtime.ts — multi-turn agentic loop.
 *
 * S5 (skill-team-conversion-design-v1.md §5 line 900-952) — TypeScript port
 * of `claw-code-reference rust/crates/runtime/src/conversation.rs`. Replaces
 * the single-LLM-call `runSkillAssembler` shape with an iterative loop:
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

import type { ConversationMessage, ContentBlock, TokenUsage } from './conversation-types';
import type { ToolSpec } from './tool-spec';
import type { PermissionPolicy } from './permission-policy';

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
 */
function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input_tokens: (a.input_tokens ?? 0) + (b.input_tokens ?? 0),
    output_tokens: (a.output_tokens ?? 0) + (b.output_tokens ?? 0),
    cache_creation_input_tokens:
      (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  };
}

/** Initial zeroed usage. */
function zeroUsage(): TokenUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

/**
 * Coerce arbitrary tool output to a string for the tool_result block.
 * Strings pass through; everything else gets JSON.stringify'd. We deliberately
 * do NOT include undefined-safety (JSON.stringify(undefined) → undefined) —
 * tool executors are expected to always return something serializable.
 */
function outputToString(out: unknown): string {
  return typeof out === 'string' ? out : JSON.stringify(out);
}

export interface ConversationRuntimeOptions {
  /**
   * Hard ceiling on iterations of the (LLM turn → tool exec) loop in a
   * single runTurn() call. D2 default = 50. Set lower in tests or for
   * particularly short workflows.
   */
  maxIterations?: number;
}

export class ConversationRuntime {
  private readonly maxIterations: number;

  constructor(
    private readonly session: RuntimeSession,
    private readonly apiClient: ApiClient,
    private readonly toolExecutor: ToolExecutor,
    private readonly permissionPolicy: PermissionPolicy,
    private readonly systemPrompt: string,
    options?: ConversationRuntimeOptions,
  ) {
    // D2 (2026-05-20): default 50, not Rust's 16. See file header note 3.
    this.maxIterations = options?.maxIterations ?? 50;
  }

  /**
   * Run one user-initiated turn end-to-end. Yields SSE events suitable for
   * direct forwarding to the wire. The generator finishes by yielding
   * exactly one of:
   *
   *   - `event: 'complete'`  — normal end (LLM stopped or max_iter hit)
   *   - `event: 'aborted'`   — signal fired during the turn
   *
   * Errors from ApiClient.stream() are surfaced as an `event: 'error'`
   * frame AND re-thrown so the upstream SSE handler can decide whether to
   * close the connection or kick a retry.
   */
  async *runTurn(userInput: string, signal: AbortSignal): AsyncGenerator<SseEvent> {
    // 1. Append the user message that starts the turn.
    this.session.messages.push({
      role: 'user',
      blocks: [{ kind: 'text', text: userInput }],
    });

    let iterations = 0;
    let totalUsage = zeroUsage();
    // Track the most recent message_stop reason for the final 'complete'
    // event. Stays 'unknown' if we exit via max_iter without ever seeing one.
    let stopReason = 'unknown';
    // Set to true when the loop exits because no tool_use this turn (the
    // assistant cleanly ended). Used to distinguish a natural break from a
    // max_iterations bail, since stopReason alone is ambiguous (every turn
    // that emits tool_use has stop_reason='tool_use').
    let cleanBreak = false;

    while (iterations < this.maxIterations) {
      // Check abort at the TOP of each iteration so we don't start a new
      // LLM call after the user aborted between turns.
      if (signal.aborted) {
        // S5 P1 #4 (Checker review): include cumulative usage in abort payload
        // so upstream can record partial-turn token spend even on cancellation.
        yield {
          event: 'aborted',
          data: { session_id: this.session.id, iterations, usage: totalUsage },
        };
        return;
      }
      iterations += 1;

      // Per-turn accumulators. textBuf flushes to a `text` ContentBlock on
      // tool_use or message_stop (see header note 5). assistantBlocks is the
      // ordered list of blocks for this turn's assistant message.
      const assistantBlocks: ContentBlock[] = [];
      const pendingTools: Array<{ id: string; name: string; input: unknown }> = [];
      let textBuf = '';
      // Per-turn stop reason; only fold into outer `stopReason` once we
      // confirm the turn completed (so an abort doesn't poison the report).
      let thisTurnStopReason: string | null = null;

      // 2. Run the LLM stream for this turn.
      const tools = this.toolExecutor.toolSpecs();
      try {
        for await (const ev of this.apiClient.stream({
          system_prompt: this.systemPrompt,
          messages: this.session.messages,
          tools,
          signal,
        })) {
          if (ev.kind === 'text_delta') {
            // Stream text deltas to the wire as fast as they come; only
            // buffer into the persisted ContentBlock.
            textBuf += ev.text;
            yield { event: 'text', data: { text: ev.text } };
          } else if (ev.kind === 'tool_use') {
            // Flush any accumulated text into a `text` block BEFORE the
            // tool_use block. Order matters: when we later replay this
            // assistant message to the LLM, it should see text → tool_use
            // in the same sequence the model emitted them.
            if (textBuf.length > 0) {
              assistantBlocks.push({ kind: 'text', text: textBuf });
              textBuf = '';
            }
            assistantBlocks.push({
              kind: 'tool_use',
              id: ev.id,
              name: ev.name,
              input: ev.input,
            });
            pendingTools.push({ id: ev.id, name: ev.name, input: ev.input });
          } else if (ev.kind === 'usage') {
            totalUsage = addUsage(totalUsage, ev.usage);
          } else if (ev.kind === 'message_stop') {
            // Final text flush at the end of the turn.
            if (textBuf.length > 0) {
              assistantBlocks.push({ kind: 'text', text: textBuf });
              textBuf = '';
            }
            thisTurnStopReason = ev.stop_reason;
          }
        }
      } catch (err) {
        // Surface API error to the wire, then re-throw so upstream can
        // decide policy (close SSE / retry / show user). We do NOT push the
        // partial assistant message into session.messages — keeping the
        // session clean means a retry can be issued without poisoning history.
        const message = err instanceof Error ? err.message : String(err);
        yield {
          event: 'error',
          data: { code: 'API_ERROR', message, iterations },
        };
        throw err;
      }

      // 3. Persist the assistant turn (even if it had only text, no tools)
      //    and update the running stop reason.
      this.session.messages.push({
        role: 'assistant',
        blocks: assistantBlocks,
        usage: totalUsage,
      });
      if (thisTurnStopReason !== null) {
        stopReason = thisTurnStopReason;
      }

      // 4. No tool calls this turn → assistant chose to end, we're done.
      if (pendingTools.length === 0) {
        cleanBreak = true;
        break;
      }

      // 5. Execute every pending tool in order. Each one becomes ONE
      //    `role: 'tool'` message in session.messages (with a single
      //    tool_result block). The Rust upstream batches multiple
      //    tool_results into a single user message; we keep them separate
      //    here for finer-grained debug / replay. AnthropicBlockAdapter
      //    handles role-folding at the wire boundary.
      for (const t of pendingTools) {
        if (signal.aborted) {
          // S5 P1 #4: include cumulative usage in abort payload (see top-of-loop note).
          yield {
            event: 'aborted',
            data: { session_id: this.session.id, iterations, usage: totalUsage },
          };
          return;
        }

        // PermissionPolicy.authorize is synchronous (S3 D6 decision: no
        // interactive prompter in MVP). The `input` arg is reserved for the
        // future 'prompt' mode but harmless to pass today.
        const inputStr = JSON.stringify(t.input);
        const perm = this.permissionPolicy.authorize(t.name, inputStr);
        if ('deny' in perm) {
          this.session.messages.push({
            role: 'tool',
            blocks: [
              {
                kind: 'tool_result',
                tool_use_id: t.id,
                tool_name: t.name,
                output: JSON.stringify({ error: perm.deny }),
                is_error: true,
              },
            ],
          });
          // Don't execute, don't yield SSE — just feed denial back to LLM.
          continue;
        }

        let result: ToolExecutionResult;
        try {
          result = await this.toolExecutor.execute(t.name, t.input);
        } catch (err) {
          // Tool threw → wrap as is_error tool_result, let LLM see it and
          // decide whether to retry / abandon. We do NOT propagate the
          // throw up to the SSE handler — tool failures are recoverable by
          // the LLM (unlike API failures which require infra response).
          const message = err instanceof Error ? err.message : String(err);
          result = {
            output: { error: `tool '${t.name}' threw: ${message}` },
            isError: true,
          };
        }

        // Forward any side-effect SSE the tool wanted to emit (D4: tools
        // never write to the wire themselves; they return events for the
        // runtime to yield).
        for (const sse of result.sseEvents ?? []) {
          yield sse;
        }

        this.session.messages.push({
          role: 'tool',
          blocks: [
            {
              kind: 'tool_result',
              tool_use_id: t.id,
              tool_name: t.name,
              output: outputToString(result.output),
              is_error: result.isError ?? false,
            },
          ],
        });
      }
      // Loop: next iteration calls the LLM with the tool_result(s) appended
      // to the context.
    }

    // Exited the loop. Either the assistant produced a turn with no
    // tool_use (clean break), or we hit maxIterations (runaway). The
    // distinction matters: a turn that exits with tool_use still pending
    // would normally loop again to feed tool_result back to the LLM —
    // failing to do so means the conversation is genuinely incomplete and
    // upstream should surface that to the user.
    if (!cleanBreak && iterations >= this.maxIterations) {
      yield {
        event: 'error',
        data: {
          code: 'MAX_ITERATIONS',
          message: `reached max_iterations=${this.maxIterations} with pending tool_use`,
          iterations,
        },
      };
      stopReason = 'max_iterations';
    }

    yield {
      event: 'complete',
      data: {
        session_id: this.session.id,
        iterations,
        usage: totalUsage,
        stop_reason: stopReason,
      },
    };
  }
}
