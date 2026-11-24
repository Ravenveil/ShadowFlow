/**
 * fsFiles.ts 文件树接口测试（2026-11-19）。
 *
 * 锁死：`listDirs()` 请求必须带 `include=files` —— 后端默认只列目录，不带这个参数
 * 文件树就永远看不到产出文件（右侧预览永远空态）。同时验证文件项字段透传、
 * truncated 透传、失败降级为 null。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { listDirs } from '../fsFiles';

afterEach(() => vi.restoreAllMocks());

function okJson(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

describe('listDirs', () => {
  it('请求 URL 带 include=files（传 path）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({ path: '/w', parent: '/', isRoot: false, entries: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listDirs('/w');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/fs/list');
    expect(url).toContain('path=%2Fw');
    expect(url).toContain('include=files');
  });

  it('省略 path 时仍然带 include=files（home 场景）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({ path: '/home/u', parent: '/home', isRoot: false, entries: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listDirs();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/fs/list?include=files');
    expect(url).not.toContain('path=');
  });

  it('文件条目字段（isDir:false / size / mtime / ext）原样透传，truncated 透传', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okJson({
          path: '/w',
          parent: '/',
          isRoot: false,
          truncated: true,
          entries: [
            { name: 'out', path: '/w/out', isDir: true },
            { name: 'report.md', path: '/w/report.md', isDir: false, size: 42, mtime: 1_700_000_000_000, ext: '.md' },
          ],
        }),
      ),
    );

    const r = await listDirs('/w');
    expect(r).not.toBeNull();
    expect(r!.truncated).toBe(true);
    expect(r!.entries).toHaveLength(2);
    const file = r!.entries[1];
    expect(file.isDir).toBe(false);
    expect(file.size).toBe(42);
    expect(file.ext).toBe('.md');
    expect(file.mtime).toBe(1_700_000_000_000);
  });

  it('非 2xx → 返回 null（不抛错，树保持空态）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    await expect(listDirs('/nope')).resolves.toBeNull();
  });

  it('fetch 抛错（网络异常）→ 返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(listDirs('/w')).resolves.toBeNull();
  });
});
