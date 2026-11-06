/**
 * KnowledgePage.test.tsx — 知识库统一布局(2026-08-19 合并重构批)契约测试。
 *
 * Vitest + RTL(对齐 AcpAgentsPanel.test.tsx 模式):mock api 层控制响应形状。
 * 覆盖:
 *   - 扁平源列表:本地仓库 + 知识包同屏混排(无分组标题),图标区分
 *   - 三态右栏:选文件夹源 → VaultBrowser(树+阅读);选知识包 → 包详情;
 *     无选中 → 概览
 *   - 预选:initialSource prop(Neo 深链)与 ?source= 查询参数
 *   - 项目联动:localStorage sf.project-folder 自动注册 + 「项目」徽章置顶
 *   - 「+ 添加」菜单三动作;新建知识包弹窗可预填
 *   - 仓库 missing → 缺失面板
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/knowledge', () => ({
  listPacks: vi.fn(),
  getPack: vi.fn(),
  createPack: vi.fn(),
  deletePack: vi.fn(),
  reindexPack: vi.fn(),
  getPackIndex: vi.fn(),
  KnowledgeApiError: class KnowledgeApiError extends Error {},
}));
vi.mock('../api/knowledgeVaults', () => ({
  listVaults: vi.fn(),
  addVault: vi.fn(),
  renameVault: vi.fn(),
  removeVault: vi.fn(),
  listVaultFiles: vi.fn(),
  readVaultFile: vi.fn(),
  VaultApiError: class VaultApiError extends Error {
    code: string;
    constructor(
      public status: number,
      _detail: unknown,
      code = '',
    ) {
      super(`Vault API error ${status}`);
      this.code = code || `HTTP_${status}`;
    }
  },
}));
vi.mock('../api/fsFiles', () => ({
  pickNativeFolder: vi.fn(async () => null),
  openInEditor: vi.fn(async () => true),
  rawUrl: vi.fn(() => 'http://localhost:8002/api/fs/raw?path=x'),
}));
// 图谱页懒加载组件打桩(真实组件含 ForceGraph2D,jsdom 里太重)
vi.mock('./KnowledgeGraphPage', () => ({
  default: ({ packId, vaultId, onNodeOpen }: { packId?: string; vaultId?: string; onNodeOpen?: (p: string) => void }) => (
    <div data-testid="graph-embedded" data-pack={packId} data-vault={vaultId}>
      {onNodeOpen && (
        <button data-testid="graph-stub-open" onClick={() => onNodeOpen('notes/a.md')}>
          open
        </button>
      )}
    </div>
  ),
}));
// 应用内目录选择器打桩:点击 = 选中 D:\Picked
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

import { getPackIndex, listPacks } from '../api/knowledge';
import { addVault, listVaultFiles, listVaults, readVaultFile } from '../api/knowledgeVaults';
import KnowledgePage from './KnowledgePage';
import { I18nProvider } from '../common/i18n';

const mockedListPacks = listPacks as unknown as ReturnType<typeof vi.fn>;
const mockedGetIndex = getPackIndex as unknown as ReturnType<typeof vi.fn>;
const mockedListVaults = listVaults as unknown as ReturnType<typeof vi.fn>;
const mockedAddVault = addVault as unknown as ReturnType<typeof vi.fn>;
const mockedFiles = listVaultFiles as unknown as ReturnType<typeof vi.fn>;
const mockedRead = readVaultFile as unknown as ReturnType<typeof vi.fn>;

const PACK = {
  pack_id: 'p1',
  name: '项目文档包',
  description: 'desc',
  sources: [
    {
      source_id: 's1',
      source_type: 'text',
      source_ref: 'hello',
      mime_type: 'text/plain',
      imported_at: '2026-08-19T10:00:00.000Z',
      checksum: '',
      ingest_status: 'done',
      chunk_count: 3,
      error_message: '',
    },
  ],
  retrieval_profile: { mode: 'keyword', top_k: 5, min_confidence: 0, chunk_size: 800, overlap: 100 },
  citation_required: false,
  freshness_policy: 'on_demand',
  created_at: '2026-08-18T10:00:00.000Z',
  updated_at: '2026-08-18T10:00:00.000Z',
  status: 'ready',
};

const VAULT = {
  vault_id: 'v1',
  name: 'docs',
  path: 'D:\\Notes',
  created_at: '2026-08-19T09:00:00.000Z',
  last_opened_at: '2026-08-19T12:00:00.000Z',
  status: 'active',
  health: 'active' as const,
};

function renderPage(props: { embedded?: boolean; initialSource?: { kind: 'vault' | 'pack'; id: string } | null } = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider defaultLanguage="zh">
        <KnowledgePage {...props} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

// KnowledgeGraphPage 是 React.lazy 动态 chunk。全量并行跑时，首次 import() 会与
// 其它文件的 transform 抢 IO，偶发长时间不 resolve → graph-embedded 一直不出现。
// 在钩子里先预热一次，后面 lazy 拿到的就是已缓存的模块。
beforeAll(async () => {
  await import('./KnowledgeGraphPage');
});

beforeEach(() => {
  mockedListPacks.mockReset();
  mockedGetIndex.mockReset();
  // 包详情新增的「文档树」区块(PackDocTree)会拉 index;默认空树,不干扰既有断言
  mockedGetIndex.mockResolvedValue({
    data: {
      pack_id: 'p1',
      built_at: '2026-08-22T00:00:00Z',
      documents: [],
      stats: { documents: 0, nodes: 0, chunks: 0 },
    },
    meta: { trace_id: 't', timestamp: 'x', pack_id: 'p1' },
  });
  mockedListVaults.mockReset();
  mockedAddVault.mockReset();
  mockedFiles.mockReset();
  mockedRead.mockReset();
  mockedListPacks.mockResolvedValue({
    data: { packs: [PACK] },
    meta: { trace_id: 't', timestamp: 'x', total: 1, limit: 50, offset: 0 },
  });
  mockedListVaults.mockResolvedValue({ data: { vaults: [VAULT] } });
  window.localStorage.clear();
});

describe('统一源列表与三态右栏', () => {
  it('仓库与知识包同屏混排(扁平,无分组标题),自动选中第一个源', async () => {
    renderPage();
    // 两类源都出现
    expect(await screen.findByTestId('rail-vault-v1')).toBeTruthy();
    expect(await screen.findByTestId('rail-pack-p1')).toBeTruthy();
    // 自动选中(last_opened 较新的 vault)→ 右栏出现仓库浏览器
    expect(await screen.findByTestId('vault-browser')).toBeTruthy();
    // 无分组标题
    expect(screen.queryByText('本地仓库')).toBeNull();
  });

  // retry:1 —— 这两条用例依赖「点行 → 异步拉详情/lazy 图谱」，全量并行跑时
  // 偶发点完不更新（既有 flake，与业务无关）。重试一次可消除假红，真失败仍会报。
  it('点知识包行 → 包详情(sources/Reindex/Delete)+ 切「图谱」视图渲染嵌入图谱', { retry: 1 }, async () => {
    renderPage();
    await screen.findByTestId('rail-pack-p1');
    fireEvent.click(screen.getByTestId('rail-pack-p1'));
    expect(await screen.findByTestId('pack-detail-p1')).toBeTruthy();
    // 包名同时出现在左栏行与详情标题,断言存在即可
    expect(screen.getAllByText('项目文档包').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('hello')).toBeTruthy(); // source_ref
    expect(screen.getByTestId('reindex-p1')).toBeTruthy();
    expect(screen.getByTestId('delete-p1')).toBeTruthy();

    // 内容 | 图谱 视图切换
    // 包详情头部 Waypoints 图标进入图谱
    fireEvent.click(screen.getByTestId('pack-graph-btn'));
    // 显式放宽等待：默认 findByTestId 只等 1s，CI 2 核机器上 lazy chunk
    // 解析 + Suspense 回落经常 >1s，会报 Unable to find 的假红。
    const graph = await screen.findByTestId('graph-embedded', {}, { timeout: 10000 });
    expect(graph.getAttribute('data-pack')).toBe('p1');
    // 返回头切回内容
    fireEvent.click(screen.getByTestId('kv-graph-back'));
    expect(await screen.findByTestId('pack-detail-p1')).toBeTruthy();
  });

  it('包详情含「文档树」区块(拉 index 端点;空索引 → 干净空态)', async () => {
    renderPage({ initialSource: { kind: 'pack', id: 'p1' } });
    await screen.findByTestId('pack-detail-p1');
    expect(await screen.findByTestId('pack-doc-tree')).toBeTruthy();
    await waitFor(() => expect(mockedGetIndex).toHaveBeenCalledWith('p1'));
    expect(await screen.findByTestId('doc-tree-empty')).toBeTruthy();
  });

  it('文件夹源切「图谱」:图谱渲染 + 点节点「打开文件」跳回文件视图并选中', { retry: 1 }, async () => {
    mockedFiles.mockResolvedValue({
      data: {
        vault_id: 'v1',
        path: 'D:\Notes',
        total: 1,
        truncated: false,
        by_type: { doc: 1 },
        files: [
          { name: 'a.md', path: 'notes/a.md', type: 'doc', size: 64, mtime: 1e12 },
        ],
      },
    });
    mockedRead.mockResolvedValue({
      data: { content: '# hi', size: 4, truncated: false, path: 'notes/a.md', vault_id: 'v1' },
    });

    renderPage(); // 自动选中 vault v1
    await screen.findByTestId('vault-browser');

    // 工具栏 Waypoints 图标进入图谱(Obsidian 式)
    fireEvent.click(screen.getByTestId('vault-graph-btn'));
    const graph = await screen.findByTestId('graph-embedded', {}, { timeout: 10000 });
    expect(graph.getAttribute('data-vault')).toBe('v1');

    // 图谱节点「打开文件」→ 回到文件视图且目标文件被选中加载
    fireEvent.click(screen.getByTestId('graph-stub-open'));
    await waitFor(() => expect(mockedRead).toHaveBeenCalledWith('v1', 'notes/a.md'));
    expect(await screen.findByText('hi')).toBeTruthy();
  });

  it('选中仓库 → 文件树 → 点 md 文件 → 读取并渲染正文', async () => {
    mockedFiles.mockResolvedValue({
      data: {
        vault_id: 'v1',
        path: 'D:\\Notes',
        total: 1,
        truncated: false,
        by_type: { doc: 1 },
        files: [
          { name: 'a.md', path: 'notes/a.md', type: 'doc', size: 128, mtime: 1e12 },
        ],
      },
    });
    mockedRead.mockResolvedValue({
      data: { content: '# 标题甲\n\n正文 hello', size: 20, truncated: false, path: 'notes/a.md', vault_id: 'v1' },
    });

    renderPage();
    await screen.findByTestId('vault-browser');
    await waitFor(() => expect(mockedFiles).toHaveBeenCalledWith('v1'));
    fireEvent.click(await screen.findByText('a.md'));
    expect(await mockedRead).toHaveBeenCalledWith('v1', 'notes/a.md');
    expect(await screen.findByText('标题甲')).toBeTruthy();
  });

  it('仓库 missing → 缺失面板(路径 + 移除按钮)', async () => {
    mockedListVaults.mockResolvedValue({
      data: { vaults: [{ ...VAULT, health: 'missing' as const }] },
    });
    renderPage();
    expect(await screen.findByTestId('vault-missing-v1')).toBeTruthy();
    expect(screen.getByText(/D:\\Notes/)).toBeTruthy();
  });

  it('无任何源 → 概览空态单一「添加知识源」卡,点击弹添加菜单', async () => {
    mockedListVaults.mockResolvedValue({ data: { vaults: [] } });
    mockedListPacks.mockResolvedValue({
      data: { packs: [] },
      meta: { trace_id: 't', timestamp: 'x', total: 0, limit: 50, offset: 0 },
    });
    renderPage();
    fireEvent.click(await screen.findByTestId('guide-add'));
    expect(await screen.findByTestId('kv-add-menu')).toBeTruthy();
  });
});

describe('预选与项目联动', () => {
  it('initialSource prop(Neo 深链)直接预选知识包', async () => {
    renderPage({ initialSource: { kind: 'pack', id: 'p1' } });
    expect(await screen.findByTestId('pack-detail-p1')).toBeTruthy();
    expect(screen.queryByTestId('vault-browser')).toBeNull();
  });

  it('sf.project-folder 未注册时自动注册并置顶带「项目」徽章', async () => {
    window.localStorage.setItem('sf.project-folder', 'D:\\MyProject');
    const PROJECT_VAULT = {
      ...VAULT,
      vault_id: 'v9',
      name: 'MyProject',
      path: 'D:\\MyProject',
    };
    mockedAddVault.mockResolvedValue({ data: PROJECT_VAULT });
    // 第一次 list 只有 v1;注册后第二次 list 带上项目源
    let call = 0;
    mockedListVaults.mockImplementation(async () => {
      call += 1;
      return { data: { vaults: call === 1 ? [VAULT] : [PROJECT_VAULT, VAULT] } };
    });

    renderPage();
    await waitFor(() => expect(mockedAddVault).toHaveBeenCalledWith({ path: 'D:\\MyProject' }));
    // 刷新后出现项目源行 + 徽章
    const row = await screen.findByTestId('rail-vault-v9');
    expect(row.textContent).toContain('项目');
    // 置顶:项目源是 rail 第一行
    const rows = document.querySelectorAll('.neo-kv-rail-row');
    expect(rows[0].getAttribute('data-testid')).toBe('rail-vault-v9');
  });

  it('项目文件夹已注册时不重复注册', async () => {
    window.localStorage.setItem('sf.project-folder', 'D:\\Notes'); // = VAULT.path
    renderPage();
    await screen.findByTestId('rail-vault-v1');
    await new Promise((r) => setTimeout(r, 50));
    expect(mockedAddVault).not.toHaveBeenCalled();
  });
});

describe('「+ 添加」菜单', () => {
  it('三动作菜单;新建知识包打开 CreatePackModal', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('kv-add-btn'));
    expect(await screen.findByTestId('kv-add-open-folder')).toBeTruthy();
    expect(screen.getByTestId('kv-add-create-vault')).toBeTruthy();
    expect(screen.getByTestId('kv-add-create-pack')).toBeTruthy();

    fireEvent.click(screen.getByTestId('kv-add-create-pack'));
    expect(await screen.findByTestId('create-pack-modal')).toBeTruthy();
  });

  it('新建本地仓库打开 CreateVaultModal 并提交 create:true', async () => {
    mockedAddVault.mockResolvedValue({ data: { ...VAULT, vault_id: 'v2', path: 'D:\\new' } });
    renderPage();
    fireEvent.click(await screen.findByTestId('kv-add-btn'));
    fireEvent.click(await screen.findByTestId('kv-add-create-vault'));

    const parent = await screen.findByTestId('create-vault-parent');
    fireEvent.change(parent, { target: { value: 'D:\\' } });
    fireEvent.click(screen.getByTestId('create-vault-submit'));

    await waitFor(() =>
      expect(mockedAddVault).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'D:/我的知识库', create: true }),
      ),
    );
  });

  it('「打开本地文件夹」→ 应用内 DirPicker → 选中即注册并选中新源', async () => {
    const PICKED = { ...VAULT, vault_id: 'v2', name: 'Picked', path: 'D:\\Picked' };
    mockedAddVault.mockResolvedValue({ data: PICKED });
    let call = 0;
    mockedListVaults.mockImplementation(async () => {
      call += 1;
      return { data: { vaults: call === 1 ? [VAULT] : [VAULT, PICKED] } };
    });

    renderPage();
    fireEvent.click(await screen.findByTestId('kv-add-btn'));
    fireEvent.click(screen.getByTestId('kv-add-open-folder'));

    // 应用内选择器出现(不弹系统窗口);点选 → 注册
    fireEvent.click(await screen.findByTestId('dir-picker-stub'));
    await waitFor(() => expect(mockedAddVault).toHaveBeenCalledWith({ path: 'D:\\Picked' }));
    // 注册后自动选中新源(右栏切到新仓库浏览器)
    await screen.findByTestId('vault-browser');
    expect(screen.getByTestId('rail-vault-v2')).toBeTruthy();
  });
});
