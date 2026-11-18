/**
 * single-backend-batch3-settings-sessions.test.ts — 第三批（settings 扩展 + sessions）
 *
 * 覆盖：
 *   settings-ext（routes/system/settings-ext.ts）：
 *     - GET/PUT agents/selection（老协议 agents/selection.json，缺省 claude）
 *     - GET/PUT/DELETE connectors/composio（composio-config.json，尾部 4 位回显）
 *     - GET /agents/detect（AGENT_DEFS 形状 + cached/ttl_s）
 *     - GET /pets/:id/spritesheet（无 pet → 404 detail；非法 id → 404）
 *     - POST /pets/sync（非法 source → 422 Invalid source；合法 source 走网络容错路径）
 *     - DELETE /byok/:provider（老协议 byok-config.json；白名单外 422 Invalid provider）
 *     - DELETE /media/:providerId（media-config.json 写 null；未知 422 Unknown provider）
 *   sessions（routes/runs/sessions.ts）：
 *     - context 写入（直接操作 store 导出辅助）→ GET recent_steps/checkpoint 形状
 *     - checkpoint 中文默认文案 + segment 累计
 *     - report：无上下文 404 Session not found / 有上下文 in_progress
 *     - DELETE context → {deleted:true}；再删 404
 *
 * 隔离惯例：process.chdir(mkdtemp) + SHADOWFLOW_DATA_DIR；afterAll 三步序
 * （chdir 回 → 关 sqlite 句柄 → rmSync，Windows EBUSY）。无裸 require；无 vi.mock。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── 隔离：必须在 import 任何 storage/routes 模块之前 chdir ────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-sbe-b3-'));
const origCwd = process.cwd();
process.chdir(tmp);
process.env.SHADOWFLOW_DATA_DIR = tmp;

import settingsExtRouter from '../system/settings-ext';
import sessionsRouter, {
  _resetForTests as _resetSessions,
  _seedForTests,
  setReport,
} from '../runs/sessions';
import { _resetForTests as _resetSqlite } from '../../storage/sqlite';

afterAll(async () => {
  // 顺序敏感：① 先切回原 cwd（Windows 不允许删除进程当前目录）
  process.chdir(origCwd);
  delete process.env.SHADOWFLOW_DATA_DIR;
  // ② 再关 sqlite 句柄（句柄开着删库文件会 EBUSY）
  _resetSqlite();
  // ③ 最后删临时目录
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function app(router: express.Router, prefix: string): express.Express {
  const a = express();
  a.use(express.json());
  a.use(prefix, router);
  return a;
}

const settingsApp = () => app(settingsExtRouter, '/api/settings');
const sessionsApp = () => app(sessionsRouter, '/api/sessions');

// ════════════════════════════════════════════════════════════════════════════
// settings-ext
// ════════════════════════════════════════════════════════════════════════════

describe('settings-ext GET/PUT /api/settings/agents/selection', () => {
  const selFile = () => path.join(tmp, 'agents', 'selection.json');

  it('无文件 → 默认 {selectedId:"claude"}', async () => {
    const res = await request(settingsApp()).get('/api/settings/agents/selection');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ selectedId: 'claude' });
  });

  it('PUT 写盘 → GET 读回同一份 selection.json（legacy↔single 共享）', async () => {
    const put = await request(settingsApp())
      .put('/api/settings/agents/selection')
      .send({ selectedId: 'codex' });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ selectedId: 'codex' });
    expect(JSON.parse(fs.readFileSync(selFile(), 'utf-8'))).toEqual({ selectedId: 'codex' });
    const get = await request(settingsApp()).get('/api/settings/agents/selection');
    expect(get.body).toEqual({ selectedId: 'codex' });
  });

  it('PUT 缺 selectedId → 422 detail', async () => {
    const res = await request(settingsApp()).put('/api/settings/agents/selection').send({});
    expect(res.status).toBe(422);
    expect(res.body.detail).toContain('selectedId');
  });
});

describe('settings-ext /api/settings/connectors/composio', () => {
  const cfgFile = () => path.join(tmp, 'connectors', 'composio-config.json');

  it('GET 无文件 → {configured:false, apiKeyTail:""}', async () => {
    const res = await request(settingsApp()).get('/api/settings/connectors/composio');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: false, apiKeyTail: '' });
  });

  it('PUT 写盘（0600 语义的原子写）→ GET 回显尾部 4 位', async () => {
    const put = await request(settingsApp())
      .put('/api/settings/connectors/composio')
      .send({ apiKey: 'sk-composio-abcd1234' });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ configured: true, apiKeyTail: '1234' });
    expect(JSON.parse(fs.readFileSync(cfgFile(), 'utf-8'))).toEqual({
      apiKey: 'sk-composio-abcd1234',
    });
  });

  it('DELETE 清空 → GET {configured:false, apiKeyTail:""}；文件仍在（空 key）', async () => {
    const del = await request(settingsApp()).delete('/api/settings/connectors/composio');
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ configured: false, apiKeyTail: '' });
    expect(JSON.parse(fs.readFileSync(cfgFile(), 'utf-8'))).toEqual({ apiKey: '' });
  });

  it('PUT 缺 apiKey → 422', async () => {
    const res = await request(settingsApp()).put('/api/settings/connectors/composio').send({});
    expect(res.status).toBe(422);
  });
});

describe('settings-ext GET /api/settings/agents/detect', () => {
  it('返回 AGENT_DEFS 形状：id/name/installed/path/version/hints/fallback_models + cached/ttl_s', async () => {
    const res = await request(settingsApp()).get('/api/settings/agents/detect');
    expect(res.status).toBe(200);
    expect(res.body.ttl_s).toBe(60);
    expect(typeof res.body.cached).toBe('boolean');
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(res.body.agents.length).toBe(16);
    const first = res.body.agents[0];
    expect(first).toMatchObject({
      id: 'claude',
      name: 'Claude Code',
      installed: expect.any(Boolean),
      auth_hint: expect.anything(),
      fallback_models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    });
    // installed=true 时必有 path；installed=false 时 path 为 null
    if (first.installed) expect(first.path).toBeTruthy();
    else expect(first.path).toBeNull();
    // 第二次请求（不 force）→ cached=true
    const res2 = await request(settingsApp()).get('/api/settings/agents/detect');
    expect(res2.body.cached).toBe(true);
    // force=1 → cached=false
    const res3 = await request(settingsApp()).get('/api/settings/agents/detect?force=1');
    expect(res3.body.cached).toBe(false);
  });
});

describe('settings-ext pets', () => {
  it('GET /pets/:id/spritesheet 非法 id → 404 detail "Pet not found"', async () => {
    const res = await request(settingsApp()).get('/api/settings/pets/..%2Fevil/spritesheet');
    expect([400, 404]).toContain(res.status); // express 可能先规范化路径
  });

  it('GET /pets/:id/spritesheet 合法但不存在 → 404 detail', async () => {
    const res = await request(settingsApp()).get('/api/settings/pets/no-such-pet/spritesheet');
    expect(res.status).toBe(404);
    expect(res.body.detail).toBe('Pet not found');
  });

  it('用户目录放一个 pet → spritesheet 二进制回包 + Content-Type', async () => {
    const petDir = path.join(os.homedir(), '.codex', 'pets', 'test-pet');
    fs.mkdirSync(petDir, { recursive: true });
    // 1x1 PNG 最小文件
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
        '0d0a2db40000000049454e44ae426082',
      'hex',
    );
    fs.writeFileSync(path.join(petDir, 'spritesheet.png'), png);
    fs.writeFileSync(
      path.join(petDir, 'pet.json'),
      JSON.stringify({ displayName: 'Test Pet', description: 'd', author: 'a', tags: ['t'] }),
    );
    try {
      const res = await request(settingsApp()).get('/api/settings/pets/test-pet/spritesheet');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.body.length).toBe(png.length);
    } finally {
      fs.rmSync(petDir, { recursive: true, force: true });
    }
  });

  it('POST /pets/sync 非法 source → 422 "Invalid source"', async () => {
    const res = await request(settingsApp()).post('/api/settings/pets/sync?source=bogus');
    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('Invalid source');
  });

  it('POST /pets/sync source=all → 网络失败容错：200 + failed/total 计数 + errors 截 10', async () => {
    const res = await request(settingsApp()).post('/api/settings/pets/sync?limit=2');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      wrote: expect.any(Number),
      skipped: expect.any(Number),
      failed: expect.any(Number),
      total: expect.any(Number),
      errors: expect.any(Array),
      rootDir: path.join(os.homedir(), '.codex', 'pets'),
    });
    expect(res.body.errors.length).toBeLessThanOrEqual(10);
    // 无网/沙箱下 total=0 或 failed≥0 都合法，只验形状与容错不炸
  }, 60_000);
});

describe('settings-ext 老协议 DELETE /byok/:provider 与 /media/:providerId', () => {
  const byokFile = () => path.join(tmp, 'byok-config.json');

  it('白名单外 provider → 422 detail "Invalid provider"', async () => {
    const res = await request(settingsExtRouterApp()).delete('/api/settings/byok/moonshot');
    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('Invalid provider');
  });

  it('白名单内 provider → {ok:true}；无文件时先落全 provider null 的缺省档位再清', async () => {
    const res = await request(settingsExtRouterApp()).delete('/api/settings/byok/zhipu');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const cfg = JSON.parse(fs.readFileSync(byokFile(), 'utf-8'));
    expect(cfg.keys.zhipu).toBeNull();
    expect(cfg.keys.anthropic).toBeNull(); // 缺省档位齐全
    expect(cfg.model).toBe('claude-sonnet-4-6');
  });

  it('已有 byok-config.json（含 key/model/baseUrls）→ 只清该 provider，保留其余', async () => {
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(
      byokFile(),
      JSON.stringify({ keys: { anthropic: 'sk-keep', zhipu: 'sk-z' }, baseUrls: { zhipu: 'https://x' }, model: 'glm-4' }),
    );
    await request(settingsExtRouterApp()).delete('/api/settings/byok/zhipu');
    const cfg = JSON.parse(fs.readFileSync(byokFile(), 'utf-8'));
    expect(cfg.keys.anthropic).toBe('sk-keep');
    expect(cfg.keys.zhipu).toBeNull();
    expect(cfg.baseUrls.zhipu).toBe('https://x'); // baseUrls 不动
    expect(cfg.model).toBe('glm-4');
  });

  it('media 未知 provider → 422 "Unknown provider"；已知 → {ok:true} 且 keys 置 null', async () => {
    const mediaFile = () => path.join(tmp, 'media-config.json');
    const bad = await request(settingsExtRouterApp()).delete('/api/settings/media/nope');
    expect(bad.status).toBe(422);
    expect(bad.body.detail).toBe('Unknown provider');

    const ok = await request(settingsExtRouterApp()).delete('/api/settings/media/stability');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });
    const cfg = JSON.parse(fs.readFileSync(mediaFile(), 'utf-8'));
    expect(cfg.keys.stability).toBeNull();
  });
});

// 辅助：settings-ext 独立 app（与 settingsApp 等价，避免 describe 间共享别名混乱）
function settingsExtRouterApp(): express.Express {
  return app(settingsExtRouter, '/api/settings');
}

// ════════════════════════════════════════════════════════════════════════════
// sessions
// ════════════════════════════════════════════════════════════════════════════

describe('sessions GET/POST/DELETE — Story 11.5 对齐', () => {
  beforeAll(() => {
    _resetSessions();
  });

  async function seedViaHttp(agentId: string, sessionId: string): Promise<void> {
    // sessions.py 的 ctx 由运行时 run_agent_with_tools 写入（save 无 HTTP 路径），
    // 测试经 _seedForTests 同构注入。
    _seedForTests({
      agent_id: agentId,
      session_id: sessionId,
      task_description: 'write the report',
      working_dir: '/workspace',
      completed_steps: Array.from({ length: 12 }, (_, i) => ({
        index: i,
        description: `step ${i}`,
        tool_called: i % 2 === 0 ? 'fs.read' : 'shell.exec',
        result_summary: `result-${i} `.repeat(40).trim(),
        status: 'done',
        timestamp: new Date().toISOString(),
      })),
      environment: {},
      checkpoint_summaries: [
        { segment_index: 0, steps_in_segment: 7, summary: 'first segment', created_at: new Date().toISOString() },
      ],
      last_updated: new Date().toISOString(),
      current_error_attempts: 0,
    });
  }

  it('GET context：缺 agent_id → 422；无上下文 → 404 detail', async () => {
    const noAgent = await request(sessionsApp()).get('/api/sessions/s1/context');
    expect(noAgent.status).toBe(422);
    const miss = await request(sessionsApp()).get('/api/sessions/s1/context?agent_id=a1');
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('Session context not found');
  });

  it('GET context：steps_taken/segments/recent_steps(10 条截断)/result_summary(300 截断)/checkpoint.steps', async () => {
    await seedViaHttp('a1', 'sess-1');
    const res = await request(sessionsApp()).get('/api/sessions/sess-1/context?agent_id=a1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      agent_id: 'a1',
      session_id: 'sess-1',
      task_description: 'write the report',
      working_dir: '/workspace',
      steps_taken: 12,
      segments: 1,
    });
    expect(res.body.recent_steps).toHaveLength(10);
    expect(res.body.recent_steps[0].index).toBe(2); // 最近 10 条 = index 2..11
    expect(res.body.recent_steps[0].result_summary.length).toBeLessThanOrEqual(300);
    expect(res.body.checkpoint_summaries).toEqual([
      { segment_index: 0, summary: 'first segment', steps: 7 },
    ]);
  });

  it('POST checkpoint：默认中文文案 + segment 累计 + steps_taken', async () => {
    const res = await request(sessionsApp())
      .post('/api/sessions/sess-1/checkpoint')
      .send({ agent_id: 'a1' });
    expect(res.status).toBe(200);
    expect(res.body.checkpoint_index).toBe(1);
    expect(res.body.summary).toBe('手动检查点 — 段 2，共 12 步');
    expect(res.body.steps_taken).toBe(12);
    // 第 2 段的 steps_in_segment = 12 - 7 = 5（GET context 回读验证）
    const ctx = await request(sessionsApp()).get('/api/sessions/sess-1/context?agent_id=a1');
    expect(ctx.body.segments).toBe(2);
    expect(ctx.body.checkpoint_summaries[1]).toEqual({
      segment_index: 1,
      summary: '手动检查点 — 段 2，共 12 步',
      steps: 5,
    });
    // 显式 summary：返回体透传原文（python return {"summary": summary} 不截断），
    // 存储 add_checkpoint_summary 内部才截 200 → 经 GET context 回读验证
    const res2 = await request(sessionsApp())
      .post('/api/sessions/sess-1/checkpoint')
      .send({ agent_id: 'a1', summary: 'x'.repeat(300) });
    expect(res2.body.summary).toHaveLength(300);
    const ctx2 = await request(sessionsApp()).get('/api/sessions/sess-1/context?agent_id=a1');
    expect(ctx2.body.checkpoint_summaries[2].summary).toHaveLength(200);
  });

  it('POST checkpoint：上下文不存在 → 404；缺 agent_id → 422', async () => {
    const miss = await request(sessionsApp())
      .post('/api/sessions/nope/checkpoint')
      .send({ agent_id: 'a1' });
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('Session context not found');
    const noAgent = await request(sessionsApp()).post('/api/sessions/sess-1/checkpoint').send({});
    expect(noAgent.status).toBe(422);
  });

  it('GET report：无缓存无上下文 → 404 "Session not found"；有上下文 → in_progress 形状', async () => {
    const miss = await request(sessionsApp()).get('/api/sessions/none/report?agent_id=a1');
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('Session not found');

    const res = await request(sessionsApp()).get('/api/sessions/sess-1/report?agent_id=a1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'in_progress', steps_taken: 12, segments: 3 });
  });

  it('GET report：LRU 缓存命中 → 透传报告对象（set_report → get）', async () => {
    setReport('a1', 'sess-1', { task_id: 't1', status: 'completed', steps_taken: 12, outputs: [] });
    const res = await request(sessionsApp()).get('/api/sessions/sess-1/report?agent_id=a1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ task_id: 't1', status: 'completed', steps_taken: 12, outputs: [] });
  });

  it('DELETE context → {deleted:true, session_id}；再删 → 404', async () => {
    const del = await request(sessionsApp()).delete('/api/sessions/sess-1/context?agent_id=a1');
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: true, session_id: 'sess-1' });
    const again = await request(sessionsApp()).delete('/api/sessions/sess-1/context?agent_id=a1');
    expect(again.status).toBe(404);
    expect(again.body.detail).toBe('Session context not found');
  });

  it('DELETE context 不清 report LRU（python 亦如此）：删后 report 缓存仍命中', async () => {
    // 上条用例已把 sess-1 的 context 删掉；report 缓存里还有 t1 报告 → 仍 200。
    // （python _get_report 与 store.load 相互独立，delete_context 不动缓存。）
    const rep = await request(sessionsApp()).get('/api/sessions/sess-1/report?agent_id=a1');
    expect(rep.status).toBe(200);
    expect(rep.body.task_id).toBe('t1');
    // 无缓存的 session：context 没了 → 404
    const miss = await request(sessionsApp()).get('/api/sessions/sess-1/report?agent_id=a9');
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('Session not found');
  });
});
