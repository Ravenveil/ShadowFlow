/**
 * ApprovalGatePanel tests — Story 7.7
 *
 * Covers:
 *  - Renders 2 items when GET /api/groups/{id}/approvals/pending returns 2
 *  - [通过] button → loading → success → item disappears
 *  - [驳回] button → inline dialog → confirm → item disappears
 *  - Empty state when 0 items
 */

import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalGatePanel } from './ApprovalGatePanel';
import type { PendingApproval } from '../../../common/types/inbox';

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    (this.listeners[type] ?? []).forEach((h) =>
      h({ data: JSON.stringify(data) } as MessageEvent)
    );
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

// ---------------------------------------------------------------------------
// Mock useInboxStore
// ---------------------------------------------------------------------------

const mockUpdateGroupMetrics = vi.fn();

vi.mock('../../store/useInboxStore', () => ({
  useInboxStore: (sel: (s: unknown) => unknown) =>
    sel({ updateGroupMetrics: mockUpdateGroupMetrics, groups: [] }),
}));

// ---------------------------------------------------------------------------
// Approval fixtures
// ---------------------------------------------------------------------------

function makeApproval(n: number): PendingApproval {
  return {
    approval_id: `aid-${n}`,
    run_id: `run-${n}`,
    gate_id: `fact_checker_${n}`,
    submitter_name: `Agent ${n}`,
    submitter_kind: 'acp',
    summary: `Summary for approval ${n}`,
    triggered_at: new Date().toISOString(),
    waiting_seconds: n * 60,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockEventSource.reset();
  vi.restoreAllMocks();
  mockUpdateGroupMetrics.mockReset();

  // @ts-expect-error — replace global EventSource with mock
  global.EventSource = MockEventSource;
});

afterEach(() => {
  // @ts-expect-error
  delete global.EventSource;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApprovalGatePanel', () => {
  it('renders 2 items from GET pending approvals', async () => {
    const approvals = [makeApproval(1), makeApproval(2)];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: approvals }),
    });

    render(<ApprovalGatePanel groupId="grp-1" />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Agent 2')).toBeInTheDocument();
    });
  });

  it('shows empty state when no pending approvals', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    render(<ApprovalGatePanel groupId="grp-empty" />);

    await waitFor(() => {
      expect(screen.getByText('✓ 无待处理审批')).toBeInTheDocument();
    });
  });

  it('approve click → item removed on success', async () => {
    const approval = makeApproval(1);

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/approve')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'approved' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [approval] }) });
    });

    render(<ApprovalGatePanel groupId="grp-approve" />);

    await waitFor(() => expect(screen.getByText('Agent 1')).toBeInTheDocument());

    const approveBtn = screen.getAllByRole('button', { name: /通过/i })[0];
    await act(async () => fireEvent.click(approveBtn));

    await waitFor(() => {
      expect(screen.queryByText('Agent 1')).not.toBeInTheDocument();
    });
  });

  it('approve shows success toast', async () => {
    const approval = makeApproval(2);

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/approve')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'approved' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [approval] }) });
    });

    render(<ApprovalGatePanel groupId="grp-toast" />);

    await waitFor(() => expect(screen.getByText('Agent 2')).toBeInTheDocument());

    await act(async () =>
      fireEvent.click(screen.getAllByRole('button', { name: /通过/i })[0])
    );

    await waitFor(() => {
      expect(screen.getByText('✓ 已通过审批')).toBeInTheDocument();
    });
  });

  it('reject button opens inline dialog', async () => {
    const approval = makeApproval(3);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [approval] }),
    });

    render(<ApprovalGatePanel groupId="grp-reject" />);

    await waitFor(() => expect(screen.getByText('Agent 3')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /驳回/i })[0]);

    expect(screen.getByPlaceholderText('说明驳回原因...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /确认驳回/i })).toBeInTheDocument();
  });

  it('confirm reject → item removed on success', async () => {
    const approval = makeApproval(4);

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/reject')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'rejected' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [approval] }) });
    });

    render(<ApprovalGatePanel groupId="grp-confirm-reject" />);

    await waitFor(() => expect(screen.getByText('Agent 4')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /驳回/i })[0]);

    const textarea = screen.getByPlaceholderText('说明驳回原因...');
    fireEvent.change(textarea, { target: { value: '稿件有误' } });

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /确认驳回/i }))
    );

    await waitFor(() => {
      expect(screen.queryByText('Agent 4')).not.toBeInTheDocument();
    });
  });

  it('SSE approval.pending adds item', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    render(<ApprovalGatePanel groupId="grp-sse" />);

    await waitFor(() => expect(screen.getByText('✓ 无待处理审批')).toBeInTheDocument());

    // Use most-recent instance (.at(-1)) to handle any StrictMode double-invocations
    const es = MockEventSource.instances.at(-1)!;
    expect(es).toBeDefined();

    const newApproval = makeApproval(5);

    act(() => {
      es.emit('approval.pending', newApproval);
    });

    await waitFor(() => {
      expect(screen.getByText('Agent 5')).toBeInTheDocument();
    });
  });

  it('SSE approval.resolved removes item', async () => {
    const approval = makeApproval(6);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [approval] }),
    });

    render(<ApprovalGatePanel groupId="grp-sse-resolve" />);

    await waitFor(() => expect(screen.getByText('Agent 6')).toBeInTheDocument());

    const es = MockEventSource.instances.at(-1)!;

    act(() => {
      es.emit('approval.resolved', { approval_id: approval.approval_id });
    });

    await waitFor(() => {
      expect(screen.queryByText('Agent 6')).not.toBeInTheDocument();
    });
  });
});
