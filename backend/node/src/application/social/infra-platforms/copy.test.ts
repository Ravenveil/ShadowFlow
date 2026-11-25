/**
 * copy.test.ts — 内容契约 template() 单元测试（2026-11-07，内容生成规范第三章）。
 *
 * 覆盖：
 *   - 八种 format（T1-T8）都产出九字段契约、ai_label 恒 true
 *   - 平台 title_max/content_max 硬裁剪（clip），产出直接过 createPost 校验
 *   - brief 缺失的字段标「待补」不编造（铁律）
 *   - 平台差异：微博 moments 带 # 话题标签；商品卡 ≤50 字三段；客服话术无 media
 *   - isContentFormat 守卫
 */
import { describe, expect, it } from 'vitest';

import {
  CONTENT_FORMATS,
  isContentFormat,
  template,
  type ContentFormat,
} from './copy';
import { findPlatform } from './index';

const BRIEF = { name: '蓝染手作围巾', price_cents: 12900 };

describe('template — 八格式九字段契约', () => {
  it.each(CONTENT_FORMATS)('format=%s → 字段完整且 ai_label 恒 true', (format) => {
    const c = template(format, BRIEF, 'xiaohongshu');
    expect(c.platform).toBe('xiaohongshu');
    expect(c.format).toBe(format);
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.content.length).toBeGreaterThan(0);
    expect(Array.isArray(c.tags)).toBe(true);
    expect(typeof c.cta).toBe('string');
    expect(Array.isArray(c.media)).toBe(true);
    expect(c.ai_label).toBe(true);
    expect(c.label_text.length).toBeGreaterThan(0);
    expect(c.compliance.checked).toBe(true);
  });

  it('标题/正文按平台上限硬裁剪（xiaohongshu title_max=20）', () => {
    const long = { name: '超长商品名称'.repeat(10), price_cents: 100 };
    for (const format of CONTENT_FORMATS) {
      const c = template(format, long, 'xiaohongshu');
      const spec = findPlatform('xiaohongshu')!;
      expect(c.title.length).toBeLessThanOrEqual(spec.title_max);
      expect(c.content.length).toBeLessThanOrEqual(spec.content_max);
    }
  });

  it('detail_page 缺失参数标「待补」不编造（铁律）', () => {
    const c = template('detail_page', BRIEF, 'xiaohongshu');
    expect(c.content).toContain('【材质工艺】待补');
    expect(c.content).toContain('【尺寸规格】待补');
    // 不编造具体材质/尺寸
    expect(c.content).not.toContain('纯棉');
    expect(c.content).not.toMatch(/【材质工艺】(?!待补)/);
  });

  it('微博 moments 带 2-3 个 # 话题标签（T5 平台差异）', () => {
    const c = template('moments', BRIEF, 'weibo');
    expect(c.tags.length).toBeGreaterThanOrEqual(2);
    expect(c.tags.length).toBeLessThanOrEqual(3);
    expect(c.tags.every((t) => t.startsWith('#') && t.endsWith('#'))).toBe(true);
  });

  it('product_card ≤50 字三段；service_reply 无 media', () => {
    const card = template('product_card', BRIEF, 'xiaohongshu');
    expect(card.content.length).toBeLessThanOrEqual(50);

    const reply = template('service_reply', BRIEF, 'xiaohongshu');
    expect(reply.media).toEqual([]);
    expect(reply.content).toContain('详询客服');
  });
});

describe('isContentFormat 守卫', () => {
  it('八种 format 全部命中，其余拒绝', () => {
    for (const f of CONTENT_FORMATS) expect(isContentFormat(f)).toBe(true);
    for (const bad of ['vlog', '', 'Note', 'note ', 42, null]) {
      expect(isContentFormat(bad as string)).toBe(false);
    }
  });

  it('CONTENT_FORMATS 恒为 8 种（T1-T8 一一对应）', () => {
    expect(CONTENT_FORMATS).toHaveLength(8);
    expect(new Set(CONTENT_FORMATS).size).toBe(8);
  });
});
