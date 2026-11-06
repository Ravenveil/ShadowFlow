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

import { NeoRail } from '../NeoRail';
import type { NeoNav, RailSection } from '../types';

/** 与 NeoApp 相同的受控接线：nav/section 由父持有，点击只上报 onNavigate。 */
function Harness() {
  const [collapsed, setCollapsed] = useState(false);
  const [nav, setNav] = useState<NeoNav>({ view: 'home' });
  const [section, setSection] = useState<RailSection>('home');
  // 与 NeoApp.SECTION_BY_NAV 同款映射（os-unified 后 agents/teams 视图已移除）
  const map: Partial<Record<NeoNav['view'], RailSection>> = {
    home: 'home', knowledge: 'knowledge', memory: 'memory',
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
  it('默认展开：导航行齐全（「新任务」已收起 2026-11-06；秘书常驻行在），收回钮在', () => {
    renderRail();
    // 「新任务」入口已收起（主控对话由秘书「影」承担，⌘K 保留）
    expect(screen.queryByTestId('neo-new-task')).not.toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-knowledge')).toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-memory')).toBeInTheDocument();
    expect(screen.queryByTestId('neo-nav-teams')).not.toBeInTheDocument();
    expect(screen.queryByTestId('neo-nav-agents')).not.toBeInTheDocument();
    expect(screen.queryByTestId('neo-nav-runs')).not.toBeInTheDocument();
    expect(screen.getByTestId('neo-nav-search')).toBeInTheDocument();
    // 内置秘书「影」常驻行（home 列表第一位）
    expect(screen.getByTestId('neo-secretary-row')).toBeInTheDocument();
    // 收回钮存在，展开钮不存在
    expect(screen.getByTestId('neo-rail-collapse')).toBeInTheDocument();
    expect(screen.queryByTestId('neo-rail-expand')).not.toBeInTheDocument();
  });

  it('点收回钮 → 折叠态：展开钮出现、导航行收起（「新任务」图标钮也已收起），localStorage 记忆', () => {
    renderRail();
    fireEvent.click(screen.getByTestId('neo-rail-collapse'));
    expect(screen.getByTestId('neo-rail-expand')).toBeInTheDocument();
    // 折叠态没有导航行（「新任务」图标钮 2026-11-06 一并收起）
    expect(screen.queryByTestId('neo-nav-knowledge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('neo-new-task')).not.toBeInTheDocument();
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
  it('点知识库/记忆导航行 → 收到对应 nav 变体，列表区同步切换', async () => {
    renderRail();
    fireEvent.click(screen.getByTestId('neo-nav-knowledge'));
    expect(await screen.findByText('还没有知识源')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('neo-nav-memory'));
    expect(await screen.findByText('还没有记忆条目')).toBeInTheDocument();
  });

  it('数据看板导航行（2026-11-05 整合批）：点击上报 dashboard nav，行高亮，左栏列表区保持', () => {
    const onNavigate = vi.fn();
    const v1 = render(
      <MemoryRouter>
        <NeoRail
          nav={{ view: 'home' }}
          section="home"
          onNavigate={onNavigate}
          onNewTask={() => {}}
          collapsed={false}
          onToggleCollapsed={() => {}}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('neo-nav-dashboard'));
    expect(onNavigate).toHaveBeenCalledWith({ view: 'dashboard' });
    v1.unmount();
    // dashboard 视图：导航行点亮（aria-pressed），列表区仍归 section 管
    render(
      <MemoryRouter>
        <NeoRail
          nav={{ view: 'dashboard' }}
          section="home"
          onNavigate={onNavigate}
          onNewTask={() => {}}
          collapsed={false}
          onToggleCollapsed={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('neo-nav-dashboard')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('neo-nav-memory')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('NeoRail — home 统一列表区（os-unified 2026-11-04）', () => {
  it('home：团队折叠分组常驻（无独立团队页），组内含群聊行', async () => {
    renderRail();
    // 团队分组直接渲染在 home 列表区（无需先点团队导航）
    const group = await screen.findByTestId('neo-team-group', {}, { timeout: 3000 });
    expect(group).toBeInTheDocument();
    // 组内「群聊现场」入口行（inbox 无同名群 → fallback 行）
    await waitFor(() => {
      expect(screen.getByTestId('neo-team-row')).toBeInTheDocument();
    });
  });

  // 2026-11-06「+ 新建」聚合菜单（用户反馈：三个创建入口收进一个加号）：
  // 点加号弹出 新建 Agent / 新建项目 / 发起群聊 三项；模态本体由
  // NeoCreateGroupModal.test / NeoCreateAgentModal.test 覆盖。
  it('home：「+ 新建」聚合行常驻，点开弹出三入口菜单', async () => {
    renderRail();
    // 收起态：三入口不在列表区直出
    expect(screen.getByTestId('neo-new-plus')).toBeInTheDocument();
    expect(screen.queryByTestId('neo-new-agent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('neo-new-group')).not.toBeInTheDocument();
    // 点加号 → 菜单弹出，三入口齐备
    fireEvent.click(screen.getByTestId('neo-new-plus'));
    expect(screen.getByTestId('neo-plus-menu')).toBeInTheDocument();
    expect(screen.getByTestId('neo-new-agent')).toBeInTheDocument();
    expect(screen.getByTestId('neo-new-project')).toBeInTheDocument();
    expect(screen.getByTestId('neo-new-group')).toBeInTheDocument();
    // 再点加号 → 菜单收回
    fireEvent.click(screen.getByTestId('neo-new-plus'));
    expect(screen.queryByTestId('neo-plus-menu')).not.toBeInTheDocument();
  });

  it('点「发起群聊」挂 NeoCreateGroupModal（经 + 菜单）', async () => {
    const onNavigate = renderRailWithNav();
    await waitFor(() => {
      expect(screen.getByTestId('neo-new-plus')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('neo-new-plus'));
    fireEvent.click(screen.getByTestId('neo-new-group'));
    expect(screen.getByTestId('neo-create-group-modal-stub')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('点外关闭：菜单展开时 mousedown 落外部 → 菜单收起', async () => {
    renderRail();
    fireEvent.click(screen.getByTestId('neo-new-plus'));
    expect(screen.getByTestId('neo-plus-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('neo-plus-menu')).not.toBeInTheDocument();
    });
  });
});

/** 直接给受控 nav/section 的渲染（不再有 teams/agents 分区，恒 home 列表）。 */
function renderRailWithNav(onNavigate = vi.fn()) {
  render(
    <MemoryRouter>
      <NeoRail
        nav={{ view: 'home' }}
        section="home"
        onNavigate={onNavigate}
        onNewTask={() => {}}
        collapsed={false}
        onToggleCollapsed={() => {}}
      />
    </MemoryRouter>,
  );
  return onNavigate;
}

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
