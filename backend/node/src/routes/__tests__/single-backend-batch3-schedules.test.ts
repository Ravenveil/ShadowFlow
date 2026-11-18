/**
 * single-backend-batch3-schedules.test.ts — 第三批 schedules 域对齐测试
 *
 * 覆盖（对齐 Python test_schedules_guardrails.py + 端点契约）：
 *   POST /api/schedules        — 201 {data,meta:{}}；pydantic 422 形状；
 *                                  invalid_cron / cron_interval_too_short /
 *                                  start_at_in_past / enabled_limit_reached
 *   GET  /api/schedules        — {data,meta:{count}} + group_id/agent_id 过滤
 *   PATCH /api/schedules/:id   — 启停 toggle、next_run_time 重算、熔断复位、
 *                                  400 INVALID_ID / 404 NOT_FOUND
 *   DELETE /api/schedules/:id  — 204 无体 + 文件消失；再删 404
 *   GET  /api/schedules/:id/runs — {data,meta:{count}}、截 20、404
 *   引擎（scheduler/engine.ts）— runScheduleNow：无 bridge succeeded /
 *                                  bridge 抛错 failed（error 截 300）/
 *                                  one-shot completed / 连续失败熔断
 *                                  auto_disabled / 成功穿插不熔断
 *   cron（scheduler/cron.ts）  — next_run_time 未来整 15 分钟刻度
 *
 * 隔离惯例：process.chdir(mkdtemp) + SHADOWFLOW_DATA_DIR；afterAll 三步序
 * （chdir 回 → 重置 scheduler 目录句柄状态 → rmSync，Windows EBUSY）。
 * 无裸 require；无 vi.mock（引擎经导出的 setRunExecutorBridge 注入，免 mock）。
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── 隔离：必须在 import 任何 storage/routes/scheduler 模块之前 chdir ─────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-sbe-b3-sched-'));
const origCwd = process.cwd();
process.chdir(tmp);
process.env.SHADOWFLOW_DATA_DIR = tmp;

import schedulesRouter from '../runs/schedules';
import { setRunExecutorBridge } from '../../scheduler/engine';
import { loadSchedule } from '../../scheduler/store';

afterAll(() => {
  // 顺序敏感：① 先切回原 cwd（Windows 不允许删除进程当前目录）
  process.chdir(origCwd);
  delete process.env.SHADOWFLOW_DATA_DIR;
  // ② 本域无 sqlite 句柄；schedules 目录句柄每次读写即开即关，无需重置
  // ③ 最后删临时目录
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/api/schedules', schedulesRouter);
  return a;
}

beforeEach(() => {
  // bridge 每个用例后复位为 null（纯提醒模式），防用例间泄漏。
  setRunExecutorBridge(null);
});

/** 未来时刻 ISO（UTC 后缀，同 Python 测试的 datetime.now(utc).isoformat()）。 */
function futureIso(hours = 24): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

let seq = 0;
async function createSchedule(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  seq += 1;
  const payload: Record<string, unknown> = {
    group_id: `g-test-${seq}`,
    start_at: futureIso(),
    task_description: '防呆测试计划',
    ...overrides,
  };
  const res = await request(app()).post('/api/schedules').send(payload);
  expect(res.status).toBe(201);
  return res.body.data as Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/schedules — 创建
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/schedules', () => {
  it('201 one-shot：{data,meta:{}} 全字段 + next_run_time=start_at', async () => {
    const startAt = futureIso(48);
    const res = await request(app())
      .post('/api/schedules')
      .send({ group_id: 'g-1', start_at: startAt, task_description: '提醒' });
    expect(res.status).toBe(201);
    expect(res.body.meta).toEqual({});
    const d = res.body.data;
    expect(d.schedule_id).toMatch(/^[0-9a-f]{32}$/);
    expect(d.group_id).toBe('g-1');
    expect(d.start_at).toBe(startAt);
    expect(d.cron_expression).toBeNull();
    expect(d.task_description).toBe('提醒');
    expect(d.duration_min).toBe(30); // Python 默认
    expect(d.completed).toBe(false);
    expect(d.enabled).toBe(true);
    expect(d.runs).toEqual([]);
    expect(d.next_run_time).toBe(startAt); // DateTrigger 语义：next = run_date
    expect(d.created_at).toBeTruthy();
  });

  it('201 cron：next_run_time 是未来整 15 分钟刻度（*/15）', async () => {
    const res = await request(app())
      .post('/api/schedules')
      .send({ group_id: 'g-1', cron_expression: '*/15 * * * *' });
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.cron_expression).toBe('*/15 * * * *');
    expect(d.next_run_time).toBeTruthy();
    const fire = new Date(d.next_run_time as string);
    expect(fire.getTime()).toBeGreaterThan(Date.now());
    expect(fire.getUTCMinutes() % 15).toBe(0);
    expect(fire.getUTCSeconds()).toBe(0);
    // 落盘可读回
    expect(loadSchedule(d.schedule_id as string)?.cron_expression).toBe('*/15 * * * *');
  });

  it('422 缺 group_id → pydantic 数组形状 [{loc,msg,type}]', async () => {
    const res = await request(app()).post('/api/schedules').send({ start_at: futureIso() });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.detail)).toBe(true);
    expect(res.body.detail[0].loc).toContain('group_id');
  });

  it('422 双触发器均缺失 → xor validator value_error', async () => {
    const res = await request(app()).post('/api/schedules').send({ group_id: 'g' });
    expect(res.status).toBe(422);
    expect(res.body.detail[0].msg).toContain('Either cron_expression or start_at must be set');
  });

  it('422 非法 cron → {detail:{error:"invalid_cron",...}}', async () => {
    const res = await request(app())
      .post('/api/schedules')
      .send({ group_id: 'g', cron_expression: 'not-a-cron' });
    expect(res.status).toBe(422);
    expect(res.body.detail.error).toBe('invalid_cron');
    expect(res.body.detail.example).toBe('0 8 * * 1-5');
  });

  it('422 */5 间隔过短；*/15 与 0 9 * * * 通过', async () => {
    const bad = await request(app())
      .post('/api/schedules')
      .send({ group_id: 'g', cron_expression: '*/5 * * * *' });
    expect(bad.status).toBe(422);
    expect(bad.body.detail.error).toBe('cron_interval_too_short');

    const ok15 = await request(app())
      .post('/api/schedules')
      .send({ group_id: 'g', cron_expression: '*/15 * * * *' });
    expect(ok15.status).toBe(201);

    const daily = await request(app())
      .post('/api/schedules')
      .send({ group_id: 'g', cron_expression: '0 9 * * *' });
    expect(daily.status).toBe(201);
  });

  it('422 列表分钟最短间隔 3 分钟 → cron_interval_too_short', async () => {
    const res = await request(app())
      .post('/api/schedules')
      .send({ group_id: 'g', cron_expression: '0,3,6 * * * *' });
    expect(res.status).toBe(422);
    expect(res.body.detail.error).toBe('cron_interval_too_short');
  });

  it('422 start_at 过去 → {detail:{error:"start_at_in_past"}}', async () => {
    const res = await request(app())
      .post('/api/schedules')
      .send({ group_id: 'g', start_at: new Date(Date.now() - 3600_000).toISOString() });
    expect(res.status).toBe(422);
    expect(res.body.detail.error).toBe('start_at_in_past');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/schedules — 列表与过滤
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/schedules', () => {
  it('{data,meta:{count}}；group_id / agent_id 精确过滤', async () => {
    const a = await createSchedule({ group_id: 'g-filter-a', agent_id: 'agent-x' });
    await createSchedule({ group_id: 'g-filter-b' });

    const all = await request(app()).get('/api/schedules');
    expect(all.status).toBe(200);
    expect(all.body.meta.count).toBe(all.body.data.length);
    expect(all.body.data.length).toBeGreaterThanOrEqual(2);

    const byGroup = await request(app()).get('/api/schedules').query({ group_id: 'g-filter-a' });
    expect(byGroup.body.data).toHaveLength(1);
    expect(byGroup.body.data[0].schedule_id).toBe(a.schedule_id);

    const byAgent = await request(app()).get('/api/schedules').query({ agent_id: 'agent-x' });
    expect(byAgent.body.data).toHaveLength(1);
    expect(byAgent.body.data[0].agent_id).toBe('agent-x');

    const none = await request(app()).get('/api/schedules').query({ group_id: 'g-nope' });
    expect(none.body.data).toEqual([]);
    expect(none.body.meta).toEqual({ count: 0 });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/schedules/:id — 启停
// ════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/schedules/:id', () => {
  it('停用 → enabled=false + next_run_time=null；重启用 → 重算且非 null', async () => {
    const d = await createSchedule({ cron_expression: '0 9 * * *' });
    const sid = d.schedule_id as string;
    expect(d.next_run_time).toBeTruthy();

    const off = await request(app()).patch(`/api/schedules/${sid}`).send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.enabled).toBe(false);
    expect(off.body.data.next_run_time).toBeNull();

    const on = await request(app()).patch(`/api/schedules/${sid}`).send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.data.enabled).toBe(true);
    expect(on.body.data.next_run_time).toBeTruthy();
  });

  it('completed one-shot 重启用不复活：next_run_time 保持 null', async () => {
    const d = await createSchedule({});
    const sid = d.schedule_id as string;
    // 手动标记完成（模拟 one-shot 已触发）
    const rec = loadSchedule(sid)!;
    rec.completed = true;
    fs.writeFileSync(
      path.join(tmp, 'schedules', `${sid}.json`),
      JSON.stringify(rec),
      'utf-8',
    );
    const on = await request(app()).patch(`/api/schedules/${sid}`).send({ enabled: true });
    expect(on.body.data.next_run_time).toBeNull();
    expect(on.body.data.completed).toBe(true);
  });

  it('400 非法 id（INVALID_ID）；404 不存在（NOT_FOUND）；422 enabled 非布尔', async () => {
    const bad = await request(app()).patch('/api/schedules/bad%20id!').send({ enabled: true });
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toEqual({ error: { code: 'INVALID_ID', message: 'Invalid schedule_id' } });

    const miss = await request(app()).patch(`/api/schedules/${'a'.repeat(32)}`).send({ enabled: true });
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toEqual({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });

    const d = await createSchedule({});
    const notBool = await request(app()).patch(`/api/schedules/${d.schedule_id}`).send({ enabled: 'yes' });
    expect(notBool.status).toBe(422);
    expect(Array.isArray(notBool.body.detail)).toBe(true);
    expect(notBool.body.detail[0].loc).toContain('enabled');
  });

  it('熔断复位：auto_disabled 标记在人工启用时清除', async () => {
    const d = await createSchedule({ cron_expression: '0 9 * * *' });
    const sid = d.schedule_id as string;
    // 直写熔断标记（引擎熔断逻辑在 engine describe 中单独测）
    const rec = loadSchedule(sid)!;
    rec.enabled = false;
    rec.auto_disabled = true;
    rec.auto_disabled_at = new Date().toISOString();
    rec.auto_disabled_reason = '连续失败 10 次，已自动停用';
    fs.writeFileSync(
      path.join(tmp, 'schedules', `${sid}.json`),
      JSON.stringify(rec),
      'utf-8',
    );
    const on = await request(app()).patch(`/api/schedules/${sid}`).send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.data.enabled).toBe(true);
    expect(on.body.data).not.toHaveProperty('auto_disabled');
    expect(on.body.data).not.toHaveProperty('auto_disabled_at');
    expect(on.body.data).not.toHaveProperty('auto_disabled_reason');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DELETE /api/schedules/:id
// ════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/schedules/:id', () => {
  it('204 无体 + 文件消失；再删 404；非法 id 400', async () => {
    const d = await createSchedule({});
    const sid = d.schedule_id as string;
    expect(fs.existsSync(path.join(tmp, 'schedules', `${sid}.json`))).toBe(true);

    const del = await request(app()).delete(`/api/schedules/${sid}`);
    expect(del.status).toBe(204);
    expect(del.text).toBe('');
    expect(fs.existsSync(path.join(tmp, 'schedules', `${sid}.json`))).toBe(false);

    const again = await request(app()).delete(`/api/schedules/${sid}`);
    expect(again.status).toBe(404);

    const bad = await request(app()).delete('/api/schedules/../evil');
    expect([400, 404]).toContain(bad.status); // express 可能先规范化路径
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/schedules/:id/runs
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/schedules/:id/runs', () => {
  it('空 runs → {data:[],meta:{count:0}}；有 runs → 新→旧 + count', async () => {
    const d = await createSchedule({});
    const sid = d.schedule_id as string;

    const empty = await request(app()).get(`/api/schedules/${sid}/runs`);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ data: [], meta: { count: 0 } });

    // 直写两条 run 历史（引擎触发逻辑在 engine describe 单测）
    const rec = loadSchedule(sid)!;
    rec.runs = [
      { run_id: 'r2', triggered_at: '2026-01-02T00:00:00Z', status: 'failed', error: 'boom' },
      { run_id: 'r1', triggered_at: '2026-01-01T00:00:00Z', status: 'succeeded' },
    ];
    fs.writeFileSync(
      path.join(tmp, 'schedules', `${sid}.json`),
      JSON.stringify(rec),
      'utf-8',
    );
    const got = await request(app()).get(`/api/schedules/${sid}/runs`);
    expect(got.body.meta).toEqual({ count: 2 });
    expect(got.body.data[0].run_id).toBe('r2'); // 插头序：最新在前
    expect(got.body.data[1].status).toBe('succeeded');
  });

  it('404 不存在；400 非法 id', async () => {
    const miss = await request(app()).get(`/api/schedules/${'b'.repeat(32)}/runs`);
    expect(miss.status).toBe(404);
    expect(miss.body.detail.error.code).toBe('NOT_FOUND');

    const bad = await request(app()).get('/api/schedules/bad!id/runs');
    expect(bad.status).toBe(400);
    expect(bad.body.detail.error.code).toBe('INVALID_ID');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 调度引擎（scheduler/engine.ts）— runScheduleNow 逐段对齐 _schedule_job
// ════════════════════════════════════════════════════════════════════════════

describe('engine: runScheduleNow', () => {
  it('无 bridge（纯提醒模式）→ succeeded', async () => {
    const d = await createSchedule({ cron_expression: '0 9 * * *' });
    const sid = d.schedule_id as string;
    const { runScheduleNow } = await import('../../scheduler/engine');
    const after = await runScheduleNow(sid);
    expect(after?.runs).toHaveLength(1);
    expect(after?.runs[0].status).toBe('succeeded');
    expect(after?.enabled).toBe(true);
    expect(after?.runs[0].run_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('bridge 抛错 → failed + error 字段；成功穿插打断连续计数不熔断', async () => {
    const d = await createSchedule({ cron_expression: '0 9 * * *' });
    const sid = d.schedule_id as string;
    const { runScheduleNow } = await import('../../scheduler/engine');
    let calls = 0;
    setRunExecutorBridge(() => {
      calls += 1;
      if (calls % 2 === 1) throw new Error('llm exploded');
    });
    for (let i = 0; i < 12; i++) {
      await runScheduleNow(sid);
    }
    const rec = loadSchedule(sid)!;
    expect(rec.enabled).toBe(true); // 失败/成功交替，永不连续达 10
    expect(rec.auto_disabled).toBeUndefined();
    const failed = rec.runs.find((r) => r.status === 'failed');
    expect(failed?.error).toBe('llm exploded');
    expect(rec.runs).toHaveLength(12); // MAX_RUNS_STORED=20 内
  });

  it('one-shot 触发 → completed=true + next_run_time=null', async () => {
    const d = await createSchedule({}); // start_at 未来，无 cron
    const sid = d.schedule_id as string;
    const { runScheduleNow } = await import('../../scheduler/engine');
    const after = await runScheduleNow(sid);
    expect(after?.completed).toBe(true);
    expect(after?.next_run_time).toBeNull();
  });

  it('连续失败达 MAX_CONSECUTIVE_FAILURES(10) → 熔断 auto_disabled', async () => {
    const d = await createSchedule({ cron_expression: '0 9 * * *' });
    const sid = d.schedule_id as string;
    const { runScheduleNow } = await import('../../scheduler/engine');
    setRunExecutorBridge(() => {
      throw new Error('x');
    });
    for (let i = 0; i < 10; i++) {
      await runScheduleNow(sid);
    }
    const rec = loadSchedule(sid)!;
    expect(rec.enabled).toBe(false);
    expect(rec.auto_disabled).toBe(true);
    expect(rec.auto_disabled_at).toBeTruthy();
    expect(rec.auto_disabled_reason).toContain('连续失败');
    expect(rec.next_run_time).toBeNull();
    expect(rec.runs.slice(0, 10).every((r) => r.status === 'failed')).toBe(true);

    // disabled 后引擎跳过（不追加 run）
    const n = rec.runs.length;
    await runScheduleNow(sid);
    expect(loadSchedule(sid)!.runs).toHaveLength(n);
  });

  it('记录不存在 → null；runs 截 20', async () => {
    const { runScheduleNow } = await import('../../scheduler/engine');
    expect(await runScheduleNow('f'.repeat(32))).toBeNull();

    const d = await createSchedule({ cron_expression: '0 9 * * *' });
    const sid = d.schedule_id as string;
    for (let i = 0; i < 25; i++) {
      await runScheduleNow(sid);
    }
    expect(loadSchedule(sid)!.runs).toHaveLength(20);
  });
});
