/**
 * 步骤重跑 SSE 自动重连测试（2026-08-23）。
 *
 * 背景：POST steps/:n/retry（full_rerun 语义）被接受后，后端先 emit
 * `retry-pending` 帧，同 tick runBus.reset() —— 旧 run 日志作废、连接被
 * res.end()，下一次 GET /stream 对 fresh run claimStart 从头重跑（事件 id
 * 从 1 重排）。本文件覆盖三处接线：
 *   1. subscribeRunSession —— `retry-pending` 帧 → 清零续传 cursor（旧
 *      cursor 会让 attach() 吞掉新 run id≤cursor 的全部帧）+ 主动收编旧
 *      连接并立即重挂 + onRetryPending 回调；
 *   2. useRunSession —— 帧到达后 run 态归零（full_rerun 重放前清场，
 *      complete/aborted 等终态标记一并复位）；
 *   3. useRunSession.restartStream —— run 终态后发起重跑（连接已随 complete
 *      关闭、收不到帧）时主动重挂：归零 + 新 EventSource（空 cursor）。
 * （FakeEventSource 模式同 runSessions-teamSaved.test.ts。）
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { subscribeRunSession, type RetryPendingEvent } from '../runSessions';
import { useRunSession } from '../../core/hooks/useRunSession';

type Handler = (ev: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Set<Handler>>();
  closed = false;
  onerror: ((err: Event) => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: Handler) {
    const set = this.listeners.get(type) ?? new Set<Handler>();
    set.add(cb);
    this.listeners.set(type, set);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown, lastEventId = '') {
    const ev = { data: JSON.stringify(data), lastEventId } as MessageEvent;
    for (const cb of this.listeners.get(type) ?? []) cb(ev);
  }
}

const RETRY: RetryPendingEvent = {
  session_id: 'sess-r1',
  from_step: 1,
  cleared_steps: [1, 2],
  strategy: 'full_rerun',
};

const ASSISTANT_MSG = {
  id: 'm1',
  kind: 'assistant_text',
  turn_id: 't1',
  ts: 1,
  body: 'hi',
};

afterEach(() => {
  FakeEventSource.instances = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('subscribeRunSession · retry-pending 帧', () => {
  it('retry-pending → onRetryPending 收到完整 payload，旧连接收编并立即重挂', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const onRetryPending = vi.fn();
    subscribeRunSession('sess-r1', { onRetryPending });
    const es = FakeEventSource.instances[0]!;
    es.emit('retry-pending', RETRY);
    expect(onRetryPending).toHaveBeenCalledTimes(1);
    expect(onRetryPending).toHaveBeenCalledWith(RETRY);
    // 旧连接被主动 close（服务端随后 res.end() 的 onerror 不再触发），
    // 并立即挂了一个新 EventSource 到同一 stream。
    expect(es.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1]!.url).toContain('/api/run-sessions/sess-r1/stream');
  });

  it('重挂清零续传 cursor：新连接不带旧 after（否则吞掉新 run 的重放帧）', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    subscribeRunSession('sess-r1', {});
    const es = FakeEventSource.instances[0]!;
    // 旧 run 已经流到事件 id=42；新 run 事件 id 从 1 重排。
    es.emit('message', ASSISTANT_MSG, '42');
    es.emit('retry-pending', RETRY, '43');
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1]!.url).not.toContain('after=');
  });

  it('未注册 onRetryPending 时 retry-pending 帧不报错（仍自动重挂）', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    subscribeRunSession('sess-r1', {});
    const es = FakeEventSource.instances[0]!;
    expect(() => es.emit('retry-pending', RETRY)).not.toThrow();
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});

describe('useRunSession · RETRY_PENDING', () => {
  it('retry-pending 帧 → run 态归零（终态标记复位），等 fresh run 重放', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const { result, unmount } = renderHook(() => useRunSession('sess-r1'));
    const es = FakeEventSource.instances[0]!;
    act(() => es.emit('text', { text: 'hello' }));
    act(() => es.emit('assemble', { step: '抓取资料', status: 'done', elapsed_ms: 120 }));
    act(() => es.emit('message', ASSISTANT_MSG));
    act(() => es.emit('complete', { session_id: 'sess-r1' }));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.chatReply).toBe('hello');
    expect(result.current.steps).toHaveLength(1);
    expect(result.current.messages).toHaveLength(1);

    act(() => es.emit('retry-pending', RETRY));
    expect(result.current.isComplete).toBe(false);
    expect(result.current.chatReply).toBe('');
    expect(result.current.steps).toHaveLength(0);
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.tokenCount).toBe(0);
    // 订阅层已自动重挂（第二只 EventSource），流恢复 streaming 态。
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(result.current.isStreaming).toBe(true);
    unmount();
  });

  it('restartStream（终态后重跑、收不到帧）→ 归零 + 新 EventSource（空 cursor）', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const { result, unmount } = renderHook(() => useRunSession('sess-r2'));
    const es = FakeEventSource.instances[0]!;
    act(() => es.emit('message', ASSISTANT_MSG, '42'));
    act(() => es.emit('complete', { session_id: 'sess-r2' }));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isStreaming).toBe(false);

    act(() => result.current.restartStream());
    expect(result.current.isComplete).toBe(false);
    expect(result.current.messages).toHaveLength(0);
    // 旧 EventSource 由订阅 effect cleanup 收编；新订阅 cursor 为空（不带 after）。
    expect(es.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1]!.url).toContain('/api/run-sessions/sess-r2/stream');
    expect(FakeEventSource.instances[1]!.url).not.toContain('after=');
    expect(result.current.isStreaming).toBe(true);
    unmount();
  });
});
