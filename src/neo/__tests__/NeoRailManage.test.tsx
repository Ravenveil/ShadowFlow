/**
 * NeoRail 管理面闭环测试（2026-08-23）。
 * 覆盖：员工行 hover 操作（暂停/恢复/删除，删除二次确认，删当前打开员工跳
 * home 安全页）；群/DM 行重命名/删除（patchGroup/deleteGroup 真实调用 +
 * 本地 inbox store 同步，删当前会话跳 home）；项目 label 重命名/删除
 * （patchProject/deleteProject）；操作失败 → neo-manage-error 红条。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '设计助手', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
    { agent_id: 'a2', name: '暂停员工', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'paused', source: 'quick_hire', created_at: '' },
  ]),
  pauseAgent: vi.fn().mockResolvedValue({ agent_id: 'a1', status: 'paused' }),
  resumeAgent: vi.fn().mockResolvedValue({ agent_id: 'a2', status: 'idle' }),
  deleteAgent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/teams', () => ({
  listTeams: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/groupApi', () => ({
  resolveDmConversation: vi.fn().mockResolvedValue(null),
  resolveTeamGroup: vi.fn().mockResolvedValue(null),
  patchGroup: vi.fn().mockResolvedValue({ group_id: 'g-dm-1', name: '新名字' }),
  deleteGroup: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/projects', () => ({
  listProjectsWithSessions: vi.fn().mockResolvedValue([
    {
      id: 'p1',
      project_id: 'p1',
      name: '氢能官网',
      workspace_path: '/tmp/p1',
      skill_id: null,
      design_system_id: null,
      created_at: '2026-08-20T00:00:00Z',
      updated_at: '2026-08-20T00:00:00Z',
      sessions: [
        {
          conversation_id: 'c1',
          project_id: 'p1',
          title: '主会话',
          group_id: 'g-dm-1',
          created_at: '2026-08-20T00:00:00Z',
          updated_at: '2026-08-21T00:00:00Z',
        },
      ],
    },
  ]),
  createProject: vi.fn(),
  patchProject: vi.fn().mockResolvedValue({ project_id: 'p1', name: '新项目名' }),
  deleteProject: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/conversations', () => ({
  moveGroupConversationToProject: vi.fn().mockResolvedValue({
    conversation_id: 'c1',
    project_id: 'p1',
    title: null,
    group_id: 'g-dm-1',
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-21T00:00:00Z',
  }),
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

const INBOX_STATE = vi.hoisted(() => ({
  agentDMs: [
    {
      agentId: 'a1',
      agentName: '设计助手',
      kind: 'dm',
      status: 'idle',
      unreadCount: 0,
      lastMessage: '',
      lastActivityAt: '2026-08-21T00:00:00Z',
      group_id: 'g-dm-1',
    },
  ],
  groups: [
    {
      id: 'g-room-1',
      name: '氢能项目组',
      templateId: '',
      status: 'idle',
      unreadCount: 0,
      pendingApprovalsCount: 0,
      lastMessage: '',
      lastActivityAt: '2026-08-21T00:00:00Z',
    },
  ],
  fetchWorkspaceInbox: vi.fn(),
  renameAgentDM: vi.fn(),
  removeAgentDM: vi.fn(),
  updateGroupMeta: vi.fn(),
  removeGroup: vi.fn(),
}));

vi.mock('../../core/store/useInboxStore', () => {
  const useInboxStore = (sel: (s: typeof INBOX_STATE) => unknown) => sel(INBOX_STATE);
  useInboxStore.getState = () => INBOX_STATE;
  return { useInboxStore };
});
vi.mock('../NeoCreateGroupModal', () => ({
  NeoCreateGroupModal: () => null,
}));

import { deleteAgent, listAgents } from '../../api/agents';
import { patchGroup, deleteGroup } from '../../api/groupApi';
import { patchProject, deleteProject } from '../../api/projects';
import { moveGroupConversationToProject } from '../../api/conversations';
import { NeoRail } from '../NeoRail';
import type { NeoNav, RailSection } from '../types';

let confirmSpy: ReturnType<typeof vi.spyOn>;
let promptSpy: ReturnType<typeof vi.spyOn>;

function renderRail(section: RailSection, nav: NeoNav = { view: 'home' }, onNavigate = vi.fn()) {
  render(
    <MemoryRouter>
      <NeoRail
        nav={nav}
        section={section}
        onNavigate={onNavigate}
        onNewTask={() => {}}
        collapsed={false}
        onToggleCollapsed={() => {}}
      />
    </MemoryRouter>,
  );
  return onNavigate;
}

beforeEach(() => {
  // 注意：不能用 vi.restoreAllMocks() —— 它会把 vi.mock 模块工厂的实现一并
  // 还原成 undefined（listAgents.then 崩，2026-10-31 测试基建修复后暴露）。
  // 只重置调用记录并重打实现，window spy 单独还原。
  vi.clearAllMocks();
  vi.mocked(listAgents).mockResolvedValue([
    { agent_id: 'a1', name: '设计助手', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
    { agent_id: 'a2', name: '暂停员工', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'paused', source: 'quick_hire', created_at: '' },
  ]);
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('新名字');
});

afterEach(() => {
  confirmSpy.mockRestore();
  promptSpy.mockRestore();
});

describe('NeoRail 管理面 — 员工行', () => {
  // os-unified（2026-11-03）：员工行走 Grok 会话项形态（头像可点开主机卡片），
  // 行内删除钮移入主机卡片——rail 内不再渲染 neo-agent-delete，改断言其缺席。
  it('员工区走会话项形态：无行内删除钮（删除入口移入 agent 主机卡片）', async () => {
    renderRail('agents', { view: 'agents' });
    const rows = await screen.findAllByTestId('neo-agent-session-row');
    expect(rows).toHaveLength(2);
    // 头像主机入口（点头像开 agent-soul 主机卡片）
    const hostBtns = await screen.findAllByTestId('neo-agent-host-btn');
    expect(hostBtns).toHaveLength(2);
    expect(screen.queryByTestId('neo-agent-delete')).toBeNull();
    expect(screen.queryByTestId('neo-agent-soul-entry')).toBeNull();
    expect(screen.queryByTestId('neo-agent-pause-toggle')).toBeNull();
  });
});

describe('NeoRail 管理面 — DM/群聊行', () => {
  it('DM 重命名 → patchGroup(group_id, {name}) + 本地 renameAgentDM 同步', async () => {
    renderRail('home');
    // 先等项目分组落地（listProjectsWithSessions 异步 resolve 后 DM 行会从默认组
    // 移进项目桶，React 重挂节点——过早拿到行内按钮句柄会因节点被替换而点击失效）。
    await screen.findByTestId('neo-project-label');
    fireEvent.click(await screen.findByTestId('neo-dm-rename'));
    await waitFor(() =>
      expect(patchGroup).toHaveBeenCalledWith('g-dm-1', { name: '新名字' }),
    );
    await waitFor(() =>
      expect(INBOX_STATE.renameAgentDM).toHaveBeenCalledWith('a1', '新名字'),
    );
  });

  it('DM 删除（当前正开着该会话）→ deleteGroup + removeAgentDM + 跳 home', async () => {
    const onNavigate = renderRail('home', { view: 'conversation', groupId: 'g-dm-1' });
    await screen.findByTestId('neo-project-label');
    fireEvent.click(await screen.findByTestId('neo-dm-delete'));
    await waitFor(() => expect(deleteGroup).toHaveBeenCalledWith('g-dm-1'));
    await waitFor(() => expect(INBOX_STATE.removeAgentDM).toHaveBeenCalledWith('a1'));
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith({ view: 'home' }),
    );
  });

  it('群聊行重命名 → patchGroup + updateGroupMeta；删除 → deleteGroup + removeGroup', async () => {
    renderRail('teams', { view: 'teams' });
    fireEvent.click(await screen.findByTestId('neo-group-rename'));
    await waitFor(() =>
      expect(patchGroup).toHaveBeenCalledWith('g-room-1', { name: '新名字' }),
    );
    await waitFor(() =>
      expect(INBOX_STATE.updateGroupMeta).toHaveBeenCalledWith('g-room-1', { name: '新名字' }),
    );

    fireEvent.click(screen.getByTestId('neo-group-delete'));
    await waitFor(() => expect(deleteGroup).toHaveBeenCalledWith('g-room-1'));
    await waitFor(() => expect(INBOX_STATE.removeGroup).toHaveBeenCalledWith('g-room-1'));
  });
});

describe('NeoRail 管理面 — 移入项目（GAP A3 回写）', () => {
  it('DM 行「移入项目」→ 浮层列项目 + 默认项目；选项目 → PATCH 该 group', async () => {
    renderRail('home');
    // 等项目分组落地（DM 行会随分桶重挂，句柄需在之后取）。
    await screen.findByTestId('neo-project-label');
    fireEvent.click(await screen.findByTestId('neo-dm-move'));
    const menu = await screen.findByTestId('neo-move-menu');
    // 项目 p1 + 「默认项目」两项；p1 是该 DM 当前归属。
    const options = screen.getAllByTestId('neo-move-option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('氢能官网');
    expect(screen.getByTestId('neo-move-default')).toHaveTextContent('默认项目');

    fireEvent.click(options[0]);
    await waitFor(() =>
      expect(moveGroupConversationToProject).toHaveBeenCalledWith('g-dm-1', 'p1'),
    );
    // 选择后浮层关闭。
    await waitFor(() => expect(menu).not.toBeInTheDocument());
  });

  it('群聊行选「默认项目」→ PATCH project_id=null（移回默认组）', async () => {
    renderRail('teams', { view: 'teams' });
    fireEvent.click(await screen.findByTestId('neo-group-move'));
    fireEvent.click(await screen.findByTestId('neo-move-default'));
    await waitFor(() =>
      expect(moveGroupConversationToProject).toHaveBeenCalledWith('g-room-1', null),
    );
  });

  it('触发钮再点一次收起浮层；PATCH 失败 → neo-manage-error 红条', async () => {
    renderRail('teams', { view: 'teams' });
    const trigger = await screen.findByTestId('neo-group-move');
    fireEvent.click(trigger);
    expect(await screen.findByTestId('neo-move-menu')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByTestId('neo-move-menu')).toBeNull();

    vi.mocked(moveGroupConversationToProject).mockRejectedValueOnce(new Error('HTTP 500'));
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByTestId('neo-move-default'));
    expect(await screen.findByTestId('neo-manage-error')).toBeInTheDocument();
  });
});

describe('NeoRail 管理面 — 项目 label', () => {
  it('项目 label（有命中会话才渲染）带重命名/删除钮', async () => {
    renderRail('home');
    expect(await screen.findByTestId('neo-project-label')).toHaveTextContent('氢能官网');
    expect(screen.getByTestId('neo-project-rename')).toBeInTheDocument();
    expect(screen.getByTestId('neo-project-delete')).toBeInTheDocument();
  });

  it('重命名 → patchProject(project_id, {name})；删除（确认）→ deleteProject', async () => {
    renderRail('home');
    fireEvent.click(await screen.findByTestId('neo-project-rename'));
    await waitFor(() =>
      expect(patchProject).toHaveBeenCalledWith('p1', { name: '新名字' }),
    );

    fireEvent.click(screen.getByTestId('neo-project-delete'));
    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('p1'));
  });

  it('项目删除 confirm 取消 → 不调 deleteProject', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderRail('home');
    fireEvent.click(await screen.findByTestId('neo-project-delete'));
    expect(deleteProject).not.toHaveBeenCalled();
  });
});
