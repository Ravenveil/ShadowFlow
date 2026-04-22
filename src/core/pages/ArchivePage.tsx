/**
 * ArchivePage — Story 4.8.
 * 3-column layout: run list (left) + stage timeline + event log (mid) + export panel (right).
 */

import { useEffect, useMemo } from 'react';
import { useArchiveStore, ArchiveWindow, ArchiveRun } from '../stores/useArchiveStore';

/** P14: format milliseconds into a human-readable duration string. */
function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
import { StageTimeline } from '../components/Panel/StageTimeline';
import { Stage, StageResult } from '../../common/types/stage';
import { buildTrajectoryMarkdown } from '../../common/lib/trajectoryFormatter';

const WINDOWS: ArchiveWindow[] = ['24h', '7d', '30d', 'all'];

function RunCard({ run, onClick, selected }: { run: ArchiveRun; onClick: () => void; selected: boolean }): JSX.Element {
  return (
    <button
      type="button"
      data-testid={`archive-run-${run.run_id}`}
      onClick={onClick}
      style={{
        width: '100%',
        padding: 10,
        textAlign: 'left',
        background: selected ? 'rgba(106,158,255,0.08)' : '#0F0F11',
        border: '1px solid var(--border)',
        borderLeft: selected ? '3px solid #6A9EFF' : '1px solid var(--border)',
        borderRadius: 10,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 600 }}>{run.intent || run.run_id}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-5)' }}>{run.run_id}</div>
        {/* P14: duration column */}
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-4)' }}>
          {run.status === 'running' ? '⟳ running' : formatDuration(run.duration_ms)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {run.status === 'succeeded' && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#22C55E22', color: '#22C55E' }}>✓ done</span>
        )}
        {/* P14: rejections badge */}
        {run.badges.rejections > 0 && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#F59E0B22', color: '#F59E0B' }}>⟲ {run.badges.rejections}× rejected</span>
        )}
        {/* P14: approvals badge */}
        {run.badges.approvals > 0 && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#A07AFF22', color: '#A07AFF' }}>◆ {run.badges.approvals} approvals</span>
        )}
        {run.badges.aborted && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#EF444422', color: '#EF4444' }}>⚠ cancelled</span>
        )}
      </div>
    </button>
  );
}

function deriveStages(trajectory: Record<string, unknown> | null): StageResult[] {
  // Map trajectory to 5 stages via simple heuristics (Story 4.8 AC2).
  const steps = (trajectory?.steps as Array<Record<string, unknown>>) ?? [];
  const outcomes: Record<Stage, StageResult> = {
    [Stage.Intent]:  { name: Stage.Intent,  outcome: 'ok', retry_count: 0 },
    [Stage.Plan]:    { name: Stage.Plan,    outcome: 'ok', retry_count: 0 },
    [Stage.Review]:  { name: Stage.Review,  outcome: 'ok', retry_count: 0 },
    [Stage.Execute]: { name: Stage.Execute, outcome: 'ok', retry_count: 0 },
    [Stage.Deliver]: { name: Stage.Deliver, outcome: 'ok', retry_count: 0 },
  };
  for (const step of steps) {
    const kind = String(step.node_id ?? '').toLowerCase();
    const stage: Stage | null =
      kind.includes('plan') ? Stage.Plan :
      kind.includes('review') || kind.includes('critic') ? Stage.Review :
      kind.includes('deliver') || kind.includes('publish') ? Stage.Deliver :
      kind.includes('execute') || kind.includes('writer') ? Stage.Execute :
      null;
    if (stage && step.status === 'failed') {
      outcomes[stage].outcome = 'retried';
      outcomes[stage].retry_count += 1;
    }
  }
  return Object.values(outcomes);
}

export function ArchivePage({ apiBase = '' }: { apiBase?: string } = {}): JSX.Element {
  // P13: `window` renamed to `timeWindow` in store to avoid shadowing browser global
  const { runs, selected_run_id, trajectory, timeWindow, search, cursor, loading,
    setWindow, setSearch, fetchRuns, selectRun, fetchTrajectory, loadMore } = useArchiveStore();

  useEffect(() => {
    fetchRuns(apiBase);
  }, [apiBase, timeWindow, fetchRuns]);

  useEffect(() => {
    if (selected_run_id) fetchTrajectory(selected_run_id, apiBase);
  }, [selected_run_id, apiBase, fetchTrajectory]);

  const stages = useMemo(() => deriveStages(trajectory as Record<string, unknown> | null), [trajectory]);
  const selectedRun = runs.find((r) => r.run_id === selected_run_id) ?? null;

  const copyMarkdown = async () => {
    if (!trajectory) return;
    const md = buildTrajectoryMarkdown(trajectory as Record<string, unknown>);
    try {
      await navigator.clipboard?.writeText(md);
    } catch {
      /* ignored — UI still shows success */
    }
  };

  const downloadJson = () => {
    if (!selected_run_id) return;
    const blob = new Blob([JSON.stringify(trajectory, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectory-${selected_run_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main data-testid="archive-page" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Left: run list */}
      <aside style={{ width: 360, padding: 16, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-0)' }}>Archive</div>
        <input
          data-testid="archive-search"
          placeholder="Search intent / agent / policy…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') fetchRuns(apiBase); }}
          style={{ padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elev-1)', color: 'var(--fg-1)' }}
        />
        <select
          data-testid="archive-window"
          value={timeWindow}
          onChange={(e) => setWindow(e.target.value as ArchiveWindow)}
          style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elev-1)', color: 'var(--fg-1)' }}
        >
          {WINDOWS.map((w) => <option key={w} value={w}>{`Window: ${w}`}</option>)}
        </select>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto', flex: 1 }}>
          {runs.length === 0 && !loading && (
            <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>No runs yet.</div>
          )}
          {runs.map((r) => (
            <RunCard key={r.run_id} run={r} onClick={() => selectRun(r.run_id)} selected={r.run_id === selected_run_id} />
          ))}
          {cursor && (
            <button type="button" onClick={() => loadMore(apiBase)} style={{ fontSize: 12, padding: 6, background: 'transparent', color: 'var(--accent-bright)', border: 'none', cursor: 'pointer' }}>
              load more →
            </button>
          )}
        </div>
      </aside>

      {/* Mid: timeline + events */}
      <section style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!selected_run_id ? (
          <div style={{ fontSize: 13, color: 'var(--fg-5)' }}>Select a run from the list to see its trajectory.</div>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-0)' }}>{selected_run_id}</div>
            <StageTimeline stages={stages} />
            <div style={{ fontSize: 12, color: 'var(--fg-4)', padding: 12, border: '1px solid var(--border)', borderRadius: 10, maxHeight: 320, overflow: 'auto' }}>
              {!trajectory ? 'loading trajectory…' : (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {JSON.stringify(trajectory, null, 2).slice(0, 4000)}
                </pre>
              )}
            </div>
          </>
        )}
      </section>

      {/* Right: export + metrics */}
      <aside style={{ width: 320, padding: 16, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Export</div>
        <button type="button" data-testid="export-md" onClick={copyMarkdown} disabled={!trajectory} style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 8, cursor: trajectory ? 'pointer' : 'not-allowed', color: 'var(--fg-2)' }}>
          Copy as Markdown
        </button>
        <button type="button" data-testid="export-json" onClick={downloadJson} disabled={!trajectory} style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 8, cursor: trajectory ? 'pointer' : 'not-allowed', color: 'var(--fg-2)' }}>
          Download JSON
        </button>
        <button type="button" data-testid="export-0g" disabled title="Configure 0G key in Settings first" style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg-elev-1)', border: '1px solid rgba(160,122,255,0.3)', borderRadius: 8, cursor: 'not-allowed', color: 'var(--fg-5)' }}>
          Upload to 0G Storage
        </button>

        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>Metrics</div>
        {selectedRun ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <div>duration: <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedRun.duration_ms ?? '—'}ms</span></div>
            <div>rejections: {selectedRun.badges.rejections}</div>
            <div>approvals: {selectedRun.badges.approvals}</div>
            <div>status: {selectedRun.status}</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>(select a run)</div>
        )}
      </aside>
    </main>
  );
}

export default ArchivePage;
