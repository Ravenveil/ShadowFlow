/**
 * dispatch.test.ts — 单路径检索验证（lib/memory-bank.ts 与 storage/craft-intake.ts）。
 *
 * ADR-0001（2026-11-24）后只有一条本地路径：
 *   - 本地 pack 有数据 → knowledgeBlock 直出（SF_MEMORY_BANK_MODE 已作废）；
 *   - craft-intake：ingestProductMaterial 本地建 pack 并落库，二次去重；
 *     fail-soft：异常路径返回 null 不抛。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';

let tmpDir = '';
const prevDataDir = process.env.SHADOWFLOW_DATA_DIR;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-dispatch-'));
  process.env.SHADOWFLOW_DATA_DIR = tmpDir;
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.SHADOWFLOW_DATA_DIR;
  else process.env.SHADOWFLOW_DATA_DIR = prevDataDir;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

describe('lib/memory-bank 分流', () => {
  it('auto 模式：本地 pack 直接命中（不依赖 Python）', async () => {
    delete process.env.SF_MEMORY_BANK_MODE;
    delete process.env.SF_BACKEND_MODE;
    const service = await import('../service');
    const lib = await import('../../lib/memory-bank');
    const packId = randomBytes(16).toString('hex');
    service.createPack('分流包', '', {}, packId);
    service.ingestTextTyped(packId, '分流验证：本地检索应命中的内容 dispatch-check 7777。', {
      source_name: 'd.txt',
    });
    const hits = await lib.fetchMemoryBankHits([packId], '本地检索命中');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source).toBe('d.txt');
    const block = await lib.knowledgeBlock([packId], '本地检索命中');
    expect(block).toContain('知识库参考');
    expect(block).toContain('d.txt');
    // coercePackIds 不变
    expect(lib.coercePackIds(['a', 'a', 1, '', 'b'])).toEqual(['a', 'b']);
  });

  it('SF_MEMORY_BANK_MODE 已作废（ADR-0001）：显式 python 也走本地', async () => {
    process.env.SF_MEMORY_BANK_MODE = 'python';
    const service = await import('../service');
    const lib = await import('../../lib/memory-bank');
    const packId = randomBytes(16).toString('hex');
    service.createPack('py模式包', '', {}, packId);
    service.ingestTextTyped(packId, 'python 标签不再分流，本地必中 py-mode-check 8888。', {
      source_name: 'p.txt',
    });
    const hits = await lib.fetchMemoryBankHits([packId], 'py-mode-check');
    expect(hits.length).toBeGreaterThan(0);
    delete process.env.SF_MEMORY_BANK_MODE;
  });

  it('node 模式（single 语义）：本地命中且不发 HTTP', async () => {
    process.env.SF_MEMORY_BANK_MODE = 'node';
    const service = await import('../service');
    const lib = await import('../../lib/memory-bank');
    const packId = randomBytes(16).toString('hex');
    service.createPack('node模式包', '', {}, packId);
    service.ingestTextTyped(packId, 'node 模式本地必中 node-mode-check 9999。', { source_name: 'n.txt' });
    const hits = await lib.fetchMemoryBankHits([packId], 'node-mode-check');
    expect(hits.length).toBeGreaterThan(0);
    delete process.env.SF_MEMORY_BANK_MODE;
  });

  it('不存在的 pack：fail-soft 返回空，绝不抛', async () => {
    delete process.env.SF_MEMORY_BANK_MODE;
    const lib = await import('../../lib/memory-bank');
    const ghost = randomBytes(16).toString('hex');
    const hits = await lib.fetchMemoryBankHits([ghost], '任意查询词');
    expect(hits).toHaveLength(0);
    expect(await lib.knowledgeBlock([ghost], '任意查询词')).toBe('');
    expect(await lib.knowledgeBlock([], 'q')).toBe('');
    expect(await lib.knowledgeBlock(['x'], '')).toBe('');
  });
});

describe('craft-intake 分流', () => {
  it('auto：ingestProductMaterial 本地建包并落库，二次去重', async () => {
    delete process.env.SF_MEMORY_BANK_MODE;
    const craft = await import('../../storage/craft-intake');
    const service = await import('../service');
    craft._resetCraftPackCache();
    const packId1 = await craft.ingestProductMaterial(
      '这是一段足够长的产品资料介绍，用于验证 craft-intake 本地落库链路。',
      '产品资料.txt',
    );
    expect(packId1).toBeTruthy();
    const packs = service.listPacks();
    const craftPack = packs.find((p) => p.name === craft.CRAFT_PACK_NAME);
    expect(craftPack?.pack_id).toBe(packId1);
    // 幂等：同 pack 名复用
    const packId2 = await craft.ingestProductMaterial(
      '这是另一段足够长的产品资料介绍，仍应落在同一个手工艺品资料包里。',
    );
    expect(packId2).toBe(packId1);
  });

  it('短消息/命令不同步（<10 字符 或 / 开头）', async () => {
    const craft = await import('../../storage/craft-intake');
    expect(await craft.ingestProductMaterial('短句')).toBeNull();
    expect(await craft.ingestProductMaterial('/command something long enough')).toBeNull();
  });

  it('node 模式：本地路径生效', async () => {
    process.env.SF_MEMORY_BANK_MODE = 'node';
    const craft = await import('../../storage/craft-intake');
    craft._resetCraftPackCache();
    const packId = await craft.ingestProductMaterial(
      'node 模式下的产品资料同步验证，这段文字足够长可以入库。',
    );
    expect(packId).toBeTruthy();
    delete process.env.SF_MEMORY_BANK_MODE;
  });
});
