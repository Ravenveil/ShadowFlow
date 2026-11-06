/**
 * NeoRail 管理面闭环测试（2026-08-23）。
 * 覆盖：员工行 hover 操作（暂停/恢复/删除，删除二次确认，删当前打开员工跳
 * home 安全页）；群/DM 行重命名/删除（patchGroup/deleteGroup 真实调用 +
 * 本地 inbox store 同步，删当前会话跳 home）；项目 label 重命名/删除
 * （patchProject/deleteProject）；操作失败 → neo-manage-error 红条。
 * 2026-11-04 重命名弹窗化：项目/会话重命名不再走 window.prompt，改为
 * NeoRenameModal 弹窗交互（预填当前名 → 改名 → 点确认 → 断言 patch 调用）。
 * 2026-11-04 移入项目移除：行内「移入项目」hover 钮 + 浮层删除（拖拽会话到
 * 项目分组的交互取代），改负向断言；底层 PATCH 通路保留供拖拽 drop 复用。
 * 2026-11-04 删除确认弹窗化：会话/群聊/项目删除不再走 window.confirm，改为
 * NeoConfirmModal 弹窗交互（点删除钮 → 弹窗 → 点确认/取消 → 断言 API）。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
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

/**
 * 弹窗式重命名的公共交互：点重命名钮 → 弹窗内改名为 newName → 点确认。
 */
async function renameViaModal(triggerTestId: string, newName: string) {
  fireEvent.click(await screen.findByTestId(triggerTestId));
  await screen.findByTestId('neo-rename-modal');
  const input = await screen.findByTestId('neo-rename-input');
  fireEvent.change(input, { target: { value: newName } });
  fireEvent.click(screen.getByTestId('neo-rename-confirm'));
}

/**
 * 弹窗式删除的公共交互：点删除钮 → NeoConfirmModal 出现（含名称警示文案）→
 * 点确认。取消用例在弹窗内点取消后断言 API 未被调用。
 */
async function deleteViaModal(triggerTestId: string, name: string) {
  fireEvent.click(await screen.findByTestId(triggerTestId));
  const modal = await screen.findByTestId('neo-confirm-modal');
  expect(modal).toHaveTextContent(name);
  expect(modal).toHaveTextContent('不可撤销');
  fireEvent.click(screen.getByTestId('neo-confirm-confirm'));
}

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
  // 只重置调用记录并重打实现。重命名（NeoRenameModal）/删除（NeoConfirmModal）
  // 均已弹窗化，不再需要 promptSpy/confirmSpy。
  vi.clearAllMocks();
  vi.mocked(listAgents).mockResolvedValue([
    { agent_id: 'a1', name: '设计助手', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
    { agent_id: 'a2', name: '暂停员工', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'paused', source: 'quick_hire', created_at: '' },
  ]);
});

describe('NeoRail 管理面 — 员工行', () => {
  // os-unified（2026-11-03）：员工行走 Grok 会话项形态；2026-11-06 用户反馈
  // 头像主机入口移除（点头像也进单聊，灵魂编辑走会话右栏「灵魂」tab）——
  // rail 内不再渲染 neo-agent-delete / neo-agent-host-btn，改断言其缺席。
  // 2026-11-04：分区移除，成员会话行直接渲染在 home 列表区。
  it('成员行走会话项形态：无行内删除钮、无头像主机入口', async () => {
    renderRail('home');
    const rows = await screen.findAllByTestId('neo-agent-session-row');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('neo-agent-host-btn')).toBeNull();
    expect(screen.queryByTestId('neo-agent-delete')).toBeNull();
    expect(screen.queryByTestId('neo-agent-soul-entry')).toBeNull();
    expect(screen.queryByTestId('neo-agent-pause-toggle')).toBeNull();
  });
});

describe('NeoRail 管理面 — DM/群聊行', () => {
  it('DM 重命名：弹窗预填当前名 → 改名 → patchGroup + 本地 renameAgentDM 同步', async () => {
    renderRail('home');
    // 先等项目分组落地（listProjectsWithSessions 异步 resolve 后 DM 行会从默认组
    // 移进项目桶，React 重挂节点——过早拿到行内按钮句柄会因节点被替换而点击失效）。
    await screen.findByTestId('neo-project-section-toggle');
    fireEvent.click(await screen.findByTestId('neo-dm-rename'));
    // 弹窗打开：预填当前名（initial）→ 同名守卫，确认钮 disabled。
    const input = await screen.findByTestId('neo-rename-input');
    expect(input).toHaveValue('设计助手');
    expect(screen.getByTestId('neo-rename-confirm')).toBeDisabled();
    // 改名 → 确认 → patchGroup + store 同步。
    fireEvent.change(input, { target: { value: '新名字' } });
    fireEvent.click(screen.getByTestId('neo-rename-confirm'));
    await waitFor(() =>
      expect(patchGroup).toHaveBeenCalledWith('g-dm-1', { name: '新名字' }),
    );
    await waitFor(() =>
      expect(INBOX_STATE.renameAgentDM).toHaveBeenCalledWith('a1', '新名字'),
    );
    // 成功后弹窗关闭。
    await waitFor(() => expect(screen.queryByTestId('neo-rename-modal')).toBeNull());
  });

  it('DM 重命名弹窗：不改名（值与 initial 相同）确认钮 disabled；Esc 关闭', async () => {
    renderRail('home');
    await screen.findByTestId('neo-project-section-toggle');
    fireEvent.click(await screen.findByTestId('neo-dm-rename'));
    const input = await screen.findByTestId('neo-rename-input');
    expect(input).toHaveValue('设计助手');
    // 同名守卫：不发无效请求。
    expect(screen.getByTestId('neo-rename-confirm')).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    // 空名守卫：trim 后为空也 disabled。
    expect(screen.getByTestId('neo-rename-confirm')).toBeDisabled();
    expect(patchGroup).not.toHaveBeenCalled();
    // Esc 取消关闭弹窗，且不触发任何 patch。
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('neo-rename-modal')).toBeNull());
    expect(patchGroup).not.toHaveBeenCalled();
  });

  it('DM 删除（当前正开着该会话）→ 确认弹窗 → deleteGroup + removeAgentDM + 跳 home', async () => {
    const onNavigate = renderRail('home', { view: 'conversation', groupId: 'g-dm-1' });
    await screen.findByTestId('neo-project-section-toggle');
    await deleteViaModal('neo-dm-delete', '设计助手');
    await waitFor(() => expect(deleteGroup).toHaveBeenCalledWith('g-dm-1'));
    await waitFor(() => expect(INBOX_STATE.removeAgentDM).toHaveBeenCalledWith('a1'));
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith({ view: 'home' }),
    );
  });

  it('DM 删除弹窗点取消 → 不调 deleteGroup，弹窗关闭', async () => {
    renderRail('home');
    await screen.findByTestId('neo-project-section-toggle');
    fireEvent.click(await screen.findByTestId('neo-dm-delete'));
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-cancel'));
    expect(deleteGroup).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('neo-confirm-modal')).toBeNull());
  });

  it('群聊行重命名：弹窗改名 → patchGroup + updateGroupMeta；删除 → 确认弹窗 → deleteGroup + removeGroup', async () => {
    // os-unified（2026-11-04）：无独立 teams 分区，群聊行渲染在 home 默认区
    renderRail('home');
    await renameViaModal('neo-group-rename', '新名字');
    await waitFor(() =>
      expect(patchGroup).toHaveBeenCalledWith('g-room-1', { name: '新名字' }),
    );
    await waitFor(() =>
      expect(INBOX_STATE.updateGroupMeta).toHaveBeenCalledWith('g-room-1', { name: '新名字' }),
    );

    await deleteViaModal('neo-group-delete', '氢能项目组');
    await waitFor(() => expect(deleteGroup).toHaveBeenCalledWith('g-room-1'));
    await waitFor(() => expect(INBOX_STATE.removeGroup).toHaveBeenCalledWith('g-room-1'));
  });
});

describe('NeoRail 管理面 — 移入项目（2026-11-04 已移除，拖拽归组取代）', () => {
  it('DM/群聊行不再渲染「移入项目」hover 钮与浮层（neo-dm-move/neo-group-move/neo-move-menu 缺席）', async () => {
    renderRail('home');
    await screen.findByTestId('neo-project-section-toggle');
    expect(screen.queryByTestId('neo-dm-move')).toBeNull();
    expect(screen.queryByTestId('neo-group-move')).toBeNull();
    expect(screen.queryByTestId('neo-move-menu')).toBeNull();
    expect(screen.queryByTestId('neo-move-option')).toBeNull();
    expect(screen.queryByTestId('neo-move-default')).toBeNull();
    // 重命名/删除钮不受影响（仍在行尾）。
    expect(screen.getByTestId('neo-dm-rename')).toBeInTheDocument();
    expect(screen.getByTestId('neo-dm-delete')).toBeInTheDocument();
    expect(screen.getByTestId('neo-group-rename')).toBeInTheDocument();
    expect(screen.getByTestId('neo-group-delete')).toBeInTheDocument();
    // 底层通路未被误删：moveGroupConversationToProject 仍被 import（拖拽 drop 复用）。
    expect(moveGroupConversationToProject).toBeDefined();
  });
});

describe('NeoRail 管理面 — 项目 label', () => {
  it('项目 label（有命中会话才渲染）带重命名/删除钮', async () => {
    renderRail('home');
    expect(await screen.findByTestId('neo-project-section-toggle')).toHaveTextContent('氢能官网');
    expect(screen.getByTestId('neo-project-rename')).toBeInTheDocument();
    expect(screen.getByTestId('neo-project-delete')).toBeInTheDocument();
  });

  it('项目重命名：弹窗改名 → patchProject(project_id, {name})；删除（确认弹窗）→ deleteProject', async () => {
    renderRail('home');
    await renameViaModal('neo-project-rename', '新名字');
    await waitFor(() =>
      expect(patchProject).toHaveBeenCalledWith('p1', { name: '新名字' }),
    );

    await deleteViaModal('neo-project-delete', '氢能官网');
    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('p1'));
  });

  it('项目删除弹窗点取消 → 不调 deleteProject，弹窗关闭', async () => {
    renderRail('home');
    fireEvent.click(await screen.findByTestId('neo-project-delete'));
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-cancel'));
    expect(deleteProject).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('neo-confirm-modal')).toBeNull());
  });
});
