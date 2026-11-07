/**
 * groupApi 成员编辑（Grok 式「加人即建群」）回归测试。
 *
 * 2026-11-04 浏览器实测抓到的 bug：给一个 0 成员的群加第一个人时，旧实现按
 * 「成员数 > 1 ? group : dm」把 kind 降级成 dm，会话从群聊跳成单聊（群名被
 * 单聊头像/名字盖掉）。正确语义是**只升级、不降级**：仅当原本是 dm 且加了
 * 第二个人时才下发 kind='group'。
 *
 * 2026-11-06 建群即建编队（用户反馈：创建群聊后编队不显示成员）：
 *   - 无 team_id 的群聊（自由群 / 单聊加人升级成群）→ addGroupMembers 收尾
 *     find-or-create 同名编队（roster = 群成员）并 PATCH 挂链，返回记录带
 *     新 team_id（ensureGroupTeam）；
 *   - 已有编队的群 → 成员增删同步 PATCH 团队 roster（syncTeamRosterDelta），
 *     保证编队 tab 成员网格与群成员一致。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addGroupMembers, ensureGroupTeam, removeGroupMember } from '../groupApi';
import type { GroupRecord } from '../groupApi';

type GroupFixture = {
  group_id: string;
  name: string;
  kind: 'dm' | 'group';
  agent_ids: string[];
  team_id?: string | null;
  workspace_id?: string;
};

/**
 * 后端桩：groups PATCH 合入记录；teams POST/PATCH 记账（编队补建与
 * roster 跟随都在 teams 端点上，分开记账才能精确断言）。
 */
function mockBackend(initial: GroupFixture) {
  let current = { ...initial };
  const groupPatches: Array<Record<string, unknown>> = [];
  const teamPatches: Array<Record<string, unknown>> = [];
  const teamPosts: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      const u = String(url);
      const ok = (data: unknown) =>
        ({
          ok: true,
          status: 200,
          clone: () => ({ json: async () => ({}) }),
          json: async () => ({ data }),
        }) as unknown as Response;
      if (init?.method === 'POST' && u.includes('/api/teams')) {
        teamPosts.push(body);
        return ok({
          team_id: 't-heal',
          name: body.name,
          description: '',
          workspace_id: 'ws1',
          agent_ids: body.agent_ids ?? [],
          created_at: '',
          updated_at: '',
        });
      }
      if (init?.method === 'PATCH' && u.includes('/api/teams')) {
        teamPatches.push(body);
        return ok({});
      }
      if (init?.method === 'PATCH') {
        groupPatches.push(body);
        current = { ...current, ...body } as GroupFixture;
        return ok(current);
      }
      return ok(current);
    }),
  );
  return {
    groupPatches,
    teamPatches,
    teamPosts,
    get current() {
      return current;
    },
  };
}

describe('groupApi — Grok 式成员编辑', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('单聊加第二个人 → 升级为 group，全量回写去重保序，并补建编队挂链', async () => {
    const backend = mockBackend({ group_id: 'g1', name: 'dm', kind: 'dm', agent_ids: ['a1'] });
    const result = await addGroupMembers('g1', ['a2', 'a2', 'a1']);
    expect(result.agent_ids).toEqual(['a1', 'a2']);
    expect(backend.groupPatches[0]).toEqual({ agent_ids: ['a1', 'a2'], kind: 'group' });
    // 2026-11-06 建群即建编队：升级成群后补建同名编队（roster = 群成员）并挂链
    expect(backend.teamPosts).toHaveLength(1);
    expect(backend.teamPosts[0]).toMatchObject({ name: 'dm', agent_ids: ['a1', 'a2'] });
    expect(backend.groupPatches[1]).toEqual({ team_id: 't-heal' });
    expect(result.team_id).toBe('t-heal');
  });

  it('群聊（0 成员）加第一个人 → 不下发 kind 绝不降级；无编队同样补建', async () => {
    const backend = mockBackend({ group_id: 'g2', name: 'hi', kind: 'group', agent_ids: [] });
    const result = await addGroupMembers('g2', ['a1']);
    expect(result.agent_ids).toEqual(['a1']);
    expect(backend.groupPatches[0]).toEqual({ agent_ids: ['a1'] });
    expect(backend.groupPatches[0]).not.toHaveProperty('kind');
    expect(backend.teamPosts[0]).toMatchObject({ name: 'hi', agent_ids: ['a1'] });
    expect(result.team_id).toBe('t-heal');
  });

  it('已有编队的群加人 → roster 跟随（add_agent_ids），不重复建队', async () => {
    const backend = mockBackend({
      group_id: 'g4',
      name: 'team',
      kind: 'group',
      agent_ids: ['a1'],
      team_id: 't9',
    });
    const result = await addGroupMembers('g4', ['a2']);
    expect(result.team_id).toBe('t9');
    expect(backend.teamPosts).toHaveLength(0);
    expect(backend.teamPatches).toEqual([{ add_agent_ids: ['a2'] }]);
  });

  it('移出成员 → 不下发 kind（群聊不会因人少变单聊）；已有编队 roster 跟随', async () => {
    const backend = mockBackend({
      group_id: 'g3',
      name: 'team',
      kind: 'group',
      agent_ids: ['a1', 'a2'],
      team_id: 't9',
    });
    const result = await removeGroupMember('g3', 'a2');
    expect(result.agent_ids).toEqual(['a1']);
    expect(backend.groupPatches[0]).toEqual({ agent_ids: ['a1'] });
    expect(backend.groupPatches[0]).not.toHaveProperty('kind');
    expect(backend.teamPatches).toEqual([{ remove_agent_ids: ['a2'] }]);
    expect(backend.teamPosts).toHaveLength(0);
  });
});

describe('groupApi — ensureGroupTeam（建群即建编队 find-or-create）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('已有 team_id → 幂等直返，不建队不挂链', async () => {
    const backend = mockBackend({
      group_id: 'g5',
      name: 'x',
      kind: 'group',
      agent_ids: ['a1'],
      team_id: 't7',
    });
    const tid = await ensureGroupTeam(backend.current as unknown as GroupRecord);
    expect(tid).toBe('t7');
    expect(backend.teamPosts).toHaveLength(0);
    expect(backend.groupPatches).toHaveLength(0);
  });

  it('DM → 不建编队返回 null', async () => {
    const backend = mockBackend({ group_id: 'g6', name: 'x', kind: 'dm', agent_ids: ['a1'] });
    const tid = await ensureGroupTeam(backend.current as unknown as GroupRecord);
    expect(tid).toBeNull();
    expect(backend.teamPosts).toHaveLength(0);
    expect(backend.groupPatches).toHaveLength(0);
  });

  it('自由群 → 建同名编队（roster = 群成员）并 PATCH 挂链', async () => {
    const backend = mockBackend({
      group_id: 'g7',
      name: '合规审核',
      kind: 'group',
      agent_ids: ['a1', 'a2'],
    });
    const tid = await ensureGroupTeam(backend.current as unknown as GroupRecord);
    expect(tid).toBe('t-heal');
    expect(backend.teamPosts[0]).toMatchObject({ name: '合规审核', agent_ids: ['a1', 'a2'] });
    expect(backend.groupPatches[0]).toEqual({ team_id: 't-heal' });
  });

  it('建队失败（后端不可用）→ 返回 null 不抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const tid = await ensureGroupTeam({
      group_id: 'g8',
      name: 'x',
      agent_ids: ['a1'],
    } as unknown as GroupRecord);
    expect(tid).toBeNull();
  });
});
