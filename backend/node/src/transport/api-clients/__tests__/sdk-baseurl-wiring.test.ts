/**
 * sdk-baseurl-wiring.test.ts — BYOK 自定义 API 地址「真正到达 SDK 构造」的
 * 接线回归（2026-11-07 模型链路断点全清，A1/A2）。
 *
 * 背景（PR #49 原 bug 的形态）：AnthropicApiClient / GoogleApiClient 的
 * opts 上**有** baseURL 字段，但构造 SDK 时没接线——字段存在却永远传不到
 * `new Anthropic(...)` / `getGenerativeModel(...)`，仅看 opts 的单测全绿、
 * 真实请求照旧打偏到默认公网地址。所以这里必须 mock 掉 SDK 本体、断言
 * 构造参数本身，而不是断言 opts。
 *
 * 覆盖：
 *   - anthropic：baseURL → `new Anthropic({ baseURL })`（SDK 自拼 /v1/messages，
 *     传主机根）；缺省时不带 baseURL 键（回退 SDK 内置默认地址）
 *   - google：baseURL → `getGenerativeModel(params, { baseUrl })`（SDK 自拼
 *     /{apiVersion}/…，传主机根）；缺省时第二参数 undefined
 *
 * Run: npx vitest run --config vitest.server.config.ts \
 *        server/src/transport/api-clients/__tests__/sdk-baseurl-wiring.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted：vi.mock 工厂会被提升到 import 之前执行，普通外层变量在工厂
// 执行时还在 TDZ。用 hoisted 持有捕获容器，工厂与用例共享同一引用。
const captured = vi.hoisted(() => ({
  anthropicCtor: [] as Record<string, unknown>[],
  googleModel: [] as { apiKey: string; modelParams: unknown; requestOptions: unknown }[],
}));

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    // 与真实 SDK 同形：client.messages.stream(body, opts) → AsyncIterable。
    // 空事件流足够——本文件只验「构造参数有没有接上」。
    messages = {
      stream: () =>
        (async function* () {
          /* empty raw event stream */
        })(),
    };
    constructor(opts: Record<string, unknown>) {
      captured.anthropicCtor.push(opts);
    }
  }
  return { default: FakeAnthropic };
});

vi.mock('@google/generative-ai', () => {
  class FakeGoogleGenerativeAI {
    constructor(private readonly apiKey: string) {}
    getGenerativeModel(modelParams: unknown, requestOptions?: unknown) {
      captured.googleModel.push({
        apiKey: this.apiKey,
        modelParams,
        requestOptions,
      });
      return {
        generateContentStream: async () => ({
          stream: (async function* () {
            /* empty chunk stream */
          })(),
        }),
      };
    }
  }
  return { GoogleGenerativeAI: FakeGoogleGenerativeAI };
});

import { AnthropicApiClient } from '../anthropic-api-client';
import { GoogleApiClient } from '../google-api-client';

async function drain(it: AsyncIterable<unknown>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of it) {
    /* just drive the generator to completion */
  }
}

const BASE_ARGS = {
  system_prompt: 'sys',
  messages: [{ role: 'user' as const, blocks: [{ kind: 'text' as const, text: 'hi' }] }],
  tools: [],
  signal: new AbortController().signal,
};

describe('AnthropicApiClient — baseURL 接线到 SDK 构造 (A1)', () => {
  beforeEach(() => {
    captured.anthropicCtor.length = 0;
  });

  it('opts.baseURL 传入时 → new Anthropic({ baseURL }) 收到主机根', async () => {
    const client = new AnthropicApiClient({
      apiKey: 'sk-a',
      baseURL: 'https://gw.example.com/anthropic',
      model: 'claude-test',
    });
    await drain(client.stream(BASE_ARGS));

    expect(captured.anthropicCtor).toHaveLength(1);
    expect(captured.anthropicCtor[0].baseURL).toBe('https://gw.example.com/anthropic');
    expect(captured.anthropicCtor[0].apiKey).toBe('sk-a');
  });

  it('无 opts.baseURL → 构造参数不含 baseURL 键（SDK 回退内置默认地址）', async () => {
    const client = new AnthropicApiClient({ apiKey: 'sk-a', model: 'claude-test' });
    await drain(client.stream(BASE_ARGS));

    expect(captured.anthropicCtor).toHaveLength(1);
    expect('baseURL' in captured.anthropicCtor[0]).toBe(false);
  });
});

describe('GoogleApiClient — baseUrl 接线到 getGenerativeModel (A2)', () => {
  beforeEach(() => {
    captured.googleModel.length = 0;
  });

  it('opts.baseURL 传入时 → getGenerativeModel 第二参数 { baseUrl }', async () => {
    const client = new GoogleApiClient({
      apiKey: 'sk-g',
      baseURL: 'https://gw.example.com/gemini',
      model: 'gemini-test',
    });
    await drain(client.stream(BASE_ARGS));

    expect(captured.googleModel).toHaveLength(1);
    expect(captured.googleModel[0].requestOptions).toEqual({
      baseUrl: 'https://gw.example.com/gemini',
    });
    expect(captured.googleModel[0].apiKey).toBe('sk-g');
  });

  it('无 opts.baseURL → getGenerativeModel 第二参数 undefined', async () => {
    const client = new GoogleApiClient({ apiKey: 'sk-g', model: 'gemini-test' });
    await drain(client.stream(BASE_ARGS));

    expect(captured.googleModel).toHaveLength(1);
    expect(captured.googleModel[0].requestOptions).toBeUndefined();
  });
});
