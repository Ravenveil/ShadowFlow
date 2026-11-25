/**
 * fts.test.ts — 中文 bigram 分词金样本（Python _fts_terms :578-596 对齐验证）。
 *
 * 这些用例就是"迁移后中文召回不丢"的合同：
 *   - 中英混排各出各的 term；
 *   - 编号/带符号词保形（SF-2026-Q3-0091）；
 *   - 长 CJK run 出 bigram + ≤12 字整串；
 *   - 单字 run 原样保留；
 *   - 超长 run 截 256 且不出整串；
 *   - 保序去重；
 *   - ftsQuery 的 96 term 上限与引号转义。
 */
import { describe, it, expect } from 'vitest';
import { ftsTerms, ftsText, ftsQuery, cleanText, slidingSpans, jaccard, lexicalTokens } from '../text';

describe('ftsTerms — 中文 bigram 金样本', () => {
  it('纯中文 run 产出 bigram + 整串（len≤12）', () => {
    const terms = ftsTerms('知识库');
    // bigram: 知识 识库；整串: 知识库
    expect(terms).toContain('知识');
    expect(terms).toContain('识库');
    expect(terms).toContain('知识库');
    expect(terms).toHaveLength(3);
  });

  it('长 CJK run（>12 字）只出 bigram，不出整串', () => {
    const run = '一二三四五六七八九十百千万'; // 13 字
    const terms = ftsTerms(run);
    expect(terms).toHaveLength(12); // bigram 数 = len-1
    expect(terms).not.toContain(run);
    expect(terms).toContain('一二');
    expect(terms).toContain('十百');
    expect(terms).toContain('千万');
  });

  it('超长 run 截到 256 字符（重复字去重后 1 个 bigram）', () => {
    // 300 个不同的字符超出常用区不便构造；用重复字验证「去重 + 截断」组合行为：
    // '汉'×300 截 256 → 全部 bigram 均为 '汉汉' → 去重后 1 个。
    const long = '汉'.repeat(300);
    const terms = ftsTerms(long);
    expect(terms).toEqual(['汉汉']);
  });

  it('超长 run 且互异字符：bigram 数 = 255（截 256 后）', () => {
    // 用 256+ 个互异 CJK 字符（U+4E00 起连续取 300 个）
    const chars = Array.from({ length: 300 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('');
    const terms = ftsTerms(chars);
    expect(terms).toHaveLength(255);
    expect(terms).not.toContain(chars.slice(0, 256)); // >12 不出整串
  });

  it('单字 run 原样保留', () => {
    expect(ftsTerms('好')).toEqual(['好']);
  });

  it('中英混排各出各的 term', () => {
    const terms = ftsTerms('华东 Q3 renewal');
    expect(terms).toContain('华东');
    expect(terms).toContain('q3');
    expect(terms).toContain('renewal');
  });

  it('编号词保形且小写：SF-2026-Q3-0091', () => {
    const terms = ftsTerms('SF-2026-Q3-0091');
    expect(terms).toContain('sf-2026-q3-0091');
  });

  it('带符号词仅符号时丢弃（strip 防御）', () => {
    const terms = ftsTerms('---');
    expect(terms).toHaveLength(0);
  });

  it('保序去重：重复出现只留首现', () => {
    const terms = ftsTerms('知识 知识 knowledge knowledge');
    const knowledgeCount = terms.filter((t) => t === 'knowledge').length;
    expect(knowledgeCount).toBe(1);
    // words 全部先于 CJK runs（Python 两段 for 顺序）
    expect(terms).toEqual(['knowledge', '知识']);
  });

  it('词截断 128 字符', () => {
    const longWord = `a${'b'.repeat(200)}`;
    const terms = ftsTerms(longWord);
    expect(terms[0]).toHaveLength(128);
  });
});

describe('ftsQuery — MATCH 串构造', () => {
  it('term 双引号包裹 + OR 连接', () => {
    const q = ftsQuery('知识库');
    expect(q).toBe('"知识" OR "识库" OR "知识库"');
  });

  it('引号不在词字符类内：a"b 分为 a、b 两词（与 Python WORD_RE 一致）', () => {
    const q = ftsQuery('a"b');
    expect(q).toBe('"a" OR "b"');
  });

  it('超过 96 term 截断', () => {
    const long = Array.from({ length: 150 }, (_, i) => `w${i}`).join(' ');
    const parts = ftsQuery(long).split(' OR ');
    expect(parts).toHaveLength(96);
  });

  it('ftsText 输出空格连接', () => {
    expect(ftsText('知识库')).toBe('知识 识库 知识库');
  });
});

describe('cleanText — 文本归一', () => {
  it('CRLF/多空行/行内空白折叠', () => {
    const out = cleanText('a\r\n\r\n\r\nb   c\t d\n\n\n\ne');
    expect(out).toBe('a\n\nb c d\n\ne');
  });
  it('去 NUL 字符', () => {
    expect(cleanText('a\x00b')).toBe('ab');
  });
});

describe('slidingSpans — 滑窗边界', () => {
  it('短文本整体返回', () => {
    expect(slidingSpans('短文本', 420, 64)).toEqual([[0, 3]]);
  });
  it('长文本按边界切且永远前进', () => {
    const text = `${'一'.repeat(200)}。\n${'二'.repeat(200)}。\n${'三'.repeat(200)}。`;
    const spans = slidingSpans(text, 100, 20);
    expect(spans.length).toBeGreaterThan(1);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i][0]).toBeGreaterThan(spans[i - 1][0]);
    }
  });
});

describe('jaccard / lexicalTokens — 近重复抑制输入', () => {
  it('相同文本 jaccard = 1', () => {
    const a = lexicalTokens('知识库检索');
    expect(jaccard(a, a)).toBe(1);
  });
  it('不相交集合 = 0', () => {
    expect(jaccard(lexicalTokens('甲'), lexicalTokens('乙'))).toBe(0);
  });
});
