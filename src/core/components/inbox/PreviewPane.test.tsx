import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PreviewPane } from './PreviewPane';

describe('PreviewPane', () => {
  it('shows the empty state without a selected group', () => {
    render(<PreviewPane />);

    expect(screen.getByText('选择一个会话查看详情')).toBeInTheDocument();
  });

  it('hides the empty state when a group is selected', () => {
    render(<PreviewPane groupId="group-1" />);

    expect(screen.queryByText('选择一个会话查看详情')).not.toBeInTheDocument();
    expect(screen.getByText('APPROVAL GATE')).toBeInTheDocument();
  });
});
