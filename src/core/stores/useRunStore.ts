/**
 * useRunStore — per-run realtime node state (Story 4.2 AC2, Story 4.4 extend).
 *
 * SSE events from the backend are dispatched here; Zustand selectors let
 * individual node components subscribe precisely — only the changed node
 * re-renders.
 *
 * Story 4.4 additions:
 *   - `selectedNodeId` — TraceView panel activation target.
 *   - `timeline` per node — retry-preserving event log.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status values mirror the SSE node lifecycle event types (Story 4.1). */
export type NodeRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_user'
  | 'succeeded'
  | 'failed'
  | 'rejected';

export type TimelineEventKind =
  | 'started'
  | 'retried'
  | 'succeeded'
  | 'rejected'
  | 'failed';

export interface TimelineEvent {
  kind: TimelineEventKind;
  at: string;            // ISO-8601
  attempt: number;       // 1-based
  fail_reason?: string;
  inputs?: unknown;
  outputs?: unknown;
}

export interface NodeState {
  nodeId: string;
  status: NodeRunStatus;
  output: string;
  error: string;
  stepId: string;
  inputs?: unknown;
  outputs?: unknown;
  contentType?: string;       // e.g. 'application/json', 'text/markdown'
  timeline: TimelineEvent[];
}

export interface PolicyViolationRecord {
  sender: string;
  receiver: string;
  reason: string;
  ts: number;
}

export interface GapChoice {
  id: 'A' | 'B' | 'C';
  label: string;
  action: 'pause' | 'drop' | 'annotate' | string;
}

export interface PendingGap {
  runId: string;
  nodeId: string;
  gapType: string;
  description: string;
  choices: GapChoice[];
  userInput: string;
}

export interface RunStoreState {
  run_id: string | null;
  nodes: Record<string, NodeState>;
  violations: PolicyViolationRecord[];
  selectedNodeId: string | null;
  pendingGaps: PendingGap[];

  // Actions
  reset: (run_id: string) => void;
  setNodeStatus: (nodeId: string, status: NodeRunStatus, stepId?: string) => void;
  setNodeOutput: (nodeId: string, output: string, contentType?: string) => void;
  setNodeError: (nodeId: string, error: string) => void;
  setNodeInputs: (nodeId: string, inputs: unknown) => void;
  appendTimelineEvent: (nodeId: string, event: TimelineEvent) => void;
  recordPolicyViolation: (violation: Omit<PolicyViolationRecord, 'ts'>) => void;
  selectNode: (nodeId: string | null) => void;
  enqueueGap: (gap: Omit<PendingGap, 'userInput'> & { userInput?: string }) => void;
  updateGapInput: (nodeId: string, userInput: string) => void;
  resolveGap: (nodeId: string) => void;
  /** P1 (4.6 AC4): remove a node from the run (called on run.reconfigured removed_nodes). */
  removeNode: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureNode(state: RunStoreState, nodeId: string): NodeState {
  if (!state.nodes[nodeId]) {
    state.nodes[nodeId] = {
      nodeId,
      status: 'pending',
      output: '',
      error: '',
      stepId: '',
      timeline: [],
    };
  }
  return state.nodes[nodeId];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useRunStore = create<RunStoreState>()(
  immer((set) => ({
    run_id: null,
    nodes: {},
    violations: [],
    selectedNodeId: null,
    pendingGaps: [],

    reset(run_id: string) {
      set((state) => {
        state.run_id = run_id;
        state.nodes = {};
        state.violations = [];
        state.selectedNodeId = null;
        state.pendingGaps = [];
      });
    },

    setNodeStatus(nodeId: string, status: NodeRunStatus, stepId = '') {
      set((state) => {
        const node = ensureNode(state, nodeId);
        node.status = status;
        if (stepId) node.stepId = stepId;
      });
    },

    setNodeOutput(nodeId: string, output: string, contentType?: string) {
      set((state) => {
        const existed = Boolean(state.nodes[nodeId]);
        const node = ensureNode(state, nodeId);
        node.output = output;
        if (contentType) node.contentType = contentType;
        node.outputs = output;
        // Back-compat: creating a node via setNodeOutput marks it succeeded
        if (!existed) node.status = 'succeeded';
      });
    },

    setNodeError(nodeId: string, error: string) {
      set((state) => {
        const node = ensureNode(state, nodeId);
        node.error = error;
        node.status = 'failed';
      });
    },

    setNodeInputs(nodeId: string, inputs: unknown) {
      set((state) => {
        const node = ensureNode(state, nodeId);
        node.inputs = inputs;
      });
    },

    appendTimelineEvent(nodeId, event) {
      set((state) => {
        const node = ensureNode(state, nodeId);
        node.timeline.push(event);
      });
    },

    recordPolicyViolation(violation) {
      set((state) => {
        state.violations.push({ ...violation, ts: Date.now() });
      });
    },

    selectNode(nodeId) {
      set((state) => {
        state.selectedNodeId = nodeId;
      });
    },

    enqueueGap(gap) {
      set((state) => {
        const existing = state.pendingGaps.find(
          (item) => item.nodeId === gap.nodeId && item.runId === gap.runId,
        );
        if (existing) {
          existing.description = gap.description;
          existing.gapType = gap.gapType;
          existing.choices = gap.choices;
          existing.userInput = gap.userInput ?? existing.userInput;
          return;
        }
        state.pendingGaps.push({
          ...gap,
          userInput: gap.userInput ?? '',
        });
      });
    },

    updateGapInput(nodeId, userInput) {
      set((state) => {
        const pending = state.pendingGaps.find(
          (item) => item.nodeId === nodeId && item.runId === state.run_id,
        );
        if (pending) pending.userInput = userInput;
      });
    },

    resolveGap(nodeId) {
      set((state) => {
        state.pendingGaps = state.pendingGaps.filter(
          (item) => item.nodeId !== nodeId || item.runId !== state.run_id,
        );
      });
    },

    // P1 (4.6 AC4): remove node from topology on run.reconfigured
    removeNode(nodeId: string) {
      set((state) => {
        delete state.nodes[nodeId];
      });
    },
  }))
);
