/**
 * user-isolation.test.ts — 登录信息隔离批（users / resource_owners / 鉴权中间件 /
 * admin API）。
 *
 * 覆盖：
 *   1. users 表与 admin 引导（首个邮箱用户 / SF_ADMIN_EMAIL / 幂等 upsert /
 *      deleteUserDeep 清理）；
 *   2. resource_owners 归属真源（setOwner 先到先得 / resolveOwner 派生链 /
 *      accessOwner 认领策略 / accessAny 双身份 / filterOwned 列表过滤）；
 *   3. 鉴权中间件 HTTP（401 UNAUTHORIZED / 403 USER_DISABLED / ownerGuard 404）；
 *   4. 数据面隔离 HTTP（projects 路由：建即归属、列表过滤、他人 404、无主认领）；
 *   5. admin API（403 FORBIDDEN / 自我保护 400 / 删用户清归属 / overview 形状）；
 *   6. guest 会话互相隔离（独立 user_id）。
 *
 * 隔离：chdir 临时目录 + sqlite._resetForTests()（参考 run-index.test.ts）。
 * 所有 HTTP 用例挂真实中间件 + 真实路由（supertest），不 mock 归属逻辑。
 */

import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as sqlite from '../storage/sqlite';
import {
  countUsers,
  deleteUserDeep,
  ensureUser,
  getUser,
  setUserDisabled,
  setUserRole,
} from '../storage/users';
import {
  accessAny,
  accessOwner,
  countResourcesByOwner,
  filterOwned,
  getOwner,
  removeOwnersForUser,
  resolveOwner,
  setOwner,
} from '../storage/resource-owners';
import { createSession, getSessionByTokenHash } from '../storage/auth';
import { attachUser, requireAdmin, requireAuth } from '../middleware/auth-context';
import { ownerGuard } from '../middleware/auth-context';
import adminRouter from '../routes/system/admin';
import projectsRouter from '../routes/projects/projects';
import authRouter from '../routes/system/auth';
import { createProject } from '../storage/projects';
import { createConversation } from '../storage/conversations';
import { upsertRunIndex } from '../storage/run-index';

let origCwd: string;
let tmpDir: string;
const ORIGINAL_ADMIN_EMAIL = process.env.SF_ADMIN_EMAIL;

beforeEach(() => {
  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-user-isolation-'));
  process.chdir(tmpDir);
  delete process.env.SF_ADMIN_EMAIL;
  sqlite._resetForTests();
  sqlite.getDb();
});

afterEach(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  if (ORIGINAL_ADMIN_EMAIL === undefined) delete process.env.SF_ADMIN_EMAIL;
  else process.env.SF_ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ── fixtures ────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

let tokenSeq = 0;
/** 签发一条会话（真实 auth_sessions 行），返回可用的 Bearer token。 */
function issueToken(address: string, authType: 'wallet' | 'guest' | 'email' = 'email'): string {
  const token = `tk-${++tokenSeq}-${Math.random().toString(36).slice(2)}`;
  createSession(sha256(token), address, authType, '2099-12-31 23:59:59');
  return token;
}

/** 挂真实鉴权链的数据面 app（与 index.ts 的 PROTECTED_DATA_PATHS 同构）。 */
function dataApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', attachUser, requireAuth, projectsRouter);
  return app;
}

/** 挂真实鉴权链的管理面 app（与 index.ts 的 /api/admin 挂载同构）。 */
function adminApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', attachUser, requireAdmin, adminRouter);
  return app;
}

// ── 1. users 表与 admin 引导 ─────────────────────────────────────────────────

describe('users 表与 admin 引导', () => {
  it('首个注册的邮箱用户自动成为 admin，其后的邮箱用户是 user', () => {
    const first = ensureUser({ user_id: 'first@x.com', auth_type: 'email' });
    const second = ensureUser({ user_id: 'second@x.com', auth_type: 'email' });
    expect(first.role).toBe('admin');
    expect(second.role).toBe('user');
  });

  it('SF_ADMIN_EMAIL 指定的邮箱注册时直接成为 admin（即使不是第一个）', () => {
    ensureUser({ user_id: 'first@x.com', auth_type: 'email' });
    process.env.SF_ADMIN_EMAIL = 'Boss@X.com'; // 大小写不敏感
    const boss = ensureUser({ user_id: 'boss@x.com', auth_type: 'email' });
    expect(boss.role).toBe('admin');
  });

  it('wallet / guest 用户永远是 user，不参与 admin 引导', () => {
    const w = ensureUser({ user_id: '0xabc', auth_type: 'wallet' });
    const g = ensureUser({ user_id: 'guest_deadbeef', auth_type: 'guest' });
    expect(w.role).toBe('user');
    expect(g.role).toBe('user');
  });

  it('ensureUser 幂等：重复登录不改 role/disabled，可刷新 display_name', () => {
    const first = ensureUser({ user_id: 'a@x.com', auth_type: 'email', display_name: 'A' });
    expect(first.role).toBe('admin');
    setUserDisabled('a@x.com', true);

    // 第二次登录：role 保持 admin（不按「首个」重算）、disabled 保持、昵称可刷新。
    const again = ensureUser({ user_id: 'a@x.com', auth_type: 'email', display_name: 'A2' });
    expect(again.role).toBe('admin');
    expect(again.disabled).toBe(1);
    expect(again.display_name).toBe('A2');
    expect(countUsers()).toBe(1);
  });

  it('deleteUserDeep 清 users 行 + 会话 + 资源归属行', () => {
    ensureUser({ user_id: 'gone@x.com', auth_type: 'email' });
    const token = issueToken('gone@x.com', 'email');
    setOwner('project', 'p1', 'gone@x.com');
    expect(getSessionByTokenHash(sha256(token))).not.toBeNull();

    expect(deleteUserDeep('gone@x.com')).toBe(true);
    expect(getUser('gone@x.com')).toBeNull();
    expect(getSessionByTokenHash(sha256(token))).toBeNull();
    expect(getOwner('project', 'p1')).toBeNull();
  });
});

// ── 2. resource_owners 归属真源 ──────────────────────────────────────────────

describe('resource_owners 归属与认领', () => {
  const alice = { user_id: 'alice', role: 'user' };
  const bob = { user_id: 'bob', role: 'user' };
  const root = { user_id: 'root', role: 'admin' };

  it('setOwner 先到先得（INSERT OR IGNORE，不覆盖已有归属）', () => {
    expect(setOwner('project', 'p1', 'alice')).toBe('alice');
    expect(setOwner('project', 'p1', 'bob')).toBe('alice'); // 抢不走
    expect(getOwner('project', 'p1')).toBe('alice');
  });

  it('resolveOwner 派生链：conversation → group；run_session → conversation', () => {
    const proj = createProject({ name: 'P' });
    const conv = createConversation(proj.project_id, undefined, 'g1');
    setOwner('group', 'g1', 'alice');
    // conversation 无直接行 → 沿 group_id 派生
    expect(resolveOwner('conversation', conv.conversation_id)).toBe('alice');

    upsertRunIndex({ session_id: 's1', conversation_id: conv.conversation_id, goal: 'g' });
    // run_session 无直接行 → run_index.conversation_id → conversation → group
    expect(resolveOwner('run_session', 's1')).toBe('alice');
  });

  it('accessOwner：admin 放行 / 本人放行 / 他人拒绝 / 无主认领给第一个访问者', () => {
    setOwner('project', 'p1', 'alice');
    expect(accessOwner('project', 'p1', root)).toBe(true); // admin 全放行
    expect(accessOwner('project', 'p1', alice)).toBe(true);
    expect(accessOwner('project', 'p1', bob)).toBe(false);

    // 无主 → 认领；认领后第二个访问者被拒
    expect(accessOwner('project', 'p2', bob)).toBe(true);
    expect(getOwner('project', 'p2')).toBe('bob');
    expect(accessOwner('project', 'p2', alice)).toBe(false);
  });

  it('accessAny：run_id / session_id 双身份——任一身份属于别人即拒绝', () => {
    setOwner('run', 'r1', 'alice');
    expect(accessAny(['run', 'run_session'], 'r1', alice)).toBe(true);
    expect(accessAny(['run', 'run_session'], 'r1', bob)).toBe(false);

    // 全无主 → 以第一个类型认领
    expect(accessAny(['run', 'run_session'], 'unknown-id', bob)).toBe(true);
    expect(getOwner('run', 'unknown-id')).toBe('bob');
  });

  it('filterOwned：列表只留自己的（admin 全量），无主行被认领', () => {
    setOwner('project', 'p1', 'alice');
    setOwner('project', 'p3', 'bob');
    const items = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    const seen = filterOwned('project', items, (i) => i.id, alice);
    expect(seen.map((i) => i.id)).toEqual(['p1', 'p2']); // p2 无主被认领
    expect(getOwner('project', 'p2')).toBe('alice');
    expect(filterOwned('project', items, (i) => i.id, root)).toHaveLength(3); // admin 全量
  });

  it('removeOwnersForUser 清掉某用户全部归属行', () => {
    setOwner('project', 'p1', 'alice');
    setOwner('group', 'g1', 'alice');
    setOwner('project', 'p2', 'bob');
    expect(removeOwnersForUser('alice')).toBe(2);
    expect(getOwner('project', 'p1')).toBeNull();
    expect(getOwner('project', 'p2')).toBe('bob');
    expect(countResourcesByOwner()).toEqual({ bob: 1 });
  });
});

// ── 3. 鉴权中间件（HTTP） ────────────────────────────────────────────────────

describe('鉴权中间件', () => {
  it('无 token → 401 UNAUTHORIZED', async () => {
    const res = await request(dataApp()).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('伪造 token → 401（查不到会话一律拒绝）', async () => {
    const res = await request(dataApp())
      .get('/api/projects')
      .set('Authorization', 'Bearer forged-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('被禁用用户 → 403 USER_DISABLED', async () => {
    ensureUser({ user_id: 'u@x.com', auth_type: 'email' });
    const token = issueToken('u@x.com', 'email');
    setUserDisabled('u@x.com', true);
    const res = await request(dataApp())
      .get('/api/projects')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('USER_DISABLED');
  });

  it('ownerGuard：非本人资源 404 NOT_FOUND（不泄露存在性）', async () => {
    ensureUser({ user_id: 'alice', auth_type: 'wallet' });
    ensureUser({ user_id: 'bob', auth_type: 'wallet' });
    setOwner('project', 'px', 'alice');

    const app = express();
    app.use(express.json());
    const r = express.Router();
    r.param('id', ownerGuard('project', 'id'));
    r.get('/:id', (req, res) => {
      res.json({ project_id: req.params.id });
    });
    app.use('/x', attachUser, requireAuth, r);

    const tokAlice = issueToken('alice', 'wallet');
    const tokBob = issueToken('bob', 'wallet');
    const ok = await request(app).get('/x/px').set('Authorization', `Bearer ${tokAlice}`);
    expect(ok.status).toBe(200);
    const denied = await request(app).get('/x/px').set('Authorization', `Bearer ${tokBob}`);
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe('NOT_FOUND');

    // 直挂（无 attachUser/requireAuth，旧测试同款）行为不变：不拦截
    const legacyApp = express();
    legacyApp.use('/x', r);
    const legacy = await request(legacyApp).get('/x/px');
    expect(legacy.status).toBe(200);
  });
});

// ── 4. 数据面隔离（projects 路由） ───────────────────────────────────────────

describe('数据面隔离（projects 路由）', () => {
  it('建即归属：自己的项目在自己列表里、不在别人列表里；他人详情 404', async () => {
    ensureUser({ user_id: 'alice', auth_type: 'wallet' });
    ensureUser({ user_id: 'bob', auth_type: 'wallet' });
    const tokA = issueToken('alice', 'wallet');
    const tokB = issueToken('bob', 'wallet');

    const created = await request(dataApp())
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokA}`)
      .send({ name: 'Alice 的项目' });
    expect(created.status).toBe(201);
    const pid = created.body.project_id as string;
    expect(getOwner('project', pid)).toBe('alice'); // create 时写归属

    const listA = await request(dataApp()).get('/api/projects').set('Authorization', `Bearer ${tokA}`);
    expect(listA.status).toBe(200);
    expect(listA.body.map((p: { project_id: string }) => p.project_id)).toContain(pid);

    const listB = await request(dataApp()).get('/api/projects').set('Authorization', `Bearer ${tokB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.map((p: { project_id: string }) => p.project_id)).not.toContain(pid);

    const detailB = await request(dataApp())
      .get(`/api/projects/${pid}`)
      .set('Authorization', `Bearer ${tokB}`);
    expect(detailB.status).toBe(404); // 不泄露存在性

    const detailA = await request(dataApp())
      .get(`/api/projects/${pid}`)
      .set('Authorization', `Bearer ${tokA}`);
    expect(detailA.status).toBe(200);
    expect(detailA.body.project_id).toBe(pid);
  });

  it('无主存量项目：第一个访问的登录用户认领，第二个拿 404', async () => {
    ensureUser({ user_id: 'alice', auth_type: 'wallet' });
    ensureUser({ user_id: 'bob', auth_type: 'wallet' });
    const tokA = issueToken('alice', 'wallet');
    const tokB = issueToken('bob', 'wallet');
    // 存量数据：绕过路由直接建（无归属行）
    const p = createProject({ name: 'legacy' });

    const first = await request(dataApp())
      .get(`/api/projects/${p.project_id}`)
      .set('Authorization', `Bearer ${tokB}`);
    expect(first.status).toBe(200);
    expect(getOwner('project', p.project_id)).toBe('bob'); // 已被认领

    const second = await request(dataApp())
      .get(`/api/projects/${p.project_id}`)
      .set('Authorization', `Bearer ${tokA}`);
    expect(second.status).toBe(404);
  });
});

// ── 5. admin API ────────────────────────────────────────────────────────────

describe('admin API', () => {
  async function makeAdminAndUser(): Promise<{ tokAdmin: string; tokUser: string }> {
    // 首个邮箱用户 → admin；wallet 用户 → 普通 user
    ensureUser({ user_id: 'root@x.com', auth_type: 'email', display_name: 'Root' });
    ensureUser({ user_id: '0xuser', auth_type: 'wallet' });
    return {
      tokAdmin: issueToken('root@x.com', 'email'),
      tokUser: issueToken('0xuser', 'wallet'),
    };
  }

  it('普通用户访问 admin API → 403 FORBIDDEN；未登录 → 401', async () => {
    const { tokUser } = await makeAdminAndUser();
    const forbidden = await request(adminApp())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokUser}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const anon = await request(adminApp()).get('/api/admin/users');
    expect(anon.status).toBe(401);
  });

  it('GET /users：用户列表带 role / disabled / resource_count', async () => {
    const { tokAdmin } = await makeAdminAndUser();
    setOwner('project', 'p1', '0xuser');
    setOwner('project', 'p2', '0xuser');
    const res = await request(adminApp())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokAdmin}`);
    expect(res.status).toBe(200);
    const byId = new Map<string, Record<string, unknown>>(
      res.body.users.map((u: { user_id: string }) => [u.user_id, u]),
    );
    expect(byId.get('root@x.com')?.role).toBe('admin');
    expect(byId.get('0xuser')?.role).toBe('user');
    expect(byId.get('0xuser')?.disabled).toBe(false);
    expect(byId.get('0xuser')?.resource_count).toBe(2);
  });

  it('PATCH：改他人 role/disabled 生效；改自己 → 400；非法 role → 400', async () => {
    const { tokAdmin } = await makeAdminAndUser();

    const self = await request(adminApp())
      .patch('/api/admin/users/root%40x.com')
      .set('Authorization', `Bearer ${tokAdmin}`)
      .send({ role: 'user' });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('SELF_MODIFY_FORBIDDEN');

    const badRole = await request(adminApp())
      .patch('/api/admin/users/0xuser')
      .set('Authorization', `Bearer ${tokAdmin}`)
      .send({ role: 'superuser' });
    expect(badRole.status).toBe(400);
    expect(badRole.body.error.code).toBe('INVALID_ROLE');

    const promoted = await request(adminApp())
      .patch('/api/admin/users/0xuser')
      .set('Authorization', `Bearer ${tokAdmin}`)
      .send({ role: 'admin', disabled: true });
    expect(promoted.status).toBe(200);
    expect(promoted.body.role).toBe('admin');
    expect(promoted.body.disabled).toBe(true);
    expect(getUser('0xuser')?.role).toBe('admin');
    expect(getUser('0xuser')?.disabled).toBe(1);

    const missing = await request(adminApp())
      .patch('/api/admin/users/nobody')
      .set('Authorization', `Bearer ${tokAdmin}`)
      .send({ disabled: true });
    expect(missing.status).toBe(404);
  });

  it('DELETE：删他人清会话与归属行；删自己 → 400', async () => {
    const { tokAdmin, tokUser } = await makeAdminAndUser();
    setOwner('project', 'p1', '0xuser');

    const self = await request(adminApp())
      .delete('/api/admin/users/root%40x.com')
      .set('Authorization', `Bearer ${tokAdmin}`);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('SELF_DELETE_FORBIDDEN');

    const gone = await request(adminApp())
      .delete('/api/admin/users/0xuser')
      .set('Authorization', `Bearer ${tokAdmin}`);
    expect(gone.status).toBe(200);
    expect(gone.body.ok).toBe(true);
    expect(getUser('0xuser')).toBeNull();
    expect(getOwner('project', 'p1')).toBeNull();

    // 被删用户的 token 立即失效：数据面 401
    const res = await request(dataApp())
      .get('/api/projects')
      .set('Authorization', `Bearer ${tokUser}`);
    expect(res.status).toBe(401);
  });

  it('GET /overview：用户数 + 资源数形状正确', async () => {
    const { tokAdmin } = await makeAdminAndUser();
    ensureUser({ user_id: 'guest_1', auth_type: 'guest' });
    ensureUser({ user_id: 'guest_2', auth_type: 'guest' });
    setUserDisabled('guest_2', true);
    setOwner('project', 'p1', '0xuser');
    setOwner('group', 'g1', '0xuser');
    setOwner('group', 'g2', 'guest_1');

    const res = await request(adminApp())
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${tokAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual({
      total: 4,
      admins: 1,
      disabled: 1,
      guests: 2,
    });
    expect(res.body.resources.total).toBe(3);
    expect(res.body.resources.by_type).toEqual({ project: 1, group: 2 });
  });
});

// ── 6. guest 会话隔离 ────────────────────────────────────────────────────────

describe('guest 会话隔离', () => {
  it('每个 guest 会话独立 user_id，互不串数据', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);

    const g1 = await request(app).post('/api/auth/guest');
    const g2 = await request(app).post('/api/auth/guest');
    expect(g1.status).toBe(200);
    expect(g2.status).toBe(200);
    expect(g1.body.user.user_id).toMatch(/^guest_/);
    expect(g2.body.user.user_id).toMatch(/^guest_/);
    expect(g1.body.user.user_id).not.toBe(g2.body.user.user_id);
    expect(g1.body.user.role).toBe('user'); // guest 永远不是 admin

    // 各自的归属行互不可见
    setOwner('project', 'p1', g1.body.user.user_id);
    expect(accessOwner('project', 'p1', { user_id: g2.body.user.user_id, role: 'user' })).toBe(false);
  });
});
