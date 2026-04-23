/**
 * sseClient.test.ts — P15 (review Chunk B 4-1).
 *
 * Verifies that each SSE event type correctly updates useRunStore state.
 * Tests the dispatch table in useRunEvents by calling store actions directly
 * (same path as handleEvent), verifying store contracts for all 5+1 event types.
 *
 * For a full hook integration test requiring a real mock EventSource, use
 * Playwright or a dedicated e2e suite with a controlled SSE server.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useRunStore } from '../core/stores/useRunStore';
import { useRejectionToastStore } from '../core/stores/useRejectionToastStore';

describe('useRunStore — SSE event contract', () => {
  beforeEach(() => {
    useRunStore.getState().reset('run-sse-test');
    // Clear toast store
    useRejectionToastStore.setState({ visible: [], queue: [] });
  });

  it('node.started → setNodeStatus(id, running)', () => {
    const { setNodeStatus } = useRunStore.getState();
    setNodeStatus('agent-A', 'running', 'step-1');
    const node = useRunStore.getState().nodes['agent-A'];
    expect(node).toBeDefined();
    expect(node.status).toBe('running');
    expect(node.stepId).toBe('step-1');
  });

  it('node.succeeded → setNodeStatus(id, succeeded) + setNodeOutput', () => {
    const { setNodeStatus, setNodeOutput } = useRunStore.getState();
    setNodeStatus('agent-A', 'succeeded');
    setNodeOutput('agent-A', 'Draft complete');
    const node = useRunStore.getState().nodes['agent-A'];
    expect(node.status).toBe('succeeded');
    expect(node.output).toBe('Draft complete');
  });

  it('node.failed → setNodeStatus(id, failed) + setNodeError', () => {
    const { setNodeStatus, setNodeError } = useRunStore.getState();
    setNodeStatus('agent-B', 'failed');
    setNodeError('agent-B', 'LLM timeout after 30s');
    const node = useRunStore.getState().nodes['agent-B'];
    expect(node.status).toBe('failed');
    expect(node.error).toBe('LLM timeout after 30s');
  });

  it('node.rejected → setNodeStatus(id, rejected)', () => {
    const { setNodeStatus } = useRunStore.getState();
    setNodeStatus('agent-C', 'rejected');
    expect(useRunStore.getState().nodes['agent-C'].status).toBe('rejected');
  });

  it('policy.violation → recordPolicyViolation adds to violations list', () => {
    const { recordPolicyViolation } = useRunStore.getState();
    recordPolicyViolation({
      sender: 'compliance_officer',
      receiver: 'content_writer',
      reason: 'Rule R-3: profanity detected',
    });
    const violations = useRunStore.getState().violations;
    expect(violations).toHaveLength(1);
    expect(violations[0].sender).toBe('compliance_officer');
    expect(violations[0].receiver).toBe('content_writer');
    expect(violations[0].reason).toMatch(/R-3/);
    expect(typeof violations[0].ts).toBe('number');
  });

  it('run.reconfigured — new nodes → setNodeStatus(id, pending); removed → removeNode', () => {
    const { setNodeStatus, removeNode } = useRunStore.getState();

    // Seed an existing node
    setNodeStatus('old-node', 'succeeded');
    expect(useRunStore.getState().nodes['old-node']).toBeDefined();

    // Simulate reconfigure dispatch
    setNodeStatus('fact_checker', 'pending');
    removeNode('old-node');

    const state = useRunStore.getState();
    expect(state.nodes['fact_checker'].status).toBe('pending');
    expect(state.nodes['old-node']).toBeUndefined();
  });

  it('multiple violations accumulate in order', () => {
    const { recordPolicyViolation } = useRunStore.getState();
    recordPolicyViolation({ sender: 'A', receiver: 'B', reason: 'R1' });
    recordPolicyViolation({ sender: 'C', receiver: 'D', reason: 'R2' });
    const violations = useRunStore.getState().violations;
    expect(violations).toHaveLength(2);
    expect(violations[0].reason).toBe('R1');
    expect(violations[1].reason).toBe('R2');
  });

  it('appendTimelineEvent builds per-node retry history', () => {
    const { appendTimelineEvent } = useRunStore.getState();
    useRunStore.getState().setNodeStatus('agent-A', 'running');
    appendTimelineEvent('agent-A', { kind: 'started', at: '2026-04-22T00:00:00Z', attempt: 1 });
    appendTimelineEvent('agent-A', { kind: 'retried', at: '2026-04-22T00:00:10Z', attempt: 2, fail_reason: 'timeout' });
    appendTimelineEvent('agent-A', { kind: 'succeeded', at: '2026-04-22T00:00:20Z', attempt: 2 });
    const timeline = useRunStore.getState().nodes['agent-A'].timeline;
    expect(timeline).toHaveLength(3);
    expect(timeline[1].kind).toBe('retried');
    expect(timeline[1].fail_reason).toBe('timeout');
  });

  it('agent.gap_detected → waiting_user + pending gap queue', () => {
    const { setNodeStatus, enqueueGap } = useRunStore.getState();
    setNodeStatus('section-writer', 'waiting_user');
    enqueueGap({
      runId: 'run-sse-test',
      nodeId: 'section-writer',
      gapType: 'incomplete_log',
      description: '实验日志缺少 baseline 数据。',
      choices: [
        { id: 'A', label: '补充数据', action: 'pause' },
        { id: 'B', label: '移除此对比', action: 'drop' },
        { id: 'C', label: '标记稍后更新', action: 'annotate' },
      ],
    });
    const state = useRunStore.getState();
    expect(state.nodes['section-writer'].status).toBe('waiting_user');
    expect(state.pendingGaps).toHaveLength(1);
    expect(state.pendingGaps[0].gapType).toBe('incomplete_log');
  });
});
