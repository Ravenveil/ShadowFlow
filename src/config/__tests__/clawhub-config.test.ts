/**
 * clawhub-config.test.ts — 前端基础层单测（ClawHub T04/T09）。
 *
 * 覆盖：
 *  - DICEBEAR_STYLES 12 套、默认风格 bottts-neutral
 *  - hashSeed 稳定性（同名同 hash）+ 随机种子非空
 *  - renderAvatarSvg 本地生成 SVG（含 seed 属性、svg 标签、离线无网络请求）
 *  - normalizeStyle 未知风格兜底
 *  - resolveClawMeta 品牌/未收录回落
 */
import { describe, expect, it } from 'vitest';
import {
  DICEBEAR_STYLES,
  DEFAULT_AVATAR_STYLE,
  hashSeed,
  randomSeed,
  renderAvatarSvg,
  normalizeStyle,
  isKnownStyle,
  resolveClawMeta,
  clawCategoryLabel,
} from '../../config/clawhub';

describe('DICEBEAR_STYLES — 包内全量风格', () => {
  it('30 套（collection 包全部人物类风格）且 id 唯一', () => {
    expect(DICEBEAR_STYLES).toHaveLength(30);
    const ids = new Set(DICEBEAR_STYLES.map((s) => s.id));
    expect(ids.size).toBe(30);
  });

  it('默认风格 = bottts-neutral', () => {
    expect(DEFAULT_AVATAR_STYLE).toBe('bottts-neutral');
  });

  it('包含架构文档 §3.7 指定的全部风格', () => {
    const expected = [
      'adventurer', 'avataaars', 'bottts', 'bottts-neutral', 'big-ears', 'croodles',
      'dylan', 'fun-emoji', 'lorelei', 'micah', 'miniavs', 'pixel-art',
    ];
    for (const id of expected) {
      expect(DICEBEAR_STYLES.some((s) => s.id === id)).toBe(true);
    }
  });

  it('2026-10-30 扩容新增风格全部在列', () => {
    const added = [
      'adventurer-neutral', 'avataaars-neutral', 'big-ears-neutral', 'big-smile',
      'croodles-neutral', 'glass', 'identicon', 'initials', 'lorelei-neutral',
      'notionists', 'notionists-neutral', 'open-peeps', 'personas',
      'pixel-art-neutral', 'rings', 'shapes', 'thumbs', 'toon-head',
    ];
    for (const id of added) {
      expect(DICEBEAR_STYLES.some((s) => s.id === id)).toBe(true);
    }
  });
});

describe('hashSeed — FNV-1a 稳定种子', () => {
  it('同名同 hash、异名大概率不同', () => {
    expect(hashSeed('研究助手')).toBe(hashSeed('研究助手'));
    expect(hashSeed('研究助手')).not.toBe(hashSeed('销售专家'));
  });

  it('输出 8 位 hex', () => {
    expect(hashSeed('x')).toMatch(/^[0-9a-f]{8}$/);
    expect(hashSeed('')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('randomSeed 非空且可变', () => {
    const a = randomSeed();
    const b = randomSeed();
    expect(a.length).toBeGreaterThan(4);
    // 连续两次极大概率不同（时间戳+随机段）
    expect(a === b).toBe(false);
  });
});

describe('renderAvatarSvg — 本地生成', () => {
  it('产出合法 <svg> 文档', () => {
    const svg = renderAvatarSvg('bottts-neutral', 'test-seed');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    // 圆角裁切（radius:50）生效
    expect(svg).toContain('viewboxMask');
  });

  it('同 seed 同风格 → 确定性输出（同名同头像）；不同 seed → 不同输出', () => {
    const a1 = renderAvatarSvg('bottts-neutral', 'seed-a');
    const a2 = renderAvatarSvg('bottts-neutral', 'seed-a');
    const b = renderAvatarSvg('bottts-neutral', 'seed-b');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it('全部风格可渲染（tree-shaking 后无缺风格）', () => {
    for (const s of DICEBEAR_STYLES) {
      const svg = renderAvatarSvg(s.id, 'k');
      expect(svg.startsWith('<svg')).toBe(true);
    }
  });

  it('未知/空风格 → 默认风格兜底', () => {
    expect(normalizeStyle('no-such-style')).toBe('bottts-neutral');
    expect(normalizeStyle('')).toBe('bottts-neutral');
    expect(normalizeStyle(null)).toBe('bottts-neutral');
    expect(normalizeStyle('pixel-art')).toBe('pixel-art');
    expect(isKnownStyle('pixel-art')).toBe(true);
    expect(isKnownStyle('nope')).toBe(false);
  });

  it('seed 缺省 → hashSeed 兜底（确定性 + 不炸）', () => {
    const s1 = renderAvatarSvg('adventurer', null);
    const s2 = renderAvatarSvg('adventurer', null);
    expect(s1.startsWith('<svg')).toBe(true);
    // 缺省 seed = hashSeed('shadowflow') → 两次调用一致
    expect(s1).toBe(s2);
  });
});

describe('resolveClawMeta — 品牌映射', () => {
  it('已知 Claw 带品牌色', () => {
    expect(resolveClawMeta('openclaw').monogram).toBe('O');
    expect(resolveClawMeta('autoresearchclaw').monogram).toBe('A');
    expect(resolveClawMeta('hermes').monogram).toBe('H');
  });

  it('未收录 Claw 回落首字母 + 灰', () => {
    const meta = resolveClawMeta('qoder');
    expect(meta.monogram).toBe('Q');
    expect(meta.tint).toBe('#71717A');
  });
});

describe('clawCategoryLabel — 分类标签', () => {
  it('已知分类中文标签；未知回落原值；空回落其他', () => {
    expect(clawCategoryLabel('research')).toBe('研究');
    expect(clawCategoryLabel('assistant')).toBe('助手');
    expect(clawCategoryLabel('custom-x')).toBe('custom-x');
    expect(clawCategoryLabel(null)).toBe('其他');
    expect(clawCategoryLabel(undefined)).toBe('其他');
  });
});
