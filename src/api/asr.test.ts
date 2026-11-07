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
});
