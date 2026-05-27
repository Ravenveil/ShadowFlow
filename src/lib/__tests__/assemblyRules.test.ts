import { describe, it, expect } from 'vitest';
import { deriveRosterRule, enforceRoster } from '../assemblyRules';

describe('deriveRosterRule', () => {
  it('bug 原句"帮我创建一个开发工程师agent" → maxAgents=1', () => {
    const r = deriveRosterRule('帮我创建一个开发工程师agent');
    expect(r?.maxAgents).toBe(1);
  });
  it('"单个 agent" → maxAgents=1', () => {
    expect(deriveRosterRule('给我一个单个 agent 就行')?.maxAgents).toBe(1);
  });
  it('"create a single agent" → maxAgents=1', () => {
    expect(deriveRosterRule('create a single agent for review')?.maxAgents).toBe(1);
  });
  it('含"团队"→ 不强制（null）', () => {
    expect(deriveRosterRule('创建一个开发团队')).toBeNull();
  });
  it('明确多人"3 个 agent 团队"→ 不强制（null）', () => {
    expect(deriveRosterRule('帮我搭一个 review 团队，要 3 个 agent')).toBeNull();
  });
  it('无数量短语 → null', () => {
    expect(deriveRosterRule('帮我写个 agent 做代码审查')).toBeNull();
  });
  it('空 goal → null', () => {
    expect(deriveRosterRule('')).toBeNull();
  });
});

describe('enforceRoster', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('maxAgents=1 → 保留 1 丢 2', () => {
    const { kept, dropped } = enforceRoster(nodes, { maxAgents: 1, reason: 'x' });
    expect(kept.map(n => n.id)).toEqual(['a']);
    expect(dropped.map(n => n.id)).toEqual(['b', 'c']);
  });
  it('rule=null → 全保留', () => {
    const { kept, dropped } = enforceRoster(nodes, null);
    expect(kept).toHaveLength(3);
    expect(dropped).toHaveLength(0);
  });
  it('节点数 <= max → 全保留', () => {
    const { kept, dropped } = enforceRoster(nodes, { maxAgents: 5, reason: 'x' });
    expect(kept).toHaveLength(3);
    expect(dropped).toHaveLength(0);
  });
  it('maxAgents=null（不限制）→ 全保留', () => {
    const { kept } = enforceRoster(nodes, { maxAgents: null, reason: 'x' });
    expect(kept).toHaveLength(3);
  });
});
