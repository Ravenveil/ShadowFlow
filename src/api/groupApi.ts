/** Groups API client — Story 7.3 (AC3 frontend) / Story 7.4 (AC3 messages) / Story 7.5 (AC4 briefboard). */

import type { Message } from '../common/types/inbox';
import { getApiBase } from './_base';
import { buildByokHeaders } from './chat';
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

/**
 * 2026-05-28 · 列出 workspace 内的群（不带 workspace_id 时返回全部 — 仅供管理/无 scope 场景）。
 *
 * 这里调用方应总是传 currentWorkspaceId（来自 useWorkspaceStore.currentId），
 * 这样 useEffect 把 workspaceId 进依赖列表后，workspace 切换可自动重拉。
 *
 * 后端响应包络: `{ data: GroupRecord[], groups: GroupRecord[], meta: {...} }`
 * （`groups` 是 legacy stub 兼容字段，等价于 `data`）。
 */
export async function listGroups(workspaceId?: string | null): Promise<GroupRecord[]> {
  const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
  const res = await fetch(`${getApiBase()}/api/groups${qs}`);
  await _checkPythonStatus(res);
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({} as { data?: GroupRecord[]; groups?: GroupRecord[] }));
  return (json.data ?? json.groups ?? []) as GroupRecord[];
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
  /** 2026-05-30 — CLI 工作目录(绝对路径)。空串 = 清除(回退默认)。 */
  workspace_dir?: string;
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
  /** 2026-05-30 — CLI 工作目录(绝对路径,群级)。 */
  workspace_dir?: string;
  team_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

/**
 * 2026-05-29 · 单查一个群记录（含 workspace_id / team_id）。
 *
 * 用于 ChatPage：从 URL 的 /chat/:groupId 直达时，即使该群不在当前 team/workspace
 * 的列表里，也能拿到它的归属，从而把左上角「公司(team)」自动切到对应 team。
 * 后端 GET /api/groups/{id} 返回 `{ data: GroupRecord, meta }`；404 时返回 null。
 */
export async function getGroup(groupId: string): Promise<GroupRecord | null> {
  const res = await fetch(`${getApiBase()}/api/groups/${encodeURIComponent(groupId)}`);
  await _checkPythonStatus(res);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json) return null;
  return (json.data ?? json) as GroupRecord;
}

/**
 * 2026-05-29 · 单聊 = conversation 模型（kind='dm'）。点 agent 时 find-or-create
 * 该 agent 的 DM conversation，返回其 group_id。前端拿到后用 group 模式
 * useChatStream 发消息 —— 单聊底层复用群聊整套（持久化 + 回复桥 + SSE 实时回复
 * + 刷新不丢）。DM conversation 不出现在群列表（后端 list 默认排除 kind='dm'）。
 */
export async function resolveDmConversation(
  agentId: string,
  workspaceId?: string | null,
): Promise<string | null> {
  const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
  const res = await fetch(
    `${getApiBase()}/api/chat/dm/${encodeURIComponent(agentId)}/resolve${qs}`,
    { method: 'POST' },
  );
  await _checkPythonStatus(res);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json) return null;
  return (json.data?.group_id ?? json.group_id ?? null) as string | null;
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
    /** 2026-05-29 · ModelPicker 选择。Node 网关（groups-chat.ts）据此用对应
     *  executor（cli:* / byok:*）生成回复。executor 空时网关默认 anthropic-direct。 */
    executor?: string;
    model?: string;
  },
): Promise<Message> {
  const res = await fetch(`${getApiBase()}/api/groups/${groupId}/messages`, {
    method: 'POST',
    // Forward BYOK X-LLM-* headers so the async chat-bridge dispatch can reply
    // with the browser-configured key (not just a server-side env var).
    headers: { 'Content-Type': 'application/json', ...buildByokHeaders() },
    body: JSON.stringify({
      content,
      sender_name: options?.senderName ?? 'user',
      sender_kind: options?.senderKind ?? 'user',
      reply_to: options?.replyTo,
      executor: options?.executor,
      model: options?.model,
    }),
  });
  await _checkPythonStatus(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail));
  }
  return (await res.json()) as Message;
}

// ── Stream M 2026-05-29 · 消息悬浮工具栏「反应」「Pin」接后端 ───────────────
// 后端：POST /api/groups/{gid}/messages/{mid}/reactions  (toggle by user)
//       POST /api/groups/{gid}/messages/{mid}/pin         (toggle / set)

/** Toggle 一个 emoji 反应。返回该消息更新后的完整 reactions map（emoji→user[]）。 */
export async function reactToMessage(
  groupId: string,
  messageId: string,
  emoji: string,
  userId = 'anonymous',
): Promise<Record<string, string[]>> {
  const res = await fetch(
    `${getApiBase()}/api/groups/${groupId}/messages/${messageId}/reactions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, user_id: userId }),
    },
  );
  await _checkPythonStatus(res);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data?.reactions ?? {}) as Record<string, string[]>;
}

/** Pin / unpin 一条消息。pinned 省略 = toggle。返回置顶后的新状态。 */
export async function pinMessage(
  groupId: string,
  messageId: string,
  pinned?: boolean,
): Promise<boolean> {
  const res = await fetch(
    `${getApiBase()}/api/groups/${groupId}/messages/${messageId}/pin`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pinned === undefined ? {} : { pinned }),
    },
  );
  await _checkPythonStatus(res);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Boolean(json.data?.pinned);
}
