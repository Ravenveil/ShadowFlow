import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusBadge } from '../../core/components/common/StatusBadge';

describe('StatusBadge', () => {
  const statuses = ['idle', 'pending', 'running', 'success', 'error', 'rejected'] as const;

  statuses.forEach((status) => {
    it(`renders ${status} status`, () => {
      const { container } = render(<StatusBadge status={status} />);
      expect(container.querySelector('span')).toBeTruthy();
    });
  });

  it('renders unknown status without crashing', () => {
    const { container } = render(<StatusBadge status="custom-status" />);
    expect(container.querySelector('span')).toBeTruthy();
  });
});
