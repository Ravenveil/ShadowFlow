/**
 * memory-bank.test.ts — 记忆库检索辅助模块契约（对话框知识库接线）。
 *
 * ADR-0001（2026-11-24）后只有一条本地路径（直调 memory-bank/service，
 * 零网络）。用临时 SHADOWFLOW_DATA_DIR 建真实 pack 验证：
 *   - coercePackIds：清洗 / 去重 / 上限 8 / 非法项丢弃
 *   - fetchMemoryBankHits：多包聚合、score 降序、幽灵包 fail-soft、零 HTTP
 *   - renderKnowledgeBlock：来源标注、单条截断、整块截断、零命中 ''
 *   - knowledgeBlock：fail-soft（异常返回 ''，绝不抛）
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import {
  coercePackIds,
  fetchMemoryBankHits,
  renderKnowledgeBlock,
  knowledgeBlock,
} from '../application/memory-bank/检索辅助';

let tmpDir = '';
const prevDataDir = process.env.SHADOWFLOW_DATA_DIR;
let packLow = '';
let packHigh = '';
let packGhost = '';

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-lib-'));
  process.env.SHADOWFLOW_DATA_DIR = tmpDir;
  const service = await import('../application/memory-bank/service');
  // 两包造分差：高频重复关键词的包得分更高（检索按词频相关度打分）。
  packHigh = randomBytes(16).toString('hex');
  service.createPack('高分包', '', {}, packHigh);
  service.ingestTextTyped(
    packHigh,
    '氢能 氢能 氢能：氢能是零碳能源载体，氢能产业集群正在成型。',
    { source_name: 'b.md' },
  );
  packLow = randomBytes(16).toString('hex');
  service.createPack('低分包', '', {}, packLow);
  service.ingestTextTyped(packLow, '氢能有一点相关：顺带提了一句别的。', {
    source_name: 'a.md',
  });
  packGhost = randomBytes(16).toString('hex');
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

describe('coercePackIds', () => {
  it('returns [] for non-array input', () => {
    expect(coercePackIds(undefined)).toEqual([]);
    expect(coercePackIds(null)).toEqual([]);
    expect(coercePackIds('p1')).toEqual([]);
    expect(coercePackIds({ 0: 'p1' })).toEqual([]);
  });

  it('trims, drops non-strings/empty/oversized, dedupes', () => {
    expect(
      coercePackIds([' p1 ', 'p1', '', '   ', 42, null, { x: 1 }, 'p2', 'x'.repeat(201)]),
    ).toEqual(['p1', 'p2']);
  });

  it('caps at 8 ids', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    expect(coercePackIds(ids)).toEqual(ids.slice(0, 8));
  });
});

describe('fetchMemoryBankHits', () => {
  it('returns [] without packs or with blank query — 零网络', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchMemoryBankHits([], 'q')).toEqual([]);
    expect(await fetchMemoryBankHits([packHigh], '   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('queries both packs and aggregates hits by score desc', async () => {
    const hits = await fetchMemoryBankHits([packLow, packHigh], '氢能');
    // 两包各贡献一条；聚合后按 score 降序（分值细节是 service 的黑盒）
    expect(hits.map((h: any) => h.source).sort()).toEqual(['a.md', 'b.md']);
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('skips ghost pack but keeps real one (fail-soft)', async () => {
    const hits = await fetchMemoryBankHits([packGhost, packHigh], '氢能');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h: any) => h.source === 'b.md')).toBe(true);
  });

  it('single path: 绝不发 HTTP（stub 后本地照常命中）', async () => {
    // 固化 ADR-0001 契约：检索只走本地实现，任何情况下不发网络请求
    // （防止未来改动再次引入隐式 HTTP 回退）。
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const hits = await fetchMemoryBankHits([packHigh], '氢能');
    expect(hits.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('renderKnowledgeBlock', () => {
  it("returns '' for zero hits", () => {
    expect(renderKnowledgeBlock([])).toBe('');
  });

  it('renders header with source annotation per hit', () => {
    const block = renderKnowledgeBlock([
      { text: '片段一', source: 'a.md', score: 1 },
      { text: '片段二', source: 'b.md', score: 0.5 },
    ]);
    expect(block).toContain('## 知识库参考');
    expect(block).toContain('- （来源：a.md）片段一');
    expect(block).toContain('- （来源：b.md）片段二');
  });

  it('truncates single hit text at 400 chars', () => {
    const block = renderKnowledgeBlock([{ text: 'x'.repeat(500), source: 's', score: 1 }]);
    expect(block).toContain(`${'x'.repeat(400)}…`);
    expect(block).not.toContain('x'.repeat(401) + 'x'.repeat(100));
  });

  it('caps whole block at 4000 chars with truncation marker', () => {
    const hits = Array.from({ length: 20 }, (_, i) => ({
      text: `段落${i}：${'文'.repeat(380)}`,
      source: `s${i}.md`,
      score: 1 - i * 0.01,
    }));
    const block = renderKnowledgeBlock(hits);
    expect(block.length).toBeLessThanOrEqual(4000 + '\n…（已截断）'.length);
    expect(block.endsWith('…（已截断）')).toBe(true);
  });
});

describe('knowledgeBlock', () => {
  it('returns rendered block from the real pack', async () => {
    const block = await knowledgeBlock([packHigh], '氢能');
    expect(block).toContain('## 知识库参考');
    expect(block).toContain('（来源：b.md）');
  });

  it('fails soft to empty string on ghost pack', async () => {
    await expect(knowledgeBlock([packGhost], '任意')).resolves.toBe('');
  });

  it('returns empty string for undefined packIds', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(knowledgeBlock(undefined, 'q')).resolves.toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
