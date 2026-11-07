/**
 * MemoryBankPanel.test.tsx — 记忆库「包详情」面板契约测试（2026-11-07 知识库
 * 统一批：面板改受控详情，包列表/建包/目录导入归 KnowledgePage）。
 *
 * Vitest + RTL：mock api/memoryBank 层控制响应形状。覆盖主链路：
 * 受控 packId → 来源列表 → 上传文件 → 检索命中 → 删除来源/删除包
 * （NeoConfirmModal 二次确认）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryBankApiError, deletePack, deleteSource, ingestFile, listSources, queryPack } from '../../api/memoryBank';
import MemoryBankPanel from './MemoryBankPanel';

vi.mock('../../api/memoryBank', () => ({
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
  createPack: vi.fn(),
  listPacks: vi.fn(),
  getPack: vi.fn(),
  deletePack: vi.fn(),
  ingestText: vi.fn(),
  ingestFile: vi.fn(),
  ingestFolder: vi.fn(),
  listSources: vi.fn(),
  deleteSource: vi.fn(),
  queryPack: vi.fn(),
  fetchBlobUrl: vi.fn(),
}));
vi.mock('../../neo/NeoConfirmModal', () => ({
  NeoConfirmModal: ({
    title,
    message,
    onConfirm,
    onClose,
  }: {
    title: string;
    message: string;
    onConfirm: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="confirm-modal">
      <span>{title}</span>
      <span>{message}</span>
      <button data-testid="confirm-ok" onClick={onConfirm}>
        确认
      </button>
      <button data-testid="confirm-cancel" onClick={onClose}>
        取消
      </button>
    </div>
  ),
}));

const mockedListSources = vi.mocked(listSources);
const mockedIngestFile = vi.mocked(ingestFile);
const mockedQueryPack = vi.mocked(queryPack);
const mockedDeletePack = vi.mocked(deletePack);
const mockedDeleteSource = vi.mocked(deleteSource);

function setup(props: { packId?: string | null; packName?: string; reloadKey?: number; onPackDeleted?: () => void } = {}) {
  return render(<MemoryBankPanel packId="p1" packName="销售知识库" {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListSources.mockResolvedValue({ data: { sources: [] }, meta: {} });
});

describe('MemoryBankPanel', () => {
  it('无 packId → 空态；有 packId → 拉来源列表并显示包名', async () => {
    render(<MemoryBankPanel packId={null} />);
    expect(screen.getByTestId('mbk-empty')).toBeTruthy();

    mockedListSources.mockResolvedValue({
      data: { sources: [{ source_id: 's1', filename: '合同.pdf', status: 'done' }] },
      meta: {},
    });
    setup();
    expect(await screen.findByText('销售知识库')).toBeTruthy();
    await waitFor(() => expect(mockedListSources).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('合同.pdf')).toBeTruthy();
  });

  it('reloadKey 递增触发来源列表刷新（目录导入等批量摄入后）', async () => {
    const { rerender } = setup();
    await waitFor(() => expect(mockedListSources).toHaveBeenCalledTimes(1));
    rerender(<MemoryBankPanel packId="p1" packName="销售知识库" reloadKey={1} />);
    await waitFor(() => expect(mockedListSources).toHaveBeenCalledTimes(2));
  });

  it('上传文件走 ingestFile 并刷新来源列表', async () => {
    mockedIngestFile.mockResolvedValue({ data: { source_id: 's2' }, meta: {} });
    setup();
    await screen.findByTestId('mbk-upload-btn');
    const input = screen.getByTestId('mbk-file-input') as HTMLInputElement;
    const file = new File(['hello'], 'a.md', { type: 'text/markdown' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(mockedIngestFile).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'a.md' })),
    );
    await waitFor(() => expect(mockedListSources).toHaveBeenCalledTimes(2));
  });

  it('检索：输入查询词返回命中并展示 rag_backend', async () => {
    mockedQueryPack.mockResolvedValue({
      data: {
        hits: [
          {
            text: '2026 年 Q3 华东区域续费率为 91%。',
            source: '续费结论',
            score: 0.87,
            kind: 'text',
            retrieval_channels: ['bm25'],
          },
        ],
      },
      meta: { rag_backend: 'keyword+structure' },
    });
    setup();
    const q = await screen.findByPlaceholderText('检索记忆库…');
    fireEvent.change(q, { target: { value: '华东续费率' } });
    fireEvent.click(screen.getByTestId('mbk-query-btn'));
    expect(await screen.findByText(/华东区域续费率为 91%/)).toBeTruthy();
    expect(screen.getByText('keyword+structure')).toBeTruthy();
    expect(mockedQueryPack).toHaveBeenCalledWith('p1', { query: '华东续费率', top_k: 5 });
  });

  it('删除知识包：NeoConfirmModal 二次确认后回调 onPackDeleted', async () => {
    const onPackDeleted = vi.fn();
    mockedDeletePack.mockResolvedValue({ deleted: true, pack_id: 'p1' });
    setup({ onPackDeleted });
    fireEvent.click(await screen.findByTestId('mbk-delete-pack'));
    expect(screen.getByTestId('confirm-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('confirm-ok'));
    await waitFor(() => expect(mockedDeletePack).toHaveBeenCalledWith('p1'));
    expect(onPackDeleted).toHaveBeenCalledTimes(1);
  });

  it('删除来源：NeoConfirmModal 二次确认并刷新列表', async () => {
    mockedListSources.mockResolvedValue({
      data: { sources: [{ source_id: 's1', filename: '合同.pdf', status: 'done' }] },
      meta: {},
    });
    mockedDeleteSource.mockResolvedValue({ deleted: true });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: '删除来源 合同.pdf' }));
    fireEvent.click(screen.getByTestId('confirm-ok'));
    await waitFor(() => expect(mockedDeleteSource).toHaveBeenCalledWith('p1', 's1'));
  });

  it('API 报错时展示错误条', async () => {
    mockedQueryPack.mockRejectedValue(
      new MemoryBankApiError(503, { error: { code: 'UNREACHABLE' } }, 'UNREACHABLE'),
    );
    setup();
    const q = await screen.findByPlaceholderText('检索记忆库…');
    fireEvent.change(q, { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('mbk-query-btn'));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
