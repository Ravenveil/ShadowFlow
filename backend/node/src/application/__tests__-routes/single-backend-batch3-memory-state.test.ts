// single-backend-batch3-memory-state.test.ts — 第三批 memory+state 域对齐测试
//
// A 组 memory profiles 挂载冒烟（rout../application/memory/http-profiles.ts 已在 batch2
//   深测，此处只验证与 memory-state 合并挂在 /api/memory 后 CRUD 打通）
// B 组 GET /api/memory/state/:agent_id（rout../application/memory/http-state.ts）：
//   三层 stub 骨架、meta.note 文案、任意 agent_id 回显
// C 组裸 /state 六端点（rout../application/agents/infra-state.ts + storage/agent-state-service.ts）：
//   404/200/乐观锁 409/快照往返/restore bump/reset/非法 id 422/路径穿越防护
// D 组 legacy↔single 数据同构：手写 Python model_dump_json(indent=2) 形状的
//   agent_state/{id}.json，Node 读改写后 Python 可再读（同一份文件）
//
// 隔离：模块顶层 chdir(mkdtemp) + SHADOWFLOW_DATA_DIR（sqlite 走 cwd，
// agent_state 走 repoDataFile → 双保险都落 tmp），afterAll 三步序防 Windows EBUSY。
import { describe, it, expect, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(tmpdir(), 'sf-sbe-b3-'));
const origCwd = process.cwd();
process.chdir(tmp);
process.env.SHADOWFLOW_DATA_DIR = tmp;

import memoryProfilesRouter from '../memory/http-profiles';
import memoryStateRouter from '../memory/http-state';
import agentStateRouter from '../agents/infra-state';
import { getDb, _resetForTests } from '../adapters/sqlite';

afterAll(() => {
  // 顺序敏感：① 先切回原 cwd（Windows 不允许删除进程当前目录）
  process.chdir(origCwd);
  // ② 再关 sqlite 句柄（句柄开着删库文件会 EBUSY）
  _resetForTests();
  // ③ 最后删临时目录
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.SHADOWFLOW_DATA_DIR;
});

function jsonApp(): express.Express {
  return express().use(express.json());
}
/** 与 index.ts 计划挂载一致：两个 router 依次挂 /api/memory。 */
function memoryApp() {
  return jsonApp().use('/api/memory', memoryProfilesRouter).use('/api/memory', memoryStateRouter);
}
function stateApp() {
  return jsonApp().use('/state', agentStateRouter);
}

// ── A 组：/api/memory 合并挂载冒烟（profiles 已 batch2 深测） ────────────────

describe('A /api/memory 合并挂载 — profiles CRUD 冒烟', () => {
  it('POST → 201 + GET 列表可见（两 router 串联 next() 不吞路由）', async () => {
    const app = memoryApp();
    const created = await request(app).post('/api/memory/profiles').send({});
    expect(created.status).toBe(201);
    expect(created.body.data.profile_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const list = await request(app).get('/api/memory/profiles');
    expect(list.status).toBe(200);
    expect(list.body.meta.count).toBeGreaterThan(0);
    // 冒烟完清掉，保持库净
    const del = await request(app).delete(`/api/memory/profiles/${created.body.data.profile_id}`);
    expect(del.status).toBe(204);
  });
});

// ── B 组：GET /api/memory/state/:agent_id（三层 stub） ───────────────────────

describe('B /api/memory/state/:agent_id — 三层摘要 stub', () => {
  it('任意 agent_id → 三层 {summary:null,item_count:0} + meta.note stub 文案', async () => {
    const res = await request(memoryApp()).get('/api/memory/state/sbe-agent-x');
    expect(res.status).toBe(200);
    expect(res.body.data.agent_id).toBe('sbe-agent-x');
    for (const layer of ['working', 'episodic', 'semantic']) {
      expect(res.body.data[layer]).toEqual({ summary: null, item_count: 0 });
    }
    expect(res.body.meta.note).toBe('stub — full implementation in Story 9.4');
  });

  it('不存在的 agent 也恒定返回骨架（Python stub 同语义，无 404）', async () => {
    const res = await request(memoryApp()).get('/api/memory/state/never-created');
    expect(res.status).toBe(200);
    expect(res.body.data.working).toEqual({ summary: null, item_count: 0 });
  });
});

// ── C 组：裸 /state 六端点 ───────────────────────────────────────────────────

describe('C 裸 /state — AgentState 六端点', () => {
  it('GET 未建状态 → 404 AGENT_STATE_NOT_FOUND（detail.error 形状）', async () => {
    const res = await request(stateApp()).get('/state/sbe-miss-1');
    expect(res.status).toBe(404);
    expect(res.body.detail.error.code).toBe('AGENT_STATE_NOT_FOUND');
    expect(res.body.detail.error.message).toBe("No state for agent 'sbe-miss-1'");
  });

  it('非法 agent_id（含路径穿越）→ 422 SHADOWFLOW_ERROR', async () => {
    const bad = await request(stateApp()).get(`/state/${encodeURIComponent('../evil')}`);
    expect(bad.status).toBe(422);
    expect(bad.body.detail.error.code).toBe('SHADOWFLOW_ERROR');
    expect(bad.body.detail.error.details.agent_id).toBe('../evil');
  });

  it('PATCH version=0 首建 → 200 全字段 Pydantic 默认 + state_version 自增', async () => {
    const res = await request(stateApp()).patch('/state/sbe-a1').send({
      version: 0,
      role_profile_ref: 'rp-1',
      state_fields: { mood: 'ready' },
      pending_tasks: ['t1'],
    });
    expect(res.status).toBe(200);
    const s = res.body.data;
    expect(s.agent_id).toBe('sbe-a1');
    expect(s.role_profile_ref).toBe('rp-1');
    expect(s.memory_profile_ref).toBe('');
    expect(s.state_fields).toEqual({ mood: 'ready' });
    expect(s.session_summary).toBe('');
    expect(s.recent_artifacts).toEqual([]);
    expect(s.pending_tasks).toEqual(['t1']);
    expect(s.last_writeback_at).toBeNull();
    expect(s.state_version).toBe(1);
    expect(typeof s.created_at).toBe('string');
    // 文件落在 <data>/agent_state/sbe-a1.json（与 Python 同一份）
    expect(existsSync(path.join(tmp, 'agent_state', 'sbe-a1.json'))).toBe(true);
  });

  it('PATCH version 不符 → 409 STATE_CONFLICT + details{expected,got}', async () => {
    const res = await request(stateApp()).patch('/state/sbe-a1').send({ version: 99 });
    expect(res.status).toBe(409);
    expect(res.body.detail.error.code).toBe('STATE_CONFLICT');
    expect(res.body.detail.error.message).toBe('State version conflict: expected 1, got 99');
    expect(res.body.detail.error.details).toEqual({ expected: 1, got: 99 });
  });

  it('PATCH 缺 version → 422（FastAPI RequestValidationError 数组形状）', async () => {
    const res = await request(stateApp()).patch('/state/sbe-a1').send({ session_summary: 'x' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.detail)).toBe(true);
    expect(res.body.detail[0].loc).toContain('version');
  });

  it('GET 已建状态 → 200 与 PATCH 写入一致', async () => {
    const res = await request(stateApp()).get('/state/sbe-a1');
    expect(res.status).toBe(200);
    expect(res.body.data.state_version).toBe(1);
    expect(res.body.meta).toEqual({});
  });

  it('快照往返：POST snapshot → 32hex id；GET snapshots 列表；restore 版本 +1', async () => {
    const app = stateApp();
    const snap = await request(app).post('/state/sbe-a1/snapshot');
    expect(snap.status).toBe(200);
    const snapId = snap.body.data.snapshot_id;
    expect(snapId).toMatch(/^[0-9a-f]{32}$/);
    // 快照目录落位
    expect(existsSync(path.join(tmp, 'state_snapshots', 'sbe-a1', `${snapId}.json`))).toBe(true);

    // 当前态再推进一版，随后 restore 应回到快照内容且版本比快照时 +1
    await request(app).patch('/state/sbe-a1').send({ version: 1, state_fields: { mood: 'dirty' } });
    const restored = await request(app).post(`/state/sbe-a1/restore/${snapId}`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.state_fields).toEqual({ mood: 'ready' });
    expect(restored.body.data.state_version).toBe(2); // 快照值 1 + restore bump 1

    const list = await request(app).get('/state/sbe-a1/snapshots');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
    expect(list.body.data[0].snapshot_id).toBe(snapId);
    expect(typeof list.body.data[0].created_at).toBe('string');
    expect(list.body.data[0].state_version).toBe(1); // 快照落盘时的版本
  });

  it('restore 未知快照 → 404 SNAPSHOT_NOT_FOUND + details{agent_id,snapshot_id}', async () => {
    const res = await request(stateApp()).post('/state/sbe-a1/restore/deadbeef');
    expect(res.status).toBe(404);
    expect(res.body.detail.error.code).toBe('SNAPSHOT_NOT_FOUND');
    expect(res.body.detail.error.details).toEqual({ agent_id: 'sbe-a1', snapshot_id: 'deadbeef' });
  });

  it('reset → 清四件套、保留 profile refs、版本 +1', async () => {
    const app = stateApp();
    // 先把 refs 写上（当前版本 2）
    const patched = await request(app).patch('/state/sbe-a1').send({
      version: 2,
      memory_profile_ref: 'mp-9',
      session_summary: 'to be cleared',
    });
    expect(patched.status).toBe(200);
    const reset = await request(app).post('/state/sbe-a1/reset');
    expect(reset.status).toBe(200);
    const s = reset.body.data;
    expect(s.state_fields).toEqual({});
    expect(s.session_summary).toBe('');
    expect(s.recent_artifacts).toEqual([]);
    expect(s.pending_tasks).toEqual([]);
    expect(s.last_writeback_at).toBeNull();
    expect(s.role_profile_ref).toBe('rp-1');
    expect(s.memory_profile_ref).toBe('mp-9');
    expect(s.state_version).toBe(4);
  });

  it('对不存在 agent snapshot → 用默认态落快照（Python 同语义）', async () => {
    const res = await request(stateApp()).post('/state/sbe-fresh/snapshot');
    expect(res.status).toBe(200);
    const list = await request(stateApp()).get('/state/sbe-fresh/snapshots');
    expect(list.body.data.length).toBe(1);
    expect(list.body.data[0].state_version).toBe(0);
  });

  it('非法 snapshot_id → 422 SHADOWFLOW_ERROR', async () => {
    const res = await request(stateApp()).post(`/state/sbe-a1/restore/${encodeURIComponent('..%x')}`);
    expect(res.status).toBe(422);
    expect(res.body.detail.error.code).toBe('SHADOWFLOW_ERROR');
  });
});

// ── D 组：legacy↔single 数据同构 ────────────────────────────────────────────

describe('D 数据同构 — Python 写的 state 文件 Node 可读改写', () => {
  it('手写 model_dump_json(indent=2) 形状文件 → GET/PATCH 正常，落盘可再读', async () => {
    // 模拟 Python StateService.update_state 写出的文件（uuid4 形 agent_id 亦可）
    mkdirSync(path.join(tmp, 'agent_state'), { recursive: true });
    const legacy = {
      agent_id: 'legacy-agent-1',
      role_profile_ref: 'rp-legacy',
      memory_profile_ref: 'mp-legacy',
      state_fields: { k1: 'v1', nested: { a: 1 } },
      session_summary: 'legacy summary',
      recent_artifacts: ['art-1'],
      pending_tasks: ['task-1', 'task-2'],
      last_writeback_at: '2026-01-01T00:00:00Z',
      state_version: 7,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };
    writeFileSync(
      path.join(tmp, 'agent_state', 'legacy-agent-1.json'),
      JSON.stringify(legacy, null, 2),
      'utf-8',
    );

    const got = await request(stateApp()).get('/state/legacy-agent-1');
    expect(got.status).toBe(200);
    expect(got.body.data.state_version).toBe(7);
    expect(got.body.data.state_fields).toEqual({ k1: 'v1', nested: { a: 1 } });
    expect(got.body.data.last_writeback_at).toBe('2026-01-01T00:00:00Z');

    const patched = await request(stateApp()).patch('/state/legacy-agent-1').send({
      version: 7,
      session_summary: 'updated by node',
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data.state_version).toBe(8);

    // 落盘文件保持 snake_case 全字段，Python 再 model_validate_json 可读
    const onDisk = JSON.parse(
      readFileSync(path.join(tmp, 'agent_state', 'legacy-agent-1.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(onDisk.state_version).toBe(8);
    expect(onDisk.session_summary).toBe('updated by node');
    expect(onDisk.memory_profile_ref).toBe('mp-legacy');
    expect(Object.keys(onDisk)).toEqual(
      expect.arrayContaining([
        'agent_id', 'role_profile_ref', 'memory_profile_ref', 'state_fields',
        'session_summary', 'recent_artifacts', 'pending_tasks', 'last_writeback_at',
        'state_version', 'created_at', 'updated_at',
      ]),
    );
  });
});

// sqlite getDb() 在 A 组被首次调用（memory_profile_configs 建表），防止未用告警
void getDb;
