/**
 * fs-chat-upload.test.ts — POST /api/fs/chat-upload 对话框拖拽传图路由（vitest）。
 *
 * 真实 router + 真实 express/http（no-supertest 风格，沿 llm.test.ts / asr.test.ts
 * 传统）。process.cwd 打桩到 mkdtemp 临时目录——上传落盘 `.shadowflow/projects/
 * _uploads/<ts>-<rand>/<filename>`，测试不污染真实工作区，afterAll 整树清理。
 *
 * 覆盖：
 *   - 正常上传 → 200 { data: { path, name, size, url } }，文件内容 round-trip
 *   - 同名文件两次上传 → 独占子目录，url 唯一不覆盖
 *   - 缺 file 字段 → 400 NO_FILE
 *   - 文件名含路径分隔符 / .. → 400 INVALID_NAME（不静默 basename）
 *   - 超 8MB → 413 TOO_LARGE
 *   - 非法 multipart（无 boundary）→ 400 BAD_MULTIPART
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import fsBrowseRouter from '../routes/system/fs-browse';

interface HttpResp {
  status: number;
  body: any;
}

let server: http.Server;
let port: number;
let tmp: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

/** 极简单文件 multipart/form-data body（file 字段，boundary 固定）。 */
function multipartBody(filename: string, data: Buffer, fieldName = 'file'): { body: Buffer; contentType: string } {
  const boundary = '----sfTestBoundary42';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    body: Buffer.concat([head, data, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function postChatUpload(body: Buffer, contentType: string, headers: Record<string, string> = {}): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/api/fs/chat-upload',
        headers: {
          'Content-Type': contentType,
          'Content-Length': body.length,
          ...headers,
        },
      },
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
    req.end(body);
  });
}

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'sf-chat-upload-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
  const app = express();
  app.use('/api/fs', fsBrowseRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  cwdSpy.mockRestore();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* Windows EBUSY，忽略 */
  }
});

describe('POST /api/fs/chat-upload', () => {
  it('正常上传 → 200，落盘 _uploads/<subdir>/<name>，内容 round-trip', async () => {
    const data = Buffer.from('hello-shadowflow', 'utf8');
    const { body, contentType } = multipartBody('note.txt', data);
    const res = await postChatUpload(body, contentType);

    expect(res.status).toBe(200);
    const d = res.body?.data;
    expect(d.name).toBe('note.txt');
    expect(d.size).toBe(data.length);
    // path 是绝对落盘路径，文件真实存在且内容一致
    expect(path.isAbsolute(d.path)).toBe(true);
    expect(existsSync(d.path)).toBe(true);
    expect(readFileSync(d.path).equals(data)).toBe(true);
    expect(d.path.startsWith(path.join(tmp, '.shadowflow', 'projects', '_uploads'))).toBe(true);
    // url 是 /projects/_uploads 相对直链（静态托管渲染缩略图用）
    expect(d.url).toMatch(/^\/projects\/_uploads\/[^/]+\/note\.txt$/);
  });

  it('同名文件两次上传 → 独占子目录，url 唯一不覆盖', async () => {
    const { body, contentType } = multipartBody('dup.png', Buffer.from('first'));
    const r1 = await postChatUpload(body, contentType);
    const { body: body2, contentType: ct2 } = multipartBody('dup.png', Buffer.from('second-longer'));
    const r2 = await postChatUpload(body2, ct2);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.data.url).not.toBe(r2.body.data.url);
    expect(r1.body.data.path).not.toBe(r2.body.data.path);
    // 各自内容互不覆盖
    expect(readFileSync(r1.body.data.path, 'utf8')).toBe('first');
    expect(readFileSync(r2.body.data.path, 'utf8')).toBe('second-longer');
  });

  it('中文文件名（filename*=UTF-8\'\' 编码）→ 200 原名落盘', async () => {
    const boundary = '----sfTestBoundary42';
    const name = encodeURIComponent('截图 测试.png');
    const head = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename*=UTF-8''${name}\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
      'utf8',
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([head, Buffer.from('png-bytes'), tail]);
    const res = await postChatUpload(body, `multipart/form-data; boundary=${boundary}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('截图 测试.png');
  });

  it('缺 file 字段（只有普通字段）→ 400 NO_FILE', async () => {
    const boundary = '----sfTestBoundary42';
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="dir"\r\n\r\n/tmp\r\n--${boundary}--\r\n`,
      'utf8',
    );
    const res = await postChatUpload(body, `multipart/form-data; boundary=${boundary}`);
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('NO_FILE');
  });

  it('文件名带路径分隔符 / .. → 400 INVALID_NAME（不静默 basename）', async () => {
    for (const evil of ['../evil.txt', 'a/b.txt', 'a\\b.txt', '..']) {
      const { body, contentType } = multipartBody(evil, Buffer.from('x'));
      const res = await postChatUpload(body, contentType);
      expect(res.status).toBe(400);
      expect(res.body?.error?.code).toBe('INVALID_NAME');
    }
  });

  it('超 8MB → 413 TOO_LARGE（不落盘）', async () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 1, 0x61);
    const { body, contentType } = multipartBody('big.bin', big);
    const res = await postChatUpload(body, contentType);
    expect(res.status).toBe(413);
    expect(res.body?.error?.code).toBe('TOO_LARGE');
  });

  it('multipart 无 boundary → 400 BAD_MULTIPART', async () => {
    const res = await postChatUpload(Buffer.from('raw'), 'multipart/form-data');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('BAD_MULTIPART');
  });
});
