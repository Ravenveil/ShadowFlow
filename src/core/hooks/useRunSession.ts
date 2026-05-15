import { useEffect, useReducer, useRef } from 'react';
import { subscribeRunSession } from '../../api/runSessions';
import type { ClassifyEvent, AssembleEvent, NodeEvent, EdgeEvent, BlueprintEvent, CompleteEvent, RationaleEvent, YamlLineEvent, SubstepEvent, CritiqueResultEvent, CritiqueProgressEvent, TextEvent } from '../../api/runSessions';

export interface RunSessionNode {
  id: string;
  type: 'coordinator' | 'agent';
  title: string;
  sub: string;
  chips: string[];
  status: 'building' | 'ready' | 'pending';
  avatarChar: string;
}

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
  error: string | null;
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
  | { type: 'ERROR'; message: string }
  | { type: 'RETRYING'; attempt: number; delayMs: number }
  | { type: 'CRITIQUE_PROGRESS'; payload: CritiqueProgressEvent }
  | { type: 'CRITIQUE_RESULT'; payload: CritiqueResultEvent }
  | { type: 'TEXT'; payload: TextEvent };

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
      const { node_id, type, title, sub, chips, status, avatar_char } = action.payload;
      const avatarChar = avatar_char ?? title.charAt(0);
      const existing = state.nodes.findIndex(n => n.id === node_id);
      const node: RunSessionNode = { id: node_id, type, title, sub, chips, status, avatarChar };
      const nodes = existing >= 0
        ? state.nodes.map((n, i) => i === existing ? node : n)
        : [...state.nodes, node];
      return { ...state, nodes };
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
    case 'ERROR':
      return { ...state, error: action.message, retrying: false, thinkingMessage: null };
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
    default:
      return state;
  }
}

export function useRunSession(sessionId: string): RunSessionState {
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

  useEffect(() => {
    if (!sessionId) return;
    const cleanup = subscribeRunSession(sessionId, {
      onClassify:  (d) => dispatch({ type: 'CLASSIFY', payload: d }),
      onAssemble:  (d) => dispatch({ type: 'ASSEMBLE', payload: d }),
      onNode:      (d) => dispatch({ type: 'NODE', payload: d }),
      onEdge:      (d) => dispatch({ type: 'EDGE', payload: d }),
      onBlueprint: (d) => dispatch({ type: 'BLUEPRINT', payload: d }),
      onComplete:  (d) => dispatch({ type: 'COMPLETE', payload: d }),
      onRationale: (d) => dispatch({ type: 'RATIONALE', payload: d }),
      onYamlLine:  (d) => dispatch({ type: 'YAML_LINE', payload: d }),
      onSubstep:   (d) => dispatch({ type: 'SUBSTEP', payload: d }),
      onCritiqueProgress: (d) => dispatch({ type: 'CRITIQUE_PROGRESS', payload: d }),
      onCritiqueResult:   (d) => dispatch({ type: 'CRITIQUE_RESULT', payload: d }),
      onText:          (d) => dispatch({ type: 'TEXT', payload: d }),
      onRetrying:      (attempt, delayMs) => dispatch({ type: 'RETRYING', attempt, delayMs }),
      onError:         () => dispatch({ type: 'ERROR', message: 'SSE 连接失败，已达最大重试次数' }),
      onServerError:   (message) => dispatch({ type: 'ERROR', message }),
    });
    return cleanup;
  }, [sessionId]);

  // 3 分钟 watchdog — session 超时自动标 error
  useEffect(() => {
    if (!sessionId) return;
    watchdogRef.current = setTimeout(() => {
      dispatch({ type: 'ERROR', message: 'Session 超时（3 分钟），请重试' });
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

  return state;
}
