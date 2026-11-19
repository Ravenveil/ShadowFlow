/**
 * collaboration 域 — agent-hops SQLite Repository 实现（外部，技术变化驱动）
 * SQL 全部锁在本文件，逐字对齐原 storage/agent-hops.ts。
 */

import { getDb } from '../../../storage/sqlite';
import { normalizeTurns } from '../hops-model';
import type { AgentHop, OpenHop, SettleOptions } from '../hops-model';
import type { HopRepository } from '../hops-repository';

export class SqliteHopRepository implements HopRepository {
  nextTurnSeq(groupId: string): number {
    const row = getDb()
      .prepare(`SELECT COALESCE(MAX(turn_seq), 0) AS n FROM agent_hops WHERE group_id = ?`)
      .get(groupId) as { n: number };
    return row.n + 1;
  }

  open(hop: OpenHop, id: string, now: number): void {
    getDb()
      .prepare(
        `INSERT INTO agent_hops (id, group_id, turn_seq, from_agent, to_agent, status, output_chars, detail, created_at, settled_at)
         VALUES (?, ?, ?, ?, ?, 'pending', 0, '', ?, NULL)`,
      )
      .run(id, hop.group_id, hop.turn_seq, hop.from_agent, hop.to_agent, now);
  }

  start(id: string): void {
    getDb()
      .prepare(
        `UPDATE agent_hops SET status = 'running', created_at = created_at WHERE id = ? AND status = 'pending'`,
      )
      .run(id);
  }

  settle(id: string, status: string, opts: { outputChars: number; detail: string }, now: number): void {
    getDb()
      .prepare(
        `UPDATE agent_hops
         SET status = ?, output_chars = ?, detail = ?, settled_at = ?
         WHERE id = ? AND settled_at IS NULL`,
      )
      .run(status, opts.outputChars, opts.detail, now, id);
  }

  listByTurn(groupId: string, turnSeq: number): AgentHop[] {
    return getDb()
      .prepare(
        `SELECT * FROM agent_hops WHERE group_id = ? AND turn_seq = ? ORDER BY created_at, id`,
      )
      .all(groupId, turnSeq) as AgentHop[];
  }

  distinctTurns(groupId: string, limit: number): number[] {
    const rows = getDb()
      .prepare(
        `SELECT DISTINCT turn_seq FROM agent_hops WHERE group_id = ? ORDER BY turn_seq DESC LIMIT ?`,
      )
      .all(groupId, normalizeTurns(limit)) as Array<{ turn_seq: number }>;
    return rows.map((r) => r.turn_seq);
  }

  sweepOrphan(detail: string, now: number): number {
    return getDb()
      .prepare(
        `UPDATE agent_hops SET status = 'aborted', detail = ?, settled_at = ?
         WHERE settled_at IS NULL`,
      )
      .run(detail, now).changes;
  }

  reset(): void {
    getDb().prepare(`DELETE FROM agent_hops`).run();
  }
}

/** 保留类型导出供兼容层复用。 */
export type { OpenHop, SettleOptions };
