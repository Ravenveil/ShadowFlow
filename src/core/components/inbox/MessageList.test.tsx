import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageList } from './MessageList';

describe('MessageList', () => {
  it('renders the new group button and switches active tab', () => {
    render(<MessageList />);

    expect(screen.getByRole('button', { name: '+ 新群聊' })).toBeInTheDocument();

    const teamTab = screen.getByRole('tab', { name: '群聊' });
    fireEvent.click(teamTab);

    expect(teamTab).toHaveAttribute('aria-selected', 'true');
  });
});
