/**
 * TeamPanel「编辑 DAG」入口测试（GAP B28）。
 * 覆盖：只读摘要出现入口钮 → 点击切到 TeamDagEditor（stub 替身，避免
 * jsdom 里跑真实 reactflow）→ onCancel / onSaved 回到只读视图；
 * onSaved 回传的新图同步进只读摘要。
 *
 * 2026-08-22 GAP D 追加：「发起群聊」CTA —— resolveTeamGroup（find-or-create
 * 绑 team_id 的群）→ useNavigate 跳 /group/:gid；失败回 null → 面板错误行。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../api/groupApi', () => ({
  resolveTeamGroup: vi.fn().mockResolvedValue('g-team-1'),
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

vi.mock('../../api/teams', () => ({
  getTeam: vi.fn().mockResolvedValue({
    team_id: 't1',
    name: '测试团队',
    description: '',
    workspace_id: 'ws1',
    agent_ids: ['a1', 'a2'],
    created_at: '',
    updated_at: '',
  }),
  getTeamWorkflow: vi.fn().mockResolvedValue({
    nodes: [
      { id: 'n1', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a1', name: '甲', soul: '' } },
    ],
    edges: [],
  }),
  getTeamPolicy: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '甲', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
    { agent_id: 'a2', name: '乙', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
  ]),
}));

// stub 编辑器：只暴露保存/取消回调，验证 TeamPanel 的切换契约
vi.mock('../projections/TeamDagEditor', () => ({
  TeamDagEditor: (props: {
    onSaved: (wf: unknown) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="team-dag-editor-stub">
      <button
        data-testid="stub-save"
        onClick={() =>
          props.onSaved({
            nodes: [
              { id: 'n1', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a1', name: '甲', soul: '' } },
              { id: 'n2', type: 'agentTask', position: { x: 200, y: 0 }, data: { agentId: 'a2', name: '乙', soul: '' } },
            ],
            edges: [{ id: 'n1->n2', source: 'n1', target: 'n2', data: { mode: 'direct' } }],
          })
        }
      />
      <button data-testid="stub-cancel" onClick={props.onCancel} />
    </div>
  ),
}));

import { TeamPanel } from '../projections/TeamPanel';
import { resolveTeamGroup } from '../../api/groupApi';

const resolveTeamGroupMock = vi.mocked(resolveTeamGroup);

function renderPanel() {
  return render(
    <TeamPanel teamId="t1" teamName="测试团队" perNodeChunks={{}} streaming={false} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveTeamGroupMock.mockResolvedValue('g-team-1');
});

describe('TeamPanel — 编辑 DAG 入口', () => {
  it('只读工作流 section 出现「编辑 DAG」钮', async () => {
    renderPanel();
    expect(await screen.findByTestId('team-dag-edit-entry')).toBeInTheDocument();
    // 只读摘要还在（成员 roster 行 + 工作流 chip 都有「甲」）
    expect(screen.getAllByText('甲').length).toBeGreaterThanOrEqual(2);
  });

  it('点入口 → 切到编辑器；取消 → 回到只读视图', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-dag-edit-entry'));
    expect(screen.getByTestId('team-dag-editor-stub')).toBeInTheDocument();
    // 只读 section 让位
    expect(screen.queryByTestId('team-dag-edit-entry')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stub-cancel'));
    expect(await screen.findByTestId('team-dag-edit-entry')).toBeInTheDocument();
    expect(screen.queryByTestId('team-dag-editor-stub')).not.toBeInTheDocument();
  });

  it('编辑器 onSaved → 回到只读视图且摘要刷新为新图（2 节点 · 1 边）', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-dag-edit-entry'));
    fireEvent.click(screen.getByTestId('stub-save'));
    await waitFor(() => {
      expect(screen.queryByTestId('team-dag-editor-stub')).not.toBeInTheDocument();
    });
    expect(await screen.findByTestId('team-dag-edit-entry')).toBeInTheDocument();
    // 摘要 meta 刷新为新图规模（roster 本就有「乙」，用规模文案区分）
    expect(screen.getByText('2 节点 · 1 边')).toBeInTheDocument();
  });
});

describe('TeamPanel — 发起群聊 CTA（GAP D）', () => {
  it('成员 section 头部出现「发起群聊」钮，与「编辑 DAG」并存', async () => {
    renderPanel();
    expect(await screen.findByTestId('team-chat-launch')).toBeInTheDocument();
    expect(screen.getByTestId('team-dag-edit-entry')).toBeInTheDocument();
  });

  it('点击 → resolveTeamGroup 带 team_id + roster，命中后跳 /group/:gid', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-chat-launch'));
    await waitFor(() => {
      expect(resolveTeamGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ team_id: 't1', name: '测试团队', agent_ids: ['a1', 'a2'] }),
        'ws1',
      );
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/group/g-team-1');
    });
  });

  it('resolve 失败（回 null）→ 面板内错误行提示，不跳转', async () => {
    resolveTeamGroupMock.mockResolvedValue(null);
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-chat-launch'));
    expect(await screen.findByRole('alert')).toHaveTextContent('建群失败');
    expect(navigateMock).not.toHaveBeenCalled();
    // 失败后可重试（busy 复位）
    expect(screen.getByTestId('team-chat-launch')).toBeEnabled();
  });
});
