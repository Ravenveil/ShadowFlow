/**
 * storage/users.ts — 真实用户表（登录信息隔离批）。
 *
 * users 表是「谁在用」的唯一真源：注册 / 登录 / 游客签发会话时同步 upsert。
 * user_id 用 address/邮箱做自然主键（与 auth_sessions.address 一一对应）：
 *   - wallet → 钱包地址（小写）
 *   - email  → 邮箱（小写）
 *   - guest  → `guest_<hex>`（每个 guest 会话独立 user_id，互不串数据）
 *
 * 角色引导（admin bootstrap，两行规则）：
 *   1. 首个注册的**邮箱用户**自动成为 admin（users 表里还没有 auth_type='email'
 *      的行时插入的那一个）；
 *   2. 环境变量 SF_ADMIN_EMAIL 指定的邮箱在注册时直接成为 admin。
 * 两种都只在**插入时**判定——之后改 role 只能走 /api/admin/users/:id。
 */

import { getDb } from './sqlite';

export type AuthType = 'wallet' | 'guest' | 'email';
export type UserRole = 'user' | 'admin';

export interface UserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  auth_type: AuthType;
  role: UserRole;
  disabled: number; // 0/1
  created_at: string;
  updated_at: string;
}

export interface EnsureUserInput {
  user_id: string;
  auth_type: AuthType;
  email?: string | null;
  display_name?: string | null;
}

function toUserRow(r: UserRow): UserRow {
  return { ...r, disabled: r.disabled ? 1 : 0 };
}

/**
 * 新用户的初始角色。仅在 INSERT 时调用（见文件头引导规则注释）。
 */
function bootstrapRole(authType: AuthType, userId: string): UserRole {
  if (authType !== 'email') return 'user';
  const adminEmail = (process.env.SF_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (adminEmail && userId === adminEmail) return 'admin';
  try {
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM users WHERE auth_type = 'email'`)
      .get() as { n: number };
    // 首个注册的邮箱用户 → admin。
    if (row.n === 0) return 'admin';
  } catch {
    /* 计数失败不阻断注册 — 按普通用户处理 */
  }
  return 'user';
}

/**
 * ensureUser — 登录/签发会话时同步用户表（幂等 upsert）。
 * 已存在的行只刷新 display_name（非空时）与 updated_at；role/disabled 只在
 * 首次插入时按 bootstrapRole 设定，之后只允许 admin API 修改。
 */
export function ensureUser(input: EnsureUserInput): UserRow {
  const db = getDb();
  const now = new Date().toISOString();
  const userId = input.user_id.toLowerCase();
  const existing = getUser(userId);
  if (existing) {
    if (input.display_name && input.display_name !== existing.display_name) {
      db.prepare(`UPDATE users SET display_name = ?, updated_at = ? WHERE user_id = ?`)
        .run(input.display_name, now, userId);
      return { ...existing, display_name: input.display_name, updated_at: now };
    }
    return existing;
  }
  const role = bootstrapRole(input.auth_type, userId);
  db.prepare(
    `INSERT INTO users (user_id, email, display_name, auth_type, role, disabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    userId,
    input.email ? input.email.toLowerCase() : input.auth_type === 'email' ? userId : null,
    input.display_name ?? null,
    input.auth_type,
    role,
    now,
    now,
  );
  return {
    user_id: userId,
    email: input.email ? input.email.toLowerCase() : input.auth_type === 'email' ? userId : null,
    display_name: input.display_name ?? null,
    auth_type: input.auth_type,
    role,
    disabled: 0,
    created_at: now,
    updated_at: now,
  };
}

export function getUser(userId: string): UserRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM users WHERE user_id = ?`)
    .get(userId.toLowerCase()) as UserRow | undefined;
  return row ? toUserRow(row) : null;
}

export function listUsers(): UserRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM users ORDER BY created_at ASC`)
    .all() as UserRow[];
  return rows.map(toUserRow);
}

export function countUsers(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number };
  return row.n;
}

/** setUserRole — admin API 专用。返回更新后的行；用户不存在 → null。 */
export function setUserRole(userId: string, role: UserRole): UserRow | null {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(`UPDATE users SET role = ?, updated_at = ? WHERE user_id = ?`)
    .run(role, now, userId.toLowerCase());
  if (info.changes === 0) return null;
  return getUser(userId);
}

/** setUserDisabled — disabled=1 的用户会话保留但数据面 403。 */
export function setUserDisabled(userId: string, disabled: boolean): UserRow | null {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(`UPDATE users SET disabled = ?, updated_at = ? WHERE user_id = ?`)
    .run(disabled ? 1 : 0, now, userId.toLowerCase());
  if (info.changes === 0) return null;
  return getUser(userId);
}

/**
 * deleteUserDeep — admin 删除用户：users 行 + 全部会话（token 立即失效）+
 * 邮箱口令账号 / 钱包 profile + 资源归属行（其资源变为 unowned，可被认领）。
 * 返回是否真的删掉了 users 行。
 */
export function deleteUserDeep(userId: string): boolean {
  const db = getDb();
  const id = userId.toLowerCase();
  const info = db.prepare(`DELETE FROM users WHERE user_id = ?`).run(id);
  db.prepare(`DELETE FROM auth_sessions WHERE address = ?`).run(id);
  db.prepare(`DELETE FROM auth_email_users WHERE email = ?`).run(id);
  db.prepare(`DELETE FROM auth_profiles WHERE address = ?`).run(id);
  db.prepare(`DELETE FROM resource_owners WHERE owner_user_id = ?`).run(id);
  return info.changes > 0;
}
