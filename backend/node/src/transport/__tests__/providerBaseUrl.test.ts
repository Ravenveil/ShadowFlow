/**
 * providerBaseUrl.test.ts — settings/byok 的用户 baseUrl → SDK baseURL 归一
 * 规则回归（2026-11-07 模型链路断点全清，A4/B1）。
 *
 * 铁律：调用链的归一口径必须与设置页探针（settings.ts normalizeProviderBaseUrl）
 * 一致，否则「设置检测通过，对话却 404」。本文件把 normalizeSdkBaseUrl 的
 * 归一表逐条钉死，并验 resolveProviderBaseUrl 的「settings 配置 → 归一」与
 * isSettingsRegisteredProvider（run-sessions 放行 custom-* 的判定）。
 *
 * Run: npx vitest run --config vitest.server.config.ts \
 *        server/src/transport/__tests__/providerBaseUrl.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSettingMock = vi.fn();
vi.mock('../../storage/settings', () => ({
  getSetting: (k: string) => getSettingMock(k),
}));

import { normalizeSdkBaseUrl, resolveProviderBaseUrl } from '../providerBaseUrl';
import { isSettingsRegisteredProvider } from '../byokKey';

describe('normalizeSdkBaseUrl — 归一表（与设置页探针同口径）', () => {
  it('OpenAI 兼容缺版本段 → 补 /v1（deepseek）', () => {
    expect(normalizeSdkBaseUrl('deepseek', 'https://gw.example.com')).toBe(
      'https://gw.example.com/v1',
    );
    expect(normalizeSdkBaseUrl('deepseek', 'https://gw.example.com/')).toBe(
      'https://gw.example.com/v1',
    );
    expect(normalizeSdkBaseUrl('deepseek', 'https://gw.example.com/api')).toBe(
      'https://gw.example.com/api/v1',
    );
  });

  it('已有版本段 → 原样（deepseek /v1、zhipu /v4）', () => {
    expect(normalizeSdkBaseUrl('deepseek', 'https://gw.example.com/v1')).toBe(
      'https://gw.example.com/v1',
    );
    expect(
      normalizeSdkBaseUrl('zhipu', 'https://open.bigmodel.cn/api/coding/paas/v4'),
    ).toBe('https://open.bigmodel.cn/api/coding/paas/v4');
    expect(normalizeSdkBaseUrl('openai', 'https://my.gw/openai/v1/')).toBe(
      'https://my.gw/openai/v1',
    );
  });

  it('anthropic：SDK 自拼 /v1/messages → 剥尾 /v1，路径即根的原样保留', () => {
    // mimo 的 anthropic 兼容端点场景
    expect(
      normalizeSdkBaseUrl('anthropic', 'https://api.xiaomimimo.com/anthropic/v1'),
    ).toBe('https://api.xiaomimimo.com/anthropic');
    expect(normalizeSdkBaseUrl('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com',
    );
  });

  it('google：SDK 自拼 /{apiVersion}/… → 剥尾 /v1beta 或 /v1', () => {
    expect(normalizeSdkBaseUrl('google', 'https://gw.example.com/gemini/v1beta')).toBe(
      'https://gw.example.com/gemini',
    );
    expect(normalizeSdkBaseUrl('google', 'https://gw.example.com/gemini/v1')).toBe(
      'https://gw.example.com/gemini',
    );
    expect(normalizeSdkBaseUrl('google', 'https://gw.example.com/gemini')).toBe(
      'https://gw.example.com/gemini',
    );
  });

  it('azure：部署级地址（含 ?api-version= query）原样', () => {
    const azure = 'https://x.openai.azure.com/openai/deployments/gpt4o?api-version=2024-06-01';
    expect(normalizeSdkBaseUrl('azure', azure)).toBe(azure);
  });

  it('custom / custom-*：设置页弹窗「Base URL（OpenAI 兼容）」输入即所见', () => {
    expect(normalizeSdkBaseUrl('custom', 'https://my.gw/v2')).toBe('https://my.gw/v2');
    expect(normalizeSdkBaseUrl('custom-foo-123', 'https://my.gw/v1')).toBe(
      'https://my.gw/v1',
    );
    expect(normalizeSdkBaseUrl('custom-foo-123', 'https://my.gw/openai/paas')).toBe(
      'https://my.gw/openai/paas',
    );
  });

  it('ollama：根 / api / chat 任一形态 → 归一到 …/v1', () => {
    expect(normalizeSdkBaseUrl('ollama', 'http://localhost:11434')).toBe(
      'http://localhost:11434/v1',
    );
    expect(normalizeSdkBaseUrl('ollama', 'http://localhost:11434/')).toBe(
      'http://localhost:11434/v1',
    );
    expect(normalizeSdkBaseUrl('ollama', 'http://localhost:11434/api')).toBe(
      'http://localhost:11434/v1',
    );
    expect(normalizeSdkBaseUrl('ollama', 'http://localhost:11434/v1')).toBe(
      'http://localhost:11434/v1',
    );
    expect(normalizeSdkBaseUrl('ollama', 'http://localhost:11434/chat')).toBe(
      'http://localhost:11434/v1',
    );
  });

  it('# 尾缀逃逸：原样使用、不做版本推断（Cherry Studio 语义）', () => {
    expect(normalizeSdkBaseUrl('deepseek', 'https://my.gw/custom-path#')).toBe(
      'https://my.gw/custom-path',
    );
    expect(normalizeSdkBaseUrl('ollama', 'http://localhost:11434/#')).toBe(
      'http://localhost:11434/',
    );
  });

  it('空串 → 空串（调用方视为未配置）', () => {
    expect(normalizeSdkBaseUrl('deepseek', '')).toBe('');
    expect(normalizeSdkBaseUrl('deepseek', '   ')).toBe('');
  });
});

describe('resolveProviderBaseUrl — settings 配置 → 归一', () => {
  beforeEach(() => {
    getSettingMock.mockReset();
  });

  it('已配置 → 返回归一后的地址（deepseek 缺版本段补 /v1）', () => {
    getSettingMock.mockReturnValue({
      providers: { deepseek: { baseUrl: 'https://gw.example.com' } },
    });
    expect(resolveProviderBaseUrl('deepseek')).toBe('https://gw.example.com/v1');
  });

  it('anthropic 配置同样走归一（剥尾 /v1）', () => {
    getSettingMock.mockReturnValue({
      providers: { anthropic: { baseUrl: 'https://api.xiaomimimo.com/anthropic/v1' } },
    });
    expect(resolveProviderBaseUrl('anthropic')).toBe(
      'https://api.xiaomimimo.com/anthropic',
    );
  });

  it('未配置 / 空白 → undefined（调用方回退 client 内置默认地址）', () => {
    getSettingMock.mockReturnValue(undefined);
    expect(resolveProviderBaseUrl('deepseek')).toBeUndefined();
    getSettingMock.mockReturnValue({ providers: { deepseek: { baseUrl: '  ' } } });
    expect(resolveProviderBaseUrl('deepseek')).toBeUndefined();
    getSettingMock.mockReturnValue({ providers: {} });
    expect(resolveProviderBaseUrl('deepseek')).toBeUndefined();
  });

  it('settings 读取抛错 → 静默 undefined（联动是增强不是依赖）', () => {
    getSettingMock.mockImplementation(() => {
      throw new Error('settings store unavailable');
    });
    expect(resolveProviderBaseUrl('deepseek')).toBeUndefined();
  });
});

describe('isSettingsRegisteredProvider — run-sessions 放行 custom-* 的判定', () => {
  beforeEach(() => {
    getSettingMock.mockReset();
  });

  it('settings/byok 里注册的 id（含 custom-*）→ true', () => {
    getSettingMock.mockReturnValue({
      providers: { 'custom-foo-123': { baseUrl: 'https://my.gw/v1' }, anthropic: {} },
    });
    expect(isSettingsRegisteredProvider('custom-foo-123')).toBe(true);
    expect(isSettingsRegisteredProvider('anthropic')).toBe(true);
  });

  it('未注册 → false', () => {
    getSettingMock.mockReturnValue({ providers: { anthropic: {} } });
    expect(isSettingsRegisteredProvider('custom-bar-456')).toBe(false);
  });

  it('settings 不可用 / providers 缺失 → false（不放行）', () => {
    getSettingMock.mockReturnValue(undefined);
    expect(isSettingsRegisteredProvider('custom-foo-123')).toBe(false);
    getSettingMock.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(isSettingsRegisteredProvider('custom-foo-123')).toBe(false);
  });
});
