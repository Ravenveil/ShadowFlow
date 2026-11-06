/**
 * NeoAgentInspector — Agent 检查器测试（2026-11-05 Task#11；2026-11-06 ZCode
 * 后台活动式升级）。
 *
 * 覆盖：
 *   - 活动流过滤：assistant_text/raw 按 agent_id 命中；thinking 按 agent_id
 *     命中（老数据无 agent_id 回落 label 前缀）；tool_call/tool_echo 按
 *     agent_id 命中；hop_card 按 from/to_agent 命中；他人消息/过程卡/hop 不
 *     串台；无归属 run 产物卡（plan_card 等）不进流；
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
