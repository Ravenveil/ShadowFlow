/**
 * TeamPanel 管理钮移除测试（2026-11-04 用户反馈第三批）。
 * 原「团队重命名/删除管理面闭环」（2026-08-23 建，2026-11-04 弹窗化）已
 * 按用户反馈整体移除 —— 成员头部不再有重命名/删除/发起群聊三钮，团队名
 * meta 不再显示，NeoRenameModal/patchTeam/deleteTeam/resolveTeamGroup
 * 链路连带清理。本文件改为负向断言：相关 testid 不再出现、API 不被调用。
 */
import { render, screen, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

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
  patchTeam: vi.fn(),
  deleteTeam: vi.fn(),
  getTeamWorkflow: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
  getTeamPolicy: vi.fn().mockResolvedValue({}),
  putTeamPolicy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '甲', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
  ]),
}));
vi.mock('../projections/TeamDagEditor', () => ({
  TeamDagEditor: () => null,
}));

import { patchTeam, deleteTeam } from '../../api/teams';
import { TeamPanel } from '../projections/TeamPanel';

function renderPanel() {
  render(
    <TeamPanel teamId="t1" teamName="测试团队" perNodeChunks={{}} streaming={false} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeamPanel — 重命名/删除/发起群聊管理钮已移除（2026-11-04）', () => {
  it('成员头部不再出现重命名/删除/发起群聊钮，团队名 meta 不再显示', async () => {
    renderPanel();
    await screen.findByTestId('team-roster-grid');
    expect(screen.queryByTestId('team-rename-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-delete-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-chat-launch')).not.toBeInTheDocument();
    expect(screen.queryByText('测试团队')).not.toBeInTheDocument();
  });

  it('渲染全程不触发 patchTeam/deleteTeam（管理链路已随 UI 移除）', async () => {
    renderPanel();
    await screen.findByTestId('team-roster-grid');
    await waitFor(() => {
      expect(patchTeam).not.toHaveBeenCalled();
      expect(deleteTeam).not.toHaveBeenCalled();
    });
  });
});
