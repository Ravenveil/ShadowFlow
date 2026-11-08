/**
 * routes/__tests__/dm-resolve-owned.test.ts — DM resolve 归属感知（2026-11-08 修
 * 「消息发不出来了」）。
 *
 * 复现路径：身份 A 建总经理 DM → 切换身份 B → 旧 find-or-create 递回 A 的会话 →
 * 归属守卫 404（Group '<id>' not found）→ 时间线/发消息全线挂掉。
 *
 * 覆盖：
 *   - python 模式（fetch 桩仿真 Python DM 后端）：本人已有 → 本人优先于无主 →
 *     无主认领 → 全是别人的就新建；exclude_group_ids 排除法确实传给了 Python；
 *     无 req.user / admin → 回退历史行为（落给 proxyFallback 替身）。
 *   - node 模式（真实 SQLite store）：双身份各拿各的 DM + 归属守卫 404 复现回归。
 *
 * 隔离：chdir 临时目录 + sqlite._resetForTests()（同 groups-node.test.ts）。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { vi } from 'vitest';

import * as sqlite from '../../storage/sqlite';
import * as store from '../../storage/groups-store';
import { getOwner, setOwner } from '../../storage/resource-owners';
import { groupAccessGuard } from '../../middleware/group-access';
import { groupsNodeRouter } from '../groups/groups-node';
import { handleDmResolveOwned } from '../groups/dm-resolve';

// ── 最小 HTTP 客户端（同 groups-node.test.ts 的 no-supertest 风格） ──────────

interface HttpResp {
  status: number;
  body: any;
}

function req(port: number, method: string, urlPath: string): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: urlPath }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    r.on('error', reject);
    r.end();
  });
}

// ── Python DM 后端仿真（fetch 桩） ──────────────────────────────────────────

interface PyDm {
  group_id: string;
  agent_ids: string[];
}

let pyDms: PyDm[] = [];
let pySeq = 0;
let pyCalls: string[] = [];

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 仿真 groups.py 的 GET /api/groups?kind=dm + POST /api/chat/dm/:agent/resolve。
 *  返回类型走 typeof fetch 推导（避免与 express 的 Request/Response 重名）。 */
function pyStubFetch(input: Parameters<typeof fetch>[0]): ReturnType<typeof fetch> {
  const url = String(input);
  pyCalls.push(url);
  const u = new URL(url, 'http://py.stub');
  if (u.pathname === '/api/groups') {
    return Promise.resolve(
      jsonResp(200, { data: pyDms, groups: pyDms, meta: { count: pyDms.length } }),
    );
  }
  const m = u.pathname.match(/^\/api\/chat\/dm\/([^/]+)\/resolve$/);
  if (m) {
    const agentId = decodeURIComponent(m[1]);
    const excluded = new Set(u.searchParams.getAll('exclude_group_ids'));
    const hit = pyDms.find(
      (d) => d.agent_ids.length === 1 && d.agent_ids[0] === agentId && !excluded.has(d.group_id),
    );
    if (hit) {
      return Promise.resolve(
        jsonResp(200, { group_id: hit.group_id, agent_id: agentId, created: false }),
      );
    }
    const gid = `py${(++pySeq).toString().padStart(29, '0')}`;
    pyDms.push({ group_id: gid, agent_ids: [agentId] });
    return Promise.resolve(jsonResp(200, { group_id: gid, agent_id: agentId, created: true }));
  }
  return Promise.resolve(jsonResp(404, { detail: 'no route' }));
}

// ── 测试 app（可切换登录身份） ───────────────────────────────────────────────

interface FakeUser {
  user_id: string;
  auth_type: 'guest' | 'email';
  role: 'user' | 'admin';
  disabled: boolean;
  email: string | null;
  display_name: string | null;
}

let currentUser: FakeUser | null = null;

function asUser(userId: string): FakeUser {
  return {
    user_id: userId,
    auth_type: 'guest',
    role: 'user',
    disabled: false,
    email: null,
    display_name: null,
  };
}

let app: Express;
let server: http.Server;
let port: number;
let origCwd: string;
let tmpDir: string;
let origBackend: string | undefined;

beforeAll(async () => {
  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dm-resolve-owned-'));
  process.chdir(tmpDir);
  sqlite._resetForTests();
  sqlite.getDb();
  origBackend = process.env.SF_GROUPS_BACKEND;
  vi.stubGlobal('fetch', pyStubFetch);

  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (currentUser) (req as { user?: FakeUser }).user = { ...currentUser };
    next();
  });
  app.post('/api/chat/dm/:agent_id/resolve', handleDmResolveOwned);
  // 归属守卫 + node 群路由（复现 404 场景用）；/api 兜底是 proxyFallback 替身。
  app.use('/api/groups', groupAccessGuard());
  app.use('/api/groups', groupsNodeRouter);
  app.use('/api', (_req: Request, res: Response) => {
    res.status(598).json({ fallback: true });
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllGlobals();
  if (origBackend === undefined) delete process.env.SF_GROUPS_BACKEND;
  else process.env.SF_GROUPS_BACKEND = origBackend;
  sqlite._resetForTests();
  process.chdir(origCwd);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

beforeEach(() => {
  currentUser = null;
  pyDms = [];
  pySeq = 0;
  pyCalls = [];
  delete process.env.SF_GROUPS_BACKEND;
});

// ── python 模式 ──────────────────────────────────────────────────────────────

describe('python 模式 · 归属感知 resolve', () => {
  it('同一身份幂等；不同身份各拿各的 DM（复现根修）', async () => {
    currentUser = asUser('alice-py');
    const a1 = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(a1.status).toBe(200);
    expect(a1.body.created).toBe(true);
    const gidA = a1.body.group_id;

    const a2 = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(a2.body.group_id).toBe(gidA);
    expect(a2.body.created).toBe(false);

    currentUser = asUser('bob-py');
    const b1 = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(b1.body.created).toBe(true);
    expect(b1.body.group_id).not.toBe(gidA);
    expect(getOwner('group', b1.body.group_id)).toBe('bob-py');

    const b2 = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(b2.body.group_id).toBe(b1.body.group_id);

    // A 会话归属没被 B 动过
    expect(getOwner('group', gidA)).toBe('alice-py');
  });

  it('把别人的 DM 排除掉（exclude_group_ids 传给了 Python）', async () => {
    pyDms = [{ group_id: 'foreign-dm-1', agent_ids: ['agent-sec'] }];
    setOwner('group', 'foreign-dm-1', 'someone-else');
    currentUser = asUser('carol-py');
    const r = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(true);
    expect(r.body.group_id).not.toBe('foreign-dm-1');
    const post = pyCalls.filter((u) => u.includes('/resolve')).pop() ?? '';
    expect(post).toContain('exclude_group_ids=foreign-dm-1');
  });

  it('本人已有 DM 优先于无主存量 DM（绝不递错会话）', async () => {
    // U 无主且排在前面；M 是 alice 自己的
    pyDms = [
      { group_id: 'unowned-dm-u', agent_ids: ['agent-sec'] },
      { group_id: 'mine-dm-m', agent_ids: ['agent-sec'] },
    ];
    setOwner('group', 'mine-dm-m', 'dave-py');
    currentUser = asUser('dave-py');
    const r = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(r.body.group_id).toBe('mine-dm-m');
    expect(r.body.created).toBe(false);
    // 无主的 U 没被顺手认领（留给它真正的第一条访问者）
    expect(getOwner('group', 'unowned-dm-u')).toBe(null);
  });

  it('无主存量 DM 由第一条 resolve 认领', async () => {
    pyDms = [{ group_id: 'unowned-dm-2', agent_ids: ['agent-sec'] }];
    currentUser = asUser('erin-py');
    const r = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(r.body.group_id).toBe('unowned-dm-2');
    expect(r.body.created).toBe(false);
    expect(getOwner('group', 'unowned-dm-2')).toBe('erin-py');
  });

  it('无 req.user / admin → 回退历史行为（落给 proxyFallback）', async () => {
    currentUser = null;
    const anon = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(anon.status).toBe(598);
    expect(anon.body.fallback).toBe(true);

    currentUser = { ...asUser('root'), role: 'admin' };
    const adm = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(adm.status).toBe(598);
    expect(adm.body.fallback).toBe(true);
  });
});

// ── node 模式（真实 store） ──────────────────────────────────────────────────

describe('node 模式 · 归属感知 resolve + 归属守卫 404 复现回归', () => {
  it('双身份各拿各的 DM；对方的会话 404，自己的 200', async () => {
    process.env.SF_GROUPS_BACKEND = 'node';
    currentUser = asUser('alice-nd');
    const a1 = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(a1.status).toBe(200);
    expect(a1.body.created).toBe(true);
    const gidA = a1.body.group_id;
    expect(getOwner('group', gidA)).toBe('alice-nd');

    const a2 = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(a2.body.group_id).toBe(gidA);
    expect(a2.body.created).toBe(false);

    // 切身份：B 拿到自己的新 DM，不是 A 的
    currentUser = asUser('bob-nd');
    const b1 = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(b1.body.created).toBe(true);
    expect(b1.body.group_id).not.toBe(gidA);
    const gidB = b1.body.group_id;

    // 复现回归：B 打开 A 的会话 → 404（不泄露存在性）；自己的 → 200
    const denied = await req(port, 'GET', `/api/groups/${gidA}/messages`);
    expect(denied.status).toBe(404);
    expect(denied.body.error.message).toBe(`Group '${gidA}' not found`);
    const ok = await req(port, 'GET', `/api/groups/${gidB}/messages`);
    expect(ok.status).toBe(200);

    // A 回来还是自己的
    currentUser = asUser('alice-nd');
    const a3 = await req(port, 'POST', '/api/chat/dm/agent-sec/resolve');
    expect(a3.body.group_id).toBe(gidA);
    const aOpen = await req(port, 'GET', `/api/groups/${gidA}/messages`);
    expect(aOpen.status).toBe(200);
  });

  it('node 模式：本人已有优先于无主；无主可认领', async () => {
    process.env.SF_GROUPS_BACKEND = 'node';
    // U 无主；M 归 frank
    const u = store.createGroup({ name: 'U', agent_ids: ['agent-nd2'], kind: 'dm' });
    const m = store.createGroup({ name: 'M', agent_ids: ['agent-nd2'], kind: 'dm' });
    setOwner('group', m.group_id, 'frank-nd');

    currentUser = asUser('frank-nd');
    const r = await req(port, 'POST', '/api/chat/dm/agent-nd2/resolve');
    expect(r.body.group_id).toBe(m.group_id);
    expect(getOwner('group', u.group_id)).toBe(null); // 无主的不顺手认领

    // 无主的 U 由下一位认领
    currentUser = asUser('grace-nd');
    const r2 = await req(port, 'POST', '/api/chat/dm/agent-nd2/resolve');
    expect(r2.body.group_id).toBe(u.group_id);
    expect(getOwner('group', u.group_id)).toBe('grace-nd');
  });
});
