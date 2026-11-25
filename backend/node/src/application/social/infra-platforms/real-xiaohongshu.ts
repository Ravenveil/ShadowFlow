/**
 * social-platforms/real-xiaohongshu.ts — 小红书真实发布链（2026-11-07）。
 *
 * 官方开放平台（open.xiaohongshu.com，OAuth2.0 授权码模式，需企业资质 + 申请
 * 「笔记发布」权限——审核较严）：
 *   1. 上传图片：POST /api/v1/upload/image（Authorization: Bearer，multipart file）
 *      → file_id
 *   2. 发布笔记：POST /api/v1/note/publish
 *      JSON {title, content, images: [file_id...]} → data.note_id
 *   统一响应信封 {code, message, data}。
 *
 * 凭证：SP_XHS_ACCESS_TOKEN（授权码/refresh_token 换得的 access_token，约 2h 有效，
 * 由运营方续期填入）。端点按开放平台文档命名，若平台侧路径调整仅需改本文件。
 */

import { downloadBytes, postJson, postMultipart, asRecord, asString } from './http';
import type { PlatformAdapter, PlatformSpec, PublishReceipt } from './types';

const BASE = 'https://open.xiaohongshu.com/api/v1';
const AUTH = () => ({ authorization: `Bearer ${(process.env.SP_XHS_ACCESS_TOKEN ?? '').trim()}` });

/** 统一信封成功判定：code 0/200 或 success=true。 */
function envelopeError(data: unknown): string | null {
  const d = asRecord(data);
  if (!d) return '响应无法解析';
  if (d.success === true) return null;
  const code = d.code;
  if (code === 0 || code === 200) return null;
  return asString(d.message) || `小红书错误码 ${String(code ?? 'unknown')}`;
}

export function createXiaohongshuAdapter(_spec: PlatformSpec): PlatformAdapter {
  return {
    platform: _spec.id,
    mode: 'real',
    async publish(_postId, input): Promise<PublishReceipt> {
      const token = (process.env.SP_XHS_ACCESS_TOKEN ?? '').trim();
      if (!token) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error:
            '缺少环境变量 SP_XHS_ACCESS_TOKEN（小红书开放平台 OAuth2 access_token，' +
            '需企业资质开通「笔记发布」权限后由授权码/refresh_token 换取）',
        };
      }
      try {
        // 1. 逐图上传拿 file_id
        const fileIds: string[] = [];
        for (const url of input.media) {
          const img = await downloadBytes(url);
          const up = await postMultipart(
            `${BASE}/upload/image`,
            {},
            [{ field: 'file', filename: img.filename, bytes: img.bytes, contentType: img.contentType }],
            AUTH(),
          );
          const err = envelopeError(up.data);
          if (err) return { ok: false, code: 'PLATFORM_REJECTED', error: `图片上传失败: ${err}`, raw: up.data };
          const fileId = asString(asRecord(asRecord(up.data)?.data)?.file_id) || asString(asRecord(up.data)?.file_id);
          if (!fileId) return { ok: false, code: 'PLATFORM_REJECTED', error: '图片上传未返回 file_id', raw: up.data };
          fileIds.push(fileId);
        }

        // 2. 发布笔记
        const res = await postJson(
          `${BASE}/note/publish`,
          { title: input.title, content: input.content, images: fileIds },
          AUTH(),
        );
        const err = envelopeError(res.data);
        if (err) return { ok: false, code: 'PLATFORM_REJECTED', error: `笔记发布失败: ${err}`, raw: res.data };
        const data = asRecord(res.data);
        const noteId = asString(asRecord(data?.data)?.note_id) || asString(data?.note_id);
        return { ok: true, external_id: noteId, raw: res.data };
      } catch (e) {
        return { ok: false, code: 'NETWORK_ERROR', error: (e as Error).message };
      }
    },
  };
}
