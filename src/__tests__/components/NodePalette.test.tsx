import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { NodePalette } from '../../core/components/sidebar/NodePalette';

describe('NodePalette', () => {
  it('renders default agent items', () => {
    const { getByText } = render(<NodePalette />);
    expect(getByText('Planner')).toBeTruthy();
    expect(getByText('Writer')).toBeTruthy();
    expect(getByText('Researcher')).toBeTruthy();
  });

  it('renders default gate items', () => {
    const { getByText } = render(<NodePalette />);
    expect(getByText('Retry Gate')).toBeTruthy();
    expect(getByText('Approval Gate')).toBeTruthy();
    expect(getByText('Fan-out')).toBeTruthy();
  });

  it('renders section labels', () => {
    const { getByText } = render(<NodePalette />);
    expect(getByText('Agents')).toBeTruthy();
    expect(getByText('Gates')).toBeTruthy();
  });

  it('palette items have draggable attribute', () => {
    const { getByText } = render(<NodePalette />);
    const planner = getByText('Planner').closest('[draggable]')!;
    expect(planner).toBeTruthy();
    expect(planner.getAttribute('draggable')).toBe('true');
  });
});
