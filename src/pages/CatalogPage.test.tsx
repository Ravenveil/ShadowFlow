/**
 * CatalogPage tests — Story 8.7 (AC1, AC2, AC6, AC7, AC8)
 *
 * 验证：
 *   - 列表渲染 + 卡片关键字段
 *   - kit_type + 关键词组合过滤
 *   - 空态文案
 *   - Fork 成功跳转 /builder?blueprint_id=...&mode=scene
 *   - Fork 失败 toast（CATALOG_BLUEPRINT_INVALID 等错误码翻译）
 *   - 详情抽屉打开 + 关闭
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock the API module BEFORE importing the page
vi.mock('../api/catalog', () => ({
  listCatalogApps: vi.fn(),
  getCatalogApp: vi.fn(),
  forkCatalogApp: vi.fn(),
  CatalogApiError: class CatalogApiError extends Error {
    public readonly code: string;
    constructor(public status: number, public detail: unknown, code: string = '') {
      super(`Catalog API error ${status}`);
      this.code = code || `HTTP_${status}`;
    }
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import CatalogPage from './CatalogPage';
import * as catalogApi from '../api/catalog';

function makeApp(overrides: Record<string, unknown> = {}) {
  return {
    app_id: 'app-aaaaaa111111',
    name: 'Newsroom',
    goal: 'find breaking news',
    kit_type: 'research',
    author: 'alice',
    published_at: '2026-04-26T10:00:00Z',
    fork_count: 0,
    forked_from: null,
    template_id: '',
    workflow_id: '',
    blueprint_id: 'bp-test1',
    ...overrides,
  };
}

function makeListResponse(apps = [makeApp()]) {
  return {
    data: { apps },
    meta: {
      total: apps.length,
      page: 1,
      page_size: 20,
      kit_type: 'all',
      q: '',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CatalogPage', () => {
  it('renders cards with name + goal + Fork button', async () => {
    (catalogApi.listCatalogApps as any).mockResolvedValue(makeListResponse());

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Newsroom')).toBeInTheDocument();
    });
    expect(screen.getByText(/find breaking news/)).toBeInTheDocument();
    expect(screen.getByTestId('fork-btn-app-aaaaaa111111')).toBeInTheDocument();
  });

  it('shows empty state with Builder CTA when list is empty', async () => {
    (catalogApi.listCatalogApps as any).mockResolvedValue({
      data: { apps: [] },
      meta: { total: 0, page: 1, page_size: 20, kit_type: 'all', q: '' },
    });

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('catalog-empty')).toBeInTheDocument();
    expect(screen.getByText(/还没有已发布的 Agent/)).toBeInTheDocument();
    expect(screen.getByTestId('empty-builder-cta')).toBeInTheDocument();
  });

  it('shows "no match" when keyword filters out all apps', async () => {
    (catalogApi.listCatalogApps as any).mockResolvedValue(
      makeListResponse([makeApp({ app_id: 'app-1', name: 'Newsroom' })]),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    await screen.findByText('Newsroom');

    const search = screen.getByTestId('catalog-search-input');
    await user.type(search, 'absolutely-no-match');

    expect(await screen.findByTestId('catalog-no-match')).toBeInTheDocument();
  });

  it('combines kit_type filter with keyword search', async () => {
    (catalogApi.listCatalogApps as any).mockImplementation(({ kit_type }: { kit_type?: string }) => {
      if (kit_type === 'research') {
        return Promise.resolve(makeListResponse([
          makeApp({ app_id: 'app-r', name: 'Newsroom', kit_type: 'research' }),
        ]));
      }
      return Promise.resolve(makeListResponse([
        makeApp({ app_id: 'app-r', name: 'Newsroom', kit_type: 'research' }),
        makeApp({ app_id: 'app-v', name: 'News Reviewer', kit_type: 'review_approval' }),
      ]));
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    // First wait for default 'all' load
    await screen.findByText('Newsroom');

    // Click "Research" filter
    await user.click(screen.getByTestId('kit-filter-Research'));
    await waitFor(() => {
      expect(catalogApi.listCatalogApps).toHaveBeenCalledWith(expect.objectContaining({ kit_type: 'research' }));
    });

    // After server returns research-only data, search by keyword "news"
    await waitFor(() => expect(screen.getByText('Newsroom')).toBeInTheDocument());
    await user.type(screen.getByTestId('catalog-search-input'), 'news');

    // Newsroom matches (research + keyword); the other app is filtered out by kit_type before search
    expect(screen.getByText('Newsroom')).toBeInTheDocument();
    expect(screen.queryByText('News Reviewer')).not.toBeInTheDocument();
  });

  it('opens detail drawer on card click and closes on × button', async () => {
    (catalogApi.listCatalogApps as any).mockResolvedValue(makeListResponse());
    (catalogApi.getCatalogApp as any).mockResolvedValue({
      data: {
        ...makeApp(),
        mode: 'single',
        role_names: ['planner'],
        role_count: 1,
        description: 'find breaking news',
        blueprint_snapshot: { name: 'Newsroom' },
      },
      meta: { trace_id: 'trace-x' },
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    await screen.findByText('Newsroom');

    // Click the card body (not the Fork button)
    await user.click(screen.getByTestId('catalog-card-app-aaaaaa111111').querySelector('[role=button]')!);

    expect(await screen.findByTestId('catalog-detail-drawer')).toBeInTheDocument();
    expect(screen.getByText('Mode: single')).toBeInTheDocument();
    expect(screen.getByText('Roles: 1')).toBeInTheDocument();

    // Close
    await user.click(screen.getByTestId('catalog-detail-close'));
    expect(screen.queryByTestId('catalog-detail-drawer')).not.toBeInTheDocument();
  });

  it('fork success navigates to /builder?blueprint_id=...&mode=scene', async () => {
    (catalogApi.listCatalogApps as any).mockResolvedValue(makeListResponse());
    (catalogApi.forkCatalogApp as any).mockResolvedValue({
      data: {
        blueprint_id: 'bp-new-12345',
        forked_from: 'app-aaaaaa111111',
        blueprint: {
          blueprint_id: 'bp-new-12345',
          name: 'Newsroom',
          goal: 'find breaking news',
          metadata: { forked_from: 'app-aaaaaa111111' },
        },
      },
      meta: { trace_id: 'trace-y' },
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    await screen.findByText('Newsroom');

    await user.click(screen.getByTestId('fork-btn-app-aaaaaa111111'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/builder?blueprint_id=bp-new-12345&mode=scene');
    });
  });

  it('shows toast when fork fails with CATALOG_BLUEPRINT_INVALID', async () => {
    (catalogApi.listCatalogApps as any).mockResolvedValue(makeListResponse());
    const ApiErr = (catalogApi as unknown as { CatalogApiError: any }).CatalogApiError;
    (catalogApi.forkCatalogApp as any).mockRejectedValue(
      new ApiErr(400, { error: { code: 'CATALOG_BLUEPRINT_INVALID' } }, 'CATALOG_BLUEPRINT_INVALID'),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    await screen.findByText('Newsroom');
    await user.click(screen.getByTestId('fork-btn-app-aaaaaa111111'));

    expect(await screen.findByTestId('fork-error-toast')).toBeInTheDocument();
    expect(screen.getByText(/快照已损坏|与当前 Builder 合同不兼容/)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows toast when fork fails with CATALOG_APP_NOT_FOUND', async () => {
    (catalogApi.listCatalogApps as any).mockResolvedValue(makeListResponse());
    const ApiErr = (catalogApi as unknown as { CatalogApiError: any }).CatalogApiError;
    (catalogApi.forkCatalogApp as any).mockRejectedValue(
      new ApiErr(404, { error: { code: 'CATALOG_APP_NOT_FOUND' } }, 'CATALOG_APP_NOT_FOUND'),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    await screen.findByText('Newsroom');
    await user.click(screen.getByTestId('fork-btn-app-aaaaaa111111'));

    expect(await screen.findByTestId('fork-error-toast')).toBeInTheDocument();
    expect(screen.getByText(/原 Agent 已被删除/)).toBeInTheDocument();
  });
});
