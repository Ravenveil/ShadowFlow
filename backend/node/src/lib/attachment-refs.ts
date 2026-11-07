/**
 * attachment-refs.ts — 用户消息随行附件的 LLM 引用块（2026-11-07 拖拽传图）。
 *
 * LLM transport 的 user prompt 是纯文本（ContentBlock 无 image block），所以
 * 传图的语义是：文件落盘 + 在 prompt 里引用绝对路径 —— agent 的 read_file /
 * CLI executor（claude code 等可从路径看图）据此访问附件。
 *
 * 仅注入执行侧（runSkillAssembler 的 goal）；timeline 的 user_turn.text 保持
 * 用户原文，附件用结构化字段渲染缩略图，两不相扰。
 */
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
