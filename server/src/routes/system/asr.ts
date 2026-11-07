/**
 * asr.ts — 语音输入转写路由（2026-11-07）。
 *
 * POST /api/asr/transcribe — 把浏览器 MediaRecorder 录下的音频转写成文本，
 * 供 NeoComposer 语音输入把识别结果填回输入框。Node 直调 OpenAI 兼容
 * `/audio/transcriptions`（默认 whisper-1）；任何兼容 relay 均可用
 * （X-ASR-Base-Url 头或 OPENAI_BASE_URL env 覆盖基址）。
 *
 * 请求：
 *   body — 原始音频字节（Content-Type: audio/*，≤25MB）
 *   头   — X-LLM-Key / x-api-key / Authorization: Bearer 三选一（与 llm.ts 的
 *          BYOK 约定一致）；无 key 时按 X-LLM-Provider 查服务端 env
 *          （PROVIDER_ENV_VAR），再回退 OPENAI_API_KEY。
 *          可选：X-ASR-Model（缺省 whisper-1）、X-ASR-Base-Url、
 *          X-ASR-Filename、X-ASR-Language（语种提示，如 zh）。
 *
 * 返回：200 { data: { text, model } }
 *      400 BAD_BODY / NO_KEY   401 ASR_UNAUTHORIZED   413 TOO_LARGE
 *      502 ASR_UPSTREAM / ASR_BAD_RESPONSE
 *
 * 实现走全局 fetch + FormData（不引 openai SDK）：与 builtin web-search 的
 * 「轻量 fetch 直连」风格一致，也方便 vitest stub fetch 测试。
 */

import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { PROVIDER_ENV_VAR, isProviderId } from '../../transport/api-clients';

const router = Router();

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DEFAULT_MODEL = 'whisper-1';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

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

function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s === 'string' && s.trim().length > 0) return s.trim();
  }
  return undefined;
}

/**
 * BYOK key 解析：请求头优先（X-LLM-Key → x-api-key → Authorization: Bearer），
 * 再按 X-LLM-Provider 查服务端 env，最后回退 OPENAI_API_KEY。
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
          message: '未配置转写服务 API Key（请求头 X-LLM-Key，或服务端 OPENAI_API_KEY）',
        },
      });
      return;
    }

    const contentType =
      firstStr(String(req.headers['content-type'] ?? '').split(';')[0]) ?? 'audio/webm';
    const model = firstStr(req.header('x-asr-model'), req.query.model) ?? DEFAULT_MODEL;
    const baseUrl = (
      firstStr(req.header('x-asr-base-url'), process.env.OPENAI_BASE_URL) ?? DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    const language = firstStr(req.header('x-asr-language'), req.query.language);
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
      if (upstream.status === 401 || upstream.status === 403) {
        res.status(401).json({
          error: { code: 'ASR_UNAUTHORIZED', message: '转写服务鉴权失败，请检查 API Key' },
        });
        return;
      }
      res.status(502).json({
        error: { code: 'ASR_UPSTREAM', message: `转写服务返回 ${upstream.status}` },
      });
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
