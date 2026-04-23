import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NarrowNav } from './NarrowNav';

describe('NarrowNav', () => {
  it('renders all navigation buttons with message active', () => {
    render(<NarrowNav />);

    expect(screen.getByLabelText('消息')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('模板')).toBeInTheDocument();
    expect(screen.getByLabelText('运行')).toBeInTheDocument();
    expect(screen.getByLabelText('归档')).toBeInTheDocument();
  });
});
