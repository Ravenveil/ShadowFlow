/**
 * asr.test.ts — 语音转写 API 客户端（2026-11-07，语音输入）。
 *
 * fetch 打桩，校验：URL/头（BYOK X-LLM-* + X-ASR-*）/body 直传、
 * 成功取 data.text、失败抛 AsrError（带服务端错误码）。
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { transcribeAudio, AsrError } from './asr';

function fetchMockOnce(impl: () => Promise<unknown>): ReturnType<typeof vi.fn> {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('transcribeAudio', () => {
  it('POST /api/asr/transcribe，带 BYOK + X-ASR 头，返回识别文本', async () => {
    localStorage.setItem('sf_openai_key', 'sk-test-123');
    const mock = fetchMockOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { text: ' 你好世界 ' } }),
    }));

    const blob = new Blob(['audio-bytes'], { type: 'audio/webm' });
    const text = await transcribeAudio(blob, { model: 'whisper-1', language: 'zh' });

    expect(text).toBe(' 你好世界 ');
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/api/asr/transcribe')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(blob);
    const h = init.headers as Record<string, string>;
    expect(h['Content-Type']).toBe('audio/webm');
    expect(h['X-LLM-Provider']).toBe('openai');
    expect(h['X-LLM-Key']).toBe('sk-test-123');
    expect(h['X-ASR-Model']).toBe('whisper-1');
    expect(h['X-ASR-Language']).toBe('zh');
    expect(h['X-ASR-Filename']).toBe('recording.webm');
  });

  it('mp4 录音默认文件名 recording.m4a', async () => {
    localStorage.setItem('sf_openai_key', 'sk-test-123');
    const mock = fetchMockOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { text: '' } }),
    }));

    await transcribeAudio(new Blob(['x'], { type: 'audio/mp4' }));
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-ASR-Filename']).toBe('recording.m4a');
  });

  it('服务端错误 → 抛 AsrError（code=NO_KEY）', async () => {
    fetchMockOnce(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'NO_KEY', message: '未配置转写服务 API Key' } }),
    }));

    const err = await transcribeAudio(new Blob(['x'], { type: 'audio/webm' })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AsrError);
    expect((err as AsrError).code).toBe('NO_KEY');
    expect((err as AsrError).message).toContain('未配置');
  });

  it('网络层抛错原样上抛', async () => {
    fetchMockOnce(async () => {
      throw new Error('network down');
    });
    await expect(transcribeAudio(new Blob(['x']))).rejects.toThrow('network down');
  });

  it('有 mimo key → 优先小米（provider=mimo + mimo-v2.5-asr）', async () => {
    localStorage.setItem('sf_mimo_key', 'sk-mimo-1');
    const mock = fetchMockOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { text: '你好' } }),
    }));

    await transcribeAudio(new Blob(['x'], { type: 'audio/webm' }));
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(h['X-LLM-Provider']).toBe('mimo');
    expect(h['X-LLM-Key']).toBe('sk-mimo-1');
    expect(h['X-ASR-Model']).toBe('mimo-v2.5-asr');
  });

  it('sf.asrProvider=openai 强制走 whisper 形态（即使有 mimo key）', async () => {
    localStorage.setItem('sf_mimo_key', 'sk-mimo-1');
    localStorage.setItem('sf_openai_key', 'sk-oai-1');
    localStorage.setItem('sf.asrProvider', 'openai');
    const mock = fetchMockOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { text: 'hi' } }),
    }));

    await transcribeAudio(new Blob(['x'], { type: 'audio/webm' }));
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(h['X-LLM-Provider']).toBe('openai');
    expect(h['X-LLM-Key']).toBe('sk-oai-1');
    expect(h['X-ASR-Model']).toBe('whisper-1');
  });

  it('opts.model 显式 mimo-* → key/provider 切到 mimo', async () => {
    localStorage.setItem('sf_openai_key', 'sk-oai-1');
    localStorage.setItem('sf_mimo_key', 'sk-mimo-1');
    const mock = fetchMockOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { text: 'ok' } }),
    }));

    await transcribeAudio(new Blob(['x'], { type: 'audio/webm' }), { model: 'mimo-v2.5-asr' });
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(h['X-LLM-Provider']).toBe('mimo');
    expect(h['X-ASR-Model']).toBe('mimo-v2.5-asr');
  });
});
