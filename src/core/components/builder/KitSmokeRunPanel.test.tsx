/**
 * KitSmokeRunPanel tests — Story 10.6 (AC5)
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KitSmokeRunPanel } from './KitSmokeRunPanel';
import * as builderApi from '../../../api/builder';
import type {
  KitSmokeRunReport,
  KitRegressionReport,
} from '../../../api/builder';
import type { AgentBlueprint } from '../../../common/types/agent-builder';

vi.mock('../../../api/builder', async () => {
  const actual = await vi.importActual<typeof import('../../../api/builder')>(
    '../../../api/builder',
  );
  return {
    ...actual,
    runKitSmoke: vi.fn(),
    runKitRegression: vi.fn(),
  };
});

const mockSmoke = builderApi.runKitSmoke as ReturnType<typeof vi.fn>;
const mockRegression = builderApi.runKitRegression as ReturnType<typeof vi.fn>;

const blueprint = { name: 'x', goal: 'g', mode: 'single' } as unknown as AgentBlueprint;

const passedReport: KitSmokeRunReport = {
  kit_id: 'research_kit',
  passed: true,
  failed_stage: null,
  missing_configs: [],
  suggested_fixes: [],
  case_results: [
    {
      name: 'research_min_loop',
      passed: true,
      failed_stage: null,
      metrics: { artifact_completeness: 1.0 },
      missing_configs: [],
      suggested_fixes: [],
      detail: 'ok',
      duration_s: 0.01,
      error: null,
      citation_present: true,
    },
  ],
  summary_metrics: { smoke_pass_rate: 1.0 },
  duration_s: 0.05,
  timestamp: '2026-04-28T00:00:00Z',
  error: null,
};

const failedReport: KitSmokeRunReport = {
  ...passedReport,
  passed: false,
  failed_stage: 'Retriever',
  missing_configs: ['KnowledgePack not bound'],
  suggested_fixes: [
    { label: '绑定知识包', action_type: 'navigate', target: 'knowledge_dock' },
  ],
  case_results: [
    {
      name: 'doc_hit_path',
      passed: false,
      failed_stage: 'Retriever',
      metrics: {},
      missing_configs: ['KnowledgePack not bound'],
      suggested_fixes: [
        { label: '绑定知识包', action_type: 'navigate', target: 'knowledge_dock' },
      ],
      detail: '无可用 KnowledgePack',
      duration_s: 0.01,
      error: null,
      citation_present: false,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KitSmokeRunPanel', () => {
  it('renders the smoke-run-panel testid container', () => {
    render(<KitSmokeRunPanel kitId="research_kit" blueprint={blueprint} />);
    expect(screen.getByTestId('smoke-run-panel')).toBeInTheDocument();
  });

  it('runs smoke and renders pass header + case row', async () => {
    mockSmoke.mockResolvedValueOnce(passedReport);
    render(<KitSmokeRunPanel kitId="research_kit" blueprint={blueprint} />);
    await userEvent.click(screen.getByTestId('smoke-run-trigger'));
    await waitFor(() => screen.getByTestId('smoke-run-result'));
    expect(screen.getByTestId('smoke-run-status').textContent).toMatch(/通过/);
    expect(screen.getByTestId('smoke-case-research_min_loop')).toBeInTheDocument();
  });

  it('shows failure detail and fix-action button on click', async () => {
    mockSmoke.mockResolvedValueOnce(failedReport);
    const onNavigate = vi.fn();
    render(
      <KitSmokeRunPanel
        kitId="knowledge_assistant_kit"
        blueprint={blueprint}
        onNavigate={onNavigate}
      />,
    );
    await userEvent.click(screen.getByTestId('smoke-run-trigger'));
    await waitFor(() => screen.getByTestId('smoke-run-result'));
    await userEvent.click(screen.getByTestId('smoke-case-toggle-doc_hit_path'));
    const fixBtn = screen.getByTestId('fix-action-knowledge_dock');
    expect(fixBtn).toBeInTheDocument();
    await userEvent.click(fixBtn);
    expect(onNavigate).toHaveBeenCalledWith('knowledge_dock');
  });

  it('runs regression and renders comparison table', async () => {
    const regressionReport: KitRegressionReport = {
      kit_id: 'research_kit',
      baseline_timestamp: '2026-04-27T00:00:00Z',
      current: passedReport,
      baseline_comparison: [
        {
          metric: 'smoke_pass_rate',
          baseline: 1.0,
          current: 1.0,
          delta_pct: 0.0,
          verdict: 'pass',
        },
      ],
      regressions_detected: false,
      verdict: 'pass',
      reasons: [],
    };
    mockRegression.mockResolvedValueOnce(regressionReport);
    render(<KitSmokeRunPanel kitId="research_kit" blueprint={blueprint} />);
    await userEvent.click(screen.getByTestId('smoke-regression-trigger'));
    await waitFor(() => screen.getByTestId('regression-comparison'));
    expect(
      screen.getByTestId('regression-row-smoke_pass_rate'),
    ).toBeInTheDocument();
  });
});
