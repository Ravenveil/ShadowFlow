import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { subscribeRunSession, abortRunSession } from '../../api/runSessions';
import type { ClassifyEvent, AssembleEvent, NodeEvent, EdgeEvent, BlueprintEvent, CompleteEvent, RationaleEvent, YamlLineEvent, SubstepEvent, CritiqueResultEvent, CritiqueProgressEvent, TextEvent, AgentPersonaEvent } from '../../api/runSessions';
import { classifyClientError, isErrorCode } from '../errors/classifyError';

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
  status: 'pending' | 'running' | 'done';
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
}

// 2026-05-11 UX fix — steps are now driven entirely by `<sf:step>` events
// from the assembler (each skill / executor can emit its own step labels).
// Previously hard-coded 6 zh-CN labels for agent-team-blueprint shown as
// placeholder "pending" rows before any work started, leaking the
// implementation detail (which skill / how many steps) before the LLM
// returned anything. Now the panel shows "等待开始…" until the first
// running step arrives, then appends each step as it appears.
const INITIAL_STEPS: RunSessionStep[] = [];

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
  // 2026-05-16 — user pressed Stop. Mark stream terminated locally and
  // append "（用户已停止）" to the chat reply so the UI shows a clear marker
  // even if the LLM was mid-sentence.
  | { type: 'ABORT' };

function reducer(state: RunSessionState, action: Action): RunSessionState {
  switch (action.type) {
    case 'CLASSIFY':
      return { ...state, outputType: action.payload.output_type, mode: action.payload.mode, confidence: action.payload.confidence };
    case 'ASSEMBLE': {
      const { step, status, elapsed_ms } = action.payload;
      // 2026-05-11 UX fix — append step if first time seen, otherwise update
      // in place. Eliminates the "6 pending placeholders" pre-render. Each
      // step now appears only when the assembler announces it.
      const elapsedFmt = elapsed_ms ? `${(elapsed_ms / 1000).toFixed(1)}s` : undefined;
      const existingIdx = state.steps.findIndex(s => s.name === step);
      const steps: RunSessionStep[] = existingIdx === -1
        ? [...state.steps, { name: step, status, elapsed: elapsedFmt }]
        : state.steps.map((s, i) =>
            i === existingIdx
              ? { ...s, status, elapsed: elapsedFmt ?? s.elapsed }
              : s,
          );
      const thinking = status === 'running' ? `正在执行：${step}…` : null;
      return { ...state, steps, thinkingMessage: thinking };
    }
    case 'NODE': {
      const { node_id, type, title, sub, chips, status, avatar_char, model, memory, tools_picked, tools_candidate, persona } = action.payload;
      const avatarChar = avatar_char ?? title.charAt(0);
      const existing = state.nodes.findIndex(n => n.id === node_id);
      // 2026-05-18 agent-B — preserve any persona already merged via an earlier
      // AGENT_PERSONA event (server emits node + persona in any order).
      const prevPersona = existing >= 0 ? state.nodes[existing].persona : undefined;
      const node: RunSessionNode = {
        id: node_id, type, title, sub, chips, status, avatarChar,
        model, memory,
        toolsPicked: tools_picked,
        toolsCandidate: tools_candidate,
        persona: persona ?? prevPersona,
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
      const { node_id, persona } = action.payload;
      const idx = state.nodes.findIndex(n => n.id === node_id);
      if (idx === -1) {
        const placeholder: RunSessionNode = {
          id: node_id, type: 'agent', title: node_id, sub: '', chips: [],
          status: 'building', avatarChar: node_id.charAt(0) || '?',
          persona,
        };
        return { ...state, nodes: [...state.nodes, placeholder] };
      }
      return {
        ...state,
        nodes: state.nodes.map((n, i) => i === idx ? { ...n, persona } : n),
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
    case 'TEXT':
      return {
        ...state,
        chatReply: state.chatReply + action.payload.text,
        thinkingMessage: null,
        tokenCount: state.tokenCount + Math.ceil(action.payload.text.length / 4),
      };
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
   * Tear down the local EventSource immediately, dispatch ABORT to mark
   * `isComplete=true` + append "（用户已停止）" to chatReply, and fire a
   * best-effort POST /api/run-sessions/:id/abort so the server can drop
   * its session record + cancel the upstream LLM call.
   */
  abort: () => void;
}

export function useRunSession(sessionId: string): UseRunSessionReturn {
  const [state, dispatch] = useReducer(reducer, {
    outputType: null, mode: null, confidence: 0,
    steps: INITIAL_STEPS, nodes: [], edges: [],
    blueprintFile: null, blueprintYaml: null,
    artifactUrl: null, artifactType: 'yaml', activePanel: 'canvas',
    tokenCount: 0, isComplete: false, redirectUrl: null, thinkingMessage: null,
    rationaleCards: [], yamlLines: [], activeSubsteps: [],
    error: null, retrying: false, retryAttempt: 0, retryDelayMs: 0,
    critiqueResult: null, critiqueProgress: null,
    chatReply: '',
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

  // 3 分钟 watchdog — session 超时自动标 error
  useEffect(() => {
    if (!sessionId) return;
    watchdogRef.current = setTimeout(() => {
      // Watchdog timeout — server stalled, classify as network-bucket so the
      // banner CTA is "重发" rather than "配置 API Key".
      dispatch({ type: 'ERROR', message: 'Session 超时（3 分钟），请重试', code: 'network' });
    }, 3 * 60 * 1000);
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

  return { ...state, isStreaming, abort };
}
