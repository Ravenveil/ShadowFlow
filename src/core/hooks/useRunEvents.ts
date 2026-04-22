/**
 * useRunEvents — subscribe to SSE run events (Story 4.2 AC2, Story 4.4 extend).
 *
 * Dispatches node lifecycle events to useRunStore; legacy onEvent / onFallback
 * callbacks are preserved for backward compatibility.
 *
 * Story 4.4 additions:
 *   - `node.retried` → appends `retried` TimelineEvent (preserves full retry history).
 *   - every lifecycle event is also logged to the node timeline.
 * Story 4.5 additions:
 *   - `policy.updated` → toast + markClean on usePolicyStore.
 * Story 4.6 additions:
 *   - `run.reconfigured` → apply diff (new nodes / reused outputs).
 */

import { useEffect, useRef, useCallback } from 'react';
import { SseClient } from '../../adapter/sseClient';
import {
  useRunStore,
  NodeRunStatus,
  TimelineEventKind,
  TimelineEvent,
} from '../stores/useRunStore';
import { useRejectionToastStore } from '../stores/useRejectionToastStore';
import { usePolicyStore } from './usePolicyStore';

export type RunEventPayload = {
  type: string;
  [key: string]: unknown;
};

export type FallbackToast = {
  id: string;
  from: string;
  to: string;
  reason: string;
  ts: number;
};

interface UseRunEventsOptions {
  runId: string | null;
  onFallback?: (toast: FallbackToast) => void;
  onEvent?: (event: RunEventPayload) => void;
  baseUrl?: string;
}

// Map SSE event type → NodeRunStatus
const SSE_TO_STATUS: Record<string, NodeRunStatus> = {
  'node.started':   'running',
  'node.succeeded': 'succeeded',
  'node.failed':    'failed',
  'node.rejected':  'rejected',
};

// Map SSE event type → TimelineEvent.kind
const SSE_TO_TIMELINE_KIND: Record<string, TimelineEventKind> = {
  'node.started':   'started',
  'node.retried':   'retried',
  'node.succeeded': 'succeeded',
  'node.failed':    'failed',
  'node.rejected':  'rejected',
};

export function useRunEvents({
  runId,
  onFallback,
  onEvent,
  baseUrl = '',
}: UseRunEventsOptions) {
  const clientRef = useRef<SseClient | null>(null);

  const {
    reset,
    setNodeStatus,
    setNodeOutput,
    setNodeError,
    setNodeInputs,
    appendTimelineEvent,
    recordPolicyViolation,
    removeNode,
  } = useRunStore.getState();

  const handleEvent = useCallback(
    (payload: RunEventPayload) => {
      onEvent?.(payload);

      const nodeId = payload.node_id as string | undefined;
      const type = payload.type as string;

      // Node lifecycle → update store status + timeline
      if (nodeId && type in SSE_TO_STATUS) {
        const status = SSE_TO_STATUS[type];
        const stepId = payload.step_id as string | undefined;
        setNodeStatus(nodeId, status, stepId);

        if (type === 'node.succeeded') {
          const summary = payload.output_summary as string | undefined;
          const contentType = payload.content_type as string | undefined;
          if (summary !== undefined) setNodeOutput(nodeId, summary, contentType);
        }
        if (type === 'node.failed') {
          const err = (payload.error ?? payload.message ?? '') as string;
          setNodeError(nodeId, err);
        }
      }

      // Inputs snapshot (usually on node.started)
      if (nodeId && type === 'node.started' && payload.inputs !== undefined) {
        setNodeInputs(nodeId, payload.inputs);
      }

      // Timeline: append retries + lifecycle events
      if (nodeId && type in SSE_TO_TIMELINE_KIND) {
        const attempt = typeof payload.attempt === 'number' ? payload.attempt : 1;
        const at = typeof payload.timestamp === 'string'
          ? payload.timestamp
          : new Date().toISOString();
        const evt: TimelineEvent = {
          kind: SSE_TO_TIMELINE_KIND[type],
          at,
          attempt,
          fail_reason: (payload.fail_reason ?? payload.reason ?? payload.error) as string | undefined,
          inputs: payload.inputs,
          outputs: payload.outputs ?? payload.output_summary,
        };
        appendTimelineEvent(nodeId, evt);
      }

      // Policy violation → store + rejection toast (Story 4.3)
      if (type === 'policy.violation' || type === 'node.rejected') {
        const sender = (payload.sender ?? '') as string;
        const receiver = (payload.receiver ?? payload.node_id ?? '') as string;
        const reason = (payload.reason ?? '') as string;
        recordPolicyViolation({ sender, receiver, reason });
        useRejectionToastStore.getState().push({ sender, receiver, reason });
      }

      // Policy updated (Story 4.5) → mark store clean + toast
      if (type === 'policy.updated') {
        try {
          usePolicyStore.getState().markClean?.();
        } catch {
          /* usePolicyStore shape may vary */
        }
      }

      // run.reconfigured (Story 4.6 AC4) — update LiveDashboard topology
      if (type === 'run.reconfigured') {
        const newNodes = (payload.new_nodes ?? []) as Array<{ id: string } | string>;
        const removedNodes = (payload.removed_nodes ?? []) as Array<{ id: string } | string>;
        for (const n of newNodes) {
          const nodeId = typeof n === 'string' ? n : (n as { id: string }).id;
          if (nodeId) setNodeStatus(nodeId, 'pending');
        }
        for (const n of removedNodes) {
          const nodeId = typeof n === 'string' ? n : (n as { id: string }).id;
          if (nodeId) removeNode(nodeId);
        }
      }

      // Fallback (AR16 backward compat)
      if (type === 'provider.fallback' && onFallback) {
        onFallback({
          id: `fb-${Date.now()}`,
          from: String(payload.from ?? '?'),
          to: String(payload.to ?? '?'),
          reason: String(payload.reason ?? ''),
          ts: Date.now(),
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onEvent, onFallback]
  );

  useEffect(() => {
    if (!runId) return;

    reset(runId);

    const client = new SseClient({ baseUrl });
    clientRef.current = client;

    // Register catch-all handler
    client.on('*', (raw) => {
      const wrapped = raw as { type: string; payload: unknown };
      const payload = (wrapped?.payload ?? raw) as RunEventPayload;
      handleEvent(payload);
    });

    // Named handlers for common lifecycle types
    for (const eventType of Object.keys(SSE_TO_STATUS)) {
      client.on(eventType, (payload) => handleEvent(payload as RunEventPayload));
    }
    client.on('node.retried', (payload) => handleEvent(payload as RunEventPayload));
    client.on('policy.violation', (payload) => handleEvent(payload as RunEventPayload));
    client.on('policy.updated', (payload) => handleEvent(payload as RunEventPayload));
    client.on('run.reconfigured', (payload) => handleEvent(payload as RunEventPayload));
    client.on('run.completed', (payload) => handleEvent(payload as RunEventPayload));

    client.connect(runId);

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [runId, baseUrl, handleEvent, reset]);
}
