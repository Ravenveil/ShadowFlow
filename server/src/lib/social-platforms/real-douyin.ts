/**
 * social-platforms/real-douyin.ts — 抖音真实发布链（2026-11-07）。
 *
 * 官方链路（open.douyin.com，需申请能力实验室「代替用户发布内容到抖音」
 * scope video.create.bind + 用户授权；发布后有审核期，期间仅自己可见）：
 *   1. 上传视频：POST /api/douyin/v1/video/upload_video/?open_id=
 *      header access-token，multipart field=video → data.video.video_id（加密）
 *   2. 投稿：POST /api/douyin/v1/video/create_video/?open_id=
 *      header access-token，JSON {video_id, text} → data.item_id
 *
 * 凭证：SP_DOUYIN_ACCESS_TOKEN + SP_DOUYIN_OPEN_ID。
 * 抖音是视频平台：真实发布需要视频素材——media 里第一个视频 URL 会被拉取上传；
 * 纯图文帖返回 NEED_VIDEO_ASSET（后续接视频生成再补齐）。
 */

import { downloadBytes, postJson, postMultipart, asRecord, asString } from './http';
import type { PlatformAdapter, PlatformSpec, PublishReceipt } from './types';

const BASE = 'https://open.douyin.com/api/douyin/v1';

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

/** 抖音错误在 data.error_code / extra.error_code 两层都可能出现。 */
function douyinError(data: unknown): string | null {
  const d = asRecord(data);
  const inner = asRecord(d?.data);
  const extra = asRecord(d?.extra);
  for (const layer of [inner, extra]) {
    const code = layer ? Number(layer.error_code) : NaN;
    if (code && code !== 0) {
      return asString(layer?.description) || asString(layer?.sub_description) || `错误码 ${code}`;
    }
  }
  return null;
}

export function createDouyinAdapter(_spec: PlatformSpec): PlatformAdapter {
  return {
    platform: _spec.id,
    mode: 'real',
    async publish(_postId, input): Promise<PublishReceipt> {
      const token = (process.env.SP_DOUYIN_ACCESS_TOKEN ?? '').trim();
      const openId = (process.env.SP_DOUYIN_OPEN_ID ?? '').trim();
      if (!token || !openId) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error: '缺少环境变量 SP_DOUYIN_ACCESS_TOKEN / SP_DOUYIN_OPEN_ID（抖音开放平台用户授权）',
        };
      }
      const videoUrl = findVideoUrl(mediaOrEmpty(input.media));
      if (!videoUrl) {
        return {
          ok: false,
          code: 'NEED_VIDEO_ASSET',
          error: '抖音真实发布需要视频素材：请在 media 中提供 .mp4 等视频 URL',
        };
      }
      try {
        // 1. 上传视频
        const video = await downloadBytes(videoUrl);
        const up = await postMultipart(
          `${BASE}/video/upload_video/?open_id=${encodeURIComponent(openId)}`,
          {},
          [{ field: 'video', filename: video.filename.endsWith('.mp4') ? video.filename : 'video.mp4', bytes: video.bytes, contentType: video.contentType }],
          { 'access-token': token },
        );
        const upErr = douyinError(up.data);
        if (upErr) return { ok: false, code: 'PLATFORM_REJECTED', error: `视频上传失败: ${upErr}`, raw: up.data };
        const videoId = asString(asRecord(asRecord(up.data)?.data)?.video ? asRecord(asRecord(asRecord(up.data)?.data)?.video)?.video_id : '');
        if (!videoId) return { ok: false, code: 'PLATFORM_REJECTED', error: '视频上传未返回 video_id', raw: up.data };

        // 2. 投稿（文案 = 标题 + 正文）
        const text = [input.title, input.content].filter(Boolean).join(' ').slice(0, _spec.content_max);
        const create = await postJson(
          `${BASE}/video/create_video/?open_id=${encodeURIComponent(openId)}`,
          { video_id: videoId, text },
          { 'access-token': token },
        );
        const createErr = douyinError(create.data);
        if (createErr) return { ok: false, code: 'PLATFORM_REJECTED', error: `视频投稿失败: ${createErr}`, raw: create.data };
        const data = asRecord(asRecord(create.data)?.data);
        const itemId = asString(data?.item_id) || videoId;
        return {
          ok: true,
          external_id: itemId,
          raw: { item_id: itemId, video_id: videoId, note: '发布后有审核期，期间仅自己可见' },
        };
      } catch (e) {
        return { ok: false, code: 'NETWORK_ERROR', error: (e as Error).message };
      }
    },
  };
}

function mediaOrEmpty(media: string[] | undefined): string[] {
  return Array.isArray(media) ? media : [];
}
