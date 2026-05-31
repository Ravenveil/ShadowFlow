/**
 * sseClient.test.ts — terminal-aware reconnect (sse-frame-leak stop-bleed, 2026-05-31).
 *
 * Guards the fix for the misleading "网络异常 · 已达最大重试次数" banner: once a
 * run reaches a terminal event (`complete` / run-level `error`), the server
 * closing the stream is a NORMAL end — the client must NOT reconnect. But a
 * step-scoped `error` (carries `step_index`) is recoverable and MUST still
 * reconnect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseClient } from './sseClient';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(cb);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown, lastEventId = '') {
    const evt = { data: JSON.stringify(data), lastEventId } as MessageEvent;
    if (type === 'message') this.onmessage?.(evt);
    (this.listeners[type] || []).forEach((cb) => cb(evt));
  }
  fireError() {
    this.onerror?.({} as Event);
  }
}

const realES = globalThis.EventSource;

beforeEach(() => {
  MockEventSource.instances = [];
  // @ts-expect-error — test double
  globalThis.EventSource = MockEventSource;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.EventSource = realES;
});

function newClient() {
  const onError = vi.fn();
  const client = new SseClient({ onError });
  client.on('complete', vi.fn());
  client.on('error', vi.fn());
  client.on('message', vi.fn());
  return { client, onError };
}

describe('SseClient terminal-aware reconnect', () => {
  it('does NOT reconnect after a `complete` event then stream close', () => {
    const { client, onError } = newClient();
    client.connect('run-1');
    expect(MockEventSource.instances.length).toBe(1);

    MockEventSource.instances[0].emit('complete', { session_id: 'run-1', redirect: '/editor' });
    MockEventSource.instances[0].fireError(); // server closed the finished stream

    vi.advanceTimersByTime(60_000); // exhaust any would-be back-off
    expect(MockEventSource.instances.length).toBe(1); // no reconnect
    expect(onError).not.toHaveBeenCalled(); // no misleading banner
  });

  it('does NOT reconnect after a run-level `error` event', () => {
    const { client, onError } = newClient();
    client.connect('run-2');
    MockEventSource.instances[0].emit('error', {
      code: 'INTERNAL_ERROR',
      session_id: 'run-2',
      message: 'boom',
    });
    MockEventSource.instances[0].fireError();

    vi.advanceTimersByTime(60_000);
    expect(MockEventSource.instances.length).toBe(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('DOES reconnect after a step-scoped error (recoverable)', () => {
    const { client } = newClient();
    client.connect('run-3');
    MockEventSource.instances[0].emit('error', {
      code: 'STEP_NO_OUTPUT',
      step_index: 1,
      step_name: 'assemble',
    });
    MockEventSource.instances[0].fireError();

    vi.advanceTimersByTime(1_000); // first back-off slot
    expect(MockEventSource.instances.length).toBe(2); // reconnected
  });

  it('DOES reconnect on a mid-run drop (no terminal event seen)', () => {
    const { client } = newClient();
    client.connect('run-4');
    MockEventSource.instances[0].emit('message', { hello: 'world' });
    MockEventSource.instances[0].fireError();

    vi.advanceTimersByTime(1_000);
    expect(MockEventSource.instances.length).toBe(2);
  });

  it('disconnect() stops everything regardless of terminal state', () => {
    const { client } = newClient();
    client.connect('run-5');
    client.disconnect();
    MockEventSource.instances[0].fireError();
    vi.advanceTimersByTime(60_000);
    expect(MockEventSource.instances.length).toBe(1);
  });
});
