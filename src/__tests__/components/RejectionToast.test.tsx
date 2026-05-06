/**
 * Story 4.3 AC1 — RejectionToast rendering tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RejectionToastContainer } from '../../core/components/Toast/RejectionToast';
import { useRejectionToastStore } from '../../core/stores/useRejectionToastStore';

function store() {
  return useRejectionToastStore.getState();
}

function reset() {
  useRejectionToastStore.setState({ visible: [], queue: [] });
}

describe('RejectionToastContainer', () => {
  beforeEach(() => {
    reset();
    vi.useFakeTimers();
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(<RejectionToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toast after push', () => {
    store().push({ sender: 'editor', receiver: 'writer', reason: 'off-topic' });
    render(<RejectionToastContainer />);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Policy Matrix/)).toBeDefined();
    expect(screen.getByText(/editor/)).toBeDefined();
    expect(screen.getByText(/writer/)).toBeDefined();
  });

  it('toast has font-size ≥ 18px (FR21 hard requirement)', () => {
    store().push({ sender: 'A', receiver: 'B', reason: '' });
    render(<RejectionToastContainer />);
    const alert = screen.getByRole('alert');
    const fontSize = parseInt(alert.style.fontSize, 10);
    expect(fontSize).toBeGreaterThanOrEqual(18);
  });

  it('auto-dismisses after 5 seconds', () => {
    store().push({ sender: 'A', receiver: 'B', reason: '' });
    render(<RejectionToastContainer />);
    expect(screen.getByRole('alert')).toBeDefined();
    act(() => vi.advanceTimersByTime(5001));
    expect(store().visible).toHaveLength(0);
  });

  it('caps visible toasts at 3', () => {
    for (let i = 0; i < 5; i++) {
      store().push({ sender: `S${i}`, receiver: `R${i}`, reason: '' });
    }
    expect(store().visible).toHaveLength(3);
    expect(store().queue).toHaveLength(2);
  });

  it('promotes from queue when visible slot opens', () => {
    for (let i = 0; i < 4; i++) {
      store().push({ sender: `S${i}`, receiver: `R${i}`, reason: '' });
    }
    expect(store().visible).toHaveLength(3);
    expect(store().queue).toHaveLength(1);
    store().dismiss(store().visible[0].id);
    expect(store().visible).toHaveLength(3);
    expect(store().queue).toHaveLength(0);
  });
});

describe('useRejectionToastStore', () => {
  beforeEach(reset);

  it('starts empty', () => {
    expect(store().visible).toHaveLength(0);
    expect(store().queue).toHaveLength(0);
  });

  it('dismiss removes item', () => {
    store().push({ sender: 'x', receiver: 'y', reason: 'r' });
    const id = store().visible[0].id;
    store().dismiss(id);
    expect(store().visible).toHaveLength(0);
  });
});
