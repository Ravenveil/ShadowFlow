/**
 * PolicyObservabilityPage — Story 4.9.
 */
import { useEffect, useMemo } from 'react';
import { usePolicyObsStore, ObsWindow } from '../stores/usePolicyObsStore';
import { KPICard } from '../components/Panel/KPICard';
import { PolicyHeatmap } from '../components/Panel/PolicyHeatmap';
import { STAGE_ORDER } from '../../common/types/stage';

const WINDOWS: ObsWindow[] = ['24h', '7d', '30d', 'all'];

function buildCsv(rows: { policy: string; counts: Record<string, number> }[], window: string): string {
  const header = ['policy_name', ...STAGE_ORDER, 'total', 'window', 'timestamp'].join(',');
  const now = new Date().toISOString();
  const lines = rows.map((r) => {
    const totals = STAGE_ORDER.reduce((acc, s) => acc + (r.counts[s] ?? 0), 0);
    return [r.policy, ...STAGE_ORDER.map((s) => r.counts[s] ?? 0), totals, window, now].join(',');
  });
  return [header, ...lines].join('\n');
}

export function PolicyObservabilityPage({ apiBase = '' }: { apiBase?: string } = {}): JSX.Element {
  const { summary, heatmap, examples, window, selected_policy, fetchStats, setWindow, selectPolicy } = usePolicyObsStore();

  useEffect(() => {
    fetchStats(apiBase);
  }, [apiBase, window, fetchStats]);

  const exampleList = useMemo(
    () => (selected_policy ? examples[selected_policy] ?? [] : []),
    [selected_policy, examples],
  );

  const onDownloadCsv = () => {
    const csv = buildCsv(heatmap, window);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `policy-stats-${window}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main data-testid="policy-obs-page" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>
            Policy Observability
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Rejection patterns &amp; triggers</h1>
        </div>
        <select
          data-testid="obs-window"
          value={window}
          onChange={(e) => setWindow(e.target.value as ObsWindow)}
          style={{ padding: '6px 10px', background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg-1)', fontSize: 12 }}
        >
          {WINDOWS.map((w) => <option key={w} value={w}>{`Last ${w}`}</option>)}
        </select>
        <button
          type="button"
          data-testid="edit-matrix-btn"
          onClick={() => { window === 'all' ? void 0 : void 0; location.assign(`/editor?panel=policy${selected_policy ? `&highlight=${selected_policy}` : ''}`); }}
          style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg-2)', cursor: 'pointer' }}
        >
          Edit matrix →
        </button>
        <button
          type="button"
          data-testid="download-csv-btn"
          onClick={onDownloadCsv}
          style={{ padding: '6px 12px', fontSize: 12, background: 'var(--accent)', border: '1px solid transparent', borderRadius: 8, color: '#fff', cursor: 'pointer' }}
        >
          Download CSV
        </button>
      </header>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KPICard label="总驳回" value={summary?.total_rejections ?? 0} delta={`${(summary?.rejection_rate_pct ?? 0).toFixed(1)}% of runs`} />
        <KPICard label="Top policy" value={summary?.top_policy?.name || '—'} delta={`${summary?.top_policy?.count ?? 0} triggers`} valueColor="#F59E0B" />
        <KPICard label="Top stage" value={summary?.top_stage?.name || '—'} delta={`${summary?.top_stage?.count ?? 0} at stage`} />
        <KPICard label="Recovered" value={`${(summary?.recovered_rate_pct ?? 0).toFixed(1)}%`} valueColor="#22C55E" />
        <KPICard label="Median loops" value={(summary?.median_loops ?? 0).toFixed(1)} />
      </div>

      {/* Heatmap + examples */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
        <PolicyHeatmap rows={heatmap} selected={selected_policy} onSelect={selectPolicy} />
        <section style={{ padding: 12, background: '#0F0F11', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            Examples {selected_policy && <span style={{ color: 'var(--fg-5)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>· {selected_policy}</span>}
          </div>
          {!selected_policy && (
            <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>Click a policy in the heatmap to see recent triggers.</div>
          )}
          {selected_policy && exampleList.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>No recent examples for this policy.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {exampleList.map((ex, i) => (
              <a
                key={i}
                href={`/archive/${ex.run_id}`}
                data-testid={`example-row-${i}`}
                style={{ padding: 8, background: 'var(--bg-elev-1)', borderRadius: 8, textDecoration: 'none', color: 'var(--fg-1)', fontSize: 12 }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-5)' }}>{ex.run_id.slice(0, 12)}</span>
                  <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: 10, background: 'rgba(106,158,255,0.2)', color: '#9EBBFF', textTransform: 'uppercase' }}>{ex.stage}</span>
                  <span style={{ fontSize: 10, color: 'var(--fg-5)' }}>{ex.outcome}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>{ex.reason}</div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default PolicyObservabilityPage;
