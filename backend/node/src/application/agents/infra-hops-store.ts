/**
 * agent-hops.ts — 兼容装配层（DDD 迁移后，2026-11-19）
 *
 * 领域规则已迁至 domains/collaboration/hops-model.ts（状态机/摘要/规整），
 * 用例编排已迁至 domains/collaboration/use_cases/hops.ts，
 * SQL 已锁在 domains/collaboration/infra/sqlite-hop.repository.ts。
 *
 * 本文件只做「装配 + 导出兼容」，原样暴露迁移前全部符号，调用方零改动：
 *   - index.ts:103 sweepOrphanHops（启动清扫）
 *   - groups-chat.ts:49-56 nextTurnSeq/openHop/startHop/settleHop/summarizeHops/listRecentHops
 *   - agent-hops.test.ts import * as hops
 */

import { randomUUID } from 'crypto';
import { SqliteHopRepository } from '../teams/collaboration-models/infra/sqlite-hop.repository';
import {
  makeNextTurnSeq,
  makeOpenHop,
  makeStartHop,
  makeSettleHop,
  makeListHopsByTurn,
  makeListRecentHops,
  makeSummarizeHops,
  makeSweepOrphanHops,
} from '../teams/collaboration-models/use_cases/hops';
import {
  hopStatusLabel,
  type HopStatus,
  type AgentHop,
  type OpenHop,
} from '../teams/collaboration-models/hops-model';

const repo = new SqliteHopRepository();
const deps = { newId: () => randomUUID(), now: () => Date.now() };

// ── 类型 / 常量（原样重导出） ────────────────────────────────────────────────
export { hopStatusLabel };
export type { HopStatus, AgentHop, OpenHop };

// ── 函数（原签名 + 原行为） ──────────────────────────────────────────────────

export function nextTurnSeq(groupId: string): number {
  return makeNextTurnSeq(repo)(groupId);
}

export function openHop(hop: OpenHop): string {
  return makeOpenHop(repo, deps)(hop);
}

export function startHop(id: string): void {
  makeStartHop(repo)(id);
}

export function settleHop(
  id: string,
  status: Exclude<HopStatus, 'pending' | 'running'>,
  opts: { outputChars?: number; detail?: string } = {},
): void {
  makeSettleHop(repo, deps)(id, status, opts);
}

export function listHopsByTurn(groupId: string, turnSeq: number): AgentHop[] {
  return makeListHopsByTurn(repo)(groupId, turnSeq);
}

export function listRecentHops(groupId: string, turns = 1): AgentHop[] {
  return makeListRecentHops(repo)(groupId, turns);
}

export function summarizeHops(groupId: string, turnSeq: number): string {
  return makeSummarizeHops(repo)(groupId, turnSeq);
}

export function sweepOrphanHops(opts: { detail?: string } = {}): number {
  return makeSweepOrphanHops(repo, deps)(opts);
}

export function _resetHopsForTests(): void {
  repo.reset();
}
