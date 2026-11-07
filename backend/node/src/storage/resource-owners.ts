/**
 * storage/resource-owners.ts — 统一资源归属映射（登录信息隔离批）。
 *
 * 一张表管所有数据归属：resource_owners(resource_type, resource_id → owner_user_id)。
 * 不给业务表加列，因此对 Python JSON 存储的资源（SF_GROUPS_BACKEND=python 的群）
 * 同样生效——归属真源只在这一张表，校验全部发生在 Node 网关的鉴权中间件/路由层。
 *
 * 资源类型（resource_type）：
 *   'group' | 'project' | 'conversation' | 'run' | 'run_session'
 * 消息不单独记归属：group_messages 挂群、messages 挂 conversation，随父资源校验。
 *
 * 归属解析（resolveOwner）两级：
 *   1. 直接行（resource_owners）；
 *   2. 派生兜底（老数据/内部创建的资源没有直接行时沿关系链向上找）：
 *      - conversation → conversations.group_id → 群主；→ project_id → 项目主
 *      - run_session  → run_index.conversation_id → 会话归属链
 *      - run          → runs.session_id / conversation_id / project_id 归属链
 *
 * 认领策略（存量无主资源）：第一个访问（含列表）的登录用户认领（claim），
 * 写入直接行；admin 始终可见全部。非本人访问 → 由路由层统一回 404（不泄露
 * 存在性）。claim 用 INSERT OR IGNORE，先到先得，并发安全。
 */

import { getDb } from './sqlite';

export type ResourceType = 'group' | 'project' | 'conversation' | 'run' | 'run_session';

export interface OwnerRow {
  resource_type: ResourceType;
  resource_id: string;
  owner_user_id: string;
  created_at: string;
}

/** 鉴权上下文里只需要这两个字段（middleware/auth-context 的 AuthedUser 超集）。 */
export interface OwnerUser {
  user_id: string;
  role: string;
}

function normUser(userId: string): string {
  return userId.toLowerCase();
}

/**
 * setOwner — 写入归属（幂等：已有行不覆盖，先到先得）。返回最终归属人。
 * 「create 时写入」与「存量认领」共用这一入口。
 */
export function setOwner(
  type: ResourceType,
  id: string,
  userId: string,
): string {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO resource_owners (resource_type, resource_id, owner_user_id, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(type, id, normUser(userId), new Date().toISOString());
  return getOwner(type, id) ?? normUser(userId);
}

/** getOwner — 只读直接行（不派生、不认领）。 */
export function getOwner(type: ResourceType, id: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT owner_user_id FROM resource_owners WHERE resource_type = ? AND resource_id = ?`,
    )
    .get(type, id) as { owner_user_id: string } | undefined;
  return row ? row.owner_user_id : null;
}

function conversationParents(conversationId: string): { group_id: string | null; project_id: string | null } | null {
  const row = getDb()
    .prepare(`SELECT group_id, project_id FROM conversations WHERE conversation_id = ?`)
    .get(conversationId) as { group_id: string | null; project_id: string | null } | undefined;
  return row ?? null;
}

/**
 * resolveOwner — 直接行 → 派生兜底（关系链向上）。只读；不认领。
 */
export function resolveOwner(type: ResourceType, id: string): string | null {
  const direct = getOwner(type, id);
  if (direct) return direct;

  const db = getDb();
  if (type === 'conversation') {
    const conv = conversationParents(id);
    if (conv?.group_id) {
      const g = getOwner('group', conv.group_id);
      if (g) return g;
    }
    if (conv?.project_id) {
      const p = getOwner('project', conv.project_id);
      if (p) return p;
    }
    return null;
  }

  if (type === 'run_session') {
    const idx = db
      .prepare(`SELECT conversation_id FROM run_index WHERE session_id = ?`)
      .get(id) as { conversation_id: string | null } | undefined;
    if (idx?.conversation_id) {
      return resolveOwner('conversation', idx.conversation_id);
    }
    return null;
  }

  if (type === 'run') {
    const run = db
      .prepare(
        `SELECT session_id, conversation_id, project_id FROM runs WHERE run_id = ?`,
      )
      .get(id) as
      | { session_id: string | null; conversation_id: string | null; project_id: string | null }
      | undefined;
    if (run?.conversation_id) {
      const c = resolveOwner('conversation', run.conversation_id);
      if (c) return c;
    }
    if (run?.session_id) {
      const s = resolveOwner('run_session', run.session_id);
      if (s) return s;
    }
    if (run?.project_id) {
      const p = getOwner('project', run.project_id);
      if (p) return p;
    }
    return null;
  }

  return null;
}

/**
 * accessOwner — 访问控制判定（admin 放行 / 本人放行 / 无主认领 / 他人拒绝）。
 * 无主资源在**访问时**认领给当前登录用户（存量数据策略，见文件头）。
 */
export function accessOwner(type: ResourceType, id: string, user: OwnerUser): boolean {
  if (user.role === 'admin') return true;
  const me = normUser(user.user_id);
  const owner = resolveOwner(type, id);
  if (owner === me) return true;
  if (owner !== null) return false;
  // 无主 → 认领（INSERT OR IGNORE 先到先得；被并发抢先则按最终行判定）。
  return setOwner(type, id, me) === me;
}

/**
 * accessAny — 多类型联合判定（run 路由的 :runId 既可能是 run_id 也可能是
 * session_id）。任一类型解析到本人 → 放行；解析到他人 → 拒绝；全部无主 →
 * 以第一个类型认领。
 */
export function accessAny(types: ResourceType[], id: string, user: OwnerUser): boolean {
  if (user.role === 'admin') return true;
  const me = normUser(user.user_id);
  for (const t of types) {
    const owner = resolveOwner(t, id);
    if (owner === me) return true;
    if (owner !== null) return false; // 明确属于别人 — 不因兄弟类型无主而放行
  }
  return setOwner(types[0], id, me) === me;
}

/**
 * filterOwned — 列表过滤（admin 全量；其他人只留自己的）。无主行按认领策略
 * 归第一个看到它的登录用户。items 为纯 id 数组时用 mapId 之外的快捷重载。
 */
export function filterOwned<T>(
  type: ResourceType,
  items: T[],
  idOf: (item: T) => string,
  user: OwnerUser,
): T[] {
  if (user.role === 'admin') return items;
  return items.filter((it) => accessOwner(type, idOf(it), user));
}

// ── admin 统计 / 清理 ────────────────────────────────────────────────────────

/** 按归属人统计资源数（admin 用户列表的 resource_count）。 */
export function countResourcesByOwner(): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT owner_user_id, COUNT(*) AS n FROM resource_owners GROUP BY owner_user_id`,
    )
    .all() as Array<{ owner_user_id: string; n: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.owner_user_id] = r.n;
  return out;
}

/** 按资源类型统计（admin overview）。 */
export function countResourcesByType(): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT resource_type, COUNT(*) AS n FROM resource_owners GROUP BY resource_type`,
    )
    .all() as Array<{ resource_type: string; n: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.resource_type] = r.n;
  return out;
}

/** 删掉某用户的全部归属行（admin 删除用户时清理）。返回删除行数。 */
export function removeOwnersForUser(userId: string): number {
  const info = getDb()
    .prepare(`DELETE FROM resource_owners WHERE owner_user_id = ?`)
    .run(normUser(userId));
  return info.changes;
}

/** 删单条归属（资源本体被删除时顺手清理；幂等）。 */
export function removeOwner(type: ResourceType, id: string): void {
  getDb()
    .prepare(`DELETE FROM resource_owners WHERE resource_type = ? AND resource_id = ?`)
    .run(type, id);
}
