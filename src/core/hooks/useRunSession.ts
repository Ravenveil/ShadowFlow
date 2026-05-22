import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { subscribeRunSession, abortRunSession } from '../../api/runSessions';
import type { ClassifyEvent, AssembleEvent, NodeEvent, EdgeEvent, BlueprintEvent, CompleteEvent, RationaleEvent, YamlLineEvent, SubstepEvent, CritiqueResultEvent, CritiqueProgressEvent, TextEvent, AgentPersonaEvent, StepArtifact, StepArtifactEvent } from '../../api/runSessions';
import type { TimelineMessage, MessagePatch } from '../../components/run-session/timeline/types';
import { applyPatch } from '../../components/run-session/timeline/types';
import { classifyClientError, isErrorCode } from '../errors/classifyError';

/**
 * 2026-05-20 (S6.5) — Substep tracks a single slot's progress for the v3
 * stacked AgentDetail. SSE 'agent-substep' frames append here; the panel
 * uses (a) the running entry to anchor-scroll the right pane and (b) the
 * full list to render the left-pane substep tree under "配置 Agent 角色".
 */
export type AgentSubstepName = 'identity' | 'persona' | 'model' | 'tools' | 'memory' | 'io';
export interface RunSessionSubstep {
  name: AgentSubstepName;
  status: 'running' | 'done' | 'failed';
  elapsedMs: number | null;
  source?: string;       // e.g. "reader.skill.yaml#persona"
  tokens?: number;
  cached?: boolean;
  /** ms-since-epoch the running event arrived. Used by StepList to sort. */
  startedAt: number;
}

export interface RunSessionNode {
  id: string;
  type: 'coordinator' | 'agent';
  title: string;
  sub: string;
  chips: string[];
  status: 'building' | 'ready' | 'pending';
  avatarChar: string;
  // 2026-05-18 agent-B extension — fields backing AgentPanel 5-slot UI
  // (Identity / Persona / Model / Tools / Memory). All optional; AgentPanel
  // falls back to chips-derived values when these are absent:
  //   - model: chips regex /claude|gpt|gemini|deepseek|qwen/i
  //   - toolsPicked: chips minus the matched model chip
  //   - memory / persona: literal placeholder text in the panel
  model?: string;
  memory?: string;
  toolsPicked?: string[];
  toolsCandidate?: string[];
  persona?: string;
  // 2026-05-20 (S6.5) — v3 stacked extras. All optional; when missing the
  // SkillSection falls back to "未指定" / "由 persona 决定" / "—".
  skillRef?: string;
  personaSource?: string;
  personaTokens?: number;
  personaCached?: boolean;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  /** From `<sf:node io_input="...">` — JSON.parsed object, or raw string fallback. */
  ioInput?: unknown;
  ioOutput?: unknown;
  /** Per-substep progress timeline (appended by AGENT_SUBSTEP). */
  substeps?: RunSessionSubstep[];
}

// Re-export so panel components don't need a second import path.
export type { AgentPersonaEvent };

export interface RunSessionEdge {
  from: string;
  to: string;
  status: 'active' | 'pending';
}

export interface RunSessionStep {
  name: string;
  // Stream B / S0.3 — added 'failed' so StepList can render a red dot + retry
  // affordance. Existing producers (server `assemble` event) still only emit
  // pending|running|done, so this is additive and back-compat.
  status: 'pending' | 'running' | 'done' | 'failed';
  elapsed?: string;
}

export type RunSessionPanel = 'canvas' | 'preview';
export type ArtifactType = 'yaml' | 'html' | 'markdown';

/**
 * 2026-05-16 — error-banner classification.
 *
 * The daemon classifies every SSE `error` event into one of these 6 buckets
 * (see server/src/lib/classify-error.ts). The RunSessionPage banner forks on
 * `code` to pick a title + CTA (e.g. auth → "配置 API Key", rate_limit →
 * "稍后重试" countdown). 'unknown' is the explicit fallback; callers must
 * still surface the message even when the classifier can't pick a bucket.
 */
export type ErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'context_too_long'
  | 'network'
  | 'server'
  | 'unknown';

export interface SessionError {
  code: ErrorCode;
  message: string;
  /** Optional inline hint shown under the message (smaller font). */
  hint?: string;
  /**
   * Number of consecutive error events received for this session. The banner
   * suffixes the message with "（已重试 N 次）" once this exceeds 1 so 5x
   * retries no longer stack the same red text 5 times.
   */
  occurrences: number;
}

/**
 * Phase 2 (A4/CL8) — per-DAG-node chunk buffer.
 *
 * When the backend scheduler runs a parallel DAG (workflow/scheduler.ts), the
 * `text` / `thinking-chunk` / `assemble` / `question-form` SSE events carry
 * an optional `node_id` identifying which agent emitted them. Without
 * per-node buffering the chunks from parallel agents would interleave into
 * one global chatReply string and become unreadable.
 *
 * useRunSession maintains a `perNodeChunks: Record<node_id, NodeChunkBuffer>`
 * so AgentDetail panels can subscribe via getNodeChunks(nodeId) and render
 * each agent's stream in its own panel. Events WITHOUT node_id continue to
 * flow into the global `chatReply` / `thinkingStream` / `steps` /
 * `pendingQuestionForm` slots (full backward compatibility — every existing
 * single-agent skill keeps working).
 */
export interface NodeChunkBuffer {
  /** Concatenated `text` deltas for this node — drives the per-agent reply bubble. */
  text: string;
  /** Reasoning rows from `<sf:thinking>` blocks scoped to this node. */
  thinking: Array<{ ts: string; step: string | null; text: string }>;
  /** Per-node step list driven by `<sf:step>` events (status + elapsed). */
  steps: RunSessionStep[];
  /** Per-node substep timeline (mirror of nodes[i].substeps for convenience). */
  substeps: RunSessionSubstep[];
  /** Pending clarify form for this node, if any. */
  pendingQuestionForm: { id: string; title: string; body: unknown } | null;
}

export interface RunSessionState {
  outputType: string | null;
  mode: string | null;
  confidence: number;
  steps: RunSessionStep[];
  nodes: RunSessionNode[];
  edges: RunSessionEdge[];
  blueprintFile: string | null;
  blueprintYaml: string | null;
  // Story 15.3: artifact preview (RunSessionPage right panel switches to iframe / pre)
  artifactUrl: string | null;
  artifactType: ArtifactType;
  activePanel: RunSessionPanel;
  tokenCount: number;
  isComplete: boolean;
  redirectUrl: string | null;
  thinkingMessage: string | null;
  // 2026-05-19 — real LLM reasoning stream, accumulated from <sf:thinking>
  // SSE 'thinking-chunk' events. Each entry preserves its own timestamp
  // and originating step header so ThinkCard can render the design-spec
  // "3 行带时间戳的 reasoning 流" instead of a single timestamp + blob.
  thinkingStream: Array<{ ts: string; step: string | null; text: string }>;
  rationaleCards: Array<{ title: string; body: string; duration_ms?: number }>;
  yamlLines: string[];
  activeSubsteps: Array<{ parent_step: string; name: string; elapsed_ms?: number }>;
  error: SessionError | null;
  retrying: boolean;
  retryAttempt: number;
  retryDelayMs: number;
  // Story 15.14 — critique pass result + progress.
  critiqueResult: CritiqueResultEvent | null;
  critiqueProgress: CritiqueProgressEvent | null;
  // 2026-05-11 Layer 1 — accumulated plain-text reply from the LLM. When the
  // LLM decides the goal is trivial (e.g. "hi") it streams natural language
  // here instead of <sf:*> tags, and RunSessionPage renders a chat bubble.
  chatReply: string;
  // Stream B / S2.4 — per-step artifacts indexed by step_index. Populated by
  // SSE 'step-artifact' events as steps finish; StepArtifactDrawer reads
  // synchronously to avoid a REST round-trip on open. Drawer falls back to
  // GET /steps/:n if the cached entry is missing (page reload mid-session).
  stepArtifacts: Record<number, StepArtifact>;
  /**
   * 2026-05-20 (S6.5) — currently-running substep ({node_id, name}) used by
   * useFollowMode to anchor-scroll the right pane to the matching section.
   * null when no substep is running.
   */
  activeAgentSubstep: { node_id: string; name: AgentSubstepName } | null;
  /**
   * S12 — pending `<sf:question-form>` block from the LLM. When non-null,
   * RunSessionPage renders QuestionFormModal. Cleared when the user submits
   * (handled by parent: POST follow-up message + reducer dispatches CLEAR).
   */
  pendingQuestionForm: { id: string; title: string; body: unknown } | null;
  /**
   * S6.10-B — typed TimelineMessage stream. Single ordered array driving the
   * new left-pane Timeline component. SSE `message` events append; SSE
   * `message-patch` events mutate by id (see applyPatch in
   * src/components/run-session/timeline/types.ts).
   *
   * Coexists with legacy slot-state (nodes / edges / steps / yamlLines /
   * thinkingStream / …) during the S6.10 transition. Glue Story #37 will
   * eventually retire the legacy slots; for now everything stays.
   */
  messages: TimelineMessage[];
  /**
   * Phase 2 (A4/CL8) — per-node chunk buffers keyed by node_id. Populated
   * only when the corresponding SSE event carries a `node_id` field
   * (DAG-scheduled multi-agent runs). Legacy events without `node_id`
   * route to the global chatReply / steps / thinkingStream / etc., so the
   * existing single-agent UI is byte-equivalent to before.
   *
   * Consume via the public `getNodeChunks(nodeId)` API exposed on the
   * useRunSession() return value — never read this map directly so the
   * helper can supply an empty-buffer default for nodes that haven't
   * produced a chunk yet (avoids null-checks at every call site).
   */
  perNodeChunks: Record<string, NodeChunkBuffer>;
}

// 2026-05-11 UX fix — steps are now driven entirely by `<sf:step>` events
// from the assembler (each skill / executor can emit its own step labels).
// Previously hard-coded 6 zh-CN labels for agent-team-blueprint shown as
// placeholder "pending" rows before any work started, leaking the
// implementation detail (which skill / how many steps) before the LLM
// returned anything. Now the panel shows "等待开始…" until the first
// running step arrives, then appends each step as it appears.
const INITIAL_STEPS: RunSessionStep[] = [];

// Phase 2 (A4/CL8) — payload types extended with optional node_id so the
// reducer can pivot between per-node buffers and the global stream. These
// shapes are runtime-compatible with the original ClassifyEvent /
// AssembleEvent / TextEvent / AgentPersonaEvent (extra optional field).

type Action =
  | { type: 'CLASSIFY'; payload: ClassifyEvent }
  | { type: 'ASSEMBLE'; payload: AssembleEvent }
  | { type: 'NODE'; payload: NodeEvent }
  | { type: 'EDGE'; payload: EdgeEvent }
  | { type: 'BLUEPRINT'; payload: BlueprintEvent }
  | { type: 'COMPLETE'; payload: CompleteEvent }
  | { type: 'RATIONALE'; payload: RationaleEvent }
  | { type: 'YAML_LINE'; payload: YamlLineEvent }
  | { type: 'SUBSTEP'; payload: SubstepEvent }
  | { type: 'ERROR'; message: string; code?: string; hint?: string }
  | { type: 'RETRYING'; attempt: number; delayMs: number }
  | { type: 'CRITIQUE_PROGRESS'; payload: CritiqueProgressEvent }
  | { type: 'CRITIQUE_RESULT'; payload: CritiqueResultEvent }
  | { type: 'TEXT'; payload: TextEvent }
  | { type: 'AGENT_PERSONA'; payload: AgentPersonaEvent }
  | { type: 'THINKING_CHUNK'; payload: { step: string | null; text: string; node_id?: string } }
  | { type: 'STEP_ARTIFACT'; payload: StepArtifactEvent }
  | {
      type: 'AGENT_SUBSTEP';
      payload: {
        node_id: string;
        substep: string;
        status: 'running' | 'done' | 'failed';
        elapsed_ms: number | null;
        source?: string;
        tokens?: number;
        cached?: boolean;
      };
    }
  | { type: 'QUESTION_FORM'; payload: { id: string; title: string; body: unknown; node_id?: string } }
  | { type: 'QUESTION_FORM_CLEAR' }
  // S6.10-B — TimelineMessage stream events. MESSAGE appends; MESSAGE_PATCH
  // mutates by id via the pure applyPatch helper.
  | { type: 'MESSAGE'; payload: TimelineMessage }
  | { type: 'MESSAGE_PATCH'; payload: MessagePatch }
  // 2026-05-16 — user pressed Stop. Mark stream terminated locally and
  // append "（用户已停止）" to the chat reply so the UI shows a clear marker
  // even if the LLM was mid-sentence.
  | { type: 'ABORT' };

/**
 * Phase 2 (A4/CL8) — produce a fresh per-node buffer. Kept separate from the
 * reducer body so node-aware action handlers can call it inline without
 * repeating field defaults.
 */
function emptyNodeBuffer(): NodeChunkBuffer {
  return {
    text: '',
    thinking: [],
    steps: [],
    substeps: [],
    pendingQuestionForm: null,
  };
}

/**
 * Phase 2 (A4/CL8) — immutably patch the per-node buffer for `nodeId` using
 * a transform function. Returns a NEW perNodeChunks object so React re-renders
 * the consumer panel. When `nodeId` is falsy (legacy events without a DAG
 * scheduler) the caller MUST NOT invoke this helper — they should fall
 * through to the global-stream branch instead.
 */
function patchNodeBuffer(
  perNodeChunks: Record<string, NodeChunkBuffer>,
  nodeId: string,
  transform: (buf: NodeChunkBuffer) => NodeChunkBuffer,
): Record<string, NodeChunkBuffer> {
  const existing = perNodeChunks[nodeId] ?? emptyNodeBuffer();
  return { ...perNodeChunks, [nodeId]: transform(existing) };
}

function reducer(state: RunSessionState, action: Action): RunSessionState {
  switch (action.type) {
    case 'CLASSIFY':
      return { ...state, outputType: action.payload.output_type, mode: action.payload.mode, confidence: action.payload.confidence };
    case 'ASSEMBLE': {
      const { step, status, elapsed_ms, node_id } = action.payload;
      // 2026-05-11 UX fix — append step if first time seen, otherwise update
      // in place. Eliminates the "6 pending placeholders" pre-render. Each
      // step now appears only when the assembler announces it.
      const elapsedFmt = elapsed_ms ? `${(elapsed_ms / 1000).toFixed(1)}s` : undefined;
      const mergeStep = (list: RunSessionStep[]): RunSessionStep[] => {
        const idx = list.findIndex(s => s.name === step);
        return idx === -1
          ? [...list, { name: step, status, elapsed: elapsedFmt }]
          : list.map((s, i) =>
              i === idx
                ? { ...s, status, elapsed: elapsedFmt ?? s.elapsed }
                : s,
            );
      };
      const steps = mergeStep(state.steps);
      const thinking = status === 'running' ? `正在执行：${step}…` : null;
      // Phase 2 (A4/CL8) — mirror into per-node buffer when the DAG
      // scheduler scoped this step to a node. We still update the global
      // `steps` slot so legacy renderers (StepList / Timeline) keep their
      // unified view; perNodeChunks just gives parallel AgentDetail panels
      // their own slice.
      const perNodeChunks = node_id
        ? patchNodeBuffer(state.perNodeChunks, node_id, (buf) => ({
            ...buf,
            steps: mergeStep(buf.steps),
          }))
        : state.perNodeChunks;
      return { ...state, steps, thinkingMessage: thinking, perNodeChunks };
    }
    case 'NODE': {
      const p = action.payload as NodeEvent & {
        skill_ref?: string;
        temperature?: number;
        max_tokens?: number;
        context_window?: number;
        io_input?: unknown;
        io_output?: unknown;
      };
      const { node_id, type, title, sub, chips, status, avatar_char, model, memory, tools_picked, tools_candidate, persona } = p;
      const avatarChar = avatar_char ?? title.charAt(0);
      const existing = state.nodes.findIndex(n => n.id === node_id);
      // 2026-05-18 agent-B — preserve any persona / S6.5 provenance / substeps
      // already merged via earlier AGENT_PERSONA or AGENT_SUBSTEP events
      // (server emits these in any order).
      const prev = existing >= 0 ? state.nodes[existing] : undefined;
      const node: RunSessionNode = {
        id: node_id, type, title, sub, chips, status, avatarChar,
        model, memory,
        toolsPicked: tools_picked,
        toolsCandidate: tools_candidate,
        persona: persona ?? prev?.persona,
        // S6.5 — v3 stacked extras
        skillRef: p.skill_ref ?? prev?.skillRef,
        personaSource: prev?.personaSource,
        personaTokens: prev?.personaTokens,
        personaCached: prev?.personaCached,
        temperature: p.temperature ?? prev?.temperature,
        maxTokens: p.max_tokens ?? prev?.maxTokens,
        contextWindow: p.context_window ?? prev?.contextWindow,
        ioInput: p.io_input ?? prev?.ioInput,
        ioOutput: p.io_output ?? prev?.ioOutput,
        substeps: prev?.substeps,
      };
      const nodes = existing >= 0
        ? state.nodes.map((n, i) => i === existing ? node : n)
        : [...state.nodes, node];
      return { ...state, nodes };
    }
    case 'AGENT_PERSONA': {
      // 2026-05-18 agent-B — multi-line persona arrived for an agent node.
      // Merge by node_id. If the node hasn't been seen yet (persona arrived
      // first), stash a placeholder node so the persona isn't lost — it will
      // be fleshed out when the matching NODE event arrives. The placeholder
      // uses minimal data (title=id) so any premature render shows the id
      // rather than blank fields.
      // 2026-05-20 (S6.5) — also captures source / tokens / cached so the
      // v3 stacked PERSONA section can display "from <skill>.yaml#persona NNN
      // tokens · cached".
      const p = action.payload as AgentPersonaEvent & { source?: string; tokens?: number; cached?: boolean };
      const { node_id, persona } = p;
      const idx = state.nodes.findIndex(n => n.id === node_id);
      if (idx === -1) {
        const placeholder: RunSessionNode = {
          id: node_id, type: 'agent', title: node_id, sub: '', chips: [],
          status: 'building', avatarChar: node_id.charAt(0) || '?',
          persona,
          personaSource: p.source,
          personaTokens: p.tokens,
          personaCached: p.cached,
        };
        return { ...state, nodes: [...state.nodes, placeholder] };
      }
      return {
        ...state,
        nodes: state.nodes.map((n, i) => i === idx ? {
          ...n,
          persona,
          personaSource: p.source ?? n.personaSource,
          personaTokens: p.tokens ?? n.personaTokens,
          personaCached: p.cached ?? n.personaCached,
        } : n),
      };
    }
    case 'AGENT_SUBSTEP': {
      // S6.5 — push a substep entry onto the matching node. On 'running' the
      // entry is appended and activeAgentSubstep flips to it (drives anchor
      // follow). On 'done'/'failed' we update the existing entry in place
      // and clear activeAgentSubstep iff it's the one that just finished.
      const p = action.payload;
      const subName = p.substep as AgentSubstepName;
      const nodeIdx = state.nodes.findIndex(n => n.id === p.node_id);
      const nextActive: RunSessionState['activeAgentSubstep'] =
        p.status === 'running'
          ? { node_id: p.node_id, name: subName }
          : state.activeAgentSubstep && state.activeAgentSubstep.node_id === p.node_id && state.activeAgentSubstep.name === subName
            ? null
            : state.activeAgentSubstep;
      const newEntry: RunSessionSubstep = {
        name: subName,
        status: p.status,
        elapsedMs: p.elapsed_ms,
        source: p.source,
        tokens: p.tokens,
        cached: p.cached,
        startedAt: Date.now(),
      };
      // Phase 2 (A4/CL8) — also mirror substeps onto the per-node buffer so
      // a future AgentDetail panel subscribing via getNodeChunks(node_id) can
      // render the substep list without traversing the full nodes[] array.
      // Implementation: reuse the same merge logic on buf.substeps.
      const mirrorIntoBuffer = (
        existingSubsteps: RunSessionSubstep[],
      ): RunSessionSubstep[] => {
        const subIdx = existingSubsteps.findIndex((s) => s.name === subName);
        return subIdx === -1
          ? [...existingSubsteps, newEntry]
          : existingSubsteps.map((s, i) =>
              i === subIdx ? { ...s, ...newEntry, startedAt: s.startedAt } : s,
            );
      };
      const perNodeChunks = p.node_id
        ? patchNodeBuffer(state.perNodeChunks, p.node_id, (buf) => ({
            ...buf,
            substeps: mirrorIntoBuffer(buf.substeps),
          }))
        : state.perNodeChunks;

      // Node not yet seen — stash a placeholder carrying just this substep.
      if (nodeIdx === -1) {
        const placeholder: RunSessionNode = {
          id: p.node_id, type: 'agent', title: p.node_id, sub: '', chips: [],
          status: 'building', avatarChar: p.node_id.charAt(0) || '?',
          substeps: [newEntry],
        };
        return {
          ...state,
          nodes: [...state.nodes, placeholder],
          activeAgentSubstep: nextActive,
          perNodeChunks,
        };
      }
      const existing = state.nodes[nodeIdx];
      const existingSubsteps = existing.substeps ?? [];
      // Same-substep duplicate (running → done): replace in place; otherwise append.
      const mergedSubsteps = mirrorIntoBuffer(existingSubsteps);
      return {
        ...state,
        nodes: state.nodes.map((n, i) => (i === nodeIdx ? { ...n, substeps: mergedSubsteps } : n)),
        activeAgentSubstep: nextActive,
        perNodeChunks,
      };
    }
    case 'QUESTION_FORM': {
      // S12 — LLM emit `<sf:question-form>`. Modal will block UI until
      // the user submits answers (POSTed as a follow-up message in the
      // /messages endpoint, which kicks off a new run-session inheriting
      // this conversation_id).
      //
      // Phase 2 (A4/CL8) — also stash on the per-node buffer when scoped to
      // a DAG node, so individual AgentDetail panels can display
      // "waiting on clarification" without consulting the global modal.
      // The global pendingQuestionForm slot is still set so RunSessionPage's
      // single modal continues to render — node-aware UI is an enhancement
      // layered on top, not a replacement.
      const payload = action.payload;
      // Reducer payload type already includes optional node_id (Phase 2).
      const { node_id, ...form } = payload;
      const perNodeChunks = node_id
        ? patchNodeBuffer(state.perNodeChunks, node_id, (buf) => ({
            ...buf,
            pendingQuestionForm: form,
          }))
        : state.perNodeChunks;
      return { ...state, pendingQuestionForm: form, perNodeChunks };
    }
    case 'QUESTION_FORM_CLEAR': {
      // Clear both the global modal and every per-node copy — the user has
      // answered the active question so all panels should stop showing the
      // "waiting on clarification" hint.
      const perNodeChunks = Object.fromEntries(
        Object.entries(state.perNodeChunks).map(([id, buf]) => [
          id,
          { ...buf, pendingQuestionForm: null },
        ]),
      );
      return { ...state, pendingQuestionForm: null, perNodeChunks };
    }
    case 'STEP_ARTIFACT': {
      // Stream B / S2.4 — server pushed a step's persisted output. Merge by
      // step_index. step_name + status default to whatever the matching
      // RunSessionStep already has (or empty / 'done' if we haven't seen
      // the corresponding `assemble` event yet — order isn't guaranteed).
      const ev = action.payload;
      const matchingStep = state.steps[ev.step_index];
      const merged: StepArtifact = {
        session_id: '',
        step_index: ev.step_index,
        step_name: ev.step_name ?? matchingStep?.name ?? `step-${ev.step_index}`,
        output_kind: ev.output_kind,
        payload: ev.payload,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        status: ev.status ?? 'done',
      };
      return {
        ...state,
        stepArtifacts: { ...state.stepArtifacts, [ev.step_index]: merged },
      };
    }
    case 'THINKING_CHUNK': {
      // 2026-05-19 — append a timestamped reasoning entry. Each <sf:thinking>
      // block becomes one row in ThinkCard expanded view (设计点 6 要求"3
      // 行带时间戳的 reasoning 流"). step attribute preserved as section
      // header per row.
      const { step, text, node_id } = action.payload;
      if (!text) return state;
      const d = new Date();
      const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      const entry = { ts, step, text };
      // Phase 2 (A4/CL8) — DAG-scoped thinking goes into the per-node buffer
      // so parallel agents don't pollute each other's reasoning log. The
      // global thinkingStream stays populated for the unified ThinkCard
      // panel (chronological merge of all agents' thoughts).
      const perNodeChunks = node_id
        ? patchNodeBuffer(state.perNodeChunks, node_id, (buf) => ({
            ...buf,
            thinking: [...buf.thinking, entry],
          }))
        : state.perNodeChunks;
      return {
        ...state,
        thinkingStream: [...state.thinkingStream, entry],
        perNodeChunks,
      };
    }
    case 'EDGE': {
      const edges = [...state.edges.filter(e => !(e.from === action.payload.from && e.to === action.payload.to)), action.payload];
      return { ...state, edges };
    }
    case 'BLUEPRINT':
      return {
        ...state,
        blueprintFile: action.payload.filename,
        blueprintYaml: action.payload.yaml,
        // Story 15.3: store artifact pointer + auto-switch right panel to preview.
        // artifact_type defaults to 'yaml' when backend omits it (legacy events).
        artifactUrl: action.payload.artifact_url ?? state.artifactUrl,
        artifactType: action.payload.artifact_type ?? state.artifactType,
        activePanel: action.payload.artifact_url ? 'preview' : state.activePanel,
      };
    case 'COMPLETE':
      return { ...state, isComplete: true, redirectUrl: action.payload.redirect ?? null, thinkingMessage: null };
    case 'RATIONALE':
      return { ...state, rationaleCards: [...state.rationaleCards, action.payload] };
    case 'YAML_LINE':
      return {
        ...state,
        yamlLines: [...state.yamlLines, action.payload.line],
        tokenCount: state.tokenCount + Math.ceil(action.payload.line.length / 4),
      };
    case 'SUBSTEP':
      return {
        ...state,
        activeSubsteps: [
          ...state.activeSubsteps.filter(s => s.parent_step !== action.payload.parent_step),
          action.payload,
        ],
      };
    case 'ERROR': {
      // Prefer server-classified code (`subscribeRunSession` forwards it via
      // onServerError); fall back to client-side regex sweep on the message
      // when the server didn't send a recognized bucket. Increments
      // `occurrences` so repeated retries show "（已重试 N 次）" instead of
      // stacking the same banner — see RunSessionPage banner suffix.
      const code = isErrorCode(action.code) ? action.code : classifyClientError(action.message);
      const prev = state.error;
      const next = {
        code,
        message: action.message,
        hint: action.hint,
        occurrences: prev ? prev.occurrences + 1 : 1,
      };
      return { ...state, error: next, retrying: false, thinkingMessage: null };
    }
    case 'RETRYING':
      return { ...state, retrying: true, retryAttempt: action.attempt, retryDelayMs: action.delayMs, error: null };
    case 'CRITIQUE_PROGRESS':
      return { ...state, critiqueProgress: action.payload };
    case 'CRITIQUE_RESULT':
      return { ...state, critiqueResult: action.payload, critiqueProgress: null };
    case 'TEXT': {
      // Phase 2 (A4/CL8) — when the chunk came from a DAG-scheduled node,
      // route the text-delta into per-node buffer instead of the global
      // chatReply. Without this, parallel agents would interleave into one
      // unreadable bubble. Token count + thinkingMessage clear stay global
      // so the header indicator still tracks total throughput.
      const { text, node_id } = action.payload;
      const tokenCount = state.tokenCount + Math.ceil(text.length / 4);
      if (node_id) {
        const perNodeChunks = patchNodeBuffer(state.perNodeChunks, node_id, (buf) => ({
          ...buf,
          text: buf.text + text,
        }));
        return { ...state, perNodeChunks, thinkingMessage: null, tokenCount };
      }
      return {
        ...state,
        chatReply: state.chatReply + text,
        thinkingMessage: null,
        tokenCount,
      };
    }
    case 'MESSAGE': {
      // S6.10-B — append a new TimelineMessage. Idempotent on id (re-delivery
      // during reconnect: if the same id already exists we overwrite it in
      // place rather than appending a dupe). Server emits monotonically; this
      // is just a defensive guard.
      const incoming = action.payload;
      const existingIdx = state.messages.findIndex((m) => m.id === incoming.id);
      if (existingIdx >= 0) {
        return {
          ...state,
          messages: state.messages.map((m, i) =>
            i === existingIdx ? incoming : m,
          ),
        };
      }
      return { ...state, messages: [...state.messages, incoming] };
    }
    case 'MESSAGE_PATCH': {
      // S6.10-B — mutate the matching message by id via applyPatch. If no
      // match (out-of-order delivery, possible during reconnect), we drop
      // the patch silently — the server will resend the full message later.
      const patch = action.payload;
      const idx = state.messages.findIndex((m) => m.id === patch.id);
      if (idx === -1) return state;
      return {
        ...state,
        messages: state.messages.map((m, i) =>
          i === idx ? applyPatch(m, patch) : m,
        ),
      };
    }
    case 'ABORT': {
      // Avoid appending the marker twice if the user clicks Stop twice in
      // quick succession before isStreaming flips.
      const marker = '（用户已停止）';
      const suffix = state.chatReply.endsWith(marker)
        ? ''
        : (state.chatReply.length > 0 && !state.chatReply.endsWith('\n') ? '\n' : '') + marker;
      return {
        ...state,
        isComplete: true,
        thinkingMessage: null,
        retrying: false,
        chatReply: state.chatReply + suffix,
      };
    }
    default:
      return state;
  }
}

// Public return shape — state fields plus stream controls. Existing call
// sites destructure `session.xxx`, so all RunSessionState fields stay on
// the top level for back-compat.
export interface UseRunSessionReturn extends RunSessionState {
  /**
   * True iff the SSE connection is active and the session has not yet
   * completed (no `complete` event, no error, no user abort). Used by the
   * input composer to swap Send → Stop.
   */
  isStreaming: boolean;
  /**
   * S12 — dismiss the pendingQuestionForm modal. Called by RunSessionPage
   * after the user submits answers (POST follow-up message + navigate).
   */
  dispatchClearQuestionForm: () => void;
  /**
   * Tear down the local EventSource immediately, dispatch ABORT to mark
   * `isComplete=true` + append "（用户已停止）" to chatReply, and fire a
   * best-effort POST /api/run-sessions/:id/abort so the server can drop
   * its session record + cancel the upstream LLM call.
   */
  abort: () => void;
  /**
   * Phase 2 (A4/CL8) — return the per-node chunk buffer for `nodeId`.
   *
   * AgentDetail / parallel panels subscribe via this helper. Always returns
   * a stable empty buffer when the node hasn't produced anything yet so
   * callers can render skeleton state without null-checks. The returned
   * object is the same reference React saw on the last reducer transition,
   * so naive `prev === next` comparisons in useEffect deps work — but
   * components that derive cheaper state from the buffer should still
   * memoize since text/thinking arrays grow over time.
   */
  getNodeChunks: (nodeId: string) => NodeChunkBuffer;
}

export function useRunSession(sessionId: string): UseRunSessionReturn {
  const [state, dispatch] = useReducer(reducer, {
    outputType: null, mode: null, confidence: 0,
    steps: INITIAL_STEPS, nodes: [], edges: [],
    blueprintFile: null, blueprintYaml: null,
    artifactUrl: null, artifactType: 'yaml', activePanel: 'canvas',
    tokenCount: 0, isComplete: false, redirectUrl: null, thinkingMessage: null,
    thinkingStream: [],
    rationaleCards: [], yamlLines: [], activeSubsteps: [],
    error: null, retrying: false, retryAttempt: 0, retryDelayMs: 0,
    critiqueResult: null, critiqueProgress: null,
    chatReply: '',
    stepArtifacts: {},
    activeAgentSubstep: null,
    pendingQuestionForm: null,
    messages: [],
    perNodeChunks: {},
  });

  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cleanup fn returned by subscribeRunSession — calling it tears down the
  // EventSource. Held in a ref so `abort()` can invoke it imperatively
  // without re-running the subscribe effect.
  const cleanupRef = useRef<(() => void) | null>(null);
  // Tracks whether the underlying EventSource is still alive. Flips false
  // on cleanup, abort, complete, error, or server error. Combined with
  // !isComplete to form the public `isStreaming` flag.
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setConnected(true);
    const cleanup = subscribeRunSession(sessionId, {
      onClassify:  (d) => dispatch({ type: 'CLASSIFY', payload: d }),
      onAssemble:  (d) => dispatch({ type: 'ASSEMBLE', payload: d }),
      onNode:      (d) => dispatch({ type: 'NODE', payload: d }),
      onEdge:      (d) => dispatch({ type: 'EDGE', payload: d }),
      onBlueprint: (d) => dispatch({ type: 'BLUEPRINT', payload: d }),
      onComplete:  (d) => { dispatch({ type: 'COMPLETE', payload: d }); setConnected(false); },
      onRationale: (d) => dispatch({ type: 'RATIONALE', payload: d }),
      onYamlLine:  (d) => dispatch({ type: 'YAML_LINE', payload: d }),
      onSubstep:   (d) => dispatch({ type: 'SUBSTEP', payload: d }),
      onCritiqueProgress: (d) => dispatch({ type: 'CRITIQUE_PROGRESS', payload: d }),
      onCritiqueResult:   (d) => dispatch({ type: 'CRITIQUE_RESULT', payload: d }),
      onText:          (d) => dispatch({ type: 'TEXT', payload: d }),
      onAgentPersona:  (d) => dispatch({ type: 'AGENT_PERSONA', payload: d }),
      onThinkingChunk: (d) => dispatch({ type: 'THINKING_CHUNK', payload: d }),
      // Stream B / S2.4 — server pushed a step's persisted output. Mirror into
      // state.stepArtifacts so the drawer can render immediately on open.
      onStepArtifact:  (d) => dispatch({ type: 'STEP_ARTIFACT', payload: d }),
      // S6.5 — granular substep frame from synthesizeTeamRun / future LLM emits.
      onAgentSubstep:  (d) => dispatch({ type: 'AGENT_SUBSTEP', payload: d }),
      // S12 — LLM emit `<sf:question-form>` for clarification.
      onQuestionForm:  (d) => dispatch({ type: 'QUESTION_FORM', payload: d }),
      // S6.10-B — Trae-style timeline message stream. MESSAGE appends; the
      // reducer keeps existing legacy slot state intact so both renderers
      // coexist during the transition.
      onMessage:       (d) => dispatch({ type: 'MESSAGE', payload: d }),
      onMessagePatch:  (d) => dispatch({ type: 'MESSAGE_PATCH', payload: d }),
      onRetrying:      (attempt, delayMs) => dispatch({ type: 'RETRYING', attempt, delayMs }),
      // EventSource gave up retrying — pure network bucket so the UI can
      // surface a "重发" CTA instead of "配置 API Key". setConnected(false)
      // flips session.isStreaming off so the composer reverts Stop → Send.
      onError:         () => { dispatch({ type: 'ERROR', message: 'SSE 连接失败，已达最大重试次数', code: 'network' }); setConnected(false); },
      // Server-classified events: subscribeRunSession parses `data.code` and
      // forwards it here. We pass it through as-is; reducer falls back to
      // client-side regex when the server omits / mis-codes the bucket.
      onServerError:   (message, code) => { dispatch({ type: 'ERROR', message, code }); setConnected(false); },
    });
    cleanupRef.current = cleanup;
    return () => {
      cleanup();
      cleanupRef.current = null;
      setConnected(false);
    };
  }, [sessionId]);

  // 15 分钟 watchdog — session 超时自动标 error
  // Phase 2 (2026-05-22): 从 3min 提升到 15min。BMAD 等多 agent DAG
  // workflow 端到端要跑 5-10min，3min 会截断 multi-agent 阶段（见
  // docs/architecture/phase-2-e2e-report.md P1-01）。
  useEffect(() => {
    if (!sessionId) return;
    watchdogRef.current = setTimeout(() => {
      // Watchdog timeout — server stalled, classify as network-bucket so the
      // banner CTA is "重发" rather than "配置 API Key".
      dispatch({ type: 'ERROR', message: 'Session 超时（15 分钟），请重试', code: 'network' });
    }, 15 * 60 * 1000);
    return () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, [sessionId]);

  // 当 complete 时清除 watchdog
  useEffect(() => {
    if (state.isComplete) {
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    }
  }, [state.isComplete]);

  const abort = useCallback(() => {
    // Idempotent: subsequent clicks after isComplete=true are no-ops at the
    // reducer level (ABORT just re-marks isComplete=true and the marker is
    // de-duplicated by suffix check). Still tear down EventSource and fire
    // the daemon POST defensively.
    cleanupRef.current?.();
    cleanupRef.current = null;
    setConnected(false);
    dispatch({ type: 'ABORT' });
    if (sessionId) {
      // Best-effort — daemon may not have the route or may have already
      // dropped the session. Errors are swallowed so the UX stays smooth.
      abortRunSession(sessionId).catch((err) => {
        console.warn('[useRunSession] daemon abort POST failed (non-fatal):', err);
      });
    }
  }, [sessionId]);

  const isStreaming = connected && !state.isComplete && state.error == null;

  // S12 — expose a callback so RunSessionPage can dismiss the
  // pendingQuestionForm modal after submission.
  const dispatchClearQuestionForm = useCallback(() => {
    dispatch({ type: 'QUESTION_FORM_CLEAR' });
  }, []);

  // Phase 2 (A4/CL8) — stable empty-buffer fallback so callers don't get
  // a fresh object identity every render for nodes the backend hasn't
  // emitted into yet. Defined inside the hook so it closes over the
  // current perNodeChunks via state, but the fallback itself is hoisted
  // to module scope (EMPTY_BUFFER) for referential stability.
  const getNodeChunks = useCallback(
    (nodeId: string): NodeChunkBuffer => state.perNodeChunks[nodeId] ?? EMPTY_BUFFER,
    [state.perNodeChunks],
  );

  return { ...state, isStreaming, abort, dispatchClearQuestionForm, getNodeChunks };
}

/**
 * Phase 2 (A4/CL8) — referentially-stable empty per-node buffer for
 * `getNodeChunks` when the requested nodeId has no data yet. Hoisted to
 * module scope so the same `{}` reference is returned every call — lets
 * downstream useEffect / useMemo deps stay stable until the node actually
 * produces a chunk.
 */
const EMPTY_BUFFER: NodeChunkBuffer = Object.freeze({
  text: '',
  thinking: [],
  steps: [],
  substeps: [],
  pendingQuestionForm: null,
}) as NodeChunkBuffer;
