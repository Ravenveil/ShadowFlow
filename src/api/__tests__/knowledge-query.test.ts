/**
 * knowledge-query.test.ts — queryPack 客户端封装（POST /api/knowledge/packs/{id}/query）。
 *
 * Mock fetch 验证：
 *   - ok 响应解析出 data.hits
 *   - 非 ok 抛 KnowledgeApiError 并带出后端 error.code
 *   - 请求体默认不带 top_k，传参时才带
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryPack, KnowledgeApiError } from '../knowledge';

afterEach(() => vi.restoreAllMocks());

describe('queryPack', () => {
  it('resolves with hits when backend returns ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { hits: [{ text: '答案', source: 'kb', score: 1.0 }] },
        meta: { trace_id: 't', timestamp: '2026-08-22T00:00:00Z', pack_id: 'p', query: 'q' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const resp = await queryPack('abc123', '你好');
    expect(resp.data.hits).toHaveLength(1);
    expect(resp.data.hits[0]).toEqual({ text: '答案', source: 'kb', score: 1.0 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/knowledge/packs/abc123/query');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ query: '你好' });
  });

  it('sends top_k only when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { hits: [] }, meta: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await queryPack('abc123', '你好', 3);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ query: '你好', top_k: 3 });
  });

  it('throws KnowledgeApiError with backend code on non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: { code: 'KNOWLEDGE_PACK_NOT_FOUND', message: 'nope' } }),
    }));
    await expect(queryPack('missing', 'q')).rejects.toMatchObject({
      code: 'KNOWLEDGE_PACK_NOT_FOUND',
    });
    await expect(queryPack('missing', 'q')).rejects.toBeInstanceOf(KnowledgeApiError);
  });
});
