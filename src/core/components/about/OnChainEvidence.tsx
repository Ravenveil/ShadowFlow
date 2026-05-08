import { useState } from 'react';
import { EVIDENCE_CIDS, type EvidenceCid } from '../../constants/evidenceCids';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silently fail on insecure contexts
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-0.5 rounded text-[10px] font-mono border transition-colors duration-150"
      style={{
        borderColor: copied ? 'var(--status-ok)' : 'var(--border)',
        color: copied ? 'var(--status-ok)' : 'var(--fg-4)',
        background: 'transparent',
      }}
      aria-label="复制 CID"
    >
      {copied ? '✓ 已复制' : '复制'}
    </button>
  );
}

function CidCard({ cid }: { cid: EvidenceCid }) {
  const archiveDate = new Date(cid.archivedAt);
  const dateStr = archiveDate.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  return (
    <article
      className="rounded-sf border p-5"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}
      aria-label={`${cid.templateName} 链上证据`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-sf-accent">
            {cid.templateAlias}
          </span>
          <h3 className="text-base font-semibold text-white/90 mt-0.5">{cid.templateName}</h3>
        </div>
        <a
          href={cid.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium transition-colors duration-150"
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
          }}
          aria-label={`在 0G Explorer 查看 CID ${cid.shortHash}`}
        >
          0G Explorer ↗
        </a>
      </div>

      {/* Description */}
      <p className="text-sm text-sf-fg3 mb-4 leading-relaxed">{cid.description}</p>

      {/* Fields */}
      <dl className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <dt className="font-mono text-[10px] text-sf-fg4 w-20 shrink-0">CID</dt>
          <dd className="flex items-center font-mono text-xs text-sf-accent truncate">
            <span title={cid.cid}>{cid.shortHash}</span>
            <CopyButton text={cid.cid} />
          </dd>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <dt className="font-mono text-[10px] text-sf-fg4 w-20 shrink-0">Merkle Root</dt>
          <dd className="font-mono text-xs text-sf-fg3 truncate" title={cid.merkleRoot}>
            {cid.merkleRoot.slice(0, 18)}…
          </dd>
        </div>

        <div className="flex items-center gap-2">
          <dt className="font-mono text-[10px] text-sf-fg4 w-20 shrink-0">归档时间</dt>
          <dd className="font-mono text-xs text-sf-fg3">{dateStr} UTC</dd>
        </div>

        <div className="flex items-start gap-2">
          <dt className="font-mono text-[10px] text-sf-fg4 w-20 shrink-0 mt-0.5">Author Chain</dt>
          <dd className="flex flex-wrap gap-1.5">
            {cid.authorLineage.map((author) => (
              <span
                key={author}
                className="px-2 py-0.5 rounded-pill text-[10px] font-mono"
                style={{
                  background: 'var(--accent-tint)',
                  color: 'var(--accent-bright)',
                  border: '1px solid var(--accent-dim)',
                }}
              >
                {author}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function OnChainEvidence() {
  return (
    <div className="space-y-4">
      {EVIDENCE_CIDS.map((cid) => (
        <CidCard key={cid.cid} cid={cid} />
      ))}

      <p className="text-xs text-sf-fg4 text-center pt-2">
        链上数据永久存储于 0G Storage 网络 · 任何人可通过 CID 独立验证
      </p>
    </div>
  );
}
