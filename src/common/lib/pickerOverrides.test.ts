/**
 * pickerOverrides.test.ts
 *
 * REGRESSION: 2026-05-22 — RunSessionPage 的 handleSend/QuestionFormModal
 * 不转发 picker overrides 导致 BMAD 第二轮起回退 Anthropic。本测试锁定 helper
 * 在 byok:zhipu / cli:claude / 空 executor 三种典型场景下产出的 body。
 *
 * 另外锁定 cli:* 路径必须保留完整 `cli:<id>` 字符串 — 早期 handleResend
 * `.slice(4)` bug 把 `cli:claude` 砍成 `claude` 让 dispatcher 走 EXECUTOR_UNKNOWN。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildPickerOverrides } from './pickerOverrides';
import { KEY_STORAGE } from '../../api/_base';

describe('buildPickerOverrides', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('byok:zhipu — emits provider + model + api_key', () => {
    localStorage.setItem(KEY_STORAGE.zhipu, 'sk-zhipu-test-key');
    const out = buildPickerOverrides('byok:zhipu', 'glm-5.1');
    expect(out.provider).toBe('zhipu');
    expect(out.model).toBe('glm-5.1');
    expect(out.api_key).toBe('sk-zhipu-test-key');
    expect(out.executor).toBeUndefined();
  });

  it('byok:zhipu — drops api_key when no stored key', () => {
    const out = buildPickerOverrides('byok:zhipu', 'glm-5.1');
    expect(out.provider).toBe('zhipu');
    expect(out.model).toBe('glm-5.1');
    expect(out.api_key).toBeUndefined();
  });

  it('byok:<unknown> — drops provider entirely (no key/provider injected)', () => {
    const out = buildPickerOverrides('byok:bogus-provider', 'foo');
    expect(out.provider).toBeUndefined();
    expect(out.api_key).toBeUndefined();
    // unknown byok 仍然保留 model 字段（server 端会做自己的校验）
    expect(out.model).toBe('foo');
  });

  it('cli:claude — keeps full prefix in executor field', () => {
    const out = buildPickerOverrides('cli:claude', 'claude-sonnet-4');
    expect(out.executor).toBe('cli:claude');
    expect(out.model).toBe('claude-sonnet-4');
    expect(out.provider).toBeUndefined();
  });

  it('cli:codex — keeps full prefix in executor field', () => {
    const out = buildPickerOverrides('cli:codex', '');
    expect(out.executor).toBe('cli:codex');
    expect(out.model).toBeUndefined();
  });

  it('empty executor + model only — emits model only', () => {
    const out = buildPickerOverrides('', 'claude-sonnet-4-6');
    expect(out.model).toBe('claude-sonnet-4-6');
    expect(out.provider).toBeUndefined();
    expect(out.executor).toBeUndefined();
  });

  it('empty everything — returns empty object', () => {
    const out = buildPickerOverrides('', '');
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('always appends anthropic_key when stored, regardless of executor', () => {
    localStorage.setItem(KEY_STORAGE.anthropic, 'sk-ant-test');
    const byok = buildPickerOverrides('byok:zhipu', 'glm-5.1');
    expect(byok.anthropic_key).toBe('sk-ant-test');
    const cli = buildPickerOverrides('cli:claude', '');
    expect(cli.anthropic_key).toBe('sk-ant-test');
    const empty = buildPickerOverrides('', '');
    expect(empty.anthropic_key).toBe('sk-ant-test');
  });
});
