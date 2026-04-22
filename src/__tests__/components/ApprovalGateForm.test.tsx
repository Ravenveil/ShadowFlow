import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ApprovalGateForm } from '../../core/components/inspector/ApprovalGateForm';
import type { WorkflowNode } from '../../core/types';

const makeNode = (config: Record<string, unknown> = {}): WorkflowNode => ({
  id: 'gate1',
  type: 'custom',
  position: { x: 0, y: 0 },
  data: {
    nodeId: 'gate1',
    nodeType: 'approval_gate',
    category: 'decision',
    label: 'Gate',
    name: { en: 'Gate', zh: '门' },
    description: { en: '', zh: '' },
    icon: '🛡',
    color: '#F59E0B',
    inputs: [],
    outputs: [],
    config,
    status: 'idle',
  },
});

describe('ApprovalGateForm', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ApprovalGateForm node={makeNode()} roles={[]} downstreamIds={[]} onUpdate={vi.fn()} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('shows default timeout of 300', () => {
    const { getByDisplayValue } = render(
      <ApprovalGateForm node={makeNode()} roles={[]} downstreamIds={[]} onUpdate={vi.fn()} />,
    );
    expect(getByDisplayValue('300')).toBeTruthy();
  });

  it('renders role options', () => {
    const { getByText } = render(
      <ApprovalGateForm node={makeNode()} roles={['Alice', 'Bob']} downstreamIds={[]} onUpdate={vi.fn()} />,
    );
    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('Bob')).toBeTruthy();
  });

  it('calls onUpdate when approver is changed', () => {
    const onUpdate = vi.fn();
    const { getByDisplayValue } = render(
      <ApprovalGateForm node={makeNode()} roles={['Alice']} downstreamIds={[]} onUpdate={onUpdate} />,
    );
    // The approver select initially shows "— 未指定 —"
    const select = getByDisplayValue('— 未指定 —');
    fireEvent.change(select, { target: { value: 'Alice' } });
    expect(onUpdate).toHaveBeenCalledWith('gate1', expect.objectContaining({ approver: 'Alice' }));
  });

  it('preloads existing approver value from node config', () => {
    const { getByDisplayValue } = render(
      <ApprovalGateForm node={makeNode({ approver: 'Alice' })} roles={['Alice']} downstreamIds={[]} onUpdate={vi.fn()} />,
    );
    expect(getByDisplayValue('Alice')).toBeTruthy();
  });

  it('renders downstream target options for on_approve and on_reject', () => {
    const { getAllByText } = render(
      <ApprovalGateForm node={makeNode()} roles={[]} downstreamIds={['writer', 'reviewer']} onUpdate={vi.fn()} />,
    );
    // Each downstream id appears in 2 selects (on_approve + on_reject)
    expect(getAllByText('writer').length).toBe(2);
  });
});
