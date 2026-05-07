import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useInboxStore } from '../core/store/useInboxStore';
import type { AgentDMItem } from '../common/types/inbox';
import AgentDMPage from './AgentDMPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockAgent: AgentDMItem = {
  agentId: 'agent-001',
  agentName: 'ResearchBot',
  kind: 'acp',
  status: 'idle',
  unreadCount: 0,
  lastMessage: 'Done',
  lastActivityAt: '2026-04-25T08:00:00Z',
};

beforeEach(() => {
  useInboxStore.setState({ agentDMs: [mockAgent], loading: false, error: null });
  mockNavigate.mockReset();
});

function renderAgentDMPage(agentId = 'agent-001') {
  return render(
    <MemoryRouter initialEntries={[`/agent-dm/${agentId}`]}>
      <Routes>
        <Route path="/agent-dm/:agentId" element={<AgentDMPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AgentDMPage — Create Agent button (AC1, Story 7.8)', () => {
  it('renders breadcrumb with agent name', () => {
    renderAgentDMPage();
    expect(screen.getByText('ResearchBot')).toBeInTheDocument();
  });

  it('renders agent kind and status metadata', () => {
    renderAgentDMPage();
    expect(screen.getByText(/kind: acp/)).toBeInTheDocument();
    expect(screen.getByText(/status: idle/)).toBeInTheDocument();
  });

  it('renders "创建类似 Agent" button', () => {
    renderAgentDMPage();
    expect(screen.getByRole('button', { name: '创建类似 Agent' })).toBeInTheDocument();
  });

  it('button is disabled when VITE_BUILDER_ENABLED is not set (Builder not yet live)', () => {
    renderAgentDMPage();
    const btn = screen.getByRole('button', { name: '创建类似 Agent' });
    // Default env: VITE_BUILDER_ENABLED is undefined → button should be disabled
    expect(btn).toBeDisabled();
  });

  it('shows tooltip text "Builder 即将可用" when hovering disabled button', () => {
    renderAgentDMPage();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip').textContent).toContain('Builder 即将可用');
  });

  it('renders Phase 2 mock DM composer for the agent', () => {
    renderAgentDMPage();
    // Phase 2 mock view: composer placeholder is keyed off the agent name.
    expect(screen.getByPlaceholderText('发消息给 ResearchBot ...')).toBeInTheDocument();
  });
});
