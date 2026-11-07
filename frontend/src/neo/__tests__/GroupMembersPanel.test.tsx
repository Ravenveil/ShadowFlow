/**
 * GroupMembersPanel — NeoHost「成员」tab 测试（W2 钉钉式融合，2026-08-22；
 * 2026-08-23 L6：审批门升级为真实审批队列 + 新增群简报折叠区；
 * 2026-08-23 改版：成员区改头像网格（角色并入 title）、工作流区换
 * TeamDagCanvas 只读画布 + 折叠边明细；reactflow 由 src/test/setup.ts 全局 mock）。
 *
 * 覆盖：成员网格（头像/名字/状态点/角色 title）、团队 DAG（画布挂载 +
 * 边明细 + 规模 meta）、审批队列（pending 渲染 / 批准 / 驳回行内理由输入 /
 * 已驳回留痕 / 空态 / 操作后刷新）、简报（entries 渲染 / 空态）。数据源全部
 * mock 在 api 层，组件本身不 mock。
 */
import { render, screen, waitFor, fireEvent, act } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const groupRecord: Record<string, unknown> = {
  group_id: 'g1',
  name: '论文深读小队',
  kind: 'group',
  agent_ids: ['a1', 'a2'],
  team_id: 't1',
};

vi.mock('../../api/groupApi', () => ({
  getGroup: vi.fn(() => Promise.resolve(groupRecord)),
  fetchBriefBoard: vi.fn(() => Promise.resolve({ date: '2026-08-23', entries: [] })),
}));

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn(() =>
    Promise.resolve([
      {
        agent_id: 'a1',
        name: '读读',
        soul: '',
        workspace_id: 'ws1',
        blueprint: { role: 'READER' },
        status: 'running',
        source: 'quick_hire',
        created_at: '',
      },
      {
        agent_id: 'a2',
        name: '阿批',
        soul: '',
        workspace_id: 'ws1',
        blueprint: {},
        status: 'idle',
        source: 'quick_hire',
        created_at: '',
      },
    ]),
  ),
}));

const workflow: Record<string, unknown> = {
  nodes: [
    { id: 'n1', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a1', name: '读读', soul: '' } },
    { id: 'n2', type: 'agentTask', position: { x: 200, y: 0 }, data: { agentId: 'a2', name: '阿批', soul: '' } },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { mode: 'approve' } }],
};
vi.mock('../../api/teams', () => ({
  getTeamWorkflow: vi.fn(() => Promise.resolve(workflow)),
}));

// stub 只读画布：reactflow 全局 mock 无 default 导出，真实 SfReactFlowBase
// 在 jsdom 里跑不起来；这里只验证「拿到 workflow 即挂载画布」的契约，
// TeamWorkflow→nodes/edges 投影由 TeamDagCanvas.test.ts 直测纯函数。
vi.mock('../projections/TeamDagCanvas', () => ({
  __esModule: true,
  default: ({ workflow: wf }: { workflow: { nodes: unknown[]; edges: unknown[] } }) => (
    <div data-testid="neo-gm-dag-canvas">
      {`stub:${wf.nodes.length}n/${wf.edges.length}e`}
    </div>
  ),
  TeamDagCanvas: ({ workflow: wf }: { workflow: { nodes: unknown[]; edges: unknown[] } }) => (
    <div data-testid="neo-gm-dag-canvas">
      {`stub:${wf.nodes.length}n/${wf.edges.length}e`}
    </div>
  ),
}));

const pendingItem: Record<string, unknown> = {
  approval_id: 'ap1',
  run_id: 'r1',
  gate_id: 'gate-qa',
  submitter_name: '阿批',
  submitter_kind: 'acp',
  summary: '将发布对外公告，风险：对外可见',
  triggered_at: '2026-08-23T01:00:00Z',
  waiting_seconds: 125,
};

// 捕获 SSE 回调，测试里手动发 approval.resolved 帧验证已驳回留痕
const approvalSse = vi.hoisted(() => ({
  handler: undefined as ((evt: Record<string, unknown>) => void) | undefined,
}));

vi.mock('../../api/approvals', () => ({
  listPendingApprovals: vi.fn(() => Promise.resolve([])),
  approveApproval: vi.fn(() =>
    Promise.resolve({ status: 'approved', run_id: 'r1', gate_id: 'gate-qa' }),
  ),
  rejectApproval: vi.fn(() =>
    Promise.resolve({ status: 'rejected', run_id: 'r1', gate_id: 'gate-qa' }),
  ),
  subscribeApprovalEvents: vi.fn((cb: (evt: Record<string, unknown>) => void) => {
    approvalSse.handler = cb;
    return () => {};
  }),
}));

import { GroupMembersPanel } from '../projections/GroupMembersPanel';
import { fetchBriefBoard } from '../../api/groupApi';
import {
  approveApproval,
  listPendingApprovals,
  rejectApproval,
} from '../../api/approvals';

const mockFetchBrief = vi.mocked(fetchBriefBoard);
const mockListPending = vi.mocked(listPendingApprovals);
const mockApprove = vi.mocked(approveApproval);
const mockReject = vi.mocked(rejectApproval);

beforeEach(() => {
  vi.clearAllMocks();
  approvalSse.handler = undefined;
  groupRecord.agent_ids = ['a1', 'a2'];
  groupRecord.team_id = 't1';
  workflow.edges = [{ id: 'e1', source: 'n1', target: 'n2', data: { mode: 'approve' } }];
  mockListPending.mockResolvedValue([]);
  mockFetchBrief.mockResolvedValue({ date: '2026-08-23', entries: [] });
});

describe('GroupMembersPanel — 成员 + DAG', () => {
  it('成员网格：头像格子 + 名字小字 + 状态点；角色并入 title', async () => {
    const { container } = render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-members');
    expect(sec.querySelectorAll('.neo-gm-cell').length).toBe(2);
    expect(sec).toHaveTextContent('读读');
    expect(sec).toHaveTextContent('阿批');
    // 角色 badge 不再独立渲染，并入格子 title
    expect(sec.querySelector('.neo-gm-cell')?.getAttribute('title')).toBe('读读 · READER');
    expect(container.querySelector('.neo-gm-dot--running')).not.toBeNull();
    expect(container.querySelector('.neo-gm-dot--idle')).not.toBeNull();
  });

  it('DAG：只读画布 + 规模 meta + 折叠边明细', async () => {
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-dag');
    // workflow 是群记录结算后第二跳拉取，等内容出现而非首帧空态
    await waitFor(() => expect(sec).toHaveTextContent('2 节点 · 1 边'));
    expect(sec.querySelector('[data-testid="neo-gm-dag-canvas"]')).not.toBeNull();
    // 边明细降级为画布下方 <details>（文字 chips 已移除）
    expect(sec.querySelector('.neo-gm-chip')).toBeNull();
    const details = sec.querySelector('.neo-gm-dag-details');
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent('读读');
    expect(details).toHaveTextContent('阿批');
    expect(details).toHaveTextContent('approve');
  });
});

describe('GroupMembersPanel — L6 审批队列', () => {
  it('pending 列表：发起人 + 风险摘要 + 等待时长 + 批准/驳回按钮', async () => {
    mockListPending.mockResolvedValue([pendingItem] as never);
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-approval');
    await waitFor(() => expect(sec).toHaveTextContent('阿批'));
    expect(sec).toHaveTextContent('将发布对外公告，风险：对外可见');
    expect(sec).toHaveTextContent('已等待 2min');
    expect(sec.querySelectorAll('.neo-gm-approval-item').length).toBe(1);
    expect(sec.querySelector('.neo-gm-btn--approve')).not.toBeNull();
    expect(sec.querySelector('.neo-gm-btn--reject')).not.toBeNull();
  });

  it('批准：真实调 approve 端点，操作后刷新队列（回到空态）', async () => {
    mockListPending.mockResolvedValueOnce([pendingItem] as never);
    mockListPending.mockResolvedValue([]);
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-approval');
    const btn = await waitFor(() => {
      const el = sec.querySelector('.neo-gm-btn--approve');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(btn);
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith('ap1'));
    // 操作后 refresh → 第二跳返回空 → 空态
    await waitFor(() => expect(sec).toHaveTextContent('暂无待审批事项'));
  });

  it('驳回：行内展开理由输入（默认空可跳过），确认后调 reject 端点', async () => {
    mockListPending.mockResolvedValue([pendingItem] as never);
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-approval');
    const btn = await waitFor(() => {
      const el = sec.querySelector('.neo-gm-btn--reject');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(btn);
    // 行内展开输入框，此时未调端点
    await waitFor(() =>
      expect(sec.querySelector('.neo-gm-approval-rejectbox-input')).not.toBeNull(),
    );
    expect(mockReject).not.toHaveBeenCalled();
    // 空理由直接确认 → reason 为空串
    const confirm = sec.querySelector(
      '.neo-gm-approval-rejectbox .neo-gm-btn--reject',
    ) as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(mockReject).toHaveBeenCalledWith('ap1', ''));
  });

  it('驳回带理由：输入后确认 → reject 带 reason，成功后留痕展示', async () => {
    mockListPending.mockResolvedValue([pendingItem] as never);
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-approval');
    const btn = await waitFor(() => {
      const el = sec.querySelector('.neo-gm-btn--reject');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(btn);
    const input = (await waitFor(() => {
      const el = sec.querySelector('.neo-gm-approval-rejectbox-input');
      expect(el).not.toBeNull();
      return el;
    })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '内容不合规' } });
    const confirm = sec.querySelector(
      '.neo-gm-approval-rejectbox .neo-gm-btn--reject',
    ) as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(mockReject).toHaveBeenCalledWith('ap1', '内容不合规'));
    // 本地留痕（无 SSE 的轮询环境也展示已驳回 + 理由）
    await waitFor(() => expect(sec).toHaveTextContent('已驳回'));
    expect(sec).toHaveTextContent('内容不合规');
    expect(sec.querySelector('.neo-gm-approval-rejected-name')).toHaveTextContent('阿批');
  });

  it('驳回取消：输入框收起，不调端点', async () => {
    mockListPending.mockResolvedValue([pendingItem] as never);
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-approval');
    const btn = await waitFor(() => {
      const el = sec.querySelector('.neo-gm-btn--reject');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(sec.querySelector('.neo-gm-approval-rejectbox-input')).not.toBeNull(),
    );
    const cancel = Array.from(
      sec.querySelectorAll('.neo-gm-approval-rejectbox .neo-gm-btn'),
    ).find((b) => b.textContent === '取消') as HTMLElement;
    fireEvent.click(cancel);
    await waitFor(() =>
      expect(sec.querySelector('.neo-gm-approval-rejectbox-input')).toBeNull(),
    );
    expect(mockReject).not.toHaveBeenCalled();
  });

  it('SSE approval.resolved 带 reason → 已驳回留痕；approve 不留痕', async () => {
    mockListPending.mockResolvedValue([]);
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-approval');
    await waitFor(() => expect(approvalSse.handler).toBeDefined());
    act(() => {
      approvalSse.handler?.({
        type: 'approval.resolved',
        approval_id: 'ap9',
        run_id: 'r9',
        gate_id: 'gate-x',
        group_id: 'g1',
        decision: 'approve',
        reason: '',
      });
    });
    expect(sec.querySelector('.neo-gm-approval-rejected')).toBeNull();
    act(() => {
      approvalSse.handler?.({
        type: 'approval.resolved',
        approval_id: 'ap9',
        run_id: 'r9',
        gate_id: 'gate-x',
        group_id: 'g1',
        decision: 'reject',
        reason: '预算超限',
      });
    });
    await waitFor(() => expect(sec).toHaveTextContent('已驳回'));
    expect(sec).toHaveTextContent('预算超限');
    expect(sec.querySelector('.neo-gm-approval-rejected-name')).toHaveTextContent('gate-x');
  });

  it('无 pending → 审批门空态；群未绑 team → DAG 空态（不 mock 假数据）', async () => {
    workflow.edges = [];
    groupRecord.team_id = null;
    render(<GroupMembersPanel groupId="g1" />);
    expect(await screen.findByTestId('neo-gm-approval')).toHaveTextContent('暂无待审批事项');
    expect(await screen.findByTestId('neo-gm-dag')).toHaveTextContent('该群未绑定团队工作流');
  });
});

describe('GroupMembersPanel — 群简报折叠区', () => {
  it('有产出：agent 名 + 摘要 + HH:MM 时间', async () => {
    mockFetchBrief.mockResolvedValue({
      date: '2026-08-23',
      entries: [
        {
          agent_name: '读读',
          agent_kind: 'acp',
          summary: '完成论文摘要第一轮',
          timestamp: '2026-08-23T01:30:00Z',
        },
      ],
    } as never);
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-brief');
    await waitFor(() => expect(sec).toHaveTextContent('完成论文摘要第一轮'));
    expect(sec).toHaveTextContent('读读');
    expect(sec).toHaveTextContent('01:30');
  });

  it('无产出 → 空态', async () => {
    render(<GroupMembersPanel groupId="g1" />);
    const sec = await screen.findByTestId('neo-gm-brief');
    await waitFor(() => expect(sec).toHaveTextContent('今日暂无产出'));
  });
});
