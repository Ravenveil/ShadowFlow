import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CrystallizedBadge } from './CrystallizedBadge';

describe('CrystallizedBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the badge text', () => {
    render(<CrystallizedBadge />);
    expect(screen.getByText(/记忆已结晶/)).toBeInTheDocument();
  });

  it('auto-dismisses after default 5000ms', () => {
    const onDismiss = vi.fn();
    render(<CrystallizedBadge onDismiss={onDismiss} />);
    expect(screen.getByText(/记忆已结晶/)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(5000); });

    expect(screen.queryByText(/记忆已结晶/)).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('respects custom dismissAfterMs prop', () => {
    const onDismiss = vi.fn();
    render(<CrystallizedBadge dismissAfterMs={2000} onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(1999); });
    expect(screen.getByText(/记忆已结晶/)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText(/记忆已结晶/)).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('click dismisses immediately', () => {
    const onDismiss = vi.fn();
    render(<CrystallizedBadge onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('status'));
    expect(screen.queryByText(/记忆已结晶/)).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('hover pauses the dismiss timer', () => {
    const onDismiss = vi.fn();
    render(<CrystallizedBadge dismissAfterMs={5000} onDismiss={onDismiss} />);
    const badge = screen.getByRole('status');

    // hover in at t=2000 — 3000ms remain
    act(() => { vi.advanceTimersByTime(2000); });
    fireEvent.mouseEnter(badge);

    // advance well past original 5000ms deadline — should NOT dismiss
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText(/记忆已结晶/)).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    // mouse leave — timer resumes with ~3000ms remaining
    fireEvent.mouseLeave(badge);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText(/记忆已结晶/)).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('has role=status for live region', () => {
    render(<CrystallizedBadge />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
