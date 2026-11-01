/**
 * KnowledgeCitations.test.tsx — 引用卡渲染契约。
 *
 * Mock fetch（queryPack 走 /api/knowledge/packs/{id}/query）验证：
 *   - 命中 → 渲染 text/source/score 列表
 *   - 空 hits（未配置 LightRAG / 无命中）→ 显示「无命中引用」
 *   - 查询失败 → 显示「检索失败」，不炸组件
 *   - packIds 为空 → 不渲染
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KnowledgeCitations } from './KnowledgeCitations';
import { I18nProvider } from '../../common/i18n';

afterEach(() => vi.restoreAllMocks());

function renderCard(ui: React.ReactElement) {
  return render(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>);
}

function mockFetchHits(
  hits: Array<{ text: string; source: string; score: number; path?: string; node_id?: string }>,
  trace?: unknown,
) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      data: { hits, ...(trace ? { trace } : {}) },
      meta: { trace_id: 't', timestamp: '2026-08-22T00:00:00Z' },
    }),
  }));
}

describe('KnowledgeCitations', () => {
  it('renders hit list with text/source/score', async () => {
    mockFetchHits([{ text: '氢能答案', source: 'energy-kb', score: 1 }]);
    renderCard(<KnowledgeCitations packIds={['p1']} query="氢能是什么" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    expect(screen.getByText('氢能答案')).toBeInTheDocument();
    expect(screen.getByText(/energy-kb · 1\.00/)).toBeInTheDocument();
  });

  it('renders multiple hits in order with per-hit score', async () => {
    mockFetchHits([
      { text: '片段一', source: 'docs/a.md', score: 1 },
      { text: '片段二', source: 'docs/b.md', score: 0.667 },
      { text: '片段三', source: 'docs/c.md', score: 0.333 },
    ]);
    renderCard(<KnowledgeCitations packIds={['p1']} query="多片段" />);
    await waitFor(() =>
      expect(screen.getAllByTestId('knowledge-citation-hit')).toHaveLength(3),
    );
    expect(screen.getByText('片段一')).toBeInTheDocument();
    expect(screen.getByText('片段二')).toBeInTheDocument();
    expect(screen.getByText('片段三')).toBeInTheDocument();
    expect(screen.getByText(/docs\/a\.md · 1\.00/)).toBeInTheDocument();
    expect(screen.getByText(/docs\/c\.md · 0\.33/)).toBeInTheDocument();
  });

  it('truncates long source with full path in title', async () => {
    const longSource = 'very/deep/nested/path/to/储能白皮书-2026-第三季度-final-v2.md';
    mockFetchHits([{ text: '长来源片段', source: longSource, score: 0.5 }]);
    renderCard(<KnowledgeCitations packIds={['p1']} query="来源" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    const meta = screen.getByTestId('knowledge-citation-meta');
    expect(meta).toHaveClass('truncate');
    expect(meta).toHaveAttribute('title', longSource);
  });

  it('shows empty note when backend returns no hits', async () => {
    mockFetchHits([]);
    renderCard(<KnowledgeCitations packIds={['p1']} query="无命中" />);
    await waitFor(() => expect(screen.getByText('无命中引用')).toBeInTheDocument());
  });

  it('shows error line when query fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { code: 'BOOM' } }),
    }));
    renderCard(<KnowledgeCitations packIds={['p1']} query="会炸" />);
    await waitFor(() => expect(screen.getByText(/检索失败/)).toBeInTheDocument());
  });

  it('renders nothing when packIds is empty', () => {
    const { container } = renderCard(<KnowledgeCitations packIds={[]} query="q" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows hierarchical path breadcrumb when hit carries one', async () => {
    mockFetchHits([
      {
        text: '高压气态储运是主流',
        source: '氢能白皮书',
        score: 1,
        path: '氢能白皮书 > 第二章 储运',
        node_id: 'd0/c2',
      },
    ]);
    renderCard(<KnowledgeCitations packIds={['p1']} query="储运" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    const path = screen.getByTestId('knowledge-citation-path');
    expect(path).toHaveTextContent('氢能白皮书 > 第二章 储运');
    expect(path).toHaveAttribute('title', '氢能白皮书 > 第二章 储运');
    // source/score 原有展示不受影响
    expect(screen.getByText(/氢能白皮书 · 1\.00/)).toBeInTheDocument();
  });

  it('hides path breadcrumb for flat hits without path', async () => {
    mockFetchHits([{ text: '平铺片段', source: 'docs/a.md', score: 1 }]);
    renderCard(<KnowledgeCitations packIds={['p1']} query="x" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    expect(screen.queryByTestId('knowledge-citation-path')).not.toBeInTheDocument();
  });

  it('renders retrieval-debug fold with trace strategy and located paths', async () => {
    mockFetchHits([{ text: '储运片段', source: '氢能白皮书', score: 1 }], {
      strategy: 'hier',
      candidate_chunks: 3,
      located: [
        {
          node_id: 'd0/c2',
          kind: 'chapter',
          title: '第二章 储运',
          path: '氢能白皮书 > 第二章 储运',
          score: 3,
        },
      ],
    });
    renderCard(<KnowledgeCitations packIds={['p1234567890']} query="储运" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citations-debug')).toBeInTheDocument());
    expect(screen.getByText('检索调试')).toBeInTheDocument();
    const trace = screen.getByTestId('knowledge-citations-trace');
    expect(trace).toHaveTextContent('p1234567 · strategy=hier');
    expect(trace).toHaveTextContent('candidates=3');
    const node = screen.getByTestId('knowledge-citations-trace-node');
    expect(node).toHaveTextContent('氢能白皮书 > 第二章 储运 · 3');
  });

  it('hides debug fold when response has no trace', async () => {
    mockFetchHits([{ text: '片段', source: 's', score: 1 }]);
    renderCard(<KnowledgeCitations packIds={['p1']} query="x" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    expect(screen.queryByTestId('knowledge-citations-debug')).not.toBeInTheDocument();
  });
});
