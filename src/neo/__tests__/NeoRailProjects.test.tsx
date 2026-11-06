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

describe('NeoRail — 项目顶层分组混排（os-unified 2026-11-04）', () => {
  it('home：新建项目行常驻，项目接口被调用', async () => {
    renderRail('home');
    expect(screen.getByTestId('neo-new-plus')).toBeInTheDocument();
    await waitFor(() => expect(listProjectsWithSessions).toHaveBeenCalled());
  });

  it('项目块：命中 group_id 的 DM/群聊归入项目块（neo-project-section），未命中落默认区', async () => {
    renderRail('home');
    // 项目块出现（含折叠标题）
    expect(await screen.findByTestId('neo-project-section')).toBeInTheDocument();
    expect(screen.getByTestId('neo-project-section-toggle')).toHaveTextContent('氢能官网');
    // 两个 DM 行都在（归属 g-dm-1 的在项目块内，散养的落默认区）
    const rows = screen.getAllByTestId('neo-dm-row');
    expect(rows).toHaveLength(2);
    // 项目块 hover 管理钮（重命名/删除，沿用旧项目 label 三钮）
    expect(screen.getByTestId('neo-project-rename')).toBeInTheDocument();
    expect(screen.getByTestId('neo-project-delete')).toBeInTheDocument();
  });

  it('项目块折叠/展开：toggle 后组体（DM 行）消失/出现', async () => {
    renderRail('home');
    const toggle = await screen.findByTestId('neo-project-section-toggle');
    expect((await screen.findAllByTestId('neo-dm-row')).length).toBe(2);
    fireEvent.click(toggle);
    await waitFor(() => {
      // g-dm-1 的 DM 在项目块内，折叠后项目块内行消失（默认区散养 DM 仍在）
      expect(screen.getAllByTestId('neo-dm-row')).toHaveLength(1);
    });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-dm-row')).toHaveLength(2);
    });
  });

  it('点新建项目行 → 内联输入出现；Enter → createProject(name) 且输入收起', async () => {
    renderRail('home');
    // 2026-11-06「+ 新建」聚合菜单：先点加号展开菜单，再点菜单里的「新建项目」
    fireEvent.click(await screen.findByTestId('neo-new-plus'));
    fireEvent.click(screen.getByTestId('neo-new-project'));
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
    fireEvent.click(await screen.findByTestId('neo-new-plus'));
    fireEvent.click(screen.getByTestId('neo-new-project'));
    const input = await screen.findByTestId('neo-new-project-input');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('创建项目失败')).toBeInTheDocument();
    expect(screen.getByTestId('neo-new-project-input')).toBeInTheDocument();
  });

  it('项目接口失败 → 降级默认区平铺，不崩', async () => {
    (listProjectsWithSessions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'));
    renderRail('home');
    // 「+ 新建」聚合行仍常驻；DM 行全部落默认组
    expect(await screen.findByTestId('neo-new-plus')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-dm-row')).toHaveLength(2);
    });
    expect(screen.queryByTestId('neo-project-section')).not.toBeInTheDocument();
  });
});
