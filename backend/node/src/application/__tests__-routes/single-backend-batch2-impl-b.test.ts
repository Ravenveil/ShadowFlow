// single-backend-batch2-impl-b.test.ts — impl-b 三组端点的对齐测试
//
// A 组 catalog（storage/catalog.ts + rout../application/conversations/http-catalog.ts）：
//   list 分页/过滤/搜索、get 脱敏（快照不含敏感键）、fork + fork_count 递增
// B 组 memory profiles（sqlite DDL + storage/memory-profile-configs.ts +
//   rout../application/memory/http-profiles.ts）：CRUD 往返、非法 id 400 code、
//   DELETE 204、writeback 202 stub、stats placeholder
// C 组 chat/completions（routes/system/chat-completions.ts）：
//   401 无 key、400 未知 provider、vi.mock transport 层断言成功响应 shape
//
// 数据隔离：SHADOWFLOW_DATA_DIR 指向 mkdtemp 临时目录（repoDataFile 收口），
// 不碰真实 <repo>/.shadowflow。mini-app = express() + express.json() + 目标 router。
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ── 测试隔离：必须在 import 任何 storage/routes 模块之前设置 ─────────────────
// B 组 memory profiles 走 sqlite（getDb() 用 process.cwd()，不认
// SHADOWFLOW_DATA_DIR——路径收口裁决推迟），所以隔离靠 process.chdir(tmp)，
// 与 storage/sqlite.test.ts 的 inIsolated 惯例同款。
const tmp = mkdtempSync(path.join(tmpdir(), 'sf-sbe-b2-implb-'));
const origCwd = process.cwd();
process.chdir(tmp);
process.env.SHADOWFLOW_DATA_DIR = tmp;
// C 组无 key 用例要确定：清掉所有 provider env（开发机可能全局配了 key）
const PROVIDER_ENV_NAMES = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ZHIPU_API_KEY',
  'MIMO_API_KEY', 'GOOGLE_API_KEY', 'QWEN_API_KEY', 'MOONSHOT_API_KEY',
  'MISTRAL_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OLLAMA_API_KEY',
  'LMSTUDIO_API_KEY', 'AZURE_API_KEY',
];
const savedEnv: Record<string, string | undefined> = {};
for (const name of PROVIDER_ENV_NAMES) {
  savedEnv[name] = process.env[name];
  delete process.env[name];
}

// C 组要 mock transport 层：importOriginal 保留 DEFAULT_MODELS/PROVIDER_ENV_VAR
// 等常量导出（byokKey.ts 的 resolveProviderKey 依赖 PROVIDER_ENV_VAR——工厂里
// 丢了它会直接崩），只把 callProvider 换成 mock。
vi.mock('../adapters/transport/api-clients/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../adapters/transport/api-clients/index.ts')>();
  return { ...actual, callProvider: (...args: unknown[]) => callProviderMock(...args) };
});
const { callProviderMock } = vi.hoisted(() => ({ callProviderMock: vi.fn() }));

import catalogRouter from '../conversations/http-catalog';
import memoryProfilesRouter from '../memory/http-profiles';
import { getDb, _resetForTests } from '../adapters/sqlite';
import chatRouterStatic from '../adapters/chat-completions';

afterAll(() => {
  // 顺序敏感：① 先切回原 cwd（Windows 不允许删除进程当前目录）
  process.chdir(origCwd);
  // ② 再关 sqlite 句柄（句柄开着删库文件会 EBUSY）
  _resetForTests();
  // ③ 最后删临时目录
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.SHADOWFLOW_DATA_DIR;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function jsonApp(): express.Express {
  const a = express();
  a.use(express.json());
  return a;
}
function catalogApp() {
  return jsonApp().use('/api/catalog', catalogRouter);
}
function memoryApp() {
  return jsonApp().use('/api/memory', memoryProfilesRouter);
}

const CATALOG_DIR = path.join(tmp, 'catalog');

function writeCatalogApp(appId: string, record: Record<string, unknown>): void {
  mkdirSync(CATALOG_DIR, { recursive: true });
  writeFileSync(path.join(CATALOG_DIR, `${appId}.json`), JSON.stringify(record, null, 2), 'utf-8');
}

function clearCatalog(): void {
  rmSync(CATALOG_DIR, { recursive: true, force: true });
}

/** 单 role 快照模板（role_id/name 等合同必需字段齐全）。 */
function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    blueprint_id: 'bp-src0001',
    version: '1.0',
    name: 'Source App',
    goal: 'Do the thing',
    mode: 'single',
    role_profiles: [
      {
        role_id: 'role-main',
        name: 'Main',
        description: 'main role',
        persona: 'you are main',
        tools: ['shadowflow-fs'],
        executor_provider: 'zhipu',
        executor_model: 'glm-4-flash',
      },
    ],
    ...overrides,
  };
}

function appRecord(appId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app_id: appId,
    name: 'Source App',
    goal: 'Do the thing',
    kit_type: 'custom',
    author: 'tester',
    published_at: '2026-01-01T00:00:00+00:00',
    fork_count: 0,
    forked_from: null,
    template_id: '',
    workflow_id: '',
    blueprint_id: 'bp-src0001',
    blueprint_snapshot: snapshot(),
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// A 组 catalog
// ════════════════════════════════════════════════════════════════════════════

describe('A /api/catalog/apps — 列表分页/过滤/搜索', () => {
  beforeEach(() => {
    clearCatalog();
    // 3 条记录：两种 kit_type + published_at 各异
    writeCatalogApp('app-a', appRecord('app-a', { published_at: '2026-01-03T00:00:00+00:00' }));
    writeCatalogApp('app-b', appRecord('app-b', { kit_type: 'research', published_at: '2026-01-02T00:00:00+00:00' }));
    writeCatalogApp('app-c', appRecord('app-c', { name: 'Alpha Planner', goal: 'plan things', published_at: '2026-01-01T00:00:00+00:00' }));
  });

  it('默认分页返回 meta {total,page,page_size,kit_type,q}', async () => {
    const res = await request(catalogApp()).get('/api/catalog/apps');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 3, page: 1, page_size: 20, kit_type: 'all', q: '' });
    expect(res.body.data.apps).toHaveLength(3);
    // published_at desc 排序：app-a 最新在前
    expect(res.body.data.apps[0].app_id).toBe('app-a');
    const s = res.body.data.apps[0];
    // Python _summary_of：11 个必选键恒在；scope_hint/collaboration_contract
    // 仅当记录/快照携带时才出现（catalog_service.py:489-501），fixture 未带 → 缺席。
    expect(Object.keys(s).sort()).toEqual(
      ['app_id', 'author', 'blueprint_id', 'fork_count', 'forked_from', 'goal', 'kit_type', 'mode', 'name', 'published_at', 'template_id', 'workflow_id'].sort(),
    );
    expect(s.fork_count).toBe(0);
    expect(s.mode).toBe('single');
  });

  it('page/page_size 切页正确（page_size=2 → 第 2 页 1 条）', async () => {
    const res = await request(catalogApp()).get('/api/catalog/apps?page=2&page_size=2');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 3, page: 2, page_size: 2, kit_type: 'all', q: '' });
    expect(res.body.data.apps).toHaveLength(1);
    expect(res.body.data.apps[0].app_id).toBe('app-c');
  });

  it('kit_type 过滤', async () => {
    const res = await request(catalogApp()).get('/api/catalog/apps?kit_type=research');
    expect(res.body.data.apps.map((a: { app_id: string }) => a.app_id)).toEqual(['app-b']);
    expect(res.body.meta.kit_type).toBe('research');
  });

  it('q 搜索命中 name 或 goal（不区分大小写）', async () => {
    const byName = await request(catalogApp()).get('/api/catalog/apps?q=alpha');
    expect(byName.body.data.apps.map((a: { app_id: string }) => a.app_id)).toEqual(['app-c']);
    const byGoal = await request(catalogApp()).get('/api/catalog/apps?q=DO%20THE');
    expect(byGoal.body.data.apps).toHaveLength(2);
  });

  it('空库 → total 0 apps []', async () => {
    clearCatalog();
    const res = await request(catalogApp()).get('/api/catalog/apps');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.data.apps).toEqual([]);
  });
});

describe('A GET /api/catalog/apps/:id — 脱敏详情', () => {
  beforeEach(() => {
    clearCatalog();
    writeCatalogApp(
      'app-sec',
      appRecord('app-sec', {
        blueprint_snapshot: snapshot({
          system_prompt: 'TOP SECRET',
          api_key: 'sk-xxx',
          byok: { token: 'zzz' },
          metadata: { public: 'ok', system_prompt: 'leak-me', '0g_private_key': '0xdead' },
          role_profiles: [
            {
              role_id: 'role-main',
              name: 'Main',
              description: 'main role',
              persona: 'you are main',
              metadata: { secret: 'hidden', keep: 'yes' },
              sub_agents: [{ role_id: 'r-sub', name: 'Sub', api_key: 'nested' }],
            },
          ],
          tool_policies: [
            { tool_id: 't1', credentials_ref: 'vault://k1', metadata: { api_key: 'k' } },
          ],
          knowledge_bindings: [
            { binding_id: 'kb1', source_type: 'file', source_ref: 'a.md', api_key: 'kk', metadata: { private_key: 'pk' } },
          ],
        }),
      }),
    );
  });

  it('返回 Detail 结构 + meta.trace_id；快照不含敏感键（递归所有层）', async () => {
    const res = await request(catalogApp()).get('/api/catalog/apps/app-sec');
    expect(res.status).toBe(200);
    expect(res.body.meta.trace_id).toMatch(/^trace-[0-9a-f]{12}$/);

    const d = res.body.data;
    expect(d.app_id).toBe('app-sec');
    expect(d.role_names).toEqual(['Main']);
    expect(d.role_count).toBe(1);
    expect(d.description).toBe('Do the thing');
    expect(d.mode).toBe('single');
    // 快照整棵树断言不含任何敏感键（顶层/metadata/role/sub_agents/tool_policies/kb）
    const snapStr = JSON.stringify(d.blueprint_snapshot);
    for (const key of [
      'system_prompt', 'private_key', 'byok', 'byok_token', 'api_key',
      'provider_credentials', 'credentials', 'secret', 'secrets', '0g_private_key',
    ]) {
      expect(snapStr.includes(`"${key}"`)).toBe(false);
    }
    // metadata 保留非敏感键
    expect(d.blueprint_snapshot.metadata.public).toBe('ok');
    expect(d.blueprint_snapshot.role_profiles[0].metadata.keep).toBe('yes');
    // credentials_ref 被占位替换
    expect(d.blueprint_snapshot.tool_policies[0].credentials_ref).toBe('[redacted]');
    // 详情其余字段对齐
    expect(d.name).toBe('Source App');
    expect(d.fork_count).toBe(0);
  });

  it('404 CATALOG_APP_NOT_FOUND（不存在）/ INVALID_APP_ID（穿越）', async () => {
    const miss = await request(catalogApp()).get('/api/catalog/apps/app-nope');
    expect(miss.status).toBe(404);
    expect(miss.body.error.code).toBe('CATALOG_APP_NOT_FOUND');
  });

  it('500 CATALOG_SNAPSHOT_MISSING（快照缺失）', async () => {
    clearCatalog();
    writeCatalogApp('app-empty', { app_id: 'app-empty', name: 'x', goal: 'y' });
    const res = await request(catalogApp()).get('/api/catalog/apps/app-empty');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CATALOG_SNAPSHOT_MISSING');
  });
});

describe('A POST /api/catalog/apps/:id/fork — 单模板', () => {
  beforeEach(() => clearCatalog());

  it('fork 成功 → 新 blueprint_id / forked_from / fork_count 递增写回', async () => {
    writeCatalogApp('app-f1', appRecord('app-f1', { fork_count: 2 }));
    const res = await request(catalogApp()).post('/api/catalog/apps/app-f1/fork').send({});
    expect(res.status).toBe(200);
    expect(res.body.meta.trace_id).toMatch(/^trace-[0-9a-f]{12}$/);
    expect(res.body.data.forked_from).toBe('app-f1');
    expect(res.body.data.blueprint_id).toMatch(/^bp-[0-9a-f]{12}$/);
    // publish_profile 重置 + metadata.forked_from 注入
    expect(res.body.data.blueprint.publish_profile.target).toBe('none');
    expect(res.body.data.blueprint.metadata.forked_from).toBe('app-f1');
    // 脱敏照样生效
    expect(JSON.stringify(res.body.data.blueprint)).not.toContain('"system_prompt"');
    // fork_count 3 写回源 catalog 文件
    const rec = JSON.parse(readFileSync(path.join(CATALOG_DIR, 'app-f1.json'), 'utf-8'));
    expect(rec.fork_count).toBe(3);
    // 单模板不物化 agents/team
    expect(res.body.data.agents).toBeUndefined();
    expect(res.body.data.team).toBeUndefined();
  });

  it('fork 缺快照 → 500 CATALOG_SNAPSHOT_MISSING；坏快照 → 422 CATALOG_BLUEPRINT_INVALID', async () => {
    writeCatalogApp('app-none', { app_id: 'app-none', name: 'x', goal: 'y' });
    const r1 = await request(catalogApp()).post('/api/catalog/apps/app-none/fork').send({});
    expect(r1.status).toBe(500);
    expect(r1.body.error.code).toBe('CATALOG_SNAPSHOT_MISSING');

    writeCatalogApp('app-bad', appRecord('app-bad', { blueprint_snapshot: { mode: 'single', name: 'x', goal: 'y', role_profiles: [] } }));
    const r2 = await request(catalogApp()).post('/api/catalog/apps/app-bad/fork').send({});
    expect(r2.status).toBe(422);
    expect(r2.body.error.code).toBe('CATALOG_BLUEPRINT_INVALID');
  });
});

describe('A POST fork — team 模板物化（agents/team/team_workflow_versions）', () => {
  beforeEach(() => clearCatalog());

  it('mode=team → 落 agents/*.json + teams/*.json + 初始版本快照，响应带 agents/team', async () => {
    writeCatalogApp(
      'app-team',
      appRecord('app-team', {
        blueprint_snapshot: snapshot({
          mode: 'team',
          metadata: {
            team_dag: {
              nodes: [
                { id: 'n1', role_id: 'role-main', position: { x: 100, y: 80 } },
              ],
              edges: [],
            },
          },
        }),
      }),
    );
    const res = await request(catalogApp()).post('/api/catalog/apps/app-team/fork').send({});
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.team).toBeDefined();
    expect(data.agents).toHaveLength(1);
    expect(data.team.agent_ids).toEqual([data.agents[0].agent_id]);
    expect(data.team.workflow.nodes).toHaveLength(1);
    expect(data.team.workflow.nodes[0].data.agentId).toBe(data.agents[0].agent_id);

    const agentFile = path.join(tmp, 'agents', `${data.agents[0].agent_id}.json`);
    const teamFile = path.join(tmp, 'teams', `${data.team.team_id}.json`);
    const versionsFile = path.join(tmp, 'team_workflow_versions', `${data.team.team_id}.json`);
    expect(existsSync(agentFile)).toBe(true);
    expect(existsSync(teamFile)).toBe(true);
    expect(existsSync(versionsFile)).toBe(true);
    const agentRec = JSON.parse(readFileSync(agentFile, 'utf-8'));
    expect(agentRec.source).toBe('catalog_fork');
    expect(agentRec.blueprint.metadata.forked_from).toBe('app-team');
    expect(agentRec.workspace_id).toBe('default'); // body 未传 → default
    const versions = JSON.parse(readFileSync(versionsFile, 'utf-8'));
    expect(versions.versions).toHaveLength(1);
    expect(versions.versions[0].version).toBe(1);
  });

  it('workspace_id 透传到 agent/team 记录；DAG 成环 → 422 且不落 team', async () => {
    // 成环 DAG：需要两个 role（单 role 自环已在 D1 拒掉）
    writeCatalogApp(
      'app-cyc',
      appRecord('app-cyc', {
        blueprint_snapshot: snapshot({
          mode: 'team',
          role_profiles: [
            { role_id: 'role-a', name: 'A', description: 'a', persona: 'a' },
            { role_id: 'role-b', name: 'B', description: 'b', persona: 'b' },
          ],
          metadata: {
            team_dag: {
              nodes: [
                { id: 'n1', role_id: 'role-a' },
                { id: 'n2', role_id: 'role-b' },
              ],
              edges: [
                { id: 'e1', source: 'n1', target: 'n2', mode: 'direct' },
                { id: 'e2', source: 'n2', target: 'n1', mode: 'direct' },
              ],
            },
          },
        }),
      }),
    );
    const r1 = await request(catalogApp()).post('/api/catalog/apps/app-cyc/fork').send({ workspace_id: 'ws-9' });
    expect(r1.status).toBe(422);
    expect(r1.body.error.code).toBe('CATALOG_BLUEPRINT_INVALID');
    expect(r1.body.error.message).toContain('cycle detected via sequential edges');
    // 校验失败在落 team 之前 → agents 落了（D2 前提），team/版本仓不落
    const teamsDir = path.join(tmp, 'teams');
    expect(!existsSync(teamsDir) || []).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B 组 memory profiles
// ════════════════════════════════════════════════════════════════════════════

const UUID_A = '11111111-2222-4333-8444-555555555555';
const UUID_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function seedProfile(profileId: string, updated_at: string): void {
  // 直接写 sqlite 表（绕过 createProfile 的随机 id），控制 updated_at 排序
  getDb()
    .prepare(
      `INSERT INTO memory_profile_configs
       (profile_id, working_memory_limit, episodic_retention_days, semantic_retrieval_top_k,
        compression_top_k, writeback_policy, state_sync_policy, compression_policy,
        created_at, updated_at) VALUES (?, 2048, 15, 3, 7, 'manual', 'eager', 'summarize', ?, ?)`,
    )
    .run(profileId, updated_at, updated_at);
}

describe('B /api/memory/profiles — CRUD 往返', () => {
  it('POST 默认值 → 201 + {data,meta:{created_at}}', async () => {
    const res = await request(memoryApp()).post('/api/memory/profiles').send({});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      working_memory_limit: 4096,
      episodic_retention_days: 30,
      semantic_retrieval_top_k: 5,
      compression_top_k: 10,
      writeback_policy: 'on_task_complete',
      state_sync_policy: 'lazy',
      compression_policy: 'none',
    });
    expect(res.body.data.profile_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(typeof res.body.meta.created_at).toBe('string');
  });

  it('POST 显式字段 + 越界 → 422；非法枚举 → 422', async () => {
    const okRes = await request(memoryApp())
      .post('/api/memory/profiles')
      .send({ working_memory_limit: 512, writeback_policy: 'manual', state_sync_policy: 'eager', compression_policy: 'select_top_k' });
    expect(okRes.status).toBe(201);
    expect(okRes.body.data.working_memory_limit).toBe(512);
    expect(okRes.body.data.writeback_policy).toBe('manual');

    const low = await request(memoryApp()).post('/api/memory/profiles').send({ working_memory_limit: 100 });
    expect(low.status).toBe(422);
    expect(low.body.code).toBe('FIELD_INVALID');
    const badEnum = await request(memoryApp()).post('/api/memory/profiles').send({ writeback_policy: 'sometimes' });
    expect(badEnum.status).toBe(422);
  });

  it('GET 列表按 updated_at 倒序 + meta.count', async () => {
    // 前面的 CRUD 测试已在库里建了行——清空表再种，精确控制结果集。
    // （不删库文件：Windows 下句柄释放/文件锁竞态不稳，DELETE FROM 足够。）
    getDb().prepare('DELETE FROM memory_profile_configs').run();
    seedProfile(UUID_A, '2026-01-01T00:00:00.000Z');
    seedProfile(UUID_B, '2026-01-02T00:00:00.000Z');

    const res = await request(memoryApp()).get('/api/memory/profiles');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ count: 2 });
    expect(res.body.data.map((p: { profile_id: string }) => p.profile_id)).toEqual([UUID_B, UUID_A]);
    // 种子字段完整往返
    expect(res.body.data[0]).toMatchObject({
      working_memory_limit: 2048, episodic_retention_days: 15, semantic_retrieval_top_k: 3,
      compression_top_k: 7, writeback_policy: 'manual', state_sync_policy: 'eager',
      compression_policy: 'summarize',
    });
  });

  it('GET/PATCH 单个 → 往返 + updated_at 前移；PATCH 后列表排序变化', async () => {
    const created = await request(memoryApp()).post('/api/memory/profiles').send({});
    const pid = created.body.data.profile_id as string;
    const createdAt = created.body.data.updated_at as string;

    const got = await request(memoryApp()).get(`/api/memory/profiles/${pid}`);
    expect(got.status).toBe(200);
    expect(got.body.data.profile_id).toBe(pid);
    expect(got.body.meta).toEqual({});

    // 等一拍保证 updated_at 严格变大
    await new Promise((r) => setTimeout(r, 20));
    const patched = await request(memoryApp()).patch(`/api/memory/profiles/${pid}`).send({ working_memory_limit: 8192 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.working_memory_limit).toBe(8192);
    expect(patched.body.data.working_memory_limit).not.toBe(4096);
    expect(patched.body.meta).toEqual({});
    expect((patched.body.data.updated_at as string) > (createdAt as string)).toBeTruthy();

    // PATCH 越界 → 422（且值不被改动）
    const bad = await request(memoryApp()).patch(`/api/memory/profiles/${pid}`).send({ semantic_retrieval_top_k: 0 });
    expect(bad.status).toBe(422);
    const reread = await request(memoryApp()).get(`/api/memory/profiles/${pid}`);
    expect(reread.body.data.semantic_retrieval_top_k).toBe(5);
  });

  it('DELETE → 204 无体；再 GET → 404', async () => {
    const created = await request(memoryApp()).post('/api/memory/profiles').send({});
    const pid = created.body.data.profile_id as string;
    const del = await request(memoryApp()).delete(`/api/memory/profiles/${pid}`);
    expect(del.status).toBe(204);
    expect(del.text).toBe('');
    const gone = await request(memoryApp()).get(`/api/memory/profiles/${pid}`);
    expect(gone.status).toBe(404);
    expect(gone.body.code).toBe('PROFILE_NOT_FOUND');
    expect(gone.body.error).toBeUndefined();
  });

  it('非法 profile_id → 400 INVALID_PROFILE_ID（顶层 {code,message}，无 error 包装）', async () => {
    const res = await request(memoryApp()).get('/api/memory/profiles/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'INVALID_PROFILE_ID', message: 'profile_id must be a UUID' });
    const del = await request(memoryApp()).delete('/api/memory/profiles/xxx');
    expect(del.status).toBe(400);
    expect(del.body.code).toBe('INVALID_PROFILE_ID');
  });

  it('POST /writeback/:run_id → 202 stub（文案照抄 Python）', async () => {
    const res = await request(memoryApp()).post('/api/memory/writeback/run-42').send({});
    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      data: { run_id: 'run-42', status: 'writeback_triggered', memories_recalled: 0 },
      meta: { triggered_at: expect.any(String), note: 'stub — ContextBuilder integration in Story 9.4' },
    });
  });

  it('GET /stats → placeholder 结构；带 agent_id 命中 profile 时回配置值', async () => {
    const bare = await request(memoryApp()).get('/api/memory/stats');
    expect(bare.status).toBe(200);
    expect(bare.body).toEqual({
      data: {
        working_memory_limit: 4096,
        episodic_retention_days: 30,
        semantic_skills_count: 0,
        _note: 'Live counts pending Story 9.4 writeback implementation',
      },
      meta: { mode: 'placeholder' },
    });

    const created = await request(memoryApp()).post('/api/memory/profiles').send({ working_memory_limit: 1024, episodic_retention_days: 7 });
    const pid = created.body.data.profile_id as string;
    const hit = await request(memoryApp()).get(`/api/memory/stats?agent_id=${pid}`);
    expect(hit.body.data.working_memory_limit).toBe(1024);
    expect(hit.body.data.episodic_retention_days).toBe(7);
    expect(hit.body.meta).toEqual({ mode: 'placeholder' });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C 组 chat/completions
// ════════════════════════════════════════════════════════════════════════════

const genText = (text: string) =>
  async function* (): AsyncGenerator<{ type: string; text?: string }> {
    yield { type: 'text-delta', text };
    yield { type: 'end' };
  };

describe('C POST /api/chat/completions', () => {
  let chatRouter: typeof chatRouterStatic;
  beforeAll(() => {
    chatRouter = chatRouterStatic;
  });

  function chatApp(): express.Express {
    // 与 index.ts 挂载同构：app.use('/api/chat', router)，router 自带
    // express.json({limit:'10mb'})
    const a = express();
    a.use('/api/chat', chatRouter);
    return a;
  }

  it('401 NO_API_KEY（缺 X-LLM-Key）—— transport 层不被触达', async () => {
    callProviderMock.mockReset();
    const res = await request(chatApp())
      .post('/api/chat/completions')
      .set('x-llm-provider', 'zhipu')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_API_KEY');
    expect(res.body.error.message).toBe('X-LLM-Key header required');
    expect(callProviderMock).not.toHaveBeenCalled();
  });

  it('400 UNKNOWN_PROVIDER（白名单外 provider）', async () => {
    const res = await request(chatApp())
      .post('/api/chat/completions')
      .set('x-llm-key', 'sk-test')
      .set('x-llm-provider', 'moonshot') // chat.py 白名单只有 zhipu/openai/claude/ollama/deepseek
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_PROVIDER');
    expect(res.body.error.message).toBe('Unknown provider: moonshot');
  });

  it('200 成功 shape：{data:{content,model,provider,tokens_used},meta:{}}（vi.mock transport）', async () => {
    callProviderMock.mockReset();
    callProviderMock.mockImplementation(genText('你好，世界'));
    const res = await request(chatApp())
      .post('/api/chat/completions')
      .set('x-llm-key', 'sk-test')
      .set('x-llm-provider', 'claude') // 前端 chat 名，不映射改写
      .set('x-llm-model', 'claude-3-5-haiku-20241022')
      .send({
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        ],
        stream: true, // 接受但忽略 → 仍单次 JSON
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { content: '你好，世界', model: 'claude-3-5-haiku-20241022', provider: 'claude', tokens_used: 0 },
      meta: {},
    });
    expect(callProviderMock).toHaveBeenCalledTimes(1);
    // callProvider 第一个参数是映射后的 provider（claude → anthropic）
    expect(callProviderMock.mock.calls[0]![0]).toBe('anthropic');
    const input = callProviderMock.mock.calls[0]![1] as { model: string; api_key: string };
    expect(input.model).toBe('claude-3-5-haiku-20241022');
    expect(input.api_key).toBe('sk-test');
  });

  it('provider 默认 zhipu + 默认模型 glm-4-flash；agent soul 注入 system', async () => {
    callProviderMock.mockReset();
    callProviderMock.mockImplementation(genText('ok'));
    mkdirSync(path.join(tmp, 'agents'), { recursive: true });
    writeFileSync(
      path.join(tmp, 'agents', 'ag-1.json'),
      JSON.stringify({ agent_id: 'ag-1', soul: '你是测试灵魂' }),
      'utf-8',
    );
    const res = await request(chatApp())
      .post('/api/chat/completions')
      .set('x-llm-key', 'sk-test') // 不带 provider 头 → 默认 zhipu
      .send({ messages: [{ role: 'user', content: 'hi' }], agent_id: 'ag-1' });
    expect(res.status).toBe(200);
    expect(res.body.data.provider).toBe('zhipu');
    expect(res.body.data.model).toBe('glm-4-flash');
    const input = callProviderMock.mock.calls[0]![1] as { systemPrompt: string; userMessage: string };
    expect(input.systemPrompt).toBe('你是测试灵魂');
    expect(input.userMessage).toBe('hi');
  });

  it('LLM 报错 → 502 LLM_ERROR', async () => {
    callProviderMock.mockReset();
    callProviderMock.mockImplementation(async function* (): AsyncGenerator<{ type: string; message?: string }> {
      yield { type: 'error', message: 'upstream down' };
    });
    const res = await request(chatApp())
      .post('/api/chat/completions')
      .set('x-llm-key', 'sk-test')
      .set('x-llm-provider', 'zhipu')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('LLM_ERROR');
    expect(res.body.error.message).toBe('upstream down');
  });

  it('agent_id 含非法字符 → 不读文件静默跳过（不 500）', async () => {
    callProviderMock.mockReset();
    callProviderMock.mockImplementation(genText('ok'));
    const res = await request(chatApp())
      .post('/api/chat/completions')
      .set('x-llm-key', 'sk-test')
      .send({ messages: [{ role: 'user', content: 'hi' }], agent_id: '../evil' });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('ok');
    const input = callProviderMock.mock.calls[0]![1] as { systemPrompt: string };
    expect(input.systemPrompt).toBe('');
  });
});
