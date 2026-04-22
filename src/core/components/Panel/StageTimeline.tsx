/**
 * StageTimeline — Story 4.8 / 4.9.
 * 5 lifecycle stage dots with retry badges.
 */
import { STAGE_ORDER, StageResult } from '../../../common/types/stage';

const OUTCOME_COLOR: Record<StageResult['outcome'], string> = {
  ok:      '#22C55E',
  retried: '#F59E0B',
  aborted: '#EF4444',
};

export function StageTimeline({ stages }: { stages: StageResult[] }): JSX.Element {
  const byName = new Map(stages.map((s) => [s.name, s]));
  return (
    <div
      data-testid="stage-timeline"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12 }}
    >
      {STAGE_ORDER.map((name, idx) => {
        const entry = byName.get(name) ?? { name, outcome: 'ok' as const, retry_count: 0 };
        const color = OUTCOME_COLOR[entry.outcome];
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ textAlign: 'center' }}>
              <div
                data-testid={`stage-dot-${name}`}
                data-outcome={entry.outcome}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 0 3px ${color}33`,
                  margin: '0 auto',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--fg-5)', marginTop: 4, textTransform: 'uppercase' }}>
                {name}
              </div>
              {entry.retry_count > 0 && (
                <div
                  data-testid={`retry-badge-${name}`}
                  style={{
                    marginTop: 4,
                    display: 'inline-block',
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: '#F59E0B33',
                    color: '#F59E0B',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                  }}
                >
                  {entry.retry_count}× rejected
                </div>
              )}
            </div>
            {idx < STAGE_ORDER.length - 1 && (
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default StageTimeline;
