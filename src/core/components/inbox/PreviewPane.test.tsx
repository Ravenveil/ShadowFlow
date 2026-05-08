import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PreviewPane } from './PreviewPane';

vi.mock('../../../api/groupApi', () => ({
  fetchRecentMessages: vi.fn().mockResolvedValue([]),
}));

const mockSelectGroup = vi.fn();
const mockUpdateGroupMetrics = vi.fn();

const storeBase = {
  selectedGroupId: null as string | null,
  groups: [] as { id: string; name: string; metrics?: unknown }[],
  recentMessages: {} as Record<string, unknown[]>,
  setRecentMessages: vi.fn(),
  selectGroup: mockSelectGroup,
  updateGroupMetrics: mockUpdateGroupMetrics,
};

vi.mock('../../store/useInboxStore', () => ({
  useInboxStore: (selector: (s: typeof storeBase) => unknown) => selector(storeBase),
}));

class NoopEventSource {
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  storeBase.selectedGroupId = null;
  storeBase.groups = [];
  storeBase.recentMessages = {};
  mockUpdateGroupMetrics.mockReset();
  // @ts-expect-error
  global.EventSource = NoopEventSource;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [] }),
  });
});

afterEach(() => {
  // @ts-expect-error
  delete global.EventSource;
});

describe('PreviewPane', () => {
  it('shows the empty state without a selected group', () => {
    render(<MemoryRouter><PreviewPane /></MemoryRouter>);
    expect(screen.getByText('选择一个会话查看详情')).toBeInTheDocument();
  });

  it('hides the empty state and shows 3 slots when a group is selected', () => {
    storeBase.selectedGroupId = 'group-1';
    render(<MemoryRouter><PreviewPane /></MemoryRouter>);

    expect(screen.queryByText('选择一个会话查看详情')).not.toBeInTheDocument();
    expect(screen.getByText('APPROVAL GATE')).toBeInTheDocument();
    expect(screen.getByText('Recent Messages')).toBeInTheDocument();
    expect(screen.getByTestId('group-metrics-bar')).toBeInTheDocument();
  });
});
