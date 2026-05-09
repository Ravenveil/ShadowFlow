import { useEffect, useReducer, useRef } from 'react';
import { subscribeRunSession } from '../../api/runSessions';
import type { ClassifyEvent, AssembleEvent, NodeEvent, EdgeEvent, BlueprintEvent, CompleteEvent } from '../../api/runSessions';

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

export interface RunSessionState {
  outputType: string | null;
  mode: string | null;
  confidence: number;
  steps: RunSessionStep[];
  nodes: RunSessionNode[];
  edges: RunSessionEdge[];
  blueprintFile: string | null;
  blueprintYaml: string | null;
  tokenCount: number;
  isComplete: boolean;
  redirectUrl: string | null;
  thinkingMessage: string | null;
}

const INITIAL_STEPS: RunSessionStep[] = [
  { name: '分析目标需求', status: 'pending' },
  { name: '规划 Agent 角色结构', status: 'pending' },
  { name: '生成 YAML Blueprint', status: 'pending' },
  { name: '创建 Agent 节点', status: 'pending' },
  { name: '配置 Team Workflow', status: 'pending' },
  { name: '完成 — 跳转 Editor', status: 'pending' },
];

type Action =
  | { type: 'CLASSIFY'; payload: ClassifyEvent }
  | { type: 'ASSEMBLE'; payload: AssembleEvent }
  | { type: 'NODE'; payload: NodeEvent }
  | { type: 'EDGE'; payload: EdgeEvent }
  | { type: 'BLUEPRINT'; payload: BlueprintEvent }
  | { type: 'COMPLETE'; payload: CompleteEvent }
  | { type: 'TICK_TOKEN' };

function reducer(state: RunSessionState, action: Action): RunSessionState {
  switch (action.type) {
    case 'CLASSIFY':
      return { ...state, outputType: action.payload.output_type, mode: action.payload.mode, confidence: action.payload.confidence };
    case 'ASSEMBLE': {
      const { step, status, elapsed_ms } = action.payload;
      const steps = state.steps.map(s =>
        s.name === step ? { ...s, status, elapsed: elapsed_ms ? `${(elapsed_ms / 1000).toFixed(1)}s` : s.elapsed } : s
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
      return { ...state, blueprintFile: action.payload.filename, blueprintYaml: action.payload.yaml };
    case 'COMPLETE':
      return { ...state, isComplete: true, redirectUrl: action.payload.redirect ?? null, thinkingMessage: null };
    case 'TICK_TOKEN':
      return { ...state, tokenCount: state.tokenCount + Math.floor(Math.random() * 80 + 20) };
    default:
      return state;
  }
}

export function useRunSession(sessionId: string): RunSessionState {
  const [state, dispatch] = useReducer(reducer, {
    outputType: null, mode: null, confidence: 0,
    steps: INITIAL_STEPS, nodes: [], edges: [],
    blueprintFile: null, blueprintYaml: null,
    tokenCount: 0, isComplete: false, redirectUrl: null, thinkingMessage: null,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const cleanup = subscribeRunSession(sessionId, {
      onClassify:  (d) => dispatch({ type: 'CLASSIFY', payload: d }),
      onAssemble:  (d) => dispatch({ type: 'ASSEMBLE', payload: d }),
      onNode:      (d) => dispatch({ type: 'NODE', payload: d }),
      onEdge:      (d) => dispatch({ type: 'EDGE', payload: d }),
      onBlueprint: (d) => dispatch({ type: 'BLUEPRINT', payload: d }),
      onComplete:  (d) => dispatch({ type: 'COMPLETE', payload: d }),
    });
    timerRef.current = setInterval(() => dispatch({ type: 'TICK_TOKEN' }), 2000);
    return () => {
      cleanup();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId]);

  return state;
}
