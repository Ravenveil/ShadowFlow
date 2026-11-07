/**
 * transport/dispatcher.test.ts — resolveCallable() factory contract
 *
 * Per Phase 2 decision A6 (O1 unified path) and the doc §"call-phase error
 * model" (CL3/E3), the dispatcher is the single entry point that maps an
 * executor string to a concrete LlmCallable. Failures here must throw a typed
 * LlmCallError BEFORE any turn-time work begins, so the assembler can surface
 * a structured `error` SSE chunk without poisoning the stream.
 *
 * This file covers:
 *   - happy path for all five scheme prefixes (anthropic-direct / cli /
 *     acp / mcp / byok) — each returns a callable with the expected `.id`
 *   - missing-id failures: `cli:`, `acp:`, `mcp:`, `byok:` (trailing empty)
 *     all raise LlmCallError('provider-error') at resolve time
 *   - unknown scheme `foo:bar` raises LlmCallError('provider-error')
 *   - empty / non-string executor raises LlmCallError('provider-error')
 *   - whitespace tolerance: leading/trailing space is trimmed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCallable } from './dispatcher';
import { LlmCallError } from '../workflow/types';

// settings/byok 隔离：设置层联动（baseUrl 归一、key 兜底、CLI 全量注入）
// 的行为必须可控可断言，不能读真实 settings.json。默认全部用例返回
// undefined（等价"服务端无 byok 设置"），与改造前对真实 store 的依赖等效。
const getSettingMock = vi.fn();
vi.mock('../storage/settings', () => ({
  getSetting: (k: string) => getSettingMock(k),
}));

// 每条用例前清空设置 mock（默认 undefined = 无 byok 设置）。
beforeEach(() => {
  getSettingMock.mockReset();
});

describe('resolveCallable — happy path (5 schemes)', () => {
  it('anthropic-direct → callable with id "anthropic-direct"', () => {
    const c = resolveCallable('anthropic-direct', { apiKey: 'sk-test' });
    expect(c).toBeDefined();
    expect((c as { id?: string }).id).toBe('anthropic-direct');
    expect(typeof c.turn).toBe('function');
  });

  it('cli:claude → callable with id "cli:claude"', () => {
    const c = resolveCallable('cli:claude', { workspace: '/tmp/x' });
    expect((c as { id?: string }).id).toBe('cli:claude');
  });

  it('acp:bmad → callable with id starting "acp:"', () => {
    const c = resolveCallable('acp:bmad', { workspace: '/tmp/x' });
    const id = (c as { id?: string }).id ?? '';
    expect(id.startsWith('acp:')).toBe(true);
  });

  it('mcp:server/tool → callable with id starting "mcp:"', () => {
    const c = resolveCallable('mcp:server/tool', { workspace: '/tmp/x' });
    const id = (c as { id?: string }).id ?? '';
    expect(id.startsWith('mcp:')).toBe(true);
  });

  it('byok:anthropic → ApiClientCallable("anthropic") under the hood', () => {
    const c = resolveCallable('byok:anthropic', { apiKey: 'sk-test' });
    // ApiClientCallable sets id = "anthropic-direct" for the anthropic
    // provider (provider-name canonicalisation lives there, not here).
    const id = (c as { id?: string }).id ?? '';
    expect(['anthropic-direct', 'byok:anthropic']).toContain(id);
  });
});

// 2026-11-07 Day1 打通修复 — BYOK 自定义 API 地址透传回归。
// 背景：此前 resolveCallable('byok:<provider>') 只传 key 不传 baseUrl，
// OpenAiCompatApiClient 回退到内置默认地址（如 https://api.openai.com/v1），
// 自定义网关/本地端点场景请求打偏后表现为 SDK "Request timed out."。
describe('resolveCallable — BYOK baseUrl passthrough (2026-11-07 fix)', () => {
  const asApiClient = (c: unknown) =>
    (
      c as {
        getApiClient: () => {
          opts: { baseURL?: string; providerId?: string };
        };
      }
    ).getApiClient();

  it('byok:openai forwards opts.baseUrl into the OpenAI-compat client', () => {
    const c = resolveCallable('byok:openai', {
      apiKey: 'sk-test',
      baseUrl: 'http://127.0.0.1:9999/v1',
    });
    const client = asApiClient(c);
    expect(client.opts.providerId).toBe('openai');
    expect(client.opts.baseURL).toBe('http://127.0.0.1:9999/v1');
  });

  it('byok:deepseek without baseUrl keeps the built-in default (no override)', () => {
    const c = resolveCallable('byok:deepseek', { apiKey: 'sk-test' });
    const client = asApiClient(c);
    expect(client.opts.baseURL).toBeUndefined();
  });
});

describe('resolveCallable — call-phase errors (CL3/E3)', () => {
  it('empty string → LlmCallError(provider-error)', () => {
    expect(() => resolveCallable('')).toThrow(LlmCallError);
    try {
      resolveCallable('');
    } catch (e) {
      expect((e as LlmCallError).kind).toBe('provider-error');
    }
  });

  it('non-string → LlmCallError(provider-error)', () => {
    // @ts-expect-error — runtime guard
    expect(() => resolveCallable(null)).toThrow(LlmCallError);
    // @ts-expect-error — runtime guard
    expect(() => resolveCallable(undefined)).toThrow(LlmCallError);
    // @ts-expect-error — runtime guard
    expect(() => resolveCallable(123)).toThrow(LlmCallError);
  });

  it('cli: prefix with empty id → LlmCallError', () => {
    expect(() => resolveCallable('cli:')).toThrowError(/cli: prefix requires/i);
  });

  it('acp: prefix with empty id → LlmCallError', () => {
    expect(() => resolveCallable('acp:')).toThrowError(/acp: prefix requires/i);
  });

  it('mcp: prefix with empty id → LlmCallError', () => {
    expect(() => resolveCallable('mcp:')).toThrowError(/mcp: prefix requires/i);
  });

  it('byok: prefix with empty id → LlmCallError', () => {
    expect(() => resolveCallable('byok:')).toThrowError(/byok: prefix requires/i);
  });

  it('unknown scheme "foo:bar" → LlmCallError(provider-error)', () => {
    expect(() => resolveCallable('foo:bar')).toThrowError(/unknown executor/i);
  });

  it('byok:<unknown-provider> → LlmCallError surfaced from ApiClientCallable ctor', () => {
    // ApiClientCallable construction validates the provider id and throws on
    // unknown. The dispatcher does not swallow — the typed error propagates
    // out of resolveCallable, which is exactly the CL3/E3 contract.
    expect(() => resolveCallable('byok:nonexistent-provider-zzz')).toThrow(LlmCallError);
  });
});

describe('resolveCallable — whitespace tolerance', () => {
  it('trims leading/trailing whitespace', () => {
    const c = resolveCallable('  cli:claude  ', { workspace: '/tmp/x' });
    expect((c as { id?: string }).id).toBe('cli:claude');
  });
});

// ─── 2026-11-07 模型链路断点全清（A1/A2/A3/A4/B1）────────────────────────────

const asApiClient = (c: unknown) =>
  (
    c as {
      getApiClient: () => {
        opts: { baseURL?: string; providerId?: string; apiKey?: string };
      };
    }
  ).getApiClient();

const asCliEnv = (c: unknown) =>
  (c as { opts: { env?: Record<string, string> } }).opts.env ?? {};

describe('resolveCallable — A1/A2 baseUrl 透传到 Anthropic/Google client', () => {
  it('byok:anthropic + 显式 baseUrl → AnthropicApiClient.opts.baseURL', () => {
    const c = resolveCallable('byok:anthropic', {
      apiKey: 'sk-a',
      baseUrl: 'https://gw.example.com/anthropic',
    });
    expect(asApiClient(c).opts.baseURL).toBe('https://gw.example.com/anthropic');
  });

  it('byok:google + 显式 baseUrl → GoogleApiClient.opts.baseURL', () => {
    const c = resolveCallable('byok:google', {
      apiKey: 'sk-g',
      baseUrl: 'https://gw.example.com/gemini',
    });
    expect(asApiClient(c).opts.baseURL).toBe('https://gw.example.com/gemini');
  });

  it('settings/byok 的 baseUrl 经归一透传（anthropic 剥尾 /v1）', () => {
    getSettingMock.mockReturnValue({
      providers: { anthropic: { baseUrl: 'https://api.xiaomimimo.com/anthropic/v1' } },
    });
    const c = resolveCallable('byok:anthropic', { apiKey: 'sk-a' });
    expect(asApiClient(c).opts.baseURL).toBe('https://api.xiaomimimo.com/anthropic');
  });

  it('settings/byok 的 google /v1beta 尾缀被剥掉（与探针同口径）', () => {
    getSettingMock.mockReturnValue({
      providers: { google: { baseUrl: 'https://gw.example.com/gemini/v1beta' } },
    });
    const c = resolveCallable('byok:google', { apiKey: 'sk-g' });
    expect(asApiClient(c).opts.baseURL).toBe('https://gw.example.com/gemini');
  });

  it('显式 baseUrl 优先于 settings 配置且原样（不归一）', () => {
    getSettingMock.mockReturnValue({
      providers: { anthropic: { baseUrl: 'https://settings.example.com' } },
    });
    const c = resolveCallable('byok:anthropic', {
      apiKey: 'sk-a',
      baseUrl: 'https://explicit.example.com/v1',
    });
    expect(asApiClient(c).opts.baseURL).toBe('https://explicit.example.com/v1');
  });
});

describe('resolveCallable — A3 CLI 执行器 env 注入（key + *_BASE_URL）', () => {
  it('显式 provider+key → 单点注入 ANTHROPIC_API_KEY', () => {
    const c = resolveCallable('cli:claude', {
      provider: 'anthropic',
      apiKey: 'sk-a',
    });
    expect(asCliEnv(c).ANTHROPIC_API_KEY).toBe('sk-a');
  });

  it('显式 baseUrl 原样注入 ANTHROPIC_BASE_URL（显式值不归一）', () => {
    const c = resolveCallable('cli:claude', {
      provider: 'anthropic',
      apiKey: 'sk-a',
      baseUrl: 'https://gw.example.com/anthropic/v1',
    });
    expect(asCliEnv(c).ANTHROPIC_BASE_URL).toBe('https://gw.example.com/anthropic/v1');
  });

  it('显式 baseUrl 缺省时从 settings 兜底（归一后注入）', () => {
    getSettingMock.mockReturnValue({
      providers: { anthropic: { baseUrl: 'https://gw.example.com/anthropic/v1' } },
    });
    const c = resolveCallable('cli:claude', {
      provider: 'anthropic',
      apiKey: 'sk-a',
    });
    expect(asCliEnv(c).ANTHROPIC_BASE_URL).toBe('https://gw.example.com/anthropic');
  });

  it('settings 全量 enabled → key 与 *_BASE_URL 成对注入（含 mimo 补映射）', () => {
    getSettingMock.mockReturnValue({
      providers: {
        mimo: { enabled: true, apiKey: 'sk-mimo' },
        deepseek: { enabled: true, apiKey: 'sk-ds', baseUrl: 'https://gw.example.com' },
        openai: { enabled: false, apiKey: 'sk-off', baseUrl: 'https://off.example.com' },
      },
    });
    const env = asCliEnv(resolveCallable('cli:arc', {}));
    expect(env.MIMO_API_KEY).toBe('sk-mimo');
    expect(env.DEEPSEEK_API_KEY).toBe('sk-ds');
    // settings 的 baseUrl 经归一（deepseek 缺版本段补 /v1）
    expect(env.DEEPSEEK_BASE_URL).toBe('https://gw.example.com/v1');
    // disabled 的 provider 一律不注入
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENAI_BASE_URL).toBeUndefined();
  });

  it('settings 无 key 但有 baseUrl → 也注入 *_BASE_URL（本地网关可无 key）', () => {
    getSettingMock.mockReturnValue({
      providers: { deepseek: { enabled: true, baseUrl: 'https://gw.example.com' } },
    });
    const env = asCliEnv(resolveCallable('cli:claude', {}));
    expect(env.DEEPSEEK_BASE_URL).toBe('https://gw.example.com/v1');
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it('显式 key/baseUrl 盖过 settings 全量注入的同名 env', () => {
    getSettingMock.mockReturnValue({
      providers: { anthropic: { enabled: true, apiKey: 'sk-set', baseUrl: 'https://set.example.com' } },
    });
    const env = asCliEnv(
      resolveCallable('cli:claude', {
        provider: 'anthropic',
        apiKey: 'sk-explicit',
        baseUrl: 'https://explicit.example.com',
      }),
    );
    expect(env.ANTHROPIC_API_KEY).toBe('sk-explicit');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://explicit.example.com');
  });
});

describe('resolveCallable — B1 byok:azure 死路打通', () => {
  it('byok:azure + 部署级 baseUrl → OpenAiCompatApiClient(providerId=azure)', () => {
    const c = resolveCallable('byok:azure', {
      apiKey: 'sk-az',
      baseUrl: 'https://x.openai.azure.com/openai/deployments/gpt4o?api-version=2024-06-01',
    });
    const client = asApiClient(c);
    expect(client.opts.providerId).toBe('azure');
    expect(client.opts.baseURL).toBe(
      'https://x.openai.azure.com/openai/deployments/gpt4o?api-version=2024-06-01',
    );
  });

  it('byok:azure 无 baseUrl → 仍可构造（stream 时由 client 层大声抛错兜底）', () => {
    const c = resolveCallable('byok:azure', { apiKey: 'sk-az' });
    expect(asApiClient(c).opts.providerId).toBe('azure');
    expect(asApiClient(c).opts.baseURL).toBeUndefined();
  });
});

describe('resolveCallable — A4 custom-* provider 管线打通', () => {
  it('byok:custom-xxx + baseUrl → OpenAiCompatApiClient(providerId=custom-xxx)', () => {
    const c = resolveCallable('byok:custom-foo-123', {
      apiKey: 'sk-c',
      baseUrl: 'https://my.gw/openai/paas',
    });
    const client = asApiClient(c);
    expect(client.opts.providerId).toBe('custom-foo-123');
    expect(client.opts.baseURL).toBe('https://my.gw/openai/paas');
  });

  it('byok:custom-xxx 无 baseUrl → LlmCallError（未知 id 不猜默认地址）', () => {
    expect(() => resolveCallable('byok:custom-foo-123', { apiKey: 'sk-c' })).toThrow(
      LlmCallError,
    );
    try {
      resolveCallable('byok:custom-foo-123', { apiKey: 'sk-c' });
    } catch (e) {
      expect((e as LlmCallError).kind).toBe('provider-error');
    }
  });

  it('custom-* 的 key/baseUrl 三级优先回落 settings/byok 注册项', () => {
    getSettingMock.mockReturnValue({
      providers: {
        'custom-foo-123': { apiKey: 'sk-cfg', baseUrl: 'https://cfg.gw/openai/paas' },
      },
    });
    const client = asApiClient(resolveCallable('byok:custom-foo-123', {}));
    expect(client.opts.apiKey).toBe('sk-cfg');
    expect(client.opts.baseURL).toBe('https://cfg.gw/openai/paas');
  });

  it('custom-* 的 baseUrl 原样透传（与探针同口径：输入即所见、不做版本推断）', () => {
    getSettingMock.mockReturnValue({
      providers: { 'custom-foo-123': { baseUrl: 'https://cfg.gw' } },
    });
    const client = asApiClient(resolveCallable('byok:custom-foo-123', {}));
    expect(client.opts.baseURL).toBe('https://cfg.gw');
  });
});

describe('resolveCallable — byok:* key 三级优先兜底（settings 兜底）', () => {
  it('未传 apiKey 时从 settings/byok 解析（此前走到 client 报 API key not configured）', () => {
    getSettingMock.mockReturnValue({
      providers: { deepseek: { apiKey: 'sk-ds-cfg' } },
    });
    const client = asApiClient(resolveCallable('byok:deepseek', {}));
    expect(client.opts.apiKey).toBe('sk-ds-cfg');
  });

  it('显式 apiKey 优先于 settings', () => {
    getSettingMock.mockReturnValue({
      providers: { deepseek: { apiKey: 'sk-ds-cfg' } },
    });
    const client = asApiClient(resolveCallable('byok:deepseek', { apiKey: 'sk-explicit' }));
    expect(client.opts.apiKey).toBe('sk-explicit');
  });
});
