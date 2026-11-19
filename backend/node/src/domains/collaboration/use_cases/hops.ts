/**
 * collaboration 域 — agent-hops 用例（application 层）
 *
 * 只依赖 hops-model（规则）+ hops-repository（接口），可注入内存 repo 单测。
 * 行为逐字对齐原 storage/agent-hops.ts。
 */

import {
  hopStatusLabel,
  normalizeSettleFields,
  normalizeSweepDetail,
  summarizeHopsText,
  type AgentHop,
  type OpenHop,
  type SettledStatus,
} from '../hops-model';
import type { HopRepository } from '../hops-repository';

export type HopDeps = { newId?: () => string; now?: () => number };

export const makeNextTurnSeq =
  (repo: HopRepository) =>
  (groupId: string): number =>
    repo.nextTurnSeq(groupId);

export const makeOpenHop =
  (repo: HopRepository, deps: HopDeps = {}) =>
  (hop: OpenHop): string => {
    const id = (deps.newId ?? (() => ''))();
    repo.open(hop, id, (deps.now ?? (() => Date.now()))());
    return id;
  };

export const makeStartHop =
  (repo: HopRepository) =>
  (id: string): void =>
    repo.start(id);

/** 结算：规则（字符数/细节规整）在 model，幂等由 repo 保证。 */
export const makeSettleHop =
  (repo: HopRepository, deps: HopDeps = {}) =>
  (id: string, status: SettledStatus, opts: { outputChars?: number; detail?: string } = {}): void => {
    const fields = normalizeSettleFields(opts);
    repo.settle(id, status, fields, (deps.now ?? (() => Date.now()))());
  };

export const makeListHopsByTurn =
  (repo: HopRepository) =>
  (groupId: string, turnSeq: number): AgentHop[] =>
    repo.listByTurn(groupId, turnSeq);

export const makeListRecentHops =
  (repo: HopRepository) =>
  (groupId: string, turns = 1): AgentHop[] => {
    const out: AgentHop[] = [];
    for (const seq of repo.distinctTurns(groupId, turns)) {
      out.push(...repo.listByTurn(groupId, seq));
    }
    return out;
  };

export const makeSummarizeHops =
  (repo: HopRepository) =>
  (groupId: string, turnSeq: number): string =>
    summarizeHopsText(repo.listByTurn(groupId, turnSeq));

export const makeSweepOrphanHops =
  (repo: HopRepository, deps: HopDeps = {}) =>
  (opts: { detail?: string } = {}): number =>
    repo.sweepOrphan(normalizeSweepDetail(opts.detail), (deps.now ?? (() => Date.now()))());

/** 状态标签直接 re-export（供兼容层）。 */
export { hopStatusLabel };
