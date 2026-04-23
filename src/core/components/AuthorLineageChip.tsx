interface AuthorLineageChipProps {
  lineage: string[];
  showPendingSelf?: boolean;
}

function parseEntry(entry: string): { alias: string; fingerprint: string } {
  const atIdx = entry.lastIndexOf('@');
  if (atIdx === -1) return { alias: entry, fingerprint: '' };
  return { alias: entry.slice(0, atIdx), fingerprint: entry.slice(atIdx + 1) };
}

export function AuthorLineageChip({ lineage, showPendingSelf }: AuthorLineageChipProps) {
  const isEmpty = lineage.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        flexWrap: 'wrap',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'var(--fg-4)',
          marginRight: 8,
        }}
      >
        LINEAGE
      </span>

      {isEmpty && (
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            background: 'var(--bg-elev-2)',
            border: '1px solid var(--border)',
            color: 'var(--fg-4)',
            fontSize: 11,
          }}
        >
          origin: anonymous
        </span>
      )}

      {lineage.map((entry, i) => {
        const { alias, fingerprint } = parseEntry(entry);
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
            {i > 0 && (
              <span style={{ color: 'var(--fg-5)', margin: '0 4px', fontSize: 11 }}>→</span>
            )}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'var(--accent-tint)',
                border: '1px solid rgba(168,85,247,.3)',
                color: 'var(--accent-bright)',
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {alias}
              {fingerprint && (
                <span style={{ color: 'var(--fg-4)', fontWeight: 400, fontSize: 10 }}>
                  @{fingerprint}
                </span>
              )}
            </span>
          </span>
        );
      })}

      {showPendingSelf && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
          {lineage.length > 0 && (
            <span style={{ color: 'var(--fg-5)', margin: '0 4px', fontSize: 11 }}>→</span>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--status-warn-tint)',
              border: '1px dashed rgba(245,158,11,.4)',
              color: 'var(--status-warn)',
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            (You?)
            <span style={{ fontSize: 9, fontWeight: 400 }}>未归档</span>
          </span>
        </span>
      )}
    </div>
  );
}
