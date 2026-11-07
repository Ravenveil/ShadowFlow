/**
 * social-platforms/real-wechat-mp.ts — 微信公众号真实发布链（2026-11-07）。
 *
 * 官方链路（developers.weixin.qq.com，均服务器端调用）：
 *   1. GET  /cgi-bin/token?grant_type=client_credential&appid&secret → access_token（7200s，缓存）
 *   2. POST /cgi-bin/material/add_material?type=image（multipart media）→ 封面永久素材 media_id
 *   3. POST /cgi-bin/media/uploadimg（multipart media）→ 正文内图片 URL
 *   4. POST /cgi-bin/draft/add  {articles:[...]} → 草稿 media_id
 *   5. POST /cgi-bin/freepublish/submit {media_id} → publish_id（异步，最终结果以
 *      freepublish/get 或 PUBLISHJOBFINISH 回调为准）
 *
 * 凭证：SP_WECHAT_MP_APP_ID + SP_WECHAT_MP_APP_SECRET（client_credential 换 token）；
 * 服务商代发布可直接给 SP_WECHAT_MP_ACCESS_TOKEN（authorizer_access_token）覆盖。
 * 公众号图文必须有封面图 → media[0] 为封面；media[1..] 上传为正文插图。
 */

import { downloadBytes, getJson, postJson, postMultipart, asRecord, asString } from './http';
import type { PlatformAdapter, PlatformSpec, PublishReceipt } from './types';

const BASE = 'https://api.weixin.qq.com/cgi-bin';

interface MpEnv {
  appId: string;
  appSecret: string;
  tokenOverride: string;
}

function readEnv(): MpEnv {
  return {
    appId: (process.env.SP_WECHAT_MP_APP_ID ?? '').trim(),
    appSecret: (process.env.SP_WECHAT_MP_APP_SECRET ?? '').trim(),
    tokenOverride: (process.env.SP_WECHAT_MP_ACCESS_TOKEN ?? '').trim(),
  };
}

/** token 缓存：同 appid 7200s 内复用，避免每次发布都换 token 触发频控。 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(env: MpEnv): Promise<string> {
  const cached = tokenCache.get(env.appId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const res = await getJson(
    `${BASE}/token?grant_type=client_credential&appid=${encodeURIComponent(env.appId)}&secret=${encodeURIComponent(env.appSecret)}`,
  );
  const d = asRecord(res.data);
  const token = asString(d?.access_token);
  if (!token) {
    throw new Error(`公众号 access_token 获取失败: ${asString(d?.errmsg) || `HTTP ${res.status}`}`);
  }
  const ttl = typeof d?.expires_in === 'number' ? d.expires_in : 7200;
  // 提前 5 分钟过期，避免边界时刻用到将废的 token
  tokenCache.set(env.appId, { token, expiresAt: Date.now() + (ttl - 300) * 1000 });
  return token;
}

function paragraphs(content: string): string {
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${line}</p>`)
    .join('');
}

function apiErr(data: unknown): string | null {
  const d = asRecord(data);
  const errcode = typeof d?.errcode === 'number' ? d.errcode : 0;
  return errcode ? asString(d?.errmsg) || `errcode ${errcode}` : null;
}

export function createWechatMpAdapter(spec: PlatformSpec): PlatformAdapter {
  return {
    platform: spec.id,
    mode: 'real',
    async publish(_postId, input): Promise<PublishReceipt> {
      const env = readEnv();
      if (!env.tokenOverride && (!env.appId || !env.appSecret)) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error:
            '缺少环境变量 SP_WECHAT_MP_APP_ID / SP_WECHAT_MP_APP_SECRET' +
            '（或服务商代发布直接给 SP_WECHAT_MP_ACCESS_TOKEN）',
        };
      }
      if (!input.media[0]) {
        return {
          ok: false,
          code: 'NEED_COVER_ASSET',
          error: '公众号图文必须有封面图：请把封面图放在 media[0]',
        };
      }
      try {
        const token = env.tokenOverride || (await getAccessToken(env));

        // 1. 封面永久素材
        const cover = await downloadBytes(input.media[0]);
        const coverRes = await postMultipart(
          `${BASE}/material/add_material?access_token=${encodeURIComponent(token)}&type=image`,
          {},
          [{ field: 'media', filename: cover.filename, bytes: cover.bytes, contentType: cover.contentType }],
        );
        const coverErr = apiErr(coverRes.data);
        if (coverErr) return { ok: false, code: 'PLATFORM_REJECTED', error: `封面素材上传失败: ${coverErr}`, raw: coverRes.data };
        const thumbMediaId = asString(asRecord(coverRes.data)?.media_id);
        if (!thumbMediaId) {
          return { ok: false, code: 'PLATFORM_REJECTED', error: '封面素材上传未返回 media_id', raw: coverRes.data };
        }

        // 2. 正文插图（失败不阻断，正文仍可发）
        let html = paragraphs(input.content);
        for (const url of input.media.slice(1)) {
          try {
            const img = await downloadBytes(url);
            const imgRes = await postMultipart(
              `${BASE}/media/uploadimg?access_token=${encodeURIComponent(token)}`,
              {},
              [{ field: 'media', filename: img.filename, bytes: img.bytes, contentType: img.contentType }],
            );
            const imgUrl = asString(asRecord(imgRes.data)?.url);
            if (imgUrl) html += `<p><img src="${imgUrl}" /></p>`;
          } catch {
            /* 单图失败继续 */
          }
        }

        // 3. 草稿
        const title = input.title || input.content.slice(0, 16) || '手作上新';
        const draftRes = await postJson(`${BASE}/draft/add?access_token=${encodeURIComponent(token)}`, {
          articles: [
            {
              title: title.slice(0, spec.title_max || 64),
              author: '',
              digest: input.content.slice(0, 54).replace(/\n/g, ' '),
              content: html,
              content_source_url: '',
              thumb_media_id: thumbMediaId,
              show_cover_pic: 1,
              need_open_comment: 1,
              only_fans_can_comment: 0,
            },
          ],
        });
        const draftErr = apiErr(draftRes.data);
        if (draftErr) return { ok: false, code: 'PLATFORM_REJECTED', error: `草稿创建失败: ${draftErr}`, raw: draftRes.data };
        const draftId = asString(asRecord(draftRes.data)?.media_id);
        if (!draftId) {
          return { ok: false, code: 'PLATFORM_REJECTED', error: '草稿创建未返回 media_id', raw: draftRes.data };
        }

        // 4. 提交发布（异步：errcode=0 仅表示任务提交成功）
        const pubRes = await postJson(`${BASE}/freepublish/submit?access_token=${encodeURIComponent(token)}`, {
          media_id: draftId,
        });
        const pubErr = apiErr(pubRes.data);
        if (pubErr) return { ok: false, code: 'PLATFORM_REJECTED', error: `发布提交失败: ${pubErr}`, raw: pubRes.data };
        const publishId = asString(asRecord(pubRes.data)?.publish_id);
        return {
          ok: true,
          external_id: publishId,
          raw: {
            publish_id: publishId,
            msg_data_id: asString(asRecord(pubRes.data)?.msg_data_id),
            draft_media_id: draftId,
            note: '发布任务已提交（异步），最终结果以 freepublish/get 或 PUBLISHJOBFINISH 回调为准',
          },
        };
      } catch (e) {
        return { ok: false, code: 'NETWORK_ERROR', error: (e as Error).message };
      }
    },
  };
}
