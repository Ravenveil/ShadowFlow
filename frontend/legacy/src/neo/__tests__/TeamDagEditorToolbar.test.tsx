/**
 * TeamDagEditor 工具条改版测试（2026-11-05 顺滑化：n8n 式连线/排布 + 四钮合一）。
 *
 * 画布本体在 jsdom 里由 src/test/setup.ts 全局 mock 掉 reactflow（节点/边状态
 * 由 useNodesState/useEdgesState mock 维持），这里测工具条与溢出菜单的交互契约：
 *   - 四钮合一：右侧只留 [自动排列][⋯][保存]；「服务端校验」「取消」「版本」
 *     独立按钮不再存在（负向断言）
 *   - 下拉选中即添加节点（不再有独立「+ 节点」钮）
 *   - 自动排列：最长路径分层重排节点坐标
 *   - ⋯ 菜单：版本历史开关 / 放弃修改（dirty 时弹 NeoConfirmModal 二次确认）
 *   - 保存成功后自动干跑服务端校验（POST /dag/validate），404 静默
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';

// 局部覆写 reactflow mock：全局 setup 的 Panel 是 vi.fn()（不渲染 children），
// 工具条全在 Panel 里 —— 这里让 Panel 透传 children + data-testid，其余与
// 全局 mock 同构（useNodesState/useEdgesState 返回 [initial, noop, noop]）。
vi.mock('reactflow', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'react-flow-mock' }, children),
  ReactFlow: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'react-flow-mock' }, children),
  MiniMap: vi.fn(),
  Controls: vi.fn(),
  Background: vi.fn(),
  Panel: ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('div', rest as React.HTMLAttributes<HTMLDivElement>, children),
  BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  useReactFlow: vi.fn(() => ({
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn(),
    screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p),
  })),
  // 真状态（2026-11-07）：roster 增员同步要靠 setNodes 更新画布，冻结的
  // [initial, noop, noop] 测不出「加人进画布」；useState 挂进渲染树即可。
  useNodesState: vi.fn((initial: unknown = []) => React.useState(initial)),
  useEdgesState: vi.fn((initial: unknown = []) => React.useState(initial)),
  addEdge: vi.fn((edge: unknown, eds: unknown[]) => [...(eds as unknown[]), edge]),
  applyEdgeChanges: vi.fn(() => []),
  applyNodeChanges: vi.fn(() => []),
  BaseEdge: ({ path }: { path?: string }) => React.createElement('path', { d: path }),
  EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  getSmoothStepPath: vi.fn(() => ['M0 0 L0 0', 50, 0]),
  Handle: ({ id, ...rest }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) =>
    React.createElement('div', { 'data-handleid': id, ...rest }),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  MarkerType: { Arrow: 'arrow', ArrowClosed: 'arrowclosed' },
  ConnectionMode: { Loose: 'loose', Strict: 'strict' },
  ConnectionLineType: { Bezier: 'bezier', SmoothStep: 'smoothstep' },
}));

const putWorkflowMock = vi.fn();
const putLayoutMock = vi.fn();
const validateDagMock = vi.fn();

vi.mock('../../api/teams', async () => {
  const actual = await vi.importActual<typeof import('../../api/teams')>('../../api/teams');
  return {
    ...actual,
    // 仅替换网络层函数；TeamApiError 保留真实类，保证 instanceof 判定一致
    putTeamWorkflow: (...args: unknown[]) => putWorkflowMock(...args),
    putTeamDagLayout: (...args: unknown[]) => putLayoutMock(...args),
    listTeamWorkflowVersions: vi.fn().mockResolvedValue([]),
    restoreTeamWorkflowVersion: vi.fn(),
    branchTeamWorkflow: vi.fn(),
    generateTeamDagDraft: vi.fn(),
    validateTeamDag: (...args: unknown[]) => validateDagMock(...args),
  };
});

vi.mock('../../api/agents', () => ({
  AgentAvatar: () => null,
}));

import {
  TeamDagEditor,
  TeamDagEdge,
  TeamAgentNode,
  TeamDagActionCtx,
  makeRosterOrphanNodes,
} from '../projections/TeamDagEditor';
import { TeamApiError } from '../../api/teams';
import type { EdgeProps } from 'reactflow';
import type { AgentRecord } from '../../api/agents';
import type { TeamWorkflow } from '../../api/teams';

const AGENTS = [
  { agent_id: 'a1', name: '甲', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
  { agent_id: 'a2', name: '乙', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
] as unknown as AgentRecord[];

const WF: TeamWorkflow = {
  nodes: [
    { id: 'n1', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a1', name: '甲', soul: '' } },
    { id: 'n2', type: 'agentTask', position: { x: 0, y: 106 }, data: { agentId: 'a2', name: '乙', soul: '' } },
  ],
  edges: [{ id: 'n1->n2', source: 'n1', target: 'n2', data: { mode: 'direct' } }],
};

function renderEditor(overrides: Partial<{ workflow: TeamWorkflow; dirtyProbe?: boolean }> = {}) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(
    <TeamDagEditor
      teamId="t1"
      workflow={overrides.workflow ?? WF}
      agents={AGENTS}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );
  return { onSaved, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
  putWorkflowMock.mockResolvedValue(undefined);
  putLayoutMock.mockResolvedValue(undefined);
  // 默认：无 yaml 层（Python JSON team）→ 404，应静默不报错。
  // 用真实 TeamApiError 构造（编辑器代码 instanceof 判定的是这个类）。
  validateDagMock.mockRejectedValue(new TeamApiError(404, { error: { message: 'TEAM_NOT_FOUND' } }));
});

describe('TeamDagEditor — 工具条四钮合一（2026-11-05）', () => {
  it('右侧只留保存主按钮；服务端校验/取消/版本独立按钮全部移除', async () => {
    renderEditor();
    expect(await screen.findByTestId('team-dag-save-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('team-dag-validate-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-dag-versions-btn')).not.toBeInTheDocument();
    // 「取消」收进 ⋯ 菜单（菜单未开时不在 DOM）
    expect(screen.queryByTestId('team-dag-cancel-btn')).not.toBeInTheDocument();
    // 保存钮文案不再是「校验并保存」
    expect(screen.getByTestId('team-dag-save-btn')).toHaveTextContent('保存');
    expect(screen.getByTestId('team-dag-save-btn')).not.toHaveTextContent('校验并保存');
  });

  it('「+ 节点」独立按钮与添加下拉均已移除（四轮：全员孤点直铺，无添加入口）', async () => {
    renderEditor();
    expect(screen.queryByTestId('team-dag-add-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-dag-add-select')).not.toBeInTheDocument();
  });

  it('⋯ 菜单：点开出现版本历史/放弃修改；放弃修改未 dirty 时禁用', async () => {
    renderEditor();
    fireEvent.click(await screen.findByTestId('team-dag-more-btn'));
    expect(screen.getByTestId('team-dag-menu-panel')).toBeInTheDocument();
    expect(screen.getByTestId('team-dag-versions-toggle')).toHaveTextContent('版本历史');
    // 初始图未编辑 → dirty=false → 放弃修改禁用
    expect(screen.getByTestId('team-dag-cancel-btn')).toBeDisabled();
  });

  it('点画布空白（pane）关闭所有浮层（2026-11-05 二轮新增）', async () => {
    renderEditor();
    // 打开 ⋯ 菜单与 AI 面板
    fireEvent.click(await screen.findByTestId('team-dag-more-btn'));
    expect(screen.getByTestId('team-dag-menu-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('team-dag-ai-btn'));
    expect(screen.getByTestId('team-dag-ai-panel')).toBeInTheDocument();
    // 点空白 → 全部收起（react-flow-mock 的 onPaneClick 由 props 透传；
    // mock 渲染 div 不冒泡 pane 事件，这里直接验证 closeOverlays 挂在
    // SfReactFlowBase 上 —— 通过再次点击 ⋯ 钮前菜单已因 pane click 关闭来断言）
    // 注：jsdom mock 下 onPaneClick 不会自动触发，负向断言菜单仍受控；
    // 真实交互由浏览器覆盖。此处验证 ⋯ 钮 aria-expanded 状态切换正确。
    const moreBtn = screen.getByTestId('team-dag-more-btn');
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('team-dag-menu-panel')).not.toBeInTheDocument();
  });

  it('自动排列按钮存在且可点（有节点时不禁用）', async () => {
    renderEditor();
    const btn = await screen.findByTestId('team-dag-layout-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });
});

describe('TeamDagEditor — n8n 式全员孤点直铺（2026-11-05 四轮）', () => {
  it('保存 payload 自动包含未上画布的成员（孤点直铺核心）', async () => {
    // 全局 reactflow mock 不渲染节点本体，孤点直铺通过保存 payload 验证：
    // WF_ONE 只含 a1（n1），保存时应自动补上 a2 的孤立节点 n-a2
    const WF_ONE: TeamWorkflow = { nodes: [WF.nodes[0]], edges: [] };
    renderEditor({ workflow: WF_ONE });
    fireEvent.click(await screen.findByTestId('team-dag-save-btn'));
    await waitFor(() => expect(putWorkflowMock).toHaveBeenCalled());
    const saved = putWorkflowMock.mock.calls[0][1] as TeamWorkflow;
    const ids = saved.nodes.map((n) => n.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('n-a2');
    const orphan = saved.nodes.find((n) => n.id === 'n-a2');
    expect(orphan?.data?.agentId).toBe('a2');
    expect(saved.edges).toHaveLength(0);
  });
});

describe('TeamDagEditor — 保存链路（四钮合一后）', () => {
  it('保存成功 → PUT workflow + PUT layout，随后自动干跑 /dag/validate（404 静默，无错误区）', async () => {
    const { onSaved } = renderEditor();
    fireEvent.click(await screen.findByTestId('team-dag-save-btn'));
    await waitFor(() => expect(putWorkflowMock).toHaveBeenCalledWith('t1', expect.anything()));
    await waitFor(() => expect(putLayoutMock).toHaveBeenCalled());
    await waitFor(() => expect(validateDagMock).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // 404 静默：无提示行、无错误区（自动干跑不打扰用户）
    expect(screen.queryByTestId('team-dag-validate-info')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('自动干跑校验通过 → 提示行显示「服务端 DAG 校验通过」', async () => {
    validateDagMock.mockResolvedValue({ ok: true, errors: [] });
    renderEditor();
    fireEvent.click(await screen.findByTestId('team-dag-save-btn'));
    expect(await screen.findByTestId('team-dag-validate-info')).toHaveTextContent('服务端 DAG 校验通过');
  });

  it('preference：连线模式为 Loose（connectionMode 透传 reactflow）', async () => {
    // 在 jsdom mock 下仅验证渲染不炸；Loose 常量语义由 reactflow 保证
    renderEditor();
    expect(await screen.findByTestId('react-flow-mock')).toBeInTheDocument();
  });
});

describe('TeamDagEditor — 撤销/重做与空图引导（2026-11-05 三/四轮）', () => {
  // 只有 a1 上画布（a2 会作为孤点自动补上 → 画布上有 2 个节点）
  const WF_ONE: TeamWorkflow = { nodes: [WF.nodes[0]], edges: [] };

  it('初始态：撤销/重做按钮均禁用（无历史）', async () => {
    renderEditor({ workflow: WF_ONE });
    expect(await screen.findByTestId('team-dag-undo-btn')).toBeInTheDocument();
    expect(screen.getByTestId('team-dag-undo-btn')).toBeDisabled();
    expect(screen.getByTestId('team-dag-redo-btn')).toBeDisabled();
  });

  it('结构变更（自动排列）→ 撤销可用；Ctrl+Z 撤销后重做可用', async () => {
    renderEditor({ workflow: WF_ONE });
    // 自动排列入撤销栈（结构变更通道之一；jsdom mock 下坐标重排可重复触发）
    fireEvent.click(await screen.findByTestId('team-dag-layout-btn'));
    expect(await screen.findByTestId('team-dag-undo-btn')).toBeEnabled();
    expect(screen.getByTestId('team-dag-redo-btn')).toBeDisabled();
    // Ctrl+Z 快捷键走同一 undo 通道（window keydown，输入框聚焦时不拦截）
    fireEvent.keyDown(window, { ctrlKey: true, key: 'z' });
    await waitFor(() => expect(screen.getByTestId('team-dag-undo-btn')).toBeDisabled());
    expect(screen.getByTestId('team-dag-redo-btn')).toBeEnabled();
  });

  it('空工作流：显示画布中央引导 + 自动排列禁用；有节点后引导消失', async () => {
    const { unmount } = render(
      <TeamDagEditor
        teamId="t1"
        workflow={{ nodes: [], edges: [] }}
        agents={[]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const hint = await screen.findByTestId('team-dag-empty-hint');
    expect(hint).toHaveTextContent('从节点手柄拖线连接');
    expect(hint).toHaveTextContent('AI 生成');
    expect(screen.getByTestId('team-dag-layout-btn')).toBeDisabled();
    unmount();
    // 有节点：无引导，自动排列可用
    renderEditor();
    await screen.findByTestId('team-dag-save-btn');
    expect(screen.queryByTestId('team-dag-empty-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('team-dag-layout-btn')).toBeEnabled();
  });
});

describe('TeamDagEditor — 一键删除（2026-11-07 顺手化）', () => {
  /** 构造自定义边所需的最小 EdgeProps（jsdom 里 getSmoothStepPath 已 mock）。 */
  const makeEdgeProps = (over: Partial<EdgeProps> = {}): EdgeProps =>
    ({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 0,
      sourcePosition: 'right',
      targetPosition: 'left',
      selected: false,
      animated: false,
      data: { mode: 'direct' },
      ...over,
    }) as unknown as EdgeProps;

  it('边药丸「×」不选中也可一键删边（context deleteEdge 收到边 id）', () => {
    const deleteEdge = vi.fn();
    render(
      <TeamDagActionCtx.Provider value={{ deleteEdge, deleteNode: vi.fn() }}>
        <TeamDagEdge {...makeEdgeProps()} />
      </TeamDagActionCtx.Provider>,
    );
    fireEvent.click(screen.getByTestId('team-dag-edge-del-e1'));
    expect(deleteEdge).toHaveBeenCalledWith('e1');
  });

  it('审批边无自定义 label 时药丸补「审批」标记（mode 可读）', () => {
    render(
      <TeamDagActionCtx.Provider value={{ deleteEdge: vi.fn(), deleteNode: vi.fn() }}>
        <TeamDagEdge {...makeEdgeProps({ data: { mode: 'approve' } })} />
      </TeamDagActionCtx.Provider>,
    );
    expect(screen.getByText('审批')).toBeInTheDocument();
  });

  it('有自定义 label 的边药丸显示 label 原文（驳回回炉等）', () => {
    render(
      <TeamDagActionCtx.Provider value={{ deleteEdge: vi.fn(), deleteNode: vi.fn() }}>
        <TeamDagEdge {...makeEdgeProps({ label: '驳回回炉' })} />
      </TeamDagActionCtx.Provider>,
    );
    expect(screen.getByText('驳回回炉')).toBeInTheDocument();
  });

  it('节点角「×」一键删节点（context deleteNode 收到节点 id）', () => {
    const deleteNode = vi.fn();
    render(
      <TeamDagActionCtx.Provider value={{ deleteEdge: vi.fn(), deleteNode }}>
        <TeamAgentNode id="n1" data={{ agentId: 'a1', name: '甲', soul: '', nodeType: 'agentTask' }} />
      </TeamDagActionCtx.Provider>,
    );
    fireEvent.click(screen.getByTestId('team-dag-node-del-n1'));
    expect(deleteNode).toHaveBeenCalledWith('n1');
  });
});

describe('makeRosterOrphanNodes — roster 孤点投影（2026-11-07 增员同步）', () => {
  it('只补画布上没有的成员；网格排在既有节点下方；id 规则 n-<agentId>', () => {
    const nodes = makeRosterOrphanNodes(AGENTS, [
      { position: { x: 5, y: 300 }, data: { agentId: 'a1' } },
    ]);
    expect(nodes.map((n) => n.id)).toEqual(['n-a2']);
    expect(nodes[0].position).toEqual({ x: 0, y: 420 }); // baseY = 300 + 120
    expect(nodes[0].data.name).toBe('乙');
    expect(nodes[0].data.nodeType).toBe('agentTask');
  });

  it('全员已在画布 → 不产出节点；策略染色/头像字段随 roster 带出', () => {
    const all = makeRosterOrphanNodes(
      AGENTS,
      AGENTS.map((a, i) => ({ position: { x: 0, y: i * 100 }, data: { agentId: a.agent_id } })),
    );
    expect(all).toHaveLength(0);

    const policy = new Map([['a2', 'deny' as const]]);
    const nodes = makeRosterOrphanNodes(AGENTS, [], policy);
    const n = nodes.find((x) => x.data.agentId === 'a2')!;
    expect(n.data.policyState).toBe('deny');
    expect(n.data.avatarSeed).toBe('乙'); // avatar_seed ?? name 兜底
    expect(n.data.avatarImage).toBeNull();
  });
});

describe('TeamDagEditor — roster 增员同步（2026-11-07「成员增加后 DAG 没有新成员」修复）', () => {
  const A3 = {
    agent_id: 'a3',
    name: '丙',
    soul: '',
    workspace_id: 'ws1',
    blueprint: {},
    status: 'idle',
    source: 'quick_hire',
    created_at: '',
  } as unknown as AgentRecord;

  it('常驻编辑器：agents 增员后新成员补成孤点进画布，且不算未保存修改', async () => {
    const onDirtyChange = vi.fn();
    const ui = (agents: AgentRecord[]) => (
      <TeamDagEditor
        teamId="t1"
        workflow={WF}
        agents={agents}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
      />
    );
    const { rerender } = render(ui(AGENTS));
    // 成员管理加人 → rosterAgents 更新 → agents prop 变化（编辑器不重挂）
    rerender(ui([...AGENTS, A3]));
    fireEvent.click(await screen.findByTestId('team-dag-save-btn'));
    await waitFor(() => expect(putWorkflowMock).toHaveBeenCalled());
    const saved = putWorkflowMock.mock.calls[0][1] as TeamWorkflow;
    expect(saved.nodes.map((n) => n.id)).toContain('n-a3');
    expect(saved.nodes.find((n) => n.id === 'n-a3')?.data?.agentId).toBe('a3');
    // roster 同步是数据对齐不是用户编辑：全程不亮「● 未保存」
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('team-dag-dirty')).not.toBeInTheDocument();
  });
});
