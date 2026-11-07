/**
 * conversations.ts — GAP A3 回写（2026-08-23）— Node 侧 /api/conversations 客户端。
 *
 * 「移入项目」写通路：PATCH /api/conversations/by-group/:gid，按 B1 互链
 * group_id 定位会话（群/DM 尚无 conversation 行时后端 find-or-create 落目标
 * 项目）；project_id 传 null = 移回默认项目。响应为会话 record（snake_case
 * 直透，与 server storage record 一致）。
 */
import { getApiBase, authHeaders } from './_base';

export interface ConversationRecord {
  conversation_id: string;
  project_id: string;
  title: string | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function moveGroupConversationToProject(
  groupId: string,
  projectId: string | null,
): Promise<ConversationRecord> {
  const res = await fetch(
    `${getApiBase()}/api/conversations/by-group/${encodeURIComponent(groupId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ project_id: projectId }),
    },
  );
  if (!res.ok) throw new Error(`moveGroupConversationToProject: ${res.status}`);
  return res.json();
}
