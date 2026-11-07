/**
 * asr.ts — 语音输入转写路由（2026-11-07；同日增小米 chat-audio 形态）。
 *
 * POST /api/asr/transcribe — 把浏览器录音转写成文本，供 NeoComposer 语音输入
 * 填回输入框。支持两种上游形态：
 *
 *   1. transcriptions（缺省）— OpenAI 兼容 `/audio/transcriptions`（whisper-1），
 *      multipart 上传，任意兼容 relay（X-ASR-Base-Url 头或 OPENAI_BASE_URL
 *      env 覆盖基址）。
 *   2. chat-audio — 小米 MiMo 形态：`/chat/completions` + input_audio
 *      （base64 data URL），模型缺省 mimo-v2.5-asr，asr_options.language；
 *      **仅收 mp3/wav**（前端录音链路自动转 wav）。基址缺省
 *      https://api.xiaomimimo.com/v1。
 *
 *   形态判定：X-ASR-Style 显式优先（transcriptions|chat-audio），否则按模型名
 *   —— `mimo-*` → chat-audio，其它 → transcriptions。
 *
 * 请求：
 *   body — 原始音频字节（Content-Type: audio/*，≤25MB）
 *   头   — X-LLM-Key / x-api-key / Authorization: Bearer 三选一（与 llm.ts 的
 *          BYOK 约定一致）；无 key 时按 X-LLM-Provider 查服务端 env
 *          （PROVIDER_ENV_VAR，mimo→MIMO_API_KEY），再回退 OPENAI_API_KEY。
 *          可选：X-ASR-Model、X-ASR-Style、X-ASR-Base-Url、X-ASR-Filename、
 *          X-ASR-Language（语种提示：auto/zh/en）。
 *
 * 返回：200 { data: { text, model } }
 *      400 BAD_BODY / NO_KEY / UNSUPPORTED_FORMAT
 *      401 ASR_UNAUTHORIZED   413 TOO_LARGE
 *      502 ASR_UPSTREAM / ASR_BAD_RESPONSE
 *
 * 实现走全局 fetch（不引 openai SDK）：与 builtin web-search 的「轻量 fetch
 * 直连」风格一致，也方便 vitest stub fetch 测试。
 */

import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { PROVIDER_ENV_VAR, isProviderId } from '../../transport/api-clients';

const router = Router();

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DEFAULT_TRANSCRIBE_MODEL = 'whisper-1';
const DEFAULT_CHAT_AUDIO_MODEL = 'mimo-v2.5-asr';
const DEFAULT_TRANSCRIBE_BASE = 'https://api.openai.com/v1';
const DEFAULT_CHAT_AUDIO_BASE = 'https://api.xiaomimimo.com/v1';

type AsrStyle = 'transcriptions' | 'chat-audio';

/** Content-Type → 扩展名（给上游 multipart 文件名，仅影响服务端解析识别）。 */
const EXT_BY_TYPE: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

/** chat-audio（小米 ASR）只吃 mp3/wav，值即 input_audio.format。 */
const CHAT_AUDIO_FORMAT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
};

function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s === 'string' && s.trim().length > 0) return s.trim();
  }
  return undefined;
}

/** 形态判定：显式头 > 模型名前缀（mimo-* → chat-audio）。 */
function inferStyle(explicit: string | undefined, model: string | undefined): AsrStyle {
  if (explicit === 'chat-audio' || explicit === 'transcriptions') return explicit;
  return model && /^mimo-/i.test(model) ? 'chat-audio' : 'transcriptions';
}

/**
 * BYOK key 解析：请求头优先（X-LLM-Key → x-api-key → Authorization: Bearer），
 * 再按 X-LLM-Provider 查服务端 env（mimo→MIMO_API_KEY），最后回退 OPENAI_API_KEY。
 */
function resolveKey(req: Request): string | undefined {
  const headerKey = firstStr(req.header('x-llm-key'), req.header('x-api-key'));
  if (headerKey) return headerKey;
  const auth = req.header('authorization');
  const m = auth ? /^Bearer\s+(.+)$/i.exec(auth.trim()) : null;
  if (m) return m[1].trim();
  const provider = firstStr(req.header('x-llm-provider'));
  const envVar = provider && isProviderId(provider) ? PROVIDER_ENV_VAR[provider] : undefined;
  const envKey = envVar ? process.env[envVar] : undefined;
  if (typeof envKey === 'string' && envKey.length > 0) return envKey;
  const openaiEnv = process.env.OPENAI_API_KEY;
  return typeof openaiEnv === 'string' && openaiEnv.length > 0 ? openaiEnv : undefined;
}

/** 只保留 basename 语义：剥掉路径段、拒绝空名（防把任意路径透传给上游）。 */
function sanitizeFilename(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const base = raw.split(/[\\/]/).pop() ?? '';
  const name = base.trim();
  if (!name || name === '.' || name === '..') return undefined;
  return name;
}

/** 上游非 2xx → 统一错误映射（401/403 鉴权，其余 502）。 */
function mapUpstreamError(res: Response, status: number): void {
  if (status === 401 || status === 403) {
    res.status(401).json({
      error: { code: 'ASR_UNAUTHORIZED', message: '转写服务鉴权失败，请检查 API Key' },
    });
    return;
  }
  res.status(502).json({ error: { code: 'ASR_UPSTREAM', message: `转写服务返回 ${status}` } });
}

router.post(
  '/transcribe',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: MAX_AUDIO_BYTES + 1024 * 1024 }),
  async (req: Request, res: Response) => {
    const buf = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({
        error: { code: 'BAD_BODY', message: '缺少音频数据（body 需为原始音频字节）' },
      });
      return;
    }
    if (buf.length > MAX_AUDIO_BYTES) {
      res.status(413).json({ error: { code: 'TOO_LARGE', message: '音频超过 25MB 上限' } });
      return;
    }
    const key = resolveKey(req);
    if (!key) {
      res.status(400).json({
        error: {
          code: 'NO_KEY',
          message: '未配置转写服务 API Key（请求头 X-LLM-Key，或服务端 OPENAI_API_KEY / MIMO_API_KEY）',
        },
      });
      return;
    }

    const contentType =
      firstStr(String(req.headers['content-type'] ?? '').split(';')[0]) ?? 'audio/webm';
    const modelHint = firstStr(req.header('x-asr-model'), req.query.model);
    const style = inferStyle(firstStr(req.header('x-asr-style')), modelHint);
    const model =
      modelHint ??
      (style === 'chat-audio' ? DEFAULT_CHAT_AUDIO_MODEL : DEFAULT_TRANSCRIBE_MODEL);
    const baseUrl = (
      firstStr(req.header('x-asr-base-url'), process.env.OPENAI_BASE_URL) ??
      (style === 'chat-audio' ? DEFAULT_CHAT_AUDIO_BASE : DEFAULT_TRANSCRIBE_BASE)
    ).replace(/\/+$/, '');
    const language = firstStr(req.header('x-asr-language'), req.query.language);

    // ── chat-audio（小米 MiMo）：JSON + base64 data URL，取 choices[0].message.content ──
    if (style === 'chat-audio') {
      const format = CHAT_AUDIO_FORMAT[contentType];
      if (!format) {
        res.status(400).json({
          error: {
            code: 'UNSUPPORTED_FORMAT',
            message: '当前转写服务仅支持 mp3/wav 音频（浏览器录音会自动转 wav）',
          },
        });
        return;
      }
      const mime = contentType === 'audio/x-wav' ? 'audio/wav' : contentType;
      const payload: Record<string, unknown> = {
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: { data: `data:${mime};base64,${buf.toString('base64')}`, format },
              },
            ],
          },
        ],
      };
      if (language) payload.asr_options = { language };

      let upstream: Awaited<ReturnType<typeof fetch>>;
      try {
        upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        res.status(502).json({
          error: { code: 'ASR_UPSTREAM', message: `转写服务连接失败：${(e as Error).message}` },
        });
        return;
      }
      const raw = await upstream.text().catch(() => '');
      if (!upstream.ok) {
        mapUpstreamError(res, upstream.status);
        return;
      }
      let text: string | null = null;
      try {
        const j = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown } }> };
        const content = j?.choices?.[0]?.message?.content;
        if (typeof content === 'string') text = content;
        else if (Array.isArray(content)) {
          text = content
            .map((p) =>
              p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string'
                ? (p as { text: string }).text
                : '',
            )
            .join('');
        }
      } catch {
        /* fallthrough → BAD_RESPONSE */
      }
      if (text === null) {
        res.status(502).json({
          error: { code: 'ASR_BAD_RESPONSE', message: '转写服务返回了无法解析的响应' },
        });
        return;
      }
      res.json({ data: { text, model } });
      return;
    }

    // ── transcriptions（OpenAI 兼容 whisper）：multipart 上传 ──
    const filename =
      sanitizeFilename(req.header('x-asr-filename')) ??
      `recording.${EXT_BY_TYPE[contentType] ?? 'webm'}`;
    const fd = new FormData();
    fd.append('model', model);
    fd.append('response_format', 'json');
    fd.append('file', new Blob([new Uint8Array(buf)], { type: contentType }), filename);
    if (language) fd.append('language', language);

    let upstream: Awaited<ReturnType<typeof fetch>>;
    try {
      upstream = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: fd,
      });
    } catch (e) {
      res.status(502).json({
        error: { code: 'ASR_UPSTREAM', message: `转写服务连接失败：${(e as Error).message}` },
      });
      return;
    }

    const raw = await upstream.text().catch(() => '');
    if (!upstream.ok) {
      mapUpstreamError(res, upstream.status);
      return;
    }

    let text = '';
    try {
      text = String((JSON.parse(raw) as { text?: unknown }).text ?? '');
    } catch {
      res.status(502).json({
        error: { code: 'ASR_BAD_RESPONSE', message: '转写服务返回了无法解析的响应' },
      });
      return;
    }
    res.json({ data: { text, model } });
  },
);

/** express.raw 超限 → 统一 413 JSON（不然会落进全局错误处理变 HTML）。 */
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: '音频超过 25MB 上限' } });
    return;
  }
  next(err);
});

export default router;
