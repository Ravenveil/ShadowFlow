/**
 * attachments.test.ts — 拖拽传图前端共享工具单测（2026-11-07 附件链路）。
 *
 * 覆盖：
 *   - fmtAttachmentSize：B/KB/MB 三段 + 非法输入回落 ''
 *   - formatAttachmentRefs：群聊 content 引用块格式 / 未上传项过滤 / 空 → ''
 *   - toUserAttachments：只收已上传项（path+url），字段映射（is_image 归布尔）
 *   - uploadPendingAttachments：并行上传未上传项、已上传项原样保留、失败抛错
 *   - revokeAttachmentPreviews：只回收有 previewUrl 的项
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AttachedFile } from '../../components/composer/UnifiedComposer';

const uploadMock = vi.fn();
vi.mock('../../api/fsFiles', () => ({
  uploadChatAttachment: (...args: unknown[]) => uploadMock(...args),
}));

import {
  fmtAttachmentSize,
  formatAttachmentRefs,
  toUserAttachments,
  uploadPendingAttachments,
  revokeAttachmentPreviews,
  deriveAttachmentUrl,
  parseAttachmentRefs,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
} from '../attachments';

const att = (over: Partial<AttachedFile> = {}): AttachedFile => ({
  id: over.id ?? `att_${Math.random().toString(36).slice(2)}`,
  type: 'file',
  label: 'a.png',
  ...over,
});

describe('fmtAttachmentSize', () => {
  it('B / KB / MB 三段显示', () => {
    expect(fmtAttachmentSize(512)).toBe('512B');
    expect(fmtAttachmentSize(300 * 1024)).toBe('300KB');
    expect(fmtAttachmentSize(1024 * 1024)).toBe('1.0MB');
    expect(fmtAttachmentSize(1.5 * 1024 * 1024)).toBe('1.5MB');
  });

  it('非法输入（undefined / 负数）→ 空串', () => {
    expect(fmtAttachmentSize(undefined)).toBe('');
    expect(fmtAttachmentSize(-1)).toBe('');
    expect(fmtAttachmentSize(NaN)).toBe('');
  });
});

describe('formatAttachmentRefs', () => {
  it('无附件 / 全部未上传 → 空串', () => {
    expect(formatAttachmentRefs([])).toBe('');
    expect(formatAttachmentRefs([att({ label: 'x' })])).toBe('');
  });

  it('已上传项出引用块：头行 + 每项一行「- 名 (类型, 大小) 路径: <abs>」', () => {
    const refs = formatAttachmentRefs([
      att({ label: 'a.png', path: '/up/a.png', url: '/projects/_uploads/s/a.png', isImage: true, size: 1024 * 1024 }),
      att({ label: 'b.pdf', path: '/up/b.pdf', url: '/projects/_uploads/s/b.pdf', isImage: false, size: 2048 }),
      att({ label: 'pending.txt' }), // 未上传，不进引用块
    ]);
    const lines = refs.split('\n');
    expect(lines[0]).toBe('[用户上传了 2 个附件，可用工具读取这些绝对路径]');
    expect(lines[1]).toBe('- a.png (图片, 1.0MB) 路径: /up/a.png');
    expect(lines[2]).toBe('- b.pdf (文件, 2KB) 路径: /up/b.pdf');
  });

  it('无 size 的附件省略大小段', () => {
    const refs = formatAttachmentRefs([
      att({ label: 'c.txt', path: '/up/c.txt', url: '/u/c.txt' }),
    ]);
    expect(refs).toContain('- c.txt (文件) 路径: /up/c.txt');
  });
});

describe('toUserAttachments', () => {
  it('只收已上传项（path+url 齐全），字段映射为提交体', () => {
    const out = toUserAttachments([
      att({ label: 'a.png', path: '/up/a.png', url: '/u/a.png', isImage: true, size: 100 }),
      att({ label: 'b.pdf', path: '/up/b.pdf', url: '/u/b.pdf' }),
      att({ label: 'pending.bin' }),
      att({ label: 'half.png', path: '/up/half.png' }), // 缺 url 不收
    ]);
    expect(out).toEqual([
      { name: 'a.png', path: '/up/a.png', url: '/u/a.png', is_image: true, size: 100 },
      { name: 'b.pdf', path: '/up/b.pdf', url: '/u/b.pdf', is_image: false, size: undefined },
    ]);
  });

  it('isImage 非 true 一律归 false', () => {
    const out = toUserAttachments([att({ label: 'x', path: '/p', url: '/u' })]);
    expect(out[0].is_image).toBe(false);
  });
});

describe('uploadPendingAttachments', () => {
  // 必须块状体：mockReset() 返回 stub 本体，表达式体箭头会把它注册成 vitest 的
  // 清理钩子（beforeEach 返回函数 = afterTest cleanup），测试后被无参再调一次。
  beforeEach(() => {
    uploadMock.mockReset();
  });

  it('并行上传带 file 且未上传项，返回补上 path/url/size 的新数组', async () => {
    uploadMock.mockImplementation(async (f: File) => ({
      path: `/up/${f.name}`,
      name: f.name,
      size: f.size,
      url: `/projects/_uploads/s/${f.name}`,
    }));
    const f1 = new File(['x'], 'a.png', { type: 'image/png' });
    const f2 = new File(['y'], 'b.pdf', { type: 'application/pdf' });
    const done = att({ label: 'c.txt', path: '/up/c.txt', url: '/u/c.txt', size: 3 });

    const out = await uploadPendingAttachments([
      att({ label: 'a.png', file: f1, isImage: true }),
      att({ label: 'b.pdf', file: f2 }),
      done,
    ]);

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(out[0]).toMatchObject({ label: 'a.png', path: '/up/a.png', url: '/projects/_uploads/s/a.png', isImage: true });
    expect(out[1]).toMatchObject({ label: 'b.pdf', path: '/up/b.pdf' });
    // isImage 三态：未显式标注且 MIME 非图片 → undefined（区别于显式 false）
    expect(out[1].isImage).toBeUndefined();
    // 已上传项原样保留（同一引用语义，字段不动）
    expect(out[2]).toEqual(done);
  });

  it('无待传项（全已上传 / 无 file）时不动 upload', async () => {
    const out = await uploadPendingAttachments([
      att({ path: '/p', url: '/u', size: 1 }),
      att({ label: 'no-file' }),
    ]);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(out).toHaveLength(2);
  });

  it('任一上传失败即抛错（composer 错误条展示、草稿保留可重试）', async () => {
    // 惰性拒绝：mockRejectedValue 在部分版本会产生 eager 未处理拒绝
    uploadMock.mockImplementation(() => Promise.reject(new Error('网络断开')));
    await expect(
      uploadPendingAttachments([att({ label: 'a.png', file: new File(['x'], 'a.png') })]),
    ).rejects.toThrow('网络断开');
  });
});

describe('revokeAttachmentPreviews', () => {
  it('只回收有 previewUrl 的项', () => {
    // jsdom 无 revokeObjectURL——直接赋值 stub（spyOn 会炸）。
    const orig = URL.revokeObjectURL;
    const spy = vi.fn();
    URL.revokeObjectURL = spy as unknown as typeof URL.revokeObjectURL;
    try {
      revokeAttachmentPreviews([
        att({ previewUrl: 'blob:a' }),
        att({ label: 'b' }),
        att({ previewUrl: 'blob:c' }),
      ]);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      URL.revokeObjectURL = orig;
    }
  });
});

describe('上限常量', () => {
  it('8MB / 9 个（与服务端 coerceAttachments 同限）', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_ATTACHMENT_COUNT).toBe(9);
  });
});

// ── 群聊历史回放反解析（2026-11-07 修复「我上传了图片，应该显示图片」）────

describe('deriveAttachmentUrl', () => {
  it('Windows 落盘路径 → /projects 直链（中文/特殊字符文件名 encode）', () => {
    expect(
      deriveAttachmentUrl('D:\\repo\\backend\\node\\.shadowflow\\projects\\_uploads\\abc123-x7y8z9\\头绳.jpg'),
    ).toBe(`/projects/_uploads/abc123-x7y8z9/${encodeURIComponent('头绳.jpg')}`);
    expect(
      deriveAttachmentUrl('/home/u/proj/.shadowflow/projects/_uploads/s1/my photo.png'),
    ).toBe(`/projects/_uploads/s1/${encodeURIComponent('my photo.png')}`);
  });

  it('非 _uploads 树 / 残缺路径 → null（渲染端回落文件 chip）', () => {
    expect(deriveAttachmentUrl('D:\\elsewhere\\a.png')).toBeNull();
    expect(deriveAttachmentUrl('/x/projects/_uploads/lonely')).toBeNull();
    expect(deriveAttachmentUrl('')).toBeNull();
  });
});

describe('parseAttachmentRefs', () => {
  it('标准引用块 → 剥离正文 + 结构化附件（与 formatAttachmentRefs 互逆）', () => {
    const refs = formatAttachmentRefs([
      att({ label: '头绳.jpg', path: 'D:\\p\\.shadowflow\\projects\\_uploads\\s1\\头绳.jpg', url: '/u/1', isImage: true, size: 113 * 1024 }),
      att({ label: 'b.pdf', path: '/p/.shadowflow/projects/_uploads/s2/b.pdf', url: '/u/2', size: 2048 }),
    ]);
    const text = `看看这个\n\n${refs}`;
    const out = parseAttachmentRefs(text);
    expect(out.text).toBe('看看这个');
    expect(out.attachments).toEqual([
      {
        name: '头绳.jpg',
        path: 'D:\\p\\.shadowflow\\projects\\_uploads\\s1\\头绳.jpg',
        url: `/projects/_uploads/s1/${encodeURIComponent('头绳.jpg')}`,
        is_image: true,
        size: 113 * 1024,
      },
      {
        name: 'b.pdf',
        path: '/p/.shadowflow/projects/_uploads/s2/b.pdf',
        url: '/projects/_uploads/s2/b.pdf',
        is_image: false,
        size: 2048,
      },
    ]);
  });

  it('无引用块 / 空文本 → 原样返回，附件空', () => {
    expect(parseAttachmentRefs('就这个头绳')).toEqual({ text: '就这个头绳', attachments: [] });
    expect(parseAttachmentRefs('')).toEqual({ text: '', attachments: [] });
  });

  it('无 size 行、非 _uploads 路径、纯引用块消息', () => {
    const out = parseAttachmentRefs(
      '[用户上传了 1 个附件，可用工具读取这些绝对路径]\n- c.txt (文件) 路径: /elsewhere/c.txt',
    );
    expect(out.text).toBe('');
    expect(out.attachments).toEqual([
      { name: 'c.txt', path: '/elsewhere/c.txt', url: '', is_image: false },
    ]);
  });

  it('用户手打的相似文字不误剥（头行/条目行格式必须严格匹配）', () => {
    const fake = '[用户上传了 2 个附件]\n- 假的 (图片) 路径: x';
    expect(parseAttachmentRefs(fake)).toEqual({ text: fake, attachments: [] });
  });
});
