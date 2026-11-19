/**
 * agent-hops 用例单测：注入内存 repo，零 IO、不启 server、不碰磁盘。
 */

import { describe, it, expect } from 'vitest';
import { InMemoryHopRepository } from '../hops-repository';
import {
  makeNextTurnSeq,
  makeOpenHop,
  makeStartHop,
  makeSettleHop,
  makeListHopsByTurn,
  makeListRecentHops,
  makeSummarizeHops,
  makeSweepOrphanHops,
} from './hops';
import { hopStatusLabel, summarizeHopsText, isSettled } from '../hops-model';

let t = 1000;
const deps = { newId: () => `hop-${++t}`, now: () => t };

describe('hops 领域纯函数', () => {
  it('终态判定', () => {
    expect(isSettled('pending')).toBe(false);
    expect(isSettled('running')).toBe(false);
    expect(isSettled('done')).toBe(true);
    expect(isSettled('aborted')).toBe(true);
  });

  it('状态标签', () => {
    expect(hopStatusLabel('done')).toBe('完成');
    expect(hopStatusLabel('denied')).toBe('被拦截');
  });

  it('摘要：空返回空串', () => {
    expect(summarizeHopsText([])).toBe('');
  });

  it('摘要：done 行含交接字数', () => {
    const s = summarizeHopsText([
      { id: 'x', group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B',
        status: 'done', output_chars: 42, detail: '', created_at: 0, settled_at: 1 },
    ]);
    expect(s).toContain('A → B');
    expect(s).toContain('42 字');
  });
});

describe('hops 用例', () => {
  it('open → start → settle 全生命周期', () => {
    const repo = new InMemoryHopRepository();
    const id = makeOpenHop(repo, deps)({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B' });
    makeStartHop(repo)(id);
    expect(repo.rows.get(id)!.status).toBe('running');
    makeSettleHop(repo, deps)(id, 'done', { outputChars: 10 });
    expect(repo.rows.get(id)!.status).toBe('done');
    expect(repo.rows.get(id)!.settled_at).not.toBeNull();
  });

  it('settle 幂等：重复结算不覆盖', () => {
    const repo = new InMemoryHopRepository();
    const settle = makeSettleHop(repo, deps);
    const id = makeOpenHop(repo, deps)({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B' });
    settle(id, 'done', { outputChars: 10 });
    settle(id, 'failed', { outputChars: 999 });
    expect(repo.rows.get(id)!.status).toBe('done');
    expect(repo.rows.get(id)!.output_chars).toBe(10);
  });

  it('字符数规整：负数归零', () => {
    const repo = new InMemoryHopRepository();
    const id = makeOpenHop(repo, deps)({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B' });
    makeSettleHop(repo, deps)(id, 'done', { outputChars: -5 });
    expect(repo.rows.get(id)!.output_chars).toBe(0);
  });

  it('detail 截断到 500', () => {
    const repo = new InMemoryHopRepository();
    const id = makeOpenHop(repo, deps)({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B' });
    makeSettleHop(repo, deps)(id, 'failed', { detail: 'x'.repeat(1000) });
    expect(repo.rows.get(id)!.detail.length).toBe(500);
  });

  it('nextTurnSeq 递增', () => {
    const repo = new InMemoryHopRepository();
    const next = makeNextTurnSeq(repo);
    expect(next('g')).toBe(1);
    makeOpenHop(repo, deps)({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B' });
    expect(next('g')).toBe(2);
  });

  it('listRecentHops：按回合分组，新回合在前', () => {
    const repo = new InMemoryHopRepository();
    const open = makeOpenHop(repo, deps);
    open({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B' });
    open({ group_id: 'g', turn_seq: 2, from_agent: 'A', to_agent: 'C' });
    const recent = makeListRecentHops(repo)('g', 2);
    expect(recent[0].turn_seq).toBe(2);
  });

  it('summarizeHops 走完整链路', () => {
    const repo = new InMemoryHopRepository();
    const id = makeOpenHop(repo, deps)({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B' });
    makeSettleHop(repo, deps)(id, 'done', { outputChars: 7 });
    const s = makeSummarizeHops(repo)('g', 1);
    expect(s).toContain('本回合 1 次交接');
  });

  it('sweepOrphan：未结算补 aborted，已结算不动', () => {
    const repo = new InMemoryHopRepository();
    const open = makeOpenHop(repo, deps);
    const orphan = open({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'B' });
    const done = open({ group_id: 'g', turn_seq: 1, from_agent: 'A', to_agent: 'C' });
    repo.settle(done, 'done', { outputChars: 0, detail: '' }, 2000);
    const n = makeSweepOrphanHops(repo, deps)();
    expect(n).toBe(1);
    expect(repo.rows.get(orphan)!.status).toBe('aborted');
    expect(repo.rows.get(done)!.status).toBe('done');
  });
});
