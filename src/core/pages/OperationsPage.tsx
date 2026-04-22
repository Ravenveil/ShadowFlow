/**
 * OperationsPage — Story 4.7 fleet-level observability.
 *
 * Renders 4 KPI cards, Agent Health grid, Provider Load panel,
 * Approval Queue strip. Wires the Zustand useOpsStore to poll every 5s.
 */

import { useEffect } from 'react';
import { useOpsStore, OpsWindow } from '../stores/useOpsStore';
import { KPICard } from '../components/Panel/KPICard';
import { AgentHealthGrid } from '../components/Panel/AgentHealthGrid';
import { ProviderLoadPanel } from '../components/Panel/ProviderLoadPanel';
import { ApprovalQueueStrip } from '../components/Panel/ApprovalQueueStrip';

const WINDOWS: OpsWindow[] = ['24h', '7d', '30d', 'all'];

export function OperationsPage({ apiBase = '' }: { apiBase?: string } = {}): JSX.Element {
  const { kpi, agents, providers, approvals, window, setWindow, fetchAll, loading, error } = useOpsStore();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await fetchAll(apiBase);
    };
    run();
    const handle = setInterval(run, 5000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [apiBase, window, fetchAll]);

  return (
    <main data-testid="operations-page" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>
            Operations
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--fg-0)' }}>Fleet Overview</h1>
        </div>
        <select
          data-testid="ops-window-select"
          value={window}
          onChange={(e) => setWindow(e.target.value as OpsWindow)}
          style={{
            padding: '6px 10px',
            background: 'var(--bg-elev-1)',
            color: 'var(--fg-1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {WINDOWS.map((w) => <option key={w} value={w}>{`Last ${w}`}</option>)}
        </select>
      </header>

      {error && (
        <div style={{ padding: 10, background: 'var(--status-reject-tint)', border: '1px solid #EF444455', color: '#FCA5A5', borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KPICard label="Active Runs" value={kpi?.active_runs ?? 0} />
        <KPICard
          label="Pending Approvals"
          value={kpi?.pending_approvals ?? 0}
          valueColor="#F59E0B"
        />
        <KPICard
          label="Avg Provider Latency (p95)"
          value={`${Math.round(kpi?.avg_latency_p95_ms ?? 0)}ms`}
        />
        <KPICard
          label="Policy Rejection Rate"
          value={`${(kpi?.rejection_rate_pct ?? 0).toFixed(1)}%`}
        />
      </div>

      {/* Middle section — Agents + Providers */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <AgentHealthGrid agents={agents} />
        <ProviderLoadPanel providers={providers} />
      </div>

      {/* Bottom approval strip */}
      <ApprovalQueueStrip items={approvals} />

      {loading && (
        <div style={{ fontSize: 11, color: 'var(--fg-5)' }}>loading…</div>
      )}
    </main>
  );
}

export default OperationsPage;
