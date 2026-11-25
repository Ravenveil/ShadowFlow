import { describe, expect, it } from 'vitest';
import {
  defaultUserSetting,
  isDmForAgent,
  nextPinned,
  normalizeGroupKind,
  normalizeSenderKind,
  parseJsonSafe,
  resolveKindsFilter,
  toggleReaction,
} from './groups-model';

describe('reactions 切换', () => {
  it('加反应去重，同一用户重复加只有一个', () => {
    let r = toggleReaction({}, '👍', 'u1', true);
    r = toggleReaction(r, '👍', 'u1', true);
    expect(r['👍']).toEqual(['u1']);
  });

  it('多用户累加，取消后只删自己', () => {
    let r = toggleReaction({}, '👍', 'u1', true);
    r = toggleReaction(r, '👍', 'u2', true);
    r = toggleReaction(r, '👍', 'u1', false);
    expect(r['👍']).toEqual(['u2']);
  });

  it('最后一个用户取消 → 剪掉整个 emoji 桶（不留空数组）', () => {
    let r = toggleReaction({}, '🎉', 'u1', true);
    r = toggleReaction(r, '🎉', 'u1', false);
    expect('🎉' in r).toBe(false);
    expect(r).toEqual({});
  });

  it('不改入参（纯函数）', () => {
    const base = { '👍': ['u1'] };
    const next = toggleReaction(base, '👍', 'u2', true);
    expect(base['👍']).toEqual(['u1']);
    expect(next['👍']).toEqual(['u1', 'u2']);
  });
});

describe('置顶语义', () => {
  it('省略参数是翻转，不是设为 true', () => {
    expect(nextPinned(false)).toBe(true);
    expect(nextPinned(true)).toBe(false);
  });

  it('显式值直接设（幂等）', () => {
    expect(nextPinned(false, true)).toBe(true);
    expect(nextPinned(true, true)).toBe(true);
    expect(nextPinned(true, false)).toBe(false);
  });
});

describe('DM 幂等匹配', () => {
  it('agent_ids 恰为该 agent 一条才算 DM', () => {
    expect(isDmForAgent(['a1'], 'a1')).toBe(true);
    expect(isDmForAgent(['a1'], 'a2')).toBe(false);
    expect(isDmForAgent(['a1', 'a2'], 'a1')).toBe(false);
    expect(isDmForAgent([], 'a1')).toBe(false);
  });
});

describe('列表与存储形归一', () => {
  it('未指定 kind 时默认只列 group（DM 不混进群列表）', () => {
    expect(resolveKindsFilter(undefined)).toEqual(['group']);
    expect(resolveKindsFilter([])).toEqual(['group']);
    expect(resolveKindsFilter(['dm'])).toEqual(['dm']);
    expect(resolveKindsFilter(['group', 'dm'])).toEqual(['group', 'dm']);
  });

  it('非法 kind / sender_kind 回退到安全默认', () => {
    expect(normalizeGroupKind('dm')).toBe('dm');
    expect(normalizeGroupKind('group')).toBe('group');
    expect(normalizeGroupKind('weird')).toBe('group');
    expect(normalizeSenderKind('agent')).toBe('agent');
    expect(normalizeSenderKind('system')).toBe('system');
    expect(normalizeSenderKind('robot')).toBe('user');
    expect(normalizeSenderKind(undefined)).toBe('user');
  });

  it('容错 JSON：坏数据回退，空值回退', () => {
    expect(parseJsonSafe<string[]>('["a","b"]', [])).toEqual(['a', 'b']);
    expect(parseJsonSafe<string[]>('{oops', [])).toEqual([]);
    expect(parseJsonSafe<string[]>(null, [])).toEqual([]);
    expect(parseJsonSafe<string[]>('', ['d'])).toEqual(['d']);
  });

  it('用户偏好默认干净（不静音不置顶不折叠、显示昵称）', () => {
    expect(defaultUserSetting()).toEqual({
      muted: false,
      pinned: false,
      folded: false,
      show_nickname: true,
      my_nickname: null,
    });
  });
});
