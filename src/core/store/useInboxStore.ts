/**
 * useInboxStore — Inbox state for Epic 7 (Story 7.2).
 *
 * Isolated from useRunStore. State is driven by:
 *  1. Initial fetch via fetchInbox(templateId)
 *  2. Incremental SSE updates via updateGroupStatus / markRead
 *
 * Never full-re-polls on every SSE event — only targeted mutations.
 */

import { create } from 'zustand';
import type { GroupItem, AgentDMItem, InboxResponse, Message, GroupMetrics } from '../../common/types/inbox';
import { getApiBase } from '../../api/_base';

interface InboxState {
  groups: GroupItem[];
  agentDMs: AgentDMItem[];
  loading: boolean;
  error: string | null;
  currentTemplateId: string | null;
  currentWorkspaceId: string | null;
  selectedGroupId: string | null;
  recentMessages: Record<string, Message[]>;

  fetchInbox: (templateId: string, workspaceId?: string | null) => Promise<void>;
  /**
   * Workspace-driven inbox fetch — for groups created outside any template
   * (e.g. run-session auto-save). Hits `/api/inbox?workspace_id=...` which
   * reads from .shadowflow/groups/*.json directly. See shadowflow/api/inbox.py.
   */
  fetchWorkspaceInbox: (workspaceId: string | null) => Promise<void>;
  updateGroupStatus: (groupId: string, partial: Partial<GroupItem>) => void;
  /**
   * Stream J 2026-05-28 · 群元数据本地乐观更新（name / announcement 等）。
   * 配合 patchGroup() — 不论后端是否上线，FE 都先 flip 本地状态。
   */
  updateGroupMeta: (groupId: string, partial: Partial<GroupItem>) => void;
  updateGroupMetrics: (groupId: string, partial: Partial<GroupMetrics>) => void;
  updateActiveRuns: (groupId: string, delta: number) => void;
  markRead: (groupId: string) => void;
  addGroup: (group: GroupItem) => void;
  selectGroup: (groupId: string | null) => void;
  setRecentMessages: (groupId: string, messages: Message[]) => void;
}

export const useInboxStore = create<InboxState>((set, get) => ({
  groups: [],
  agentDMs: [],
  loading: false,
  error: null,
  currentTemplateId: null,
  currentWorkspaceId: null,
  selectedGroupId: null,
  recentMessages: {},

  fetchInbox: async (templateId: string, workspaceId?: string | null) => {
    const s = get();
    // Re-fetch when template OR workspace changes; skip only if both match and data exists
    if (s.currentTemplateId === templateId && s.currentWorkspaceId === (workspaceId ?? null) && s.groups.length > 0) return;
    set({ loading: true, error: null, currentTemplateId: templateId, currentWorkspaceId: workspaceId ?? null, groups: [], agentDMs: [] });
    try {
      const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`${getApiBase()}/api/templates/${encodeURIComponent(templateId)}/inbox${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: InboxResponse = await res.json();
      set({
        groups: json.data.groups,
        agentDMs: json.data.agent_dms,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  fetchWorkspaceInbox: async (workspaceId: string | null) => {
    const s = get();
    // Treat workspace-mode as templateId=null. Skip refetch if we're already
    // populated for this workspace.
    if (
      s.currentTemplateId === null &&
      s.currentWorkspaceId === (workspaceId ?? null) &&
      s.groups.length > 0
    ) {
      return;
    }
    set({
      loading: true,
      error: null,
      currentTemplateId: null,
      currentWorkspaceId: workspaceId ?? null,
      groups: [],
      agentDMs: [],
    });
    try {
      const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`${getApiBase()}/api/inbox${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: InboxResponse = await res.json();
      set({
        groups: json.data.groups,
        agentDMs: json.data.agent_dms,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  updateGroupStatus: (groupId: string, partial: Partial<GroupItem>) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, ...partial } : g
      ),
    }));
  },

  updateGroupMeta: (groupId: string, partial: Partial<GroupItem>) => {
    // 与 updateGroupStatus 同形态；分开命名是为了让调用方语义清楚：
    // status 走 SSE；meta（name/announcement）走 PATCH。
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, ...partial } : g
      ),
    }));
  },

  updateGroupMetrics: (groupId: string, partial: Partial<GroupMetrics>) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, metrics: { ...(g.metrics ?? { activeRuns: 0, pendingApprovalsCount: 0, costToday: 0, members: 0 }), ...partial } }
          : g
      ),
    }));
  },

  updateActiveRuns: (groupId: string, delta: number) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              metrics: {
                ...(g.metrics ?? { activeRuns: 0, pendingApprovalsCount: 0, costToday: 0, members: 0 }),
                activeRuns: Math.max(0, (g.metrics?.activeRuns ?? 0) + delta),
              },
            }
          : g
      ),
    }));
  },

  markRead: (groupId: string) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, unreadCount: 0 } : g
      ),
    }));
  },

  addGroup: (group: GroupItem) => {
    set((state) => ({ groups: [group, ...state.groups] }));
  },

  selectGroup: (groupId: string | null) => {
    set({ selectedGroupId: groupId });
  },

  setRecentMessages: (groupId: string, messages: Message[]) => {
    set((state) => ({
      recentMessages: { ...state.recentMessages, [groupId]: messages },
    }));
  },
}));
