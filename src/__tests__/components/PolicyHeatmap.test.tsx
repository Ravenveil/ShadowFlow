/**
 * Story 4.9 — PolicyHeatmap render + 6-tier color test.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PolicyHeatmap, heatmapColor } from '../../core/components/Panel/PolicyHeatmap';

describe('PolicyHeatmap 6-tier color scale', () => {
  it('returns #18181B for 0', () => expect(heatmapColor(0)).toBe('#18181B'));
  it('maps 3 to tier-1 blue', () => expect(heatmapColor(3)).toBe('#1A2535'));
  it('maps 10 to tier-2 blue', () => expect(heatmapColor(10)).toBe('#1B3A6B'));
  it('maps 20 to tier-3 blue', () => expect(heatmapColor(20)).toBe('#1D5EA0'));
  it('maps 30 to warn orange', () => expect(heatmapColor(30)).toBe('#F59E0B'));
  it('maps 50 to danger red', () => expect(heatmapColor(50)).toBe('#EF4444'));
});

describe('PolicyHeatmap renders rows + stage columns + selection', () => {
  const rows = [
    { policy: 'legal_review', counts: { intent: 0, plan: 2, review: 12, execute: 4, deliver: 0 } },
    { policy: 'brand_guideline', counts: { intent: 1, plan: 0, review: 0, execute: 0, deliver: 6 } },
  ];

  it('renders a cell per (policy, stage)', () => {
    const onSelect = vi.fn();
    render(<PolicyHeatmap rows={rows} selected={null} onSelect={onSelect} />);
    expect(screen.getByTestId('heatmap-cell-legal_review-review').getAttribute('data-count')).toBe('12');
    expect(screen.getByTestId('heatmap-cell-brand_guideline-deliver').getAttribute('data-count')).toBe('6');
  });

  it('clicking a row label selects that policy', () => {
    const onSelect = vi.fn();
    render(<PolicyHeatmap rows={rows} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('heatmap-row-legal_review'));
    expect(onSelect).toHaveBeenCalledWith('legal_review');
  });

  it('empty-state placeholder shows when no rows', () => {
    render(<PolicyHeatmap rows={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText(/No rejection events/i)).toBeDefined();
  });
});
