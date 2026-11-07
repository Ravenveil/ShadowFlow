/**
 * routes/__tests__/teams-plan-gate.test.ts — T05① 计划确认门 REST 面。
 *
 *   GET  /api/teams/:id/plan          → 当前计划（无 → plan:null）
 *   POST /api/teams/:id/plan          → 登记/替换计划（201，一律 pending）
 *   POST /api/teams/:id/plan/confirm  → 确认（404 无计划 / 409 plan_id 过期）
 *   POST /api/teams/:id/plan/reject   → 退回（记原因）
 *   POST /api/teams/dag-draft + teamId → 生成成功顺带挂 pending 计划（additive）
 *
 * 与 teams-dag-draft.test.ts 同装具：chdir 临时 cwd + http.request 打真实端口；
 * LLM 走 vi.mock 的 callProvider（无网络）。SF_PLAN_GATE_PATH 指到 tmp 隔离。
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProviderChunk } from '../../transport/api-clients';
import { PROVIDER_ENV_VAR } from '../../transport/api-clients';

const { callProviderMock } = vi.hoisted(() => ({ callProviderMock: vi.fn() }));

vi.mock('../../transport/api-clients', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../transport/api-clients')>();
  return { ...orig, callProvider: (...args: unknown[]) => callProviderMock(...args) };
});

interface HttpResp {
  status: number;
  body: any;
}

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const h: Record<string, string | number> = { ...headers };
    if (data) {
      h['Content-Type'] = 'application/json';
      h['Content-Length'] = Buffer.byteLength(data);
    }
    const r = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: h }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        let parsed: unknown = null;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const post = (port: number, urlPath: string, body?: Record<string, unknown>, headers: Record<string, string> = {}) =>
  request(port, 'POST', urlPath, body, headers);
const get = (port: number, urlPath: string) => request(port, 'GET', urlPath);

const genText = (text: string) =>
  async function* (): AsyncGenerator<ProviderChunk> {
    yield { type: 'text-delta', text };
    yield { type: 'end' };
  };

const BYOK_HEADERS = { 'x-llm-provider': 'zhipu', 'x-llm-key': 'sk-test' };

const PLAN_BODY = {
  prompt: '做一期手工银饰推广',
  nodes: [
    { id: 'n1', agentId: 'alpha', name: '策划', acceptance: '选题 ≥3', risk: '撞车' },
    { id: 'n2', agentId: 'beta', name: '文案', acceptance: '成稿 800 字', risk: '口吻' },
  ],
  edges: [{ source: 'n1', target: 'n2', mode: 'direct' }],
};

const VALID_DRAFT = {
  nodes: [
    { id: 'n1', agentId: 'alpha', name: 'Alpha', acceptance: '出方案', risk: '延期' },
    { id: 'n2', agentId: 'beta', name: 'Beta', acceptance: '审校 1 轮', risk: '漏审' },
  ],
  edges: [{ source: 'n1', target: 'n2', mode: 'approve' }],
};

let server: http.Server;
let port = 0;
let tmp = '';
let origCwd = '';
let savedEnv: Record<string, string | undefined> = {};
let planGateTmp = '';

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-plan-gate-api-'));
  planGateTmp = path.join(tmp, 'plan-gate.json');
  process.env.SF_PLAN_GATE_PATH = planGateTmp;
  process.chdir(tmp);
  fs.mkdirSync(path.join(tmp, '.shadowflow', 'agents'), { recursive: true });
  process.env.PYTHON_BACKEND_URL = 'http://127.0.0.1:9';
  for (const envName of Object.values(PROVIDER_ENV_VAR)) {
    savedEnv[envName] = process.env[envName];
    delete process.env[envName];
  }

  const mod = await import('../agents/teams');
  const app: Express = express();
  app.use(express.json());
  app.use('/api/teams', mod.default);
  server = app.listen(0);
  await new Promise<void>((r) => server.on('listening', () => r()));
  const addr = server.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  process.chdir(origCwd);
  delete process.env.PYTHON_BACKEND_URL;
  delete process.env.SF_PLAN_GATE_PATH;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('计划登记与查询', () => {
  it('无计划 → GET 200 + plan:null', async () => {
    const r = await get(port, '/api/teams/team-a/plan');
    expect(r.status).toBe(200);
    expect(r.body?.data?.plan).toBeNull();
  });

  it('POST 登记 → 201 pending，五要素透传；再次登记替换且回 pending', async () => {
    const r = await post(port, '/api/teams/team-a/plan', PLAN_BODY);
    expect(r.status).toBe(201);
    expect(r.body?.data?.plan?.status).toBe('pending');
    expect(r.body?.data?.plan?.nodes?.[0]?.acceptance).toBe('选题 ≥3');
    expect(r.body?.data?.plan?.nodes?.[0]?.risk).toBe('撞车');

    const r2 = await post(port, '/api/teams/team-a/plan', { nodes: [{ id: 'x' }], edges: [] });
    expect(r2.status).toBe(201);
    expect(r2.body?.data?.plan?.plan_id).not.toBe(r.body?.data?.plan?.plan_id);
    expect(r2.body?.data?.plan?.status).toBe('pending');

    const g = await get(port, '/api/teams/team-a/plan');
    expect(g.body?.data?.plan?.nodes).toHaveLength(1);
  });

  it('非法输入 → 400 INVALID_PLAN / 400 INVALID_ID', async () => {
    const bad = await post(port, '/api/teams/team-b/plan', { nodes: [], edges: [] });
    expect(bad.status).toBe(400);
    expect(bad.body?.error?.code).toBe('INVALID_PLAN');
    const badId = await post(port, `/api/teams/${encodeURIComponent('team$a')}/plan`, PLAN_BODY);
    expect(badId.status).toBe(400);
    expect(badId.body?.error?.code).toBe('INVALID_ID');
  });
});

describe('计划确认/退回', () => {
  it('confirm → confirmed；之后 GET 可见 decided_at', async () => {
    await post(port, '/api/teams/team-c/plan', PLAN_BODY);
    const r = await post(port, '/api/teams/team-c/plan/confirm', {});
    expect(r.status).toBe(200);
    expect(r.body?.data?.plan?.status).toBe('confirmed');
    const g = await get(port, '/api/teams/team-c/plan');
    expect(g.body?.data?.plan?.decided_at).toBeTypeOf('number');
  });

  it('reject 带原因 → rejected + reject_reason', async () => {
    await post(port, '/api/teams/team-d/plan', PLAN_BODY);
    const r = await post(port, '/api/teams/team-d/plan/reject', { reason: '依赖顺序不对' });
    expect(r.status).toBe(200);
    expect(r.body?.data?.plan?.status).toBe('rejected');
    expect(r.body?.data?.plan?.reject_reason).toBe('依赖顺序不对');
  });

  it('plan_id 过期 → 409 PLAN_STALE（不改状态）；无计划 → 404 PLAN_NOT_FOUND', async () => {
    await post(port, '/api/teams/team-e/plan', PLAN_BODY);
    const stale = await post(port, '/api/teams/team-e/plan/confirm', { plan_id: 'not-this-one' });
    expect(stale.status).toBe(409);
    expect(stale.body?.error?.code).toBe('PLAN_STALE');
    const g = await get(port, '/api/teams/team-e/plan');
    expect(g.body?.data?.plan?.status).toBe('pending');

    const none = await post(port, '/api/teams/team-nobody/plan/confirm', {});
    expect(none.status).toBe(404);
    expect(none.body?.error?.code).toBe('PLAN_NOT_FOUND');
  });
});

describe('dag-draft + teamId 挂计划（additive）', () => {
  it('带 teamId 生成成功 → data.plan 挂 pending，GET 可查', async () => {
    callProviderMock.mockReset();
    callProviderMock.mockImplementation(genText(JSON.stringify(VALID_DRAFT)));
    const r = await post(
      port,
      '/api/teams/dag-draft',
      { prompt: 'alpha 做完给 beta 审批', teamId: 'team-f' },
      BYOK_HEADERS,
    );
    expect(r.status).toBe(200);
    expect(r.body?.data?.draft?.nodes).toHaveLength(2);
    expect(r.body?.data?.plan?.status).toBe('pending');
    const g = await get(port, '/api/teams/team-f/plan');
    expect(g.body?.data?.plan?.prompt).toBe('alpha 做完给 beta 审批');
    expect(g.body?.data?.plan?.nodes?.[0]?.acceptance).toBe('出方案');
  });

  it('不带 teamId → 纯生成器（旧契约）：data.plan 为 null 且不挂任何计划', async () => {
    callProviderMock.mockReset();
    callProviderMock.mockImplementation(genText(JSON.stringify(VALID_DRAFT)));
    const r = await post(port, '/api/teams/dag-draft', { prompt: 'x' }, BYOK_HEADERS);
    expect(r.status).toBe(200);
    expect(r.body?.data?.plan).toBeNull();
    const g = await get(port, '/api/teams/team-g/plan');
    expect(g.body?.data?.plan).toBeNull();
  });

  it('teamId 非法 → 400 INVALID_TEAM_ID（LLM 不跑）', async () => {
    callProviderMock.mockReset();
    const r = await post(port, '/api/teams/dag-draft', { prompt: 'x', teamId: '../evil' }, BYOK_HEADERS);
    expect(r.status).toBe(400);
    expect(r.body?.error?.code).toBe('INVALID_TEAM_ID');
    expect(callProviderMock).not.toHaveBeenCalled();
  });

  it('生成失败（LLM_FAILED）→ 不挂计划', async () => {
    callProviderMock.mockReset();
    callProviderMock.mockImplementation(async function* (): AsyncGenerator<ProviderChunk> {
      yield { type: 'error', message: 'down', code: 'NETWORK_ERROR' };
    });
    const r = await post(port, '/api/teams/dag-draft', { prompt: 'x', teamId: 'team-h' }, BYOK_HEADERS);
    expect(r.status).toBe(502);
    const g = await get(port, '/api/teams/team-h/plan');
    expect(g.body?.data?.plan).toBeNull();
  });
});
