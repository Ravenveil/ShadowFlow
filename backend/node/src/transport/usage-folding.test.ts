/**
 * transport/usage-folding.test.ts — BE-07 传输层 usage 归一化单测。
 *
 * 锁定三类客户端 usage 事件语义的折叠正确性（anthropic 互补部分块 /
 * claude-cli 部分块+汇总块 / openai-compat 单条完整块）：
 *   - foldUsageEvents：逐字段 max 合并（部分块 ≤ 汇总块单调性）；
 *   - UsageFoldingApiClient：一次 stream() 只补发一条折叠 usage 事件，
 *     带 billingModel / 墙钟 duration_ms 归因；中游抛错先补发再 rethrow；
 *   - resolveBillingModel：pin > env > DEFAULT_MODELS 兜底链。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  foldUsageEvents,
  UsageFoldingApiClient,
  resolveBillingModel,
} from './ApiClientCallable';
import type { ApiClient, AssistantEvent } from '../lib/conversation-runtime';
import type { ConversationMessage, TokenUsage } from '../lib/conversation-types';
import type { ToolSpec } from '../lib/tool-spec';

const ARGS = {
  system_prompt: '',
  messages: [] as ConversationMessage[],
  tools: [] as ToolSpec[],
  signal: new AbortController().signal,
};

/** 产固定事件序列的 FakeApiClient；可选在第 N 个事件后抛错。 */
function fakeClient(events: AssistantEvent[], throwAfter?: number): ApiClient {
  return {
    async *stream(): AsyncIterable<AssistantEvent> {
      for (let i = 0; i < events.length; i++) {
        if (throwAfter === i) throw new Error('mid-stream boom');
        yield events[i];
      }
      if (throwAfter === events.length) throw new Error('mid-stream boom');
    },
  };
}

async function collect(client: ApiClient): Promise<AssistantEvent[]> {
  const out: AssistantEvent[] = [];
  for await (const ev of client.stream(ARGS)) out.push(ev);
  return out;
}

// ─── foldUsageEvents ─────────────────────────────────────────────────────────

describe('foldUsageEvents — 逐字段 max 合并', () => {
  it('anthropic 互补部分块：input-only + output-only 合并为整块', () => {
    const folded = foldUsageEvents(
      foldUsageEvents(undefined, { input_tokens: 1000 }),
      { output_tokens: 500 },
    );
    expect(folded.input_tokens).toBe(1000);
    expect(folded.output_tokens).toBe(500);
  });

  it('claude-cli 部分块 + 汇总块：取 max 不求和（防双计）', () => {
    const partial: TokenUsage = { input_tokens: 100, output_tokens: 20, ttft_ms: 300 };
    const summary: TokenUsage = {
      input_tokens: 100,
      output_tokens: 100,
      cost_usd: 0.5,
      duration_ms: 2000,
      ttft_ms: 300,
    };
    const folded = foldUsageEvents(partial, summary);
    expect(folded.input_tokens).toBe(100); // 不是 200
    expect(folded.output_tokens).toBe(100); // 不是 120
    expect(folded.cost_usd).toBe(0.5);
    expect(folded.duration_ms).toBe(2000);
  });

  it('单条完整块直接透传（undefined 前值返回副本）', () => {
    const only: TokenUsage = { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 9 };
    const folded = foldUsageEvents(undefined, only);
    expect(folded).toEqual(only);
    expect(folded).not.toBe(only);
  });

  it('后续块未定义的字段不覆盖前值', () => {
    const folded = foldUsageEvents(
      { input_tokens: 10, cost_usd: 0.2 },
      { output_tokens: 5 },
    );
    expect(folded.input_tokens).toBe(10);
    expect(folded.cost_usd).toBe(0.2);
    expect(folded.output_tokens).toBe(5);
  });

  it('较大前值不被较小后值拉低（max 语义）', () => {
    const folded = foldUsageEvents({ output_tokens: 100 }, { output_tokens: 20 });
    expect(folded.output_tokens).toBe(100);
  });
});

// ─── UsageFoldingApiClient ───────────────────────────────────────────────────

describe('UsageFoldingApiClient — 一次 stream() 一条折叠 usage', () => {
  it('多个部分 usage 块折叠为末尾单条，事件顺序保持', async () => {
    const inner = fakeClient([
      { kind: 'text_delta', text: 'hi' },
      { kind: 'usage', usage: { input_tokens: 100 } },
      { kind: 'text_delta', text: '!' },
      { kind: 'usage', usage: { output_tokens: 50 } },
      { kind: 'message_stop', stop_reason: 'end_turn' },
    ]);
    const wrapped = new UsageFoldingApiClient(inner, 'billing-model');
    const events = await collect(wrapped);

    const usageEvents = events.filter((e) => e.kind === 'usage');
    expect(usageEvents).toHaveLength(1);
    const u = usageEvents[0].kind === 'usage' ? usageEvents[0].usage : {};
    expect(u.input_tokens).toBe(100);
    expect(u.output_tokens).toBe(50);
    expect(u.model).toBe('billing-model');
    expect(typeof u.duration_ms).toBe('number');
    // 非 usage 事件保持原序
    expect(events.map((e) => e.kind)).toEqual(['text_delta', 'text_delta', 'message_stop', 'usage']);
  });

  it('事件自带 model 优先于 billingModel', async () => {
    const inner = fakeClient([{ kind: 'usage', usage: { input_tokens: 1, model: 'event-model' } }]);
    const events = await collect(new UsageFoldingApiClient(inner, 'billing-model'));
    const u = events[0].kind === 'usage' ? events[0].usage : {};
    expect(u.model).toBe('event-model');
  });

  it('事件自带 duration_ms 优先于墙钟', async () => {
    const inner = fakeClient([{ kind: 'usage', usage: { input_tokens: 1, duration_ms: 4242 } }]);
    const events = await collect(new UsageFoldingApiClient(inner, 'm'));
    const u = events[0].kind === 'usage' ? events[0].usage : {};
    expect(u.duration_ms).toBe(4242);
  });

  it('中游抛错：先补发折叠 usage 再原样 rethrow', async () => {
    const inner = fakeClient(
      [
        { kind: 'usage', usage: { input_tokens: 10 } },
        { kind: 'text_delta', text: 'partial' },
      ],
      2, // 第 2 个事件位置抛错
    );
    const wrapped = new UsageFoldingApiClient(inner, 'm');
    const seen: AssistantEvent[] = [];
    await expect(
      (async () => {
        for await (const ev of wrapped.stream(ARGS)) seen.push(ev);
      })(),
    ).rejects.toThrow('mid-stream boom');

    const usageEvents = seen.filter((e) => e.kind === 'usage');
    expect(usageEvents).toHaveLength(1);
    const u = usageEvents[0].kind === 'usage' ? usageEvents[0].usage : {};
    expect(u.input_tokens).toBe(10);
  });

  it('无 usage 块时不补发（保持事件流原样）', async () => {
    const inner = fakeClient([
      { kind: 'text_delta', text: 'a' },
      { kind: 'message_stop', stop_reason: 'end_turn' },
    ]);
    const events = await collect(new UsageFoldingApiClient(inner, 'm'));
    expect(events.some((e) => e.kind === 'usage')).toBe(false);
  });
});

// ─── resolveBillingModel ─────────────────────────────────────────────────────

describe('resolveBillingModel — 计量归属模型兜底链', () => {
  const saved = process.env.SHADOWFLOW_DEFAULT_MODEL;
  afterEach(() => {
    if (saved === undefined) delete process.env.SHADOWFLOW_DEFAULT_MODEL;
    else process.env.SHADOWFLOW_DEFAULT_MODEL = saved;
  });

  it('显式 pin 最优先', () => {
    process.env.SHADOWFLOW_DEFAULT_MODEL = 'env-model';
    expect(resolveBillingModel('anthropic', 'pinned-model')).toBe('pinned-model');
    expect(resolveBillingModel('claude-code-cli', 'cli-model')).toBe('cli-model');
  });

  it('anthropic/google：env > DEFAULT_MODELS', () => {
    process.env.SHADOWFLOW_DEFAULT_MODEL = 'env-model';
    expect(resolveBillingModel('anthropic')).toBe('env-model');
    delete process.env.SHADOWFLOW_DEFAULT_MODEL;
    expect(resolveBillingModel('anthropic')).toBe('claude-sonnet-4-6');
    expect(resolveBillingModel('google')).toBe('gemini-2.5-flash');
  });

  it('cli 系仅 pin（宁缺不错标）', () => {
    expect(resolveBillingModel('claude-code-cli')).toBe('');
    expect(resolveBillingModel('codex-cli')).toBe('');
  });

  it('openai-compat 系：DEFAULT_MODELS[id]（不读 env）', () => {
    process.env.SHADOWFLOW_DEFAULT_MODEL = 'env-model';
    expect(resolveBillingModel('deepseek')).toBe('deepseek-chat');
    delete process.env.SHADOWFLOW_DEFAULT_MODEL;
    expect(resolveBillingModel('zhipu')).toBe('glm-4.6');
    expect(resolveBillingModel('custom-foo')).toBe('');
  });
});
