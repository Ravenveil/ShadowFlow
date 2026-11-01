/**
 * team-saved SSE 帧前端消费测试（2026-08-22 第二轮缺口 A）。
 *
 * 覆盖两段接线：
 *   1. subscribeRunSession —— `team-saved` 命名帧 → onTeamSaved 回调
 *      （FakeEventSource 模式同 runs-evidence.test.ts）；
 *   2. useRunSession —— 帧到达后 state.teamSaved latch（complete 不冲掉）；
 *      切换 sessionId 时清空（引导卡不残留进无关的新 run）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { subscribeRunSession, type TeamSavedEvent } from '../runSessions';
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
  emit(type: string, data: unknown) {
    const ev = { data: JSON.stringify(data), lastEventId: '' } as MessageEvent;
    for (const cb of this.listeners.get(type) ?? []) cb(ev);
  }
}

const TEAM: TeamSavedEvent = {
  team_id: 'team-1',
  name: '氢能获客小队',
  agent_ids: ['a1', 'a2', 'a3'],
  workspace_id: 'ws-1',
};

afterEach(() => {
  FakeEventSource.instances = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('subscribeRunSession · team-saved 帧', () => {
  it('team-saved 帧 → onTeamSaved 收到完整 payload', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const onTeamSaved = vi.fn();
    subscribeRunSession('sess-1', { onTeamSaved });
    const es = FakeEventSource.instances[0]!;
    expect(es.url).toContain('/api/run-sessions/sess-1/stream');
    es.emit('team-saved', TEAM);
    expect(onTeamSaved).toHaveBeenCalledTimes(1);
    expect(onTeamSaved).toHaveBeenCalledWith(TEAM);
  });

  it('未注册 onTeamSaved 时 team-saved 帧不报错（透传忽略）', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    subscribeRunSession('sess-1', {});
    const es = FakeEventSource.instances[0]!;
    expect(() => es.emit('team-saved', TEAM)).not.toThrow();
  });
});

describe('useRunSession · TEAM_SAVED', () => {
  it('team-saved 帧 latch 到 state.teamSaved，complete 不冲掉', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const { result, unmount } = renderHook(() => useRunSession('sess-2'));
    expect(result.current.teamSaved).toBeNull();
    const es = FakeEventSource.instances[0]!;
    act(() => es.emit('team-saved', TEAM));
    expect(result.current.teamSaved).toEqual(TEAM);
    // complete 帧（team-saved 之后到达）不影响已 latch 的 teamSaved。
    act(() => es.emit('complete', { session_id: 'sess-2' }));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.teamSaved).toEqual(TEAM);
    unmount();
  });

  it('切换 sessionId → teamSaved 清空（引导卡不残留进无关的新 run）', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const { result, rerender, unmount } = renderHook(
      ({ id }: { id: string }) => useRunSession(id),
      { initialProps: { id: 'sess-3' } },
    );
    act(() => FakeEventSource.instances[0]!.emit('team-saved', TEAM));
    expect(result.current.teamSaved).toEqual(TEAM);
    rerender({ id: 'sess-4' });
    expect(result.current.teamSaved).toBeNull();
    unmount();
  });
});
