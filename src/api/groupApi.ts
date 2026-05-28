/** Groups API client — Story 7.3 (AC3 frontend) / Story 7.4 (AC3 messages) / Story 7.5 (AC4 briefboard). */

import type { Message } from '../common/types/inbox';
import { getApiBase } from './_base';
import { markPythonDown, markPythonUp } from '../core/hooks/usePythonBackendStatus';

/**
 * Shared response check — when the Python backend is down, Express's
 * proxy-fallback returns 503 with `{error:{code:'PYTHON_BACKEND_UNAVAILABLE',...}}`.
 * Push that to the global status hook so every banner mount reflects it
 * immediately rather than waiting for the 20s poll.
 */
async function _checkPythonStatus(res: Response): Promise<void> {
  if (res.ok) {
    markPythonUp();
    return;
  }
  if (res.status === 503) {
    try {
      const cloned = res.clone();
      const body = (await cloned.json()) as { error?: { code?: string; message?: string; hint?: string } };
      if (body.error?.code === 'PYTHON_BACKEND_UNAVAILABLE') {
        markPythonDown({
          code: body.error.code,
          message: body.error.message ?? 'Python backend not reachable',
          hint: body.error.hint,
        });
      }
    } catch {
      // body wasn't JSON — leave status unchanged
    }
  }
}

export interface BriefBoardEntry {
  agent_name: string;
  agent_kind: string;
  summary: string;
  timestamp: string;
}

export interface BriefBoardData {
  date: string;
  entries: BriefBoardEntry[];
}

export interface CreateGroupRequest {
  templateId: string;
  groupTemplateId: string;
  name: string;
  agentIds: string[];
  memberEmails: string[];
  policyMatrix: Record<string, unknown>;
  /** Optional — when set, group is tagged to this workspace so it shows up in
   *  /chat for that workspace. Wired in Step 4 of the data-vertical plan. */
  workspaceId?: string;
  /** Optional — link this group to the team it was created alongside.
   *  Lets /teams/:id and /chat/:groupId cross-reference. Wired in Step 4. */
  teamId?: string;
}

export interface GroupCreatedResponse {
  groupId: string;
  name: string;
  templateId: string;
  createdAt: string;
  agents: string[];
}

export async function createGroup(
  data: CreateGroupRequest
): Promise<GroupCreatedResponse> {
  const res = await fetch(`${getApiBase()}/api/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: data.templateId,
      group_template_id: data.groupTemplateId,
      name: data.name,
      agent_ids: data.agentIds,
      member_emails: data.memberEmails,
      policy_matrix: data.policyMatrix,
      workspace_id: data.workspaceId,
      team_id: data.teamId,
    }),
  });

  await _checkPythonStatus(res);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(
      typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
    );
  }

  const json = await res.json();
  return {
    groupId: json.group_id,
    name: json.name,
    templateId: json.template_id,
    createdAt: json.created_at,
    agents: json.agents,
  };
}

export async function fetchBriefBoard(
  groupId: string,
  date: string
): Promise<BriefBoardData> {
  const res = await fetch(`${getApiBase()}/api/groups/${groupId}/briefboard?date=${date}`);
  if (!res.ok) return { date, entries: [] };
  const json = await res.json();
  return json.data as BriefBoardData;
}

export async function fetchRecentMessages(
  groupId: string,
  limit = 3
): Promise<Message[]> {
  const res = await fetch(`${getApiBase()}/api/groups/${groupId}/messages?limit=${limit}`);
  await _checkPythonStatus(res);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.messages ?? []) as Message[];
}

/**
 * Append a user message to a group's persistent message log.
 *
 * Hits POST /api/groups/{groupId}/messages on the Python backend (added in
 * Step 4 of the data-vertical plan). This is what makes chat persistence
 * actually work: previously useChatStream POSTed to /api/chat/sessions/...
 * which had no backend, so messages vanished on refresh.
 */
/**
 * Stream J 2026-05-28 · 群元数据 PATCH 客户端。
 *
 * 配合 Stream K 即将加的 `PATCH /api/groups/{groupId}` 后端 endpoint。
 * 在 Stream K 上线前请求会 404，调用方应 try/catch 容错（保留本地乐观更新）。
 */
export interface PatchGroupRequest {
  name?: string;
  announcement?: string;
}

/**
 * Stream J · 后端返回结构（与 shadowflow/api/groups.py 的 GroupRecord 对齐）。
 * 字段宽松：只列我们 FE 当前会用到的，其他字段透传。
 */
export interface GroupRecord {
  group_id: string;
  name: string;
  announcement?: string;
  agent_ids?: string[];
  workspace_id?: string;
  team_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export async function patchGroup(
  groupId: string,
  body: PatchGroupRequest,
): Promise<GroupRecord> {
  const res = await fetch(
    `${getApiBase()}/api/groups/${encodeURIComponent(groupId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  await _checkPythonStatus(res);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  // backend envelope: { data: GroupRecord, meta: {...} }；也兼容裸返回
  return (json.data ?? json) as GroupRecord;
}

export async function postGroupMessage(
  groupId: string,
  content: string,
  options?: {
    senderName?: string;
    senderKind?: 'user' | 'agent' | 'system';
    /** Stream H 2026-05-28 · 接住 Stream G 后端已加的 reply_to 持久化字段。
     *  传 messageId（被引用的消息 id）即可让后端把这条标记为 thread 子消息。 */
    replyTo?: string;
  },
): Promise<Message> {
  const res = await fetch(`${getApiBase()}/api/groups/${groupId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      sender_name: options?.senderName ?? 'user',
      sender_kind: options?.senderKind ?? 'user',
      reply_to: options?.replyTo,
    }),
  });
  await _checkPythonStatus(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail));
  }
  return (await res.json()) as Message;
}
