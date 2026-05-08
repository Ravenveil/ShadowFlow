/**
 * MemoryStatsBar — Story 14.1 AC4
 *
 * Placeholder mode: shows memory configuration parameters (working limit /
 * episodic retention days / semantic skills count) from GET /memory/stats.
 * Live counts require Story 9.4 writeback implementation.
 */

import { useCallback, useEffect, useState } from 'react';
import { getMemoryStats } from '../../api/memory';
import type { MemoryStats } from '../../api/memory';

type LoadStatus = 'loading' | 'success' | 'error';

function SkeletonPill() {
  return (
    <div
      style={{
        width: 110,
        height: 22,
        borderRadius: 5,
        background: 'var(--bg-elev-2, #1c1c1c)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
      aria-hidden="true"
    />
  );
}

interface StatPillProps {
  label: string;
  value: string;
}
function StatPill({ label, value }: StatPillProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 5,
        background: 'var(--bg-elev-2, #1c1c1c)',
        border: '1px solid var(--border, rgba(255,255,255,0.08))',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--fg-3, #A1A1AA)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--fg-4, #71717A)' }}>{label}:</span>
      {' '}{value}
    </span>
  );
}

interface MemoryStatsBarProps {
  agentId?: string;
}

export function MemoryStatsBar({ agentId }: MemoryStatsBarProps) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [stats, setStats] = useState<MemoryStats | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await getMemoryStats(agentId);
      setStats(res.data);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div
      data-testid="memory-stats-bar"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
      }}
    >
      {status === 'loading' && (
        <>
          <SkeletonPill />
          <SkeletonPill />
          <SkeletonPill />
        </>
      )}

      {status === 'error' && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-5, #52525B)' }}>
          Stats unavailable{' '}
          <button
            onClick={load}
            style={{ color: 'var(--fg-3, #A1A1AA)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0 }}
            aria-label="重试加载 Memory Stats"
          >
            retry
          </button>
        </span>
      )}

      {status === 'success' && stats && (
        <>
          <StatPill label="Working" value={`${stats.working_memory_limit} tokens`} />
          <StatPill label="Episodic" value={`${stats.episodic_retention_days} days`} />
          <StatPill label="Semantic Skills" value={String(stats.semantic_skills_count)} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--fg-5, #52525B)',
              fontStyle: 'italic',
            }}
          >
            Live memory counts coming soon
          </span>
        </>
      )}
    </div>
  );
}

export default MemoryStatsBar;
