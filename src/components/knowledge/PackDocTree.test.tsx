/**
 * PackDocTree.test.tsx — 知识包「文档树」浏览区块契约。
 *
 * Mock api 层 getPackIndex（GET /api/knowledge/packs/{id}/index）验证:
 *   - 树渲染:文档→章节→页面层级,节点带标题/kind/chunk 数
 *   - 展开/折叠:点父节点折叠子树,再点展开
 *   - 点叶子节点 → 元信息面板(node_id/kind/level/chunk 序号区间)
 *   - documents 为空 → 干净空态;请求失败 → 错误提示
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../api/knowledge', () => ({
  getPackIndex: vi.fn(),
  KnowledgeApiError: class KnowledgeApiError extends Error {},
}));

import { getPackIndex } from '../../api/knowledge';
import { PackDocTree } from './PackDocTree';
import { I18nProvider } from '../../common/i18n';

const mockedGetIndex = getPackIndex as unknown as ReturnType<typeof vi.fn>;

const INDEX = {
  data: {
    pack_id: 'p1',
    built_at: '2026-08-22T00:00:00Z',
    documents: [
      {
        doc_id: 'd0',
        source_id: 's1',
        title: 'guide.md',
        kind: 'outline',
        chunk_count: 4,
        tree: {
          node_id: 'd0',
          kind: 'document',
          title: 'guide.md',
          level: 0,
          chunk_indexes: [0, 1, 2, 3],
          children: [
            {
              node_id: 'd0/c0',
              kind: 'chapter',
              title: '快速开始',
              level: 1,
              chunk_indexes: [0, 1, 2],
              children: [
                {
                  node_id: 'd0/c1',
                  kind: 'chapter',
                  title: '安装',
                  level: 2,
                  chunk_indexes: [1],
                  children: [],
                },
              ],
            },
            {
              node_id: 'd0/c2',
              kind: 'chapter',
              title: '进阶',
              level: 1,
              chunk_indexes: [3],
              children: [],
            },
          ],
        },
      },
      {
        doc_id: 'd1',
        source_id: 's2',
        title: 'notes.txt',
        kind: 'paged',
        chunk_count: 3,
        tree: {
          node_id: 'd1',
          kind: 'document',
          title: 'notes.txt',
          level: 0,
          chunk_indexes: [0, 1, 2],
          children: [
            {
              node_id: 'd1/p0',
              kind: 'page',
              title: '第 1 页 (chunks 0-2)',
              level: 1,
              chunk_indexes: [0, 1, 2],
              children: [],
            },
          ],
        },
      },
    ],
    stats: { documents: 2, nodes: 6, chunks: 7 },
  },
  meta: { trace_id: 't', timestamp: '2026-08-22T00:00:00Z', pack_id: 'p1' },
};

function renderTree(packId = 'p1') {
  return render(
    <I18nProvider defaultLanguage="zh">
      <PackDocTree packId={packId} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockedGetIndex.mockReset();
  mockedGetIndex.mockResolvedValue(INDEX);
});

describe('PackDocTree', () => {
  it('渲染文档→章节→页面树:标题/kind/chunk 数 + stats', async () => {
    renderTree();
    expect(await screen.findByTestId('doc-tree-node-d0')).toBeTruthy();
    expect(screen.getByTestId('doc-tree-stats').textContent).toContain('2 文档 · 6 节点 · 7 chunks');
    // 默认全部展开:章节与嵌套子章节可见
    expect(screen.getByText('快速开始')).toBeTruthy();
    expect(screen.getByText('安装')).toBeTruthy();
    expect(screen.getByText('第 1 页 (chunks 0-2)')).toBeTruthy();
    // kind + chunk 数
    const docRow = screen.getByTestId('doc-tree-node-d0');
    expect(docRow.textContent).toContain('document');
    expect(docRow.textContent).toContain('4 chunks');
    expect(screen.getByTestId('doc-tree-node-d1/p0').textContent).toContain('page');
  });

  it('点父节点折叠子树,再点展开', async () => {
    renderTree();
    const docRow = await screen.findByTestId('doc-tree-node-d0');
    // 折叠
    fireEvent.click(docRow);
    expect(screen.queryByText('快速开始')).toBeNull();
    // 另一个文档的子树不受影响
    expect(screen.getByText('第 1 页 (chunks 0-2)')).toBeTruthy();
    // 再点展开
    fireEvent.click(docRow);
    expect(await screen.findByText('快速开始')).toBeTruthy();
  });

  it('点叶子节点 → 元信息面板(node_id/kind/level/chunk 序号区间)', async () => {
    renderTree();
    const leaf = await screen.findByTestId('doc-tree-node-d1/p0');
    fireEvent.click(leaf);
    const meta = await screen.findByTestId('doc-tree-meta');
    expect(meta.textContent).toContain('d1/p0');
    expect(meta.textContent).toContain('kind=page');
    expect(meta.textContent).toContain('level=1');
    expect(screen.getByTestId('doc-tree-meta-chunks').textContent).toContain('0-2');
    // 选中态
    expect(leaf.className).toContain('neo-kv-dt-row--active');
  });

  it('documents 为空 → 干净空态,不渲染树', async () => {
    mockedGetIndex.mockResolvedValue({
      data: {
        pack_id: 'p1',
        built_at: '2026-08-22T00:00:00Z',
        documents: [],
        stats: { documents: 0, nodes: 0, chunks: 0 },
      },
      meta: { trace_id: 't', timestamp: 'x', pack_id: 'p1' },
    });
    renderTree();
    expect(await screen.findByTestId('doc-tree-empty')).toBeTruthy();
    expect(screen.queryByTestId('doc-tree-node-d0')).toBeNull();
  });

  it('请求失败 → 错误提示,不炸组件', async () => {
    mockedGetIndex.mockRejectedValue(new Error('Knowledge API error 500'));
    renderTree();
    const alert = await screen.findByTestId('doc-tree-error');
    expect(alert.textContent).toContain('文档树加载失败');
    expect(alert.textContent).toContain('Knowledge API error 500');
  });

  it('切换 packId 重新拉取对应 index', async () => {
    const { rerender } = render(
      <I18nProvider defaultLanguage="zh">
        <PackDocTree packId="p1" />
      </I18nProvider>,
    );
    await screen.findByTestId('doc-tree-node-d0');
    rerender(
      <I18nProvider defaultLanguage="zh">
        <PackDocTree packId="p2" />
      </I18nProvider>,
    );
    expect(await screen.findByTestId('doc-tree-node-d0')).toBeTruthy();
    expect(mockedGetIndex).toHaveBeenCalledWith('p2');
  });
});
