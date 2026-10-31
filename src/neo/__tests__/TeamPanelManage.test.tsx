/**
 * TeamPanel 管理面闭环测试（2026-08-23）— 头部团队重命名/删除。
 * 覆盖：头部两钮常驻；重命名 → patchTeam 真实调用 + 头部显示名即时更新；
 * 删除二次确认（取消不调 deleteTeam）；确认删除 → deleteTeam + navigate('/')
 * 安全页；删除失败 → team-manage-error 红条且不跳转。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../api/teams', () => ({
  getTeam: vi.fn().mockResolvedValue({
    team_id: 't1',
    name: '测试团队',
    description: '',
    workspace_id: 'ws1',
    agent_ids: ['a1'],
    created_at: '',
    updated_at: '',
  }),
  patchTeam: vi.fn().mockResolvedValue({
    team_id: 't1',
    name: '新团队名',
    description: '',
    workspace_id: 'ws1',
    agent_ids: ['a1'],
    created_at: '',
    updated_at: '',
  }),
  deleteTeam: vi.fn().mockResolvedValue(undefined),
  getTeamWorkflow: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
  getTeamPolicy: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '甲', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
  ]),
}));
vi.mock('../../api/groupApi', () => ({
  resolveTeamGroup: vi.fn().mockResolvedValue('g-team-1'),
  // 2026-10-31 TeamPanel 新增「最近运行」区块依赖 listGroups，一并 mock；
  // 回 [] → find 不到 group → runsState='empty'，不触发后续请求。
  listGroups: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/runSessions', () => ({
  listRunSessions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/runs', () => ({
  getRunGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
}));
vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: (sel: (s: { currentId: string | null }) => unknown) =>
    sel({ currentId: 'ws1' }),
}));
vi.mock('../../core/store/useInboxStore', () => {
  const state = { fetchWorkspaceInbox: vi.fn() };
  const useInboxStore = (sel: (s: typeof state) => unknown) => sel(state);
  useInboxStore.getState = () => state;
  return { useInboxStore };
});
vi.mock('../projections/TeamDagEditor', () => ({
  TeamDagEditor: () => null,
}));

import { getTeam, patchTeam, deleteTeam } from '../../api/teams';
import { TeamPanel } from '../projections/TeamPanel';

let confirmSpy: ReturnType<typeof vi.spyOn>;
let promptSpy: ReturnType<typeof vi.spyOn>;

function renderPanel() {
  render(
    <TeamPanel teamId="t1" teamName="测试团队" perNodeChunks={{}} streaming={false} />,
  );
}

beforeEach(() => {
  // 注意：不能用 vi.restoreAllMocks() —— 它会把 vi.mock 模块工厂的 mockResolvedValue
  // 实现一并还原成 undefined（getTeam.then 崩），只还原这里创建的 window spy。
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('新团队名');
  navigateMock.mockReset();
  vi.clearAllMocks();
  // clearAllMocks 清掉工厂 mock 的实现，重打模块 mock 的 resolved 值
  vi.mocked(getTeam).mockResolvedValue({
    team_id: 't1',
    name: '测试团队',
    description: '',
    workspace_id: 'ws1',
    agent_ids: ['a1'],
    created_at: '',
    updated_at: '',
  });
  vi.mocked(patchTeam).mockResolvedValue({
    team_id: 't1',
    name: '新团队名',
    description: '',
    workspace_id: 'ws1',
    agent_ids: ['a1'],
    created_at: '',
    updated_at: '',
  });
  vi.mocked(deleteTeam).mockResolvedValue(undefined);
});

afterEach(() => {
  confirmSpy.mockRestore();
  promptSpy.mockRestore();
});

describe('TeamPanel — 团队重命名/删除（管理面闭环）', () => {
  it('头部常驻重命名/删除钮', async () => {
    renderPanel();
    expect(await screen.findByTestId('team-rename-btn')).toBeInTheDocument();
    expect(screen.getByTestId('team-delete-btn')).toBeInTheDocument();
  });

  it('重命名 → patchTeam(teamId, {name})，头部显示名即时更新为新名', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-rename-btn'));
    await waitFor(() =>
      expect(patchTeam).toHaveBeenCalledWith('t1', { name: '新团队名' }),
    );
    await waitFor(() => expect(screen.getByText('新团队名')).toBeInTheDocument());
  });

  it('删除二次确认：confirm 取消 → 不调 deleteTeam、不跳转', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-delete-btn'));
    expect(deleteTeam).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('confirm 确认 → deleteTeam 调用 + 跳回 Neo home 安全页', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-delete-btn'));
    await waitFor(() => expect(deleteTeam).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });

  it('删除失败 → 红条出现且不跳转', async () => {
    (deleteTeam as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('500'));
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-delete-btn'));
    expect(await screen.findByTestId('team-manage-error')).toHaveTextContent('操作失败，请重试');
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
