/**
 * NeoGroupChat — W2 钉钉式气泡流 + DM 文案分岔测试（2026-08-22）。
 *
 * 覆盖：
 *   - segmentTurn 纯逻辑：user/agent/system 分类 + 连续过程卡合并；
 *   - 群聊空态 = 群文案（标题 + hint）；DM（kind='dm'）→ neo.dm.* 文案
 *     （空态只出标题、composer placeholder、顶栏 Agent 真实头像 + 名字，
 *     Grok 单聊形态，无成员计数）；
 *   - 气泡流：agent 消息出头像/名字/角色 badge，system 消息居中弱化条，
 *     用户消息右对齐行；pin/reactions 动作回调仍透传进 NeoTimeline。
 */
import { render, screen, waitFor, fireEvent } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineMessage } from '../../components/run-session/timeline/types';

// ── 可控 timeline mock ──────────────────────────────────────────────────────
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

// ── 群记录 mock（每条用例按需改写） ─────────────────────────────────────────
const groupRecord: Record<string, unknown> = {
  group_id: 'g1',
  name: '论文深读小队',
  kind: 'group',
  agent_ids: ['a1'],
  messages: [],
};
// 交接记录 mock（2026-11-05 迭代六：hops 面板数据源）。
const hopsData: Array<Record<string, unknown>> = [];
vi.mock('../../api/groupApi', () => ({
  getGroup: vi.fn(() => Promise.resolve(groupRecord)),
  postGroupMessage: vi.fn(() => Promise.resolve({})),
  addGroupMembers: vi.fn(),
  removeGroupMember: vi.fn(),
  stopGroupChat: vi.fn(() => Promise.resolve(false)),
  fetchGroupHops: vi.fn(() => Promise.resolve(hopsData)),
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
    ]),
  ),
}));

// stub 重组件：NeoTimeline 只回显消息 id（渲染契约另由它自己的测试覆盖），
// NeoComposer 回显 mentionItems（@ 提及成员接线契约，2026-11-05）。
vi.mock('../NeoTimeline', () => ({
  NeoTimeline: (props: { messages: TimelineMessage[] }) => (
    <div data-testid="tl-stub">{props.messages.map((m) => m.id).join(',')}</div>
  ),
}));
vi.mock('../NeoComposer', () => ({
  NeoComposer: (props: {
    placeholder?: string;
    mentionItems?: Array<{ id: string; name: string; role?: string }>;
  }) => (
    <div data-testid="composer-stub">
      {props.placeholder}
      <span data-testid="mention-items">
        {(props.mentionItems ?? []).map((m) => `${m.id}:${m.name}`).join('|')}
      </span>
    </div>
  ),
}));

import {
  NeoGroupChat,
  segmentTurn,
  dropSettledThinking,
  agentHasReply,
  agentHasActivity,
} from '../NeoGroupChat';

function renderChat() {
  return render(
    <MemoryRouter>
      <NeoGroupChat groupId="g1" embedded />
    </MemoryRouter>,
  );
}

const now = Date.now();

beforeEach(() => {
  vi.clearAllMocks();
  timelineState.messages = [];
  timelineState.runs = [];
  timelineState.loading = false;
  timelineState.error = null;
  groupRecord.kind = 'group';
  groupRecord.agent_ids = ['a1'];
  hopsData.length = 0;
});

describe('segmentTurn — turn 内钉钉分段', () => {
  it('user/agent/system 分类正确，连续过程卡合并为一段', () => {
    const msgs = [
      { id: 'u1', kind: 'user_turn', text: 'hi', turn_id: 't', ts: 1 },
      { id: 'p1', kind: 'thinking', label: '想', status: 'done', turn_id: 't', ts: 2 },
      { id: 'p2', kind: 'tool_call', name: 'fs.read', args_summary: '', turn_id: 't', ts: 3 },
      { id: 'a1', kind: 'assistant_text', body: 'done', sender_name: '读读', agent_id: 'a1', turn_id: 't', ts: 4 },
      { id: 's1', kind: 'raw', body: '系统通知', sender_name: 'system', turn_id: 't', ts: 5 },
    ] as TimelineMessage[];
    const segs = segmentTurn(msgs);
    expect(segs.map((s) => s.type)).toEqual(['user', 'process', 'agent', 'system']);
    const proc = segs[1];
    expect(proc.type === 'process' && proc.messages.map((m) => m.id)).toEqual(['p1', 'p2']);
  });

  it('无 sender_name 的 assistant_text 归为过程段（run 产出不进气泡）', () => {
    const msgs = [
      { id: 'a1', kind: 'assistant_text', body: 'run 输出', turn_id: 't', ts: 1 },
    ] as TimelineMessage[];
    expect(segmentTurn(msgs).map((s) => s.type)).toEqual(['process']);
  });
});

describe('dropSettledThinking — 说完后不显示深度思考（2026-11-07 用户反馈）', () => {
  it('只保留 streaming 思考卡，收口（done）的整卡撤下', () => {
    const msgs = [
      { id: 'u1', kind: 'user_turn', text: 'hi', turn_id: 't', ts: 1 },
      { id: 'th1', kind: 'thinking', label: '正在思考', status: 'streaming', turn_id: 't', ts: 2 },
      { id: 'th2', kind: 'thinking', label: '深度思考', status: 'done', turn_id: 't', ts: 3 },
      { id: 'a1', kind: 'assistant_text', body: 'ok', sender_name: '读读', agent_id: 'a1', turn_id: 't', ts: 4 },
    ] as TimelineMessage[];
    expect(dropSettledThinking(msgs).map((m) => m.id)).toEqual(['u1', 'th1', 'a1']);
  });
});

describe('NeoGroupChat — DM 文案分岔', () => {
  it('群聊空态：群文案标题 + hint', async () => {
    renderChat();
    expect(await screen.findByText('群里还没有动静')).toBeInTheDocument();
    expect(screen.getByText('在下面说句话，Agents 就开始干活')).toBeInTheDocument();
    expect(screen.getByTestId('composer-stub')).toHaveTextContent('在群里说话');
  });

  it('DM：空态只出「还没有对话」、顶栏出 Agent 真实头像 + 名字（Grok 单聊形态）', async () => {
    groupRecord.kind = 'dm';
    renderChat();
    expect(await screen.findByText('还没有对话')).toBeInTheDocument();
    expect(screen.queryByText('群里还没有动静')).not.toBeInTheDocument();
    expect(screen.queryByText('在下面说句话，Agents 就开始干活')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('composer-stub')).toHaveTextContent('发消息，TA 就开始干活');
    });
    // Grok 单聊形态（2026-11-04）：顶栏不再用群聊图标、不再出「· N 位员工」
    // 计数，改为对方 Agent 的真实头像（AgentAvatar，与侧栏/气泡同源）+ 名字。
    const titleEl = document.querySelector('.neo-gc-title');
    expect(titleEl).not.toBeNull();
    const titleAvatar = titleEl!.querySelector('.neo-gc-title-avatar');
    expect(titleAvatar).not.toBeNull();
    expect(titleAvatar!.getAttribute('title')).toBe('读读');
    expect(titleEl!.textContent).toContain('读读');
    expect(screen.queryByText('· 1 位员工')).not.toBeInTheDocument();
    expect(screen.queryByText(/个 Agent/)).not.toBeInTheDocument();
  });
});

describe('NeoGroupChat — 钉钉气泡流', () => {
  it('agent 气泡带头像/名字/角色 badge，system 居中弱化条，用户消息右对齐行', async () => {
    timelineState.messages = [
      { id: 'chat_m1', kind: 'user_turn', text: '开始读', turn_id: 't1', ts: now },
      { id: 'chat_m2', kind: 'assistant_text', body: '已抓取 PDF', sender_name: '读读', agent_id: 'a1', turn_id: 't1', ts: now },
      { id: 'chat_m3', kind: 'raw', body: 'run #042 启动', sender_name: 'system', turn_id: 't1', ts: now },
    ] as TimelineMessage[];
    const { container } = renderChat();

    // agent 气泡：名字 + 角色 badge（blueprint.role）
    const bubble = (await screen.findAllByTestId('neo-gc-msg'))[0];
    expect(bubble).toHaveTextContent('读读');
    await waitFor(() => expect(bubble).toHaveTextContent('READER'));
    // 气泡体仍由 NeoTimeline 渲染该条消息
    expect(bubble.querySelector('[data-testid="tl-stub"]')).toHaveTextContent('chat_m2');

    // system 消息：居中弱化条，直接出文本
    const sys = container.querySelector('.neo-gc-sys');
    expect(sys).toHaveTextContent('run #042 启动');

    // 用户消息：右对齐行包裹 NeoTimeline
    const userRow = container.querySelector('.neo-gc-user-row');
    expect(userRow?.querySelector('[data-testid="tl-stub"]')).toHaveTextContent('chat_m1');

    // 日分段分隔行仍在
    expect(container.querySelector('.neo-gc-day-divider')).toBeInTheDocument();
  });

  it('过程卡段收进「后台过程」折叠行（默认收起），点开才嵌 NeoTimeline', async () => {
    timelineState.messages = [
      { id: 'chat_m1', kind: 'user_turn', text: 'go', turn_id: 't1', ts: now },
      { id: 'p1', kind: 'thinking', label: '想', status: 'streaming', turn_id: 't1', ts: now },
    ] as TimelineMessage[];
    const { container } = renderChat();
    // 默认收起：聊天流里没有过程卡（2026-11-07 简洁展示）
    const fold = await waitFor(() => {
      const el = container.querySelector('.neo-gc-backstage');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(fold).not.toHaveAttribute('data-open');
    expect(container.querySelector('.neo-gc-proc')).toBeNull();
    // 展开 → 过程段仍嵌在对应 turn 下（neo-gc-proc 包裹整段 NeoTimeline）
    fireEvent.click(screen.getByTestId('neo-gc-backstage-toggle'));
    const proc = await waitFor(() => {
      const el = container.querySelector('.neo-gc-proc');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(proc.querySelector('[data-testid="tl-stub"]')).toHaveTextContent('p1');
  });

  it('说完后不显示深度思考：已收口 thinking 卡撤下，流式中的仍显示', async () => {
    timelineState.messages = [
      { id: 'chat_m1', kind: 'user_turn', text: 'hi', turn_id: 't1', ts: now },
      { id: 'th_live', kind: 'thinking', label: '正在思考', status: 'streaming', turn_id: 't1', ts: now },
      { id: 'th_done', kind: 'thinking', label: '深度思考', status: 'done', turn_id: 't1', ts: now },
    ] as TimelineMessage[];
    const { container } = renderChat();
    await waitFor(() => {
      expect(container.querySelector('.neo-gc-backstage')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('neo-gc-backstage-toggle'));
    const proc = await waitFor(() => {
      const el = container.querySelector('.neo-gc-proc');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(proc.querySelector('[data-testid="tl-stub"]')).toHaveTextContent('th_live');
    expect(proc.querySelector('[data-testid="tl-stub"]')).not.toHaveTextContent('th_done');
  });
});

describe('NeoGroupChat — @ 提及成员接线（2026-11-05，OpenBot 定向派活）', () => {
  it('mentionItems = agent_ids join 记录（id+name 透传 composer）', async () => {
    renderChat();
    // getGroup/listAgents 异步回填 → 等内容到达（首帧 groupAgentIds 还是空）。
    await waitFor(() => {
      expect(screen.getByTestId('mention-items')).toHaveTextContent('a1:读读');
    });
  });

  it('成员记录拉不到 → 退化为 id 当名（不丢成员）', async () => {
    groupRecord.agent_ids = ['a1', 'ghost-id'];
    renderChat();
    await waitFor(() => {
      const el = screen.getByTestId('mention-items');
      expect(el).toHaveTextContent('a1:读读');
      expect(el).toHaveTextContent('ghost-id:ghost-id');
    });
  });
});

describe('NeoGroupChat — 交接记录面板（2026-11-05 迭代六，OpenBot hop 模型）', () => {
  it('顶栏「交接」钮点开面板：空态文案（fetchGroupHops 空数组）', async () => {
    renderChat();
    await screen.findByTestId('neo-gc-add-member');
    // 点开前面板不存在。
    expect(screen.queryByTestId('neo-gc-hops-panel')).not.toBeInTheDocument();
    (screen.getByTestId('neo-gc-hops-btn') as HTMLButtonElement).click();
    expect(await screen.findByTestId('neo-gc-hops-panel')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('neo-gc-hops-panel')).toHaveTextContent('暂无交接记录');
    });
  });

  it('有 hop 数据 → 行内出 A→B 名字 + 终态标签 + 失败 detail', async () => {
    hopsData.push(
      {
        id: 'h1',
        group_id: 'g1',
        turn_seq: 1,
        from_agent: 'a1',
        to_agent: 'ghost',
        status: 'done',
        output_chars: 120,
        detail: '',
        created_at: 1,
        settled_at: 2,
      },
      {
        id: 'h2',
        group_id: 'g1',
        turn_seq: 1,
        from_agent: 'ghost',
        to_agent: 'a1',
        status: 'timeout',
        output_chars: 0,
        detail: '上游 ghost timeout',
        created_at: 3,
        settled_at: 4,
      },
    );
    renderChat();
    await screen.findByTestId('neo-gc-add-member');
    (screen.getByTestId('neo-gc-hops-btn') as HTMLButtonElement).click();
    const panel = await screen.findByTestId('neo-gc-hops-panel');
    // 名字解析：a1 → 读读（listAgents mock）；ghost 无记录退 id。
    await waitFor(() => {
      expect(panel).toHaveTextContent('读读');
      expect(panel).toHaveTextContent('ghost');
    });
    // 终态徽章 + 失败原因。
    expect(panel).toHaveTextContent('完成');
    expect(panel).toHaveTextContent('超时');
    expect(panel).toHaveTextContent('上游 ghost timeout');
    expect(panel).toHaveTextContent('120 字');
  });

  it('DM 会话不出交接钮（单聊无交接语义）', async () => {
    groupRecord.kind = 'dm';
    renderChat();
    await screen.findByTestId('composer-stub');
    expect(screen.queryByTestId('neo-gc-hops-btn')).not.toBeInTheDocument();
  });
});

describe('agentHasReply / agentHasActivity — roster 归属判定（2026-11-07 三态批）', () => {
  it('agentHasReply 只认带 agent_id 的 assistant_text/raw；thinking 不算回复', () => {
    const msgs = [
      { id: 't1', kind: 'thinking', label: '想', status: 'done', agent_id: 'a1', turn_id: 't', ts: 1 },
      { id: 'r1', kind: 'raw', body: '回', sender_name: '读读', agent_id: 'a1', turn_id: 't', ts: 2 },
    ] as TimelineMessage[];
    expect(agentHasReply(msgs, 'a1')).toBe(true);
    expect(agentHasReply(msgs.slice(0, 1), 'a1')).toBe(false);
    // 无归属的 run 产出不算回复
    expect(
      agentHasReply(
        [{ id: 'x', kind: 'assistant_text', body: 'run 输出', turn_id: 't', ts: 1 }] as TimelineMessage[],
        'a1',
      ),
    ).toBe(false);
  });

  it('agentHasActivity 认 thinking/工具卡/任务行/交接边；他人的活动不串台', () => {
    const msgs = [
      { id: 't1', kind: 'thinking', label: '想', status: 'streaming', agent_id: 'a1', turn_id: 't', ts: 1 },
      { id: 'c1', kind: 'tool_call', name: 'fs.read', args_summary: '', agent_id: 'a1', turn_id: 't', ts: 2 },
    ] as TimelineMessage[];
    expect(agentHasActivity(msgs, 'a1', '读读')).toBe(true);
    expect(agentHasActivity(msgs, 'a2', '甲')).toBe(false);
    // plan_card 任务行：行 id `node:<agentId>` 确定性锚点（老行无 agent_id）
    const plan = [
      {
        id: 'p1',
        kind: 'plan_card',
        title: '计划',
        tasks: [{ id: 'node:a2', title: '行', status: 'pending' }],
        turn_id: 't',
        ts: 1,
      },
    ] as TimelineMessage[];
    expect(agentHasActivity(plan, 'a2', '甲')).toBe(true);
    expect(agentHasActivity(plan, 'a1', '读读')).toBe(false);
    // hop 交接边 from/to 命中
    const hop = [
      {
        id: 'h1',
        kind: 'hop_card',
        hop_id: 'hop1',
        from_agent: 'a1',
        to_agent: 'a2',
        status: 'pending',
        turn_id: 't',
        ts: 1,
      },
    ] as TimelineMessage[];
    expect(agentHasActivity(hop, 'a2', '甲')).toBe(true);
  });

  it('老数据 thinking 无 agent_id → label 前缀兜底；无归属产物卡不算活动', () => {
    const msgs = [
      { id: 't1', kind: 'thinking', label: '甲 正在思考', status: 'done', turn_id: 't', ts: 1 },
      { id: 'k1', kind: 'commit_record', repo: 'r', sha: 's', short_sha: 's', message: 'm', author: 'a', files_changed: 1, insertions: 0, deletions: 0, turn_id: 't', ts: 2 },
    ] as TimelineMessage[];
    expect(agentHasActivity(msgs, 'a2', '甲')).toBe(true);
    // 名字对不上不算；无归属 commit_record 不算
    expect(agentHasActivity(msgs, 'a3', '乙')).toBe(false);
  });
});

describe('NeoGroupChat — busy roster 三态（2026-11-07）', () => {
  it('done=已回复 / working=有过程卡流出 / idle=待命（没动静），tooltip 三态文案', async () => {
    timelineState.runs = [{ session_id: 's1', status: 'running' }];
    groupRecord.agent_ids = ['a1', 'a2', 'a3'];
    timelineState.messages = [
      { id: 'm1', kind: 'assistant_text', body: '搞定', sender_name: '读读', agent_id: 'a1', turn_id: 't1', ts: now },
      { id: 'm2', kind: 'thinking', label: '想', status: 'streaming', agent_id: 'a2', turn_id: 't1', ts: now },
    ] as TimelineMessage[];
    renderChat();
    const roster = await screen.findByTestId('neo-gc-roster');
    await waitFor(() => {
      expect(roster.querySelectorAll('.neo-gc-roster-item')).toHaveLength(3);
    });
    const items = roster.querySelectorAll('.neo-gc-roster-item');
    expect(items[0]).toHaveAttribute('data-state', 'done');
    expect(items[0]).toHaveAttribute('title', '读读 · 已完成');
    // thinking 卡也算干过活 → working（此前 agentHasActivity 不认，误显示转圈/待命）
    expect(items[1]).toHaveAttribute('data-state', 'working');
    expect(items[1]).toHaveAttribute('title', 'a2 · 处理中');
    // 一点动静都没有 → 待命（第三态，此前缺失）
    expect(items[2]).toHaveAttribute('data-state', 'idle');
    expect(items[2]).toHaveAttribute('title', 'a3 · 待命');
  });

  it('plan_card 任务行认作 working（干活中，不误显示待命）', async () => {
    timelineState.runs = [{ session_id: 's1', status: 'running' }];
    groupRecord.agent_ids = ['a1', 'a2'];
    timelineState.messages = [
      {
        id: 'p1',
        kind: 'plan_card',
        title: '计划',
        tasks: [{ id: 'node:a2', title: '行', status: 'running' }],
        turn_id: 't1',
        ts: now,
      },
    ] as TimelineMessage[];
    renderChat();
    const roster = await screen.findByTestId('neo-gc-roster');
    await waitFor(() => {
      expect(roster.querySelectorAll('.neo-gc-roster-item')).toHaveLength(2);
    });
    const items = roster.querySelectorAll('.neo-gc-roster-item');
    expect(items[0]).toHaveAttribute('data-state', 'idle');
    expect(items[1]).toHaveAttribute('data-state', 'working');
  });
});
