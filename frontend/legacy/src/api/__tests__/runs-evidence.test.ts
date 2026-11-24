/**
 * runs.ts L6 证据层打包测试：
 *   - listRuns(limit) — ?limit= 查询参数 + raw array / envelope 双形态
 *   - getLoopVerdicts — 单对象 / 数组 / {verdicts} / {data:…} envelope 归一
 *   - streamRunLoops — loops/stream SSE：快照帧、单环 upsert 帧、
 *     首帧前出错 → onUnavailable 回落信号
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { getLoopVerdicts, listRuns, streamRunLoops } from '../runs';
import type { LoopStep } from '../runs';

afterEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  FakeEventSource.instances = [];
});

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

// ---------------------------------------------------------------------------
// listRuns
// ---------------------------------------------------------------------------

describe('listRuns limit 参数', () => {
  it('不带 limit → 无查询串', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    vi.stubGlobal('fetch', fetchMock);
    await listRuns();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/runs$/);
  });

  it('带 limit → 拼 ?limit=', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    vi.stubGlobal('fetch', fetchMock);
    await listRuns(50);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/runs\?limit=50$/);
  });

  it('envelope 形态 → unwrap runs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ runs: [{ run_id: 'r1' }], total: 1 })));
    const rows = await listRuns(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.run_id).toBe('r1');
  });
});

// ---------------------------------------------------------------------------
// getLoopVerdicts
// ---------------------------------------------------------------------------

describe('getLoopVerdicts 形状归一', () => {
  it('单对象形态 → 包成单元素数组', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({
      iteration: 2, score: 0.8, rationale: '接近收敛', claims: [{ text: 'c1' }],
    })));
    const v = await getLoopVerdicts('run1', 'loop1');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ iteration: 2, score: 0.8, rationale: '接近收敛' });
    expect(v[0]?.claims).toEqual([{ text: 'c1' }]);
  });

  it('数组形态 → 按 iteration 排序', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson([
      { iteration: 3, claims: [] },
      { iteration: 1, claims: [] },
    ])));
    const v = await getLoopVerdicts('run1', 'loop1');
    expect(v.map((x) => x.iteration)).toEqual([1, 3]);
  });

  it('{data:{verdicts:[…]}} envelope → 双层解包', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({
      data: { verdicts: [{ iteration: 0, rationale: 'r', claims: [] }] },
    })));
    const v = await getLoopVerdicts('run1', 'loop1');
    expect(v).toHaveLength(1);
    expect(v[0]?.rationale).toBe('r');
  });

  it('claims 里的非对象项被过滤；未知形状 → 空数组', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({
      iteration: 0, claims: [{ text: 'ok' }, 'junk', null],
    })));
    const v = await getLoopVerdicts('run1', 'loop1');
    expect(v[0]?.claims).toEqual([{ text: 'ok' }]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson(42)));
    expect(await getLoopVerdicts('run1', 'loop1')).toEqual([]);
  });

  it('HTTP 非 2xx → 抛 RunsApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, text: async () => 'not found',
    }));
    await expect(getLoopVerdicts('run1', 'loop1')).rejects.toThrow('Runs API error 404');
  });
});

// ---------------------------------------------------------------------------
// streamRunLoops（SSE）
// ---------------------------------------------------------------------------

type Handler = (ev: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Set<Handler>>();
  closed = false;
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
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const cb of this.listeners.get(type) ?? []) cb(ev);
  }
  fail() {
    for (const cb of this.listeners.get('error') ?? []) cb(new Event('error'));
  }
}

function makeLoopStep(loopId: string, iterationCount = 1): LoopStep {
  return {
    step_id: `s-${loopId}`,
    node_id: `n-${loopId}`,
    status: 'running',
    started_at: '',
    ended_at: null,
    loop: {
      loop_id: loopId,
      run_id: 'run1',
      kind: 'until_converge',
      setpoint: { metric: 'score', op: '>=', value: 0.9 },
      depth: 0,
      status: 'running',
      iteration_count: iterationCount,
      iterations: [],
    },
  };
}

describe('streamRunLoops', () => {
  it('快照帧 {loops:[…]} → 全量替换并回调', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const snaps: LoopStep[][] = [];
    streamRunLoops('run1', (loops) => snaps.push(loops));
    const es = FakeEventSource.instances[0]!;
    expect(es.url).toContain('/api/runs/run1/loops/stream');
    es.emit('message', { run_id: 'run1', loops: [makeLoopStep('L1'), makeLoopStep('L2')] });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.map((s) => s.loop.loop_id).sort()).toEqual(['L1', 'L2']);
  });

  it('单环 LoopStep 帧 → 按 loop_id upsert 合并', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const snaps: LoopStep[][] = [];
    streamRunLoops('run1', (loops) => snaps.push(loops));
    const es = FakeEventSource.instances[0]!;
    es.emit('loop', makeLoopStep('L1', 1));
    es.emit('loop', makeLoopStep('L1', 2));
    es.emit('loops', makeLoopStep('L2', 1));
    const last = snaps.at(-1)!;
    expect(last).toHaveLength(2);
    expect(last.find((s) => s.loop.loop_id === 'L1')?.loop.iteration_count).toBe(2);
  });

  it('envelope 帧 {data:{loops:[…]}} → 解包后按快照处理', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const snaps: LoopStep[][] = [];
    streamRunLoops('run1', (loops) => snaps.push(loops));
    FakeEventSource.instances[0]!.emit('message', { data: { loops: [makeLoopStep('L9')] } });
    expect(snaps.at(-1)?.map((s) => s.loop.loop_id)).toEqual(['L9']);
  });

  it('首帧前出错 → 关流并回调 onUnavailable（调用方回落轮询）', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const unavailable = vi.fn();
    streamRunLoops('run1', () => {}, unavailable);
    const es = FakeEventSource.instances[0]!;
    es.fail();
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(es.closed).toBe(true);
  });

  it('拿到数据后的瞬断 → 不回落（交给 EventSource 自动重连）', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const unavailable = vi.fn();
    streamRunLoops('run1', () => {}, unavailable);
    const es = FakeEventSource.instances[0]!;
    es.emit('message', { loops: [makeLoopStep('L1')] });
    es.fail();
    expect(unavailable).not.toHaveBeenCalled();
    expect(es.closed).toBe(false);
  });

  it('close() → 永久关流', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const h = streamRunLoops('run1', () => {});
    h.close();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });
});
