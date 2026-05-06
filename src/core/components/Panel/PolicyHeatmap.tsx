/**
 * PolicyHeatmap — Story 4.9. CSS-grid heatmap, no chart libs.
 */
import { HeatmapRow } from '../../stores/usePolicyObsStore';
import { STAGE_ORDER } from '../../../common/types/stage';

export function heatmapColor(count: number): string {
  if (count === 0) return '#18181B';
  if (count <= 5) return '#1A2535';
  if (count <= 15) return '#1B3A6B';
  if (count <= 25) return '#1D5EA0';
  if (count <= 40) return '#F59E0B';
  return '#EF4444';
}

export function PolicyHeatmap({
  rows,
  selected,
  onSelect,
}: {
  rows: HeatmapRow[];
  selected: string | null;
  onSelect: (name: string) => void;
}): JSX.Element {
  const legend = [
    { label: '0', color: heatmapColor(0) },
    { label: '1-5', color: heatmapColor(5) },
    { label: '6-15', color: heatmapColor(15) },
    { label: '16-25', color: heatmapColor(25) },
    { label: '26-40', color: heatmapColor(40) },
    { label: '41+', color: heatmapColor(41) },
  ];

  return (
    <div data-testid="policy-heatmap" style={{ padding: 12, background: '#0F0F11', border: '1px solid var(--border)', borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Policy × Stage heatmap</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {legend.map((l) => (
            <span key={l.label} style={{ fontSize: 9, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', display: 'inline-flex', gap: 3, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, background: l.color, display: 'inline-block' }} />{l.label}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `200px repeat(${STAGE_ORDER.length}, 1fr)`, gap: 4 }}>
        <div />
        {STAGE_ORDER.map((s) => (
          <div key={s} style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{s}</div>
        ))}
        {rows.length === 0 && (
          <div style={{ gridColumn: `span ${STAGE_ORDER.length + 1}`, fontSize: 12, color: 'var(--fg-5)' }}>No rejection events in window.</div>
        )}
        {rows.map((row) => {
          const total = STAGE_ORDER.reduce((acc, s) => acc + (row.counts[s] ?? 0), 0);
          return (
            <div key={row.policy} style={{ display: 'contents' }}>
              <button
                data-testid={`heatmap-row-${row.policy}`}
                onClick={() => onSelect(row.policy)}
                style={{
                  textAlign: 'left',
                  background: selected === row.policy ? 'rgba(106,158,255,0.12)' : 'transparent',
                  border: 'none',
                  color: 'var(--fg-1)',
                  fontSize: 12,
                  padding: 6,
                  cursor: 'pointer',
                  fontWeight: selected === row.policy ? 700 : 500,
                }}
              >
                {row.policy}{' '}
                <span style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>{total}</span>
              </button>
              {STAGE_ORDER.map((s) => {
                const c = row.counts[s] ?? 0;
                const bg = heatmapColor(c);
                return (
                  <button
                    key={`${row.policy}-${s}`}
                    data-testid={`heatmap-cell-${row.policy}-${s}`}
                    data-count={c}
                    onClick={() => onSelect(row.policy)}
                    title={`${row.policy} × ${s}: ${c}`}
                    style={{
                      background: bg,
                      border: 'none',
                      color: c > 25 ? '#0F0F11' : 'var(--fg-3)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      height: 28,
                      cursor: 'pointer',
                    }}
                  >
                    {c || ''}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PolicyHeatmap;
