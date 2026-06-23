import { act, fireEvent, render, screen, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useInboxStore } from '../../store/useInboxStore';
import { MessageList } from './MessageList';
import type { GroupItem, AgentDMItem } from '../../../common/types/inbox';

// Mock fetch to avoid real HTTP calls
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    data: { groups: [], agent_dms: [] },
    meta: { trace_id: 'test', timestamp: new Date().toISOString() },
  }),
} as Response);

const mockGroup: GroupItem = {
  id: 'g1',
  name: 'Research Team',
  templateId: 'academic-paper',
  status: 'running',
  unreadCount: 2,
  pendingApprovalsCount: 1,
  lastMessage: 'Hello world',
  lastActivityAt: '2026-04-24T08:00:00Z',
};

const mockAgent: AgentDMItem = {
  agentId: 'a1',
  agentName: 'Reviewer',
  kind: 'acp',
  status: 'idle',
  unreadCount: 0,
  lastMessage: 'Standing by.',
  lastActivityAt: '2026-04-24T07:00:00Z',
};

const mockSecondGroup: GroupItem = {
  id: 'g2',
  name: 'PI Sync',
  templateId: 'academic-paper',
  status: 'idle',
  unreadCount: 0,
  pendingApprovalsCount: 0,
  lastMessage: 'PI review scheduled tomorrow',
  lastActivityAt: '2026-04-24T09:00:00Z',
};

const mockSecondAgent: AgentDMItem = {
  agentId: 'a2',
  agentName: 'Planner',
  kind: 'api',
  status: 'running',
  unreadCount: 1,
  lastMessage: 'PI summary is ready',
  lastActivityAt: '2026-04-24T10:00:00Z',
};

beforeEach(() => {
  vi.useFakeTimers();
  useInboxStore.setState({
    groups: [mockGroup, mockSecondGroup],
    agentDMs: [mockAgent, mockSecondAgent],
    loading: false,
    error: null,
    currentTemplateId: 'academic-paper',
    selectedGroupId: null,
  });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('MessageList', () => {
  it('renders the new group button', () => {
    render(<MemoryRouter><MessageList /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '+ 新群聊' })).toBeInTheDocument();
  });

  it('switches active tab on click', () => {
    render(<MemoryRouter><MessageList /></MemoryRouter>);
    const unreadTab = screen.getByRole('tab', { name: /未读/ });
    fireEvent.click(unreadTab);
    expect(unreadTab).toHaveAttribute('aria-selected', 'true');
  });

  it('no longer renders 单聊/群聊 type filters (carried by 个人/团队 switch)', () => {
    render(<MemoryRouter><MessageList /></MemoryRouter>);
    expect(screen.queryByRole('tab', { name: /单聊/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /群聊/ })).not.toBeInTheDocument();
    // 全部 + 未读 仍在
    expect(screen.getByRole('tab', { name: /全部/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /未读/ })).toBeInTheDocument();
  });

  it('shows both TEAM RUNS and AGENT DMs sections on "全部" tab', () => {
    render(<MemoryRouter><MessageList /></MemoryRouter>);
    expect(screen.getByText('TEAM RUNS')).toBeInTheDocument();
    expect(screen.getByText('AGENT DMs')).toBeInTheDocument();
    expect(screen.getByText('Research Team')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });

  it('keeps both TEAM RUNS and AGENT DMs mixed on "全部" (no type filter)', () => {
    render(<MemoryRouter><MessageList /></MemoryRouter>);
    // 取消单聊/群聊切换后，全部 = 群聊 + 单聊 混合，两段都在
    expect(screen.getByText('TEAM RUNS')).toBeInTheDocument();
    expect(screen.getByText('AGENT DMs')).toBeInTheDocument();
    expect(screen.getByText('Research Team')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });

  it('shows only items with unread > 0 on "未读" tab', () => {
    render(<MemoryRouter><MessageList /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /未读/ }));
    // mockGroup has unreadCount=2, mockSecondAgent has unreadCount=1
    expect(screen.getByText('Research Team')).toBeInTheDocument();
    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.queryByText('Reviewer')).not.toBeInTheDocument();
  });

  it('filters the list by keyword after debounce', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MemoryRouter><MessageList /></MemoryRouter>);

    await user.type(screen.getByPlaceholderText('搜索群聊 / agent / 消息…'), 'review');
    await act(async () => { vi.advanceTimersByTime(300); });

    // "PI Sync" lastMessage "PI review scheduled tomorrow" contains "review"
    // Use getByRole because HighlightText splits matched text across <mark>/<span>
    expect(screen.getByRole('button', { name: /PI Sync/ })).toBeInTheDocument();
    // "Reviewer" agentName "Reviewer" contains "review" → text split by HighlightText
    expect(screen.getByRole('button', { name: /Reviewer/ })).toBeInTheDocument();
    // "Research Team" (name + lastMessage "Hello world") — no match
    expect(screen.queryByRole('button', { name: /Research Team/ })).not.toBeInTheDocument();
    // "Planner" — no match
    expect(screen.queryByRole('button', { name: /Planner/ })).not.toBeInTheDocument();
  });

  it('renders empty state when no results match', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MemoryRouter><MessageList /></MemoryRouter>);

    await user.type(screen.getByPlaceholderText('搜索群聊 / agent / 消息…'), 'zzz');
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('没有匹配的会话')).toBeInTheDocument();
      expect(screen.getByText("未找到 'zzz'")).toBeInTheDocument();
    });
  });

  it('clears the search and restores the list when clear button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MemoryRouter><MessageList /></MemoryRouter>);

    const input = screen.getByPlaceholderText('搜索群聊 / agent / 消息…');
    await user.type(input, 'zzz');
    vi.advanceTimersByTime(300);
    await screen.findByText('没有匹配的会话');

    await user.click(screen.getByRole('button', { name: '清空搜索' }));

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
      expect(screen.getByText('Research Team')).toBeInTheDocument();
      expect(screen.getByText('Reviewer')).toBeInTheDocument();
    });
  });

  it('clears the search when pressing Escape in the input', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MemoryRouter><MessageList /></MemoryRouter>);

    const input = screen.getByPlaceholderText('搜索群聊 / agent / 消息…');
    await user.click(input);
    await user.type(input, 'PI');
    vi.advanceTimersByTime(300);

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
      expect(screen.getByText('Research Team')).toBeInTheDocument();
      expect(screen.getByText('Reviewer')).toBeInTheDocument();
    });
  });

  it('applies tab and search filters with AND logic', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MemoryRouter><MessageList /></MemoryRouter>);

    await user.click(screen.getByRole('tab', { name: /未读/ }));
    await user.type(screen.getByPlaceholderText('搜索群聊 / agent / 消息…'), 'PI');
    await act(async () => { vi.advanceTimersByTime(300); });

    // 未读 tab: Research Team(unread=2) + Planner(unread=1) 才在候选内；
    // 再 AND 搜索 "PI"：Planner.lastMessage "PI summary is ready" 命中。
    expect(screen.getByRole('button', { name: /Planner/ })).toBeInTheDocument();
    // Research Team 文本不含 "PI" → 被搜索排除
    expect(screen.queryByRole('button', { name: /Research Team/ })).not.toBeInTheDocument();
    // Reviewer(unread=0) 被未读 tab 排除
    expect(screen.queryByRole('button', { name: /Reviewer/ })).not.toBeInTheDocument();
  });
});
