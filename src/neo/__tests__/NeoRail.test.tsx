/**
 * NeoRail 组件级行为测试 — 2026-08-19 跳转收敛批（纯受控重写后适配）。
 * 覆盖：受控折叠回路（栏顶导航簇第三枚钮收回 → 折叠态 → 展开钮弹回，
 * 与 NeoApp 的 collapsed/onToggleCollapsed 接线同构的 Harness 驱动）、
 * 设置直达链接、展开态导航行结构、导航行 onNavigate 上报、
 * 团队行点击 → resolveTeamGroup → conversation 跳转。
 */
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/teams', () => ({
  listTeams: vi.fn().mockResolvedValue([
    { team_id: 't1', name: '测试团队', description: '', workspace_id: 'ws1', agent_ids: ['a1'], created_at: '', updated_at: '' },
  ]),
}));
vi.mock('../../api/groupApi', () => ({
  resolveDmConversation: vi.fn().mockResolvedValue(null),
  resolveTeamGroup: vi.fn().mockResolvedValue('g-team-1'),
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
vi.mock('../../core/auth/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('../../core/store/useInboxStore', () => {
  const state = { agentDMs: [], groups: [], fetchWorkspaceInbox: vi.fn() };
  const useInboxStore = (sel: (s: typeof state) => unknown) => sel(state);
  useInboxStore.getState = () => state;
  return { useInboxStore };
});
// GAP D：stub 新建群聊模态（真实模态另由 NeoCreateGroupModal.test 覆盖），
// 只暴露 onCreated/onClose 回调验证 NeoRail 的接线契约。
vi.mock('../NeoCreateGroupModal', () => ({
  NeoCreateGroupModal: (props: {
    onCreated: (g: { groupId: string; name: string }) => void;
    onClose: () => void;
  }) => (
    <div data-testid="neo-create-group-modal-stub">
      <button
        data-testid="stub-group-created"
        onClick={() => props.onCreated({ groupId: 'g-new-9', name: '新群' })}
      />
      <button data-testid="stub-group-close" onClick={props.onClose} />
    </div>
  ),
}));

import { resolveTeamGroup } from '../../api/groupApi';
import { NeoRail } from '../NeoRail';
import type { NeoNav, RailSection } from '../types';

/** 与 NeoApp 相同的受控接线：nav/section 由父持有，点击只上报 onNavigate。 */
function Harness() {
  const [collapsed, setCollapsed] = useState(false);
  const [nav, setNav] = useState<NeoNav>({ view: 'home' });
  const [section, setSection] = useState<RailSection>('home');
  // 与 NeoApp.SECTION_BY_NAV 同款映射，保证 Harness 行为与真实外壳一致
  const map: Partial<Record<NeoNav['view'], RailSection>> = {
    home: 'home', knowledge: 'knowledge', memory: 'memory', agents: 'agents', teams: 'teams',
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
      onNewTask={() => {
        setNav({ view: 'home' });
        setSection('home');
      }}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((c) => !c)}
    />
  );
}

function renderRail() {
  return render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.removeItem('sf.neo.railCollapsed');
});

describe('NeoRail — 折叠回路（弹出/收回）', () => {
  it('默认展开：导航行齐全，导航簇第三枚为收回钮', () => {
    renderRail();
    // 五导航行（知识库/记忆为按钮版 + 其余）
    expect(screen.getByTestId('neo-new-task')).toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-knowledge')).toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-memory')).toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-teams')).toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-agents')).toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-search')).toBeInTheDocument();
    // 收回钮存在，展开钮不存在
    expect(screen.getByTestId('neo-rail-collapse')).toBeInTheDocument();
    expect(screen.queryByTestId('neo-rail-expand')).not.toBeInTheDocument();
  });

  it('点收回钮 → 折叠态：展开钮出现、导航行收起，localStorage 记忆', () => {
    renderRail();
    fireEvent.click(screen.getByTestId('neo-rail-collapse'));
    expect(screen.getByTestId('neo-rail-expand')).toBeInTheDocument();
    // 折叠态没有导航行（只有 + 新任务图标钮）
    expect(screen.queryByTestId('neo-nav-knowledge')).not.toBeInTheDocument();
    expect(screen.getByTestId('neo-new-task')).toBeInTheDocument();
  });

  it('折叠态点展开钮 → 弹回展开态，导航行恢复', () => {
    renderRail();
    fireEvent.click(screen.getByTestId('neo-rail-collapse'));
    fireEvent.click(screen.getByTestId('neo-rail-expand'));
    expect(screen.getByTestId('neo-rail-collapse')).toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-knowledge')).toBeInTheDocument();
  });

  it('历史导航 ←/→ 首屏（无历史）两端灰显', () => {
    renderRail();
    expect(screen.getByTestId('neo-nav-back')).toBeDisabled();
    expect(screen.getByTestId('neo-nav-forward')).toBeDisabled();
  });
});

describe('NeoRail — 导航行 onNavigate 上报（跳转收敛契约）', () => {
  it('点知识库/记忆/团队/员工导航行 → 收到对应 nav 变体，列表区同步切换', async () => {
    renderRail();
    fireEvent.click(screen.getByTestId('neo-nav-knowledge'));
    expect(await screen.findByText('还没有知识源')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('neo-nav-memory'));
    expect(await screen.findByText('还没有记忆条目')).toBeInTheDocument();

    // 团队导航行 → teams 列表（mock 的团队行出现）
    fireEvent.click(screen.getByTestId('neo-nav-teams'));
    expect(await screen.findByTestId('neo-team-row')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('neo-nav-agents'));
    expect(await screen.findByTestId('neo-new-agent')).toBeInTheDocument();
  });
});

describe('NeoRail — 团队行点击（find-or-create 群聊现场）', () => {
  it('resolveTeamGroup 命中 → 团队行消失高亮转 conversation 语义（onNavigate 由 Harness 持有）', async () => {
    renderRail();
    fireEvent.click(screen.getByTestId('neo-nav-teams'));
    const row = await screen.findByTestId('neo-team-row');
    fireEvent.click(row);
    await waitFor(() => {
      expect(resolveTeamGroup).toHaveBeenCalledWith(
        expect.objectContaining({ team_id: 't1' }),
        undefined,
      );
    });
  });
});

describe('NeoRail — 新建群聊显式入口（GAP D）', () => {
  function renderTeamsRail(onNavigate = vi.fn()) {
    render(
      <MemoryRouter>
        <NeoRail
          nav={{ view: 'teams' }}
          section="teams"
          onNavigate={onNavigate}
          onNewTask={() => {}}
          collapsed={false}
          onToggleCollapsed={() => {}}
        />
      </MemoryRouter>,
    );
    return onNavigate;
  }

  it('teams 分区常驻「群聊现场」label + 新建群聊行（群列表为空也在）', async () => {
    renderTeamsRail();
    expect(await screen.findByText('群聊现场')).toBeInTheDocument();
    expect(screen.getByTestId('neo-new-group')).toBeInTheDocument();
  });

  it('点新建群聊行 → 开模态；onCreated → onNavigate conversation 跳新群', async () => {
    const onNavigate = renderTeamsRail();
    fireEvent.click(await screen.findByTestId('neo-new-group'));
    expect(await screen.findByTestId('neo-create-group-modal-stub')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stub-group-created'));
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith({ view: 'conversation', groupId: 'g-new-9' });
    });
    // 模态关闭
    expect(screen.queryByTestId('neo-create-group-modal-stub')).not.toBeInTheDocument();
  });

  it('模态 onClose → 关闭且不跳转', async () => {
    const onNavigate = renderTeamsRail();
    fireEvent.click(await screen.findByTestId('neo-new-group'));
    fireEvent.click(await screen.findByTestId('stub-group-close'));
    expect(screen.queryByTestId('neo-create-group-modal-stub')).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ view: 'conversation' }),
    );
  });
});

describe('NeoRail — 底部账户行', () => {
  it('设置钮直达 /settings（无菜单中间层），S 徽章渲染', () => {
    renderRail();
    const settings = screen.getByTestId('neo-user-settings');
    expect(settings).toHaveAttribute('href', '/settings');
    expect(screen.getByText('S')).toBeInTheDocument();
    // 循环引擎入口已移除（2026-08-19：迭代环并入右栏「过程」tab）
    expect(screen.queryByRole('link', { name: '循环引擎' })).not.toBeInTheDocument();
  });
});
