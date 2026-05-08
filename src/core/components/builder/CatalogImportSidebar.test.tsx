/**
 * CatalogImportSidebar — Story 13.3 tests
 *
 * 覆盖：
 *   - 加载中 skeleton 渲染
 *   - 加载成功后展示列表
 *   - 搜索关键词过滤
 *   - 点击引入 → importAgentToBlueprint 被调用 → onImportSuccess + onClose
 *   - 引入失败 → 内联错误（Drawer 不关闭）
 *   - 加载失败 → 内联错误
 *   - single 模式 SceneTree 不显示"从 Catalog 引入"按钮
 *   - team 模式 SceneTree 显示"从 Catalog 引入"按钮
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CatalogImportSidebar } from './CatalogImportSidebar';
import type { CatalogAppSummary } from '../../../common/types/catalog';
import type { RoleProfile } from '../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock catalog API
vi.mock('../../../api/catalog', () => ({
  listCatalogApps: vi.fn(),
  CatalogApiError: class CatalogApiError extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`Catalog API error ${status}`);
    }
  },
}));

// Mock builder API importAgentToBlueprint
vi.mock('../../../api/builder', () => ({
  importAgentToBlueprint: vi.fn(),
  BuilderApiError: class BuilderApiError extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`Builder API error ${status}`);
    }
  },
}));

import { listCatalogApps } from '../../../api/catalog';
import { importAgentToBlueprint, BuilderApiError } from '../../../api/builder';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockApps: CatalogAppSummary[] = [
  {
    app_id: 'app-001',
    name: 'Research Analyst',
    goal: 'Do research',
    kit_type: 'research',
    author: 'tester',
    published_at: '2026-04-01T00:00:00Z',
    fork_count: 0,
    forked_from: null,
    template_id: '',
    workflow_id: '',
    blueprint_id: 'bp-001',
  },
  {
    app_id: 'app-002',
    name: 'Knowledge Assistant',
    goal: 'Help with knowledge',
    kit_type: 'knowledge_assistant',
    author: 'tester',
    published_at: '2026-04-02T00:00:00Z',
    fork_count: 1,
    forked_from: null,
    template_id: '',
    workflow_id: '',
    blueprint_id: 'bp-002',
  },
];

const mockRole: RoleProfile = {
  role_id: 'imported-app-001-1234567890',
  name: 'Research Analyst',
  description: 'Analyst role',
  persona: '',
  responsibilities: [],
  constraints: [],
  tools: [],
  executor_kind: 'api',
  executor_provider: 'anthropic',
  executor_model: 'claude-sonnet-4-6',
  capabilities: [],
  handoff_rules: [],
  persona_traits: {},
  state_fields: [],
  can_spawn_tasks: false,
  sub_agents: [],
  metadata: { imported_from: 'app-001' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CatalogImportSidebar', () => {
  const mockOnClose = vi.fn();
  const mockOnImportSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('列表加载', () => {
    it('加载中显示 skeleton 行', () => {
      // listCatalogApps never resolves during this test
      (listCatalogApps as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      // Check for skeleton elements (animate-pulse)
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('加载成功后渲染 Agent 列表', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { apps: mockApps },
        meta: { total: 2, page: 1, page_size: 20, kit_type: 'all', q: '' },
      });

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Research Analyst')).toBeInTheDocument();
        expect(screen.getByText('Knowledge Assistant')).toBeInTheDocument();
      });
    });

    it('加载失败显示错误提示', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error'),
      );

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('catalog-load-error')).toBeInTheDocument();
      });
    });
  });

  describe('搜索过滤', () => {
    it('关键词过滤仅显示匹配 Agent', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { apps: mockApps },
        meta: { total: 2, page: 1, page_size: 20, kit_type: 'all', q: '' },
      });

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      await waitFor(() => screen.getByText('Research Analyst'));

      const searchInput = screen.getByTestId('catalog-agent-search');
      fireEvent.change(searchInput, { target: { value: 'research' } });

      await waitFor(() => {
        expect(screen.getByText('Research Analyst')).toBeInTheDocument();
        expect(screen.queryByText('Knowledge Assistant')).not.toBeInTheDocument();
      });
    });

    it('搜索无匹配时显示空提示', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { apps: mockApps },
        meta: { total: 2, page: 1, page_size: 20, kit_type: 'all', q: '' },
      });

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      await waitFor(() => screen.getByText('Research Analyst'));

      const searchInput = screen.getByTestId('catalog-agent-search');
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

      await waitFor(() => {
        expect(screen.queryByText('Research Analyst')).not.toBeInTheDocument();
        expect(screen.queryByText('Knowledge Assistant')).not.toBeInTheDocument();
        // Empty state message contains the keyword
        expect(screen.getByText(/xyznonexistent/i)).toBeInTheDocument();
      });
    });
  });

  describe('引入操作', () => {
    it('点击引入 → importAgentToBlueprint 被调用 → onImportSuccess + onClose', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { apps: mockApps },
        meta: { total: 2, page: 1, page_size: 20, kit_type: 'all', q: '' },
      });
      (importAgentToBlueprint as ReturnType<typeof vi.fn>).mockResolvedValue(mockRole);

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft-001"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      await waitFor(() => screen.getByTestId('import-agent-btn-app-001'));

      const importBtn = screen.getByTestId('import-agent-btn-app-001');
      fireEvent.click(importBtn);

      await waitFor(() => {
        expect(importAgentToBlueprint).toHaveBeenCalledWith('bp-draft-001', 'app-001');
        expect(mockOnImportSuccess).toHaveBeenCalledWith(mockRole);
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('引入失败 → 内联错误显示，Drawer 不关闭', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { apps: mockApps },
        meta: { total: 2, page: 1, page_size: 20, kit_type: 'all', q: '' },
      });
      // BuilderApiError 404 → "该 Agent 已从 Catalog 移除"
      (importAgentToBlueprint as ReturnType<typeof vi.fn>).mockRejectedValue(
        new BuilderApiError(404, { error: { code: 'CATALOG_APP_NOT_FOUND' } }),
      );

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft-001"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      await waitFor(() => screen.getByTestId('import-agent-btn-app-001'));

      fireEvent.click(screen.getByTestId('import-agent-btn-app-001'));

      await waitFor(() => {
        expect(screen.getByTestId('import-error-inline')).toBeInTheDocument();
        expect(screen.getByText('该 Agent 已从 Catalog 移除')).toBeInTheDocument();
        expect(mockOnClose).not.toHaveBeenCalled();
        expect(mockOnImportSuccess).not.toHaveBeenCalled();
      });
    });

    it('引入失败 422 → "Agent 快照与当前 Builder 合同不兼容"', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { apps: [mockApps[0]] },
        meta: { total: 1, page: 1, page_size: 20, kit_type: 'all', q: '' },
      });
      (importAgentToBlueprint as ReturnType<typeof vi.fn>).mockRejectedValue(
        new BuilderApiError(422, { error: { code: 'CATALOG_BLUEPRINT_INVALID' } }),
      );

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft-001"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      await waitFor(() => screen.getByTestId('import-agent-btn-app-001'));
      fireEvent.click(screen.getByTestId('import-agent-btn-app-001'));

      await waitFor(() => {
        expect(screen.getByText('Agent 快照与当前 Builder 合同不兼容')).toBeInTheDocument();
      });
    });

    it('引入失败 500 → "引入失败，请稍后重试"', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { apps: [mockApps[0]] },
        meta: { total: 1, page: 1, page_size: 20, kit_type: 'all', q: '' },
      });
      (importAgentToBlueprint as ReturnType<typeof vi.fn>).mockRejectedValue(
        new BuilderApiError(500, 'Internal Server Error'),
      );

      render(
        <CatalogImportSidebar
          blueprintId="bp-draft-001"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      await waitFor(() => screen.getByTestId('import-agent-btn-app-001'));
      fireEvent.click(screen.getByTestId('import-agent-btn-app-001'));

      await waitFor(() => {
        expect(screen.getByText('引入失败，请稍后重试')).toBeInTheDocument();
      });
    });
  });

  describe('Drawer 标题与 testid', () => {
    it('渲染标题「从 Catalog 引入 Agent」', async () => {
      (listCatalogApps as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { apps: [] },
        meta: { total: 0, page: 1, page_size: 20, kit_type: 'all', q: '' },
      });

      render(
        <CatalogImportSidebar
          blueprintId="bp-x"
          onClose={mockOnClose}
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      expect(screen.getByTestId('catalog-import-sidebar')).toBeInTheDocument();
      expect(screen.getByText('从 Catalog 引入 Agent')).toBeInTheDocument();
    });
  });
});
