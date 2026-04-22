/**
 * Story 4.2 AC1 — LiveDashboard status class rendering tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveDashboard } from '../../core/components/Panel/LiveDashboard';
import { useRunStore } from '../../core/stores/useRunStore';

function setupRun(runId: string) {
  useRunStore.getState().reset(runId);
}

describe('LiveDashboard', () => {
  beforeEach(() => {
    useRunStore.getState().reset('r-test');
  });

  it('shows placeholder when no run_id', () => {
    useRunStore.setState({ run_id: null });
    render(<LiveDashboard />);
    expect(screen.getByText(/暂无运行中/)).toBeDefined();
  });

  it('renders dashboard container when run is active', () => {
    setupRun('run-abc');
    render(<LiveDashboard />);
    expect(screen.getByTestId('live-dashboard')).toBeDefined();
  });

  it('shows "waiting for node events" when no nodes yet', () => {
    setupRun('run-abc');
    render(<LiveDashboard />);
    expect(screen.getByText(/等待节点事件/)).toBeDefined();
  });

  it('renders a NodeCard per node', () => {
    setupRun('run-abc');
    useRunStore.getState().setNodeStatus('node-A', 'running');
    useRunStore.getState().setNodeStatus('node-B', 'succeeded');
    render(<LiveDashboard />);
    expect(screen.getByTestId('dashboard-node-node-A')).toBeDefined();
    expect(screen.getByTestId('dashboard-node-node-B')).toBeDefined();
  });

  it('NodeCard carries correct data-status for running', () => {
    setupRun('run-abc');
    useRunStore.getState().setNodeStatus('n1', 'running');
    render(<LiveDashboard />);
    const card = screen.getByTestId('dashboard-node-n1');
    expect(card.getAttribute('data-status')).toBe('running');
  });

  it('NodeCard carries correct data-status for rejected', () => {
    setupRun('run-abc');
    useRunStore.getState().setNodeStatus('n2', 'rejected');
    render(<LiveDashboard />);
    expect(screen.getByTestId('dashboard-node-n2').getAttribute('data-status')).toBe('rejected');
  });

  it('shows policy violation count when violations exist', () => {
    setupRun('run-abc');
    useRunStore.getState().recordPolicyViolation({ sender: 'ed', receiver: 'wr', reason: 'off-topic' });
    render(<LiveDashboard />);
    expect(screen.getByText(/1 次 policy 驳回/)).toBeDefined();
  });

  it('shows node output when provided', () => {
    setupRun('run-abc');
    useRunStore.getState().setNodeStatus('n3', 'succeeded');
    useRunStore.getState().setNodeOutput('n3', 'draft complete');
    render(<LiveDashboard />);
    expect(screen.getByText('draft complete')).toBeDefined();
  });
});
