/**
 * NeoRail os-unified 测试 — 2026-11-03 Grok Bot 范式改造批 / 2026-11-04 用户反馈批。
 * 覆盖：员工会话项（头像主机入口 + 消息预览 + 未读）、团队折叠分组
 * （组标题折叠/展开、组内群聊行、成员会话项）、home 单一列表区
 * （agents/teams 分区已移除，团队/成员常驻 home）、项目顶层分组混排。
 */
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '设计助手', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '', avatar_style: 'bottts', avatar_seed: 'a1' },
    { agent_id: 'a2', name: '研究员', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'running', source: 'quick_hire', created_at: '' },
  ]),
}));
vi.mock('../../api/teams', () => ({
  listTeams: vi.fn().mockResolvedValue([
    { team_id: 't1', name: '增长小组', description: '', workspace_id: 'ws1', agent_ids: ['a1'], created_at: '', updated_at: '' },
  ]),
}));
vi.mock('../../api/groupApi', () => ({
  resolveDmConversation: vi.fn().mockResolvedValue(null),
  resolveTeamGroup: vi.fn().mockResolvedValue('g-t1'),
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
vi.mock('../../core/auth/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('../../core/store/useInboxStore', () => {
  const state = {
    agentDMs: [
      {
        agentId: 'a1',
        agentName: '设计助手',
        kind: 'dm',
        status: 'active',
        unreadCount: 2,
        lastMessage: '海报初稿已经完成',
        lastActivityAt: new Date().toISOString(),
        group_id: 'g-a1',
      },
    ],
    groups: [
      {
        id: 'g-t1',
        name: '增长小组',
        templateId: 'new-task',
        status: 'active',
        unreadCount: 0,
        pendingApprovalsCount: 0,
        lastMessage: '今天的投放数据已汇总',
        lastActivityAt: new Date().toISOString(),
      },
    ],
    fetchWorkspaceInbox: vi.fn(),
  };
  const useInboxStore = (sel: (s: typeof state) => unknown) => sel(state);
  useInboxStore.getState = () => state;
  return { useInboxStore };
});

import { resolveTeamGroup } from '../../api/groupApi';
import { NeoRail } from '../NeoRail';
import type { NeoNav, RailSection } from '../types';

function Harness({ initialNav }: { initialNav?: NeoNav } = {}) {
  const [nav, setNav] = useState<NeoNav>(initialNav ?? { view: 'home' });
  // os-unified 后 RailSection 只剩 home/knowledge（memory 已折叠进设置）
  const [section, setSection] = useState<RailSection>('home');
  const map: Partial<Record<NeoNav['view'], RailSection>> = {
    home: 'home', knowledge: 'knowledge',
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
    />
  );
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
}

describe('NeoRail os-unified — 员工会话项', () => {
  it('home 列表区：会话项带头像主机入口 + 消息预览 + 未读徽标', async () => {
    renderHome();
    // a1 有 DM：预览文案 + 未读（DM 行升级 Grok 会话项形态后同样渲染）
    expect(await screen.findByText('海报初稿已经完成')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // 头像主机入口（团队分组内成员 + 散养成员都会渲染）
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-agent-host-btn').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('点头像 → onNavigate agent-soul 主机卡片（不进会话）', async () => {
    const onNavigate = vi.fn();
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
    const hostBtns = await screen.findAllByTestId('neo-agent-host-btn');
    fireEvent.click(hostBtns[0]);
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith({ view: 'agent-soul', agentId: 'a1' });
    });
  });
});

describe('NeoRail os-unified — 团队折叠分组（home 常驻）', () => {
  it('home：团队分组（组标题 + 组内群聊 + 成员会话项）+ 默认区不再按类型分区', async () => {
    renderHome();
    // 团队分组标题
    const groupNode = await screen.findByTestId('neo-team-group', {}, { timeout: 3000 });
    expect(groupNode).toBeInTheDocument();
    // 组内群聊行（inbox 有 team 名匹配的群）
    await screen.findAllByTestId('neo-agent-session-row');
    await waitFor(() => {
      expect(screen.getByTestId('neo-team-group-chat')).toBeInTheDocument();
    });
    // 2026-11-04 用户反馈批：默认区不再插「成员」「群聊现场」子标题 ——
    // 团队以可折叠分组出现，其余（群聊 / DM / 散养成员）一律平级混排，
    // 左栏不再有「成员 vs 团队」的分区感（Grok 范式）。
    expect(screen.queryByText('成员')).not.toBeInTheDocument();
    expect(screen.queryByText('群聊现场')).not.toBeInTheDocument();
    const sessRows = screen.getAllByTestId('neo-agent-session-row');
    expect(sessRows.length).toBeGreaterThanOrEqual(2);
  });

  it('团队分组折叠/展开（toggle → 组体消失/出现）', async () => {
    renderHome();
    const toggle = await screen.findByTestId('neo-team-group-toggle', {}, { timeout: 3000 });
    // 展开态：组体在
    await waitFor(() => {
      expect(screen.getByTestId('neo-team-group-chat')).toBeInTheDocument();
    });
    // 折叠
    fireEvent.click(toggle);
    expect(screen.queryByTestId('neo-team-group-chat')).toBeNull();
    // 展开
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByTestId('neo-team-group-chat')).toBeInTheDocument();
    });
  });

  it('组内群聊行直接可点（无需先切 teams 分区）；resolveTeamGroup 不被分组渲染误调', async () => {
    renderHome();
    const row = await screen.findByTestId('neo-team-group-chat', {}, { timeout: 3000 });
    expect(row).toBeInTheDocument();
    expect(resolveTeamGroup).not.toHaveBeenCalled();
  });
});

describe('NeoRail os-unified — 项目顶层分组混排（2026-11-04 用户反馈批）', () => {
  it('项目块：有归属会话的项目渲染顶层分组（toggle + 名称 + 计数）', async () => {
    renderHome();
    // 本文件 mock 项目列表为空 → 无项目块，断言不渲染项目分组
    expect(screen.queryByTestId('neo-project-section')).toBeNull();
    // 新建项目行仍在（创建入口常驻）
    expect(screen.getByTestId('neo-new-project')).toBeInTheDocument();
  });
});

describe('NeoRail os-unified — 2026-11-04 第二批（群组合头像 + 入口前置 + 拖拽）', () => {
  it('新建 Agent 入口前置到列表区顶部（在新建项目之前）', async () => {
    renderHome();
    await screen.findByTestId('neo-team-group', {}, { timeout: 3000 });
    const newAgent = screen.getByTestId('neo-new-agent');
    const newProject = screen.getByTestId('neo-new-project');
    // DOM 顺序：新建 Agent 在新建项目之前（前置 = 用户第一眼看到）
    expect(newAgent.compareDocumentPosition(newProject) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('群聊行头像 = 成员组合头像（GroupStackAvatar，不再是 UsersRound 剪影）', async () => {
    renderHome();
    // 团队 t1 的 agent_ids=['a1']（设计助手），群 g-t1 与团队同名 join →
    // 组合头像应渲染出 a1 的 DiceBear 头像（agent-avatar testid）
    const row = await screen.findByTestId('neo-team-group-chat', {}, { timeout: 3000 });
    const avatar = row.querySelector('.neo-gstack');
    expect(avatar).not.toBeNull();
    // 单成员群 → 单头像直出（--single 修饰），且是真实 DiceBear 头像
    expect(avatar).toHaveClass('neo-gstack--single');
    expect(row.querySelector('[data-testid="agent-avatar"]')).not.toBeNull();
  });

  it('群聊行可拖拽（draggable 归组到项目）', async () => {
    renderHome();
    const row = await screen.findByTestId('neo-team-group-chat', {}, { timeout: 3000 });
    expect(row).toHaveAttribute('draggable', 'true');
  });

  it('成员会话行有 DM 时可拖拽（散养成员行同样能拖去项目分组）', async () => {
    renderHome();
    // a1 有 DM（group_id=g-a1）→ draggable；无 DM 的成员行不拖
    const rows = await screen.findAllByTestId('neo-agent-session-row');
    const a1Row = rows.find((r) => r.getAttribute('data-agent-id') === 'a1');
    expect(a1Row).toBeDefined();
    expect(a1Row).toHaveAttribute('draggable', 'true');
  });
});
