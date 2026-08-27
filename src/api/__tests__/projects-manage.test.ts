/**
 * projects 客户端管理面测试（2026-08-23）— patchProject / deleteProject。
 * 覆盖：PATCH 请求方法与 body、错误抛 Error；DELETE 204 正常返回、404 抛错。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { patchProject, deleteProject } from '../projects';

afterEach(() => vi.restoreAllMocks());

describe('patchProject', () => {
  it('以 PATCH 发送局部更新并返回更新后的记录', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ project_id: 'p1', name: '新名字' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const rec = await patchProject('p1', { name: '新名字' });
    expect(rec.name).toBe('新名字');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/projects/p1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: '新名字' });
  });

  it('后端 404 → 抛 Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(patchProject('p-x', { name: 'n' })).rejects.toThrow('patchProject: 404');
  });
});

describe('deleteProject', () => {
  it('以 DELETE 请求，204 正常返回', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    await expect(deleteProject('p1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/projects/p1');
    expect(init.method).toBe('DELETE');
  });

  it('后端 404 → 抛 Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(deleteProject('p-x')).rejects.toThrow('deleteProject: 404');
  });
});
