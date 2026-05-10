/**
 * CritiqueResult.test.tsx — Story 15.14 — vitest unit tests.
 *
 * Verifies:
 *   - Renders 5 axes when scores supplied (Goal / Completeness / Structure / Grounding / Anti-pattern).
 *   - Adds 6th Policy axis when policy_compliance score supplied.
 *   - Renders the radar SVG polygon.
 *   - Degrades to "质量自检不可用" banner when scores=null.
 *   - Surfaces lint summary E/W/I.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CritiqueResult } from './CritiqueResult';
import type { CritiqueResultEvent } from '../api/runSessions';

const baseEvent: CritiqueResultEvent = {
  session_id: 's-1',
  artifact: 'team.blueprint.yml',
  scores: {
    goal_achievement: { score: 8, rationale: 'covers intent', improvement: 'clarify CRM scope' },
    skill_completeness: { score: 5, rationale: 'review running, no done', improvement: 'close review step' },
    structural_integrity: { score: 6, rationale: 'missing policy_matrix', improvement: 'add policy_matrix' },
    reference_grounding: { score: 7, rationale: 'uses sides', improvement: 'cite more refs' },
    anti_pattern_free: { score: 9, rationale: 'no fluff', improvement: '—' },
    policy_compliance: null,
  },
  overall_summary: 'Decent blueprint but completeness lags.',
  lint_summary: { errors: 1, warnings: 1, infos: 2 },
  duration_ms: 4321,
};

describe('<CritiqueResult />', () => {
  it('renders the 5 base axes (Goal / Completeness / Structure / Grounding / Anti-pattern)', () => {
    render(<CritiqueResult result={baseEvent} />);
    expect(screen.getByTestId('critique-result')).toBeTruthy();
    expect(screen.getByTestId('critique-row-goal_achievement')).toBeTruthy();
    expect(screen.getByTestId('critique-row-skill_completeness')).toBeTruthy();
    expect(screen.getByTestId('critique-row-structural_integrity')).toBeTruthy();
    expect(screen.getByTestId('critique-row-reference_grounding')).toBeTruthy();
    expect(screen.getByTestId('critique-row-anti_pattern_free')).toBeTruthy();
    // policy not rendered when null
    expect(screen.queryByTestId('critique-row-policy_compliance')).toBeNull();
  });

  it('shows axis labels Goal/Completeness/Structure/Grounding/Anti-pattern', () => {
    render(<CritiqueResult result={baseEvent} />);
    const txt = screen.getByTestId('critique-result').textContent ?? '';
    expect(txt).toContain('Goal');
    expect(txt).toContain('Completeness');
    expect(txt).toContain('Structure');
    expect(txt).toContain('Grounding');
    expect(txt).toContain('Anti-pattern');
  });

  it('renders the SVG radar polygon', () => {
    render(<CritiqueResult result={baseEvent} />);
    const svg = screen.getByTestId('critique-radar-svg');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const poly = screen.getByTestId('critique-radar-polygon') as unknown as SVGPolygonElement;
    expect(poly.tagName.toLowerCase()).toBe('polygon');
    const points = poly.getAttribute('points') ?? '';
    // 5 points minimum, comma-separated x,y pairs separated by spaces.
    expect(points.split(/\s+/).length).toBe(5);
  });

  it('adds the 6th Policy axis when policy_compliance score supplied', () => {
    const sixDim: CritiqueResultEvent = {
      ...baseEvent,
      scores: {
        ...baseEvent.scores!,
        policy_compliance: { score: 7, rationale: 'matches policy matrix', improvement: 'tighten allowlist' },
      },
    };
    render(<CritiqueResult result={sixDim} />);
    expect(screen.getByTestId('critique-row-policy_compliance')).toBeTruthy();
    const poly = screen.getByTestId('critique-radar-polygon') as unknown as SVGPolygonElement;
    expect((poly.getAttribute('points') ?? '').split(/\s+/).length).toBe(6);
    expect(screen.getByTestId('critique-result').textContent).toContain('Policy');
  });

  it('shows lint summary errors/warnings/infos', () => {
    render(<CritiqueResult result={baseEvent} />);
    const summary = screen.getByTestId('critique-lint-summary').textContent ?? '';
    expect(summary).toContain('1E');
    expect(summary).toContain('1W');
    expect(summary).toContain('2I');
  });

  it('degrades gracefully when scores=null', () => {
    const failed: CritiqueResultEvent = {
      ...baseEvent,
      scores: null,
      overall_summary: '[critique parse failed: bad json]',
      error_code: 'CRITIQUE_PARSE_FAILED',
      error_message: 'invalid json',
    };
    render(<CritiqueResult result={failed} />);
    expect(screen.queryByTestId('critique-radar-svg')).toBeNull();
    const banner = screen.getByTestId('critique-result-degraded');
    expect(banner.textContent).toContain('质量自检不可用');
    expect(banner.textContent).toContain('parse failed');
  });

  it('surfaces overall_summary text', () => {
    render(<CritiqueResult result={baseEvent} />);
    const sumEl = screen.getByTestId('critique-summary');
    expect(sumEl.textContent).toContain('Decent blueprint');
  });
});
