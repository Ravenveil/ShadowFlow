/**
 * NeoAgentInspector — Agent 检查器测试（2026-11-05 Task#11；2026-11-06 ZCode
 * 后台活动式升级）。
 *
 * 覆盖：
 *   - 活动流过滤：assistant_text/raw 按 agent_id 命中；thinking 按 agent_id
 *     命中（老数据无 agent_id 回落 label 前缀）；tool_call/tool_echo 按
 *     agent_id 命中；hop_card 按 from/to_agent 命中；他人消息/过程卡/hop 不
 *     串台；plan_card 含其任务行（行 agent_id / 行 id node:<agentId>）命中、
 *     不含不命中；commit_record/file_diff 等 run 产物卡有 agent_id 按 id 筛、
 *     无归属（老数据/编排者合并提交）不进流；
 *   - 空活动 → 干净空态文案；
 *   - 「发起私聊」（头部图标钮）：resolveDmConversation 成功 → onOpenDm；
 *     失败 → 错误文案（不 navigation）；
 *   - 「返回群聊」钮（←）与「×」关闭 → onClose。
 */
import { render, screen, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TimelineMessage } from '../../components/run-session/timeline/types';

const timelineState = {
  messages: [] as TimelineMessage[],
  runs: [] as Array<{ session_id: string; status: string }>,
  loading: false,
  error: null as string | null,
  truncated: false,
  appendLocalUser: vi.fn(),
};
vi.mock('../../core/hooks/useGroupTimeline', () => ({
  useGroupTimeline: () => timelineState,
}));

const resolveDm = vi.fn();
vi.mock('../../api/groupApi', () => ({
  resolveDmConversation: (...args: unknown[]) => resolveDm(...args),
}));

const getAgentMock = vi.fn();
vi.mock('../../api/agents', () => ({
  getAgent: (...args: unknown[]) => getAgentMock(...args),
}));

vi.mock('../NeoTimeline', () => ({
  NeoTimeline: (props: { messages: TimelineMessage[] }) => (
    <div data-testid="inspect-tl-stub">{props.messages.map((m) => m.id).join(',')}</div>
  ),
}));

import { NeoAgentInspector } from '../NeoAgentInspector';

const now = Date.now();

function renderInspector(overrides: Partial<Parameters<typeof NeoAgentInspector>[0]> = {}) {
  return render(
    <NeoAgentInspector
      agentId="a1"
      name="Scout · 商机扫描"
      groupId="g1"
      onOpenDm={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  timelineState.messages = [];
  timelineState.loading = false;
  getAgentMock.mockResolvedValue(null);
  resolveDm.mockResolvedValue('dm-9');
});

describe('NeoAgentInspector · 活动流过滤', () => {
  it('只保留该 agent 的发言/过程卡/工具卡/交接边，他人内容不串台', () => {
    timelineState.messages = [
      { id: 'm1', kind: 'user_turn', turn_id: 't1', ts: now, text: '大家好' },
      {
        id: 'm2', kind: 'assistant_text', turn_id: 't1', ts: now,
        body: '我的发言', agent_id: 'a1', sender_name: 'Scout · 商机扫描',
      } as TimelineMessage,
      {
        id: 'm3', kind: 'assistant_text', turn_id: 't1', ts: now,
        body: '别人的发言', agent_id: 'a2', sender_name: 'Matcher',
      } as TimelineMessage,
      {
        // 新数据：thinking 带 agent_id → 按 id 命中
        id: 'm4', kind: 'thinking', turn_id: 't1', ts: now,
        label: 'Scout · 商机扫描 正在思考', status: 'streaming', agent_id: 'a1',
      } as TimelineMessage,
      {
        // 老数据：thinking 无 agent_id → label 前缀兜底命中
        id: 'm5', kind: 'thinking', turn_id: 't1', ts: now,
        label: 'Scout · 商机扫描 正在思考', status: 'streaming',
      } as TimelineMessage,
      {
        id: 'm6', kind: 'thinking', turn_id: 't1', ts: now,
        label: 'Matcher · 匹配 正在思考', status: 'streaming',
      } as TimelineMessage,
      {
        id: 'm7', kind: 'tool_call', turn_id: 't1', ts: now,
        name: 'web_search', args_summary: '{"q":"氢能"}', status: 'running', agent_id: 'a1',
      } as TimelineMessage,
      {
        id: 'm8', kind: 'tool_call', turn_id: 't1', ts: now,
        name: 'bash', args_summary: 'ls', status: 'running', agent_id: 'a2',
      } as TimelineMessage,
      {
        id: 'm9', kind: 'tool_echo', turn_id: 't1', ts: now,
        body: '…结果…', agent_id: 'a1',
      } as TimelineMessage,
      {
        id: 'm10', kind: 'hop_card', turn_id: 't1', ts: now,
        from_agent: 'a1', to_agent: 'a2', from_name: 'Scout', to_name: 'Matcher', status: 'pending',
      } as TimelineMessage,
      {
        id: 'm11', kind: 'hop_card', turn_id: 't1', ts: now,
        from_agent: 'a3', to_agent: 'a2', from_name: 'X', to_name: 'Matcher', status: 'pending',
      } as TimelineMessage,
      {
        // 无归属 run 产物卡：不猜归属 → 不进流
        id: 'm12', kind: 'plan_card', turn_id: 't1', ts: now,
        title: '计划', tasks: [],
      } as TimelineMessage,
    ];
    renderInspector();
    const stub = screen.getByTestId('inspect-tl-stub');
    expect(stub.textContent).toBe('m2,m4,m5,m7,m9,m10');
  });

  it('空活动 → 干净空态', () => {
    renderInspector();
    expect(screen.getByText('本回合还没有它的后台活动')).toBeTruthy();
  });

  it('产出卡归属 — plan_card 含其任务行 / commit_record/file_diff 有 agent_id 命中，无归属不进流', () => {
    timelineState.messages = [
      {
        // plan_card 行带 agent_id → 命中（含他人行的整卡也进流）
        id: 'p1', kind: 'plan_card', turn_id: 't1', ts: now,
        title: '计划',
        tasks: [
          { id: 'node:a1', title: 'A 活', assignee: 'Scout', agent_id: 'a1', status: 'done' },
          { id: 'node:a2', title: 'B 活', assignee: 'Matcher', agent_id: 'a2', status: 'done' },
        ],
      } as TimelineMessage,
      {
        // 老数据行：无 agent_id，行 id `node:<agentId>` 确定性命中
        id: 'p2', kind: 'plan_card', turn_id: 't1', ts: now,
        title: '旧计划',
        tasks: [{ id: 'node:a1', title: 'A 活', assignee: 'Scout', status: 'done' }],
      } as TimelineMessage,
      {
        // 只有别人的行 → 不进流
        id: 'p3', kind: 'plan_card', turn_id: 't1', ts: now,
        title: '别人的计划',
        tasks: [{ id: 'node:a2', title: 'B 活', assignee: 'Matcher', agent_id: 'a2', status: 'done' }],
      } as TimelineMessage,
      {
        // commit_record 带归属 → 命中
        id: 'c1', kind: 'commit_record', turn_id: 't1', ts: now,
        repo: 'r', sha: 'aaa', short_sha: 'aaa', message: 'm', author: 'Scout',
        files_changed: 1, insertions: 1, deletions: 0, agent_id: 'a1',
      } as TimelineMessage,
      {
        id: 'c2', kind: 'commit_record', turn_id: 't1', ts: now,
        repo: 'r', sha: 'bbb', short_sha: 'bbb', message: 'm', author: 'Matcher',
        files_changed: 1, insertions: 1, deletions: 0, agent_id: 'a2',
      } as TimelineMessage,
      {
        // 无归属（编排者合并提交/老数据）→ 不进流
        id: 'c3', kind: 'commit_record', turn_id: 't1', ts: now,
        repo: 'r', sha: 'ccc', short_sha: 'ccc', message: 'm', author: '编排者',
        files_changed: 1, insertions: 1, deletions: 0,
      } as TimelineMessage,
      {
        // file_diff 带归属 → 命中
        id: 'd1', kind: 'file_diff', turn_id: 't1', ts: now,
        path: 'a.ts', added: 1, removed: 0, lines: [], agent_id: 'a1',
      } as TimelineMessage,
    ];
    renderInspector();
    const stub = screen.getByTestId('inspect-tl-stub');
    expect(stub.textContent).toBe('p1,p2,c1,d1');
  });

  it('run 产物卡通用策略 — 任何卡带 agent_id 按 id 筛，无归属不进流', () => {
    timelineState.messages = [
      {
        id: 'x1', kind: 'artifact_card', turn_id: 't1', ts: now,
        artifact_type: 'html', filename: 'a.html', agent_id: 'a1',
      } as TimelineMessage,
      {
        id: 'x2', kind: 'artifact_card', turn_id: 't1', ts: now,
        artifact_type: 'html', filename: 'b.html', agent_id: 'a2',
      } as TimelineMessage,
      {
        id: 'x3', kind: 'artifact_card', turn_id: 't1', ts: now,
        artifact_type: 'html', filename: 'c.html',
      } as TimelineMessage,
    ];
    renderInspector();
    const stub = screen.getByTestId('inspect-tl-stub');
    expect(stub.textContent).toBe('x1');
  });
});

describe('NeoAgentInspector · 发起私聊', () => {
  it('resolveDmConversation 成功 → onOpenDm(dmGroupId)', async () => {
    const onOpenDm = vi.fn();
    renderInspector({ onOpenDm });
    await waitFor(() => screen.getByTestId('neo-agent-inspector-dm'));
    (screen.getByTestId('neo-agent-inspector-dm') as HTMLButtonElement).click();
    await waitFor(() => expect(onOpenDm).toHaveBeenCalledWith('dm-9'));
    expect(resolveDm).toHaveBeenCalledWith('a1');
  });

  it('resolve 失败 → 错误文案，不 onOpenDm', async () => {
    resolveDm.mockRejectedValue(new Error('boom'));
    const onOpenDm = vi.fn();
    renderInspector({ onOpenDm });
    await waitFor(() => screen.getByTestId('neo-agent-inspector-dm'));
    (screen.getByTestId('neo-agent-inspector-dm') as HTMLButtonElement).click();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onOpenDm).not.toHaveBeenCalled();
  });
});

describe('NeoAgentInspector · 返回/关闭', () => {
  it('← 返回群聊钮 → onClose', () => {
    const onClose = vi.fn();
    renderInspector({ onClose });
    (screen.getByTestId('neo-agent-inspector-back') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('× 钮 → onClose', () => {
    const onClose = vi.fn();
    renderInspector({ onClose });
    (screen.getByTestId('neo-agent-inspector-close') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
