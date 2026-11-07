/**
 * middleware/auth-context.ts — 登录会话 → req.user 的鉴权上下文（登录信息隔离批）。
 *
 * 三个中间件 + 两个工具：
 *   attachUser   —（可选鉴权）解析 `Authorization: Bearer <token>`（或 SSE 的
 *                  `?access_token=` / `?token=` 查询参数）→ storage/auth 的
 *                  session → storage/users 的用户行 → 挂 req.user。不拦截请求。
 *   requireAuth  — 无 req.user → 401 { error: { code: 'UNAUTHORIZED', ... } }；
 *                  被禁用用户（users.disabled=1）→ 403 USER_DISABLED。
 *   requireAdmin — requireAuth + role!=='admin' → 403 FORBIDDEN。
 *   getReqUser   — handler 里安全取 req.user（兼容测试直挂路由、无中间件的旧
 *                  用法：返回 null 时调用方跳过归属逻辑，行为与改造前一致）。
 *   ownerGuard   — router.param 级归属守卫（见 middleware 用法注释）。
 *
 * 挂载（index.ts）：数据路由（/api/groups、/api/projects、/api/conversations、
 * /api/run-sessions、/api/runs 及子路径）+ /api/admin 之前 attachUser；
 * 公共接口（/health、/api/auth/*、/api/settings、/api/skills、/api/connectors
 * 等）不挂，保持匿名可用。
 *
 * SSE 注意：浏览器 EventSource 无法带 Authorization 头，attachUser 同时接受
 * `?access_token=<token>` / `?token=<token>` 查询参数（仅用于 GET 流式端点）。
 */

import crypto from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getSessionByTokenHash } from '../storage/auth';
import { ensureUser, type AuthType, type UserRole, type UserRow } from '../storage/users';
import { accessOwner, type ResourceType } from '../storage/resource-owners';

export interface AuthedUser {
  user_id: string;
  auth_type: AuthType;
  role: UserRole;
  disabled: boolean;
  email: string | null;
  display_name: string | null;
}

// express.Request 的类型增强 —— attachUser 挂载后所有 handler 都能看到 req.user。
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthedUser;
  }
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** 提取 Bearer token：Authorization 头优先，SSE 场景回退 ?access_token= / ?token=。 */
export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const q = req.query as Record<string, unknown>;
  const fromQuery =
    (typeof q.access_token === 'string' && q.access_token) ||
    (typeof q.token === 'string' && q.token) ||
    null;
  return fromQuery || null;
}

function toAuthedUser(row: UserRow): AuthedUser {
  return {
    user_id: row.user_id,
    auth_type: row.auth_type,
    role: row.role,
    disabled: !!row.disabled,
    email: row.email,
    display_name: row.display_name,
  };
}

/**
 * session → 用户行（users 表 upsert 同步）。session.address 就是 user_id
 * （guest 会话是独立 `guest_<hex>`；旧数据里 address='guest' 的共享一个用户行，
 * 无害）。返回 null 表示 session 有效但用户行拿不到（DB 异常）——按匿名处理。
 */
export function userFromSession(session: {
  address: string;
  auth_type: 'wallet' | 'guest' | 'email';
}): AuthedUser | null {
  try {
    const row = ensureUser({
      user_id: session.address,
      auth_type: session.auth_type,
      email: session.auth_type === 'email' ? session.address : null,
    });
    return toAuthedUser(row);
  } catch (err) {
    console.warn('[auth-context] ensureUser failed:', err);
    return null;
  }
}

/** （可选鉴权）解析 token → req.user。无 token / 无效 token 都不拦截。 */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  try {
    const raw = extractBearerToken(req);
    if (raw) {
      const session = getSessionByTokenHash(sha256(raw));
      if (session) {
        const user = userFromSession(session);
        if (user) req.user = user;
      }
    }
  } catch (err) {
    console.warn('[auth-context] attachUser failed:', err);
  }
  next();
}

export function sendUnauthorized(res: Response, message = 'Authorization: Bearer <token> required'): void {
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
}

export function sendNotFound(res: Response, message = 'Not found'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

/** 数据路由必须登录。无效/缺失 token 一律 401（含过期、已登出、伪造）。 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    sendUnauthorized(res);
    return;
  }
  if (user.disabled) {
    res.status(403).json({ error: { code: 'USER_DISABLED', message: 'Account disabled' } });
    return;
  }
  next();
}

/** 管理接口：admin 专属。 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    sendUnauthorized(res);
    return;
  }
  if (req.user.disabled) {
    res.status(403).json({ error: { code: 'USER_DISABLED', message: 'Account disabled' } });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'admin only' } });
    return;
  }
  next();
}

/**
 * handler 内取当前登录用户。返回 null = 无鉴权上下文（测试直挂路由等旧用法），
 * 调用方跳过归属过滤/校验即可保持历史行为。
 */
export function getReqUser(req: Request): AuthedUser | null {
  return req.user ?? null;
}

/**
 * ownerGuard — router.param 级归属守卫：
 *   router.param('id', ownerGuard('run_session', 'id'));
 * 对声明了该 param 的所有路由生效。无 req.user（旧测试直挂）→ 直接过；
 * 非本人且非 admin → 404（统一不泄露存在性）。无主资源在访问时认领。
 */
export function ownerGuard(type: ResourceType, param: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getReqUser(req);
    const id = req.params[param];
    if (!user || !id) {
      next();
      return;
    }
    if (!accessOwner(type, id, user)) {
      sendNotFound(res);
      return;
    }
    next();
  };
}
