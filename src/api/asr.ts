/**
 * ASR（语音转文字）API 客户端 — 语音输入（2026-11-07）。
 *
 * 把 MediaRecorder 录下的音频 POST 给 /api/asr/transcribe，返回识别文本。
 * BYOK：复用 chat.ts 的 buildByokHeaders（优先 openai key，无则自动发现），
 * 服务端另有 OPENAI_API_KEY env 兜底。上游为 OpenAI 兼容
 * /audio/transcriptions（默认 whisper-1）。
 */

import { getApiBase } from './_base';
import { buildByokHeaders } from './chat';

export class AsrError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AsrError';
    this.code = code;
  }
}

export interface TranscribeOptions {
  /** 上游模型，缺省由服务端定（whisper-1）。 */
  model?: string;
  /** 语种提示（如 'zh'），可提高识别准确率。 */
  language?: string;
  /** 上传文件名（按扩展名提示容器格式），缺省 recording.webm。 */
  filename?: string;
  signal?: AbortSignal;
}

/**
 * 上传音频并返回识别文本（去空白前的原始文本由调用方决定怎么插）。
 * 失败抛 AsrError（code 携带服务端错误码，如 NO_KEY / ASR_UPSTREAM）。
 */
export async function transcribeAudio(
  blob: Blob,
  opts?: TranscribeOptions,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': blob.type || 'audio/webm',
    'X-ASR-Filename': opts?.filename ?? defaultFilename(blob.type),
    ...buildByokHeaders({ provider: 'openai' }),
  };
  if (opts?.model) headers['X-ASR-Model'] = opts.model;
  if (opts?.language) headers['X-ASR-Language'] = opts.language;

  const res = await fetch(`${getApiBase()}/api/asr/transcribe`, {
    method: 'POST',
    headers,
    body: blob,
    signal: opts?.signal,
  });

  if (!res.ok) {
    let code = 'ASR_FAILED';
    let msg = `语音转写失败（HTTP ${res.status}）`;
    try {
      const j = (await res.json()) as { error?: { code?: string; message?: string } };
      if (j?.error) {
        code = j.error.code ?? code;
        msg = j.error.message ?? msg;
      }
    } catch {
      /* 非 JSON 错误体，用 HTTP 兜底文案 */
    }
    throw new AsrError(code, msg);
  }

  const j = (await res.json()) as { data?: { text?: string } };
  return j?.data?.text ?? '';
}

/** 按 MIME 猜上传扩展名（服务端另有 X-ASR-Filename 兜底逻辑）。 */
function defaultFilename(mime: string): string {
  if (mime.includes('mp4')) return 'recording.m4a';
  if (mime.includes('mpeg')) return 'recording.mp3';
  if (mime.includes('wav')) return 'recording.wav';
  if (mime.includes('ogg')) return 'recording.ogg';
  return 'recording.webm';
}
