/**
 * api/imageGen.ts — 提示词生成头像的云端通道（2026-11-04 os-unified）。
 *
 * POST /api/settings/image/generations — 走用户 BYOK 配置的 provider
 * （zhipu CogView-4 / openai gpt-image-1 优先自动挑）。返回 OpenAI images
 * API 形状 { data: [{ b64_json | url }] }。
 *
 * 失败语义（调用方 AvatarStylePicker 据此降级本地 DiceBear 生成）：
 *  - 503 IMAGE_NOT_CONFIGURED：没配任何带 key 的 provider
 *  - 401 / 502：上游报错或网络失败
 */
import { getApiBase } from './_base';

export interface GeneratedImage {
  /** base64（无 data: 前缀）或完整 URL（由上游决定）。 */
  b64_json?: string;
  url?: string;
}

export interface ImageGenResponse {
  data?: GeneratedImage[];
}

export class ImageGenError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** 提示词 → 云端图片（1 张）。抛 ImageGenError 时调用方走本地降级。 */
export async function generateImageFromPrompt(prompt: string): Promise<string> {
  const res = await fetch(`${getApiBase()}/api/settings/image/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, n: 1, size: '1024x1024' }),
  });
  const text = await res.text();
  let payload: ImageGenResponse & { error?: { code?: string; message?: string } };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ImageGenError('BAD_RESPONSE', res.status, '非 JSON 响应');
  }
  if (!res.ok) {
    throw new ImageGenError(
      payload.error?.code ?? 'UPSTREAM_ERROR',
      res.status,
      payload.error?.message ?? `HTTP ${res.status}`,
    );
  }
  const first = payload.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  throw new ImageGenError('EMPTY', res.status, '上游未返回图片');
}
