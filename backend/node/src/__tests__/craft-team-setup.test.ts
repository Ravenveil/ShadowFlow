/**
 * craft-team-setup.test.ts — 代卖 agent 团队搭建契约测试（2026-11-08）。
 *
 * 覆盖：
 *   - 总经理 n1 + 6 部门核心员工建齐（soul 含输出协议标记说明）→ team →
 *     架构图 DAG workflow（市场→品牌→[品牌定稿审批]→内容→合规↺驳回返工(≤2)
 *     →[对外发布审批]→运营 + direct→商务）→ 绑 team 的工作群；
 *   - settings 持久化 team/group 引用；
 *   - 幂等：二次 setup 不重复建 agent/群，复用并刷新 soul + 重刷 workflow；
 *   - Python 后端不可达 → CraftProfitError 上抛（不静默）。
 * Python API 全部用注入 fetch 假件记录调用。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmp: string;
let origCwd: string;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let sqlite: typeof import('../storage/sqlite');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let setupMod: typeof import('../storage/craft-team-setup');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let intake: typeof import('../storage/craft-intake');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let settings: typeof import('../storage/settings');

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/** 假 Python：agents/teams/groups 记忆化创建，GET 回读。预置内置「总经理」。 */
function stubPy(calls: Call[], opts: { failAgents?: boolean } = {}) {
  const agents: Array<{ agent_id: string; name: string; soul: string }> = [
    { agent_id: 'agent-shadow-secretary', name: '总经理', soul: '主控（内置秘书）' },
  ];
  const teams = new Map<string, Record<string, unknown>>();
  const groups = new Map<string, Record<string, unknown>>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ method, url: u, body });
      const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) });
      const notFound = { ok: false, json: async () => ({}) };

      if (u.endsWith('/api/agents') && method === 'POST') {
        if (opts.failAgents) return notFound;
        const rec = {
          agent_id: `a${agents.length + 1}`,
          name: String(body?.name ?? ''),
          soul: String(body?.soul ?? ''),
        };
        agents.push(rec);
        return ok(rec);
      }
      const agentMatch = /\/api\/agents\/([^/]+)$/.exec(u);
      if (agentMatch) {
        const rec = agents.find((a) => a.agent_id === agentMatch[1]);
        if (!rec) return notFound;
        if (method === 'PATCH' && body?.soul !== undefined) rec.soul = String(body.soul);
        return ok(rec);
      }
      if (u.endsWith('/api/teams') && method === 'POST') {
        const teamId = `team-${teams.size + 1}`;
        const rec = { team_id: teamId, ...body };
        teams.set(teamId, rec);
        return ok(rec);
      }
      const wfMatch = /\/api\/teams\/([^/]+)\/workflow$/.exec(u);
      if (wfMatch && method === 'PUT') {
        const t = teams.get(wfMatch[1]);
        if (!t) return notFound;
        t.workflow = body;
        return ok(body);
      }
      const teamMatch = /\/api\/teams\/([^/]+)$/.exec(u);
      if (teamMatch && method === 'GET') {
        const t = teams.get(teamMatch[1]);
        return t ? ok(t) : notFound;
      }
      if (u.endsWith('/api/groups') && method === 'POST') {
        const groupId = `g${groups.size + 1}`;
        const rec = { group_id: groupId, ...body };
        groups.set(groupId, rec);
        return ok(rec);
      }
      const groupMatch = /\/api\/groups\/([^/]+)$/.exec(u);
      if (groupMatch && method === 'GET') {
        const g = groups.get(groupMatch[1]);
        return g ? ok(g) : notFound;
      }
      return notFound;
    }),
  );
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-craft-team-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  sqlite.getDb();
  intake = await import('../storage/craft-intake');
  settings = await import('../storage/settings');
  setupMod = await import('../storage/craft-team-setup');
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  settings.deleteSetting(intake.CRAFT_TEAM_KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setupCraftTeam — 代卖团队搭建（总经理带队）', () => {
  it('总经理 n1 + 6 部门（soul 含输出协议）→ team → 架构图 DAG → 绑 team 群 → settings 引用', async () => {
    const calls: Call[] = [];
    stubPy(calls);
    const r = await setupMod.setupCraftTeam();
    expect(r.created).toBe(true);
    expect(r.agent_ids).toHaveLength(7);
    expect(r.agent_ids[0]).toBe('agent-shadow-secretary');
    expect(r.agent_names).toEqual([
      '总经理',
      '市场分析师',
      '品牌策划师',
      '内容策划师',
      '合规审核员',
      '运营专员',
      '商务专员',
    ]);

    // 6 部门 soul 都写明输出协议标记
    const agentPosts = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/agents'));
    expect(agentPosts).toHaveLength(6);
    for (const c of agentPosts) {
      const soul = String(c.body?.soul ?? '');
      expect(soul).toContain('[intake]');
      expect(soul).toContain('[order]');
      expect(soul).toContain('[ship]');
      expect(soul).toContain('[report]');
    }
    // 各部门 soul 关键词（架构图交付物口径：市场→品牌→内容→合规→运营→商务）
    const souls = agentPosts.map((c) => String(c.body?.soul ?? ''));
    expect(souls[0]).toContain('用户画像'); // 市场分析师
    expect(souls[1]).toContain('品牌策划'); // 品牌策划师
    expect(souls[2]).toContain('营销内容'); // 内容策划师
    expect(souls[3]).toContain('审核'); // 合规审核员
    expect(souls[4]).toContain('上架'); // 运营专员
    expect(souls[5]).toContain('企业采购'); // 商务专员

    // 架构图任务 DAG：direct 串主链、approve 两道董事长审批门、conditional 驳回返工
    const wfCall = calls.find((c) => c.method === 'PUT' && /\/workflow$/.test(c.url));
    const wf = wfCall?.body as { nodes: Array<{ id: string; data: { agentId: string } }>; edges: Array<{ source: string; target: string; data: { mode: string; max_retries?: number } }> };
    expect(wf.nodes.map((n) => n.data.agentId)).toEqual(r.agent_ids);
    expect(wf.edges).toEqual([
      { source: 'n1', target: 'n2', data: { mode: 'direct' } }, // 总经理 → 市场分析师
      { source: 'n2', target: 'n3', data: { mode: 'direct' } }, // 市场分析师 → 品牌策划师
      { source: 'n3', target: 'n4', data: { mode: 'approve' } }, // 品牌定稿·董事长审批 → 内容策划师
      { source: 'n4', target: 'n5', data: { mode: 'direct' } }, // 内容策划师 → 合规审核员
      { source: 'n5', target: 'n4', data: { mode: 'conditional', max_retries: 2 } }, // 合规驳回 → 内容返工
      { source: 'n5', target: 'n6', data: { mode: 'approve' } }, // 对外发布·董事长审批 → 运营专员
      { source: 'n5', target: 'n7', data: { mode: 'direct' } }, // 合规 → 商务专员
    ]);

    // 工作群绑 team_id 与全 roster
    const groupCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/groups'));
    expect(groupCall?.body).toMatchObject({ team_id: r.team_id, agent_ids: r.agent_ids });

    // settings 引用持久化
    expect(settings.getSetting(intake.CRAFT_TEAM_KEY)).toMatchObject({
      team_id: r.team_id,
      group_id: r.group_id,
    });
    expect(setupMod.craftTeamStatus()).toMatchObject({ team_id: r.team_id });
  });

  it('幂等：二次 setup 复用 team/群，不重建 agent，soul 刷新 + workflow 重刷', async () => {
    const calls: Call[] = [];
    stubPy(calls); // 一次假件贯穿两轮（第二轮要能看到第一轮建的 team/group）
    const first = await setupMod.setupCraftTeam();
    calls.length = 0;
    const second = await setupMod.setupCraftTeam();
    expect(second.created).toBe(false);
    expect(second.team_id).toBe(first.team_id);
    expect(second.group_id).toBe(first.group_id);
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/agents'))).toHaveLength(0);
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/groups'))).toHaveLength(0);
    // workflow 仍重刷（幂等 PUT）
    expect(calls.filter((c) => c.method === 'PUT' && /\/workflow$/.test(c.url))).toHaveLength(1);
    // soul 刷新：6 部门各 PATCH 一次最新话术（按名字对齐；总经理不碰）
    const soulPatches = calls.filter((c) => c.method === 'PATCH' && /\/api\/agents\//.test(c.url));
    expect(soulPatches).toHaveLength(6);
    for (const c of soulPatches) {
      expect(String(c.body?.soul ?? '')).toContain('[intake]');
    }
  });

  it('Python 不可达 → CraftProfitError 上抛（setup 是显式动作不 fail-soft）', async () => {
    stubPy([], { failAgents: true });
    await expect(setupMod.setupCraftTeam()).rejects.toMatchObject({
      message: expect.stringContaining('市场分析师'),
      status: 502,
    });
  });
});
