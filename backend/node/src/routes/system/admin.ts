/**
 * routes/system/admin.ts — 管理员账户权限（登录信息隔离批）。
 *
 *   GET    /api/admin/users        — 用户列表（role/disabled/资源计数）
 *   PATCH  /api/admin/users/:id    — { role?, disabled? } 改角色 / 停用启用
 *   DELETE /api/admin/users/:id    — 删用户（会话/口令账号/资源归属一并清理）
 *   GET    /api/admin/overview     — 用户数 / 资源数总览
 *
 * 挂载（index.ts）：app.use('/api/admin', attachUser, requireAdmin, adminRouter)
 * —— 非 admin 一律 403 FORBIDDEN，未登录 401 UNAUTHORIZED。
 * :id 是 user_id（邮箱/钱包地址，URL 编码后放在路径里）。
 *
 * 防锁死：不允许修改/删除自己（role / disabled / delete 都拒绝，400）——
 * 避免唯一 admin 把自己降级/停用后无人可管。
 *
 * admin 引导策略（见 storage/users.ts bootstrapRole）：
 *   1. 首个注册的邮箱用户自动成为 admin；
 *   2. 环境变量 SF_ADMIN_EMAIL 指定的邮箱注册时直接成为 admin。
 */

import { Router, type Request, type Response } from 'express';
import {
  deleteUserDeep,
  getUser,
  listUsers,
  setUserDisabled,
  setUserRole,
  type UserRow,
  type UserRole,
} from '../../storage/users';
import {
  countResourcesByOwner,
  countResourcesByType,
} from '../../storage/resource-owners';

const router = Router();

interface AdminUserView {
  user_id: string;
  email: string | null;
  display_name: string | null;
  auth_type: string;
  role: string;
  disabled: boolean;
  created_at: string;
  updated_at: string;
  resource_count: number;
}

function toView(row: UserRow, counts: Record<string, number>): AdminUserView {
  return {
    user_id: row.user_id,
    email: row.email,
    display_name: row.display_name,
    auth_type: row.auth_type,
    role: row.role,
    disabled: !!row.disabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resource_count: counts[row.user_id] ?? 0,
  };
}

// ── GET /api/admin/users ─────────────────────────────────────────────────────

router.get('/users', (_req: Request, res: Response) => {
  const counts = countResourcesByOwner();
  res.json({ users: listUsers().map((u) => toView(u, counts)) });
});

// ── PATCH /api/admin/users/:id { role?, disabled? } ──────────────────────────

router.patch('/users/:id', (req: Request, res: Response) => {
  const targetId = decodeURIComponent(req.params.id).toLowerCase();
  const self = req.user?.user_id?.toLowerCase();
  if (self && targetId === self) {
    res.status(400).json({
      error: { code: 'SELF_MODIFY_FORBIDDEN', message: 'cannot modify your own admin account here' },
    });
    return;
  }
  const existing = getUser(targetId);
  if (!existing) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'user not found' } });
    return;
  }
  const body = (req.body ?? {}) as { role?: unknown; disabled?: unknown };
  let updated: UserRow | null = existing;
  if (body.role !== undefined) {
    if (body.role !== 'user' && body.role !== 'admin') {
      res.status(400).json({
        error: { code: 'INVALID_ROLE', message: "role must be 'user' or 'admin'" },
      });
      return;
    }
    updated = setUserRole(targetId, body.role as UserRole);
  }
  if (body.disabled !== undefined) {
    updated = setUserDisabled(targetId, !!body.disabled);
  }
  if (!updated) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'user not found' } });
    return;
  }
  res.json(toView(updated, countResourcesByOwner()));
});

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────
// 清理范围：users 行 + auth_sessions（token 全部失效）+ auth_email_users /
// auth_profiles + resource_owners 归属行（其资源变 unowned，可被认领）。

router.delete('/users/:id', (req: Request, res: Response) => {
  const targetId = decodeURIComponent(req.params.id).toLowerCase();
  const self = req.user?.user_id?.toLowerCase();
  if (self && targetId === self) {
    res.status(400).json({
      error: { code: 'SELF_DELETE_FORBIDDEN', message: 'cannot delete your own admin account' },
    });
    return;
  }
  const ok = deleteUserDeep(targetId);
  if (!ok) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'user not found' } });
    return;
  }
  res.json({ ok: true, deleted: targetId });
});

// ── GET /api/admin/overview ──────────────────────────────────────────────────

router.get('/overview', (_req: Request, res: Response) => {
  const users = listUsers();
  const byType = countResourcesByType();
  res.json({
    users: {
      total: users.length,
      admins: users.filter((u) => u.role === 'admin').length,
      disabled: users.filter((u) => !!u.disabled).length,
      guests: users.filter((u) => u.auth_type === 'guest').length,
    },
    resources: {
      total: Object.values(byType).reduce((a, b) => a + b, 0),
      by_type: byType,
    },
  });
});

export default router;
