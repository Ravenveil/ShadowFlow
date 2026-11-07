/**
 * attachments.ts — 对话框拖拽传图的前端共享工具（2026-11-07）。
 *
 * 链路：NeoComposer 拖拽/点选文件 → attachments state（本地预览）→ 提交时
 * uploadPendingAttachments 上传到 POST /api/fs/chat-upload → 补上 path/url 的
 * AttachedFile 随 payload 下发：
 *   - run 会话（NeoChat）：结构化 attachments 走 run-sessions POST，timeline
 *     user_turn 渲染缩略图；LLM 侧由服务端把路径引用块注入 goal（干净分割，
 *     消息原文不掺引用行）。
 *   - 群聊（NeoGroupChat）：消息 content 直接拼引用块（Python 网关不改），
 *     本地气泡同样能渲染缩略图。
 */
import type { AttachedFile } from '../components/composer/UnifiedComposer';
import type { UserAttachment } from '../components/run-session/timeline/types';
import { uploadChatAttachment } from '../api/fsFiles';

export type { UserAttachment };

/** 单文件上限：对齐后端 chat-upload 的 MAX_UPLOAD_BYTES。 */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
/** 一次消息最多附件数（与服务端 coerceAttachments 同限）。 */
export const MAX_ATTACHMENT_COUNT = 9;

/** 字节数显示（1.2MB / 300KB / 512B）。非法输入（NaN/负数/非数）回落 ''。 */
export function fmtAttachmentSize(size?: number): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 附件引用块（群聊消息 content 用；run 会话由服务端注入 goal，不用此函数）。
 * 每个附件一行 `- name (图片, 1.2MB) 路径: <abs path>`；无附件返回 ''。
 */
export function formatAttachmentRefs(attachments: AttachedFile[]): string {
  const withPath = attachments.filter((a) => a.path);
  if (withPath.length === 0) return '';
  const lines = withPath.map((a) => {
    const kind = a.isImage ? '图片' : '文件';
    const size = fmtAttachmentSize(a.size);
    return `- ${a.label} (${kind}${size ? `, ${size}` : ''}) 路径: ${a.path}`;
  });
  return `[用户上传了 ${withPath.length} 个附件，可用工具读取这些绝对路径]\n${lines.join('\n')}`;
}

/** 提交体结构化附件（run-sessions POST attachments 字段）。只收已上传项。 */
export function toUserAttachments(attachments: AttachedFile[]): UserAttachment[] {
  return attachments
    .filter((a): a is AttachedFile & { path: string; url: string } => Boolean(a.path && a.url))
    .map((a) => ({
      name: a.label,
      path: a.path,
      url: a.url,
      is_image: a.isImage === true,
      size: a.size,
    }));
}

/**
 * 上传所有带本地文件且尚未上传的附件（并行）。返回补上 path/url/size 的新
 * 数组（已上传项原样保留）。任何一项失败即抛出（composer 错误条展示、草稿
 * 与附件保留可重试）。
 */
export async function uploadPendingAttachments(
  attachments: AttachedFile[],
): Promise<AttachedFile[]> {
  return Promise.all(
    attachments.map(async (a) => {
      if (!a.file || a.path) return a;
      const up = await uploadChatAttachment(a.file);
      return {
        ...a,
        path: up.path,
        url: up.url,
        size: up.size,
        isImage: a.isImage ?? (a.file.type.startsWith('image/') || undefined),
      };
    }),
  );
}

/** 回收附件本地预览 URL（removeAttachment / 提交成功 / 卸载时调用）。 */
export function revokeAttachmentPreviews(attachments: AttachedFile[]): void {
  for (const a of attachments) {
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
  }
}
