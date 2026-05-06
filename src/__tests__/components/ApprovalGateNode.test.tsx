import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ApprovalGateNode } from '../../core/components/Node/ApprovalGateNode';
import type { NodeData } from '../../core/types';

const makeNodeProps = (overrides: Partial<NodeData> = {}): any => ({
  id: 'n1',
  type: 'approval_gate',
  selected: false,
  zIndex: 0,
  isConnectable: true,
  xPos: 0,
  yPos: 0,
  dragging: false,
  data: {
    nodeId: 'n1',
    nodeType: 'approval_gate',
    category: 'decision',
    label: 'Gate',
    name: { en: 'Gate', zh: '门' },
    description: { en: '', zh: '' },
    icon: '🛡',
    color: '#F59E0B',
    inputs: [],
    outputs: [],
    config: {},
    status: 'idle',
    ...overrides,
  },
});

describe('ApprovalGateNode', () => {
  it('renders without crashing', () => {
    const { container } = render(<ApprovalGateNode {...makeNodeProps()} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows ApprovalGate label', () => {
    const { getByText } = render(<ApprovalGateNode {...makeNodeProps()} />);
    expect(getByText('ApprovalGate')).toBeTruthy();
  });

  it('shows placeholder when no approver configured', () => {
    const { getByText } = render(<ApprovalGateNode {...makeNodeProps()} />);
    expect(getByText('未指定审批人')).toBeTruthy();
  });

  it('shows approver name when configured', () => {
    const props = makeNodeProps({ config: { approver: 'Alice' } });
    const { getByText } = render(<ApprovalGateNode {...props} />);
    expect(getByText(/Alice/)).toBeTruthy();
  });

  it('renders 3 handles (1 in + approve + reject)', () => {
    const { container } = render(<ApprovalGateNode {...makeNodeProps()} />);
    // react-flow__handle is the class ReactFlow puts on handles
    const handles = container.querySelectorAll('[data-handleid]');
    expect(handles.length).toBe(3);
  });

  it('approve handle has id="approve"', () => {
    const { container } = render(<ApprovalGateNode {...makeNodeProps()} />);
    const approveHandle = container.querySelector('[data-handleid="approve"]');
    expect(approveHandle).toBeTruthy();
  });

  it('reject handle has id="reject"', () => {
    const { container } = render(<ApprovalGateNode {...makeNodeProps()} />);
    const rejectHandle = container.querySelector('[data-handleid="reject"]');
    expect(rejectHandle).toBeTruthy();
  });
});
