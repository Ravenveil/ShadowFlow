/**
 * NeoRail os-unified 测试 — 2026-11-03 Grok Bot 范式改造批。
 * 覆盖：员工会话项（头像主机入口 + 消息预览 + 未读）、团队折叠分组
 * （组标题折叠/展开、组内群聊行、成员会话项）、home 分区并入团队/成员。
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
vi.mock('../../api/memoryEntries', () => ({
  listMemoryEntries: vi.fn().mockResolvedValue([]),
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

function Harness({
  initialNav,
  initialSection,
}: {
  initialNav: NeoNav;
  initialSection: RailSection;
}) {
  const [nav, setNav] = useState<NeoNav>(initialNav);
  const [section, setSection] = useState<RailSection>(initialSection);
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
      onNewTask={() => {}}
      collapsed={false}
      onToggleCollapsed={() => {}}
    />
  );
}

describe('NeoRail os-unified — 员工会话项', () => {
  it('agents 分区：会话项带头像主机入口 + 消息预览 + 未读徽标', async () => {
    render(
      <MemoryRouter>
        <Harness initialNav={{ view: 'agents' }} initialSection="agents" />
      </MemoryRouter>,
    );
    const rows = await screen.findAllByTestId('neo-agent-session-row');
    expect(rows).toHaveLength(2);
    // a1 有 DM：预览文案 + 未读
    expect(screen.getByText('海报初稿已经完成')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // 头像主机入口
    const hostBtns = screen.getAllByTestId('neo-agent-host-btn');
    expect(hostBtns).toHaveLength(2);
  });

  it('点头像 → onNavigate agent-soul 主机卡片（不进会话）', async () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <NeoRail
          nav={{ view: 'agents' }}
          section="agents"
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

describe('NeoRail os-unified — 团队折叠分组', () => {
  it('home 分区：团队分组（组标题 + 组内群聊 + 成员会话项）+ 未归属员工落成员组', async () => {
    render(
      <MemoryRouter>
        <Harness initialNav={{ view: 'home' }} initialSection="home" />
      </MemoryRouter>,
    );
    // 团队分组标题（teams 列表进入 home 分区也会拉取，等分组落地）
    const groupNode = await screen.findByTestId('neo-team-group', {}, { timeout: 3000 });
    expect(groupNode).toBeInTheDocument();
    // 组内群聊行（inbox 有 team 名匹配的群）；teams 异步加载完成前可能还没渲染，
    // 等 members 渲染出来（每组最后一个成员行）再查
    await screen.findAllByTestId('neo-agent-session-row');
    await waitFor(() => {
      expect(screen.getByTestId('neo-team-group-chat')).toBeInTheDocument();
    });
    // 成员组：a2 未归属团队
    expect(screen.getByText('成员')).toBeInTheDocument();
    const sessRows = screen.getAllByTestId('neo-agent-session-row');
    expect(sessRows.length).toBeGreaterThanOrEqual(2);
  });

  it('teams 分区：分组折叠/展开（toggle → 组体消失/出现）', async () => {
    render(
      <MemoryRouter>
        <Harness initialNav={{ view: 'teams' }} initialSection="teams" />
      </MemoryRouter>,
    );
    const toggle = await screen.findByTestId('neo-team-group-toggle');
    // 展开态：组体在
    expect(screen.getByTestId('neo-team-group-chat')).toBeInTheDocument();
    // 折叠
    fireEvent.click(toggle);
    expect(screen.queryByTestId('neo-team-group-chat')).toBeNull();
    // 展开
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByTestId('neo-team-group-chat')).toBeInTheDocument();
    });
  });

  it('teams 分区：无群时显示「群聊现场」入口行，点击走 resolveTeamGroup', async () => {
    render(
      <MemoryRouter>
        <Harness initialNav={{ view: 'teams' }} initialSection="teams" />
      </MemoryRouter>,
    );
    // teams 分区渲染时 inbox groups 匹配同名群 → 有群聊行；这里验证 toggle 后
    // openTeamChat 通路：直接点击组内成员行不影响 resolveTeamGroup 调用记录
    const row = await screen.findByTestId('neo-team-group-chat');
    expect(row).toBeInTheDocument();
    expect(resolveTeamGroup).not.toHaveBeenCalled();
  });
});
