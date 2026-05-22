/**
 * LlmCallable.ts — Transport-layer contract for "one LLM turn".
 *
 * Part of the **Orchestration ⊥ Transport** architecture documented in
 * `docs/architecture/orchestration-transport.md`. This file is the **Transport
 * layer's sole public contract**: every concrete backend (ApiClient wrapper,
 * Claude Code CLI, Codex CLI, ACP, MCP, BYOK-via-OpenAI-compat) implements
 * `LlmCallable` and is invoked uniformly by the Orchestration layer
 * (`workflow/scheduler.ts`, `assembler.ts` non-team branch) through a single
 * `turn(input): AsyncGenerator<TurnChunk>` call.
 *
 * Phase 2 eng review decisions encoded here (see doc §"Phase 2 Eng Review · 决策记录"):
 *
 *   - **A1** — `turn()` always returns `AsyncGenerator<TurnChunk>`. Backends that
 *     don't natively stream (Codex CLI today) emit a single `text-delta` chunk
 *     containing the full output. Front-end typewriter UX is preserved.
 *
 *   - **A6** — O1 unified path: BOTH team-backed skills (via DAG scheduler) AND
 *     non-team skills (single turn) flow through `LlmCallable.turn()`. There is
 *     no "fast path" that bypasses this interface.
 *
 *   - **CL3 / E3** — Hybrid error model:
 *       • **Call-phase errors** (auth missing, executor not found, spawn failure,
 *         malformed input) → `throw` a typed `LlmCallError` BEFORE the generator
 *         yields its first chunk. `retry.ts` decides whether to re-invoke.
 *       • **Stream-mid errors** (provider 5xx mid-stream, CLI subprocess crash
 *         after partial output, abort signal fired) → `yield` an `error` chunk,
 *         then return. Front-end shows the error inline without hard-breaking
 *         the SSE connection.
 *
 *   - **C1** — Single `AbortSignal` propagates entry → scheduler → callable.turn()
 *     → underlying SDK/subprocess. Cancellation is end-to-end with one signal;
 *     node-level cancel is a future UI capability that will derive child signals
 *     without changing this interface.
 *
 *   - **A2 (informational)** — `capabilities` is descriptive metadata for
 *     observability and UI hints (e.g., greying out a tool-use toggle).
 *     **Orchestration MUST NOT branch on capabilities.** All callables conform
 *     to the same `turn()` contract; capability mismatches produce
 *     `LlmCallError` at call time, not orchestration branches.
 */

import type { ConversationMessage } from '../lib/conversation-types';

// ─── Placeholder types ────────────────────────────────────────────────────────
//
// `TurnChunk` and `LlmCallError` are the formal property of `workflow/types.ts`
// (Lane 1 of Phase 2 implementation). Until that file lands, we declare minimal
// placeholders here so `tsc --noEmit` succeeds on this file in isolation. When
// Lane 1 lands, delete these placeholders and switch to:
//
//   import type { TurnChunk, LlmCallError } from '../workflow/types';
//
// The placeholder shapes below are deliberately minimal — Lane 1 will widen
// them (adding more chunk variants, structured error metadata, etc.).

/**
 * @placeholder Replace with `../workflow/types` import when Lane 1 lands.
 *
 * Discriminated union of stream events one `turn()` can yield. Mirrors the
 * existing `<sf:agent-substep node_id="..."/>` + Anthropic block-delta protocol
 * the parser already understands (see `parser.ts:286`).
 */
export type TurnChunk =
  | { kind: 'text-delta'; text: string; nodeId?: string }
  | { kind: 'tool-use'; toolName: string; input: unknown; nodeId?: string }
  | { kind: 'tool-result'; toolUseId: string; output: string; isError: boolean; nodeId?: string }
  | { kind: 'usage'; inputTokens?: number; outputTokens?: number; nodeId?: string }
  | { kind: 'error'; message: string; cause?: unknown; nodeId?: string }
  | { kind: 'done'; nodeId?: string };

/**
 * @placeholder Replace with `../workflow/types` import when Lane 1 lands.
 *
 * Typed exception thrown BEFORE the first chunk yields. `retry.ts` inspects
 * `code` to decide retry policy (e.g., `rate-limit` → backoff; `auth` → fail
 * fast; `executor-not-found` → fail fast).
 */
export class LlmCallError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'auth'
      | 'rate-limit'
      | 'executor-not-found'
      | 'spawn-failed'
      | 'invalid-input'
      | 'unknown',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
}

// ─── Public interface ─────────────────────────────────────────────────────────

/**
 * Tool exposed to the model via the underlying transport. Schema follows the
 * Anthropic tool-use convention (`name` / `description` / `input_schema`).
 *
 * NB: not every transport supports tool-use natively. Where it doesn't (e.g.,
 * pure-text Codex CLI), the implementation either ignores `tools` or throws
 * `LlmCallError('executor-not-found')` if tools are required.
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Single-turn input contract. Constructed by the orchestration layer; the
 * callable treats it as immutable.
 *
 * `workspace` is the per-session artifact directory (see
 * `assembler.ts:586-589` `artifactCallback`). CLI-backed callables pass it as
 * the subprocess CWD so models can read/write artifacts via file-system tools.
 * In-process callables (ApiClient wrappers) can still use it to resolve
 * relative paths emitted in tool inputs.
 *
 * `history` is a rolling multi-turn history for backends that support it. Per
 * Phase 2 decision A2 ("artifact-based handoff"), ShadowFlow's team workflow
 * passes `history: []` between agents — coordination happens through files on
 * `workspace`, not through chat log. The field is retained for compatibility
 * with non-team / single-turn flows and for future use.
 */
export interface LlmCallableTurnInput {
  system: string;
  prompt: string;
  history: ConversationMessage[];
  tools?: ToolSpec[];
  workspace?: string;
  signal: AbortSignal;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Descriptive capability flags. **Informational only** — Orchestration MUST NOT
 * branch on these (decision A2). They exist for:
 *
 *   - UI hints (grey out tool-use toggle when `supportsToolUse: false`)
 *   - Observability (log which backend variant served a turn)
 *   - Pre-flight validation in `dispatcher.resolveCallable()` (refuse to bind
 *     a tools-requiring skill to a non-tool-capable executor)
 *
 * Mismatches at runtime should surface as `LlmCallError`, not as silent
 * fallbacks or behavioral divergence inside `turn()`.
 */
export interface LlmCallableCapabilities {
  supportsToolUse: boolean;
  supportsMultiTurn: boolean;
  supportsStreamingDelta: boolean;
}

/**
 * The Transport-layer contract. One method, one stream, one cancellation
 * signal. Every backend (api-client, CLI spawner, ACP, MCP) implements this
 * and is interchangeable from the orchestrator's perspective.
 */
export interface LlmCallable {
  /** Stable identifier (e.g., `anthropic-direct`, `cli:claude`, `acp:bmad`). */
  readonly id: string;
  readonly capabilities: LlmCallableCapabilities;

  /**
   * Run one turn. See file-header for the call-phase vs stream-mid error
   * contract (CL3/E3). Caller MUST consume the generator to completion or
   * abort via `input.signal` — leaving it dangling will leak subprocesses /
   * SDK streams.
   */
  turn(input: LlmCallableTurnInput): AsyncGenerator<TurnChunk>;
}
