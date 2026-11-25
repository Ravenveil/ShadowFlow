/**
 * agent-state-service.ts — 兼容装配层（DDD 迁移后，2026-11-19）
 *
 * 错误体系、ID 校验、AgentState 默认值/归一化、乐观锁 patch、reset、排序等
 * 纯规则已迁至 domains/collaboration/state-model.ts（单一真源，可独立单测）。
 * 本文件保留 fs 路径/读写（repoDataFile 收口），委托规则，导出名原样保留。
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { repoDataFile } from '../adapters/infra-repo-root';
import {
  StateServiceError,
  StateConflictError,
  SnapshotNotFoundError,
  validateAgentId,
  validateSnapshotId,
  normalizeState,
  newAgentState,
  applyStatePatch,
  resetStateFields,
  bumpVersion,
  sortSnapshots,
  snapshotSummary,
  type AgentState,
} from '../teams/collaboration-models/state-model';

// 错误类 re-export（保持 instanceof identity 一致）
export { StateServiceError, StateConflictError, SnapshotNotFoundError };
export type { AgentState };

const nowIso = (): string => new Date().toISOString();

// ── 存储路径（repoDataFile 收口，与 Python .shadowflow 同构） ──────────────────

function stateDir(): string {
  return repoDataFile('agent_state');
}
function statePath(agentId: string): string {
  return path.join(stateDir(), `${agentId}.json`);
}
function snapshotDir(agentId: string): string {
  return repoDataFile('state_snapshots', agentId);
}
function snapshotPath(agentId: string, snapshotId: string): string {
  return path.join(snapshotDir(agentId), `${snapshotId}.json`);
}

/** _write_secure：写盘 + 尽力 0o600（Windows/ACL 失败仅告警）。 */
function writeSecure(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    console.warn(`agent-state-service: chmod 0o600 failed for ${filePath} (Windows/ACL limitation)`);
  }
}

function readStateFile(agentId: string): AgentState | null {
  const file = statePath(agentId);
  if (!fs.existsSync(file)) return null;
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return normalizeState(raw, agentId, nowIso);
}

// ── Service（StateService 六方法，规则委托 model） ────────────────────────────

export function getState(agentId: string): AgentState | null {
  validateAgentId(agentId);
  return readStateFile(agentId);
}

export function updateState(agentId: string, patch: Record<string, unknown>): AgentState {
  validateAgentId(agentId);
  const state = readStateFile(agentId) ?? newAgentState(agentId, nowIso);
  const updated = applyStatePatch(state, patch, nowIso);
  writeSecure(statePath(agentId), JSON.stringify(updated, null, 2));
  return updated;
}

export function snapshotState(agentId: string): string {
  validateAgentId(agentId);
  const state = readStateFile(agentId) ?? newAgentState(agentId, nowIso);
  const snapshotId = randomUUID().replace(/-/g, '');
  writeSecure(snapshotPath(agentId, snapshotId), JSON.stringify(state, null, 2));
  return snapshotId;
}

export function restoreState(agentId: string, snapshotId: string): AgentState {
  validateAgentId(agentId);
  validateSnapshotId(snapshotId);
  const file = snapshotPath(agentId, snapshotId);
  if (!fs.existsSync(file)) throw new SnapshotNotFoundError(agentId, snapshotId);
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const restored = bumpVersion(normalizeState(raw, agentId, nowIso), nowIso);
  writeSecure(statePath(agentId), JSON.stringify(restored, null, 2));
  return restored;
}

export function listSnapshots(agentId: string, limit = 50): Array<Record<string, unknown>> {
  validateAgentId(agentId);
  const dir = snapshotDir(agentId);
  if (!fs.existsSync(dir)) return [];
  const results: Array<Record<string, unknown>> = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf-8')) as Record<string, unknown>;
      results.push(snapshotSummary(entry, data));
    } catch {
      console.warn(`agent-state-service: unreadable snapshot ${path.join(dir, entry)}`);
    }
  }
  return sortSnapshots(results, limit);
}

export function resetState(agentId: string): AgentState {
  validateAgentId(agentId);
  const state = readStateFile(agentId) ?? newAgentState(agentId, nowIso);
  const reset = resetStateFields(state, nowIso);
  writeSecure(statePath(agentId), JSON.stringify(reset, null, 2));
  return reset;
}
