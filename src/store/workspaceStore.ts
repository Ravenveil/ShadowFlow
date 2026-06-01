/**
 * Workspace Zustand Store — Story 12.4
 *
 * Persists the current workspace ID in localStorage (key: sf-workspace).
 * Workspace list is fetched from the API and kept in memory.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listWorkspaces, WorkspaceSummary } from '../api/workspaces';

/**
 * 当前选中的 team。用户语义上 workspace=team 是一回事，但数据模型里 1 个
 * workspace 可含多个 team。选中一个 team 后，chat 只显示该 team 的会话 + agent。
 * agent_ids 一并存下来，刷新后无需重新 fetch 即可立即过滤。
 */
export interface CurrentTeam {
  team_id: string;
  name: string;
  agent_ids: string[];
}

interface WorkspaceState {
  workspaces: WorkspaceSummary[];
  currentId: string | null;
  /** null = 未选中任何 team（chat 显示当前 workspace 全部会话）。 */
  currentTeam: CurrentTeam | null;
  loading: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<void>;
  /** Switch into a workspace, or pass null to return to the ShadowFlow root
   *  (no workspace selected → no agents shown; agents live inside workspaces). */
  switchTo: (id: string | null) => void;
  setCurrentTeam: (team: CurrentTeam | null) => void;
  setWorkspaces: (ws: WorkspaceSummary[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentId: null,
      currentTeam: null,
      loading: false,
      error: null,

      fetchWorkspaces: async () => {
        set({ loading: true, error: null });
        try {
          const ws = await listWorkspaces();
          const current = get().currentId;
          // Keep currentId if still valid; otherwise fall back to the ShadowFlow
          // ROOT (null), NOT the first workspace. Root = no workspace selected =
          // no agents shown (取消默认工作区设计). The user explicitly enters a
          // workspace via the switcher; agents only exist inside workspaces.
          const validCurrent =
            current && ws.find((w) => w.workspace_id === current) ? current : null;
          set({ workspaces: ws, currentId: validCurrent, loading: false });
        } catch (err) {
          set({
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load workspaces',
          });
        }
      },

      switchTo: (id: string | null) => {
        // 切到不同 workspace（或回到 root=null）时清空当前 team —— team 属于旧
        // workspace，留着会让 chat 用错 workspace 的 agent_ids 过滤。同 workspace 不清。
        set((s) => (id === s.currentId ? { currentId: id } : { currentId: id, currentTeam: null }));
      },

      setCurrentTeam: (team: CurrentTeam | null) => {
        set({ currentTeam: team });
      },

      setWorkspaces: (ws: WorkspaceSummary[]) => {
        set({ workspaces: ws });
      },
    }),
    {
      name: 'sf-workspace',
      // Persist currentId + currentTeam so the team filter survives reload
      // without a re-fetch. Workspace list itself is always re-fetched.
      partialize: (s) => ({ currentId: s.currentId, currentTeam: s.currentTeam }),
    },
  ),
);

/** Convenience selector: returns the current workspace object or null */
export const selectCurrentWorkspace = (state: WorkspaceState) =>
  state.workspaces.find((w) => w.workspace_id === state.currentId) ?? null;
