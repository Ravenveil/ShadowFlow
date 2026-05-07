/**
 * TeamPage tests — Story 12.2 AC1, AC4, AC5
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as teamsApi from '../api/teams';
import { TeamListPage, TeamDetailPage } from './TeamPage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../api/teams', () => ({
  listTeams: vi.fn(),
  getTeam: vi.fn(),
  deleteTeam: vi.fn(),
  createTeam: vi.fn(),
  patchTeam: vi.fn(),
  TeamApiError: class TeamApiError extends Error {
    constructor(public status: number, public detail: unknown) { super(); }
  },
}));

vi.mock('../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([]),
}));

const mockListTeams = teamsApi.listTeams as ReturnType<typeof vi.fn>;
const mockGetTeam = teamsApi.getTeam as ReturnType<typeof vi.fn>;

function makeTeam(overrides = {}): teamsApi.TeamRecord {
  return {
    team_id: 'team-abc123',
    name: 'Research Lab',
    description: 'Paper writers',
    workspace_id: 'default',
    agent_ids: ['agent-1', 'agent-2'],
    created_at: '2026-04-27T00:00:00Z',
    updated_at: '2026-04-27T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TeamListPage
// ---------------------------------------------------------------------------

describe('TeamListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockListTeams.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><TeamListPage /></MemoryRouter>);
    expect(screen.getByTestId('team-loading')).toBeInTheDocument();
  });

  it('shows empty state when no teams (AC1)', async () => {
    mockListTeams.mockResolvedValue([]);
    render(<MemoryRouter><TeamListPage /></MemoryRouter>);
    expect(await screen.findByTestId('empty-new-team-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('team-list')).not.toBeInTheDocument();
  });

  it('shows team list when teams exist (AC4)', async () => {
    mockListTeams.mockResolvedValue([makeTeam()]);
    render(<MemoryRouter><TeamListPage /></MemoryRouter>);
    expect(await screen.findByTestId('team-list')).toBeInTheDocument();
    expect(screen.getByTestId('team-card-team-abc123')).toBeInTheDocument();
  });

  it('header has "+ 新建 Team" button', async () => {
    mockListTeams.mockResolvedValue([]);
    render(<MemoryRouter><TeamListPage /></MemoryRouter>);
    await screen.findByTestId('empty-new-team-btn');
    expect(screen.getByTestId('new-team-btn')).toBeInTheDocument();
  });

  it('opens create modal when "+ 新建 Team" clicked', async () => {
    mockListTeams.mockResolvedValue([]);
    render(<MemoryRouter><TeamListPage /></MemoryRouter>);
    await screen.findByTestId('new-team-btn');
    await userEvent.click(screen.getByTestId('new-team-btn'));
    expect(screen.getByTestId('create-team-modal')).toBeInTheDocument();
  });

  it('shows error banner on load failure', async () => {
    const { TeamApiError } = await import('../api/teams');
    mockListTeams.mockRejectedValue(new TeamApiError(500, 'err'));
    render(<MemoryRouter><TeamListPage /></MemoryRouter>);
    expect(await screen.findByText(/加载失败/)).toBeInTheDocument();
  });

  it('prepends new team to list after creation (AC4)', async () => {
    const existing = makeTeam({ team_id: 'team-old', name: 'Old Team' });
    mockListTeams.mockResolvedValue([existing]);
    render(<MemoryRouter><TeamListPage /></MemoryRouter>);
    await screen.findByTestId('team-list');

    // The list should contain the existing team card
    expect(screen.getByTestId('team-card-team-old')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TeamDetailPage
// ---------------------------------------------------------------------------

describe('TeamDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderDetailPage(teamId: string) {
    return render(
      <MemoryRouter initialEntries={[`/teams/${teamId}`]}>
        <Routes>
          <Route path="/teams/:teamId" element={<TeamDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows loading state (AC5)', () => {
    mockGetTeam.mockReturnValue(new Promise(() => {}));
    renderDetailPage('team-abc123');
    expect(screen.getByTestId('team-detail-loading')).toBeInTheDocument();
  });

  it('renders team detail on success (AC5)', async () => {
    mockGetTeam.mockResolvedValue(makeTeam());
    renderDetailPage('team-abc123');
    expect(await screen.findByTestId('team-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('detail-team-name')).toHaveTextContent('Research Lab');
  });

  it('shows error on 404', async () => {
    const { TeamApiError } = await import('../api/teams');
    mockGetTeam.mockRejectedValue(new TeamApiError(404, 'not found'));
    renderDetailPage('team-missing');
    await waitFor(() => expect(screen.queryByTestId('team-detail-loading')).not.toBeInTheDocument());
    expect(screen.getByText(/错误/)).toBeInTheDocument();
  });
});
