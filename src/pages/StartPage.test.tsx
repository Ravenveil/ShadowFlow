import { render, screen, waitFor } from '../test/utils';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock catalog API
vi.mock('../api/catalog', () => ({
  listCatalogApps: vi.fn(),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { listCatalogApps } from '../api/catalog';
import StartPage from './StartPage';

function renderStartPage() {
  return render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  );
}

function _mkApp(id: string, name: string, publishedAt: string) {
  return {
    app_id: id,
    name,
    goal: '',
    kit_type: 'custom',
    author: '',
    published_at: publishedAt,
    fork_count: 0,
    forked_from: null,
    template_id: '',
    workflow_id: '',
    blueprint_id: id,
  };
}

function _appsResp(apps: ReturnType<typeof _mkApp>[]) {
  return {
    data: { apps },
    meta: { total: apps.length, page: 1, page_size: 3, kit_type: 'all', q: '' },
  };
}

function _emptyResp() {
  return _appsResp([]);
}

describe('StartPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(listCatalogApps).mockResolvedValue(_emptyResp());
  });

  it('renders the start page container', async () => {
    renderStartPage();
    expect(await screen.findByTestId('start-page')).toBeInTheDocument();
  });

  it('renders all three primitive cards', async () => {
    renderStartPage();
    expect(await screen.findByTestId('primitive-card-agent')).toBeInTheDocument();
    expect(screen.getByTestId('primitive-card-team')).toBeInTheDocument();
    expect(screen.getByTestId('primitive-card-templates')).toBeInTheDocument();
  });

  it('renders correct card titles', async () => {
    renderStartPage();
    expect(await screen.findByText('创建 Agent')).toBeInTheDocument();
    expect(screen.getByText('创建 Agent Team')).toBeInTheDocument();
    expect(screen.getByText('从模板开始')).toBeInTheDocument();
  });

  it('clicking "创建 Agent" card navigates to /builder?mode=single', async () => {
    const user = userEvent.setup();
    renderStartPage();
    const card = await screen.findByTestId('primitive-card-agent');
    await user.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/builder?mode=single');
  });

  it('clicking "创建 Agent Team" card navigates to /builder?mode=team', async () => {
    const user = userEvent.setup();
    renderStartPage();
    const card = await screen.findByTestId('primitive-card-team');
    await user.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/builder?mode=team');
  });

  it('clicking "从模板开始" card navigates to /templates', async () => {
    const user = userEvent.setup();
    renderStartPage();
    const card = await screen.findByTestId('primitive-card-templates');
    await user.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });

  it('shows empty state when no recent apps', async () => {
    vi.mocked(listCatalogApps).mockResolvedValue(_emptyResp());
    renderStartPage();
    expect(await screen.findByText('暂无最近记录')).toBeInTheDocument();
  });

  it('shows empty state when catalog API fails', async () => {
    vi.mocked(listCatalogApps).mockRejectedValue(new Error('network error'));
    renderStartPage();
    expect(await screen.findByText('暂无最近记录')).toBeInTheDocument();
  });

  it('logs warning when catalog API fails (Round-1 M2)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(listCatalogApps).mockRejectedValue(new Error('boom'));
    renderStartPage();
    await screen.findByText('暂无最近记录');
    expect(warnSpy).toHaveBeenCalledWith(
      '[StartPage] listCatalogApps failed:',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('shows recent apps list when data is available', async () => {
    vi.mocked(listCatalogApps).mockResolvedValue(
      _appsResp([
        _mkApp('1', 'My Agent', '2026-04-01T00:00:00Z'),
        _mkApp('2', 'Team Alpha', '2026-04-10T00:00:00Z'),
      ]),
    );
    renderStartPage();
    expect(await screen.findByText('My Agent')).toBeInTheDocument();
    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
  });

  it('calls listCatalogApps with page_size 3', async () => {
    renderStartPage();
    await waitFor(() => {
      expect(listCatalogApps).toHaveBeenCalledWith({ page_size: 3 });
    });
  });
});
