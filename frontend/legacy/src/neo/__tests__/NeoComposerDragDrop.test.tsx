/**
 * NeoComposerDragDrop.test.tsx — 对话框拖拽/点选传图传文件（2026-11-07）。
 *
 * 链路：拖文件进卡片（或纸夹按钮点选）→ attachments chips（图片本地缩略图）
 * → 发送时 uploadPendingAttachments 上传补 path/url → onSubmit(payload.attachments)
 * 随消息下发；纯附件可发送；上传失败保留草稿可重试。
 *
 * 覆盖：
 *   - 拖入文件 → 出附件 chip（label=文件名）；图片出 .neo-cp-attach-thumb 缩略图
 *   - 同名同大小重复拖入去重
 *   - 超 8MB → toast「文件超过 8MB」且不进附件
 *   - 点选入口（start-file-input）同样入附件
 *   - 纯附件（无文字）可发送，payload.attachments 带 path/url/size（上传 mock）
 *   - 提交成功清空附件并回收本地预览；移除单个 chip 回收其 previewUrl
 *   - 上传失败 → 错误条，草稿与附件保留
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NeoComposer } from '../NeoComposer';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const listPacksMock = vi.fn();
vi.mock('../../api/memoryBank', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/memoryBank')>();
  return {
    ...actual,
    listPacks: (...args: unknown[]) => listPacksMock(...args),
  };
});

// ModelPicker 挂载即 prewarm（fetchPicker* 走网络）——mock 免网络。
vi.mock('../../common/constants/modelPicker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../common/constants/modelPicker')>();
  return {
    ...actual,
    fetchPickerCliItems: async () => [],
    fetchPickerApiItems: async () => [],
  };
});

vi.mock('../../common/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../common/i18n')>();
  const t = (
    _key: string,
    opts?: { defaultValue?: string } & Record<string, unknown>,
  ): string => {
    let s = opts?.defaultValue ?? _key;
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        if (k === 'defaultValue') continue;
        s = s.replaceAll(`{{${k}}}`, String(v));
      }
    }
    return s;
  };
  return {
    ...actual,
    i18n: { language: 'zh', changeLanguage: async () => 'zh' },
    useI18n: () => ({ t, language: 'zh' }),
  };
});

// 上传端点打桩：提交链路 uploadPendingAttachments → uploadChatAttachment。
const uploadMock = vi.fn();
vi.mock('../../api/fsFiles', () => ({
  uploadChatAttachment: (...args: unknown[]) => uploadMock(...args),
}));

/** jsdom 无 URL.createObjectURL / revokeObjectURL——直接赋值 stub（spyOn 会炸）。
 *  全文件常驻（afterAll 才恢复）：RTL cleanup 的 unmount 在 afterEach 链后段才跑，
 *  其间恢复成 undefined 会让组件卸载回收预览时炸 TypeError。 */
const origCreateObjectURL = URL.createObjectURL;
const origRevokeObjectURL = URL.revokeObjectURL;
let createObjectURLSpy: ReturnType<typeof vi.fn>;
let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

const mkFile = (name: string, type: string, sizeOverride?: number): File => {
  const f = new File(['x'], name, { type });
  if (typeof sizeOverride === 'number') {
    Object.defineProperty(f, 'size', { value: sizeOverride });
  }
  return f;
};

/** 拖放事件的 dataTransfer 最小形态（dragHasFiles 读 files / types）。 */
const dropFiles = (files: File[]) => ({
  dataTransfer: { files, types: ['Files'] },
});

beforeAll(() => {
  createObjectURLSpy = vi.fn(() => `blob:mock-${Math.random().toString(36).slice(2)}`);
  revokeObjectURLSpy = vi.fn();
  URL.createObjectURL = createObjectURLSpy as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURLSpy as unknown as typeof URL.revokeObjectURL;
});

afterAll(() => {
  URL.createObjectURL = origCreateObjectURL;
  URL.revokeObjectURL = origRevokeObjectURL;
});

beforeEach(() => {
  listPacksMock.mockReset();
  uploadMock.mockReset();
  localStorage.clear();
  createObjectURLSpy.mockClear();
  revokeObjectURLSpy.mockClear();
});

describe('NeoComposer — 拖拽/点选传图传文件', () => {
  it('拖入图片 → 出附件 chip + 本地缩略图', () => {
    render(<NeoComposer onSubmit={() => {}} />);
    fireEvent.drop(screen.getByTestId('unified-composer'), dropFiles([
      mkFile('photo.png', 'image/png', 2048),
    ]));
    const chips = screen.getAllByTestId('start-attachment-file');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain('photo.png');
    // 图片出本地缩略图（URL.createObjectURL 预览）
    expect(chips[0].querySelector('.neo-cp-attach-thumb')).toBeTruthy();
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  });

  it('拖入普通文件 → chip 出文件名与大小，不出缩略图', () => {
    render(<NeoComposer onSubmit={() => {}} />);
    fireEvent.drop(screen.getByTestId('unified-composer'), dropFiles([
      mkFile('report.pdf', 'application/pdf', 3 * 1024),
    ]));
    const chip = screen.getByTestId('start-attachment-file');
    expect(chip.textContent).toContain('report.pdf');
    expect(chip.textContent).toContain('3KB');
    expect(chip.querySelector('.neo-cp-attach-thumb')).toBeNull();
  });

  it('同名同大小重复拖入去重', () => {
    render(<NeoComposer onSubmit={() => {}} />);
    const card = screen.getByTestId('unified-composer');
    fireEvent.drop(card, dropFiles([mkFile('a.png', 'image/png', 100)]));
    fireEvent.drop(card, dropFiles([mkFile('a.png', 'image/png', 100)]));
    expect(screen.getAllByTestId('start-attachment-file')).toHaveLength(1);
  });

  it('超 8MB → toast「文件超过 8MB」且不进附件', () => {
    render(<NeoComposer onSubmit={() => {}} />);
    fireEvent.drop(screen.getByTestId('unified-composer'), dropFiles([
      mkFile('big.zip', 'application/zip', 9 * 1024 * 1024),
    ]));
    expect(screen.queryByTestId('start-attachment-file')).toBeNull();
    expect(screen.getByTestId('start-toast').textContent).toContain('文件超过 8MB');
  });

  it('纸夹按钮点选入口（start-file-input）同样入附件', () => {
    render(<NeoComposer onSubmit={() => {}} />);
    const input = screen.getByTestId('start-file-input');
    fireEvent.change(input, { target: { files: [mkFile('note.txt', 'text/plain', 10)] } });
    expect(screen.getByTestId('start-attachment-file').textContent).toContain('note.txt');
  });

  it('纯附件（无文字）可发送，payload.attachments 带 path/url/size', async () => {
    uploadMock.mockImplementation(async (f: File) => ({
      path: `/abs/_uploads/s1/${f.name}`,
      name: f.name,
      size: f.size,
      url: `/projects/_uploads/s1/${f.name}`,
    }));
    const onSubmit = vi.fn();
    render(<NeoComposer onSubmit={onSubmit} />);
    fireEvent.drop(screen.getByTestId('unified-composer'), dropFiles([
      mkFile('photo.png', 'image/png', 2048),
    ]));
    fireEvent.click(screen.getByTestId('start-submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '',
        attachments: [
          expect.objectContaining({
            label: 'photo.png',
            path: '/abs/_uploads/s1/photo.png',
            url: '/projects/_uploads/s1/photo.png',
            size: 2048,
            isImage: true,
          }),
        ],
      }),
    );
    // 提交成功：附件清空 + 本地预览回收
    await waitFor(() => expect(screen.queryByTestId('start-attachment-file')).toBeNull());
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it('文字 + 附件一起发送；已上传项不重复上传', async () => {
    uploadMock.mockResolvedValue({ path: '/abs/p.png', name: 'p.png', size: 8, url: '/projects/_uploads/s/p.png' });
    const onSubmit = vi.fn();
    render(<NeoComposer onSubmit={onSubmit} />);
    fireEvent.drop(screen.getByTestId('unified-composer'), dropFiles([
      mkFile('p.png', 'image/png', 8),
    ]));
    fireEvent.change(screen.getByTestId('start-composer'), {
      target: { value: '看下这张图' },
    });
    fireEvent.click(screen.getByTestId('start-submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.text).toBe('看下这张图');
    expect(payload.attachments[0]).toMatchObject({ label: 'p.png', path: '/abs/p.png' });
  });

  it('上传失败 → 错误条展示，草稿与附件保留可重试', async () => {
    uploadMock.mockImplementation(() => Promise.reject(new Error('网络断开')));
    const onSubmit = vi.fn();
    render(<NeoComposer onSubmit={onSubmit} />);
    fireEvent.drop(screen.getByTestId('unified-composer'), dropFiles([
      mkFile('a.png', 'image/png', 10),
    ]));
    fireEvent.change(screen.getByTestId('start-composer'), {
      target: { value: '重试我' },
    });
    fireEvent.click(screen.getByTestId('start-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('composer-submit-error').textContent).toContain('网络断开'),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('start-attachment-file')).toBeTruthy();
    expect((screen.getByTestId('start-composer') as HTMLTextAreaElement).value).toBe('重试我');
  });

  it('移除单个附件 chip → 移出列表并回收其本地预览', () => {
    render(<NeoComposer onSubmit={() => {}} />);
    fireEvent.drop(screen.getByTestId('unified-composer'), dropFiles([
      mkFile('a.png', 'image/png', 10),
      mkFile('b.txt', 'text/plain', 10),
    ]));
    const chips = screen.getAllByTestId('start-attachment-file');
    expect(chips).toHaveLength(2);
    // 移除第一个（a.png，带缩略图）
    fireEvent.click(chips[0].querySelector('.neo-cp-attach-x') as HTMLElement);
    const left = screen.getAllByTestId('start-attachment-file');
    expect(left).toHaveLength(1);
    expect(left[0].textContent).toContain('b.txt');
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
  });
});
