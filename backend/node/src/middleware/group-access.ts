/**
 * middleware/group-access.ts — /api/groups 的归属守卫 + 列表过滤 + 建群归属捕获。
 *
 * 为什么在这里：群数据有双后端（SF_GROUPS_BACKEND=node 走 Node SQLite store，
 * 默认/python 走 proxyFallback 转 Python JSON 存储），但**所有** /api/groups
 * 流量都过 Node 网关——归属校验统一做在网关一层，两种后端零分叉。归属真源是
 * storage/resource-owners（Python 侧存储的资源同样生效）。
 *
 * 三件事（挂载在 groupsChatRouter 之前，index.ts）：
 *   1. /:id/** 归属校验 —— 非本人且非 admin → 404（不泄露存在性）；无主资源
 *      访问时认领（存量策略，见 resource-owners.ts 文件头）。
 *   2. GET /api/groups（列表）—— 按归属过滤（admin 全量）。node 模式拦截
 *      res.json 过滤；python 模式由本中间件直接代收代发（proxy 是裸流管道，
 *      改不了响应体），响应信封原样透传，仅裁剪条目。
 *   3. POST /api/groups（建群）—— 从响应里捕获 group_id 写入归属（create 时
 *      写入；python 后端建的群同样记在 Node 的 resource_owners）。
 *
 * 旧用法兼容：无 req.user（测试直挂路由）→ 原样放行，行为与改造前一致。
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { PYTHON_BACKEND_URL } from '../python-backend';
import { getReqUser, sendNotFound } from './auth-context';
import { accessOwner, setOwner, type OwnerUser } from '../storage/resource-owners';

/** 归属捕获：响应体带 group_id（建群 / DM resolve）→ 记录归属。 */
export function captureGroupOwner(body: unknown, user: OwnerUser): void {
  if (body && typeof body === 'object') {
    const gid = (body as { group_id?: unknown }).group_id;
    if (typeof gid === 'string' && gid) {
      try {
        setOwner('group', gid, user.user_id);
      } catch (err) {
        console.warn('[group-access] setOwner failed:', err);
      }
    }
  }
}

function filterGroupArray(arr: unknown[], user: OwnerUser): unknown[] {
  return arr.filter((g) => {
    if (!g || typeof g !== 'object') return true;
    const gid = (g as { group_id?: unknown }).group_id;
    if (typeof gid !== 'string' || !gid) return true;
    try {
      return accessOwner('group', gid, user);
    } catch {
      return true; // 归属表不可用时不过滤（fail-open，保持可用性）
    }
  });
}

/** 列表态响应体按归属裁剪（兼容 {data,groups,meta} 双形态信封与裸数组）。 */
export function filterGroupListBody(body: unknown, user: OwnerUser): unknown {
  if (Array.isArray(body)) return filterGroupArray(body, user);
  if (body && typeof body === 'object') {
    const obj = body as { data?: unknown; groups?: unknown; meta?: { count?: number } };
    let dataLen: number | null = null;
    const data = obj.data;
    if (Array.isArray(data)) {
      const filtered = filterGroupArray(data, user);
      obj.data = filtered;
      dataLen = filtered.length;
    }
    const groups = obj.groups;
    if (Array.isArray(groups)) {
      const filtered = filterGroupArray(groups, user);
      obj.groups = filtered;
      if (dataLen === null) dataLen = filtered.length;
    }
    if (dataLen !== null && obj.meta && typeof obj.meta === 'object') {
      obj.meta.count = dataLen;
    }
  }
  return body;
}

function isNodeGroupsBackend(): boolean {
  return process.env.SF_GROUPS_BACKEND === 'node';
}

/** node 模式：包一层 res.json —— 列表过滤 / 建群归属捕获（响应由 Node 路由产出）。 */
function wrapResJson(
  res: Response,
  user: OwnerUser,
  opts: { filterList?: boolean; captureOwner?: boolean },
): void {
  const orig = res.json.bind(res);
  (res as { json: Response['json'] }).json = ((body: unknown) => {
    let out = body;
    if (opts.filterList) out = filterGroupListBody(out, user);
    if (opts.captureOwner) captureGroupOwner(out, user);
    return orig(out as Parameters<Response['json']>[0]);
  }) as Response['json'];
}

/**
 * python 模式：代收代发 GET / 列表与 POST / 建群（proxyFallback 是裸流管道，
 * 无法改响应体）。其余方法/路径仍走 proxyFallback。响应信封原样透传。
 */
async function proxyGroupRoot(
  req: Request,
  res: Response,
  user: OwnerUser,
): Promise<void> {
  const qsIndex = req.url.indexOf('?');
  const query = qsIndex >= 0 ? req.url.slice(qsIndex) : '';
  const target = `${PYTHON_BACKEND_URL}/api/groups${query}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const init: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      signal: ac.signal,
    };
    if (req.method === 'POST') {
      init.body = JSON.stringify(req.body ?? {});
    }
    const up = await fetch(target, init);
    const raw = await up.text();
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      /* 非 JSON 原样透传 */
    }
    if (req.method === 'GET' && up.ok) {
      body = filterGroupListBody(body, user);
    } else if (req.method === 'POST' && up.ok) {
      captureGroupOwner(body, user);
    }
    res.status(up.status).json(body as Parameters<Response['json']>[0]);
  } catch (err) {
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          code: 'PYTHON_BACKEND_UNAVAILABLE',
          message: `Python backend ${PYTHON_BACKEND_URL} is not reachable: ${(err as Error).message}`,
        },
      });
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * groupAccessGuard — 挂在 /api/groups（attachUser + requireAuth 之后、
 * groupsChatRouter 之前）。DM resolve（/api/chat/dm/:agent_id/resolve）只用
 * captureGroupOwnerMiddleware 记归属（见 index.ts）。
 */
export function groupAccessGuard(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getReqUser(req);
    if (!user) {
      next();
      return;
    }
    const path = req.path; // 相对 /api/groups 挂载点
    const isRoot = path === '/' || path === '';

    if (isRoot) {
      if (isNodeGroupsBackend()) {
        // GET → 列表过滤；POST → 建群归属捕获（响应由 groupsNodeRouter 产出）。
        wrapResJson(res, user, {
          filterList: req.method === 'GET',
          captureOwner: req.method === 'POST',
        });
        next();
        return;
      }
      if (req.method === 'GET' || req.method === 'POST') {
        void proxyGroupRoot(req, res, user);
        return;
      }
      next();
      return;
    }

    // /:id/** —— 归属校验（消息/timeline/SSE/审批/停止/CRUD 全覆盖）。
    const seg = path.split('/').filter(Boolean)[0] ?? '';
    const groupId = decodeURIComponent(seg);
    if (groupId) {
      let ok = false;
      try {
        ok = accessOwner('group', groupId, user);
      } catch (err) {
        console.warn('[group-access] accessOwner failed:', err);
        ok = true; // fail-open
      }
      if (!ok) {
        sendNotFound(res, `Group '${groupId}' not found`);
        return;
      }
    }
    next();
  };
}

/** 建群归属捕获薄中间件（DM resolve 等非 /api/groups 挂载点复用）。 */
export function captureGroupOwnerMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getReqUser(req);
    if (user) wrapResJson(res, user, { captureOwner: true });
    next();
  };
}
