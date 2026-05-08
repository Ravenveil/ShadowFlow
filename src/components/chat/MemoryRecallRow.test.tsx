import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRecallRow } from './MemoryRecallRow';

describe('MemoryRecallRow', () => {
  it('renders nothing when memories is 0', () => {
    const { container } = render(<MemoryRecallRow memories={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when memories is negative', () => {
    const { container } = render(<MemoryRecallRow memories={-1} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders singular "memory" for memories=1', () => {
    render(<MemoryRecallRow memories={1} />);
    expect(screen.getByText(/1 memory recalled/)).toBeInTheDocument();
  });

  it('renders plural "memories" for memories=3', () => {
    render(<MemoryRecallRow memories={3} />);
    expect(screen.getByText(/3 memories recalled/)).toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    render(<MemoryRecallRow memories={5} />);
    const el = screen.getByLabelText('Agent recalled 5 memories');
    expect(el).toBeInTheDocument();
  });
});
