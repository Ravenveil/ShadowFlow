/**
 * run-event-bus-sweep.test.ts — 终态清扫 sweepOpenProcessCards 的 hop 卡收口
 * 与幂等回归（2026-11-07，DAG 每小时优化③）。
 *
 * 背景：hop_card 帧（pending→running→终态）经 gateway run 写进 run 事件日志，
 * settle 的 hop_update patch 也在同一日志。崩溃/kill 时 settle 永远不来 ——
 * SQLite 侧有 sweepOrphanHops 补 aborted，但**重放可见的日志侧**此前无人
 * 收口：回放 hop 卡永卡 pending/「交接中」。sweepOpenProcessCards 现对
 * pending/running 的 hop_card 补 hop_update {status:'aborted'} 终态 patch。
 *
 * 覆盖：
 *   1. 启动 hydration（reconstructFromSnapshot）崩溃恢复 → hop 卡收口、
 *      已 settle 的卡不改写、run 级 error 帧 + canceled；
 *   2. sweep 幂等 —— 清扫补丁只发一条，finish 二次调用不再追加；
 *   3. hydrateOne 懒恢复（O4 路径）同款收口。
 *
 * 纯 run-event-bus + timeline-replay，不碰 sqlite/cwd。
 */
import { describe, it, expect } from 'vitest';
import {
  createRunBus,
  type RunEventRecord,
  type RunPersistence,
  type RunSnapshot,
} from '../run-event-bus';
import { replayTimeline } from '../timeline-replay';

/** 一段「进程被 kill 时留下的」事件日志：hop 卡 h1 悬空、h2 已 settle。 */
function crashLog(): RunEventRecord[] {
  return [
    {
      id: 1,
      event: 'message',
      data: {
        id: 'h1',
        kind: 'hop_card',
        turn_id: 'gwturn_x',
        ts: 1_000,
        from_agent: 'a1',
        to_agent: 'a2',
        from_name: '小张',
        to_name: '小李',
        status: 'pending',
      },
      ts: 1_000,
    },
    {
      id: 2,
      event: 'message-patch',
      data: { id: 'h1', op: 'hop_update', patch: { status: 'running' } },
      ts: 1_500,
    },
    {
      id: 3,
      event: 'message',
      data: {
        id: 'h2',
        kind: 'hop_card',
        turn_id: 'gwturn_x',
        ts: 2_000,
        from_agent: 'a2',
        to_agent: 'a3',
        from_name: '小李',
        to_name: '小王',
        status: 'pending',
      },
      ts: 2_000,
    },
    {
      id: 4,
      event: 'message-patch',
      data: {
        id: 'h2',
        op: 'hop_update',
        patch: { status: 'done', output_chars: 42, duration_ms: 800 },
      },
      ts: 2_800,
    },
  ];
}

function crashSnapshot(id: string): RunSnapshot {
  return {
    id,
    status: 'running',
    events: crashLog(),
    nextEventId: 5,
    exitCode: null,
    signal: null,
    createdAt: 1_000,
    updatedAt: 2_800,
  };
}

function makePersist(seed: RunSnapshot[]): RunPersistence & { saved: Map<string, RunSnapshot> } {
  const saved = new Map<string, RunSnapshot>();
  return {
    saved,
    save: (snap) => {
      saved.set(snap.id, JSON.parse(JSON.stringify(snap)) as RunSnapshot);
    },
    remove: (id) => {
      saved.delete(id);
    },
    loadAllSync: () => seed,
    loadOneSync: (id) => saved.get(id) ?? seed.find((s) => s.id === id),
  };
}

/** 统计某卡收到的 hop_update 补丁（按终态 status 过滤可选）。 */
function hopPatches(events: RunEventRecord[], id: string, status?: string): RunEventRecord[] {
  return events.filter((e) => {
    if (e.event !== 'message-patch') return false;
    const p = e.data as { id?: string; op?: string; patch?: { status?: string } };
    return p.id === id && p.op === 'hop_update' && (status === undefined || p.patch?.status === status);
  });
}

describe('sweepOpenProcessCards — hop 卡收口', () => {
  it('启动 hydration：悬空 hop 卡补 aborted，已 settle 的不改写，run 落 canceled', () => {
    const bus = createRunBus({ persist: makePersist([crashSnapshot('s1')]) });
    const run = bus.get('s1')!;
    expect(run.status).toBe('canceled');

    const msgs = replayTimeline(run.events);
    const h1 = msgs.find((m) => m.id === 'h1')!;
    expect(h1).toMatchObject({ kind: 'hop_card', status: 'aborted' });
    if (h1.kind === 'hop_card') {
      expect(h1.detail).toBeTruthy();
      expect(typeof h1.duration_ms === 'number').toBe(true);
    }
    // 已 settle 的 h2 保持生产者的 done/42/800。
    expect(msgs.find((m) => m.id === 'h2')).toMatchObject({
      kind: 'hop_card',
      status: 'done',
      output_chars: 42,
      duration_ms: 800,
    });
    // 悬空卡只补一条 aborted 终态补丁；h2 零补丁。
    expect(hopPatches(run.events, 'h1', 'aborted')).toHaveLength(1);
    expect(hopPatches(run.events, 'h2')).toHaveLength(1);
    // run 级中断错误帧在日志尾部。
    const last = run.events[run.events.length - 1]!;
    expect(last.event).toBe('error');
    expect((last.data as { interrupted_by_restart?: boolean }).interrupted_by_restart).toBe(true);
  });

  it('幂等：清扫补丁不重复，二次 finish（异状态）不追加事件', () => {
    const bus = createRunBus({ persist: makePersist([crashSnapshot('s2')]) });
    const run = bus.get('s2')!;
    const n = run.events.length;
    // hydration 已把 run 落终态 —— finish 是 no-op，不应再扫出第二条补丁。
    bus.finish('s2', 'failed');
    bus.finish('s2', 'succeeded');
    expect(run.events.length).toBe(n);
    expect(run.status).toBe('canceled');
    expect(hopPatches(run.events, 'h1', 'aborted')).toHaveLength(1);
  });

  it('hydrateOne 懒恢复（O4）：同款 hop 卡收口', () => {
    const persist = makePersist([]);
    persist.loadOneSync = (id) => (id === 's3' ? crashSnapshot('s3') : undefined);
    const bus = createRunBus({ persist });
    const run = bus.hydrateOne('s3')!;
    expect(run.status).toBe('canceled');
    const msgs = replayTimeline(run.events);
    expect(msgs.find((m) => m.id === 'h1')).toMatchObject({ kind: 'hop_card', status: 'aborted' });
    expect(msgs.find((m) => m.id === 'h2')).toMatchObject({ kind: 'hop_card', status: 'done' });
    expect(hopPatches(run.events, 'h1', 'aborted')).toHaveLength(1);
    // 懒恢复是只读语义：claimStart 不得重跑。
    expect(bus.claimStart('s3')).toBe(false);
  });
});
