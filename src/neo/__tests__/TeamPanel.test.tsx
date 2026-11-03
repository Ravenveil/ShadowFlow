/**
 * TeamPanel「编辑 DAG」入口测试（GAP B28 / 2026-11-03 内联改版）。
 * 覆盖：工作流 section 出现入口钮 → 点击内联展开 TeamDagEditor（stub 替身，
 * 避免 jsdom 里跑真实 reactflow）→ 取消/保存后收起回到只读画布；
 * onSaved 回传的新图同步进只读摘要。
 *
 * 2026-11-03 起编辑器不再切走整面板（不卸载 roster/策略 section），改在
 * 工作流 section 内联展开；「最近运行」区块已移除。
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
  listGroups: vi.fn().mockResolvedValue([]),
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
  putTeamPolicy: vi.fn().mockResolvedValue(undefined),
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

describe('TeamPanel — 编辑 DAG 内联展开', () => {
  it('工作流 section 出现「编辑 DAG」钮，roster/策略 section 同屏常驻', async () => {
    renderPanel();
    expect(await screen.findByTestId('team-dag-edit-entry')).toBeInTheDocument();
    // 内联改版后整面板不再被编辑器替换：roster 行与策略 section 都在
    expect(screen.getAllByText('甲').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('team-policy-toggle')).toBeInTheDocument();
  });

  it('点入口 → 编辑器在 section 内展开（其余 section 不卸载）；收起 → 回只读画布', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-dag-edit-entry'));
    expect(screen.getByTestId('team-dag-editor-stub')).toBeInTheDocument();
    // roster 行仍可见（不切走整面板的回归断言）
    expect(screen.getByTestId('team-chat-launch')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stub-cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('team-dag-editor-stub')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('team-dag-edit-entry')).toBeInTheDocument();
  });

  it('编辑器 onSaved → 收起编辑器且摘要刷新为新图（2 节点 · 1 边）', async () => {
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

describe('TeamPanel — 协作策略矩阵（2026-11-03）', () => {
  it('未展开时显示成员策略 chips 摘要 + 「编辑矩阵」开关', async () => {
    renderPanel();
    expect(await screen.findByTestId('team-policy-toggle')).toBeInTheDocument();
    // chips 摘要里两个成员都在（「甲」在 roster 行/chips/表头多处出现，用复数查询）
    expect(screen.getAllByText('甲').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('乙').length).toBeGreaterThanOrEqual(1);
  });

  it('展开矩阵 → 渲染 roster × roster 格子；点击循环 permit → warn → deny → 清除', async () => {
    const { getTeamPolicy, putTeamPolicy } = await import('../../api/teams');
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-policy-toggle'));
    const cell = await screen.findByTestId('team-policy-cell-a1-a2');
    // 未配置 → 点击 → permit（保存钮出现）
    fireEvent.click(cell);
    expect(cell).toHaveClass('is-permit');
    expect(screen.getByTestId('team-policy-save')).toBeInTheDocument();
    // 点击 → warn
    fireEvent.click(cell);
    expect(cell).toHaveClass('is-warn');
    // 点击 → deny
    fireEvent.click(cell);
    expect(cell).toHaveClass('is-deny');
    // 点击 → 清除（未配置态，保存钮收起）
    fireEvent.click(cell);
    expect(cell).not.toHaveClass('is-permit');
    expect(screen.queryByTestId('team-policy-save')).not.toBeInTheDocument();
    // 全程未点保存 → 不发 PUT
    expect(putTeamPolicy).not.toHaveBeenCalled();
    expect(getTeamPolicy).toHaveBeenCalledTimes(1);
  });

  it('点「保存策略」→ putTeamPolicy 持久化并出现「已保存」pill', async () => {
    const { putTeamPolicy } = await import('../../api/teams');
    renderPanel();
    fireEvent.click(await screen.findByTestId('team-policy-toggle'));
    const cell = await screen.findByTestId('team-policy-cell-a2-a1');
    fireEvent.click(cell);
    fireEvent.click(screen.getByTestId('team-policy-save'));
    await waitFor(() => {
      expect(putTeamPolicy).toHaveBeenCalledWith('t1', { a2: { a1: 'permit' } });
    });
    expect(await screen.findByTestId('team-policy-saved')).toBeInTheDocument();
  });
});
