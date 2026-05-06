/**
 * usePolicyObsStore — Story 4.9. Read-only store for PolicyObservabilityPage.
 * Deliberately decoupled from usePolicyStore (editor-side).
 */
import { create } from 'zustand';

export interface ObsSummary {
  total_rejections: number;
  total_runs: number;
  rejection_rate_pct: number;
  top_policy: { name: string; count: number };
  top_stage: { name: string; count: number };
  recovered_rate_pct: number;
  median_loops: number;
}

export interface HeatmapRow {
  policy: string;
  counts: Record<string, number>;
}

export interface RejectExample {
  run_id: string;
  stage: string;
  timestamp: string | null;
  reason: string;
  outcome: 'retry_ok' | 'aborted' | 'pending';
}

export interface PolicyStats {
  summary: ObsSummary;
  heatmap: HeatmapRow[];
  examples: Record<string, RejectExample[]>;
}

export type ObsWindow = '24h' | '7d' | '30d' | 'all';

interface ObsState {
  summary: ObsSummary | null;
  heatmap: HeatmapRow[];
  examples: Record<string, RejectExample[]>;
  window: ObsWindow;
  selected_policy: string | null;
  loading: boolean;
  error: string | null;
  setWindow: (w: ObsWindow) => void;
  selectPolicy: (name: string | null) => void;
  fetchStats: (apiBase?: string) => Promise<void>;
}

export const usePolicyObsStore = create<ObsState>()((set, get) => ({
  summary: null,
  heatmap: [],
  examples: {},
  window: '7d',
  selected_policy: null,
  loading: false,
  error: null,

  setWindow: (w) => set({ window: w }),
  selectPolicy: (name) => set({ selected_policy: name }),

  fetchStats: async (apiBase = '') => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${apiBase}/policy/stats?window=${get().window}`);
      // P17 (review Chunk B): check .ok — 500 (e.g. cachetools missing) would otherwise
      // parse the error body and overwrite the heatmap with garbage.
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json() as Record<string, unknown>;
      const stats = json?.data as PolicyStats | null ?? null;
      set({
        summary: stats?.summary ?? null,
        heatmap: stats?.heatmap ?? [],
        examples: stats?.examples ?? {},
        loading: false,
      });
    } catch (exc: unknown) {
      set({ loading: false, error: String(exc) });
    }
  },
}));
