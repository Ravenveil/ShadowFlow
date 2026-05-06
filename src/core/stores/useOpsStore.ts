/**
 * useOpsStore — Operations Overview (Story 4.7) state.
 *
 * Isolated from useRunStore. Fetches 4 aggregated endpoints, with a simple
 * 5s polling helper.
 */

import { create } from 'zustand';

export interface OpsKPI {
  active_runs: number;
  pending_approvals: number;
  avg_latency_p95_ms: number;
  rejection_rate_pct: number;
  deltas?: Record<string, { value: string; driver?: string }>;
}

export interface AgentHealth {
  agent_id: string;
  name: string;
  kind: 'acp' | 'cli' | 'mcp' | 'local';
  model: string;
  status: 'online' | 'degraded' | 'offline';
  queue_depth: number;
  p95_ms: number;
  trend_14pt: number[];
}

export interface ProviderLoad {
  provider_id: string;
  name: string;
  model_count: number;
  p95_ms: number;
  tee_verified: boolean;
  load_pct: number;
  fallback_priority: number;
}

export interface PendingApproval {
  run_id: string;
  template: string;
  sender: string;
  receiver: string;
  policy_name: string;
  field: string;
  waiting_seconds: number;
  assignee: string;
}

export type OpsWindow = '24h' | '7d' | '30d' | 'all';

interface OpsState {
  kpi: OpsKPI | null;
  agents: AgentHealth[];
  providers: ProviderLoad[];
  approvals: PendingApproval[];
  window: OpsWindow;
  loading: boolean;
  error: string | null;
  setWindow: (w: OpsWindow) => void;
  fetchAll: (apiBase?: string) => Promise<void>;
}

export const useOpsStore = create<OpsState>()((set, get) => ({
  kpi: null,
  agents: [],
  providers: [],
  approvals: [],
  window: '24h',
  loading: false,
  error: null,

  setWindow: (w) => set({ window: w }),

  fetchAll: async (apiBase = '') => {
    set({ loading: true, error: null });
    try {
      const w = get().window;
      // P11 (review Chunk B): check .ok before parsing — 4xx/5xx would otherwise
      // silently parse the error body and overwrite store with garbage.
      async function fetchJson(url: string): Promise<unknown> {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
        return r.json();
      }
      const [kpiRes, agentsRes, providersRes, approvalsRes] = await Promise.all([
        fetchJson(`${apiBase}/ops/kpi?window=${w}`),
        fetchJson(`${apiBase}/agents/health`),
        fetchJson(`${apiBase}/providers/load`),
        fetchJson(`${apiBase}/approvals/pending`),
      ]);
      set({
        kpi: (kpiRes as Record<string, unknown>)?.data as OpsKPI ?? kpiRes as OpsKPI ?? null,
        agents: agentsRes as AgentHealth[] ?? [],
        providers: providersRes as ProviderLoad[] ?? [],
        approvals: approvalsRes as PendingApproval[] ?? [],
        loading: false,
      });
    } catch (exc: unknown) {
      set({ loading: false, error: String(exc) });
    }
  },
}));
