/**
 * SettingsPage — 记忆折叠批（2026-11-06）契约测试。
 *
 * 记忆模块不再占左栏一级导航，整体并入「设置 → 记忆」：
 *   - 分组内四个分区：记忆条目 / 记忆画像 / 交接与写回 / 河流记忆；
 *   - `#memory-*` 深链直达（/memory 旧链由 AppRoutes 重定向到这里）；
 *   - 记忆条目复用 MemoryPage 的 settings 形态（不再重复挂画像/交接区块）。
 *
 * 记忆组件本身的行为由各自 test 覆盖，这里只钉「入口与映射」。
 */
import { render, screen, fireEvent } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../MemoryPage', () => ({
  default: ({ settings }: { settings?: boolean }) => (
    <div data-testid="memory-entries-section" data-settings={String(!!settings)} />
  ),
}));
vi.mock('../MemoryProfilePanel', () => ({
  default: () => <div data-testid="memory-profile-section" />,
}));
vi.mock('../MemoryHandoffPanel', () => ({
  default: () => <div data-testid="memory-handoff-section" />,
}));
vi.mock('../../core/components/settings/MemorySection', () => ({
  MemorySection: () => <div data-testid="memory-river-section" />,
}));

import SettingsPage from './index';

function renderAt(hash: string) {
  window.location.hash = hash;
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.location.hash = '';
});

describe('SettingsPage — 记忆分组（折叠批）', () => {
  it('记忆分组下四个分区入口齐全', () => {
    renderAt('#memory-entries');
    const group = screen.getByText('记忆', { selector: '.hf-label' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '记忆条目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '记忆画像' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '交接与写回' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '河流记忆' })).toBeInTheDocument();
  });

  it('#memory-entries 深链 → 记忆条目用 settings 形态渲染（/memory 旧链落点）', () => {
    renderAt('#memory-entries');
    const pane = screen.getByTestId('memory-entries-section');
    expect(pane).toBeInTheDocument();
    expect(pane).toHaveAttribute('data-settings', 'true');
  });

  it('#memory-profile / #memory-handoff / #memory-river 各自命中对应分区', () => {
    const v1 = renderAt('#memory-profile');
    expect(screen.getByTestId('memory-profile-section')).toBeInTheDocument();
    v1.unmount();

    const v2 = renderAt('#memory-handoff');
    expect(screen.getByTestId('memory-handoff-section')).toBeInTheDocument();
    v2.unmount();

    renderAt('#memory-river');
    expect(screen.getByTestId('memory-river-section')).toBeInTheDocument();
  });

  it('点导航项切换分区（条目录像交接互不串台）', () => {
    renderAt('#memory-entries');
    fireEvent.click(screen.getByRole('button', { name: '交接与写回' }));
    expect(screen.getByTestId('memory-handoff-section')).toBeInTheDocument();
    expect(screen.queryByTestId('memory-entries-section')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#memory-handoff');
  });
});
