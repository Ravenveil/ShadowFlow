/**
 * routes/system/asr.test.ts — /api/asr/transcribe 语音转写路由（vitest）。
 *
 * 真实 router + 真实 express/http（no-supertest 风格，沿 llm.test.ts 传统），
 * fetch 用 vi.stubGlobal 打桩——绝不上网。覆盖：
 *   - 空 body → 400 BAD_BODY
 *   - 无 key（env 全清）→ 400 NO_KEY
 *   - X-LLM-Key BYOK → 200 { data: { text, model } }，上游收到 Bearer + multipart
 *   - X-LLM-Provider → PROVIDER_ENV_VAR env 回退生效
 *   - 上游 401 → 401 ASR_UNAUTHORIZED；上游 500 → 502 ASR_UPSTREAM
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import asrRouter from '../routes/system/asr';

interface HttpResp {
  status: number;
  body: any;
}

let server: http.Server;
let port: number;

function postAudio(
  body: Buffer,
  headers: Record<string, string> = {},
): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/api/asr/transcribe',
        headers: {
          'Content-Type': 'audio/webm',
          'Content-Length': body.length,
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* keep raw */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

const okFetch = (text = '你好世界') =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ text }),
  })) as unknown as typeof fetch;

const savedEnv: Record<string, string | undefined> = {};
const AFFECTED_ENV = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ZHIPU_API_KEY',
  'DEEPSEEK_API_KEY',
];

beforeAll(async () => {
  for (const k of AFFECTED_ENV) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  const app = express();
  app.use('/api/asr', asrRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  for (const k of AFFECTED_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/asr/transcribe', () => {
  it('空 body → 400 BAD_BODY', async () => {
    const res = await postAudio(Buffer.alloc(0), { 'X-LLM-Key': 'sk-test' });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('BAD_BODY');
  });

  it('无 key 且 env 全清 → 400 NO_KEY', async () => {
    const res = await postAudio(Buffer.from('fake-audio'));
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('NO_KEY');
  });

  it('X-LLM-Key BYOK → 200，上游收到 Bearer + model/文件', async () => {
    const fetchMock = okFetch('今天天气不错');
    vi.stubGlobal('fetch', fetchMock);
    const res = await postAudio(Buffer.from('fake-audio'), {
      'X-LLM-Key': 'sk-babababa',
      'X-ASR-Model': 'whisper-1',
      'X-ASR-Filename': 'note.webm',
      'X-ASR-Language': 'zh',
    });
    expect(res.status).toBe(200);
    expect(res.body?.data?.text).toBe('今天天气不错');
    expect(res.body?.data?.model).toBe('whisper-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-babababa');
    const fd = init.body as FormData;
    expect(String(fd.get('model'))).toBe('whisper-1');
    expect(String(fd.get('language'))).toBe('zh');
    const file = fd.get('file') as File;
    expect(file?.name).toBe('note.webm');
  });

  it('X-LLM-Provider → 服务端 env key 回退生效', async () => {
    process.env.OPENAI_API_KEY = 'sk-env-key';
    try {
      const fetchMock = okFetch('ok');
      vi.stubGlobal('fetch', fetchMock);
      const res = await postAudio(Buffer.from('fake-audio'), { 'X-LLM-Provider': 'openai' });
      expect(res.status).toBe(200);
      const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-env-key');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('上游 401 → 401 ASR_UNAUTHORIZED；上游 500 → 502 ASR_UPSTREAM', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })) as unknown as typeof fetch,
    );
    const r401 = await postAudio(Buffer.from('fake-audio'), { 'X-LLM-Key': 'sk-bad' });
    expect(r401.status).toBe(401);
    expect(r401.body?.error?.code).toBe('ASR_UNAUTHORIZED');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' })) as unknown as typeof fetch,
    );
    const r500 = await postAudio(Buffer.from('fake-audio'), { 'X-LLM-Key': 'sk-bad' });
    expect(r500.status).toBe(502);
    expect(r500.body?.error?.code).toBe('ASR_UPSTREAM');
  });

  it('X-ASR-Base-Url 覆盖上游基址（兼容 relay）', async () => {
    const fetchMock = okFastFetch();
    vi.stubGlobal('fetch', fetchMock);
    const res = await postAudio(Buffer.from('fake-audio'), {
      'X-LLM-Key': 'sk-relay',
      'X-ASR-Base-Url': 'https://relay.example.com/v1/',
    });
    expect(res.status).toBe(200);
    const [url] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('https://relay.example.com/v1/audio/transcriptions');
  });
});

describe('POST /api/asr/transcribe — chat-audio（小米 MiMo）', () => {
  it('mimo 模型自动走 chat-audio：/chat/completions + input_audio data URL', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: '今天天气不错' } }] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const res = await postAudio(Buffer.from('fake-wav-bytes'), {
      'Content-Type': 'audio/wav',
      'X-LLM-Key': 'sk-mimo',
      'X-ASR-Model': 'mimo-v2.5-asr',
      'X-ASR-Language': 'zh',
    });
    expect(res.status).toBe(200);
    expect(res.body?.data?.text).toBe('今天天气不错');
    expect(res.body?.data?.model).toBe('mimo-v2.5-asr');

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.xiaomimimo.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-mimo');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{
        role: string;
        content: Array<{ type: string; input_audio?: { data: string; format: string } }>;
      }>;
      asr_options?: { language: string };
    };
    expect(body.model).toBe('mimo-v2.5-asr');
    expect(body.asr_options?.language).toBe('zh');
    expect(body.messages[0].role).toBe('user');
    const part = body.messages[0].content[0];
    expect(part.type).toBe('input_audio');
    expect(part.input_audio?.format).toBe('wav');
    expect(part.input_audio?.data.startsWith('data:audio/wav;base64,')).toBe(true);
    const b64 = (part.input_audio?.data ?? '').split(',')[1];
    expect(Buffer.from(b64, 'base64').toString()).toBe('fake-wav-bytes');
  });

  it('chat-audio 非 mp3/wav → 400 UNSUPPORTED_FORMAT', async () => {
    const res = await postAudio(Buffer.from('fake-webm'), {
      'Content-Type': 'audio/webm',
      'X-LLM-Key': 'sk-mimo',
      'X-ASR-Model': 'mimo-v2.5-asr',
    });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('X-ASR-Style 显式覆盖形态判定 + X-ASR-Base-Url 指 relay', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'hi' } }] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const res = await postAudio(Buffer.from('fake-wav'), {
      'Content-Type': 'audio/wav',
      'X-LLM-Key': 'sk-x',
      'X-ASR-Model': 'whisper-1',
      'X-ASR-Style': 'chat-audio',
      'X-ASR-Base-Url': 'https://relay.example.com/v1',
    });
    expect(res.status).toBe(200);
    const [url] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('https://relay.example.com/v1/chat/completions');
  });
});

function okFastFetch() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ text: 'hi' }),
  })) as unknown as typeof fetch;
}
