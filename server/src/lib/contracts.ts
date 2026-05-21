/**
 * contracts.ts — Shared types for the intent-workflow pipeline (S0-S4).
 *
 * Pinned here so every collaborator on the stream (parser.ts, step-store.ts,
 * routes/run-sessions.ts, future Stream C intent-router.ts) imports from a
 * single source of truth instead of each side maintaining its own private
 * type alias. Anything cross-cutting goes here.
 *
 * See: docs/design/intent-workflow-design-v1.md §4.2 / §4.4.
 */

/**
 * What kind of artifact a single step is contracted to produce.
 *
 *   'nodes'     — sf:node tags (agent definitions)
 *   'edges'     — sf:edge tags (workflow connections)
 *   'yaml'      — an <artifact type="yaml"> block
 *   'classify'  — an sf:classify tag (intent metadata)
 *   'none'      — no observable artifact (analysis / planning step)
 *
 * Extending: skill authors will eventually be able to declare their own
 * output_kind via SKILL.md frontmatter (Story S5.1). Until then this union
 * stays closed — `parser.ts` only validates against these five literals.
 */
export type OutputKind = 'nodes' | 'edges' | 'yaml' | 'classify' | 'none';

/**
 * On-disk record for a single step's lifecycle + payload.
 *
 * Written by `step-store.ts` to
 *   <cwd>/.shadowflow/projects/<session_id>/steps/<step_index>.json
 *
 * Read by:
 *   - retry endpoint (S4.1) — needs 0..n-1 to replay context
 *   - resume endpoint (S4.2) — needs to find the last `status: 'done'`
 *
 * NOT a database row — we accept eventually-consistent disk writes (atomic
 * .tmp+rename) and tolerate partial reads on crash recovery.
 */
export interface StepArtifact {
  session_id: string;
  /** 0-based; matches the position in the skill's step sequence. */
  step_index: number;
  step_name: string;
  output_kind: OutputKind;
  /**
   * Free-form payload. Concrete shape varies by output_kind:
   *   'nodes'    → Array<{ node_id, type, title, ... }>
   *   'edges'    → Array<{ from, to }>
   *   'yaml'     → { filename, content }
   *   'classify' → { output_type, mode, confidence, complexity }
   *   'none'     → null (or any metadata the step wants to record)
   * Kept as `unknown` so the contract stays stable when payload schemas grow.
   */
  payload: unknown;
  /** ISO timestamp. */
  started_at: string;
  /** ISO timestamp; null while running. */
  finished_at: string | null;
  status: 'running' | 'done' | 'failed';
  /** Populated when status === 'failed'. */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// S6.10-A — TimelineMessage model
//
// The legacy SSE stream emits *fine-grained* events (node/edge/agent-substep/
// thinking-chunk/yaml-line/blueprint/classify/assemble/text/…). The front-end
// historically demultiplexes them into independent state slots and renders
// three fixed layouts (StepList / UserMessage / AgentDetail). That makes the
// UI feel like a static three-pane jigsaw.
//
// Trae / Cherry Studio / Codex / Claude Code all treat the run as a single
// ordered list of typed "messages": user_turn → thinking → assistant_meta →
// rationale → tool_call → step_panel → diff_panel → msg_foot → … the front-end
// then dispatches by `kind` to small per-kind renderers.
//
// To unlock that pattern without breaking the existing UI, the SSE handler
// keeps emitting *every* legacy event AND additionally emits two new events:
//   event: 'message'       → data is a full `TimelineMessage`
//   event: 'message-patch' → data is a `MessagePatch` that mutates an earlier
//                            long-lived message (step_panel grows, thinking
//                            streams body, msg_foot updates timer/cost, etc.)
//
// The projector that derives these from the legacy stream lives in
// `timeline-projector.ts`. Visual contract: docs/design/platform-v5/
// run-session-v8.html (timeline item kinds, ~lines 1568-1716).
// ─────────────────────────────────────────────────────────────────────────────

export type MessageKind =
  | 'user_turn'
  | 'thinking'
  | 'assistant_meta'
  | 'rationale'
  | 'tool_call'
  | 'tool_echo'
  | 'step_panel'
  | 'diff_panel'
  | 'msg_foot'
  | 'status_line';

export interface TimelineMessageBase {
  /** ULID-ish stable id. Front-end uses this as React key + patch target. */
  id: string;
  kind: MessageKind;
  /**
   * All messages produced inside one user turn share this id. A new `user_turn`
   * opens the next turn; everything until the following `user_turn` belongs to
   * it. Convenient for grouping/anchoring without keeping turn boundaries on
   * the front-end side.
   */
  turn_id: string;
  /** epoch ms. */
  ts: number;
}

/**
 * A row inside a `step_panel`. Pending steps can be reported by the projector
 * (so the panel knows total progress) but the front-end is contracted to only
 * render `done` + `running` rows.
 */
export interface StepRow {
  name: string;
  status: 'done' | 'running' | 'pending';
  elapsed_ms?: number;
  substeps?: StepRow[];
}

export interface DiffLine {
  no: number;
  mark: '+' | '-' | ' ';
  code: string;
}

export type TimelineMessage =
  | (TimelineMessageBase & {
      kind: 'user_turn';
      text: string;
    })
  | (TimelineMessageBase & {
      kind: 'thinking';
      label: string;
      tokens?: number;
      preview?: string;
      body?: string;
      status: 'streaming' | 'done';
    })
  | (TimelineMessageBase & {
      kind: 'assistant_meta';
      model_brand: string;
      model_ver: string;
      identity: string;
      summary: string;
    })
  | (TimelineMessageBase & {
      kind: 'rationale';
      bullets: string[];
    })
  | (TimelineMessageBase & {
      kind: 'tool_call';
      name: string;
      args_summary: string;
      link?: { label: string; href: string };
    })
  | (TimelineMessageBase & {
      kind: 'tool_echo';
      body: string;
    })
  | (TimelineMessageBase & {
      kind: 'step_panel';
      total_steps: number;
      steps: StepRow[];
    })
  | (TimelineMessageBase & {
      kind: 'diff_panel';
      filename: string;
      added: number;
      removed: number;
      lines: DiffLine[];
    })
  | (TimelineMessageBase & {
      kind: 'msg_foot';
      status: 'running' | 'done';
      elapsed_ms?: number;
      tools?: number;
      tokens?: number;
      cost_cny?: number;
    })
  | (TimelineMessageBase & {
      kind: 'status_line';
      verb: string;
      elapsed_s: number;
      tools_running: number;
    });

/**
 * Patches let a long-lived message grow in place. They mutate the message
 * identified by `id` (which is always a message the front-end has previously
 * received).
 */
export type MessagePatch =
  | { id: string; op: 'append_step'; step: StepRow }
  | { id: string; op: 'update_step'; index: number; patch: Partial<StepRow> }
  | { id: string; op: 'append_substep'; step_index: number; sub: StepRow }
  | {
      id: string;
      op: 'update_substep';
      step_index: number;
      sub_index: number;
      patch: Partial<StepRow>;
    }
  | { id: string; op: 'thinking_append_body'; chunk: string }
  | { id: string; op: 'thinking_finalize'; tokens?: number }
  | { id: string; op: 'diff_append_line'; line: DiffLine }
  | {
      id: string;
      op: 'msg_foot_update';
      patch: Partial<{
        status: 'running' | 'done';
        elapsed_ms: number;
        tools: number;
        tokens: number;
        cost_cny: number;
      }>;
    };

/**
 * What `TimelineProjector` returns from every callback. Either or both arrays
 * may be empty; the caller forwards them as SSE `message` / `message-patch`
 * events in order (messages first, then patches that depend on them).
 */
export interface ProjectorEmit {
  messages: TimelineMessage[];
  patches: MessagePatch[];
}
