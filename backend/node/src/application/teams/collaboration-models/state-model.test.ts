/**
 * agent-state 纯规则层单测：零 IO、不启 server、不碰磁盘。
 */

import { describe, it, expect } from 'vitest';
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
  MUTABLE_FIELDS,
  IMMUTABLE_FIELDS,
  type AgentState,
} from './state-model';

const now = () => '2026-01-01T00:00:00.000Z';

describe('ID 校验与错误体系', () => {
  it('合法 agent_id', () => {
    expect(() => validateAgentId('agent_01')).not.toThrow();
    expect(() => validateAgentId('a'.repeat(128))).not.toThrow();
  });

  it('非法 agent_id / snapshot_id', () => {
    expect(() => validateAgentId('../x')).toThrow(StateServiceError);
    expect(() => validateAgentId('')).toThrow(StateServiceError);
    expect(() => validateSnapshotId('bad id')).toThrow(StateServiceError);
  });

  it('错误 code 与 details', () => {
    const e = new StateConflictError(2, 3);
    expect(e.code).toBe('STATE_CONFLICT');
    expect(e.details).toEqual({ expected: 2, got: 3 });
    const n = new SnapshotNotFoundError('a', 's');
    expect(n.code).toBe('SNAPSHOT_NOT_FOUND');
  });
});

describe('AgentState 工厂与归一化', () => {
  it('newAgentState 默认值', () => {
    const s = newAgentState('a1', now);
    expect(s.state_version).toBe(0);
    expect(s.state_fields).toEqual({});
    expect(s.created_at).toBe(now());
  });

  it('normalizeState 缺字段回填', () => {
    const s = normalizeState({ agent_id: 'a1', state_version: 5 }, 'a1', now);
    expect(s.state_version).toBe(5);
    expect(s.session_summary).toBe('');
    expect(s.recent_artifacts).toEqual([]);
  });

  it('normalizeState 数组/对象类型守卫', () => {
    const s = normalizeState({ recent_artifacts: [1, 2], state_fields: 'bad' }, 'a1', now);
    expect(s.recent_artifacts).toEqual([]);
    expect(s.state_fields).toEqual({});
  });
});

describe('乐观锁 patch（核心不变量）', () => {
  it('版本匹配 → 应用白名单 + 版本+1', () => {
    const s = newAgentState('a1', now);
    const next = applyStatePatch(s, { version: 0, session_summary: 'hi' }, now);
    expect(next.session_summary).toBe('hi');
    expect(next.state_version).toBe(1);
  });

  it('版本冲突 → StateConflictError', () => {
    const s = newAgentState('a1', now);
    expect(() => applyStatePatch(s, { version: 3 }, now)).toThrow(StateConflictError);
  });

  it('不可变字段被忽略', () => {
    const s = newAgentState('a1', now);
    const next = applyStatePatch(s, {
      version: 0,
      agent_id: 'evil',
      state_version: 99,
      created_at: 'x',
    }, now);
    expect(next.agent_id).toBe('a1');
    expect(next.state_version).toBe(1);
  });

  it('白名单/不可变集合无交集', () => {
    for (const k of MUTABLE_FIELDS) expect(IMMUTABLE_FIELDS.has(k)).toBe(false);
  });

  it('未传 version → 用当前版本（不冲突）', () => {
    const s = newAgentState('a1', now);
    expect(() => applyStatePatch(s, { pending_tasks: ['t'] }, now)).not.toThrow();
  });
});

describe('reset / restore / 快照列表', () => {
  it('reset 清运行态、保留 profile refs', () => {
    const s: AgentState = {
      ...newAgentState('a1', now),
      role_profile_ref: 'rp',
      memory_profile_ref: 'mp',
      session_summary: 'x',
      state_fields: { k: 1 },
    };
    const r = resetStateFields(s, now);
    expect(r.session_summary).toBe('');
    expect(r.state_fields).toEqual({});
    expect(r.role_profile_ref).toBe('rp');
    expect(r.state_version).toBe(s.state_version + 1);
  });

  it('bumpVersion 版本 +1', () => {
    const s = newAgentState('a1', now);
    expect(bumpVersion(s, now).state_version).toBe(1);
  });

  it('snapshotSummary 字段提取', () => {
    const sum = snapshotSummary('snap1.json', { updated_at: 't2', created_at: 't1', state_version: 3 });
    expect(sum.snapshot_id).toBe('snap1');
    expect(sum.created_at).toBe('t2'); // updated_at 优先
    expect(sum.state_version).toBe(3);
  });

  it('sortSnapshots created_at 倒序截断', () => {
    const rows = [
      { snapshot_id: 'a', created_at: 't1' },
      { snapshot_id: 'b', created_at: 't3' },
      { snapshot_id: 'c', created_at: 't2' },
    ];
    const sorted = sortSnapshots(rows, 2);
    expect(sorted.map((r) => r.snapshot_id)).toEqual(['b', 'c']);
  });
});
