/**
 * Story 4.4 — TraceView panel tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TraceView } from '../../core/components/Panel/TraceView';
import { useRunStore } from '../../core/stores/useRunStore';

function setupNode(
  nodeId: string,
  patch: Partial<{ inputs: unknown; outputs: unknown; error: string; contentType: string }> = {},
) {
  const s = useRunStore.getState();
  s.setNodeStatus(nodeId, 'running');
  if (patch.inputs !== undefined) s.setNodeInputs(nodeId, patch.inputs);
  if (patch.outputs !== undefined) s.setNodeOutput(nodeId, String(patch.outputs), patch.contentType);
  if (patch.error !== undefined) s.setNodeError(nodeId, patch.error);
}

describe('TraceView (Story 4.4)', () => {
  beforeEach(() => {
    useRunStore.getState().reset('run-trace-test');
  });

  it('renders nothing meaningful until a node is selected', () => {
    render(<TraceView />);
    const panel = screen.getByTestId('trace-view');
    expect(panel.style.transform).toMatch(/translateX/);
  });

  it('slides open when selectedNodeId is set and shows node id header', () => {
    setupNode('writer', { inputs: { goal: 'methods' } });
    useRunStore.getState().selectNode('writer');
    render(<TraceView />);
    expect(screen.getByText('writer')).toBeDefined();
  });

  it('shows 4 sections (Inputs / Outputs / Timeline / Error)', () => {
    setupNode('writer', { inputs: { q: 1 }, outputs: 'ok' });
    useRunStore.getState().selectNode('writer');
    render(<TraceView />);
    expect(screen.getByText(/INPUTS/i)).toBeDefined();
    expect(screen.getByText(/OUTPUTS/i)).toBeDefined();
    expect(screen.getByText(/TIMELINE/i)).toBeDefined();
    expect(screen.getByText(/ERROR/i)).toBeDefined();
  });

  it('preserves full retry history in the timeline', () => {
    setupNode('writer');
    const s = useRunStore.getState();
    s.appendTimelineEvent('writer', { kind: 'started', at: '2026-04-22T01:00:00Z', attempt: 1 });
    s.appendTimelineEvent('writer', {
      kind: 'retried',
      at: '2026-04-22T01:00:05Z',
      attempt: 2,
      fail_reason: 'missing baseline',
    });
    s.appendTimelineEvent('writer', {
      kind: 'retried',
      at: '2026-04-22T01:00:12Z',
      attempt: 3,
      fail_reason: 'still short',
    });
    s.appendTimelineEvent('writer', { kind: 'succeeded', at: '2026-04-22T01:00:20Z', attempt: 3 });
    s.selectNode('writer');

    render(<TraceView />);

    // All 4 timeline events visible (each contains kind label).
    expect(screen.getAllByText('retried').length).toBe(2);
    expect(screen.getByText('started')).toBeDefined();
    expect(screen.getByText('succeeded')).toBeDefined();
    // Fail reason is preserved per attempt
    expect(screen.getByText('missing baseline')).toBeDefined();
    expect(screen.getByText('still short')).toBeDefined();
  });

  it('close button clears selectedNodeId', () => {
    setupNode('writer');
    useRunStore.getState().selectNode('writer');
    render(<TraceView />);
    fireEvent.click(screen.getByLabelText('Close TraceView'));
    expect(useRunStore.getState().selectedNodeId).toBeNull();
  });

  it('masks sensitive fields in inputs', () => {
    setupNode('writer', { inputs: { api_key: 'sk-secret', goal: 'x' } });
    useRunStore.getState().selectNode('writer');
    render(<TraceView />);
    expect(screen.queryByText(/sk-secret/)).toBeNull();
    expect(screen.getByText(/\*\*\*/)).toBeDefined();
  });
});
