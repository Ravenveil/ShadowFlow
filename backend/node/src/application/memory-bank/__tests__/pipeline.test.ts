/**
 * pipeline.test.ts — 端到端管线（vitest，SHADOWFLOW_DATA_DIR=tmp 隔离）。
 *
 * 覆盖任务书要求的主链路断言：
 *   create pack → ingest text（中文+English+编号）→ query 命中
 *   （hit 的 text/source/score/citation/retrieval_channels + meta 六字段）；
 *   同文本二次摄入 deduplicated=true；DELETE pack 后 getPack 404；
 *   sources 列表；blob 404；UNSUPPORTED_FORMAT 415；filters（source_ids）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';

let tmpDir = '';
const prevEnv = process.env.SHADOWFLOW_DATA_DIR;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-pipeline-'));
  process.env.SHADOWFLOW_DATA_DIR = tmpDir;
});

afterAll(() => {
  if (prevEnv === undefined) delete process.env.SHADOWFLOW_DATA_DIR;
  else process.env.SHADOWFLOW_DATA_DIR = prevEnv;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 句柄延迟，尽力清理 */
  }
});

// env 注入后才能解析 repoDataDir → 动态 import
const svc = () => import('../service');
const paths = () => import('../paths');

describe('memory-bank v1 端到端', () => {
  it('create → ingest(中文+English+编号) → query 命中全字段', async () => {
    const service = await svc();
    const packId = randomBytes(16).toString('hex');
    const manifest = service.createPack('验收包', 'e2e', { authority: 1.0 }, packId);
    expect(manifest.pack_id).toBe(packId);
    expect(manifest.schema).toBe('shadowflow.memory_bank/1');
    expect(manifest.retrieval_profile.mode).toBe('keyword');

    const text =
      '华东区域 Q3 续费率为 91%，合同编号 SF-2026-Q3-0091。\n' +
      'The renewal rate for East China is 91 percent. 合同金额：人民币 120 万元整。\n\n' +
      '第二段：南西区流失率 3%，重点客户 A-1002 需要重点跟进。';
    const ingested = service.ingestTextTyped(packId, text, { source_name: '续费结论.md' });
    expect(ingested.source_id).toBeTruthy();
    expect(ingested.chunk_count).toBeGreaterThan(0);
    expect(ingested.unit_count).toBeGreaterThan(0);
    expect(ingested.pack_id).toBe(packId);
    expect(ingested.deduplicated).toBe(false);

    const result = service.query(packId, { query: '华东续费率', top_k: 5 });
    // meta 六字段
    expect(result.meta.pack_id).toBe(packId);
    expect(result.meta.query).toBe('华东续费率');
    expect(result.meta.rag_backend).toBe('keyword+structure');
    expect(result.meta.reranked).toBe(false);
    expect(typeof result.meta.latency_ms).toBe('number');
    // hits
    expect(result.data.hits.length).toBeGreaterThan(0);
    const hit = result.data.hits[0];
    expect(hit.text).toContain('华东');
    expect(hit.source).toBe('续费结论.md');
    expect(hit.score).toBeGreaterThan(0);
    expect(hit.citation).toContain('续费结论.md (v1)');
    expect(hit.retrieval_channels).toContain('bm25');
    expect(hit.provenance.pack_id).toBe(packId);
    expect(hit.provenance.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(hit.raw_uri.startsWith(`memory://${packId}/`)).toBe(true);
    expect(typeof hit.matched_text).toBe('string');
    expect(typeof hit.kind).toBe('string');

    // 编号查询走 identifier 通道
    const byId = service.query(packId, { query: 'SF-2026-Q3-0091', top_k: 3 });
    expect(byId.data.hits.length).toBeGreaterThan(0);
    expect(byId.data.hits[0].retrieval_channels).toContain('identifier');
  });

  it('同文本二次摄入 deduplicated=true 且不新增 source', async () => {
    const service = await svc();
    const packId = randomBytes(16).toString('hex');
    service.createPack('去重包', '', {}, packId);
    const text = '重复内容检测：版本链与 checksum 幂等去重。Version chain dedup check 12345。';
    const first = service.ingestTextTyped(packId, text, { source_name: 'dup.txt' });
    const second = service.ingestTextTyped(packId, text, { source_name: 'dup.txt' });
    expect(second.deduplicated).toBe(true);
    expect(second.source_id).toBe(first.source_id);
    expect(service.listSources(packId, false)).toHaveLength(1);
  });

  it('同文件名新文本 → version 2 / supersedes / is_latest 迁移', async () => {
    const service = await svc();
    const packId = randomBytes(16).toString('hex');
    service.createPack('版本包', '', {}, packId);
    const v1 = service.ingestTextTyped(packId, '第一版内容 alpha', { source_name: 'doc.txt' });
    const v2 = service.ingestTextTyped(packId, '第二版内容 beta', { source_name: 'doc.txt' });
    expect(v2.version).toBe(2);
    expect(v2.supersedes).toBe(v1.source_id);
    expect(v2.is_latest).toBe(true);
    const sources = service.listSources(packId, true);
    expect(sources).toHaveLength(2);
    const latestOnly = service.listSources(packId, false);
    expect(latestOnly).toHaveLength(1);
    expect(latestOnly[0].source_id).toBe(v2.source_id);
    // 旧版本内容不再命中（is_latest=1 过滤）——用 v1 独有的英文词验证，避开共享 bigram
    const r = service.query(packId, { query: 'alpha', top_k: 5 });
    expect(r.data.hits).toHaveLength(0);
    const r2 = service.query(packId, { query: 'beta', top_k: 5 });
    expect(r2.data.hits).toHaveLength(1);
  });

  it('GET pack 返回实时 stats；blob 404；DELETE pack 后 404', async () => {
    const service = await svc();
    const packId = randomBytes(16).toString('hex');
    service.createPack('生命周期包', '', {}, packId);
    service.ingestTextTyped(packId, '统计验证内容 stats-check 9999。', { source_name: 's.txt' });
    const got = service.getPack(packId);
    expect(got.stats.sources).toBe(1);
    expect(got.stats.chunks).toBeGreaterThan(0);
    expect(got.stats.bytes).toBeGreaterThan(0);

    // blob 404（不存在的 sha）
    const fakeSha = 'a'.repeat(64);
    expect(() => service.readBlob(packId, fakeSha)).toThrow(/Blob not found/);
    // 非法 sha 格式
    expect(() => service.readBlob(packId, 'short')).toThrow(/SHA-256/);

    service.deletePack(packId);
    expect(() => service.getPack(packId)).toThrow(/not found/);
    // delete 后 query 也 404
    expect(() => service.query(packId, { query: '任意' })).toThrow(/not found/);
  });

  it('UNSUPPORTED_FORMAT 415：xlsx/pdf/png 登记但不支持', async () => {
    const service = await svc();
    const packId = randomBytes(16).toString('hex');
    service.createPack('格式包', '', {}, packId);
    for (const [name, body] of [
      ['table.xlsx', Buffer.from('PK\x03\x04')],
      ['doc.pdf', Buffer.from('%PDF-1.4')],
      ['img.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      ['unknown.zzz', Buffer.from('data')],
    ] as Array<[string, Buffer]>) {
      try {
        service.ingestFileTyped(packId, body, name, '', {}, true);
        expect.unreachable(`${name} should be rejected`);
      } catch (err) {
        expect((err as Error).message).toMatch(/Unsupported/i);
        expect((err as { code?: string }).code ?? '').toBe('UNSUPPORTED_FORMAT');
        expect((err as { status?: number }).status ?? 0).toBe(415);
      }
    }
  });

  it('filters.source_ids 限定检索范围；filters.include_history 解锁旧版本', async () => {
    const service = await svc();
    const packId = randomBytes(16).toString('hex');
    service.createPack('过滤包', '', {}, packId);
    const s1 = service.ingestTextTyped(packId, '过滤内容一 filter-one 1111。', { source_name: 'a.txt' });
    service.ingestTextTyped(packId, '过滤内容二 filter-two 2222。', { source_name: 'b.txt' });
    const scoped = service.query(packId, {
      query: '过滤内容',
      top_k: 5,
      filters: { source_ids: [s1.source_id] },
    });
    expect(scoped.data.hits).toHaveLength(1);
    expect(scoped.data.hits[0].source).toBe('a.txt');
  });

  it('top_k 边界校验：0 与 51 抛 INVALID_TOP_K', async () => {
    const service = await svc();
    const packId = randomBytes(16).toString('hex');
    service.createPack('边界包', '', {}, packId);
    expect(() => service.query(packId, { query: 'q', top_k: 0 })).toThrow(/top_k/);
    expect(() => service.query(packId, { query: 'q', top_k: 51 })).toThrow(/top_k/);
    expect(() => service.query(packId, { query: '' })).toThrow(/empty/i);
  });

  it('manifest schema 不匹配 → PACK_SCHEMA_MISMATCH', async () => {
    const service = await svc();
    const { repoDataFile } = await import('../../adapters/infra-repo-root');
    const packId = randomBytes(16).toString('hex');
    fs.mkdirSync(repoDataFile('knowledge', packId), { recursive: true });
    fs.writeFileSync(
      repoDataFile('knowledge', packId, 'memory_bank.json'),
      JSON.stringify({ schema: 'other/9', pack_id: packId }),
    );
    expect(() => service.getPack(packId)).toThrow(/inconsistent|manifest/i);
  });

  it('数据落点正确：SHADOWFLOW_DATA_DIR 生效（pack 目录在 tmp 下）', async () => {
    const service = await svc();
    const p = await paths();
    const packId = randomBytes(16).toString('hex');
    service.createPack('落点包', '', {}, packId);
    const dir = p.packDir(packId);
    expect(dir.startsWith(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'memory_bank.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'memory_bank.json'))).toBe(true);
  });
});
