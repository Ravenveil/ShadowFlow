/**
 * fs-browse-list.test.ts — GET /api/fs/list 的 ?include=files 分支（vitest）。
 *
 * 背景（2026-11-19）：工作空间文件树（左树 + 右预览）走 list 接口，但后端只 push
 * 目录项、文件被直接丢弃 —— 树里只有目录，永远点不到文件，右侧预览永远空态。
 * 这里锁死新语义 + 向后兼容：
 *   - 不传 include → entries 里**没有**文件项（目录选择器依赖「全是目录」语义）
 *   - include=files → 目录在前、文件在后，文件项带 size/isDir:false/ext
 *   - 单目录文件数 > 500 → 只返回前 500 个文件并标 truncated: true
 *
 * 真实 router + 真实 express/http（沿用 fs-chat-upload.test.ts 风格），
 * 数据造在 mkdtemp 临时目录，afterAll 整树清理。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import os from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import fsBrowseRouter from '../application/adapters/fs-browse';

interface HttpResp {
  status: number;
  body: any;
}

let server: http.Server;
let port: number;
let tmp: string;
let big: string;

function getList(query: string): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: 'GET', path: `/api/fs/list${query}` },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* keep raw */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'sf-fs-list-'));
  // 两个目录 + 两个文件 + 一个 dotfile（应被隐藏）
  mkdirSync(path.join(tmp, 'zeta-dir'));
  mkdirSync(path.join(tmp, 'alpha-dir'));
  writeFileSync(path.join(tmp, 'b.txt'), 'abc', 'utf8'); // 3 字节
  writeFileSync(path.join(tmp, 'a.md'), 'hello', 'utf8'); // 5 字节
  writeFileSync(path.join(tmp, '.hidden.txt'), 'x', 'utf8');

  // 超大目录：600 个文件 → 触发 500 截断
  big = path.join(tmp, 'big');
  mkdirSync(big);
  for (let i = 0; i < 600; i++) {
    writeFileSync(path.join(big, `f${String(i).padStart(4, '0')}.txt`), 'x', 'utf8');
  }

  const app = express();
  app.use('/api/fs', fsBrowseRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* Windows EBUSY，忽略 */
  }
});

describe('GET /api/fs/list（默认语义不变）', () => {
  it('不传 include → 只返回目录，没有文件项、也没有 truncated 字段', async () => {
    const res = await getList(`?path=${encodeURIComponent(tmp)}`);
    expect(res.status).toBe(200);
    const entries = res.body.data.entries as any[];
    expect(entries.every((e) => e.isDir === true)).toBe(true);
    expect(entries.map((e) => e.name)).toEqual(['alpha-dir', 'big', 'zeta-dir']);
    // dotfile 仍被隐藏
    expect(entries.some((e) => e.name === '.hidden.txt')).toBe(false);
    // 向后兼容：默认响应形状完全不变
    expect('truncated' in res.body.data).toBe(false);
  });

  it("include 传其他值（如 include=dirs）→ 仍只返回目录", async () => {
    const res = await getList(`?path=${encodeURIComponent(tmp)}&include=dirs`);
    expect(res.status).toBe(200);
    expect((res.body.data.entries as any[]).every((e) => e.isDir === true)).toBe(true);
  });
});

describe('GET /api/fs/list?include=files', () => {
  it('目录在前、文件在后；文件项带 isDir:false / size / ext / mtime', async () => {
    const res = await getList(`?path=${encodeURIComponent(tmp)}&include=files`);
    expect(res.status).toBe(200);
    const entries = res.body.data.entries as any[];

    // 目录在前（按名字排），文件在后（按名字排）；dotfile 两者都不出
    expect(entries.map((e) => e.name)).toEqual([
      'alpha-dir',
      'big',
      'zeta-dir',
      'a.md',
      'b.txt',
    ]);

    const file = entries.find((e) => e.name === 'b.txt');
    expect(file.isDir).toBe(false);
    expect(file.path).toBe(path.join(tmp, 'b.txt'));
    expect(file.size).toBe(3);
    expect(file.ext).toBe('.txt');
    expect(typeof file.mtime).toBe('number');

    expect(entries.find((e) => e.name === 'a.md').ext).toBe('.md');
    // 目录项不带文件字段
    expect(entries.find((e) => e.name === 'alpha-dir')).toEqual({
      name: 'alpha-dir',
      path: path.join(tmp, 'alpha-dir'),
      isDir: true,
    });
    // 未截断
    expect('truncated' in res.body.data).toBe(false);
  });

  it('单目录文件 > 500 → 只返回前 500 个文件，truncated === true', async () => {
    const res = await getList(`?path=${encodeURIComponent(big)}&include=files`);
    expect(res.status).toBe(200);
    const entries = res.body.data.entries as any[];
    expect(res.body.data.truncated).toBe(true);
    expect(entries).toHaveLength(500);
    // 按名字排序后取前 500：f0000 … f0499
    expect(entries[0].name).toBe('f0000.txt');
    expect(entries[499].name).toBe('f0499.txt');
  });

  it('ROOT 哨兵不受 include 影响（仍只返回盘符/根）', async () => {
    const res = await getList('?path=ROOT&include=files');
    expect(res.status).toBe(200);
    expect(res.body.data.isRoot).toBe(true);
    expect((res.body.data.entries as any[]).every((e) => e.isDir === true)).toBe(true);
  });
});
