import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GroupItem, AgentDMItem } from '../../../common/types/inbox';
import { MessageItem } from './MessageItem';

const mockGroup: GroupItem = {
  id: 'g1',
  name: 'Research Team',
  templateId: 'academic-paper',
  status: 'running',
  unreadCount: 3,
  pendingApprovalsCount: 2,
  lastMessage: 'Agent has completed the literature review section.',
  lastActivityAt: '2026-04-24T08:00:00Z',
};

const mockAgent: AgentDMItem = {
  agentId: 'a1',
  agentName: 'Reviewer Agent',
  kind: 'acp',
  status: 'idle',
  unreadCount: 0,
  lastMessage: 'Waiting for next task.',
  lastActivityAt: '2026-04-24T07:00:00Z',
};

describe('MessageItem — GroupItem', () => {
  it('renders group name and last message preview', () => {
    render(<MessageItem item={mockGroup} onClick={vi.fn()} />);
    expect(screen.getByText('Research Team')).toBeInTheDocument();
    expect(screen.getByText(/Agent has completed/)).toBeInTheDocument();
  });

  it('shows unread badge when unreadCount > 0', () => {
    render(<MessageItem item={mockGroup} onClick={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows 99+ when unreadCount > 99', () => {
    render(<MessageItem item={{ ...mockGroup, unreadCount: 150 }} onClick={vi.fn()} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('shows pending approvals badge when pendingApprovalsCount > 0', () => {
    render(<MessageItem item={mockGroup} onClick={vi.fn()} />);
    expect(screen.getByText('📋 2')).toBeInTheDocument();
  });

  it('does not show unread badge when unreadCount is 0', () => {
    render(<MessageItem item={{ ...mockGroup, unreadCount: 0 }} onClick={vi.fn()} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('applies selected style when selected prop is true', () => {
    const { container } = render(
      <MessageItem item={mockGroup} selected onClick={vi.fn()} />
    );
    expect(container.firstChild).toHaveClass('border-l-[3px]');
  });
});

describe('MessageItem — AgentDMItem', () => {
  it('renders agent name', () => {
    render(<MessageItem item={mockAgent} onClick={vi.fn()} />);
    expect(screen.getByText('Reviewer Agent')).toBeInTheDocument();
  });

  it('does not show pending approvals badge for agent DMs', () => {
    const { container } = render(<MessageItem item={mockAgent} onClick={vi.fn()} />);
    expect(container.textContent).not.toContain('📋');
  });

  it('does not show unread badge when unreadCount is 0', () => {
    render(<MessageItem item={mockAgent} onClick={vi.fn()} />);
    // unreadCount=0 means no badge rendered
    const badges = screen.queryAllByText('0');
    expect(badges).toHaveLength(0);
  });
});
