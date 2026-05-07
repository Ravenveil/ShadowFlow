import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useInboxStore } from '../core/store/useInboxStore';
import type { GroupItem } from '../common/types/inbox';
import ChatPage from './ChatPage';

// jsdom doesn't ship EventSource. <ApprovalGatePanel> mounts in ChatPage's
// right column and constructs `new EventSource(...)`, so we stub a no-op
// implementation globally for every test.
class MockEventSource {
  url: string;
  readyState = 0;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onopen: ((ev: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGroup: GroupItem = {
  id: 'g1',
  name: 'Research Team',
  templateId: 'academic-paper',
  status: 'running',
  unreadCount: 2,
  pendingApprovalsCount: 0,
  lastMessage: 'Hello',
  lastActivityAt: '2026-04-24T08:00:00Z',
};

beforeEach(() => {
  vi.stubGlobal('EventSource', MockEventSource);
  useInboxStore.setState({ groups: [mockGroup], loading: false, error: null });

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/briefboard')) {
      return new Response(
        JSON.stringify({ data: { date: '2026-04-24', entries: [] } }),
        { status: 200 }
      );
    }
    if (url.includes('/templates/')) {
      return new Response(
        JSON.stringify({ template_id: 'academic-paper', brief_board_alias: '组会汇报' }),
        { status: 200 }
      );
    }
    if (url.includes('/approvals') || url.includes('/wallet')) {
      return new Response(JSON.stringify({ pending: [] }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockNavigate.mockReset();
});

function renderChatPage(groupId = 'g1') {
  return render(
    <MemoryRouter initialEntries={[`/chat/${groupId}`]}>
      <Routes>
        <Route path="/chat/:groupId" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ChatPage', () => {
  it('renders breadcrumb with Inbox link', () => {
    renderChatPage();
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
  });

  it('navigates back to / when Inbox breadcrumb is clicked', async () => {
    const user = userEvent.setup();
    renderChatPage();
    await user.click(screen.getByText('Inbox'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('renders GroupMetricsBar', () => {
    renderChatPage();
    expect(screen.getByTestId('group-metrics-bar')).toBeInTheDocument();
  });

  // AC1: Segmented control renders with Chat active by default
  it('renders ChatBriefBoardToggle with Chat active by default', async () => {
    renderChatPage();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Chat' }).className).toContain('bg-shadowflow-accent');
  });

  // AC2: Switching to BriefBoard shows BriefBoardView
  it('switches to BriefBoard view when clicking BriefBoard segment', async () => {
    renderChatPage();
    await waitFor(() => screen.getByRole('tab', { name: '组会汇报' }));
    fireEvent.click(screen.getByRole('tab', { name: '组会汇报' }));
    await waitFor(() =>
      expect(
        screen.getByText('今天暂无 Agent 产出 · 运行一个工作流开始协作')
      ).toBeInTheDocument()
    );
  });

  // AC3: Switching back to Chat hides BriefBoard content
  it('restores Chat view when clicking Chat segment again', async () => {
    renderChatPage();
    await waitFor(() => screen.getByRole('tab', { name: '组会汇报' }));
    fireEvent.click(screen.getByRole('tab', { name: '组会汇报' }));
    await waitFor(() => screen.getByText('今天暂无 Agent 产出 · 运行一个工作流开始协作'));
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(
      screen.queryByText('今天暂无 Agent 产出 · 运行一个工作流开始协作')
    ).not.toBeInTheDocument();
  });

  // Story 7.8 — AC1: "基于此对话创建 Agent" entry button
  it('renders "基于此对话创建 Agent" button', () => {
    renderChatPage();
    expect(screen.getByRole('button', { name: '基于此对话创建 Agent' })).toBeInTheDocument();
  });

  // Story 7.8 — AC1: button is disabled when VITE_BUILDER_ENABLED is not set
  it('button is disabled when Builder is not yet live', () => {
    renderChatPage();
    const btn = screen.getByRole('button', { name: '基于此对话创建 Agent' });
    expect(btn).toBeDisabled();
  });

  // Story 7.8 — AC1: tooltip present on disabled button
  it('shows tooltip "Builder 即将可用" on disabled button', () => {
    renderChatPage();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip').textContent).toContain('Builder 即将可用');
  });
});
