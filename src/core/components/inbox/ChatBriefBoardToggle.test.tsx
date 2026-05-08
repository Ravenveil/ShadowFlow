import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatBriefBoardToggle } from './ChatBriefBoardToggle';

describe('ChatBriefBoardToggle', () => {
  it('renders Chat and briefBoardAlias segments', () => {
    render(
      <ChatBriefBoardToggle briefBoardAlias="日报" activeTab="chat" onChange={vi.fn()} />
    );
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '日报' })).toBeInTheDocument();
  });

  it('Chat segment is active when activeTab="chat"', () => {
    render(
      <ChatBriefBoardToggle briefBoardAlias="日报" activeTab="chat" onChange={vi.fn()} />
    );
    expect(screen.getByRole('tab', { name: 'Chat' }).className).toContain(
      'bg-shadowflow-accent'
    );
    expect(screen.getByRole('tab', { name: '日报' }).className).not.toContain(
      'bg-shadowflow-accent'
    );
  });

  it('BriefBoard segment is active when activeTab="briefboard"', () => {
    render(
      <ChatBriefBoardToggle briefBoardAlias="组会汇报" activeTab="briefboard" onChange={vi.fn()} />
    );
    expect(screen.getByRole('tab', { name: '组会汇报' }).className).toContain(
      'bg-shadowflow-accent'
    );
    expect(screen.getByRole('tab', { name: 'Chat' }).className).not.toContain(
      'bg-shadowflow-accent'
    );
  });

  it('calls onChange("briefboard") when clicking BriefBoard segment', () => {
    const onChange = vi.fn();
    render(
      <ChatBriefBoardToggle briefBoardAlias="日报" activeTab="chat" onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('tab', { name: '日报' }));
    expect(onChange).toHaveBeenCalledWith('briefboard');
  });

  it('calls onChange("chat") when clicking Chat segment', () => {
    const onChange = vi.fn();
    render(
      <ChatBriefBoardToggle briefBoardAlias="日报" activeTab="briefboard" onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(onChange).toHaveBeenCalledWith('chat');
  });
});
