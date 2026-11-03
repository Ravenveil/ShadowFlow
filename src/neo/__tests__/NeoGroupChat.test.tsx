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
import { render, screen, waitFor } from '../../test/utils';
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
vi.mock('../../api/groupApi', () => ({
  getGroup: vi.fn(() => Promise.resolve(groupRecord)),
  postGroupMessage: vi.fn(() => Promise.resolve({})),
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
// NeoComposer 只透 placeholder。
vi.mock('../NeoTimeline', () => ({
  NeoTimeline: (props: { messages: TimelineMessage[] }) => (
    <div data-testid="tl-stub">{props.messages.map((m) => m.id).join(',')}</div>
  ),
}));
vi.mock('../NeoComposer', () => ({
  NeoComposer: (props: { placeholder?: string }) => (
    <div data-testid="composer-stub">{props.placeholder}</div>
  ),
}));

import { NeoGroupChat, segmentTurn } from '../NeoGroupChat';

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

  it('过程卡段仍嵌在对应 turn 下（neo-gc-proc 包裹整段 NeoTimeline）', async () => {
    timelineState.messages = [
      { id: 'chat_m1', kind: 'user_turn', text: 'go', turn_id: 't1', ts: now },
      { id: 'p1', kind: 'thinking', label: '想', status: 'done', turn_id: 't1', ts: now },
    ] as TimelineMessage[];
    const { container } = renderChat();
    const proc = await waitFor(() => {
      const el = container.querySelector('.neo-gc-proc');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(proc.querySelector('[data-testid="tl-stub"]')).toHaveTextContent('p1');
  });
});
