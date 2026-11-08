/**
 * attachment-refs.ts — 用户消息随行附件的 LLM 引用块 + 图片字节注入（2026-11-07
 * 拖拽传图；2026-11-08 视觉注入修草拟"盲写"）。
 *
 * 两层语义（并存，不是二选一）：
 *   1. **路径引用块**（纯文本）：在 prompt 里引用绝对路径——CLI executor
 *      （claude code 等可从路径看图）与工具型 agent 据此访问附件；
 *   2. **图片字节注入**（readAttachmentImages）：is_image 附件的真实字节
 *      （base64）进模型消息的 image 块——OpenAI-compat 翻译成 image_url
 *      data URI，让 API 型多模态模型**真的看到图**（此前 ContentBlock 无
 *      image 态，模型只收到路径文本 → 草拟环节"盲写"编造画面的根因）。
 *
 * 仅注入执行侧（runSkillAssembler 的 goal / groups-chat 的 turn）；timeline 的
 * user_turn.text 保持用户原文，附件用结构化字段渲染缩略图，两不相扰。
 */
import { readFile, stat } from 'node:fs/promises';
import type { UserAttachment } from './contracts';

function fmtSize(size?: number): string {
  if (typeof size !== 'number' || size < 0) return '';
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 生成附件引用块。无附件返回 ''（调用方原样拼 goal，零行为变化）。
 * 每个附件一行：`- name (图片, 1.2MB) 路径: <abs path>`。
 */
export function attachmentPromptBlock(attachments?: UserAttachment[]): string {
  if (!attachments || attachments.length === 0) return '';
  const lines = attachments.map((a) => {
    const kind = a.is_image ? '图片' : '文件';
    const size = fmtSize(a.size);
    return `- ${a.name} (${kind}${size ? `, ${size}` : ''}) 路径: ${a.path}`;
  });
  return `[用户上传了 ${attachments.length} 个附件，可用工具读取这些绝对路径]\n${lines.join('\n')}`;
}

/** goal + 附件引用块（无附件时原样返回 goal）。 */
export function goalWithAttachments(goal: string, attachments?: UserAttachment[]): string {
  const block = attachmentPromptBlock(attachments);
  if (!block) return goal;
  return goal ? `${goal}\n\n${block}` : block;
}

// ── 图片字节注入（2026-11-08 视觉注入）────────────────────────────────────────

/** 单图注入上限：超过 4MB 跳过（不降采样——避免引入图像处理依赖，fail-soft）。 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** 单次 turn 最多注入图片数（与 craft_posts.images 上限 9 对齐）。 */
export const MAX_IMAGE_PARTS = 9;

/** base64 图片内容（与 transport/LlmCallable.LlmImageContent 同形，零耦合）。 */
export interface AttachmentImagePart {
  media_type: string;
  data: string;
}

/** 可注入的 wire MIME（Anthropic base64 图 / OpenAI image_url 都只认这四种）。
 *  其他格式（BMP/HEIC 等）跳过注入、走「未送达」注记——不发必被 400 的载荷。 */
const WIRE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Magic-byte MIME 探测（唯一判据，不看扩展名：文件名可能是"无标题.png"这类
 * 壳，反过来假 .png 垃圾也不许混进模型消息）。只认常见位图格式；识别不出
 * 返回 null（调用方跳过 + 注记）。
 */
export function sniffImageMime(buf: Uint8Array): string | null {
  const b = (i: number) => (i < buf.length ? buf[i] : -1);
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  // GIF: "GIF87a" / "GIF89a"
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return 'image/gif';
  // BMP: "BM"
  if (b(0) === 0x42 && b(1) === 0x4d) return 'image/bmp';
  // WEBP: "RIFF"...."WEBP"
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return 'image/webp';
  }
  return null;
}

/**
 * 读 is_image 附件的真实字节 → base64 图片内容（供 LlmCallableTurnInput.images）。
 *
 * fail-soft 纪律（每一项都不抛、只进 skipped）：
 *   - is_image !== true 的附件跳过（非图不注入）；
 *   - 文件不存在 / 读失败 / 大小超 MAX_IMAGE_BYTES / 无法识别图片格式 → 跳过；
 *   - 超过 MAX_IMAGE_PARTS 张只取前 N 张。
 * skipped 返回被跳过附件的 name，调用方拼注记文本（模型侧「看不到图必须明说」
 * 硬规则的输入）。
 */
export async function readAttachmentImages(
  attachments?: UserAttachment[],
): Promise<{ parts: AttachmentImagePart[]; skipped: string[] }> {
  const parts: AttachmentImagePart[] = [];
  const skipped: string[] = [];
  for (const a of attachments ?? []) {
    if (!a?.is_image) continue;
    const name = (a.name ?? '').trim() || (a.path ?? '') || '(未命名图片)';
    if (parts.length >= MAX_IMAGE_PARTS) {
      skipped.push(name);
      continue;
    }
    try {
      const p = (a.path ?? '').trim();
      if (!p) throw new Error('empty path');
      const st = await stat(p);
      if (!st.isFile() || st.size > MAX_IMAGE_BYTES) {
        skipped.push(name);
        continue;
      }
      const buf = await readFile(p);
      if (buf.length > MAX_IMAGE_BYTES) {
        skipped.push(name);
        continue;
      }
      // MIME 判据只认 magic bytes（假 .png 垃圾不进模型消息）；非 wire 格式跳过。
      const mime = sniffImageMime(buf);
      if (!mime || !WIRE_MIMES.has(mime)) {
        skipped.push(name);
        continue;
      }
      parts.push({ media_type: mime, data: buf.toString('base64') });
    } catch {
      skipped.push(name);
    }
  }
  return { parts, skipped };
}

/**
 * 跳过注记（拼进 prompt）：让模型知道哪几张图没送达——硬规则下它必须声明
 * 「无法读取图片内容」而不是对着空气编造。无跳过返回 ''（零噪音）。
 */
export function skippedImagesNote(skipped: string[]): string {
  if (!skipped || skipped.length === 0) return '';
  return (
    `\n\n[图片注入说明] 以下图片未能随消息送达（过大/格式不支持/读取失败），` +
    `无法读取其内容：${skipped.join('、')}。不得虚构这些图片的画面。`
  );
}
