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
