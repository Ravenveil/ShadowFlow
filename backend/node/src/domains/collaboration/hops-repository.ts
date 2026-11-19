/**
 * collaboration 域 — agent-hops Repository 接口（依赖倒置点）
 */

import type { AgentHop, OpenHop, SettleOptions } from './hops-model';

export interface HopRepository {
  nextTurnSeq(groupId: string): number;
  open(hop: OpenHop, id: string, now: number): void;
  start(id: string): void;
  settle(id: string, status: string, opts: { outputChars: number; detail: string }, now: number): void;
  listByTurn(groupId: string, turnSeq: number): AgentHop[];
  distinctTurns(groupId: string, limit: number): number[];
  sweepOrphan(detail: string, now: number): number;
  reset(): void;
}

/** 内存实现，供 use_case 单测注入（不启 server、不碰磁盘）。 */
export class InMemoryHopRepository implements HopRepository {
  readonly rows = new Map<string, AgentHop>();

  nextTurnSeq(groupId: string): number {
    const seqs = Array.from(this.rows.values())
      .filter((h) => h.group_id === groupId)
      .map((h) => h.turn_seq);
    return seqs.length ? Math.max(...seqs) + 1 : 1;
  }

  open(hop: OpenHop, id: string, now: number): void {
    this.rows.set(id, {
      id,
      group_id: hop.group_id,
      turn_seq: hop.turn_seq,
      from_agent: hop.from_agent,
      to_agent: hop.to_agent,
      status: 'pending',
      output_chars: 0,
      detail: '',
      created_at: now,
      settled_at: null,
    });
  }

  start(id: string): void {
    const h = this.rows.get(id);
    if (h && h.status === 'pending') h.status = 'running';
  }

  settle(id: string, status: string, opts: { outputChars: number; detail: string }, now: number): void {
    const h = this.rows.get(id);
    if (!h || h.settled_at !== null) return; // 幂等
    h.status = status as AgentHop['status'];
    h.output_chars = opts.outputChars;
    h.detail = opts.detail;
    h.settled_at = now;
  }

  listByTurn(groupId: string, turnSeq: number): AgentHop[] {
    return Array.from(this.rows.values())
      .filter((h) => h.group_id === groupId && h.turn_seq === turnSeq)
      .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
      .map((h) => ({ ...h }));
  }

  distinctTurns(groupId: string, limit: number): number[] {
    const turns = new Set(
      Array.from(this.rows.values())
        .filter((h) => h.group_id === groupId)
        .map((h) => h.turn_seq),
    );
    return Array.from(turns).sort((a, b) => b - a).slice(0, limit);
  }

  sweepOrphan(detail: string, now: number): number {
    let n = 0;
    for (const h of this.rows.values()) {
      if (h.settled_at === null) {
        h.status = 'aborted';
        h.detail = detail;
        h.settled_at = now;
        n++;
      }
    }
    return n;
  }

  reset(): void {
    this.rows.clear();
  }
}
