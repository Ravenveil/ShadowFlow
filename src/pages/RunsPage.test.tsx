/**
 * RunsPage tests — /runs list + /runs/:runId projections
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as runsApi from '../api/runs';
import { RunsListPage, RunDetailPage } from './RunsPage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../api/runs', () => ({
  listRuns: vi.fn(),
  getRunGraph: vi.fn(),
  getTaskTree: vi.fn(),
  getArtifactLineage: vi.fn(),
  getMemoryGraph: vi.fn(),
  getCheckpointLineage: vi.fn(),
  getActivationTrainingDataset: vi.fn(),
  RunsApiError: class RunsApiError extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`Runs API error ${status}`);
    }
  },
}));

const mockListRuns = runsApi.listRuns as ReturnType<typeof vi.fn>;
const mockGetRunGraph = runsApi.getRunGraph as ReturnType<typeof vi.fn>;
const mockGetTaskTree = runsApi.getTaskTree as ReturnType<typeof vi.fn>;
const mockGetArtifactLineage = runsApi.getArtifactLineage as ReturnType<typeof vi.fn>;
const mockGetMemoryGraph = runsApi.getMemoryGraph as ReturnType<typeof vi.fn>;
const mockGetCheckpointLineage = runsApi.getCheckpointLineage as ReturnType<typeof vi.fn>;
const mockGetActivationTrainingDataset = runsApi.getActivationTrainingDataset as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRunSummary(overrides: Partial<runsApi.RunSummary> = {}): runsApi.RunSummary {
  return {
    run_id: 'run-abc123',
    request_id: 'req-001',
    workflow_id: 'wf-main',
    status: 'succeeded',
    started_at: '2026-05-01T10:00:00Z',
    ended_at: '2026-05-01T10:01:30Z',
    metadata: {},
    ...overrides,
  };
}

// Story 15.8 — RunsListPage now consumes RunRecord (persisted run history).
// Provide a separate factory; the legacy makeRunSummary is preserved for any
// future projection-graph tests that need the old shape.
function makeRunRecord(overrides: Partial<runsApi.RunRecord> = {}): runsApi.RunRecord {
  return {
    run_id: 'run-abc123',
    session_id: 'sess-abc12345-deadbeef',
    goal: '生成 Agent Team Blueprint',
    skill_name: 'agent-team-blueprint',
    skill_display_name: 'Agent Team Blueprint',
    artifact_type: 'yaml',
    artifact_filename: 'team_blueprint.yml',
    artifact_url: '/projects/sess-abc12345-deadbeef/team_blueprint.yml',
    status: 'completed',
    created_at: '2026-05-10T10:00:00Z',
    completed_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    project_dir: '.shadowflow/projects/sess-abc12345-deadbeef',
    ...overrides,
  };
}

function makeRunGraph(): runsApi.RunGraph {
  return {
    projection_kind: 'run_graph',
    version: 'v1',
    run_id: 'run-abc123',
    workflow_id: 'wf-main',
    status: 'succeeded',
    entrypoint: 'node-start',
    scope: {},
    summary: {},
    filters: {},
    metadata: {},
    nodes: [
      {
        id: 'node-start',
        label: 'Start',
        kind: 'input',
        type: 'input',
        entity_type: 'workflow_node',
        status: 'succeeded',
        entrypoint: true,
        refs: {},
        metadata: {},
      },
      {
        id: 'node-end',
        label: 'End',
        kind: 'output',
        type: 'output',
        entity_type: 'workflow_node',
        status: 'succeeded',
        entrypoint: false,
        refs: {},
        metadata: {},
      },
    ],
    edges: [
      {
        from_id: 'node-start',
        to_id: 'node-end',
        type: 'control_flow',
        intervention: false,
        metadata: {},
      },
    ],
  };
}

function makeTaskTree(): runsApi.TaskTreeProjection {
  return {
    projection_kind: 'task_tree',
    version: 'v1',
    scope: { run_id: 'run-abc123' },
    summary: {},
    filters: {},
    metadata: {},
    nodes: [
      {
        id: 'task-root',
        entity_type: 'task',
        label: 'Root Task',
        status: 'succeeded',
        parent_id: undefined,
        refs: {},
        timestamps: {},
        metadata: {},
      },
      {
        id: 'task-child',
        entity_type: 'step',
        label: 'Child Step',
        status: 'succeeded',
        parent_id: 'task-root',
        refs: {},
        timestamps: {},
        metadata: {},
      },
    ],
    edges: [],
  };
}

function makeArtifactLineage(): runsApi.ArtifactLineageProjection {
  return {
    projection_kind: 'artifact_lineage_graph',
    version: 'v1',
    scope: { run_id: 'run-abc123' },
    summary: {},
    filters: {},
    metadata: {},
    nodes: [
      {
        id: 'art-001',
        entity_type: 'artifact',
        label: 'report.pdf',
        status: undefined,
        parent_id: undefined,
        refs: {},
        timestamps: {},
        metadata: {},
      },
    ],
    edges: [],
  };
}

function makeTrainingDataset(): runsApi.ActivationTrainingDataset {
  return {
    dataset_kind: 'activation_training_dataset',
    version: 'v1',
    scope: { run_id: 'run-abc123' },
    summary: {},
    metadata: {},
    samples: [
      {
        sample_id: 'samp-001',
        run_id: 'run-abc123',
        workflow_id: 'wf-main',
        node_id: 'node-start',
        step_status: 'succeeded',
        activation_mode: 'auto',
        activation_decision: 'activate',
        candidate_count: 3,
        selected_candidate_count: 1,
        selected_candidate_ids: ['cand-1'],
        candidates: [],
        feedback_ids: [],
        reward_hints: {},
        signals: {},
        metadata: {},
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// RunsListPage tests
// ---------------------------------------------------------------------------

describe('RunsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockListRuns.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    expect(screen.getByText('加载中…')).toBeInTheDocument();
  });

  it('shows empty state when no runs', async () => {
    mockListRuns.mockResolvedValue([]);
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    expect(await screen.findByText(/还没有任何 Run/)).toBeInTheDocument();
    expect(screen.queryByTestId('runs-table')).not.toBeInTheDocument();
  });

  it('renders run table when runs exist', async () => {
    mockListRuns.mockResolvedValue([makeRunRecord()]);
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    expect(await screen.findByTestId('runs-table')).toBeInTheDocument();
    expect(screen.getByTestId('run-row-run-abc123')).toBeInTheDocument();
  });

  it('renders goal, skill, artifact badge, relative time for each run', async () => {
    mockListRuns.mockResolvedValue([makeRunRecord({ goal: '我想要的目标 X' })]);
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    await screen.findByTestId('runs-table');
    // Goal cell renders the goal text
    expect(screen.getByTestId('run-goal-run-abc123')).toHaveTextContent('我想要的目标 X');
    // Skill display name
    expect(screen.getByTestId('run-skill-run-abc123')).toHaveTextContent('Agent Team Blueprint');
    // Artifact badge — yaml
    expect(screen.getByTestId('run-artifact-badge-yaml')).toBeInTheDocument();
    // Relative time — "X 分钟前" given completed_at = now-3min
    expect(screen.getByTestId('run-time-run-abc123').textContent).toMatch(/分钟前|刚刚/);
  });

  it('truncates long goals to 60 chars', async () => {
    const longGoal = '一'.repeat(80);
    mockListRuns.mockResolvedValue([makeRunRecord({ goal: longGoal })]);
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    await screen.findByTestId('runs-table');
    // Goal cell text should be truncated with ellipsis (60 chars + …)
    const cell = screen.getByTestId('run-goal-run-abc123');
    expect(cell.textContent?.length).toBeLessThanOrEqual(61); // 60 + ellipsis char
    expect(cell.textContent).toContain('…');
  });

  it('renders preview + download links when artifact exists', async () => {
    mockListRuns.mockResolvedValue([makeRunRecord()]);
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    await screen.findByTestId('runs-table');
    const preview = screen.getByTestId('run-preview-run-abc123');
    expect(preview).toHaveAttribute('href', '/projects/sess-abc12345-deadbeef/team_blueprint.yml');
    expect(screen.getByTestId('run-download-run-abc123')).toBeInTheDocument();
  });

  it('omits preview link when artifact_url is null', async () => {
    mockListRuns.mockResolvedValue([
      makeRunRecord({ artifact_url: null, artifact_type: null, artifact_filename: null }),
    ]);
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    await screen.findByTestId('runs-table');
    expect(screen.queryByTestId('run-preview-run-abc123')).not.toBeInTheDocument();
  });

  it('shows error banner on API failure', async () => {
    const { RunsApiError } = await import('../api/runs');
    mockListRuns.mockRejectedValue(new RunsApiError(500, 'server error'));
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    expect(await screen.findByText(/加载失败/)).toBeInTheDocument();
  });

  it('displays status pill (completed / failed) for each run', async () => {
    mockListRuns.mockResolvedValue([
      makeRunRecord({ status: 'completed' }),
      makeRunRecord({ run_id: 'run-2', status: 'failed' }),
    ]);
    render(<MemoryRouter><RunsListPage /></MemoryRouter>);
    await screen.findByTestId('runs-table');
    expect(screen.getAllByText('completed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('failed').length).toBeGreaterThan(0);
  });

  it('navigates to detail page on row click', async () => {
    mockListRuns.mockResolvedValue([makeRunRecord()]);
    // Setup detail page mock so navigation won't break
    mockGetRunGraph.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <MemoryRouter initialEntries={['/runs']}>
        <Routes>
          <Route path="/runs" element={<RunsListPage />} />
          <Route path="/runs/:runId" element={<div data-testid="detail-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    const row = await screen.findByTestId('run-row-run-abc123');
    await userEvent.click(row);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="detail-page"]')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// RunDetailPage tests
// ---------------------------------------------------------------------------

describe('RunDetailPage', () => {
  // Use a never-settling promise for inactive tabs — cheaper than re-creating per test
  const pending = () => new Promise<never>(() => {/* never resolves */});

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all projections stay loading (only active tab fetches)
    mockGetRunGraph.mockImplementation(pending);
    mockGetTaskTree.mockImplementation(pending);
    mockGetArtifactLineage.mockImplementation(pending);
    mockGetMemoryGraph.mockImplementation(pending);
    mockGetCheckpointLineage.mockImplementation(pending);
    mockGetActivationTrainingDataset.mockImplementation(pending);
  });

  function renderDetailPage(runId = 'run-abc123') {
    return render(
      <MemoryRouter initialEntries={[`/runs/${runId}`]}>
        <Routes>
          <Route path="/runs/:runId" element={<RunDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders run ID in header', () => {
    renderDetailPage();
    expect(screen.getByTestId('run-detail-id')).toHaveTextContent('run-abc123');
  });

  it('shows all 6 tabs', () => {
    renderDetailPage();
    expect(screen.getByTestId('tab-graph')).toBeInTheDocument();
    expect(screen.getByTestId('tab-task-tree')).toBeInTheDocument();
    expect(screen.getByTestId('tab-artifact-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('tab-memory-graph')).toBeInTheDocument();
    expect(screen.getByTestId('tab-checkpoint-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('tab-training-dataset')).toBeInTheDocument();
  });

  it('shows loading when graph tab is loading', () => {
    mockGetRunGraph.mockReturnValue(new Promise(() => {}));
    renderDetailPage();
    expect(screen.getByText('加载中…')).toBeInTheDocument();
  });

  it('renders run graph — fetch called and no error shown', async () => {
    // Use empty graph to avoid triggering ReactFlow render (mock has no default export)
    const emptyGraph = { ...makeRunGraph(), nodes: [], edges: [] };
    mockGetRunGraph.mockResolvedValue(emptyGraph);
    renderDetailPage();
    await waitFor(() => {
      expect(mockGetRunGraph).toHaveBeenCalledWith('run-abc123');
      expect(screen.queryByText(/加载失败/)).not.toBeInTheDocument();
    });
    // Empty state shown instead of canvas
    expect(await screen.findByText(/执行图为空/)).toBeInTheDocument();
  });

  it('shows error banner when graph fetch fails', async () => {
    const { RunsApiError } = await import('../api/runs');
    mockGetRunGraph.mockRejectedValue(new RunsApiError(500, 'error'));
    renderDetailPage();
    expect(await screen.findByText(/API 错误/)).toBeInTheDocument();
  });

  it('shows "Run 不存在" on 404', async () => {
    const { RunsApiError } = await import('../api/runs');
    mockGetRunGraph.mockRejectedValue(new RunsApiError(404, 'not found'));
    renderDetailPage();
    expect(await screen.findByText(/Run 不存在/)).toBeInTheDocument();
  });

  it('switches to Task Tree tab and fetches data', async () => {
    mockGetTaskTree.mockResolvedValue(makeTaskTree());
    renderDetailPage();

    const taskTreeTab = screen.getByTestId('tab-task-tree');
    await userEvent.click(taskTreeTab);

    await waitFor(() => {
      expect(mockGetTaskTree).toHaveBeenCalledWith('run-abc123');
    });
    expect(await screen.findByTestId('task-tree-view')).toBeInTheDocument();
  });

  it('task tree renders nested nodes', async () => {
    mockGetTaskTree.mockResolvedValue(makeTaskTree());
    renderDetailPage();

    await userEvent.click(screen.getByTestId('tab-task-tree'));
    expect(await screen.findByTestId('task-tree-node-task-root')).toBeInTheDocument();
    expect(screen.getByTestId('task-tree-node-task-child')).toBeInTheDocument();
  });

  it('switches to Artifact Lineage tab — fetch called', async () => {
    // Empty nodes to avoid ReactFlow render (mock has no default export)
    mockGetArtifactLineage.mockResolvedValue({ ...makeArtifactLineage(), nodes: [], edges: [] });
    renderDetailPage();

    await userEvent.click(screen.getByTestId('tab-artifact-lineage'));
    await waitFor(() => {
      expect(mockGetArtifactLineage).toHaveBeenCalledWith('run-abc123');
    });
    expect(await screen.findByText(/该 Run 没有此类投影数据/)).toBeInTheDocument();
  });

  it('switches to Training Dataset tab and renders table', async () => {
    mockGetActivationTrainingDataset.mockResolvedValue(makeTrainingDataset());
    renderDetailPage();

    await userEvent.click(screen.getByTestId('tab-training-dataset'));
    expect(await screen.findByTestId('training-dataset-view')).toBeInTheDocument();
    expect(screen.getByTestId('dataset-row-samp-001')).toBeInTheDocument();
  });

  it('back button navigates to /runs', async () => {
    mockGetRunGraph.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/runs/run-abc123']}>
        <Routes>
          <Route path="/runs/:runId" element={<RunDetailPage />} />
          <Route path="/runs" element={<div data-testid="runs-list" />} />
        </Routes>
      </MemoryRouter>,
    );

    const backBtn = screen.getByTestId('back-to-runs');
    await userEvent.click(backBtn);
    expect(await screen.findByTestId('runs-list')).toBeInTheDocument();
  });
});
