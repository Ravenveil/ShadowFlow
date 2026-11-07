/**
 * TeamWorkflowVersionsPanel 测试 — DAG 编辑器「版本」面板。
 *
 * 直接渲染面板子组件（不经 reactflow 画布），mock 版本 API：
 *   - 列表渲染（新→旧倒序）+ 空态
 *   - 回滚：确认弹窗取消不发请求；确认 → restore → onRestored 回传新图
 *     （2026-11-04 用户反馈批：window.confirm 原生框 → NeoConfirmModal 弹窗）
 *   - 「存为分支」→ branch 成功后展示分支名
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../api/teams', () => ({
  listTeamWorkflowVersions: vi.fn(),
  restoreTeamWorkflowVersion: vi.fn(),
  branchTeamWorkflow: vi.fn(),
  putTeamWorkflow: vi.fn(),
  putTeamDagLayout: vi.fn(),
  TeamApiError: class TeamApiError extends Error {},
}));

import { TeamWorkflowVersionsPanel } from '../projections/TeamDagEditor';
import {
  listTeamWorkflowVersions,
  restoreTeamWorkflowVersion,
  branchTeamWorkflow,
} from '../../api/teams';

const listMock = vi.mocked(listTeamWorkflowVersions);
const restoreMock = vi.mocked(restoreTeamWorkflowVersion);
const branchMock = vi.mocked(branchTeamWorkflow);

const VERSIONS = [
  { version: 1, saved_at: '2026-08-22T10:00:00+00:00', summary: null },
  { version: 2, saved_at: '2026-08-23T10:00:00+00:00', summary: 'restored from v1' },
];

function renderPanel(onRestored = vi.fn()) {
  render(<TeamWorkflowVersionsPanel teamId="t1" refreshToken={0} onRestored={onRestored} />);
  return onRestored;
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue(VERSIONS);
});

describe('TeamWorkflowVersionsPanel', () => {
  it('渲染版本列表（新版本在前）', async () => {
    renderPanel();
    expect(await screen.findByTestId('team-dag-versions-list')).toBeInTheDocument();
    const rows = screen.getAllByText(/^v\d+$/);
    expect(rows[0]).toHaveTextContent('v2');
    expect(rows[1]).toHaveTextContent('v1');
    expect(screen.getByText('restored from v1')).toBeInTheDocument();
  });

  it('空版本列表 → 空态文案', async () => {
    listMock.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByTestId('team-dag-versions-empty')).toHaveTextContent('暂无版本');
  });

  it('回滚：确认弹窗点取消不发请求；点确认 → restore 并回传新图', async () => {
    const restoredWf = { nodes: [], edges: [] };
    restoreMock.mockResolvedValue(restoredWf);
    const onRestored = renderPanel();
    const btn = await screen.findByTestId('team-dag-restore-v1');

    // 弹窗打开 → 点取消 → 不发请求，弹窗关闭。
    fireEvent.click(btn);
    expect(await screen.findByTestId('neo-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('neo-confirm-modal')).toHaveTextContent('v1');
    fireEvent.click(screen.getByTestId('neo-confirm-cancel'));
    expect(restoreMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('neo-confirm-modal')).toBeNull());

    // 再开弹窗 → 点确认 → restore + 回传新图。
    fireEvent.click(btn);
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-confirm'));
    await waitFor(() => expect(restoreMock).toHaveBeenCalledWith('t1', 1));
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(restoredWf));
  });

  it('「存为分支」成功后展示分支名', async () => {
    branchMock.mockResolvedValue({
      team_id: 'team-branch1',
      name: '版本小队 · 分支',
      description: '',
      workspace_id: 'ws1',
      agent_ids: ['a1'],
      created_at: '',
      updated_at: '',
    });
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-dag-branch-btn'));
    expect(await screen.findByText(/已存为分支：版本小队 · 分支/)).toBeInTheDocument();
    expect(branchMock).toHaveBeenCalledWith('t1');
  });
});
