/**
 * KnowledgeCitations.test.tsx — 引用卡渲染契约（2026-11-06 记忆库重做后）。
 *
 * Mock api/memoryBank（queryPack → POST /api/memory-bank/packs/{id}/query）验证：
 *   - 命中 → 渲染 text/source/score 列表，citation 进 title
 *   - meta.rag_backend → 渲染检索后端徽章
 *   - 空 hits → 显示「无命中引用」
 *   - 查询失败 → 显示「检索失败」，不炸组件
 *   - packIds 为空 → 不渲染
 *   （traces 折叠区已随旧 KnowledgePack 查询契约一并移除，不再断言。）
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KnowledgeCitations } from './KnowledgeCitations';
import { I18nProvider } from '../../common/i18n';
import { queryPack, type MemoryBankHit } from '../../api/memoryBank';

vi.mock('../../api/memoryBank', () => ({
  queryPack: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function renderCard(ui: React.ReactElement) {
  return render(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>);
}

function mockQuery(
  impl: (packId: string) => { data: { hits: MemoryBankHit[] }; meta?: Record<string, unknown> },
) {
  vi.mocked(queryPack).mockImplementation(async (packId) => impl(packId) as never);
}

describe('KnowledgeCitations', () => {
  it('renders hit list with text/source/score', async () => {
    mockQuery(() => ({
      data: { hits: [{ text: '氢能答案', source: 'energy-kb', score: 1 }] },
    }));
    renderCard(<KnowledgeCitations packIds={['p1']} query="氢能是什么" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    expect(screen.getByText('氢能答案')).toBeInTheDocument();
    expect(screen.getByText(/energy-kb · 1\.00/)).toBeInTheDocument();
  });

  it('renders multiple hits in order with per-hit score', async () => {
    mockQuery(() => ({
      data: {
        hits: [
          { text: '片段一', source: 'docs/a.md', score: 1 },
          { text: '片段二', source: 'docs/b.md', score: 0.667 },
          { text: '片段三', source: 'docs/c.md', score: 0.333 },
        ],
      },
    }));
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

  it('queries every pack and aggregates hits across packs', async () => {
    mockQuery((packId) => ({
      data: {
        hits: [{ text: `来自 ${packId} 的片段`, source: `${packId}.md`, score: 1 }],
      },
    }));
    renderCard(<KnowledgeCitations packIds={['pa', 'pb']} query="聚合" />);
    await waitFor(() =>
      expect(screen.getAllByTestId('knowledge-citation-hit')).toHaveLength(2),
    );
    expect(vi.mocked(queryPack)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(queryPack)).toHaveBeenCalledWith('pa', { query: '聚合', top_k: 5 });
    expect(vi.mocked(queryPack)).toHaveBeenCalledWith('pb', { query: '聚合', top_k: 5 });
  });

  it('truncates long source with full path in title', async () => {
    const longSource = 'very/deep/nested/path/to/储能白皮书-2026-第三季度-final-v2.md';
    mockQuery(() => ({
      data: { hits: [{ text: '长来源片段', source: longSource, score: 0.5 }] },
    }));
    renderCard(<KnowledgeCitations packIds={['p1']} query="来源" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    const meta = screen.getByTestId('knowledge-citation-meta');
    expect(meta).toHaveClass('truncate');
    expect(meta).toHaveAttribute('title', longSource);
  });

  it('puts citation into hit title when present', async () => {
    mockQuery(() => ({
      data: {
        hits: [
          {
            text: '高压气态储运是主流',
            source: '氢能白皮书',
            score: 1,
            citation: '白皮书 §2.1',
          },
        ],
      },
    }));
    renderCard(<KnowledgeCitations packIds={['p1']} query="储运" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    const meta = screen.getByTestId('knowledge-citation-meta');
    expect(meta).toHaveAttribute('title', '白皮书 §2.1 · 氢能白皮书');
  });

  it('renders rag_backend badge from query meta', async () => {
    mockQuery(() => ({
      data: { hits: [{ text: '片段', source: 's', score: 1 }] },
      meta: { rag_backend: 'hybrid-bm25+vector' },
    }));
    renderCard(<KnowledgeCitations packIds={['p1']} query="x" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citations-backend')).toBeInTheDocument());
    expect(screen.getByText('hybrid-bm25+vector')).toBeInTheDocument();
  });

  it('hides rag_backend badge when meta has none', async () => {
    mockQuery(() => ({ data: { hits: [{ text: '片段', source: 's', score: 1 }] } }));
    renderCard(<KnowledgeCitations packIds={['p1']} query="x" />);
    await waitFor(() => expect(screen.getByTestId('knowledge-citation-hit')).toBeInTheDocument());
    expect(screen.queryByTestId('knowledge-citations-backend')).not.toBeInTheDocument();
  });

  it('shows empty note when backend returns no hits', async () => {
    mockQuery(() => ({ data: { hits: [] } }));
    renderCard(<KnowledgeCitations packIds={['p1']} query="无命中" />);
    await waitFor(() => expect(screen.getByText('无命中引用')).toBeInTheDocument());
  });

  it('shows error line when query fails', async () => {
    vi.mocked(queryPack).mockRejectedValue(new Error('MemoryBank API error 500'));
    renderCard(<KnowledgeCitations packIds={['p1']} query="会炸" />);
    await waitFor(() => expect(screen.getByText(/检索失败/)).toBeInTheDocument());
  });

  it('renders nothing when packIds is empty', () => {
    const { container } = renderCard(<KnowledgeCitations packIds={[]} query="q" />);
    expect(container.firstChild).toBeNull();
  });

  it('does not query when query text is blank', () => {
    renderCard(<KnowledgeCitations packIds={['p1']} query="   " />);
    expect(vi.mocked(queryPack)).not.toHaveBeenCalled();
  });
});
