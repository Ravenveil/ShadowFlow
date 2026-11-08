/**
 * llm-timeout.test.ts — 模型客户端默认总超时（2026-11-08 公网稳定性批）。
 *
 * 覆盖：默认 300s、SF_LLM_TIMEOUT_MS 覆盖、非法值回退默认、
 * 叠加信号在「调用方取消」与「超时」两个方向都正确中止。
 */

import { afterEach, describe, expect, it } from 'vitest';

import { llmTimeoutMs, withDefaultLlmTimeout } from '../llm-timeout';

const ORIGINAL = process.env.SF_LLM_TIMEOUT_MS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SF_LLM_TIMEOUT_MS;
  else process.env.SF_LLM_TIMEOUT_MS = ORIGINAL;
});

describe('llmTimeoutMs', () => {
  it('未设置时默认 300_000', () => {
    delete process.env.SF_LLM_TIMEOUT_MS;
    expect(llmTimeoutMs()).toBe(300_000);
  });

  it('SF_LLM_TIMEOUT_MS 覆盖为自定义毫秒', () => {
    process.env.SF_LLM_TIMEOUT_MS = '45000';
    expect(llmTimeoutMs()).toBe(45_000);
  });

  it('非法值（0 / 负数 / 非数字）回退默认', () => {
    for (const bad of ['0', '-5', 'abc', '']) {
      process.env.SF_LLM_TIMEOUT_MS = bad;
      expect(llmTimeoutMs()).toBe(300_000);
    }
  });
});

describe('withDefaultLlmTimeout', () => {
  it('调用方取消时组合信号随之中止', async () => {
    const parent = new AbortController();
    const signal = withDefaultLlmTimeout(parent.signal);
    expect(signal.aborted).toBe(false);
    parent.abort();
    expect(signal.aborted).toBe(true);
  });

  it('超时先到时组合信号自行中止（调用方 signal 未动）', async () => {
    process.env.SF_LLM_TIMEOUT_MS = '30';
    const parent = new AbortController();
    const signal = withDefaultLlmTimeout(parent.signal);
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    expect(signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
  });
});
