/**
 * attachment-refs.test.ts — 用户附件 LLM 引用块单测（2026-11-07 拖拽传图）。
 *
 * 覆盖：
 *   - attachmentPromptBlock：无附件 → ''；头行计数；图片/文件类型段；无 size 省略
 *   - goalWithAttachments：goal+块拼接（空 goal 只出块、无附件原样返回 goal）
 */
import { describe, it, expect } from 'vitest';
import { attachmentPromptBlock, goalWithAttachments } from '../lib/attachment-refs';
import type { UserAttachment } from '../lib/contracts';

const img: UserAttachment = {
  name: 'a.png',
  path: '/abs/_uploads/s1/a.png',
  url: '/projects/_uploads/s1/a.png',
  is_image: true,
  size: 1024 * 1024,
};
const pdf: UserAttachment = {
  name: 'b.pdf',
  path: '/abs/_uploads/s2/b.pdf',
  url: '/projects/_uploads/s2/b.pdf',
  is_image: false,
};

describe('attachmentPromptBlock', () => {
  it('无附件（undefined / 空数组）→ 空串', () => {
    expect(attachmentPromptBlock(undefined)).toBe('');
    expect(attachmentPromptBlock([])).toBe('');
  });

  it('单附件：头行 + 「- 名 (图片, 1.0MB) 路径: <abs>」', () => {
    const block = attachmentPromptBlock([img]);
    const lines = block.split('\n');
    expect(lines[0]).toBe('[用户上传了 1 个附件，可用工具读取这些绝对路径]');
    expect(lines[1]).toBe('- a.png (图片, 1.0MB) 路径: /abs/_uploads/s1/a.png');
  });

  it('多附件计数正确；无 size 省略大小段；文件类标「文件」', () => {
    const lines = attachmentPromptBlock([img, pdf]).split('\n');
    expect(lines[0]).toBe('[用户上传了 2 个附件，可用工具读取这些绝对路径]');
    expect(lines[1]).toContain('(图片, 1.0MB)');
    expect(lines[2]).toBe('- b.pdf (文件) 路径: /abs/_uploads/s2/b.pdf');
  });
});

describe('goalWithAttachments', () => {
  it('goal + 块：双换行拼接', () => {
    const out = goalWithAttachments('分析这张图', [img]);
    expect(out.startsWith('分析这张图\n\n[用户上传了 1 个附件')).toBe(true);
  });

  it('goal 为空 → 只出块', () => {
    expect(goalWithAttachments('', [img])).toBe(attachmentPromptBlock([img]));
  });

  it('无附件 → goal 原样返回（零行为变化）', () => {
    expect(goalWithAttachments('普通任务', undefined)).toBe('普通任务');
    expect(goalWithAttachments('普通任务', [])).toBe('普通任务');
    expect(goalWithAttachments('', undefined)).toBe('');
  });
});
