/** Inbox types for Story 7.2/7.4 — aligns with shadowflow/api/inbox.py Pydantic models. */

export type InboxItemStatus = 'running' | 'blocked' | 'idle' | 'pending_approval';

export interface GroupMetrics {
  activeRuns: number;
  pendingApprovalsCount: number;
  costToday: number;
  members: number;
}

export interface Message {
  sender_name: string;
  sender_kind: string;
  content: string;
  timestamp: string;
}

export interface GroupItem {
  id: string;
  name: string;
  templateId: string;
  status: InboxItemStatus;
  unreadCount: number;
  pendingApprovalsCount: number;
  lastMessage: string;
  lastActivityAt: string;
  metrics?: GroupMetrics;
  /**
   * 2026-05-28 · Stream L · 群公告（PATCH /api/groups/{id} announcement 字段同步）。
   * 老群没有该字段，FE 用 ?? '' 兜底显示 "—"。
   */
  announcement?: string;
  /**
   * 2026-05-28 · Stream L · 群成员 agent 列表（真实成员 != 全 workspace agents）。
   * 后端 record 已有，inbox.py / groups.py list 端点透传。
   */
  agent_ids?: string[];
  /**
   * 2026-05-28 · Stream L · 群创建时间（用于群设置 modal 显示 "启动于 09:14"）。
   * 后端 record.created_at（ISO 字符串），FE 自己 format。
   */
  created_at?: string;
}

export interface AgentDMItem {
  agentId: string;
  agentName: string;
  kind: string;
  status: InboxItemStatus;
  unreadCount: number;
  lastMessage: string;
  lastActivityAt: string;
}

export interface InboxData {
  groups: GroupItem[];
  agent_dms: AgentDMItem[];
}

export interface InboxResponse {
  data: InboxData;
  meta: { trace_id: string; timestamp: string };
}

export interface PendingApproval {
  approval_id: string;
  run_id: string;
  gate_id: string;
  submitter_name: string;
  submitter_kind: string;
  summary: string;
  triggered_at: string;
  waiting_seconds: number;
}
