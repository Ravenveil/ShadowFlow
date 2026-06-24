// server/src/routes/__tests__/fs-read.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fsRouter from '../fs-browse';

let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'sf-read-'));
  writeFileSync(path.join(root, 'doc.md'), '# content', 'utf8');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
function app() { const a = express(); a.use('/api/fs', fsRouter); return a; }

describe('GET /api/fs/read', () => {
  it('reads a file inside root', async () => {
    const res = await request(app()).get('/api/fs/read').query({ path: path.join(root, 'doc.md'), root });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('# content');
  });

  it('403 when path escapes root (traversal)', async () => {
    const res = await request(app()).get('/api/fs/read').query({ path: path.join(root, '..', '..', 'etc', 'passwd'), root });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('400 when root missing', async () => {
    const res = await request(app()).get('/api/fs/read').query({ path: path.join(root, 'doc.md') });
    expect(res.status).toBe(400);
  });

  it('truncates files larger than 1MB with truncated:true', async () => {
    // 写一个超过 1MB 的文件
    const bigFile = path.join(root, 'big.bin');
    // 1MB + 1 字节
    const buf = Buffer.alloc(1024 * 1024 + 1, 'x');
    writeFileSync(bigFile, buf);
    const res = await request(app()).get('/api/fs/read').query({ path: bigFile, root });
    expect(res.status).toBe(200);
    expect(res.body.data.truncated).toBe(true);
    expect(res.body.data.content.length).toBeLessThanOrEqual(1024 * 1024);
  });
});
