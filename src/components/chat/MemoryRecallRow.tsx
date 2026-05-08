/**
 * MemoryRecallRow — Story 14.1 AC1
 *
 * Rendered below an AgentMsg bubble when memories_recalled > 0.
 * Color uses --fg-3 (WCAG AA 6.5:1) rather than the original --fg-5 (3.2:1 fail).
 */

interface MemoryRecallRowProps {
  memories: number;
}

export function MemoryRecallRow({ memories }: MemoryRecallRowProps) {
  if (memories <= 0) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        marginTop: 6,
      }}
      aria-label={`Agent recalled ${memories} memories`}
    >
      {/* Memory chip icon */}
      <svg
        aria-hidden="true"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 14, height: 14, color: 'var(--fg-4)', flexShrink: 0 }}
      >
        <rect x="1" y="2.5" width="12" height="9" rx="1.5" />
        <line x1="4" y1="2.5" x2="4" y2="11.5" />
        <line x1="10" y1="2.5" x2="10" y2="11.5" />
        <line x1="1" y1="6" x2="13" y2="6" />
      </svg>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--fg-3)',
        }}
      >
        {memories} {memories === 1 ? 'memory' : 'memories'} recalled
      </span>
    </div>
  );
}

export default MemoryRecallRow;
