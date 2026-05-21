/**
 * timeline-projector.ts — Stream A → Stream B fanout
 *
 * Story S6.10-A. The SSE handler ships *fine-grained* events (`node` / `edge`
 * / `agent-substep` / `thinking-chunk` / `yaml-line` / `blueprint` / `classify`
 * / `assemble` / `text` / `complete`) so the existing front-end keeps working.
 * In parallel, we also need a Trae/Codex-style timeline: a single ordered list
 * of typed `TimelineMessage`s plus `MessagePatch`es that grow long-lived
 * messages (step_panel, thinking, diff_panel, msg_foot) in place.
 *
 * Rather than refactor every callsite, we projector the fine-grained stream
 * into the new model. The SSE handler instantiates one projector per session
 * and, for each legacy event yielded, calls the matching `on*` method. The
 * projector returns `{ messages, patches }` which the handler forwards as
 * additional `event: 'message'` / `event: 'message-patch'` SSE frames.
 *
 * Important behaviours (contract for downstream consumers):
 *
 *   • Every message has a stable `id` (ULID-ish, monotonically sortable). The
 *     front-end uses it as a React key and as the patch target.
 *   • One `step_panel` per turn. Its id is reused so subsequent legacy
 *     `assemble` / `agent-substep` events emit *patches* against the same
 *     message instead of inflating the timeline.
 *   • `thinking` messages stream: open with `status: 'streaming'`, accumulate
 *     body via `thinking_append_body` patches, then `thinking_finalize`
 *     flips them to `status: 'done'`.
 *   • `diff_panel` works the same way for YAML line streams: empty `lines[]`
 *     in the initial message + `diff_append_line` patches as each line lands.
 *   • `msg_foot` is the per-turn running status row. It is created lazily
 *     (first time we hear about *any* step) and patched on every step and on
 *     `onComplete()` (final `status: 'done'`).
 *   • Pending steps are NOT pre-allocated. Steps appear via `append_step`
 *     when their `assemble:running` lands; this matches the v3 design.
 *
 * The projector keeps NO global state across instances — each session
 * (`createTimelineProjector()`) is isolated and safe to GC when the SSE
 * connection ends.
 */

import type {
  DiffLine,
  MessagePatch,
  ProjectorEmit,
  StepRow,
  TimelineMessage,
} from './contracts';

// ─── id generation ──────────────────────────────────────────────────────────
//
// Cherry/Codex-style timelines key off message id for diffing. We need ids
// that are:
//   1. Globally unique within a session (no Date.now() collisions on fast
//      synthetic streams that fire dozens of events per millisecond).
//   2. Monotonically increasing string-comparable so the front-end can sort
//      without parsing.
//   3. Cheap (this is a hot path — multiple per event).
//
// A 48-bit epoch-ms timestamp + 80-bit counter+random component matches the
// ULID layout without pulling in the `ulid` dependency. Counter handles
// same-ms collisions; random tail guarantees distinctness across projector
// instances (paranoid — same process, same ms, two SSE handlers).

const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let idCounter = 0;

function newId(prefix: string): string {
  idCounter = (idCounter + 1) & 0xffffff;
  const ts = Date.now().toString(36).padStart(9, '0');
  const ctr = idCounter.toString(36).padStart(5, '0');
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return `${prefix}_${ts}${ctr}${rand}`;
}

function nowMs(): number {
  return Date.now();
}

// ─── projector ──────────────────────────────────────────────────────────────

export interface TimelineProjector {
  /** Open a new turn. Closes any in-flight thinking/foot from the previous turn. */
  onUserMessage(text: string): ProjectorEmit;
  /** Classify metadata → assistant_meta (only the first classify per turn). */
  onClassify(data: {
    output_type?: string;
    mode?: string;
    confidence?: number;
    complexity?: number;
    source?: string;
  }): ProjectorEmit;
  /** Open a step on the current turn's step_panel (creates panel on first call). */
  onAssembleStart(stepIndex: number, stepName: string): ProjectorEmit;
  /** Close a step (running → done). */
  onAssembleDone(stepIndex: number, elapsedMs: number): ProjectorEmit;
  /** Add a running substep under a step. */
  onAgentSubstepStart(nodeId: string, substep: string): ProjectorEmit;
  /** Mark a substep done. */
  onAgentSubstepDone(nodeId: string, substep: string, elapsedMs: number): ProjectorEmit;
  /** Stream a thinking chunk (opens a thinking message if none is open). */
  onThinkingChunk(chunk: string): ProjectorEmit;
  /** Blueprint event → open a diff_panel for the YAML artifact. */
  onBlueprint(data: { filename?: string; yaml?: string }): ProjectorEmit;
  /** Each yaml-line event appends to the open diff_panel. */
  onYamlLine(line: string): ProjectorEmit;
  /** Optional plain text assistant chunk → tool_echo (used rarely). */
  onText(text: string): ProjectorEmit;
  /** Final event → close thinking, finalize msg_foot. */
  onComplete(): ProjectorEmit;

  /** Test helper — internal state snapshot (kept tiny). */
  _debug(): {
    turnId: string;
    stepPanelId: string | null;
    msgFootId: string | null;
    openThinkingId: string | null;
    openDiffPanelId: string | null;
    stepIdToIndex: Record<number, number>;
  };
}

export function createTimelineProjector(): TimelineProjector {
  // Per-turn state. Reset whenever onUserMessage opens a fresh turn.
  let turnId = newId('turn');
  let turnStartMs = nowMs();
  let stepPanelId: string | null = null;
  /** Index in the panel's `steps[]` keyed by the legacy step_index. */
  const stepIndexLookup = new Map<number, number>();
  /**
   * Running snapshot of the step_panel steps. We keep it server-side so
   * `onAgentSubstepStart` / `Done` can look up the right substep array index
   * without the front-end having to echo back state.
   */
  let stepPanelSteps: StepRow[] = [];
  /** Total step count. Inferred lazily — bumps when we see a higher index. */
  let totalSteps = 0;

  let msgFootId: string | null = null;
  let toolsRun = 0;

  let openThinkingId: string | null = null;
  let thinkingBuf = '';

  let openDiffPanelId: string | null = null;
  let diffLineNo = 0;
  let diffAdded = 0;

  // Substep tracking — outer key is nodeId. Each node maps to a `step_index`
  // (which step_panel row owns it) and the array of substeps it currently
  // holds. The first running substep for an unknown node anchors it to the
  // currently-running step.
  interface NodeState {
    stepIndex: number;
    subs: StepRow[];
    subIndexByName: Map<string, number>;
  }
  const nodeMap = new Map<string, NodeState>();
  let currentRunningStepIndex: number | null = null;

  function ensureMsgFoot(out: ProjectorEmit) {
    if (msgFootId) return;
    msgFootId = newId('msg');
    out.messages.push({
      id: msgFootId,
      kind: 'msg_foot',
      turn_id: turnId,
      ts: nowMs(),
      status: 'running',
      elapsed_ms: 0,
      tools: 0,
    });
  }

  function bumpMsgFoot(out: ProjectorEmit, patch: { tools?: number; status?: 'running' | 'done' }) {
    if (!msgFootId) return;
    const merged: { elapsed_ms: number; tools?: number; status?: 'running' | 'done' } = {
      elapsed_ms: nowMs() - turnStartMs,
    };
    if (patch.tools !== undefined) merged.tools = patch.tools;
    if (patch.status !== undefined) merged.status = patch.status;
    out.patches.push({
      id: msgFootId,
      op: 'msg_foot_update',
      patch: merged,
    });
  }

  function ensureStepPanel(out: ProjectorEmit) {
    if (stepPanelId) return;
    stepPanelId = newId('msg');
    stepPanelSteps = [];
    out.messages.push({
      id: stepPanelId,
      kind: 'step_panel',
      turn_id: turnId,
      ts: nowMs(),
      total_steps: 0,
      steps: [],
    });
  }

  function closeOpenThinking(out: ProjectorEmit) {
    if (!openThinkingId) return;
    out.patches.push({
      id: openThinkingId,
      op: 'thinking_finalize',
      tokens: Math.max(1, Math.round(thinkingBuf.length / 4)),
    });
    openThinkingId = null;
    thinkingBuf = '';
  }

  function emit(): ProjectorEmit {
    return { messages: [], patches: [] };
  }

  return {
    onUserMessage(text: string): ProjectorEmit {
      const out = emit();
      // Close anything open from a prior turn before opening a new one.
      if (msgFootId) bumpMsgFoot(out, { status: 'done' });
      closeOpenThinking(out);
      // Reset turn-scoped state.
      turnId = newId('turn');
      turnStartMs = nowMs();
      stepPanelId = null;
      stepPanelSteps = [];
      stepIndexLookup.clear();
      totalSteps = 0;
      msgFootId = null;
      toolsRun = 0;
      openDiffPanelId = null;
      diffLineNo = 0;
      diffAdded = 0;
      nodeMap.clear();
      currentRunningStepIndex = null;
      out.messages.push({
        id: newId('msg'),
        kind: 'user_turn',
        turn_id: turnId,
        ts: nowMs(),
        text,
      });
      return out;
    },

    onClassify(data): ProjectorEmit {
      const out = emit();
      // Only the *first* classify per turn becomes assistant_meta; subsequent
      // classifies (e.g. the LLM-emitted one after the TS-emitted one) are
      // ignored at this layer — front-end still sees them on legacy stream.
      // We tag by msgFootId presence: if msg_foot doesn't exist yet, we're
      // first in the turn.
      if (msgFootId) return out;
      const id = newId('msg');
      const brand = 'Claude';
      const ver = data.mode ?? 'team';
      const identity = data.mode === 'team' ? '已识别 Team 模式' : `mode=${data.mode ?? 'task'}`;
      const summary = `output=${data.output_type ?? '?'} · confidence=${(data.confidence ?? 0).toFixed(2)} · complexity=${data.complexity ?? '?'}`;
      out.messages.push({
        id,
        kind: 'assistant_meta',
        turn_id: turnId,
        ts: nowMs(),
        model_brand: brand,
        model_ver: ver,
        identity,
        summary,
      });
      ensureMsgFoot(out);
      return out;
    },

    onAssembleStart(stepIndex: number, stepName: string): ProjectorEmit {
      const out = emit();
      ensureMsgFoot(out);
      ensureStepPanel(out);
      const panelId = stepPanelId!;
      // Already seen? (idempotent — should not happen but defensive)
      if (stepIndexLookup.has(stepIndex)) {
        const idx = stepIndexLookup.get(stepIndex)!;
        out.patches.push({
          id: panelId,
          op: 'update_step',
          index: idx,
          patch: { status: 'running', name: stepName },
        });
        currentRunningStepIndex = stepIndex;
        return out;
      }
      const newRow: StepRow = { name: stepName, status: 'running', substeps: [] };
      stepPanelSteps.push(newRow);
      const localIdx = stepPanelSteps.length - 1;
      stepIndexLookup.set(stepIndex, localIdx);
      if (stepIndex + 1 > totalSteps) totalSteps = stepIndex + 1;
      out.patches.push({ id: panelId, op: 'append_step', step: newRow });
      currentRunningStepIndex = stepIndex;
      return out;
    },

    onAssembleDone(stepIndex: number, elapsedMs: number): ProjectorEmit {
      const out = emit();
      if (!stepPanelId) return out;
      const localIdx = stepIndexLookup.get(stepIndex);
      if (localIdx === undefined) return out;
      stepPanelSteps[localIdx].status = 'done';
      stepPanelSteps[localIdx].elapsed_ms = elapsedMs;
      out.patches.push({
        id: stepPanelId,
        op: 'update_step',
        index: localIdx,
        patch: { status: 'done', elapsed_ms: elapsedMs },
      });
      if (currentRunningStepIndex === stepIndex) currentRunningStepIndex = null;
      bumpMsgFoot(out, {});
      return out;
    },

    onAgentSubstepStart(nodeId: string, substep: string): ProjectorEmit {
      const out = emit();
      if (!stepPanelId || currentRunningStepIndex === null) return out;
      const stepLocalIdx = stepIndexLookup.get(currentRunningStepIndex);
      if (stepLocalIdx === undefined) return out;
      let nodeState = nodeMap.get(nodeId);
      if (!nodeState) {
        nodeState = {
          stepIndex: currentRunningStepIndex,
          subs: [],
          subIndexByName: new Map(),
        };
        nodeMap.set(nodeId, nodeState);
      }
      // Anchor substep name by `nodeId/substep` so the same substep firing
      // twice (running → done) updates instead of duplicating.
      const subName = `${nodeId} · ${substep}`;
      if (nodeState.subIndexByName.has(subName)) return out;
      const sub: StepRow = { name: subName, status: 'running' };
      nodeState.subs.push(sub);
      nodeState.subIndexByName.set(subName, nodeState.subs.length - 1);
      const targetSteps = stepPanelSteps[stepLocalIdx];
      if (!targetSteps.substeps) targetSteps.substeps = [];
      targetSteps.substeps.push(sub);
      out.patches.push({
        id: stepPanelId,
        op: 'append_substep',
        step_index: stepLocalIdx,
        sub,
      });
      return out;
    },

    onAgentSubstepDone(nodeId: string, substep: string, elapsedMs: number): ProjectorEmit {
      const out = emit();
      if (!stepPanelId) return out;
      const nodeState = nodeMap.get(nodeId);
      if (!nodeState) return out;
      const stepLocalIdx = stepIndexLookup.get(nodeState.stepIndex);
      if (stepLocalIdx === undefined) return out;
      const subName = `${nodeId} · ${substep}`;
      const subLocalIdx = nodeState.subIndexByName.get(subName);
      if (subLocalIdx === undefined) return out;
      nodeState.subs[subLocalIdx].status = 'done';
      nodeState.subs[subLocalIdx].elapsed_ms = elapsedMs;
      out.patches.push({
        id: stepPanelId,
        op: 'update_substep',
        step_index: stepLocalIdx,
        sub_index: subLocalIdx,
        patch: { status: 'done', elapsed_ms: elapsedMs },
      });
      return out;
    },

    onThinkingChunk(chunk: string): ProjectorEmit {
      const out = emit();
      if (!openThinkingId) {
        openThinkingId = newId('msg');
        thinkingBuf = '';
        out.messages.push({
          id: openThinkingId,
          kind: 'thinking',
          turn_id: turnId,
          ts: nowMs(),
          label: 'Thinking',
          body: '',
          status: 'streaming',
        });
      }
      thinkingBuf += chunk;
      out.patches.push({
        id: openThinkingId,
        op: 'thinking_append_body',
        chunk,
      });
      return out;
    },

    onBlueprint(data): ProjectorEmit {
      const out = emit();
      ensureMsgFoot(out);
      // Close any open thinking first — blueprint marks the transition from
      // analysis to artifact production.
      closeOpenThinking(out);
      openDiffPanelId = newId('msg');
      diffLineNo = 0;
      diffAdded = 0;
      out.messages.push({
        id: openDiffPanelId,
        kind: 'diff_panel',
        turn_id: turnId,
        ts: nowMs(),
        filename: data.filename ?? 'output.yml',
        added: 0,
        removed: 0,
        lines: [],
      });
      toolsRun += 1;
      bumpMsgFoot(out, { tools: toolsRun });
      return out;
    },

    onYamlLine(line: string): ProjectorEmit {
      const out = emit();
      if (!openDiffPanelId) return out;
      diffLineNo += 1;
      diffAdded += 1;
      const dLine: DiffLine = { no: diffLineNo, mark: '+', code: line };
      out.patches.push({
        id: openDiffPanelId,
        op: 'diff_append_line',
        line: dLine,
      });
      return out;
    },

    onText(text: string): ProjectorEmit {
      const out = emit();
      if (!text.trim()) return out;
      out.messages.push({
        id: newId('msg'),
        kind: 'tool_echo',
        turn_id: turnId,
        ts: nowMs(),
        body: text,
      });
      return out;
    },

    onComplete(): ProjectorEmit {
      const out = emit();
      closeOpenThinking(out);
      if (msgFootId) {
        bumpMsgFoot(out, { status: 'done' });
      }
      return out;
    },

    _debug() {
      const stepIdToIndex: Record<number, number> = {};
      stepIndexLookup.forEach((v, k) => {
        stepIdToIndex[k] = v;
      });
      return {
        turnId,
        stepPanelId,
        msgFootId,
        openThinkingId,
        openDiffPanelId,
        stepIdToIndex,
      };
    },
  };
}
