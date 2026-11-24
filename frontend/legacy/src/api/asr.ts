/**
 * ASR（语音转文字）API 客户端 — 语音输入（2026-11-07；同日切小米优先）。
 *
 * 把 MediaRecorder 录下的音频 POST 给 /api/asr/transcribe，返回识别文本。
 *
 * 转写 provider 选择（pickAsrTarget）：
 *   - 有 mimo key（sf_mimo_key）→ 小米 chat-audio 形态（mimo-v2.5-asr，
 *     服务端走 /chat/completions + input_audio，仅收 mp3/wav）
 *   - 否则 → openai whisper 形态（/audio/transcriptions）
 *   - localStorage `sf.asrProvider`（'mimo'|'openai'|'auto'）可强制指定
 *
 * 音频格式：上传前统一转 16k 单声道 WAV（blobToWav16kMono，小米只吃
 * mp3/wav，whisper 也认 wav）；浏览器解码不了时回落原容器直传。
 * BYOK 头复用 chat.ts 的 buildByokHeaders；服务端另有
 * OPENAI_API_KEY / MIMO_API_KEY env 兜底。
 */

import { getApiBase, getStoredApiKey } from './_base';
import { buildByokHeaders } from './chat';
import { blobToWav16kMono } from '../lib/audioToWav';

export class AsrError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AsrError';
    this.code = code;
  }
}

export type AsrStyle = 'transcriptions' | 'chat-audio';

export interface AsrTarget {
  provider: 'mimo' | 'openai';
  /** 随 X-ASR-Model 发送的缺省模型。 */
  model: string;
  style: AsrStyle;
}

export interface TranscribeOptions {
  /** 上游模型覆盖（缺省按 pickAsrTarget：mimo-v2.5-asr / whisper-1）。 */
  model?: string;
  /** 语种提示（auto/zh/en，如 'zh'），可提高识别准确率。 */
  language?: string;
  /** 上传文件名（按扩展名提示容器格式），缺省按 MIME 猜。 */
  filename?: string;
  signal?: AbortSignal;
}

function readAsrPref(): string {
  try {
    return (localStorage.getItem('sf.asrProvider') ?? 'auto').trim();
  } catch {
    return 'auto';
  }
}

function hasMimoKey(): boolean {
  try {
    return !!getStoredApiKey('mimo');
  } catch {
    return false;
  }
}

/**
 * 转写服务选择：mimo key 存在（或 sf.asrProvider=mimo 强制）→ 小米
 * chat-audio；否则回落 openai whisper。sf.asrProvider=openai 可强制走 whisper。
 */
export function pickAsrTarget(): AsrTarget {
  const pref = readAsrPref();
  if (pref === 'mimo' || (pref !== 'openai' && hasMimoKey())) {
    return { provider: 'mimo', model: 'mimo-v2.5-asr', style: 'chat-audio' };
  }
  return { provider: 'openai', model: 'whisper-1', style: 'transcriptions' };
}

/** 显式模型名覆盖时，按前缀推断该模型归哪家（mimo-* → mimo）。 */
function providerForModel(model: string | undefined, fallback: 'mimo' | 'openai'): 'mimo' | 'openai' {
  if (!model) return fallback;
  return /^mimo-/i.test(model) ? 'mimo' : 'openai';
}

/**
 * 上传音频并返回识别文本（怎么插回输入框由调用方决定）。
 * 失败抛 AsrError（code 携带服务端错误码，如 NO_KEY / ASR_UPSTREAM）。
 */
export async function transcribeAudio(
  blob: Blob,
  opts?: TranscribeOptions,
): Promise<string> {
  const target = pickAsrTarget();
  const model = opts?.model ?? target.model;
  const provider = providerForModel(opts?.model, target.provider);

  // 统一转 16k 单声道 WAV（小米只收 mp3/wav）；解码不了回落原容器。
  let payload = blob;
  let filename = opts?.filename ?? defaultFilename(blob.type);
  if (blob.type !== 'audio/wav') {
    try {
      payload = await blobToWav16kMono(blob);
      filename = 'recording.wav';
    } catch {
      /* 保持原格式直传（whisper 形态可吃 webm/mp4；小米形态会报 UNSUPPORTED_FORMAT） */
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': payload.type || 'audio/webm',
    'X-ASR-Filename': filename,
    'X-ASR-Model': model,
    ...buildByokHeaders({ provider }),
  };
  if (opts?.language) headers['X-ASR-Language'] = opts.language;

  const res = await fetch(`${getApiBase()}/api/asr/transcribe`, {
    method: 'POST',
    headers,
    body: payload,
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
