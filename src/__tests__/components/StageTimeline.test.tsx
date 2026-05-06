/**
 * Story 4.8 / 4.9 — StageTimeline 5-stage + retry badge test.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageTimeline } from '../../core/components/Panel/StageTimeline';
import { Stage, StageResult } from '../../common/types/stage';

describe('StageTimeline', () => {
  it('renders 5 stage dots in canonical order', () => {
    render(<StageTimeline stages={[]} />);
    for (const name of ['intent', 'plan', 'review', 'execute', 'deliver']) {
      expect(screen.getByTestId(`stage-dot-${name}`)).toBeDefined();
    }
  });

  it('shows retry badge when retry_count > 0', () => {
    const stages: StageResult[] = [
      { name: Stage.Review, outcome: 'retried', retry_count: 2 },
    ];
    render(<StageTimeline stages={stages} />);
    const badge = screen.getByTestId('retry-badge-review');
    expect(badge.textContent).toMatch(/2× rejected/);
  });

  it('aborted outcome sets data-outcome attr', () => {
    const stages: StageResult[] = [
      { name: Stage.Deliver, outcome: 'aborted', retry_count: 0 },
    ];
    render(<StageTimeline stages={stages} />);
    expect(screen.getByTestId('stage-dot-deliver').getAttribute('data-outcome')).toBe('aborted');
  });
});
