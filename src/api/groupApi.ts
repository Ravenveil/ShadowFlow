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
export async function postGroupMessage(
  groupId: string,
  content: string,
  options?: { senderName?: string; senderKind?: 'user' | 'agent' | 'system' },
): Promise<Message> {
  const res = await fetch(`${getApiBase()}/api/groups/${groupId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      sender_name: options?.senderName ?? 'user',
      sender_kind: options?.senderKind ?? 'user',
    }),
  });
  await _checkPythonStatus(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail));
  }
  return (await res.json()) as Message;
}
