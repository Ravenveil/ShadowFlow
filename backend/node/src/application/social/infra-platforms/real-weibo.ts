/**
 * social-platforms/real-weibo.ts — 微博真实发布链（2026-11-07）。
 *
 * 官方链路（open.weibo.com，OAuth2 用户授权）：
 *   - 纯文本：POST https://api.weibo.com/2/statuses/update.json
 *     form: access_token, status
 *   - 带图：POST https://upload.api.weibo.com/2/statuses/upload.json
 *     multipart: access_token, status, pic（JPEG/GIF/PNG <5M，单图）
 *   - 官方限制：status ≤ 140 汉字；超长走长微博/人工通道，不在 API 硬塞。
 *
 * 凭证：SP_WEIBO_ACCESS_TOKEN（用户授权的 OAuth2 access_token）。
 */

import { downloadBytes, postForm, postMultipart, asRecord, asString } from './http';
import type { PlatformAdapter, PlatformSpec, PublishReceipt } from './types';

/** 官方单条上限 140 字（statuses/update 与 statuses/upload 同）。 */
const WEIBO_TEXT_MAX = 140;

export function createWeiboAdapter(_spec: PlatformSpec): PlatformAdapter {
  return {
    platform: _spec.id,
    mode: 'real',
    async publish(_postId, input): Promise<PublishReceipt> {
      const token = (process.env.SP_WEIBO_ACCESS_TOKEN ?? '').trim();
      if (!token) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error: '缺少环境变量 SP_WEIBO_ACCESS_TOKEN（微博 OAuth2 用户授权 token）',
        };
      }
      const status = [input.title, input.content].filter(Boolean).join(' ');
      if (status.length > WEIBO_TEXT_MAX) {
        return {
          ok: false,
          code: 'PLATFORM_LIMIT',
          error: `微博单条上限 ${WEIBO_TEXT_MAX} 字（当前 ${status.length} 字），请精简文案`,
        };
      }
      try {
        const picUrl = input.media[0];
        if (picUrl) {
          const pic = await downloadBytes(picUrl);
          const res = await postMultipart(
            'https://upload.api.weibo.com/2/statuses/upload.json',
            { access_token: token, status },
            [{ field: 'pic', filename: pic.filename, bytes: pic.bytes, contentType: pic.contentType }],
          );
          return mapWeibo(res.data);
        }
        const res = await postForm('https://api.weibo.com/2/statuses/update.json', {
          access_token: token,
          status,
        });
        return mapWeibo(res.data);
      } catch (e) {
        return { ok: false, code: 'NETWORK_ERROR', error: (e as Error).message };
      }
    },
  };
}

function mapWeibo(data: unknown): PublishReceipt {
  const d = asRecord(data);
  const errorCode = d?.error_code;
  if (errorCode != null && Number(errorCode) !== 0) {
    return {
      ok: false,
      code: 'PLATFORM_REJECTED',
      error: asString(d?.error) || `微博错误码 ${String(errorCode)}`,
      raw: data,
    };
  }
  const id = asString(d?.idstr) || asString(d?.id) || asString(d?.mid);
  if (!id) {
    return { ok: false, code: 'PLATFORM_REJECTED', error: '微博未返回微博 ID', raw: data };
  }
  return { ok: true, external_id: id, raw: data };
}
