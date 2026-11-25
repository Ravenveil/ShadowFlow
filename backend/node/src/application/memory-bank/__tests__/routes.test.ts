/**
 * routes.test.ts — HTTP 契约对拍（11 端点 status/envelope/错误体）。
 *
 * 重点断言（与 Python 1:1 的合同面）：
 *   - POST /packs → 201 + {data: manifest, meta.trace_id}；
 *   - /query 直接 {data:{hits}, meta 六字段}（不套 envelope）；
 *   - 错误体超集：{detail:{code,message}, error:{...}, code}；
 *   - 8MB 文本入库不被 router 级 10mb body limit 挡；
 *   - multipart /files：formidable 解析 + metadata 非法 JSON → 400；
 *   - blobs：裸字节 + Cache-Control immutable。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import express from 'express';
import supertest from 'supertest';
import type { Server } from 'http';

let tmpDir = '';
const prevDataDir = process.env.SHADOWFLOW_DATA_DIR;
let app: express.Express;
let server: Server;
let request: supertest.Agent;
let base = '';

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-routes-'));
  process.env.SHADOWFLOW_DATA_DIR = tmpDir;
  const { createMemoryBankRouter } = await import('../routes');
  app = express();
  app.use('/api/memory-bank', createMemoryBankRouter());
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  request = supertest(base);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (prevDataDir === undefined) delete process.env.SHADOWFLOW_DATA_DIR;
  else process.env.SHADOWFLOW_DATA_DIR = prevDataDir;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

function hexId(): string {
  return randomBytes(16).toString('hex');
}

describe('memory-bank HTTP 契约', () => {
  let packId = '';

  it('#1 POST /packs → 201 envelope(manifest) + trace_id', async () => {
    const res = await request.post('/api/memory-bank/packs').send({ name: '路由包', description: 'd' });
    expect(res.status).toBe(201);
    // pack_id 由服务端生成（uuid4().hex 格式，与 Python 一致），取回供后续用例使用
    expect(res.body.data.pack_id).toMatch(/^[0-9a-f]{32}$/);
    expect(res.body.meta.trace_id).toMatch(/^trace-/);
    packId = res.body.data.pack_id;
  });

  it('#2 GET /packs → envelope({packs}, count)', async () => {
    const res = await request.get('/api/memory-bank/packs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.packs)).toBe(true);
    expect(res.body.meta.count).toBe(res.body.data.packs.length);
  });

  it('#3 GET /packs/:id → manifest；404 unknown', async () => {
    const ok = await request.get(`/api/memory-bank/packs/${packId}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.pack_id).toBe(packId);
    const miss = await request.get(`/api/memory-bank/packs/${hexId()}`);
    expect(miss.status).toBe(404);
    expect(miss.body.detail.code).toBe('PACK_NOT_FOUND');
    expect(miss.body.error.code).toBe('PACK_NOT_FOUND');
    expect(miss.body.code).toBe('PACK_NOT_FOUND');
  });

  it('#7 POST /text 大文本不被默认 100kb 挡（router 级 10mb 生效）', async () => {
    // ~7.3MB ASCII filler（UTF-8 按 1 字节/字符计，低于路由 10mb body limit；
    // 中文锚点放开头用于检索）。字符数低于路由校验上限 8,000,000。
    const big = `${'甲'.repeat(1000)}\n${'content-anchor-7777 '.repeat(100)}`;
    const filler = 'z'.repeat(7 * 1024 * 1024);
    const text = `${big}\n${filler}`;
    expect(text.length).toBeGreaterThan(1_000_000);
    expect(text.length).toBeLessThanOrEqual(8_000_000);
    const res = await request
      .post(`/api/memory-bank/packs/${packId}/text`)
      .send({ text, source_name: 'big.txt' });
    expect(res.status).toBe(200);
    expect(res.body.data.chunk_count).toBeGreaterThan(0);
    // 大文本可检索
    const q = await request
      .post(`/api/memory-bank/packs/${packId}/query`)
      .send({ query: 'content-anchor-7777', top_k: 3 });
    expect(q.status).toBe(200);
    expect(q.body.data.hits.length).toBeGreaterThan(0);
  }, 30_000);

  it('#7 校验：空 text → 4xx；非法 name → 4xx', async () => {
    const empty = await request.post(`/api/memory-bank/packs/${packId}/text`).send({ text: '' });
    expect(empty.status).toBe(400);
    const badName = await request.post('/api/memory-bank/packs').send({ name: '' });
    expect(badName.status).toBe(400);
  });

  it('#10 /query → 裸 {data, meta}（不套 envelope）；meta 有 rag_backend', async () => {
    const res = await request
      .post(`/api/memory-bank/packs/${packId}/query`)
      .send({ query: 'content-anchor-7777', top_k: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.hits).toBeDefined();
    expect(res.body.meta.rag_backend).toBe('keyword+structure');
    expect(res.body.meta.reranked).toBe(false);
    expect(res.body.meta.pack_id).toBe(packId);
    expect(typeof res.body.meta.latency_ms).toBe('number');
    expect(res.body.meta.query).toBe('content-anchor-7777');
    // 断言未被 envelope 二次包装：meta 里不应有 trace_id（query 端点特例）
    expect(res.body.meta.trace_id).toBeUndefined();
  });

  it('#5 GET sources → envelope({sources}, count)；#6 DELETE source', async () => {
    const list = await request.get(`/api/memory-bank/packs/${packId}/sources`);
    expect(list.status).toBe(200);
    expect(list.body.meta.count).toBe(list.body.data.sources.length);
    const src = list.body.data.sources[0];
    expect(src.source_name).toBe(src.filename);
    expect(src.ingest_status).toBe('done');
    const del = await request.delete(`/api/memory-bank/packs/${packId}/sources/${src.source_id}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);
    const miss = await request.delete(`/api/memory-bank/packs/${packId}/sources/${src.source_id}`);
    expect(miss.status).toBe(404);
  });

  it('#8 POST /files multipart：非法 metadata JSON → 400 INVALID_METADATA', async () => {
    const res = await request
      .post(`/api/memory-bank/packs/${packId}/files`)
      .field('metadata', '{not-json')
      .attach('upload', Buffer.from('路由 multipart 验证内容 files-check 5555。'), 'note.txt');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_METADATA');
  });

  it('#8 POST /files multipart：正常文件 → 201 + deduplicated 字段', async () => {
    const res = await request
      .post(`/api/memory-bank/packs/${packId}/files`)
      .attach('upload', Buffer.from('路由 multipart 验证内容 files-check 5555。'), 'note.txt');
    expect(res.status).toBe(201);
    expect(res.body.data.deduplicated).toBe(false);
    expect(res.body.data.filename).toBe('note.txt');
    expect(res.body.data.checksum).toMatch(/^[a-f0-9]{64}$/);
    // 同文件再传 → deduplicated true
    const again = await request
      .post(`/api/memory-bank/packs/${packId}/files`)
      .attach('upload', Buffer.from('路由 multipart 验证内容 files-check 5555。'), 'note.txt');
    expect(again.body.data.deduplicated).toBe(true);
  });

  it('#9 POST /folders：不存在的目录 → 404 FOLDER_NOT_FOUND', async () => {
    const res = await request
      .post(`/api/memory-bank/packs/${packId}/folders`)
      .send({ path: path.join(tmpDir, 'no-such-dir'), recursive: true });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FOLDER_NOT_FOUND');
  });

  it('#9 POST /folders：tmp 目录逐文件摄入 → 201 folderResult', async () => {
    const folder = path.join(tmpDir, 'batch');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'one.txt'), '批量文件一 batch-one 4111。');
    fs.writeFileSync(path.join(folder, 'two.md'), '# 标题\n批量文件二 batch-two 4222。');
    fs.writeFileSync(path.join(folder, 'skip.zzz'), 'should skip');
    const res = await request
      .post(`/api/memory-bank/packs/${packId}/folders`)
      .send({ path: folder, recursive: true });
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.ingested).toBe(2);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.files.find((f: { file: string }) => f.file === 'skip.zzz').code).toBe('UNSUPPORTED_FORMAT');
    expect(res.body.meta.count).toBe(3);
  });

  it('#11 GET blobs → 裸字节 + immutable 缓存头；404 未知 sha', async () => {
    // 先拿一个真实 checksum
    const list = await request.get(`/api/memory-bank/packs/${packId}/sources`);
    const sha = list.body.data.sources.find((s: { checksum: string }) => s.checksum)?.checksum;
    if (sha) {
      const res = await request.get(`/api/memory-bank/packs/${packId}/blobs/${sha}`);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(res.headers['content-type']).toMatch(/^text\//);
    }
    const miss = await request.get(`/api/memory-bank/packs/${packId}/blobs/${'b'.repeat(64)}`);
    expect(miss.status).toBe(404);
  });

  it('#4 DELETE /packs/:id → envelope({deleted})；后续全部 404', async () => {
    const del = await request.delete(`/api/memory-bank/packs/${packId}`);
    expect(del.status).toBe(200);
    expect(del.body.data.pack_id).toBe(packId);
    const gone = await request.get(`/api/memory-bank/packs/${packId}`);
    expect(gone.status).toBe(404);
  });
});
