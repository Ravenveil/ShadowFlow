/**
 * useGroupTimeline.test.ts — F2 (unified-conversation-core-plan-2026-06-11) 灰度 hook。
 *
 * Run with:  npx vitest run src/core/hooks/__tests__/useGroupTimeline.test.ts
 *
 * Covers:
 *   - 初始加载: GET /api/groups/{id}/timeline → messages/runs/truncated 落 state
 *   - SSE 增量: agent.message → assistant_text(+sender_name)、system.notice → raw、
 *               turn_id 挂最近 user_turn、同 message_id 去重
 *   - 乐观更新: appendLocalUser → user_turn 开新 turn，其后 SSE 回复挂在它名下
 *   - idle: groupId=null 不 fetch 不订阅（灰度关 = 零行为）
 *   - 失败: fetch 非 2xx → error 可见，messages 清空
 *
 * SSE 用 vi.mock 替换 startSseClient（与 useChatStream 同款连接方式），捕获
 * onEvent 后在测试里手工喂帧 —— 不依赖真实 EventSource。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type {
  MessagePatch,
  TimelineMessage,
} from '../../../components/run-session/timeline/types';

// ── mock SSE client（捕获 onEvent，记录订阅 URL 与 close 调用）──────────────
interface CapturedSse {
  url: string;
  onEvent: (eventType: string, data: unknown) => void;
  closed: boolean;
}
const sseInstances: CapturedSse[] = [];

vi.mock('../../../api/sseClient', () => ({
  startSseClient: vi.fn((opts: { url: string; onEvent: CapturedSse['onEvent'] }) => {
    const inst: CapturedSse = { url: opts.url, onEvent: opts.onEvent, closed: false };
    sseInstances.push(inst);
    return {
      close: () => {
        inst.closed = true;
      },
    };
  }),
}));

// ── mock subscribeRunSession（F5 实时：捕获 handlers，测试里手工喂帧）────────
interface CapturedRunSub {
  sessionId: string;
  handlers: {
    onMessage?: (m: TimelineMessage) => void;
    onMessagePatch?: (p: MessagePatch) => void;
    onComplete?: (d: unknown) => void;
    onServerError?: (message: string, code?: string) => void;
  };
  options?: { maxRetries?: number; baseDelay?: number };
  cancelled: boolean;
}
const runSubs: CapturedRunSub[] = [];

vi.mock('../../../api/runSessions', () => ({
  subscribeRunSession: vi.fn(
    (
      sessionId: string,
      handlers: CapturedRunSub['handlers'],
      options?: CapturedRunSub['options'],
    ) => {
      const inst: CapturedRunSub = { sessionId, handlers, options, cancelled: false };
      runSubs.push(inst);
      return () => {
        inst.cancelled = true;
      };
    },
  ),
}));

const { useGroupTimeline, lastTurnId, sseFrameToTimeline } = await import('../useGroupTimeline');

// ── fetch mock helpers ───────────────────────────────────────────────────────
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function okTimelineResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

const INITIAL_MESSAGES: TimelineMessage[] = [
  { id: 'chat_m1', kind: 'user_turn', turn_id: 'chat_m1', ts: 1000, text: '你好' },
  {
    id: 'chat_m2',
    kind: 'assistant_text',
    turn_id: 'chat_m1',
    ts: 2000,
    body: '你好，我是 Atlas',
    sender_name: 'Atlas',
  },
];

describe('useGroupTimeline (F2 灰度)', () => {
  beforeEach(() => {
    sseInstances.length = 0;
    runSubs.length = 0;
    fetchMock.mockReset();
  });

  it('初始加载：fetch /timeline → messages/runs/truncated 落 state', async () => {
    fetchMock.mockResolvedValueOnce(
      okTimelineResponse({
        group_id: 'g1',
        messages: INITIAL_MESSAGES,
        runs: [{ session_id: 's1', status: 'completed' }],
        truncated: false,
      }),
    );

    const { result } = renderHook(() => useGroupTimeline('g1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/groups/g1/timeline');
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]!.kind).toBe('user_turn');
    expect(result.current.runs).toEqual([{ session_id: 's1', status: 'completed' }]);
    expect(result.current.truncated).toBe(false);
    expect(result.current.error).toBeNull();
    // SSE 订阅了同款群 events 端点
    expect(sseInstances).toHaveLength(1);
    expect(sseInstances[0]!.url).toBe('/api/groups/g1/events');
  });

  it('SSE 增量：agent.message → assistant_text(+sender_name) 挂最近 user_turn；同 id 去重', async () => {
    fetchMock.mockResolvedValueOnce(
      okTimelineResponse({ group_id: 'g1', messages: INITIAL_MESSAGES, runs: [], truncated: false }),
    );
    const { result } = renderHook(() => useGroupTimeline('g1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    const frame = {
      content: '已分析完毕',
      sender_name: 'Nova',
      message_id: 'm3',
      timestamp: '2026-06-11T12:00:00Z',
    };
    act(() => sseInstances[0]!.onEvent('agent.message', frame));

    expect(result.current.messages).toHaveLength(3);
    const appended = result.current.messages[2]!;
    expect(appended.kind).toBe('assistant_text');
    expect(appended.id).toBe('chat_m3'); // 与 server 端 chat_<message_id> 同源（去重锚点）
    expect(appended.turn_id).toBe('chat_m1'); // 挂最近 user_turn
    expect((appended as Extract<TimelineMessage, { kind: 'assistant_text' }>).sender_name).toBe('Nova');
    expect((appended as Extract<TimelineMessage, { kind: 'assistant_text' }>).body).toBe('已分析完毕');

    // 同 message_id 再推一次 → 去重，不重复追加
    act(() => sseInstances[0]!.onEvent('agent.message', frame));
    expect(result.current.messages).toHaveLength(3);
  });

  it('SSE 增量：system.notice → raw（source: chat-gateway）；空内容/未知事件忽略', async () => {
    fetchMock.mockResolvedValueOnce(
      okTimelineResponse({ group_id: 'g1', messages: INITIAL_MESSAGES, runs: [], truncated: false }),
    );
    const { result } = renderHook(() => useGroupTimeline('g1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() =>
      sseInstances[0]!.onEvent('system.notice', { content: '缺少 API key', message_id: 'sys1' }),
    );
    expect(result.current.messages).toHaveLength(3);
    const notice = result.current.messages[2]!;
    expect(notice.kind).toBe('raw');
    expect((notice as Extract<TimelineMessage, { kind: 'raw' }>).source).toBe('chat-gateway');
    expect(notice.turn_id).toBe('chat_m1');

    // 空内容 / 不认识的事件 → 不追加
    act(() => sseInstances[0]!.onEvent('agent.message', { content: '', message_id: 'mx' }));
    act(() => sseInstances[0]!.onEvent('agent.typing', { content: 'typing…' }));
    expect(result.current.messages).toHaveLength(3);
  });

  it('乐观更新：appendLocalUser 追加 user_turn 开新 turn，其后 SSE 回复挂在它名下', async () => {
    fetchMock.mockResolvedValueOnce(
      okTimelineResponse({ group_id: 'g1', messages: INITIAL_MESSAGES, runs: [], truncated: false }),
    );
    const { result } = renderHook(() => useGroupTimeline('g1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => result.current.appendLocalUser('  帮我跑一下测试  '));
    expect(result.current.messages).toHaveLength(3);
    const userMsg = result.current.messages[2]!;
    expect(userMsg.kind).toBe('user_turn');
    expect((userMsg as Extract<TimelineMessage, { kind: 'user_turn' }>).text).toBe('帮我跑一下测试');
    expect(userMsg.turn_id).toBe(userMsg.id); // 开新 turn

    // 之后的 agent 回复挂在这个新 turn 下
    act(() =>
      sseInstances[0]!.onEvent('agent.message', { content: '收到', message_id: 'm9' }),
    );
    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[3]!.turn_id).toBe(userMsg.id);

    // 空白文本不追加
    act(() => result.current.appendLocalUser('   '));
    expect(result.current.messages).toHaveLength(4);
  });

  it('idle：groupId=null 不 fetch 不订阅（灰度关 = 零行为）', () => {
    const { result } = renderHook(() => useGroupTimeline(null));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sseInstances).toHaveLength(0);
    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('失败：fetch 非 2xx → error 可见', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as unknown as Response);
    const { result } = renderHook(() => useGroupTimeline('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('503');
    expect(result.current.messages).toEqual([]);
  });

  it('卸载时关闭 SSE 连接', async () => {
    fetchMock.mockResolvedValueOnce(
      okTimelineResponse({ group_id: 'g1', messages: [], runs: [], truncated: false }),
    );
    const { unmount } = renderHook(() => useGroupTimeline('g1'));
    await waitFor(() => expect(sseInstances).toHaveLength(1));
    unmount();
    expect(sseInstances[0]!.closed).toBe(true);
  });

  describe('F5 实时：running run 订阅 /stream', () => {
    const RUNNING_TIMELINE = {
      group_id: 'g1',
      messages: INITIAL_MESSAGES,
      runs: [
        { session_id: 's_run', status: 'running' },
        { session_id: 's_old', status: 'succeeded' },
      ],
      truncated: false,
    };

    it('running run → 订阅(maxRetries=2)+dispatch sf:gateway-run-active；非 running 不订阅', async () => {
      const activeEvents: Array<{ groupId?: string; sessionId?: string }> = [];
      const listener = (e: Event) =>
        activeEvents.push((e as CustomEvent).detail as { groupId?: string; sessionId?: string });
      window.addEventListener('sf:gateway-run-active', listener);
      try {
        fetchMock.mockResolvedValueOnce(okTimelineResponse(RUNNING_TIMELINE));
        const { result } = renderHook(() => useGroupTimeline('g1'));
        await waitFor(() => expect(result.current.loading).toBe(false));

        // 只有 running 的 s_run 被订阅；succeeded 的 s_old 不订阅
        expect(runSubs).toHaveLength(1);
        expect(runSubs[0]!.sessionId).toBe('s_run');
        expect(runSubs[0]!.options?.maxRetries).toBe(2);
        // 右栏跟随事件已带 groupId/sessionId dispatch
        expect(activeEvents).toEqual([{ groupId: 'g1', sessionId: 's_run' }]);
      } finally {
        window.removeEventListener('sf:gateway-run-active', listener);
      }
    });

    it('onMessage 追加(同 id 覆盖) → onMessagePatch 应用 → onComplete 解除订阅', async () => {
      fetchMock.mockResolvedValueOnce(okTimelineResponse(RUNNING_TIMELINE));
      const { result } = renderHook(() => useGroupTimeline('g1'));
      await waitFor(() => expect(runSubs).toHaveLength(1));
      const sub = runSubs[0]!;

      // onMessage 追加 run 过程卡
      const runMsg: TimelineMessage = {
        id: 'run_t1',
        kind: 'assistant_text',
        turn_id: 'rt1',
        ts: 5000,
        body: '思考中',
        streaming: true,
      };
      act(() => sub.handlers.onMessage?.(runMsg));
      expect(result.current.messages).toHaveLength(3);
      expect(result.current.messages[2]!.id).toBe('run_t1');

      // 同 id 再来一帧 → 覆盖不重复追加（/timeline 重拉与 /stream 重放同源 id）
      act(() => sub.handlers.onMessage?.({ ...runMsg, body: '思考中(更新)' }));
      expect(result.current.messages).toHaveLength(3);
      expect(
        (result.current.messages[2] as Extract<TimelineMessage, { kind: 'assistant_text' }>).body,
      ).toBe('思考中(更新)');

      // onMessagePatch 就地点亮（text_append 走 applyPatch）
      act(() =>
        sub.handlers.onMessagePatch?.({ id: 'run_t1', op: 'text_append', chunk: '…已完成' }),
      );
      expect(
        (result.current.messages[2] as Extract<TimelineMessage, { kind: 'assistant_text' }>).body,
      ).toBe('思考中(更新)…已完成');
      // 不存在的 id → no-op 不崩
      act(() =>
        sub.handlers.onMessagePatch?.({ id: 'ghost', op: 'text_append', chunk: 'x' }),
      );
      expect(result.current.messages).toHaveLength(3);

      // onComplete → 解除订阅 + runs 终态回写 + 不重复订阅
      act(() => sub.handlers.onComplete?.({ session_id: 's_run' }));
      expect(sub.cancelled).toBe(true);
      expect(result.current.runs.find((r) => r.session_id === 's_run')?.status).toBe('succeeded');
      expect(runSubs).toHaveLength(1); // runs 状态变化重跑 effect，但终态 run 不再订阅
    });

    it('onServerError → 解除订阅 + runs 标 failed', async () => {
      fetchMock.mockResolvedValueOnce(okTimelineResponse(RUNNING_TIMELINE));
      const { result } = renderHook(() => useGroupTimeline('g1'));
      await waitFor(() => expect(runSubs).toHaveLength(1));

      act(() => runSubs[0]!.handlers.onServerError?.('NO_API_KEY'));
      expect(runSubs[0]!.cancelled).toBe(true);
      expect(result.current.runs.find((r) => r.session_id === 's_run')?.status).toBe('failed');
    });

    it('appendLocalUser 后 2s/6s 各刷一次 runs，发现新 running run 即订阅', async () => {
      fetchMock.mockResolvedValueOnce(
        okTimelineResponse({ group_id: 'g1', messages: [], runs: [], truncated: false }),
      );
      const { result } = renderHook(() => useGroupTimeline('g1'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(runSubs).toHaveLength(0);

      vi.useFakeTimers();
      try {
        // 刷新拿到网关刚创建的新 running run
        fetchMock.mockResolvedValue(
          okTimelineResponse({
            group_id: 'g1',
            messages: [],
            runs: [{ session_id: 's_new', status: 'running' }],
            truncated: false,
          }),
        );
        act(() => result.current.appendLocalUser('跑个任务'));

        await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
        expect(fetchMock).toHaveBeenCalledTimes(2); // 初始 1 + 2s 刷新 1
        expect(runSubs).toHaveLength(1);
        expect(runSubs[0]!.sessionId).toBe('s_new');

        await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
        expect(fetchMock).toHaveBeenCalledTimes(3); // 6s 第二次刷新
        expect(runSubs).toHaveLength(1); // 已订阅的不重复订阅
      } finally {
        vi.useRealTimers();
      }
    });

    it('卸载时解除所有 run 订阅', async () => {
      fetchMock.mockResolvedValueOnce(okTimelineResponse(RUNNING_TIMELINE));
      const { unmount } = renderHook(() => useGroupTimeline('g1'));
      await waitFor(() => expect(runSubs).toHaveLength(1));
      unmount();
      expect(runSubs[0]!.cancelled).toBe(true);
    });

    // 2026-11-05 OpenBot ProgressRow — 发消息后 run 被发现前的「正在处理」占位。
    describe('pendingTurn（ProgressRow 占位）', () => {
      it('appendLocalUser 置位 → 发现新 running run 即清空', async () => {
        fetchMock.mockResolvedValueOnce(
          okTimelineResponse({ group_id: 'g1', messages: [], runs: [], truncated: false }),
        );
        const { result } = renderHook(() => useGroupTimeline('g1'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.pendingTurn).toBeNull();

        vi.useFakeTimers();
        try {
          fetchMock.mockResolvedValue(
            okTimelineResponse({
              group_id: 'g1',
              messages: [],
              runs: [{ session_id: 's_new', status: 'running' }],
              truncated: false,
            }),
          );
          act(() => result.current.appendLocalUser('跑个任务'));
          expect(result.current.pendingTurn).not.toBeNull();
          expect(result.current.pendingTurn!.turnId).toBe(
            result.current.messages.at(-1)!.turn_id,
          );

          await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
          // run 被发现并订阅 → 占位收工
          expect(runSubs).toHaveLength(1);
          expect(result.current.pendingTurn).toBeNull();
        } finally {
          vi.useRealTimers();
        }
      });

      it('30s 无 run → 超时自动清空（后端挂了占位不悬挂）', async () => {
        fetchMock.mockResolvedValue(
          okTimelineResponse({ group_id: 'g1', messages: [], runs: [], truncated: false }),
        );
        const { result } = renderHook(() => useGroupTimeline('g1'));
        await waitFor(() => expect(result.current.loading).toBe(false));

        vi.useFakeTimers();
        try {
          act(() => result.current.appendLocalUser('hi'));
          expect(result.current.pendingTurn).not.toBeNull();
          await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });
          expect(result.current.pendingTurn).toBeNull();
        } finally {
          vi.useRealTimers();
        }
      });

      it('markAllRunsStopped 清空占位', async () => {
        fetchMock.mockResolvedValueOnce(okTimelineResponse(RUNNING_TIMELINE));
        const { result } = renderHook(() => useGroupTimeline('g1'));
        await waitFor(() => expect(runSubs).toHaveLength(1));
        act(() => result.current.appendLocalUser('再来一轮'));
        expect(result.current.pendingTurn).not.toBeNull();
        act(() => result.current.markAllRunsStopped());
        expect(result.current.pendingTurn).toBeNull();
      });
    });
  });

  describe('纯函数', () => {
    it('lastTurnId：取最近 user_turn 的 turn_id，无则 chat_turn_0', () => {
      expect(lastTurnId([])).toBe('chat_turn_0');
      expect(lastTurnId(INITIAL_MESSAGES)).toBe('chat_m1');
    });

    it('sseFrameToTimeline：与 server chatMessagesToTimeline 同语义', () => {
      const a = sseFrameToTimeline(
        'agent.complete',
        { content: 'hi', sender_name: 'A', message_id: 'x', timestamp: '2026-06-11T00:00:00Z' },
        't1',
      );
      expect(a).toMatchObject({ kind: 'assistant_text', id: 'chat_x', turn_id: 't1', sender_name: 'A' });
      expect(a!.ts).toBe(Date.parse('2026-06-11T00:00:00Z'));

      const r = sseFrameToTimeline('system.notice', { content: 'oops', message_id: 'y' }, 't1');
      expect(r).toMatchObject({ kind: 'raw', source: 'chat-gateway' });

      expect(sseFrameToTimeline('agent.message', { content: '' }, 't1')).toBeNull();
      expect(sseFrameToTimeline('node.started', { content: 'x' }, 't1')).toBeNull();
    });
  });
});
