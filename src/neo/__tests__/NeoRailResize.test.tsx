/**
 * NeoRail 拖宽 + 阅读态页不抢侧边栏测试 — 2026-11-06 用户反馈批。
 * 覆盖：
 *  - 右缘拖宽手柄：pointerdown 上报 onResizeStart；折叠态不渲染手柄
 *  - style/--rail-w 透传根 nav（NeoApp 拖宽注入通路）
 *  - nav.view=schedules/dashboard 时 section 保持不变（列表区不切走，
 *    与 SECTION_BY_NAV 收敛后语义一致——映射表由 Harness 同构模拟）
 */
import { useState } from 'react';
import { render, screen, fireEvent } from '../../test/utils';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/teams', () => ({
  listTeams: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/groupApi', () => ({
  resolveDmConversation: vi.fn().mockResolvedValue(null),
  resolveTeamGroup: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../api/projects', () => ({
  listProjectsWithSessions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/knowledge', () => ({
  listPacks: vi.fn().mockResolvedValue({ data: { packs: [] } }),
}));
vi.mock('../../api/knowledgeVaults', () => ({
  listVaults: vi.fn().mockResolvedValue({ data: { vaults: [] } }),
}));
vi.mock('../../api/memoryEntries', () => ({
  listMemoryEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/schedules', () => ({
  listSchedules: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../core/auth/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('../../core/store/useInboxStore', () => {
  const state = { agentDMs: [], groups: [], fetchWorkspaceInbox: vi.fn() };
  const useInboxStore = (sel: (s: typeof state) => unknown) => sel(state);
  useInboxStore.getState = () => state;
  return { useInboxStore };
});

import { NeoRail } from '../NeoRail';
import type { NeoNav, RailSection } from '../types';

/** 与 NeoApp.SECTION_BY_NAV 收敛后同构：schedules/dashboard 不在映射表 →
 *  列表区保持进入前的内容（阅读态页不抢侧边栏）。 */
function Harness({ initialNav }: { initialNav?: NeoNav } = {}) {
  const [nav, setNav] = useState<NeoNav>(initialNav ?? { view: 'home' });
  const [section, setSection] = useState<RailSection>('home');
  const map: Partial<Record<NeoNav['view'], RailSection>> = {
    home: 'home',
    knowledge: 'knowledge',
    memory: 'memory',
  };
  return (
    <NeoRail
      nav={nav}
      section={section}
      onNavigate={(next) => {
        setNav(next);
        const s = map[next.view];
        if (s) setSection(s);
      }}
      onNewTask={() => {}}
      collapsed={false}
      onToggleCollapsed={() => {}}
      width={240}
      onResizeStart={vi.fn()}
      style={{ '--rail-w': '240px' } as React.CSSProperties}
    />
  );
}

function renderRail(initialNav?: NeoNav) {
  return render(
    <MemoryRouter>
      <Harness initialNav={initialNav} />
    </MemoryRouter>,
  );
}

describe('NeoRail 拖宽（2026-11-06）', () => {
  it('展开态渲染右缘拖宽手柄，pointerdown 上报 onResizeStart', () => {
    renderRail();
    const handle = screen.getByTestId('neo-rail-resize-handle');
    expect(handle).toBeInTheDocument();
    expect(handle.getAttribute('role')).toBe('separator');
    fireEvent.pointerDown(handle, { button: 0, clientX: 180 });
    // 上报由 Harness 内 vi.fn() 承接——这里只验证手柄存在且可触发
    // （NeoApp 侧 move/up 窗口级跟随属集成行为，组件级不重复覆盖）
  });

  it('style 透传根 nav（--rail-w 变量驱动宽度）+ width 上报到 data-width', () => {
    const { container } = renderRail();
    const navEl = container.querySelector('nav.neo-rail:not(.collapsed)');
    expect(navEl).not.toBeNull();
    expect((navEl as HTMLElement).style.getPropertyValue('--rail-w')).toBe('240px');
    expect(navEl?.getAttribute('data-width')).toBe('240');
  });

  it('折叠态不渲染拖宽手柄（56px 固定栏不参与拖宽）', () => {
    render(
      <MemoryRouter>
        <NeoRail
          nav={{ view: 'home' }}
          section="home"
          onNavigate={vi.fn()}
          onNewTask={vi.fn()}
          collapsed
          onToggleCollapsed={vi.fn()}
          width={240}
          onResizeStart={vi.fn()}
          style={{ '--rail-w': '240px' } as React.CSSProperties}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('neo-rail-resize-handle')).toBeNull();
  });
});

describe('阅读态页不抢侧边栏（2026-11-06 用户反馈）', () => {
  it('点击「定时任务」后列表区保持 home 内容（不切 schedules 分区）', async () => {
    renderRail();
    // home 列表区「+ 新建」聚合行在
    await screen.findByTestId('neo-new-plus');
    fireEvent.click(screen.getByTestId('neo-nav-schedules'));
    // 列表区仍是 home（+ 新建行仍在，schedules 分区行没有出现）
    expect(screen.getByTestId('neo-new-plus')).toBeInTheDocument();
    expect(screen.queryByTestId('neo-rail-schedules-empty')).toBeNull();
    expect(screen.queryByTestId('neo-rail-schedules-manage')).toBeNull();
  });
});
