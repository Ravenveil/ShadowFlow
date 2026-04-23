interface CidVerifiedBannerProps {
  cid: string;
}

const EXPLORER_BASE = 'https://storagescan-newton.0g.ai/file/';

function shortenCid(cid: string): string {
  if (cid.length <= 16) return cid;
  return `${cid.slice(0, 10)}…${cid.slice(-6)}`;
}

export function CidVerifiedBanner({ cid }: CidVerifiedBannerProps) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        background: 'rgba(16,185,129,.08)',
        border: '1px solid rgba(16,185,129,.3)',
        borderRadius: 10,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--status-ok)',
      }}
    >
      <span style={{ fontSize: 16 }}>✓</span>
      <span>0G Storage · CID {shortenCid(cid)} 验证通过</span>
      <a
        href={`${EXPLORER_BASE}${cid}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          marginLeft: 'auto',
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid rgba(16,185,129,.3)',
          background: 'rgba(16,185,129,.06)',
          color: 'var(--status-ok)',
          textDecoration: 'none',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        0G Explorer ↗
      </a>
    </div>
  );
}
