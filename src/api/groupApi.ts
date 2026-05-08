/** Groups API client — Story 7.3 (AC3 frontend) / Story 7.4 (AC3 messages) / Story 7.5 (AC4 briefboard). */

import type { Message } from '../common/types/inbox';
import { getApiBase } from './_base';

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
    }),
  });

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
  if (!res.ok) return [];
  const json = await res.json();
  return (json.messages ?? []) as Message[];
}
