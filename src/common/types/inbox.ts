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
  /** 2026-05-29 · Stream M — 稳定消息 id + 反应/置顶（消息工具栏接后端）。 */
  message_id?: string;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
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
  /**
   * 2026-11-06 · 侧栏一次成型批（additive）：成员头像快照随 inbox 一次带回，
   * 群头像拼贴首帧即可渲染，不再等 /api/agents 二次到达。老数据缺失 = 前端
   * 回落 agent_ids join 本地 agents 列表（零破坏）。
   */
  members?: Array<{
    agent_id: string;
    name: string;
    avatar_style?: string | null;
    avatar_seed?: string | null;
    avatar_image?: string | null;
    avatar_color?: string | null;
  }>;
}

export interface AgentDMItem {
  agentId: string;
  agentName: string;
  kind: string;
  status: InboxItemStatus;
  unreadCount: number;
  lastMessage: string;
  lastActivityAt: string;
  /** 2026-08-19 — DM 底层单成员 group 的 id；有值即可一步跳 /group/:id 会话页。 */
  group_id?: string | null;
  /** 2026-11-06 · 侧栏一次成型批（additive）：头像四件套随 inbox 带回。 */
  avatar_style?: string | null;
  avatar_seed?: string | null;
  avatar_image?: string | null;
  avatar_color?: string | null;
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
