/**
 * src/api/llm.ts — generateAgentPersona 契约测试（六层能力第二轮 B）。
 * mock fetch 验证：请求 shape（OpenAI 协议、非流式、zhipu key 头）、
 * 成功取 choices[0].message.content、非 2xx → LlmApiError（透传后端 code）、
 * 空 content → EMPTY_RESPONSE、空描述 → EMPTY_RESPONSE 前拦截（不发请求）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateAgentPersona, LlmApiError } from '../llm';
import { KEY_STORAGE } from '../_base';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      }),
  };
}

describe('generateAgentPersona', () => {
  it('POST /api/llm/chat/completions 非流式，携带 system prompt + 用户描述，返回生成文本', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('## 角色定位\n销售专家'));
    vi.stubGlobal('fetch', fetchMock);

    const out = await generateAgentPersona('氢能重卡渠道销售');
    expect(out).toBe('## 角色定位\n销售专家');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/llm/chat/completions');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    expect(body.model).toMatch(/^glm-/);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('氢能重卡渠道销售');
  });

  it('localStorage 有 zhipu key 时以 Authorization: Bearer 发出', async () => {
    localStorage.setItem(KEY_STORAGE.zhipu, 'test-glm-key');
    const fetchMock = vi.fn().mockResolvedValue(okResponse('x'));
    vi.stubGlobal('fetch', fetchMock);

    await generateAgentPersona('d');
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-glm-key');
  });

  it('无 key 时不发 Authorization 头（依赖服务端 env 兜底）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('x'));
    vi.stubGlobal('fetch', fetchMock);

    await generateAgentPersona('d');
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('非 2xx（如 401 NO_API_KEY）抛 LlmApiError 并透传后端 code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { type: 'api_error', code: 'NO_API_KEY', message: 'no key' } }),
    }));

    const err = await generateAgentPersona('d').catch((e) => e);
    expect(err).toBeInstanceOf(LlmApiError);
    expect((err as LlmApiError).status).toBe(401);
    expect((err as LlmApiError).code).toBe('NO_API_KEY');
  });

  it('200 但 content 为空 → EMPTY_RESPONSE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('   ')));
    const err = await generateAgentPersona('d').catch((e) => e);
    expect(err).toBeInstanceOf(LlmApiError);
    expect((err as LlmApiError).code).toBe('EMPTY_RESPONSE');
  });

  it('空描述直接抛 EMPTY_DESCRIPTION，不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateAgentPersona('   ')).rejects.toMatchObject({ code: 'EMPTY_DESCRIPTION' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
