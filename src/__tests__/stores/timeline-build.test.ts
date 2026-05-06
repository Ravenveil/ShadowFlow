/**
 * Story 4.4 — Timeline building via store.appendTimelineEvent.
 *
 * Verifies the sequence of node.started → node.retried (x N) → node.succeeded
 * produces the correct TimelineEvent order.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useRunStore } from '../../core/stores/useRunStore';

describe('Timeline build (Story 4.4 AC2)', () => {
  beforeEach(() => useRunStore.getState().reset('r-timeline'));

  it('records retry history in order', () => {
    const s = useRunStore.getState();
    s.appendTimelineEvent('n', { kind: 'started', at: '2026-04-22T00:00:00Z', attempt: 1 });
    s.appendTimelineEvent('n', {
      kind: 'retried',
      at: '2026-04-22T00:00:05Z',
      attempt: 2,
      fail_reason: 'r1',
    });
    s.appendTimelineEvent('n', {
      kind: 'retried',
      at: '2026-04-22T00:00:10Z',
      attempt: 3,
      fail_reason: 'r2',
    });
    s.appendTimelineEvent('n', {
      kind: 'succeeded',
      at: '2026-04-22T00:00:15Z',
      attempt: 3,
    });

    const tl = useRunStore.getState().nodes['n'].timeline;
    expect(tl).toHaveLength(4);
    expect(tl.map((e) => e.kind)).toEqual(['started', 'retried', 'retried', 'succeeded']);
    expect(tl[1].fail_reason).toBe('r1');
    expect(tl[2].fail_reason).toBe('r2');
    expect(tl[1].attempt).toBe(2);
    expect(tl[2].attempt).toBe(3);
  });

  it('selectNode updates store selection', () => {
    useRunStore.getState().selectNode('writer');
    expect(useRunStore.getState().selectedNodeId).toBe('writer');
    useRunStore.getState().selectNode(null);
    expect(useRunStore.getState().selectedNodeId).toBeNull();
  });

  it('reset clears selection + timeline', () => {
    const s = useRunStore.getState();
    s.appendTimelineEvent('n', { kind: 'started', at: 'x', attempt: 1 });
    s.selectNode('n');
    s.reset('r2');
    expect(useRunStore.getState().nodes).toEqual({});
    expect(useRunStore.getState().selectedNodeId).toBeNull();
  });
});
