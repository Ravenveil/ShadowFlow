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
    // 环境守卫：jsdom 等无 URL.revokeObjectURL（卸载清理时序无关，防御性跳过）。
    if (a.previewUrl && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(a.previewUrl);
    }
  }
}

/* ── 群聊历史回放：附件引用块反解析（2026-11-07 修复「我上传了图片，应该
   显示图片」）───────────────────────────────────────────────────────────
   群聊/DM 路径的消息 content 是 formatAttachmentRefs 拼出的引用块（Python
   网关消息模型不动），timeline 的 user_turn 没有结构化 attachments —— 渲染
   端从 text 反解析出附件并派生 /projects 直链缩略图，正文只显用户文字。
   与 formatAttachmentRefs 严格互逆；run 会话 user_turn（结构化 attachments、
   text 干净）走 msg.attachments 分支，不进这里（零回归）。 */

/**
 * 从 chat-upload 绝对落盘路径派生 /projects 静态直链（与 fs-browse.ts
 * chat-upload 的 url 生成互逆）：`<cwd>/.shadowflow/projects/_uploads/<subdir>/<file>`
 * → `/projects/_uploads/<subdir>/<encodeURIComponent(file)>`。
 * 非 _uploads 树的路径返回 null（渲染端回落文件 chip，不出缩略图）。
 */
export function deriveAttachmentUrl(absPath: string): string | null {
  const norm = absPath.replace(/\\/g, '/');
  const marker = '/projects/_uploads/';
  const at = norm.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = norm.slice(at + marker.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const subdir = parts[0];
  const filename = parts.slice(1).join('/');
  return `/projects/_uploads/${subdir}/${encodeURIComponent(filename)}`;
}

/** fmtAttachmentSize 输出（512B / 113KB / 1.2MB）→ 字节数（反解析，可选字段）。 */
function parseSizeToken(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const m = /^([0-9.]+)(B|KB|MB)$/.exec(token.trim());
  if (!m) return undefined;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(m[2] === 'B' ? n : m[2] === 'KB' ? n * 1024 : n * 1024 * 1024);
}

/** 引用块头行（formatAttachmentRefs 的固定开头）。 */
const ATTACH_REF_HEADER_RE = /^\[用户上传了 \d+ 个附件，可用工具读取这些绝对路径\]$/;
/** 引用块条目行：`- name (图片|文件[, size]) 路径: <abs path>`。 */
const ATTACH_REF_LINE_RE = /^- (.+?) \((图片|文件)(?:, ([0-9.]+(?:B|KB|MB)))?\) 路径: (.+)$/;

export interface ParsedAttachmentRefs {
  /** 剥离引用块后的正文（原 text 无引用块时原样返回）。 */
  text: string;
  /** 反解析出的随行附件；url 派生失败时为空串（渲染端回落文件 chip）。 */
  attachments: UserAttachment[];
}

/**
 * 消息正文里的附件引用块 → 结构化附件 + 干净正文（纯函数，可单测）。
 * 只认 formatAttachmentRefs 的严格格式，避免误剥用户手打的相似文字。
 */
export function parseAttachmentRefs(text: string): ParsedAttachmentRefs {
  if (!text || !text.includes('[用户上传了')) return { text, attachments: [] };
  const keep: string[] = [];
  const attachments: UserAttachment[] = [];
  let inBlock = false;
  for (const line of text.split('\n')) {
    if (ATTACH_REF_HEADER_RE.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      const m = ATTACH_REF_LINE_RE.exec(line);
      if (m) {
        const size = parseSizeToken(m[3]);
        attachments.push({
          name: m[1],
          path: m[4],
          url: deriveAttachmentUrl(m[4]) ?? '',
          is_image: m[2] === '图片',
          ...(size !== undefined ? { size } : {}),
        });
        continue;
      }
      inBlock = false; // 引用块到此为止，本行回落正文
    }
    keep.push(line);
  }
  return {
    text: keep.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    attachments,
  };
}
