/**
 * NeoComposerKnowledgeNav.test.tsx — 知识库管理入口导航（2026-11-07）。
 *
 * 背景：知识库保持侧边栏（tmp1CE1 截图回归）。NeoComposer 知识 chip 弹层的
 * 「管理知识库/新建知识包」原先直接 navigate('/knowledge') 跳独立全页路由，
 * 脱离 NeoApp 壳 → NeoRail 侧边栏整条消失。改为壳内优先走 NeoApp 透传的
 * onNavigate({view:'knowledge'})（中栏内嵌知识页，rail 常驻），独立路由页
 * 无 NeoApp 壳时回落 react-router navigate（与 /inspect → {view:'runs'}
 * 同款模式）。
 *
 * 覆盖：
 *   - 壳内（onNavigate 提供）：管理知识库入口 → onNavigate({view:'knowledge'})，不 navigate
 *   - 壳内：空知识包「新建知识包」入口 → 同上
 *   - 独立路由页（无 onNavigate）：回落 navigate('/knowledge')
 *   - 点击入口后知识弹层收起
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const mkPack = (id: string) => ({ pack_id: id, name: `知识包 ${id}`, description: '' });

describe('NeoComposer — 知识库管理入口导航（知识库保持侧边栏）', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    listPacksMock.mockReset();
    localStorage.clear();
  });

  it('壳内：点「管理知识库」→ onNavigate({view:"knowledge"})，不跳出壳', async () => {
    listPacksMock.mockResolvedValue({ data: { packs: [mkPack('p1')] }, meta: {} });
    const onNavigate = vi.fn();
    render(<NeoComposer onSubmit={() => {}} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('start-knowledge-chip'));
    await waitFor(() => expect(screen.getByTestId('start-knowledge-manage')).toBeTruthy());
    fireEvent.click(screen.getByTestId('start-knowledge-manage'));
    expect(onNavigate).toHaveBeenCalledWith({ view: 'knowledge' });
    expect(navigateMock).not.toHaveBeenCalled();
    // 弹层收起
    expect(screen.queryByTestId('start-knowledge-manage')).toBeNull();
  });

  it('壳内：空知识包 → 点「新建知识包」→ onNavigate({view:"knowledge"})', async () => {
    listPacksMock.mockResolvedValue({ data: { packs: [] }, meta: {} });
    const onNavigate = vi.fn();
    render(<NeoComposer onSubmit={() => {}} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('start-knowledge-chip'));
    await waitFor(() => expect(screen.getByTestId('start-knowledge-create')).toBeTruthy());
    fireEvent.click(screen.getByTestId('start-knowledge-create'));
    expect(onNavigate).toHaveBeenCalledWith({ view: 'knowledge' });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('start-knowledge-create')).toBeNull();
  });

  it('独立路由页（无 onNavigate）：回落 navigate("/knowledge")', async () => {
    listPacksMock.mockResolvedValue({ data: { packs: [mkPack('p1')] }, meta: {} });
    render(<NeoComposer onSubmit={() => {}} />);
    fireEvent.click(screen.getByTestId('start-knowledge-chip'));
    await waitFor(() => expect(screen.getByTestId('start-knowledge-manage')).toBeTruthy());
    fireEvent.click(screen.getByTestId('start-knowledge-manage'));
    expect(navigateMock).toHaveBeenCalledWith('/knowledge');
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
