/**
 * NeoRail 项目分组测试 — GAP A3（2026-08-22）。
 * 覆盖：home 分区「项目」label + 新建项目行常驻；会话按 session.group_id
 * 归入项目桶（无项目落默认「会话」组）；teams 分区群聊同样按项目分桶；
 * 新建项目内联输入 Enter 提交 → createProject 调用；失败 → 错误条。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
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

const PROJECTS = vi.hoisted(() => [
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
      {
        conversation_id: 'c2',
        project_id: 'p1',
        title: '群现场',
        group_id: 'g-room-1',
        created_at: '2026-08-20T00:00:00Z',
        updated_at: '2026-08-21T00:00:00Z',
      },
    ],
  },
]);

vi.mock('../../api/projects', () => ({
  listProjectsWithSessions: vi.fn(),
  createProject: vi.fn().mockResolvedValue({ project_id: 'p-new', name: '新项目' }),
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
    {
      agentId: 'a2',
      agentName: '散养助手',
      kind: 'dm',
      status: 'idle',
      unreadCount: 0,
      lastMessage: '',
      lastActivityAt: '2026-08-21T01:00:00Z',
      group_id: 'g-other',
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
    {
      id: 'g-room-9',
      name: '无项目群',
      templateId: '',
      status: 'idle',
      unreadCount: 0,
      pendingApprovalsCount: 0,
      lastMessage: '',
      lastActivityAt: '2026-08-21T02:00:00Z',
    },
  ],
  fetchWorkspaceInbox: vi.fn(),
}));

vi.mock('../../core/store/useInboxStore', () => {
  const useInboxStore = (sel: (s: typeof INBOX_STATE) => unknown) => sel(INBOX_STATE);
  useInboxStore.getState = () => INBOX_STATE;
  return { useInboxStore };
});
vi.mock('../NeoCreateGroupModal', () => ({
  NeoCreateGroupModal: () => null,
}));

import { listProjectsWithSessions, createProject } from '../../api/projects';
import { NeoRail } from '../NeoRail';
import type { NeoNav, RailSection } from '../types';

function renderRail(section: RailSection = 'home', nav: NeoNav = { view: 'home' }, onNavigate = vi.fn()) {
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
  vi.clearAllMocks();
  (listProjectsWithSessions as ReturnType<typeof vi.fn>).mockResolvedValue(PROJECTS);
});

describe('NeoRail — 项目分组（GAP A3）', () => {
  it('home 分区常驻「项目」label + 新建项目行', async () => {
    renderRail('home');
    expect(await screen.findByText('项目')).toBeInTheDocument();
    expect(screen.getByTestId('neo-new-project')).toBeInTheDocument();
    await waitFor(() => expect(listProjectsWithSessions).toHaveBeenCalled());
  });

  it('会话按项目分桶：命中 group_id 的 DM 落在项目 label 下，未命中落默认「会话」组', async () => {
    renderRail('home');
    // 项目 label 出现
    expect(await screen.findByTestId('neo-project-label')).toHaveTextContent('氢能官网');
    // 两个 DM 行都在（分组只是展示归组，行不丢）
    const rows = screen.getAllByTestId('neo-dm-row');
    expect(rows).toHaveLength(2);
    // 默认组 label 仍在（有未归组会话）
    expect(screen.getByText('会话')).toBeInTheDocument();
    // 项目 label 在默认「会话」label 之前
    const labels = screen.getAllByText(/氢能官网|会话/);
    expect(labels[0]).toHaveTextContent('氢能官网');
    expect(labels[1]).toHaveTextContent('会话');
  });

  it('teams 分区群聊按项目分桶：命中的群在项目 label 下，未命中平铺', async () => {
    renderRail('teams', { view: 'teams' });
    expect(await screen.findByTestId('neo-project-label')).toHaveTextContent('氢能官网');
    const rows = screen.getAllByTestId('neo-group-row');
    expect(rows).toHaveLength(2);
  });

  it('点新建项目行 → 内联输入出现；Enter → createProject(name) 且输入收起', async () => {
    renderRail('home');
    fireEvent.click(await screen.findByTestId('neo-new-project'));
    const input = await screen.findByTestId('neo-new-project-input');
    fireEvent.change(input, { target: { value: '  新官网改版  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      // 2026-06 A4：createProject 增加可选 workspace_path 形参（未选文件夹时
      // 传 undefined）——断言跟进新签名，行为语义（名称 trim + 调用）不变。
      expect(createProject).toHaveBeenCalledWith('新官网改版', undefined);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('neo-new-project-input')).not.toBeInTheDocument();
    });
  });

  it('createProject 失败 → 错误条出现，输入行保留', async () => {
    (createProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('500'));
    renderRail('home');
    fireEvent.click(await screen.findByTestId('neo-new-project'));
    const input = await screen.findByTestId('neo-new-project-input');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('创建项目失败')).toBeInTheDocument();
    expect(screen.getByTestId('neo-new-project-input')).toBeInTheDocument();
  });

  it('项目接口失败 → 降级默认组平铺，不崩', async () => {
    (listProjectsWithSessions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'));
    renderRail('home');
    // 新建项目行仍常驻；DM 行全部落默认组
    expect(await screen.findByTestId('neo-new-project')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-dm-row')).toHaveLength(2);
    });
    expect(screen.queryByTestId('neo-project-label')).not.toBeInTheDocument();
  });
});
