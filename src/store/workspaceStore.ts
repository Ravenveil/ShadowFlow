/**
 * Workspace Zustand Store — Story 12.4
 *
 * Persists the current workspace ID in localStorage (key: sf-workspace).
 * Workspace list is fetched from the API and kept in memory.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listWorkspaces, WorkspaceSummary } from '../api/workspaces';

interface WorkspaceState {
  workspaces: WorkspaceSummary[];
  currentId: string | null;
  loading: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<void>;
  switchTo: (id: string) => void;
  setWorkspaces: (ws: WorkspaceSummary[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentId: null,
      loading: false,
      error: null,

      fetchWorkspaces: async () => {
        set({ loading: true, error: null });
        try {
          const ws = await listWorkspaces();
          const current = get().currentId;
          // Keep currentId if still valid, otherwise fall back to first workspace
          const validCurrent =
            current && ws.find((w) => w.workspace_id === current)
              ? current
              : (ws[0]?.workspace_id ?? null);
          set({ workspaces: ws, currentId: validCurrent, loading: false });
        } catch (err) {
          set({
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load workspaces',
          });
        }
      },

      switchTo: (id: string) => {
        set({ currentId: id });
      },

      setWorkspaces: (ws: WorkspaceSummary[]) => {
        set({ workspaces: ws });
      },
    }),
    {
      name: 'sf-workspace',
      // Only persist currentId — workspace list is always re-fetched from API
      partialize: (s) => ({ currentId: s.currentId }),
    },
  ),
);

/** Convenience selector: returns the current workspace object or null */
export const selectCurrentWorkspace = (state: WorkspaceState) =>
  state.workspaces.find((w) => w.workspace_id === state.currentId) ?? null;
