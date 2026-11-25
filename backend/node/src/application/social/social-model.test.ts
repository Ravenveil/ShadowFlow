import { describe, expect, it } from 'vitest';
import {
  buildReviewRecord,
  checkMedia,
  checkPostBody,
  checkPublishable,
  checkReview,
  checkSubmitForReview,
  parseStoredMedia,
  reviewActionDecision,
  reviewNextStatus,
} from './social-model';

describe('social 帖子状态机（C5 人工审核门）', () => {
  it('仅 draft / rejected 可提审', () => {
    expect(checkSubmitForReview('draft').ok).toBe(true);
    expect(checkSubmitForReview('rejected').ok).toBe(true);
    for (const s of ['pending_review', 'approved', 'publishing', 'published', 'failed']) {
      const r = checkSubmitForReview(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_STATUS');
    }
  });

  it('仅 pending_review 可裁定（绕过审核直接裁定必须失败）', () => {
    expect(checkReview('pending_review').ok).toBe(true);
    for (const s of ['draft', 'approved', 'rejected', 'published']) {
      expect(checkReview(s).ok).toBe(false);
    }
  });

  it('人工门：审核中 / 已退回禁止外发，已发布禁止重发', () => {
    expect(checkPublishable('draft').ok).toBe(true);
    expect(checkPublishable('approved').ok).toBe(true);
    expect(checkPublishable('failed').ok).toBe(true);

    const pending = checkPublishable('pending_review');
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.code).toBe('REVIEW_PENDING');

    const rejected = checkPublishable('rejected');
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe('REVIEW_REJECTED');

    const published = checkPublishable('published');
    expect(published.ok).toBe(false);
    if (!published.ok) expect(published.code).toBe('POST_ALREADY_PUBLISHED');
  });

  it('裁定映射：approve→approved，reject→rejected；journal 枚举 reject 记 deny', () => {
    expect(reviewNextStatus('approve')).toBe('approved');
    expect(reviewNextStatus('reject')).toBe('rejected');
    expect(reviewActionDecision('approve')).toBe('approve');
    expect(reviewActionDecision('reject')).toBe('deny');
  });

  it('裁定留痕截断：意见 500 字、审核人 64 字，空值不落字段', () => {
    const long = 'x'.repeat(800);
    const rec = buildReviewRecord('approve', long, 'r'.repeat(100), 1700000000000);
    expect(rec.comment).toHaveLength(500);
    expect(rec.reviewer).toHaveLength(64);
    expect(rec.ts).toBe(1700000000000);

    const bare = buildReviewRecord('reject', undefined, undefined, 1);
    expect('comment' in bare).toBe(false);
    expect('reviewer' in bare).toBe(false);
  });
});

describe('social 平台限制校验', () => {
  const spec = { name: '小红书', title_max: 20, content_max: 1000 };

  it('正文必填、标题/正文超限分别报错', () => {
    expect(checkPostBody('', '', spec).ok).toBe(false);
    const t = checkPostBody('x'.repeat(21), 'ok', spec);
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.code).toBe('TITLE_LIMIT');
    const c = checkPostBody('t', 'x'.repeat(1001), spec);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.code).toBe('CONTENT_LIMIT');
    expect(checkPostBody('标题', '正文', spec).ok).toBe(true);
  });

  it('media 必须是字符串数组且不超平台上限', () => {
    expect(checkMedia(null, 9, '小红书')).toEqual({ ok: true, list: [] });
    const bad = checkMedia([1, 2], 9, '小红书');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('INVALID_MEDIA');

    const over = checkMedia(Array(10).fill('u'), 9, '小红书');
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('MEDIA_LIMIT');

    const ok = checkMedia(['https://a/b.jpg'], 9, '小红书');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.list).toEqual(['https://a/b.jpg']);
  });

  it('已入库 media 坏数据当空数组，不猜', () => {
    expect(parseStoredMedia('not json')).toEqual([]);
    expect(parseStoredMedia('{"a":1}')).toEqual([]);
    expect(parseStoredMedia('["a",2,"b"]')).toEqual(['a', 'b']);
  });
});
