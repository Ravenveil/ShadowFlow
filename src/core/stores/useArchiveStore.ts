/**
 * useArchiveStore — Story 4.8.
 * Isolated from useRunStore; drives ArchivePage data.
 *
 * P12 (review Chunk B): added .ok checks to all fetch calls.
 * P13 (review Chunk B): renamed store field `window` → `timeWindow` to avoid
 *   shadowing the browser global `window` object in destructuring scope.
 */
import { create } from 'zustand';

export interface ArchiveRun {
  run_id: string;
  workflow_id: string;
  template: string;
  intent: string;
  status: string;
  duration_ms: number | null;
  tokens_in: number;
  tokens_out: number;
  completed_at: string | null;
  badges: { rejections: number; approvals: number; aborted: boolean };
}

export type ArchiveWindow = '24h' | '7d' | '30d' | 'all';

interface ArchiveState {
  runs: ArchiveRun[];
  cursor: string | null;
  selected_run_id: string | null;
  trajectory: unknown | null;
  loading: boolean;
  error: string | null;
  search: string;
  /** P13: renamed from `window` to avoid shadowing browser global `window`. */
  timeWindow: ArchiveWindow;
  setSearch: (s: string) => void;
  setWindow: (w: ArchiveWindow) => void;
  fetchRuns: (apiBase?: string) => Promise<void>;
  loadMore: (apiBase?: string) => Promise<void>;
  selectRun: (id: string) => void;
  fetchTrajectory: (id: string, apiBase?: string) => Promise<void>;
}

async function checkedJson(res: Response): Promise<unknown> {
  // P12: throw on HTTP error so the catch branch handles it properly
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const useArchiveStore = create<ArchiveState>()((set, get) => ({
  runs: [],
  cursor: null,
  selected_run_id: null,
  trajectory: null,
  loading: false,
  error: null,
  search: '',
  timeWindow: 'all',

  setSearch: (s) => set({ search: s }),
  setWindow: (w) => set({ timeWindow: w }),

  fetchRuns: async (apiBase = '') => {
    set({ loading: true, error: null });
    try {
      const { search, timeWindow } = get();
      const res = await fetch(
        `${apiBase}/archive/runs?search=${encodeURIComponent(search)}&window=${timeWindow}&limit=30`,
      );
      const json = await checkedJson(res) as Record<string, unknown>;
      const data = json?.data as Record<string, unknown> | undefined;
      set({
        runs: (data?.runs as ArchiveRun[]) ?? [],
        cursor: (data?.next_cursor as string | null) ?? null,
        loading: false,
      });
    } catch (exc: unknown) {
      set({ loading: false, error: String(exc) });
    }
  },

  loadMore: async (apiBase = '') => {
    const { cursor, search, timeWindow, runs } = get();
    if (!cursor) return;
    set({ loading: true });
    try {
      const res = await fetch(
        `${apiBase}/archive/runs?search=${encodeURIComponent(search)}&window=${timeWindow}&after_cursor=${cursor}&limit=30`,
      );
      const json = await checkedJson(res) as Record<string, unknown>;
      const data = json?.data as Record<string, unknown> | undefined;
      set({
        runs: [...runs, ...((data?.runs as ArchiveRun[]) ?? [])],
        cursor: (data?.next_cursor as string | null) ?? null,
        loading: false,
      });
    } catch (exc: unknown) {
      set({ loading: false, error: String(exc) });
    }
  },

  selectRun: (id) => set({ selected_run_id: id, trajectory: null }),

  fetchTrajectory: async (id, apiBase = '') => {
    try {
      const res = await fetch(`${apiBase}/workflow/runs/${id}?format=trajectory`);
      const json = await checkedJson(res) as Record<string, unknown>;
      set({ trajectory: json?.data ?? null });
    } catch (exc: unknown) {
      set({ error: String(exc) });
    }
  },
}));
