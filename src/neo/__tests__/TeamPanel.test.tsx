/**
 * TeamPanel 测试（2026-11-03 内联编辑改版 / 2026-11-04 头部瘦身）。
 * 覆盖：TeamDagEditor（stub 替身，避免 jsdom 里跑真实 reactflow）常驻
 * 工作流 section 的编辑契约；成员区微信化网格；策略矩阵循环/保存；
 * 2026-11-04 用户反馈第三批 —— 头部「重命名/删除/发起群聊」三钮与
 * 团队名 meta 全部移除后的负向断言。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

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

// stub 编辑器：只暴露保存/取消回调，验证 TeamPanel 的常驻编辑器契约
vi.mock('../projections/TeamDagEditor', () => ({
  TeamDagEditor: (props: {
    onSaved: (wf: unknown) => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
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
      <button data-testid="stub-dirty" onClick={() => props.onDirtyChange?.(true)} />
    </div>
  ),
}));

import { TeamPanel } from '../projections/TeamPanel';

function renderPanel() {
  return render(
    <TeamPanel teamId="t1" teamName="测试团队" perNodeChunks={{}} streaming={false} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeamPanel — 工作流常驻编辑器（2026-11-04）', () => {
  it('无需点击即可编辑：编辑器常驻渲染，roster/策略 section 同屏常驻', async () => {
    renderPanel();
    // 编辑器直接挂在工作流 section（不再有「编辑 DAG」开关钮）
    expect(await screen.findByTestId('team-dag-editor-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('team-dag-edit-entry')).not.toBeInTheDocument();
    // roster 行与常驻策略矩阵都在
    expect(screen.getAllByText('甲').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('team-policy-matrix')).toBeInTheDocument();
  });

  it('成员区微信化（2026-11-04）：roster 渲染为横向头像网格，不再裸露 agent ID', async () => {
    renderPanel();
    // 网格容器出现，成员名（甲/乙）作为头像下方小字渲染
    expect(await screen.findByTestId('team-roster-grid')).toBeInTheDocument();
    expect(screen.getAllByText('甲').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('乙').length).toBeGreaterThanOrEqual(1);
    // 裸 agent ID 不再直接出现在 DOM（收进 tooltip）
    expect(screen.queryByText('a1')).not.toBeInTheDocument();
    expect(screen.queryByText('a2')).not.toBeInTheDocument();
    // 头部计数「2 位成员」
    expect(screen.getByText('2 位成员')).toBeInTheDocument();
  });

  it('编辑器 onDirtyChange(true) → 头部出现「● 未保存」徽标', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('stub-dirty'));
    expect(await screen.findByTestId('team-dag-dirty')).toBeInTheDocument();
  });

  it('编辑器 onSaved → 摘要刷新为新图（2 节点 · 1 边）且徽标消失', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('stub-dirty'));
    fireEvent.click(await screen.findByTestId('stub-save'));
    // 摘要 meta 刷新为新图规模（roster 本就有「乙」，用规模文案区分）
    expect(await screen.findByText('2 节点 · 1 边')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('team-dag-dirty')).not.toBeInTheDocument();
    });
    // 编辑器仍常驻（保存不退出编辑）
    expect(screen.getByTestId('team-dag-editor-stub')).toBeInTheDocument();
  });
});

describe('TeamPanel — 头部瘦身（2026-11-04 用户反馈第三批）', () => {
  it('成员头部不再出现「发起群聊/重命名/删除」三钮，团队名 meta 不再显示', async () => {
    renderPanel();
    await screen.findByTestId('team-roster-grid');
    // 三钮全部移除（用户判定无用）
    expect(screen.queryByTestId('team-chat-launch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-rename-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-delete-btn')).not.toBeInTheDocument();
    // 团队名不再显示在成员头部
    expect(screen.queryByText('测试团队')).not.toBeInTheDocument();
  });
});

describe('TeamPanel — 协作策略矩阵（2026-11-04 常驻展开）', () => {
  it('矩阵默认展开：无需点开关即渲染 roster × roster 格子（无 toggle 钮）', async () => {
    renderPanel();
    // 矩阵常驻：格子直接出现（「甲」在 roster 行/表头/行头多处出现，用复数查询）
    expect(await screen.findByTestId('team-policy-cell-a1-a2')).toBeInTheDocument();
    expect(screen.getAllByText('甲').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('乙').length).toBeGreaterThanOrEqual(1);
    // 开关已移除
    expect(screen.queryByTestId('team-policy-toggle')).not.toBeInTheDocument();
  });

  it('点击格子循环 permit → warn → deny → 清除；未保存不发 PUT', async () => {
    const { getTeamPolicy, putTeamPolicy } = await import('../../api/teams');
    renderPanel();
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
    const cell = await screen.findByTestId('team-policy-cell-a2-a1');
    fireEvent.click(cell);
    fireEvent.click(screen.getByTestId('team-policy-save'));
    await waitFor(() => {
      expect(putTeamPolicy).toHaveBeenCalledWith('t1', { a2: { a1: 'permit' } });
    });
    expect(await screen.findByTestId('team-policy-saved')).toBeInTheDocument();
  });
});
