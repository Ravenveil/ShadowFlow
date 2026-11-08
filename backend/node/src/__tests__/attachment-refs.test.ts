/**
 * attachment-refs.test.ts — 用户附件 LLM 引用块单测（2026-11-07 拖拽传图）。
 *
 * 覆盖：
 *   - attachmentPromptBlock：无附件 → ''；头行计数；图片/文件类型段；无 size 省略
 *   - goalWithAttachments：goal+块拼接（空 goal 只出块、无附件原样返回 goal）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

// ── 图片字节注入（2026-11-08 视觉注入，修草拟"盲写"）─────────────────────────

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PARTS,
  readAttachmentImages,
  skippedImagesNote,
  sniffImageMime,
} from '../lib/attachment-refs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = Buffer.from('GIF89a....', 'binary');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('VP8 ')]);
const BMP = Buffer.from('BM......', 'binary');

describe('sniffImageMime — magic-byte 探测', () => {
  it.each([
    ['png', PNG, 'image/png'],
    ['jpeg', JPEG, 'image/jpeg'],
    ['gif', GIF, 'image/gif'],
    ['webp', WEBP, 'image/webp'],
    ['bmp', BMP, 'image/bmp'],
  ])('%s → %s', (_n, buf, mime) => {
    expect(sniffImageMime(buf)).toBe(mime);
  });

  it('识别不出 → null（不看扩展名）', () => {
    expect(sniffImageMime(Buffer.from('hello world'))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('readAttachmentImages — 真实字节 → base64（fail-soft）', () => {
  let dir = '';
  const at = (name: string, path: string): UserAttachment => ({
    name,
    path,
    url: '',
    is_image: true,
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sf-vision-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('PNG/JPEG 真实字节注入：mime 探测 + base64 编码', async () => {
    const p1 = join(dir, 'a.png');
    const p2 = join(dir, '无标题.jpg'); // 文件名零内容线索，magic bytes 说了算
    await writeFile(p1, PNG);
    await writeFile(p2, JPEG);
    const { parts, skipped } = await readAttachmentImages([at('a.png', p1), at('无标题.jpg', p2)]);
    expect(skipped).toEqual([]);
    expect(parts).toEqual([
      { media_type: 'image/png', data: PNG.toString('base64') },
      { media_type: 'image/jpeg', data: JPEG.toString('base64') },
    ]);
  });

  it('假 .png（垃圾字节）不注入 → skipped（不发必被 400 的载荷）', async () => {
    const p = join(dir, 'fake.png');
    await writeFile(p, Buffer.from('this is not an image at all'));
    const { parts, skipped } = await readAttachmentImages([at('fake.png', p)]);
    expect(parts).toEqual([]);
    expect(skipped).toEqual(['fake.png']);
  });

  it('BMP（非 wire 格式）跳过注入进 skipped；非图附件不进注入也不进 skipped', async () => {
    const p = join(dir, 'x.bmp');
    await writeFile(p, BMP);
    const doc: UserAttachment = { name: 'b.pdf', path: '/nope/b.pdf', url: '', is_image: false };
    const { parts, skipped } = await readAttachmentImages([at('x.bmp', p), doc]);
    expect(parts).toEqual([]);
    expect(skipped).toEqual(['x.bmp']);
  });

  it('超 4MB 跳过；文件不存在/空路径 fail-soft 进 skipped', async () => {
    const big = join(dir, 'big.png');
    await writeFile(big, Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES + 1)]));
    const { parts, skipped } = await readAttachmentImages([
      at('big.png', big),
      at('gone.png', join(dir, 'gone.png')),
      at('empty.png', '  '),
    ]);
    expect(parts).toEqual([]);
    expect(skipped).toEqual(['big.png', 'gone.png', 'empty.png']);
  });

  it('上限 9 张：第 10 张进 skipped', async () => {
    const atts: UserAttachment[] = [];
    for (let i = 0; i < MAX_IMAGE_PARTS + 1; i++) {
      const p = join(dir, `i${i}.png`);
      await writeFile(p, PNG);
      atts.push(at(`i${i}.png`, p));
    }
    const { parts, skipped } = await readAttachmentImages(atts);
    expect(parts).toHaveLength(MAX_IMAGE_PARTS);
    expect(skipped).toEqual([`i${MAX_IMAGE_PARTS}.png`]);
  });

  it('无附件/undefined → 空结果', async () => {
    expect(await readAttachmentImages(undefined)).toEqual({ parts: [], skipped: [] });
    expect(await readAttachmentImages([])).toEqual({ parts: [], skipped: [] });
  });
});

describe('skippedImagesNote — 未送达注记', () => {
  it('无跳过 → 空串（零噪音）', () => {
    expect(skippedImagesNote([])).toBe('');
    expect(skippedImagesNote(undefined as unknown as string[])).toBe('');
  });
  it('有跳过 → 点名 + 不许虚构', () => {
    const note = skippedImagesNote(['a.png', 'b.png']);
    expect(note).toContain('a.png、b.png');
    expect(note).toContain('无法读取其内容');
    expect(note).toContain('不得虚构');
  });
});
