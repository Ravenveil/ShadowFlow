/**
 * social-platforms/real-kuaishou.ts — 快手真实发布链（2026-11-07）。
 *
 * 官方三步链（open.kuaishou.com，scope user_video_publish + 用户授权）：
 *   1. 发起上传：POST /openapi/photo/start_upload?access_token&app_id
 *      → {upload_token, endpoint}
 *   2. 直传视频（≤10M 走二进制 body）：POST http://{endpoint}/api/upload?upload_token=
 *      body 即纯文件二进制（官方要求不带 boundary）
 *   3. 发布：POST /openapi/photo/publish?access_token&app_id&upload_token=
 *      multipart: cover（封面文件 <10MB，必填）、caption（必填）→ video_info.photo_id
 *
 * 凭证：SP_KUAISHOU_ACCESS_TOKEN + SP_KUAISHOU_APP_ID。
 * 快手是视频平台：media[0] 为视频 URL、media[1] 为封面图 URL（发布接口要求封面文件）。
 */

import { downloadBytes, postBinary, postForm, postMultipart, asRecord, asString } from './http';
import type { PlatformAdapter, PlatformSpec, PublishReceipt } from './types';

const VIDEO_EXT = /\.(mp4|mov|m4v|avi|flv|mkv|webm)$/i;

function findVideoUrl(media: string[]): string {
  for (const url of media) {
    try {
      if (VIDEO_EXT.test(new URL(url).pathname)) return url;
    } catch {
      if (VIDEO_EXT.test(url)) return url;
    }
  }
  return '';
}

function findImageUrl(media: string[], exclude: string): string {
  for (const url of media) {
    if (url !== exclude && /\.(png|jpe?g|gif|webp|bmp)$/i.test(url.split('?')[0])) return url;
  }
  return '';
}

export function createKuaishouAdapter(_spec: PlatformSpec): PlatformAdapter {
  return {
    platform: _spec.id,
    mode: 'real',
    async publish(_postId, input): Promise<PublishReceipt> {
      const token = (process.env.SP_KUAISHOU_ACCESS_TOKEN ?? '').trim();
      const appId = (process.env.SP_KUAISHOU_APP_ID ?? '').trim();
      if (!token || !appId) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error: '缺少环境变量 SP_KUAISHOU_ACCESS_TOKEN / SP_KUAISHOU_APP_ID（快手开放平台用户授权）',
        };
      }
      const media = Array.isArray(input.media) ? input.media : [];
      const videoUrl = findVideoUrl(media);
      if (!videoUrl) {
        return {
          ok: false,
          code: 'NEED_VIDEO_ASSET',
          error: '快手真实发布需要视频素材：media[0] 放视频 URL、media[1] 放封面图 URL',
        };
      }
      const coverUrl = findImageUrl(media, videoUrl);
      if (!coverUrl) {
        return {
          ok: false,
          code: 'NEED_COVER_ASSET',
          error: '快手发布接口要求封面图文件：请在 media 中附一张封面图 URL',
        };
      }
      try {
        const q = `access_token=${encodeURIComponent(token)}&app_id=${encodeURIComponent(appId)}`;

        // 1. 发起上传
        const start = await postForm(`https://open.kuaishou.com/openapi/photo/start_upload?${q}`, {});
        const startData = asRecord(start.data);
        if (Number(startData?.result) !== 1) {
          return { ok: false, code: 'PLATFORM_REJECTED', error: `发起上传失败: ${asString(startData?.error) || 'result != 1'}`, raw: start.data };
        }
        const uploadToken = asString(startData?.upload_token);
        const endpoint = asString(startData?.endpoint);
        if (!uploadToken || !endpoint) {
          return { ok: false, code: 'PLATFORM_REJECTED', error: '发起上传未返回 upload_token/endpoint', raw: start.data };
        }

        // 2. 直传视频二进制（≤10M 单传；大文件分片留待按需补）
        const video = await downloadBytes(videoUrl);
        const up = await postBinary(
          `http://${endpoint}/api/upload?upload_token=${encodeURIComponent(uploadToken)}`,
          video.bytes,
          video.contentType,
        );
        const upData = asRecord(up.data);
        if (Number(upData?.result) !== 1) {
          return { ok: false, code: 'PLATFORM_REJECTED', error: `视频上传失败: ${asString(upData?.error) || 'result != 1'}`, raw: up.data };
        }

        // 3. 发布（封面文件 + caption）
        const cover = await downloadBytes(coverUrl);
        const caption = [input.title, input.content].filter(Boolean).join(' ').slice(0, _spec.content_max);
        const pub = await postMultipart(
          `https://open.kuaishou.com/openapi/photo/publish?${q}&upload_token=${encodeURIComponent(uploadToken)}`,
          { caption },
          [{ field: 'cover', filename: cover.filename, bytes: cover.bytes, contentType: cover.contentType }],
        );
        const pubData = asRecord(pub.data);
        if (Number(pubData?.result) !== 1) {
          return { ok: false, code: 'PLATFORM_REJECTED', error: `发布失败: ${asString(pubData?.error) || 'result != 1'}`, raw: pub.data };
        }
        const info = asRecord(pubData?.video_info);
        return {
          ok: true,
          external_id: asString(info?.photo_id),
          raw: { photo_id: asString(info?.photo_id), pending: info?.pending ?? null },
        };
      } catch (e) {
        return { ok: false, code: 'NETWORK_ERROR', error: (e as Error).message };
      }
    },
  };
}
