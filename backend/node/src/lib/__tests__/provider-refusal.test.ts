/**
 * provider-refusal.test.ts — 模型错误人话化（2026-11-08，OpenBot 模式）。
 *
 * 覆盖：
 *   1. 各类别典型供应商错误 → 对应人话（密钥/限流/额度/未知模型/超长/超时/宕机）
 *   2. 认不出的错误 → 通用文案 + 原始尾巴
 *   3. 摘录截断（超 160 字符加省略号）
 *   4. 空/脏输入 → 通用文案，不抛
 *   5. classifyModelError 类别归位
 */
import { describe, it, expect } from 'vitest';
import { humanizeModelError, classifyModelError } from '../provider-refusal';

describe('humanizeModelError', () => {
  it('密钥类错误 → 密钥人话', () => {
    expect(humanizeModelError('mimo API key not configured (BYOK)')).toContain('密钥');
    expect(humanizeModelError('401 Unauthorized')).toContain('密钥');
  });

  it('限流类错误 → 限流人话', () => {
    expect(humanizeModelError('429 Too Many Requests')).toContain('限流');
    expect(humanizeModelError('Rate limit exceeded for model')).toContain('限流');
  });

  it('额度/欠费类错误 → 额度人话', () => {
    expect(humanizeModelError('You exceeded your current quota')).toContain('额度');
    expect(humanizeModelError('insufficient_balance')).toContain('额度');
  });

  it('未知模型 → 模型配置人话', () => {
    expect(humanizeModelError('The model `gpt-99` does not exist')).toContain('模型');
    expect(classifyModelError('unknown model: foo-bar')).toBe('model_unknown');
  });

  it('请求超长 → 上下文人话', () => {
    expect(humanizeModelError('This model maximum context length is 8192 tokens')).toContain('请求过大');
  });

  it('超时 → 超时人话', () => {
    expect(humanizeModelError('ETIMEDOUT')).toContain('超时');
  });

  it('供应商宕机/网络 → 不可用人话', () => {
    expect(humanizeModelError('ECONNREFUSED')).toContain('不可用');
    expect(humanizeModelError('503 Service Unavailable')).toContain('不可用');
  });

  it('认不出的错误 → 通用文案 + 原始尾巴（可排障）', () => {
    const out = humanizeModelError('boom');
    expect(out).toContain('模型服务返回异常');
    expect(out).toContain('boom');
  });

  it('超长原始错误截断为 160 字符摘录', () => {
    const out = humanizeModelError('x'.repeat(300));
    expect(out).toContain('…');
    expect(out.length).toBeLessThan(220);
  });

  it('空/脏输入不抛，返回通用文案', () => {
    expect(humanizeModelError(undefined)).toContain('模型服务返回异常');
    expect(humanizeModelError(null)).toContain('模型服务返回异常');
    expect(humanizeModelError('   ')).toContain('模型服务返回异常');
  });
});

describe('classifyModelError', () => {
  it('类别归位', () => {
    expect(classifyModelError('no api key')).toBe('key_missing');
    expect(classifyModelError('429')).toBe('rate_limited');
    expect(classifyModelError('quota exceeded')).toBe('quota');
    expect(classifyModelError('context_length_exceeded')).toBe('request_too_large');
    expect(classifyModelError('timed out')).toBe('timeout');
    expect(classifyModelError('ENOTFOUND')).toBe('provider_down');
    expect(classifyModelError('who knows')).toBe('unknown');
    expect(classifyModelError('')).toBe('unknown');
  });
});
