/**
 * OrgSwitcher 测试 — 受控开关 + click-outside
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { OrgSwitcher } from '../../../components/workspace/chat/OrgSwitcher';

describe('OrgSwitcher', () => {
  it('renders trigger but not dropdown by default', () => {
    const { getByTestId, queryByTestId } = render(<OrgSwitcher />);
    expect(getByTestId('org-switcher-trigger')).toBeInTheDocument();
    expect(queryByTestId('org-switcher-dropdown')).not.toBeInTheDocument();
  });

  it('opens dropdown on trigger click', () => {
    const { getByTestId, queryByTestId } = render(<OrgSwitcher />);
    fireEvent.click(getByTestId('org-switcher-trigger'));
    expect(queryByTestId('org-switcher-dropdown')).toBeInTheDocument();
  });

  it('closes dropdown on second trigger click', () => {
    const { getByTestId, queryByTestId } = render(<OrgSwitcher />);
    const trigger = getByTestId('org-switcher-trigger');
    fireEvent.click(trigger);
    expect(queryByTestId('org-switcher-dropdown')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(queryByTestId('org-switcher-dropdown')).not.toBeInTheDocument();
  });

  it('closes dropdown on outside click (regression: click-outside cleanup)', () => {
    const { getByTestId, queryByTestId } = render(<OrgSwitcher />);
    fireEvent.click(getByTestId('org-switcher-trigger'));
    expect(queryByTestId('org-switcher-dropdown')).toBeInTheDocument();
    // Simulate mousedown outside the OrgSwitcher
    fireEvent.mouseDown(document.body);
    expect(queryByTestId('org-switcher-dropdown')).not.toBeInTheDocument();
  });
});
