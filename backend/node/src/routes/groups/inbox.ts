/**
 * routes/groups/inbox.ts — 单后端迁移：workspace-driven inbox（Story 7.2 AC5 移植）
 *
 * 移植自 python shadowflow/api/groups/inbox.py 的 GET /api/inbox：
 *   GET /api/inbox?workspace_id=…
 *     - groups：listGroups（默认 kind='group'，排除 archived）→ 蛇形 GroupItem
 *     - agent_dms：该 workspace 的 agents + 最新 DM 会话的 name/group_id 回填
 *     - members/avatar 四件套随行带回（2026-11-06 侧栏一次成型批）
 *
 * 数据源：sqlite（storage/groups-store.ts + storage/agents.ts）——与 /api/groups
 * 的 Node 路由同源，Python 只读自己的 JSON 侧。数据源不同 → 按挂载裁决仅在
 * groupsBackendEnv()==='node' 时挂载（SF_BACKEND_MODE=single 强制 node）。
 *
 * 与 Python 的差异（裁决）：
 *   - Python 的 agent 库是 .shadowflow/agents/*.json；Node 的 Quick Hire 落库在
 *     sqlite（storage/agents.ts）。inbox 聚合读 sqlite 版 + JSON 版并集（去重），
 *     保证 legacy 期间 Python 写的 agent 在 single 下仍可见。
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import * as store from '../../storage/groups-store';
import { listAgents } from '../../storage/agents';
import { repoDataFile } from '../../storage/repo-root';

const router = Router();

type Obj = Record<string, unknown>;

const INBOX_STATUSES = new Set(['running', 'blocked', 'idle', 'pending_approval']);

interface AgentLite {
  agent_id: string;
  name: string;
  soul: string;
  workspace_id: string | null;
  status: string;
  source: string;
  created_at: string;
  avatar_style: string | null;
  avatar_seed: string | null;
  avatar_image: string | null;
  avatar_color: string | null;
}

function readJson(file: string): Obj | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Obj;
  } catch {
    return null;
  }
}

/** JSON agent 库（.shadowflow/agents/*.json，Python 写的）→ AgentLite。 */
function listJsonAgents(workspaceId: string | null): AgentLite[] {
  const dir = repoDataFile('agents');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: AgentLite[] = [];
  for (const name of entries.filter((f) => f.endsWith('.json')).sort()) {
    const rec = readJson(path.join(dir, name));
    if (!rec) continue;
    const ws = typeof rec['workspace_id'] === 'string' ? rec['workspace_id'] : null;
    if (workspaceId !== null && ws !== workspaceId) continue;
    const id = typeof rec['agent_id'] === 'string' && rec['agent_id'] ? rec['agent_id'] : name.slice(0, -'.json'.length);
    if (!id) continue;
    out.push({
      agent_id: id,
      name: typeof rec['name'] === 'string' ? rec['name'] : id,
      soul: typeof rec['soul'] === 'string' ? rec['soul'] : '',
      workspace_id: ws,
      status: typeof rec['status'] === 'string' ? rec['status'] : 'idle',
      source: typeof rec['source'] === 'string' ? rec['source'] : 'local',
      created_at: typeof rec['created_at'] === 'string' ? rec['created_at'] : '',
      avatar_style: typeof rec['avatar_style'] === 'string' ? rec['avatar_style'] : null,
      avatar_seed: typeof rec['avatar_seed'] === 'string' ? rec['avatar_seed'] : null,
      avatar_image: typeof rec['avatar_image'] === 'string' ? rec['avatar_image'] : null,
      avatar_color: typeof rec['avatar_color'] === 'string' ? rec['avatar_color'] : null,
    });
  }
  return out;
}

/** 全量 agent（JSON 库 + sqlite 库并集，agent_id 去重；sqlite 后到先得覆盖）。 */
function listAllAgentsMerged(workspaceId: string | null): AgentLite[] {
  const byId = new Map<string, AgentLite>();
  for (const a of listJsonAgents(workspaceId)) byId.set(a.agent_id, a);
  try {
    for (const a of listAgents(workspaceId ?? undefined)) {
      const soul = a.soul ?? '';
      const blueprint = (a.blueprint ?? {}) as Obj;
      byId.set(a.agent_id, {
        agent_id: a.agent_id,
        name: a.name || a.agent_id,
        soul,
        workspace_id: a.workspace_id ?? null,
        status: a.status ?? 'idle',
        source: a.source ?? 'local',
        created_at: a.created_at ?? '',
        avatar_style:
          typeof blueprint['avatar_style'] === 'string' ? blueprint['avatar_style'] : null,
        avatar_seed:
          typeof blueprint['avatar_seed'] === 'string' ? blueprint['avatar_seed'] : null,
        avatar_image:
          typeof blueprint['avatar_image'] === 'string' ? blueprint['avatar_image'] : null,
        avatar_color:
          typeof blueprint['avatar_color'] === 'string' ? blueprint['avatar_color'] : null,
      });
    }
  } catch {
    /* sqlite 不可用（测试环境未 init）→ 只用 JSON 库 */
  }
  return Array.from(byId.values());
}

function memberSnapshot(a: AgentLite | undefined, agentId: string): Obj {
  return {
    agent_id: agentId,
    name: a?.name ?? '',
    avatar_style: a?.avatar_style ?? null,
    avatar_seed: a?.avatar_seed ?? null,
    avatar_image: a?.avatar_image ?? null,
    avatar_color: a?.avatar_color ?? null,
  };
}

function inboxHandler(req: Request, res: Response): void {
  const workspaceId =
    typeof req.query.workspace_id === 'string' && req.query.workspace_id
      ? req.query.workspace_id
      : null;
  const traceId = randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();

  // agent 快照索引先行（groups members 与 agent_dms 头像共用）
  const agentsById = new Map<string, AgentLite>();
  for (const a of listAllAgentsMerged(workspaceId)) agentsById.set(a.agent_id, a);

  // ── groups（默认 kind='group'，排除 archived —— Python list_groups 同口径）──
  const groups: Obj[] = [];
  for (const rec of store.listGroups({ workspace_id: workspaceId, kinds: ['group'] })) {
    try {
      const messages = rec.messages ?? [];
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      const lastActivity =
        (lastMsg?.timestamp as string | undefined) || rec.created_at || now;
      const lastMessagePreview = lastMsg ? String(lastMsg.content ?? '').slice(0, 140) : '';
      const agentIds = Array.isArray(rec.agent_ids) ? rec.agent_ids : [];
      groups.push({
        id: rec.group_id,
        name: rec.name ?? '',
        templateId: rec.template_id ?? '',
        status: 'idle',
        unreadCount: 0,
        pendingApprovalsCount: 0,
        lastMessage: lastMessagePreview,
        lastActivityAt: lastActivity,
        metrics: {
          members: agentIds.length,
          activeRuns: 0,
          pendingApprovalsCount: 0,
          costToday: 0,
        },
        announcement: rec.announcement ?? null,
        agent_ids: agentIds,
        created_at: rec.created_at ?? null,
        members: agentIds.map((aid: string) => memberSnapshot(agentsById.get(aid), aid)),
      });
    } catch {
      continue; // 单条坏记录跳过，不 500 整列表（Python 同款防御）
    }
  }

  // ── agent_dms（workspace agents + 最新 DM 会话 name/group_id 回填）─────────
  const dmNameByAgent = new Map<string, string>();
  const dmGroupIdByAgent = new Map<string, string>();
  const dmLastActivity = new Map<string, string>();
  const dmLastMessage = new Map<string, string>();
  try {
    for (const dm of store.listGroups({
      workspace_id: workspaceId,
      kinds: ['dm'],
      include_archived: true, // DM 不因 archived 丢改名（Python 同款）
    })) {
      const ids = Array.isArray(dm.agent_ids) ? dm.agent_ids : [];
      if (ids.length !== 1) continue;
      const aid = ids[0];
      const recTs = dm.updated_at ?? dm.created_at ?? '';
      const prevTs = dmLastActivity.get(aid) ?? '';
      if (!dmNameByAgent.has(aid) || recTs > (dm.created_at ?? '')) {
        dmNameByAgent.set(aid, dm.name ?? '');
        dmGroupIdByAgent.set(aid, dm.group_id);
        const msgs = dm.messages ?? [];
        const lastDmMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        dmLastActivity.set(
          aid,
          (lastDmMsg?.timestamp as string | undefined) || dm.created_at || now,
        );
        dmLastMessage.set(
          aid,
          lastDmMsg ? String(lastDmMsg.content ?? '').slice(0, 140) : '',
        );
      }
      void prevTs;
    }
  } catch {
    /* DM 查询失败不阻塞 agent 列表 */
  }

  const agentDms: Obj[] = [];
  for (const a of agentsById.values()) {
    const displayName = dmNameByAgent.get(a.agent_id) || a.name || a.agent_id || 'Agent';
    agentDms.push({
      agentId: a.agent_id,
      agentName: displayName,
      kind: a.source || 'local',
      status: INBOX_STATUSES.has(a.status) ? a.status : 'idle',
      unreadCount: 0,
      lastMessage: dmLastMessage.get(a.agent_id) || (a.soul || '').slice(0, 140),
      lastActivityAt: dmLastActivity.get(a.agent_id) || a.created_at || now,
      group_id: dmGroupIdByAgent.get(a.agent_id) ?? null,
      avatar_style: a.avatar_style,
      avatar_seed: a.avatar_seed,
      avatar_image: a.avatar_image,
      avatar_color: a.avatar_color,
    });
  }

  res.json({
    data: { groups, agent_dms: agentDms },
    meta: { trace_id: traceId, timestamp: now, source: 'workspace-groups' },
  });
}

router.get('/inbox', inboxHandler);

export default router;
