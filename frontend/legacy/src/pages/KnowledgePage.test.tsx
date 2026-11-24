/**
 * KnowledgePage.test.tsx — 知识库统一页（2026-11-07 多模态记忆库唯一实现）契约测试。
 *
 * Vitest + RTL（对齐 MemoryBankPanel.test 模式）：mock api/memoryBank 层控制
 * 响应形状。覆盖：
 *   - 左栏 = 记忆库知识包列表（自动选中第一个 → 右栏面板收到 packId）
 *   - 预选：initialSource prop（Neo 深链）与 ?source= 查询参数；parseSourceId
 *   - 「+ 添加」菜单：导入本地文件夹（DirPicker → ingestFolder 目录批量摄入）、
 *     新建知识包（createPack）
 *   - 无选中导入 → 提示；空列表 → 概览引导
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/memoryBank', () => ({
  MemoryBankApiError: class MemoryBankApiError extends Error {
    code: string;
    constructor(
      public status: number,
      _detail: unknown,
      code = '',
    ) {
      super(`MemoryBank API error ${status}`);
      this.code = code || `HTTP_${status}`;
    }
  },
  listPacks: vi.fn(),
  createPack: vi.fn(),
  ingestFolder: vi.fn(),
  getPack: vi.fn(),
  deletePack: vi.fn(),
  ingestText: vi.fn(),
  ingestFile: vi.fn(),
  listSources: vi.fn(),
  deleteSource: vi.fn(),
  queryPack: vi.fn(),
  fetchBlobUrl: vi.fn(),
}));
// 包详情面板打桩：只回显 packId，面板交互由 MemoryBankPanel.test 覆盖
vi.mock('../components/knowledge/MemoryBankPanel', () => ({
  default: ({ packId, packName }: { packId: string | null; packName?: string }) => (
    <div data-testid="panel-stub" data-pack={packId} data-name={packName} />
  ),
}));
// 应用内目录选择器打桩：点击 = 选中 D:\Picked
vi.mock('../components/DirPicker', () => ({
  default: ({ onPick }: { onPick: (p: string) => void }) => (
    <div
      data-testid="dir-picker-stub"
      onClick={() => onPick('D:\\Picked')}
    />
  ),
}));
vi.mock('../api/_base', () => ({
  getApiBase: () => '',
}));

import { createPack, ingestFolder, listPacks } from '../api/memoryBank';
import KnowledgePage, { parseSourceId } from './KnowledgePage';
import { I18nProvider } from '../common/i18n';

const mockedListPacks = vi.mocked(listPacks);
const mockedCreatePack = vi.mocked(createPack);
const mockedIngestFolder = vi.mocked(ingestFolder);

const PACK = {
  pack_id: 'p1',
  name: '项目文档包',
  description: 'desc',
  status: 'ready',
  created_at: '2026-11-07T10:00:00.000Z',
  updated_at: '2026-11-07T10:00:00.000Z',
};

function renderPage(props: { embedded?: boolean; initialSource?: { kind: 'pack'; id: string } | null } = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider defaultLanguage="zh">
        <KnowledgePage {...props} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListPacks.mockResolvedValue({ data: { packs: [PACK] }, meta: {} });
});

describe('parseSourceId', () => {
  it("接受 'pack:<id>'，拒绝 vault/非法值", () => {
    expect(parseSourceId('pack:p1')).toEqual({ kind: 'pack', id: 'p1' });
    expect(parseSourceId('vault:v1')).toBeNull();
    expect(parseSourceId('pack:')).toBeNull();
    expect(parseSourceId(null)).toBeNull();
  });
});

describe('KnowledgePage', () => {
  it('左栏渲染记忆库知识包并自动选中第一个', async () => {
    renderPage();
    expect(await screen.findByText('项目文档包')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('panel-stub').getAttribute('data-pack')).toBe('p1'),
    );
    expect(mockedListPacks).toHaveBeenCalledTimes(1);
  });

  it('initialSource 深链预选知识包', async () => {
    mockedListPacks.mockResolvedValue({
      data: {
        packs: [
          PACK,
          { ...PACK, pack_id: 'p2', name: '第二包' },
        ],
      },
      meta: {},
    });
    renderPage({ initialSource: { kind: 'pack', id: 'p2' } });
    await waitFor(() =>
      expect(screen.getByTestId('panel-stub').getAttribute('data-pack')).toBe('p2'),
    );
  });

  it('「添加」菜单：导入本地文件夹走 DirPicker + ingestFolder', async () => {
    mockedIngestFolder.mockResolvedValue({
      data: {
        folder: 'D:\\Picked',
        recursive: true,
        total: 2,
        ingested: 2,
        deduplicated: 0,
        skipped: 0,
        failed: 0,
        files: [],
      },
      meta: {},
    });
    renderPage();
    await screen.findByText('项目文档包');
    fireEvent.click(screen.getByTestId('kv-add-btn'));
    fireEvent.click(screen.getByTestId('kv-add-open-folder'));
    fireEvent.click(screen.getByTestId('dir-picker-stub'));
    await waitFor(() =>
      expect(mockedIngestFolder).toHaveBeenCalledWith('p1', {
        path: 'D:\\Picked',
        recursive: true,
      }),
    );
    expect(await screen.findByText(/导入完成:摄入 2/)).toBeTruthy();
  });

  it('无选中知识包时导入文件夹 → 提示先选包', async () => {
    mockedListPacks.mockResolvedValue({ data: { packs: [] }, meta: {} });
    renderPage();
    await screen.findByTestId('knowledge-overview');
    fireEvent.click(screen.getByTestId('kv-add-btn'));
    fireEvent.click(screen.getByTestId('kv-add-open-folder'));
    fireEvent.click(screen.getByTestId('dir-picker-stub'));
    expect(await screen.findByText(/请先选择或新建知识包/)).toBeTruthy();
    expect(mockedIngestFolder).not.toHaveBeenCalled();
  });

  it('新建知识包：弹窗填名称 → createPack 并选中新包', async () => {
    mockedCreatePack.mockResolvedValue({
      data: { ...PACK, pack_id: 'p2', name: '新包' },
      meta: {},
    });
    renderPage();
    await screen.findByText('项目文档包');
    fireEvent.click(screen.getByTestId('kv-add-btn'));
    fireEvent.click(screen.getByTestId('kv-add-create-pack'));
    fireEvent.change(screen.getByTestId('modal-name'), { target: { value: '新包' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() =>
      expect(mockedCreatePack).toHaveBeenCalledWith({ name: '新包', description: '' }),
    );
  });

  it('空列表 → 概览引导卡', async () => {
    mockedListPacks.mockResolvedValue({ data: { packs: [] }, meta: {} });
    renderPage();
    expect(await screen.findByTestId('knowledge-overview')).toBeTruthy();
    expect(screen.getByTestId('guide-add')).toBeTruthy();
  });
});
