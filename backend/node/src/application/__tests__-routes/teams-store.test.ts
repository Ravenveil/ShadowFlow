/**
 * teams-store.test.ts — 单后端迁移：/api/teams CRUD/workflow/versions/policy/
 * branch/chat 端点对齐测试（对照 Python teams.py 语义）。
 *
 * 数据隔离：SHADOWFLOW_DATA_DIR 指向 mkdtemp 临时目录，不碰真实
 * <repo>/.shadowflow。chat 的 LLM 走 vi.mock 拦 transport 层 callProvider
 * （与 teams-dag-draft.test.ts 同手法，无网络）。
 *
 * D2 agent 来源：向 <dataDir>/agents 写真实 agent json（与 Python store 同
 * 目录语义），存在性校验与 roster 本地化都从那里读。
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProviderChunk } from '../adapters/transport/api-clients/index.ts';
import { PROVIDER_ENV_VAR } from '../adapters/transport/api-clients/index';

const { callProviderMock } = vi.hoisted(() => ({ callProviderMock: vi.fn() }));

vi.mock('../adapters/transport/api-clients/index.ts', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../adapters/transport/api-clients/index.ts')>();
  return { ...orig, callProvider: (...args: unknown[]) => callProviderMock(...args) };
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-teams-store-'));
process.env.SHADOWFLOW_DATA_DIR = tmp;

// 清掉 provider env，chat 的 key 只来自 X-LLM-Key 头（确定性）。
const savedEnv: Record<string, string | undefined> = {};
for (const envName of Object.values(PROVIDER_ENV_VAR)) {
  savedEnv[envName] = process.env[envName];
  delete process.env[envName];
}

// 本地 agent 库：D2 存在性校验 / roster 本地化的数据源
const agentsDir = path.join(tmp, 'agents');
fs.mkdirSync(agentsDir, { recursive: true });
for (const [id, name] of [
  ['agent-alpha', 'Alpha'],
  ['agent-beta', 'Beta'],
  ['agent-gamma', 'Gamma'],
] as const) {
  fs.writeFileSync(
    path.join(agentsDir, `${id}.json`),
    JSON.stringify({ agent_id: id, name, soul: `${name} 的职责一句话\n第二行`, status: 'idle' }),
    'utf-8',
  );
}

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  delete process.env.SHADOWFLOW_DATA_DIR;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// 真实 index.ts 有 app.use(express.json())；mini-app 同样必须挂。
function teamsApp(): Express {
  const a = express();
  a.use(express.json());
  return a;
}

let app: express.Express;

beforeAll(async () => {
  const mod = await import('../teams/infra-store');
  app = teamsApp();
  app.use('/api/teams', mod.default);
});

const genText = (text: string) =>
  async function* (): AsyncGenerator<ProviderChunk> {
    yield { type: 'text-delta', text };
    yield { type: 'end' };
  };

const CHAT_HEADERS = { 'x-llm-key': 'sk-test' };

/** 建一个引用 agent-alpha 的团队，返回 team_id。 */
async function createTeam(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/teams')
    .send({ name: '演示团队', description: '初始描述', agent_ids: ['agent-alpha'], ...overrides });
  expect(res.status).toBe(201);
  return res.body.data.team_id as string;
}

describe('CRUD 往返 + 404', () => {
  it('POST → 201 {data, meta:{created:true}}，id 形如 team-<12hex>，agent_ids 去重保序', async () => {
    const res = await request(app)
      .post('/api/teams')
      .send({ name: '新团队', description: '', agent_ids: ['agent-beta', 'agent-alpha', 'agent-beta'] });
    expect(res.status).toBe(201);
    expect(res.body.meta).toEqual({ created: true });
    expect(res.body.data.team_id).toMatch(/^team-[0-9a-f]{12}$/);
    expect(res.body.data.workspace_id).toBe('default');
    expect(res.body.data.agent_ids).toEqual(['agent-beta', 'agent-alpha']);
    expect(res.body.data.created_at).toBe(res.body.data.updated_at);
  });

  it('校验：name 缺失/超长、description 超长、agent_ids 空/缺 → 422', async () => {
    const r1 = await request(app).post('/api/teams').send({ agent_ids: ['agent-alpha'] });
    expect([r1.status, r1.body?.error?.code]).toEqual([422, 'INVALID_BODY']);
    const r2 = await request(app)
      .post('/api/teams')
      .send({ name: 'x'.repeat(121), agent_ids: ['agent-alpha'] });
    expect(r2.status).toBe(422);
    const r3 = await request(app)
      .post('/api/teams')
      .send({ name: 'ok', description: 'x'.repeat(501), agent_ids: ['agent-alpha'] });
    expect(r3.status).toBe(422);
    const r4 = await request(app).post('/api/teams').send({ name: 'ok', agent_ids: [] });
    expect(r4.status).toBe(422);
    const r5 = await request(app).post('/api/teams').send({ name: 'ok' });
    expect(r5.status).toBe(422);
  });

  it('D2：创建引用不存在的 agent → 422 AGENT_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/teams')
      .send({ name: '悬空团队', agent_ids: ['agent-ghost'] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('AGENT_NOT_FOUND');
    expect(Array.isArray(res.body.error.errors)).toBe(true);
  });

  it('GET 列表 → {data:[...], meta:{total}}；GET 单个 → {data, meta:{}}', async () => {
    const id = await createTeam({ name: '列表里的团队' });
    const list = await request(app).get('/api/teams');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.meta.total).toBe(list.body.data.length);
    expect(list.body.data.some((r: { team_id: string }) => r.team_id === id)).toBe(true);

    const one = await request(app).get(`/api/teams/${id}`);
    expect(one.status).toBe(200);
    expect(one.body.data.name).toBe('列表里的团队');
    expect(one.body.meta).toEqual({});
  });

  it('D3：老记录无 workspace_id → 只在 ?workspace_id=unassigned 或不过滤时出现', async () => {
    // 直接落盘一条「老记录」（无 workspace_id 字段），模拟 pre-workspace 数据
    const legacyId = 'team-legacy00001';
    fs.writeFileSync(
      path.join(tmp, 'teams', `${legacyId}.json`),
      JSON.stringify({
        team_id: legacyId,
        name: '老记录',
        description: '',
        agent_ids: ['agent-alpha'],
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      }),
      'utf-8',
    );
    const filteredOther = await request(app).get('/api/teams').query({ workspace_id: 'default' });
    expect(filteredOther.body.data.some((r: { team_id: string }) => r.team_id === legacyId)).toBe(false);
    const filteredUnassigned = await request(app).get('/api/teams').query({ workspace_id: 'unassigned' });
    expect(filteredUnassigned.body.data.some((r: { team_id: string }) => r.team_id === legacyId)).toBe(true);
    const all = await request(app).get('/api/teams');
    expect(all.body.data.some((r: { team_id: string }) => r.team_id === legacyId)).toBe(true);
    // workspace 归一：老记录的隐式 workspace 是 'unassigned'
    const one = await request(app).get(`/api/teams/${legacyId}`);
    expect(one.status).toBe(200);
    fs.rmSync(path.join(tmp, 'teams', `${legacyId}.json`));
  });

  it('PATCH：改名/换 workspace/加减成员（add 去重、remove 生效、updated_at 变化）', async () => {
    const id = await createTeam({ name: '待改团队' });
    const before = (await request(app).get(`/api/teams/${id}`)).body.data;
    const res = await request(app)
      .patch(`/api/teams/${id}`)
      .send({
        name: '改后团队',
        description: '新描述',
        workspace_id: 'ws-2',
        add_agent_ids: ['agent-beta', 'agent-beta'],
        remove_agent_ids: [],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('改后团队');
    expect(res.body.data.workspace_id).toBe('ws-2');
    expect(res.body.data.agent_ids).toEqual(['agent-alpha', 'agent-beta']);
    expect(res.body.data.updated_at >= before.updated_at).toBe(true);

    const res2 = await request(app).patch(`/api/teams/${id}`).send({ remove_agent_ids: ['agent-alpha'] });
    expect(res2.body.data.agent_ids).toEqual(['agent-beta']);
  });

  it('PATCH：add 引用不存在 agent → 422；既有成员不重复校验（直接落盘的老 id 不被赶走）', async () => {
    const id = await createTeam({ name: '成员团队' });
    const bad = await request(app).patch(`/api/teams/${id}`).send({ add_agent_ids: ['agent-ghost'] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('AGENT_NOT_FOUND');
    // 落盘一条带悬空成员的记录 → PATCH 别的字段不应被 D2 拦截
    fs.writeFileSync(
      path.join(tmp, 'teams', `${id}.json`),
      JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(tmp, 'teams', `${id}.json`), 'utf-8')), agent_ids: ['agent-gone-early'] }),
      'utf-8',
    );
    const ok = await request(app).patch(`/api/teams/${id}`).send({ name: '仍可改名' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.agent_ids).toEqual(['agent-gone-early']);
  });

  it('PATCH/GET/DELETE 不存在的 id → 404 TEAM_NOT_FOUND；非法 id → 400 INVALID_TEAM_ID', async () => {
    const g = await request(app).get('/api/teams/team-nope000001');
    expect(g.status).toBe(404);
    expect(g.body.error.code).toBe('TEAM_NOT_FOUND');
    const p = await request(app).patch('/api/teams/team-nope000001').send({ name: 'x' });
    expect(p.status).toBe(404);
    const d = await request(app).delete('/api/teams/team-nope000001');
    expect(d.status).toBe(404);
    const bad = await request(app).get('/api/teams/..%2Fevil');
    expect([400, 404]).toContain(bad.status); // express 可能先规范化路径
    const bad2 = await request(app).get('/api/teams/team-..');
    expect(bad2.status).toBe(400);
    expect(bad2.body.error.code).toBe('INVALID_TEAM_ID');
  });

  it('DELETE → 204 无 body；再 GET → 404', async () => {
    const id = await createTeam({ name: '将删团队' });
    const del = await request(app).delete(`/api/teams/${id}`);
    expect(del.status).toBe(204);
    expect(del.text).toBe('');
    const g = await request(app).get(`/api/teams/${id}`);
    expect(g.status).toBe(404);
  });
});

describe('workflow PUT：D1 环检测 / D2 agent 校验 / 默认读取', () => {
  it('GET 无保存图 → {nodes:[],edges:[]}', async () => {
    const id = await createTeam({ name: '无图团队' });
    const res = await request(app).get(`/api/teams/${id}/workflow`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ nodes: [], edges: [] });
    expect(res.body.meta).toEqual({});
  });

  it('PUT 存储形 workflow（顺序成环）→ 422 INVALID_DAG + errors', async () => {
    const id = await createTeam({ name: '成环团队' });
    const res = await request(app)
      .put(`/api/teams/${id}/workflow`)
      .send({
        nodes: [
          { id: 'n1', data: { agentId: 'agent-alpha' } },
          { id: 'n2', data: { agentId: 'agent-beta' } },
        ],
        edges: [
          { source: 'n1', target: 'n2', data: { mode: 'direct' } },
          { source: 'n2', target: 'n1', data: { mode: 'direct' } },
        ],
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_DAG');
    expect(res.body.error.errors.some((e: string) => /cycle/i.test(e))).toBe(true);
    // 校验失败不落盘
    const wf = await request(app).get(`/api/teams/${id}/workflow`);
    expect(wf.body.data).toEqual({ nodes: [], edges: [] });
  });

  it('PUT 自环 / 边端点未知节点 → 422；agentId 不存在 → 422 AGENT_NOT_FOUND', async () => {
    const id = await createTeam({ name: '结构团队' });
    const selfLoop = await request(app)
      .put(`/api/teams/${id}/workflow`)
      .send({
        nodes: [{ id: 'n1', data: { agentId: 'agent-alpha' } }],
        edges: [{ source: 'n1', target: 'n1', data: { mode: 'direct' } }],
      });
    expect(selfLoop.status).toBe(422);
    expect(selfLoop.body.error.code).toBe('INVALID_DAG');

    const dangling = await request(app)
      .put(`/api/teams/${id}/workflow`)
      .send({
        nodes: [
          { id: 'n1', data: { agentId: 'agent-alpha' } },
          { id: 'n2', data: { agentId: 'agent-ghost' } },
        ],
        edges: [{ source: 'n1', target: 'n2', data: { mode: 'direct' } }],
      });
    expect(dangling.status).toBe(422);
    expect(dangling.body.error.code).toBe('AGENT_NOT_FOUND');
  });

  it('PUT 合法存储形 workflow → 200 + data 回显；GET 读回一致；自动记 v1（summary null）', async () => {
    const id = await createTeam({ name: '有图团队' });
    const wf = {
      nodes: [
        { id: 'n1', data: { agentId: 'agent-alpha' } },
        { id: 'n2', data: { agentId: 'agent-beta' } },
      ],
      edges: [
        { source: 'n1', target: 'n2', data: { mode: 'direct' } },
        { source: 'n2', target: 'n1', data: { mode: 'conditional' } }, // 合法回边
      ],
    };
    const res = await request(app).put(`/api/teams/${id}/workflow`).send(wf);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(wf);
    const read = await request(app).get(`/api/teams/${id}/workflow`);
    expect(read.body.data).toEqual(wf);
    const versions = await request(app).get(`/api/teams/${id}/workflow/versions`);
    expect(versions.status).toBe(200);
    expect(versions.body.meta.total).toBe(1);
    expect(versions.body.data[0]).toMatchObject({ version: 1, summary: null });
    expect(versions.body.data[0].saved_at).toBeTruthy();
    expect(versions.body.data[0]).not.toHaveProperty('workflow'); // 只回元数据
  });

  it('nodes/edges 缺失或非数组 → 422 INVALID_DAG', async () => {
    const id = await createTeam({ name: '缺字段团队' });
    const res = await request(app).put(`/api/teams/${id}/workflow`).send({ nodes: 'nope' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_DAG');
  });
});

describe('workflow versions：追加递增 + restore（append-only）', () => {
  it('多次 PUT 递增 version；restore 回旧版并追加新版本，summary=restored from vN', async () => {
    const id = await createTeam({ name: '版本团队' });
    const wf1 = {
      nodes: [{ id: 'n1', data: { agentId: 'agent-alpha' } }],
      edges: [],
    };
    const wf2 = {
      nodes: [
        { id: 'n1', data: { agentId: 'agent-alpha' } },
        { id: 'n2', data: { agentId: 'agent-beta' } },
      ],
      edges: [{ source: 'n1', target: 'n2', data: { mode: 'direct' } }],
    };
    await request(app).put(`/api/teams/${id}/workflow`).send(wf1);
    await request(app).put(`/api/teams/${id}/workflow`).send(wf2);
    let versions = await request(app).get(`/api/teams/${id}/workflow/versions`);
    expect(versions.body.data.map((v: { version: number }) => v.version)).toEqual([1, 2]);

    // restore 到 v1：team.workflow 变回 wf1，但历史追加到 v3
    const restore = await request(app).post(`/api/teams/${id}/workflow/restore`).send({ version: 1 });
    expect(restore.status).toBe(200);
    expect(restore.body.data).toEqual(wf1);
    versions = await request(app).get(`/api/teams/${id}/workflow/versions`);
    expect(versions.body.meta.total).toBe(3);
    expect(versions.body.data[2]).toMatchObject({ version: 3, summary: 'restored from v1' });

    // 不存在的版本 → 404 VERSION_NOT_FOUND
    const miss = await request(app).post(`/api/teams/${id}/workflow/restore`).send({ version: 99 });
    expect(miss.status).toBe(404);
    expect(miss.body.error.code).toBe('VERSION_NOT_FOUND');

    // 非法 version → 422
    const bad = await request(app).post(`/api/teams/${id}/workflow/restore`).send({ version: 0 });
    expect(bad.status).toBe(422);
  });
});

describe('policy / validation-hooks', () => {
  it('policy 缺省 {}；PUT 后 GET 读回', async () => {
    const id = await createTeam({ name: '政策团队' });
    const empty = await request(app).get(`/api/teams/${id}/policy`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual({});
    const put = await request(app)
      .put(`/api/teams/${id}/policy`)
      .send({ matrix: { 'agent-alpha': { tools: 'read-only' } } });
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual({ 'agent-alpha': { tools: 'read-only' } });
    const got = await request(app).get(`/api/teams/${id}/policy`);
    expect(got.body.data).toEqual({ 'agent-alpha': { tools: 'read-only' } });
    // matrix 非对象 → 422
    const bad = await request(app).put(`/api/teams/${id}/policy`).send({ matrix: [1] });
    expect(bad.status).toBe(422);
  });

  it('validation-hooks 缺省 {validation_hooks:[]}；PUT 整体替换；GET 无外层多余字段', async () => {
    const id = await createTeam({ name: '钩子团队' });
    const empty = await request(app).get(`/api/teams/${id}/validation-hooks`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual({ validation_hooks: [] });

    const hooks = [
      {
        id: 'tsc',
        kind: 'builtin',
        on_fail: 'blocker',
        builtin: { name: 'tsc-check', args: {} },
      },
    ];
    const put = await request(app).put(`/api/teams/${id}/validation-hooks`).send({ validation_hooks: hooks });
    expect(put.status).toBe(200);
    expect(put.body.data.validation_hooks).toEqual(hooks);
    const got = await request(app).get(`/api/teams/${id}/validation-hooks`);
    expect(got.body.data).toEqual({ validation_hooks: hooks });

    // 非法 hook（kind 无 config block / shell 无 cmd）→ 422
    const bad = await request(app)
      .put(`/api/teams/${id}/validation-hooks`)
      .send({ validation_hooks: [{ id: 'x', kind: 'shell' }] });
    expect(bad.status).toBe(422);
    const bad2 = await request(app)
      .put(`/api/teams/${id}/validation-hooks`)
      .send({ validation_hooks: [{ id: 'x', kind: 'shell', shell: { cmd: [] } }] });
    expect(bad2.status).toBe(422);
    const bad3 = await request(app).put(`/api/teams/${id}/validation-hooks`).send({ validation_hooks: 'nope' });
    expect(bad3.status).toBe(422);
  });
});

describe('POST /:id/workflow/branch', () => {
  it('201 {meta:{created:true, branched_from}}，默认名 <原名> · 分支，带走 workflow/policy/hooks，版本仓各记各的', async () => {
    const id = await createTeam({ name: '母团队' });
    const wf = {
      nodes: [{ id: 'n1', data: { agentId: 'agent-alpha' } }],
      edges: [],
    };
    await request(app).put(`/api/teams/${id}/workflow`).send(wf);
    await request(app).put(`/api/teams/${id}/policy`).send({ matrix: { k: 'v' } });

    const res = await request(app).post(`/api/teams/${id}/workflow/branch`).send({});
    expect(res.status).toBe(201);
    expect(res.body.meta).toEqual({ created: true, branched_from: id });
    expect(res.body.data.name).toBe('母团队 · 分支');
    expect(res.body.data.team_id).not.toBe(id);
    expect(res.body.data.workflow).toEqual(wf);
    expect(res.body.data.policy_matrix).toEqual({ k: 'v' });
    expect(res.body.data.agent_ids).toEqual(['agent-alpha']);

    // 分支有自己的版本仓（summary 注明来源），母团队版本仓不变
    const branchVersions = await request(app).get(`/api/teams/${res.body.data.team_id}/workflow/versions`);
    expect(branchVersions.body.meta.total).toBe(1);
    expect(branchVersions.body.data[0].summary).toMatch(/^branched from /);
    const momVersions = await request(app).get(`/api/teams/${id}/workflow/versions`);
    expect(momVersions.body.meta.total).toBe(1);

    // 自定义名字生效；两边后续演化互不影响
    const res2 = await request(app).post(`/api/teams/${id}/workflow/branch`).send({ name: '定制分支' });
    expect(res2.status).toBe(201);
    expect(res2.body.data.name).toBe('定制分支');
  });

  it('分支对象团队不存在 → 404', async () => {
    const res = await request(app).post('/api/teams/team-nope000001/workflow/branch').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
  });
});

describe('POST /:id/chat — LLM 驱动编辑（vi.mock transport）', () => {
  it('缺 X-LLM-Key → 401 NO_API_KEY（不打 LLM）', async () => {
    const id = await createTeam({ name: '聊天团队' });
    const res = await request(app).post(`/api/teams/${id}/chat`).send({ message: '改名叫 X' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_API_KEY');
    expect(callProviderMock).not.toHaveBeenCalled();
  });

  it('message 缺失/超长 → 422', async () => {
    const id = await createTeam({ name: '聊天团队2' });
    const r1 = await request(app).post(`/api/teams/${id}/chat`).send({}).set(CHAT_HEADERS);
    expect(r1.status).toBe(422);
    const r2 = await request(app)
      .post(`/api/teams/${id}/chat`)
      .send({ message: 'x'.repeat(2001) })
      .set(CHAT_HEADERS);
    expect(r2.status).toBe(422);
  });

  it('LLM 返回 updates → 套用改名 + 加成员，写盘生效，applied_fields 正确', async () => {
    callProviderMock.mockReset();
    const id = await createTeam({ name: '原团队名' });
    callProviderMock.mockImplementation(
      genText(
        JSON.stringify({
          updates: { name: '新团队名', description: null, add_agent_ids: ['agent-beta'], remove_agent_ids: null },
          explanation: '已改名为新团队名并加入 beta。',
        }),
      ),
    );
    const res = await request(app)
      .post(`/api/teams/${id}/chat`)
      .send({ message: '改名叫新团队名，顺便把 beta 拉进来' })
      .set(CHAT_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(true);
    expect(res.body.data.applied_fields).toEqual(['name', 'add_agent_ids']);
    expect(res.body.data.team.name).toBe('新团队名');
    expect(res.body.data.team.agent_ids).toEqual(['agent-alpha', 'agent-beta']);
    expect(res.body.data.reply).toContain('beta');
    // 真写盘
    const got = await request(app).get(`/api/teams/${id}`);
    expect(got.body.data.name).toBe('新团队名');
    // provider/model 走 zhipu 默认
    expect(callProviderMock.mock.calls[0]![0]).toBe('zhipu');
    expect(callProviderMock.mock.calls[0]![1].model).toBeTruthy();
    expect(callProviderMock.mock.calls[0]![1].api_key).toBe('sk-test');
  });

  it('无实际变更（updates 全 null）→ 不写盘，applied=false', async () => {
    callProviderMock.mockReset();
    const id = await createTeam({ name: '不动的团队' });
    const before = (await request(app).get(`/api/teams/${id}`)).body.data.updated_at;
    callProviderMock.mockImplementation(
      genText(JSON.stringify({ updates: { name: null, description: null, add_agent_ids: null, remove_agent_ids: null }, explanation: '没有需要改的。' })),
    );
    const res = await request(app).post(`/api/teams/${id}/chat`).send({ message: '保持现状' }).set(CHAT_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
    expect(res.body.data.applied_fields).toEqual([]);
    const after = (await request(app).get(`/api/teams/${id}`)).body.data;
    expect(after.updated_at).toBe(before);
  });

  it('LLM 输出非 JSON → 422 LLM_PARSE_ERROR；LLM 调用失败 → 502 LLM_ERROR', async () => {
    callProviderMock.mockReset();
    const id = await createTeam({ name: '解析团队' });
    callProviderMock.mockImplementation(genText('```json\n{updates: 不是合法 JSON}\n```'));
    const r1 = await request(app).post(`/api/teams/${id}/chat`).send({ message: '随便说说' }).set(CHAT_HEADERS);
    expect(r1.status).toBe(422);
    expect(r1.body.error.code).toBe('LLM_PARSE_ERROR');

    callProviderMock.mockReset();
    callProviderMock.mockImplementation(async function* (): AsyncGenerator<ProviderChunk> {
      yield { type: 'error', message: 'upstream exploded', code: 'NETWORK_ERROR' };
    });
    const r2 = await request(app).post(`/api/teams/${id}/chat`).send({ message: '随便说说' }).set(CHAT_HEADERS);
    expect(r2.status).toBe(502);
    expect(r2.body.error.code).toBe('LLM_ERROR');
  });

  it('团队不存在 → 404；未知 provider → 400 UNKNOWN_PROVIDER', async () => {
    const r1 = await request(app)
      .post('/api/teams/team-nope000001/chat')
      .send({ message: 'hi' })
      .set(CHAT_HEADERS);
    expect(r1.status).toBe(404);
    const id = await createTeam({ name: '未知供应商' });
    const r2 = await request(app)
      .post(`/api/teams/${id}/chat`)
      .send({ message: 'hi' })
      .set({ ...CHAT_HEADERS, 'x-llm-provider': 'quantum' });
    expect(r2.status).toBe(400);
    expect(r2.body.error.code).toBe('UNKNOWN_PROVIDER');
  });
});
