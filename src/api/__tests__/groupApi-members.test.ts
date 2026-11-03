/**
 * groupApi 成员编辑（Grok 式「加人即建群」）回归测试。
 *
 * 2026-11-04 浏览器实测抓到的 bug：给一个 0 成员的群加第一个人时，旧实现按
 * 「成员数 > 1 ? group : dm」把 kind 降级成 dm，会话从群聊跳成单聊（群名被
 * 单聊头像/名字盖掉）。正确语义是**只升级、不降级**：仅当原本是 dm 且加了
 * 第二个人时才下发 kind='group'。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addGroupMembers, removeGroupMember } from '../groupApi';

interface GroupFixture {
  group_id: string;
  name: string;
  kind: 'dm' | 'group';
  agent_ids: string[];
}

function mockBackend(initial: GroupFixture) {
  let current = { ...initial };
  const patches: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (init?.method === 'PATCH') {
        patches.push(body);
        current = { ...current, ...body } as GroupFixture;
      }
      return {
        ok: true,
        status: 200,
        clone: () => ({ json: async () => ({}) }),
        json: async () => ({ data: current }),
      } as unknown as Response;
    }),
  );
  return { patches, get current() { return current; } };
}

describe('groupApi — Grok 式成员编辑', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('单聊加第二个人 → 升级为 group，且全量回写去重保序', async () => {
    const backend = mockBackend({ group_id: 'g1', name: 'dm', kind: 'dm', agent_ids: ['a1'] });
    const result = await addGroupMembers('g1', ['a2', 'a2', 'a1']);
    expect(result.agent_ids).toEqual(['a1', 'a2']);
    expect(backend.patches).toHaveLength(1);
    expect(backend.patches[0]).toEqual({ agent_ids: ['a1', 'a2'], kind: 'group' });
  });

  it('群聊（0 成员）加第一个人 → 不下发 kind，绝不降级成 dm', async () => {
    const backend = mockBackend({ group_id: 'g2', name: 'hi', kind: 'group', agent_ids: [] });
    const result = await addGroupMembers('g2', ['a1']);
    expect(result.agent_ids).toEqual(['a1']);
    expect(backend.patches[0]).toEqual({ agent_ids: ['a1'] });
    expect(backend.patches[0]).not.toHaveProperty('kind');
  });

  it('移出成员 → 不下发 kind（群聊不会因人少变单聊）', async () => {
    const backend = mockBackend({
      group_id: 'g3',
      name: 'team',
      kind: 'group',
      agent_ids: ['a1', 'a2'],
    });
    const result = await removeGroupMember('g3', 'a2');
    expect(result.agent_ids).toEqual(['a1']);
    expect(backend.patches[0]).toEqual({ agent_ids: ['a1'] });
    expect(backend.patches[0]).not.toHaveProperty('kind');
  });
});
