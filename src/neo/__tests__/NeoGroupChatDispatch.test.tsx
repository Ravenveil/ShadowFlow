/**
 * NeoGroupChatDispatch — 派发卡 + 交付卡测试（2026-08-23 意图分发可视化/交付收口）。
 *
 * 覆盖：
 *   - segmentTurn：intent 帧 → dispatch 段（不与过程卡混排，保持先后顺序）；
 *   - 派发卡（NeoDispatchCard）：团队/员工两种 target + 理由 + 子任务明细；
 *     无 intent 帧 → 不渲染；
 *   - collectDeliverables / summarizeText 纯函数：三类真产物去重收集、
 *     一句话总结截断；
 *   - 交付卡（NeoDeliveryCard）：run succeeded 且有产物 → 尾部出卡；
 *     仍在跑 / 无产物 → 不渲染（不编造）。
 */
import { render, screen, waitFor, fireEvent } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineMessage } from '../../components/run-session/timeline/types';
import { collectDeliverables, summarizeText } from '../NeoDeliveryCard';

// ── 可控 timeline mock（与 NeoGroupChat.test.tsx 同款） ─────────────────────
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

vi.mock('../../api/groupApi', () => ({
  getGroup: vi.fn(() =>
    Promise.resolve({ group_id: 'g1', name: '论文深读小队', kind: 'group', agent_ids: ['a1'], messages: [] }),
  ),
  postGroupMessage: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../NeoTimeline', () => ({
  NeoTimeline: (props: { messages: TimelineMessage[] }) => (
    <div data-testid="tl-stub">{props.messages.map((m) => m.id).join(',')}</div>
  ),
}));
vi.mock('../NeoComposer', () => ({
  NeoComposer: () => <div data-testid="composer-stub" />,
}));

import { NeoGroupChat, segmentTurn } from '../NeoGroupChat';

const now = Date.now();

const intentMsg = {
  id: 'gw_s1_1',
  kind: 'intent',
  turn_id: 'gwturn_s1',
  ts: now - 900,
  intent: '帮我读这篇论文',
  target_kind: 'team',
  target_name: '论文深读小队',
  reason: '编排者拆解为 1 个子任务，按 DAG 分层派发',
  assignments: [{ agent_id: 'a1', name: '读读', title: '抓取 PDF' }],
} as TimelineMessage;

function renderChat() {
  return render(
    <MemoryRouter>
      <NeoGroupChat groupId="g1" embedded />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  timelineState.messages = [];
  timelineState.runs = [];
  timelineState.loading = false;
  timelineState.error = null;
});

describe('segmentTurn — intent 帧分段', () => {
  it('intent → dispatch 段，且与前后过程卡正确切分', () => {
    const msgs = [
      { id: 'p1', kind: 'thinking', label: '想', status: 'done', turn_id: 't', ts: 1 },
      intentMsg,
      { id: 'p2', kind: 'tool_call', name: 'fs.read', args_summary: '', turn_id: 't', ts: 3 },
    ] as TimelineMessage[];
    const segs = segmentTurn(msgs);
    expect(segs.map((s) => s.type)).toEqual(['process', 'dispatch', 'process']);
    const d = segs[1];
    expect(d.type === 'dispatch' && d.msg.id).toBe('gw_s1_1');
  });
});

describe('NeoGroupChat — 派发卡', () => {
  it('有 intent 帧 → 收进「后台过程」折叠（默认收起），点开出派发卡（意图→团队+理由+明细）', async () => {
    timelineState.messages = [
      { id: 'chat_m1', kind: 'user_turn', text: '帮我读这篇论文', turn_id: 't1', ts: now - 1000 },
      intentMsg,
    ] as TimelineMessage[];
    renderChat();
    // 2026-11-07 简洁展示：派发卡不再直接刷在聊天流，默认收进后台过程折叠。
    await screen.findByTestId('neo-gc-backstage');
    expect(screen.queryByTestId('neo-gc-dispatch')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('neo-gc-backstage-toggle'));
    const card = await screen.findByTestId('neo-gc-dispatch');
    expect(card).toHaveTextContent('帮我读这篇论文');
    expect(card).toHaveTextContent('团队 论文深读小队');
    expect(card).toHaveTextContent('编排者拆解为 1 个子任务');
    expect(card).toHaveTextContent('读读');
    expect(card).toHaveTextContent('抓取 PDF');
  });

  it('agent 目标（串行降级）→ 「员工 X」', async () => {
    timelineState.messages = [
      { id: 'chat_m1', kind: 'user_turn', text: 'hi', turn_id: 't1', ts: now - 1000 },
      {
        id: 'gw_s2_1',
        kind: 'intent',
        turn_id: 'gwturn_s2',
        ts: now - 900,
        intent: 'hi',
        target_kind: 'agent',
        target_name: '读读',
        reason: '群未绑定团队，按成员依次处理用户原文',
      },
    ] as TimelineMessage[];
    renderChat();
    fireEvent.click(await screen.findByTestId('neo-gc-backstage-toggle'));
    const card = await screen.findByTestId('neo-gc-dispatch');
    expect(card).toHaveTextContent('员工 读读');
    expect(card).toHaveTextContent('群未绑定团队');
  });

  it('无 intent 帧 → 不出派发卡', async () => {
    timelineState.messages = [
      { id: 'chat_m1', kind: 'user_turn', text: 'hi', turn_id: 't1', ts: now },
    ] as TimelineMessage[];
    renderChat();
    await screen.findByTestId('tl-stub');
    expect(screen.queryByTestId('neo-gc-dispatch')).not.toBeInTheDocument();
  });
});

describe('collectDeliverables / summarizeText — 纯函数', () => {
  it('收集 artifact_card / commit_record.files / file_diff，按 label 去重', () => {
    const msgs = [
      { id: '1', kind: 'commit_record', repo: 'a', sha: 'x', short_sha: 'x', message: 'm', author: 'a',
        files_changed: 1, insertions: 1, deletions: 0,
        files: [{ path: 'docs/a.md', status: 'A' }], turn_id: 't', ts: 1 },
      { id: '2', kind: 'file_diff', path: 'docs/a.md', added: 1, removed: 0, lines: [], turn_id: 't', ts: 2 },
      { id: '3', kind: 'file_diff', path: 'src/b.ts', added: 2, removed: 0, lines: [], turn_id: 't', ts: 3 },
      { id: '4', kind: 'artifact_card', artifact_type: 'html', filename: 'r.html', url: '/p/r.html', turn_id: 't', ts: 4 },
    ] as TimelineMessage[];
    const items = collectDeliverables(msgs);
    expect(items.map((i) => i.label)).toEqual(['docs/a.md', 'src/b.ts', 'r.html']);
    expect(items[2].url).toBe('/p/r.html');
  });

  it('无产物 → 空数组', () => {
    const msgs = [
      { id: '1', kind: 'thinking', label: '想', status: 'done', turn_id: 't', ts: 1 },
    ] as TimelineMessage[];
    expect(collectDeliverables(msgs)).toEqual([]);
  });

  it('summarizeText：取首行 + 截断', () => {
    expect(summarizeText('第一行结论。\n第二行细节')).toBe('第一行结论。');
    expect(summarizeText('x'.repeat(100))).toHaveLength(81); // 80 + …
    expect(summarizeText('  \n ')).toBe('');
  });
});

describe('NeoGroupChat — 交付卡', () => {
  const commitMsg = {
    id: 'gw_s1_9',
    kind: 'commit_record',
    turn_id: 'gwturn_s1',
    ts: now - 800,
    repo: '读读',
    sha: 'abc123',
    short_sha: 'abc123',
    message: '[sf] 读读: 抓取 PDF',
    author: '读读',
    files_changed: 1,
    insertions: 10,
    deletions: 0,
    files: [{ path: 'docs/paper.md', status: 'A' }],
  } as TimelineMessage;
  const replyMsg = {
    id: 'chat_m2',
    kind: 'assistant_text',
    turn_id: 't1',
    ts: now - 700,
    body: '论文已抓取并整理完毕。\n细节略。',
    sender_name: '读读',
    agent_id: 'a1',
  } as TimelineMessage;

  it('run succeeded 且有产物 → 尾部出交付卡（产物 + 一句话总结）', async () => {
    timelineState.runs = [{ session_id: 's1', status: 'succeeded' }];
    timelineState.messages = [
      { id: 'chat_m1', kind: 'user_turn', text: '帮我读这篇论文', turn_id: 't1', ts: now - 1000 },
      commitMsg,
      replyMsg,
    ] as TimelineMessage[];
    renderChat();
    const card = await screen.findByTestId('neo-gc-delivery');
    expect(card).toHaveTextContent('交付汇总');
    expect(card).toHaveTextContent('docs/paper.md');
    expect(card).toHaveTextContent('论文已抓取并整理完毕。');
  });

  it('run 仍在跑 → 不出交付卡', async () => {
    timelineState.runs = [{ session_id: 's1', status: 'running' }];
    timelineState.messages = [commitMsg, replyMsg] as TimelineMessage[];
    renderChat();
    await waitFor(() => expect(screen.getAllByTestId('tl-stub').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('neo-gc-delivery')).not.toBeInTheDocument();
  });

  it('run succeeded 但无产物 → 不出交付卡（不编造）', async () => {
    timelineState.runs = [{ session_id: 's1', status: 'succeeded' }];
    timelineState.messages = [
      { id: 'gw_s1_2', kind: 'thinking', label: '想', status: 'done', turn_id: 'gwturn_s1', ts: now - 800 },
      replyMsg,
    ] as TimelineMessage[];
    renderChat();
    await waitFor(() => expect(screen.getAllByTestId('tl-stub').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('neo-gc-delivery')).not.toBeInTheDocument();
  });
});
