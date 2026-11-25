/**
 * handoff 纯规则层单测：零 IO、不启 server、不碰磁盘。
 * 覆盖画像写回置信度决策这条核心不变量链。
 */

import { describe, it, expect } from 'vitest';
import {
  decideWriteback,
  assertConfidence,
  matchFeedbackRules,
  feedbackSnippet,
  normalizeFeedbackInput,
  capNum,
  dedupHashInput,
  parseJsonArray,
  HandoffDomainError,
  FEEDBACK_RULES,
} from './handoff-model';

describe('画像写回置信度决策（核心不变量）', () => {
  it('无当前值 → create，值置信度原样落库', () => {
    const d = decideWriteback(undefined, { value: 'A', confidence: 0.7 });
    expect(d).toEqual({ action: 'create', value: 'A', confidence: 0.7, changed: true });
  });

  it('新置信度更高 → update', () => {
    const d = decideWriteback({ value: 'A', confidence: 0.5 }, { value: 'B', confidence: 0.9 });
    expect(d.action).toBe('update');
    expect(d.value).toBe('B');
    expect(d.changed).toBe(true);
  });

  it('同置信不同说法 → conflict，不覆盖', () => {
    const d = decideWriteback({ value: 'A', confidence: 0.7 }, { value: 'B', confidence: 0.7 });
    expect(d.action).toBe('conflict');
    expect(d.value).toBe('A'); // 保留原值
    expect(d.changed).toBe(false);
  });

  it('同置信同说法 → keep', () => {
    const d = decideWriteback({ value: 'A', confidence: 0.7 }, { value: 'A', confidence: 0.7 });
    expect(d.action).toBe('keep');
    expect(d.changed).toBe(false);
  });

  it('更低置信度 → keep', () => {
    const d = decideWriteback({ value: 'A', confidence: 0.9 }, { value: 'B', confidence: 0.5 });
    expect(d.action).toBe('keep');
    expect(d.value).toBe('A');
  });

  it('force 且值不同 → override，置信度取 max', () => {
    const d = decideWriteback({ value: 'A', confidence: 0.9 }, { value: 'B', confidence: 0.5, force: true });
    expect(d.action).toBe('override');
    expect(d.value).toBe('B');
    expect(d.confidence).toBe(0.9);
    expect(d.changed).toBe(true);
  });

  it('force 且值相同 → keep（不把确认记成覆盖）', () => {
    const d = decideWriteback({ value: 'A', confidence: 0.7 }, { value: 'A', confidence: 0.7, force: true });
    expect(d.action).toBe('keep');
    expect(d.changed).toBe(false);
  });

  it('置信度越界抛领域错误', () => {
    expect(() => assertConfidence(-0.1)).toThrow(HandoffDomainError);
    expect(() => assertConfidence(1.1)).toThrow(HandoffDomainError);
    expect(assertConfidence(0.5)).toBe(0.5);
  });
});

describe('反馈规则', () => {
  it('关键词匹配命中正确 key', () => {
    const hits = matchFeedbackRules('我更喜欢简洁的方案，别用复杂的');
    const keys = hits.map(([k]) => k);
    expect(keys).toContain('preference');
  });

  it('无命中 → 空数组', () => {
    expect(matchFeedbackRules('今天天气不错')).toHaveLength(0);
  });

  it('片段提取：取命中关键词的那一小句', () => {
    const s = feedbackSnippet('价格有点高，但我更倾向简洁的方案', ['倾向', '简洁']);
    expect(s).toContain('简洁');
    expect(s.length).toBeLessThanOrEqual(120);
  });

  it('片段提取：无命中回退全文并截断', () => {
    const s = feedbackSnippet('x'.repeat(200), ['不存在']);
    expect(s.length).toBe(120);
  });

  it('规则表非空且结构稳定', () => {
    expect(FEEDBACK_RULES.length).toBeGreaterThan(0);
    for (const [key, words] of FEEDBACK_RULES) {
      expect(typeof key).toBe('string');
      expect(Array.isArray(words)).toBe(true);
    }
  });
});

describe('反馈输入规整', () => {
  it('默认值回填 + 截断', () => {
    const n = normalizeFeedbackInput({ subject_id: ' s1 ', text: ' hi ' });
    expect(n.subject_id).toBe('s1');
    expect(n.subject_type).toBe('customer');
    expect(n.source).toBe('api');
    expect(n.actor).toBe('system');
  });

  it('空 subject_id / text 抛错', () => {
    expect(() => normalizeFeedbackInput({ subject_id: '', text: 'x' })).toThrow(HandoffDomainError);
    expect(() => normalizeFeedbackInput({ subject_id: 's', text: '' })).toThrow(HandoffDomainError);
  });

  it('text 截断到 1000', () => {
    const n = normalizeFeedbackInput({ subject_id: 's', text: 'x'.repeat(2000) });
    expect(n.text.length).toBe(1000);
  });
});

describe('工具函数', () => {
  it('capNum 有限正数截断、非法回退', () => {
    expect(capNum('50', 100, 500)).toBe(50);
    expect(capNum(999, 100, 500)).toBe(500);
    expect(capNum(-1, 100, 500)).toBe(100);
    expect(capNum('abc', 100, 500)).toBe(100);
  });

  it('dedupHashInput 用 NUL 分隔防碰撞', () => {
    expect(dedupHashInput('customer', 's1', 'text')).not.toBe(
      dedupHashInput('customer', 's1\u0000text', ''),
    );
  });

  it('parseJsonArray 容错', () => {
    expect(parseJsonArray('["a","b"]')).toEqual(['a', 'b']);
    expect(parseJsonArray('not json')).toEqual([]);
    expect(parseJsonArray('[1,2]')).toEqual([]);
  });
});
