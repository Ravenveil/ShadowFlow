/**
 * compliance-lint.test.ts — P0-3 合规 lint + 词表版本化 / P0-4 AIGC 标识。
 *
 * 锁《内容生成规范 v1》第五章四道检查的机器可判三道：
 *   词表（三红线）/ 结构（title_max·content_max）/ AIGC 标识；
 * 以及 lint 结果 + ruleset_version 随 createPost 落 sp_posts（可回溯）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-lint-'));
beforeAll(() => {
  process.chdir(tmpRoot);
});
afterAll(async () => {
  const { _resetForTests } = await import('../../storage/sqlite');
  _resetForTests();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* Windows WAL 延迟 */
  }
});

import { lintContent, RULESET_VERSION } from './compliance-lint';

describe('lintContent — 三红线词表', () => {
  it('卖惨红线命中（去标签化）', () => {
    const r = lintContent({ platform: 'xiaohongshu', content: '残障人士手作，献爱心帮帮他们', ai_label: true });
    expect(r.passed).toBe(false);
    const words = r.violations.map((v) => v.word);
    expect(words).toContain('残障人士手作');
    expect(words).toContain('献爱心');
    expect(r.violations.some((v) => v.type === 'sell_pity')).toBe(true);
  });

  it('广告法红线命中（绝对化用语）', () => {
    const r = lintContent({ platform: 'weibo', content: '全网最低价，100% 好评，绝对好用', ai_label: true });
    const words = r.violations.map((v) => v.word);
    expect(words).toContain('全网最低');
    expect(words).toContain('100%');
    expect(words).toContain('绝对');
    expect(r.violations.some((v) => v.type === 'ad_law')).toBe(true);
  });

  it('功效红线命中（无资质禁功效）', () => {
    const r = lintContent({ platform: 'douyin', content: '美白杀菌，保健疗效显著', ai_label: true });
    const words = r.violations.map((v) => v.word);
    expect(words).toContain('美白');
    expect(words).toContain('杀菌');
    expect(words).toContain('保健');
    expect(r.violations.some((v) => v.type === 'efficacy')).toBe(true);
  });

  it('干净文案零违规（合规模板文案样本）', () => {
    const r = lintContent({
      platform: 'xiaohongshu',
      title: '洗手台上的松弛感',
      content: '加班回家最想做的，就是把一天洗掉。这块皂是手艺人一块块切出来的，釉色沉稳。#手作 #好物',
      ai_label: true,
    });
    expect(r.violations.filter((v) => v.type !== 'ai_label')).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('同词多处命中逐条报（附位置）', () => {
    const r = lintContent({ platform: 'weibo', content: '治愈心灵，治愈生活', ai_label: true });
    const hits = r.violations.filter((v) => v.word === '治愈');
    expect(hits.length).toBe(2);
    expect(hits[0].index).toBe(0);
    expect(hits[1].index).toBe(5);
  });
});

describe('lintContent — 结构检查（只报告不裁剪）', () => {
  it('小红书标题 20 字越界报告', () => {
    const title = '这是一个超过二十个字的很长很长的标题用来测试结构检查';
    const r = lintContent({ platform: 'xiaohongshu', title, content: '正文', ai_label: true });
    expect(r.structural.title_over).toBe(true);
    expect(r.structural.title_max).toBe(20);
    expect(r.violations.some((v) => v.type === 'structure' && v.field === 'title')).toBe(true);
  });

  it('正文长度如实报告（不过界 passed 面干净）', () => {
    const r = lintContent({ platform: 'xiaohongshu', title: '短标题', content: '短正文', ai_label: true });
    expect(r.structural.title_over).toBe(false);
    expect(r.structural.content_over).toBe(false);
    expect(r.structural.content_len).toBe(3);
  });
});

describe('lintContent — AIGC 标识检查', () => {
  it('未勾选且文内无声明 → 报 ai_label 缺失', () => {
    const r = lintContent({ platform: 'xiaohongshu', content: '普通文案' });
    expect(r.ai_label_present).toBe(false);
    expect(r.violations.some((v) => v.type === 'ai_label')).toBe(true);
  });

  it('勾选 ai_label=true → 在位', () => {
    const r = lintContent({ platform: 'xiaohongshu', content: '普通文案', ai_label: true });
    expect(r.ai_label_present).toBe(true);
    expect(r.violations.some((v) => v.type === 'ai_label')).toBe(false);
  });

  it('文内声明块 → 在位（发布器无开关平台的落位）', () => {
    const r = lintContent({ platform: 'wechat_mp', content: '正文……\n\n内容由 AI 生成' });
    expect(r.ai_label_present).toBe(true);
  });

  it('label_text 声明文案在文内 → 在位', () => {
    const r = lintContent({
      platform: 'wechat_mp',
      content: '正文……【智能合成内容】',
      label_text: '【智能合成内容】',
    });
    expect(r.ai_label_present).toBe(true);
  });
});

describe('词表版本化', () => {
  it('lint 结果携带 ruleset_version（可回溯）', () => {
    const r = lintContent({ platform: 'weibo', content: 'x', ai_label: true });
    expect(r.ruleset_version).toBe(RULESET_VERSION);
    expect(RULESET_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
  });
});

// ── 集成：createPost 自动落 compliance_json / ai_label / ruleset_version ─────
describe('sp_posts 落库集成（P0-4）', () => {
  it('createPost 默认带标 + lint 结果落行', async () => {
    const { createAccount, createPost, getPost } = await import('../../storage/social-publish');
    const acc = createAccount({
      platform: 'xiaohongshu',
      account_name: '工坊主号',
      auth_mode: 'mock',
    });
    const post = createPost({
      account_id: acc.id,
      title: '手作上新',
      content: '手艺人认真做的皂',
    });
    expect(post.ai_label).toBe(1);
    expect(post.label_text).toBe('内容由 AI 生成');
    expect(post.ruleset_version).toBe(RULESET_VERSION);
    const compliance = JSON.parse(post.compliance_json);
    expect(compliance.checked).toBe(true);
    expect(compliance.passed).toBe(true);

    // 回读（SELECT *）字段仍在
    const got = getPost(post.id);
    expect(got?.ai_label).toBe(1);
    expect(got?.ruleset_version).toBe(RULESET_VERSION);
  });

  it('违规内容照落库但 violations 留痕（草稿箱不阻断，人工门打回）', async () => {
    const { createAccount, createPost } = await import('../../storage/social-publish');
    const acc = createAccount({
      platform: 'weibo',
      account_name: '微博号',
      auth_mode: 'mock',
    });
    const post = createPost({
      account_id: acc.id,
      content: '全网最低，治愈一切',
    });
    const compliance = JSON.parse(post.compliance_json);
    expect(compliance.passed).toBe(false);
    expect(compliance.violations.length).toBeGreaterThan(0);
  });

  it('ai_label=false 显式关标落库（0）', async () => {
    const { createAccount, createPost } = await import('../../storage/social-publish');
    const acc = createAccount({
      platform: 'weibo',
      account_name: '微博号2',
      auth_mode: 'mock',
    });
    const post = createPost({
      account_id: acc.id,
      content: '普通文案',
      ai_label: false,
    });
    expect(post.ai_label).toBe(0);
    const compliance = JSON.parse(post.compliance_json);
    expect(compliance.ai_label_present).toBe(false);
  });
});
