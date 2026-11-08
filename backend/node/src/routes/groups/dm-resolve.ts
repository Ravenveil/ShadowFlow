/**
 * routes/groups/dm-resolve.ts — DM resolve 归属感知编排（登录信息隔离）。
 *
 * 修的问题（2026-11-08「消息发不出来了」）：旧 find-or-create 只按
 * (workspace, kind='dm', 单成员=agent) 匹配，**不看归属**——身份切换后，前端
 * 点「董事长」会拿到旧身份创建的总经理会话，随即被 /api/groups 归属守卫 404
 * （Group '<id>' not found），时间线/发消息全线挂掉。
 *
 * 目标语义（每个登录身份有自己的 DM）：
 *   1. 本人已有 DM     → 直接返回（同身份幂等）
 *   2. 无主 DM（存量）  → 认领（先到先得）后返回
 *   3. 都没有          → 新建并记归属
 *   绝不返回属于他人身份的会话。
 *
 * 后端双形态：
 *   - SF_GROUPS_BACKEND='node'：store 直查直建（resolveOwnedNode）。
 *   - 默认 python：list 候选 + 排除法调 Python find-or-create（exclude_group_ids
 *     由 groups.py 消费），保留秘书问候播种/补种（resolveOwnedPython）。
 * 无 req.user（测试直挂等旧用法）或 admin（全量可见）→ 回退历史行为。
 *
 * 挂载（index.ts）：`app.post('/api/chat/dm/:agent_id/resolve', handleDmResolveOwned)`
 * 于 attachUser/requireAuth 之后、proxyFallback 之前（python 模式内部自行调
 * Python，不经 proxyFallback；无 req.user 的旧用法 next() 落给 proxyFallback）。
 */

import type { NextFunction, Request, Response } from 'express';
import { getReqUser, type AuthedUser } from '../../middleware/auth-context';
import { resolveOwner, setOwner } from '../../storage/resource-owners';
import { PYTHON_BACKEND_URL } from '../../python-backend';
import * as store from '../../storage/groups-store';
import { handleDmResolve as legacyNodeDmResolve } from './groups-node';

function isNodeGroupsBackend(): boolean {
  return process.env.SF_GROUPS_BACKEND === 'node';
}

function normUser(userId: string): string {
  return userId.toLowerCase();
}

interface DmResolveBody {
  group_id: string;
  agent_id: string;
  created: boolean;
}

// ── python 后端：list 候选 + 排除法 find-or-create ────────────────────────────

interface PythonCallResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** 调 Python resolve（带 exclude_group_ids）；网络/HTTP 结果原样带回由调用方裁决。 */
async function pythonResolve(
  agentId: string,
  workspaceId: string | null,
  exclude: string[],
): Promise<PythonCallResult> {
  const params = new URLSearchParams();
  if (workspaceId) params.set('workspace_id', workspaceId);
  for (const gid of exclude) params.append('exclude_group_ids', gid);
  const qs = params.toString();
  const url = `${PYTHON_BACKEND_URL}/api/chat/dm/${encodeURIComponent(agentId)}/resolve${qs ? `?${qs}` : ''}`;
  const up = await fetch(url, { method: 'POST' });
  const text = await up.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 原样透传 */
  }
  return { ok: up.ok, status: up.status, body };
}

/**
 * 列出该 agent 的 DM 候选（保持 Python find 顺序 = 磁盘文件名序）。
 * 拿不到列表 → 返回 []（fail-open：退化为「全排除 → Python 新建」，可用性优先；
 * 最外层重试环兜住竞态，正确性不受损）。
 */
async function pythonDmCandidates(agentId: string, workspaceId: string | null): Promise<string[]> {
  const params = new URLSearchParams();
  if (workspaceId) params.set('workspace_id', workspaceId);
  params.set('kind', 'dm');
  params.set('include_archived', 'true');
  const up = await fetch(`${PYTHON_BACKEND_URL}/api/groups?${params.toString()}`);
  if (!up.ok) return [];
  const body = (await up.json().catch(() => null)) as {
    data?: Array<{ group_id?: unknown; agent_ids?: unknown }>;
  } | null;
  const records = Array.isArray(body?.data) ? body.data : [];
  const out: string[] = [];
  for (const r of records) {
    const ids = r.agent_ids;
    if (Array.isArray(ids) && ids.length === 1 && ids[0] === agentId && typeof r.group_id === 'string' && r.group_id) {
      out.push(r.group_id);
    }
  }
  return out;
}

async function resolveOwnedPython(req: Request, res: Response, user: AuthedUser): Promise<void> {
  const agentId = req.params.agent_id;
  const workspaceId = typeof req.query.workspace_id === 'string' ? req.query.workspace_id : null;
  const me = normUser(user.user_id);

  const candidates = await pythonDmCandidates(agentId, workspaceId);

  // 选目标：优先本人已有 → 认领无主（先到先得）。目标已归属本人，后面只可能
  // 拿到它或新建会话。
  let preferred: string | null = null;
  preferred = candidates.find((gid) => resolveOwner('group', gid) === me) ?? null;
  if (!preferred) {
    for (const gid of candidates) {
      if (resolveOwner('group', gid) === null && setOwner('group', gid, user.user_id) === me) {
        preferred = gid;
        break;
      }
    }
  }

  // 排除法：把 Python find-or-create 限制在目标上；全排除 = 新建。
  const excluded = new Set<string>(candidates.filter((gid) => gid !== preferred));

  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await pythonResolve(agentId, workspaceId, [...excluded]);
    if (!r.ok) {
      res.status(r.status).json(r.body as Parameters<Response['json']>[0]);
      return;
    }
    const data = r.body as DmResolveBody;
    const gid = data.group_id;
    if (gid === preferred) {
      res.json(data);
      return;
    }
    if (data.created) {
      // Python 新建的会话必然是给当前身份用的（目标已失效/被并发改掉的兜底）。
      setOwner('group', gid, user.user_id);
      res.json(data);
      return;
    }
    const owner = resolveOwner('group', gid);
    if (owner === me) {
      res.json(data);
      return;
    }
    if (preferred === null && owner === null && setOwner('group', gid, user.user_id) === me) {
      res.json(data);
      return;
    }
    excluded.add(gid); // 竟是别人的/认领被抢 → 排除后重试
  }

  // 竞态极端兜底：目标已归属本人，直接返回它（后端曾短暂不可用时最坏也只是
  // 少了问候补种）。
  if (preferred) {
    res.json({ group_id: preferred, agent_id: agentId, created: false } satisfies DmResolveBody);
    return;
  }
  res.status(503).json({
    error: {
      code: 'DM_RESOLVE_CONFLICT',
      message: 'DM resolve could not settle on an owned conversation',
    },
  });
}

// ── node 后端：store 直查直建 ─────────────────────────────────────────────────

function resolveOwnedNode(req: Request, res: Response, user: AuthedUser): void {
  const agentId = req.params.agent_id;
  const workspaceId = typeof req.query.workspace_id === 'string' ? req.query.workspace_id : null;
  const me = normUser(user.user_id);
  const respond = (gid: string, created: boolean): void => {
    res.json({ group_id: gid, agent_id: agentId, created } satisfies DmResolveBody);
  };

  // 与 legacy handleDmResolve 同一候选口径（含 archived，DM 不该因归档重复创建）。
  const candidates = store
    .listGroups({ workspace_id: workspaceId, kinds: ['dm'], include_archived: true })
    .filter((r) => r.agent_ids.length === 1 && r.agent_ids[0] === agentId);

  const mine = candidates.find((r) => resolveOwner('group', r.group_id) === me);
  if (mine) {
    respond(mine.group_id, false);
    return;
  }
  for (const rec of candidates) {
    if (resolveOwner('group', rec.group_id) === null && setOwner('group', rec.group_id, user.user_id) === me) {
      respond(rec.group_id, false);
      return;
    }
  }
  // 不经 store.resolveDmGroup：它的 find 会把别人的 DM 递回来。直接新建。
  const created = store.createGroup({
    name: agentId,
    agent_ids: [agentId],
    workspace_id: workspaceId,
    kind: 'dm',
  });
  setOwner('group', created.group_id, user.user_id);
  respond(created.group_id, true);
}

// ── 入口 ─────────────────────────────────────────────────────────────────────

export function handleDmResolveOwned(req: Request, res: Response, next: NextFunction): void {
  const user = getReqUser(req);
  if (!user || user.role === 'admin') {
    // 无鉴权上下文（测试直挂等旧用法）或 admin（全量可见）→ 历史 find-or-create。
    if (isNodeGroupsBackend()) {
      legacyNodeDmResolve(req, res);
      return;
    }
    next(); // python 模式 → proxyFallback 原样转 Python
    return;
  }
  if (isNodeGroupsBackend()) {
    resolveOwnedNode(req, res, user);
    return;
  }
  void resolveOwnedPython(req, res, user).catch((err: unknown) => {
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          code: 'PYTHON_BACKEND_UNAVAILABLE',
          message: `Python backend ${PYTHON_BACKEND_URL} is not reachable: ${(err as Error).message}`,
        },
      });
    }
  });
}

export default handleDmResolveOwned;
