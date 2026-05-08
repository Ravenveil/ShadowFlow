import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('renders Running for running status', () => {
    const { container } = render(<StatusPill status="running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('rounded-full');
  });

  it('renders Blocked for blocked status', () => {
    render(<StatusPill status="blocked" />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('renders Idle for idle status', () => {
    render(<StatusPill status="idle" />);
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('renders Pending Approval for pending_approval status', () => {
    render(<StatusPill status="pending_approval" />);
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
  });
});
