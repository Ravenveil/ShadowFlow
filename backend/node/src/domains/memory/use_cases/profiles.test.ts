/**
 * profiles 用例单测：注入内存 repo，零 IO、不启 server、不碰磁盘。
 */

import { describe, it, expect } from 'vitest';
import { InMemoryProfileRepository } from '../profiles-repository';
import {
  makeCreateProfile,
  makeListProfiles,
  makeGetProfile,
  makeUpdateProfile,
  makeDeleteProfile,
} from './profiles';
import { FieldViolationError, UUID_RE } from '../profiles-model';

let seq = 0;
const deps = { newId: () => `p-${++seq}`, now: () => `2026-01-01T00:00:0${seq}Z` };

describe('profiles 领域纯函数', () => {
  it('UUID 正则', () => {
    expect(UUID_RE.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(UUID_RE.test('not-a-uuid')).toBe(false);
  });

  it('数值下限：working_memory_limit < 256 抛错', () => {
    expect(() => makeCreateProfile(new InMemoryProfileRepository(), deps)({ working_memory_limit: 255 })).toThrow(FieldViolationError);
  });

  it('非整数抛错', () => {
    expect(() => makeCreateProfile(new InMemoryProfileRepository(), deps)({ compression_top_k: 1.5 })).toThrow(FieldViolationError);
  });

  it('非法枚举抛错', () => {
    expect(() => makeCreateProfile(new InMemoryProfileRepository(), deps)({ state_sync_policy: 'x' as never })).toThrow(FieldViolationError);
  });
});

describe('profiles 用例', () => {
  it('新建 → 默认值回填', () => {
    const repo = new InMemoryProfileRepository();
    const p = makeCreateProfile(repo, deps)({});
    expect(p.working_memory_limit).toBe(4096);
    expect(p.writeback_policy).toBe('on_task_complete');
    expect(repo.rows.size).toBe(1);
  });

  it('新建 → 自定义值保留', () => {
    const repo = new InMemoryProfileRepository();
    const p = makeCreateProfile(repo, deps)({ working_memory_limit: 512, compression_policy: 'summarize' });
    expect(p.working_memory_limit).toBe(512);
    expect(p.compression_policy).toBe('summarize');
  });

  it('列表按 updated_at 倒序', () => {
    const repo = new InMemoryProfileRepository();
    const create = makeCreateProfile(repo, deps);
    create({});
    create({});
    const list = makeListProfiles(repo)();
    expect(list).toHaveLength(2);
    expect(list[0].updated_at >= list[1].updated_at).toBe(true);
  });

  it('更新 patch 只改出现字段 + 刷新时间', () => {
    const repo = new InMemoryProfileRepository();
    const create = makeCreateProfile(repo, deps);
    const p = create({});
    const updated = makeUpdateProfile(repo, deps)(p.profile_id, { working_memory_limit: 2048 })!;
    expect(updated.working_memory_limit).toBe(2048);
    expect(updated.writeback_policy).toBe(p.writeback_policy);
  });

  it('更新不存在 → null', () => {
    const repo = new InMemoryProfileRepository();
    expect(makeUpdateProfile(repo, deps)('missing', {})).toBeNull();
  });

  it('删除 → true/false', () => {
    const repo = new InMemoryProfileRepository();
    const p = makeCreateProfile(repo, deps)({});
    expect(makeDeleteProfile(repo)(p.profile_id)).toBe(true);
    expect(makeDeleteProfile(repo)(p.profile_id)).toBe(false);
    expect(makeGetProfile(repo)(p.profile_id)).toBeNull();
  });
});
