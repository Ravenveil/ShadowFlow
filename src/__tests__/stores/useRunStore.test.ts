/**
 * Story 4.2 AC2 — useRunStore Zustand selector 精确订阅测试。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useRunStore } from '../../core/stores/useRunStore';

function store() {
  return useRunStore.getState();
}

describe('useRunStore', () => {
  beforeEach(() => {
    store().reset('test-run-1');
  });

  it('reset initialises run_id and clears nodes', () => {
    store().setNodeStatus('n1', 'running');
    store().reset('run-2');
    expect(store().run_id).toBe('run-2');
    expect(Object.keys(store().nodes)).toHaveLength(0);
  });

  it('setNodeStatus creates node if absent', () => {
    store().setNodeStatus('n-new', 'running', 'step-001');
    const node = store().nodes['n-new'];
    expect(node).toBeDefined();
    expect(node.status).toBe('running');
    expect(node.stepId).toBe('step-001');
  });

  it('setNodeStatus updates status without touching other fields', () => {
    store().setNodeStatus('n1', 'running');
    store().setNodeOutput('n1', 'hello');
    store().setNodeStatus('n1', 'succeeded');
    const node = store().nodes['n1'];
    expect(node.status).toBe('succeeded');
    expect(node.output).toBe('hello');
  });

  it('setNodeOutput stores output', () => {
    store().setNodeOutput('n2', 'result text');
    expect(store().nodes['n2'].output).toBe('result text');
    expect(store().nodes['n2'].status).toBe('succeeded');
  });

  it('setNodeError stores error and marks failed', () => {
    store().setNodeError('n3', 'timeout');
    expect(store().nodes['n3'].status).toBe('failed');
    expect(store().nodes['n3'].error).toBe('timeout');
  });

  it('recordPolicyViolation appends to violations', () => {
    store().recordPolicyViolation({ sender: 'editor', receiver: 'writer', reason: 'off-topic' });
    store().recordPolicyViolation({ sender: 'advisor', receiver: 'writer', reason: 'out-of-scope' });
    expect(store().violations).toHaveLength(2);
    expect(store().violations[0].sender).toBe('editor');
    expect(typeof store().violations[0].ts).toBe('number');
  });

  it('independent nodes do not share references after update', () => {
    store().setNodeStatus('a', 'running');
    store().setNodeStatus('b', 'pending');
    const before = store().nodes['b'];
    store().setNodeStatus('a', 'succeeded');
    // 'b' reference must be same object (immer preserves unchanged slices)
    expect(store().nodes['b']).toBe(before);
  });

  it('all five NodeRunStatus values are accepted', () => {
    for (const s of ['pending', 'running', 'succeeded', 'failed', 'rejected'] as const) {
      store().setNodeStatus(`n-${s}`, s);
      expect(store().nodes[`n-${s}`].status).toBe(s);
    }
  });
});
