/**
 * ProviderLoadPanel — Story 4.7.
 * Horizontal bar rows + fallback chain pills.
 */
import { ProviderLoad } from '../../stores/useOpsStore';

export function ProviderLoadPanel({ providers }: { providers: ProviderLoad[] }): JSX.Element {
  return (
    <div data-testid="provider-load-panel" style={{ width: 680, padding: 12, background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Provider Load & Fallback Chain</div>
        <div style={{ fontSize: 11, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)' }}>
          {providers.length} configured · load = req/min
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {providers.map((p) => {
          const color = /0g/i.test(p.name) ? 'var(--t-accent)' : 'var(--t-run)';
          return (
            <div key={p.provider_id} data-testid={`provider-row-${p.provider_id}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 160 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-fg-2)' }}>{p.name}</div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--t-fg-4)' }}>
                  {p.model_count} models · p95 {Math.round(p.p95_ms)}ms · TEE {p.tee_verified ? '✓' : '✗'}
                </div>
              </div>
              <div style={{ flex: 1, height: 10, borderRadius: 6, background: 'var(--t-panel-2)', position: 'relative' }}>
                <div
                  style={{
                    width: `${Math.min(100, p.load_pct)}%`,
                    height: '100%',
                    borderRadius: 6,
                    background: color,
                  }}
                />
              </div>
              <div style={{ width: 44, fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right', color: 'var(--t-fg-2)', fontWeight: 700 }}>
                {p.load_pct}%
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {providers.map((p, i) => (
          <span key={p.provider_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', fontSize: 10 }}>
              {p.name}
            </span>
            {i < providers.length - 1 && <span style={{ color: 'var(--t-fg-4)' }}>→</span>}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)' }}>
        E1 degradation rule · switch on 3 consecutive 5xx or p95 {'>'} budget
      </div>
    </div>
  );
}

export default ProviderLoadPanel;
