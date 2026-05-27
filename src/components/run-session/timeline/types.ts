/**
 * Front-end mirror of `server/src/lib/contracts.ts` TimelineMessage/MessagePatch
 * types (S6.10-A). Kept as a parallel definition because the front-end
 * tsconfig only includes `src/` — the server module is not directly importable.
 *
 * SOURCE OF TRUTH: server/src/lib/contracts.ts (must stay in sync).
 *
 * SSE contract:
 *   event: 'message'       → data = TimelineMessage   (full new message)
 *   event: 'message-patch' → data = MessagePatch      (mutates existing by id)
 */

export type MessageKind =
  | 'user_turn'
  | 'thinking'
  | 'assistant_meta'
  | 'assistant_text'
  /**
   * T3 — first-class bucket for unclassified content (leaked SSE frames,
   * off-protocol blobs, raw CLI lines). Rendered as a collapsed raw block so
   * it never pollutes the answer bubble. Mirrors OpenDesign's `raw` kind.
   */
  | 'raw'
  | 'rationale'
  | 'tool_call'
  | 'tool_echo'
  | 'step_panel'
  | 'diff_panel'
  | 'msg_foot'
  | 'status_line'
  /**
   * Round 2.5 — section divider row (e.g. "Builder", "思考过程",
   * "工作 · 白名单运行"). Standalone foldable header without inline
   * children; subsequent messages live under it visually. Currently
   * only emitted by FE-side extractors; server can emit later.
   */
  | 'section_header';

export interface TimelineMessageBase {
  /** ULID-ish stable id. React key + patch target. */
  id: string;
  kind: MessageKind;
  /** All messages in one user turn share this. */
  turn_id: string;
  /** epoch ms. */
  ts: number;
}

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
  /** P2-4 — when true, render a blinking caret at end of line (v8 .cur). */
  cursor?: boolean;
}

export type TimelineMessage =
  | (TimelineMessageBase & { kind: 'user_turn'; text: string })
  | (TimelineMessageBase & {
      kind: 'thinking';
      label: string;
      tokens?: number;
      preview?: string;
      body?: string;
      status: 'streaming' | 'done';
      /** Thinking duration ms, set on finalize. Renders as "Thought for Xs". */
      duration_ms?: number;
    })
  | (TimelineMessageBase & {
      kind: 'assistant_meta';
      model_brand: string;
      model_ver: string;
      identity: string;
      summary: string;
    })
  | (TimelineMessageBase & {
      kind: 'assistant_text';
      body: string;
      /** While true, the AssistantText renderer shows a trailing blink-caret. */
      streaming?: boolean;
    })
  | (TimelineMessageBase & {
      kind: 'raw';
      /** Unclassified content, verbatim. Rendered in a collapsed mono block. */
      body: string;
      /** Optional provenance hint (e.g. 'sse-frame-leak', 'unknown-tag'). */
      source?: string;
    })
  | (TimelineMessageBase & { kind: 'rationale'; bullets: string[] })
  | (TimelineMessageBase & {
      kind: 'tool_call';
      name: string;
      args_summary: string;
      link?: { label: string; href: string };
    })
  | (TimelineMessageBase & { kind: 'tool_echo'; body: string })
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
      /**
       * True once the turn is terminal (projector onComplete). When set the
       * StatusLine ticker freezes — elapsed_s is the final duration.
       */
      terminal?: boolean;
    })
  | (TimelineMessageBase & {
      kind: 'section_header';
      title: string;
      /** Optional trailing meta (e.g. "5 steps · 5.4s"). */
      meta?: string;
      /** Default true; FE persists toggle state per id. */
      default_open?: boolean;
    });

export type MessagePatch =
  | { id: string; op: 'text_append'; chunk: string }
  | { id: string; op: 'text_finalize' }
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
  | { id: string; op: 'thinking_finalize'; tokens?: number; duration_ms?: number }
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
 * Pure reducer helper — apply a `MessagePatch` onto the matching
 * `TimelineMessage`. Returns a new message instance (immutability) or the
 * original if op is incompatible with the message's kind (defensive — server
 * shouldn't emit mismatched patches, but we no-op rather than crash).
 *
 * Tested in `src/core/hooks/__tests__/useRunSession.timeline.test.ts`.
 */
export function applyPatch(
  msg: TimelineMessage,
  patch: MessagePatch,
): TimelineMessage {
  switch (patch.op) {
    case 'text_append': {
      if (msg.kind !== 'assistant_text') return msg;
      return { ...msg, body: msg.body + patch.chunk, streaming: true };
    }
    case 'text_finalize': {
      if (msg.kind !== 'assistant_text') return msg;
      return { ...msg, streaming: false };
    }
    case 'append_step': {
      if (msg.kind !== 'step_panel') return msg;
      return { ...msg, steps: [...msg.steps, patch.step] };
    }
    case 'update_step': {
      if (msg.kind !== 'step_panel') return msg;
      const steps = msg.steps.map((s, i) =>
        i === patch.index ? { ...s, ...patch.patch } : s,
      );
      return { ...msg, steps };
    }
    case 'append_substep': {
      if (msg.kind !== 'step_panel') return msg;
      const steps = msg.steps.map((s, i) => {
        if (i !== patch.step_index) return s;
        return { ...s, substeps: [...(s.substeps ?? []), patch.sub] };
      });
      return { ...msg, steps };
    }
    case 'update_substep': {
      if (msg.kind !== 'step_panel') return msg;
      const steps = msg.steps.map((s, i) => {
        if (i !== patch.step_index) return s;
        const subs = (s.substeps ?? []).map((sub, j) =>
          j === patch.sub_index ? { ...sub, ...patch.patch } : sub,
        );
        return { ...s, substeps: subs };
      });
      return { ...msg, steps };
    }
    case 'thinking_append_body': {
      if (msg.kind !== 'thinking') return msg;
      return { ...msg, body: (msg.body ?? '') + patch.chunk };
    }
    case 'thinking_finalize': {
      if (msg.kind !== 'thinking') return msg;
      return {
        ...msg,
        status: 'done',
        tokens: patch.tokens ?? msg.tokens,
        duration_ms: patch.duration_ms ?? msg.duration_ms,
      };
    }
    case 'diff_append_line': {
      if (msg.kind !== 'diff_panel') return msg;
      return { ...msg, lines: [...msg.lines, patch.line] };
    }
    case 'msg_foot_update': {
      if (msg.kind !== 'msg_foot') return msg;
      return { ...msg, ...patch.patch };
    }
    default:
      return msg;
  }
}
