import { useCallback, useEffect, useRef, useState } from 'react';
import { EVIDENCE_CIDS, type EvidenceCid } from '../../constants/evidenceCids';
import { lookupRunId } from '../../hooks/useRunRegistry';

// Vite env access pattern
const _ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const REGISTRY_ADDRESS = _ENV.VITE_RUN_REGISTRY_ADDRESS ?? '';

type PageState =
  | 'idle'
  | 'fetching'
  | 'success'
  | 'empty'
  | 'rpc-error'
  | 'unindexed'
  | 'partial-error'
  | 'contract-not-deployed';

interface CidStatus {
  cid: EvidenceCid;
  confirmed: boolean | null; // null = checking, true = confirmed, false = unindexed
  error: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* insecure context */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center justify-center rounded text-[10px] font-mono border transition-colors duration-150"
      style={{
        minWidth: 44, minHeight: 44,
        borderColor: copied ? 'var(--status-ok)' : 'var(--border)',
        color: copied ? 'var(--status-ok)' : 'var(--fg-4)',
        background: 'transparent',
        padding: '0 8px',
      }}
      aria-label="复制 CID"
    >
      {copied ? '✓' : '⎘'}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-sf border p-5 animate-pulse"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}
    >
      <div className="h-4 w-1/3 rounded mb-3" style={{ background: 'var(--bg-elev-2)' }} />
      <div className="h-3 w-2/3 rounded mb-2" style={{ background: 'var(--bg-elev-2)' }} />
      <div className="h-3 w-1/2 rounded" style={{ background: 'var(--bg-elev-2)' }} />
    </div>
  );
}

function CidCard({ status }: { status: CidStatus }) {
  const { cid, confirmed, error } = status;
  const archiveDate = new Date(cid.archivedAt);
  const dateStr = archiveDate.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  });

  const isUnindexed = confirmed === false;
  const isChecking = confirmed === null;

  return (
    <article
      className="rounded-sf border p-5"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}
      aria-label={`${cid.templateName} 链上证据`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-sf-accent">
            {cid.templateAlias}
          </span>
          <h3 className="text-base font-semibold text-white/90 mt-0.5">{cid.templateName}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Contract status badge */}
          {isChecking && (
            <span className="px-2 py-0.5 rounded-pill text-[10px] font-mono animate-pulse"
              style={{ background: 'var(--bg-elev-2)', color: 'var(--fg-4)' }}>
              验证中…
            </span>
          )}
          {confirmed === true && (
            <span className="px-2 py-0.5 rounded-pill text-[10px] font-mono"
              style={{ background: 'color-mix(in srgb,var(--status-ok) 15%,transparent)', color: 'var(--status-ok)' }}>
              ✓ 已确认
            </span>
          )}
          {error && (
            <span className="px-2 py-0.5 rounded-pill text-[10px] font-mono"
              style={{ background: 'color-mix(in srgb,#f97316 15%,transparent)', color: '#f97316' }}>
              暂时不可查
            </span>
          )}
          {/* Explorer link — disabled when unindexed */}
          {isUnindexed ? (
            <span
              title="Storage 节点正在索引，稍后可查"
              className="px-3 py-1.5 rounded-pill text-xs font-medium cursor-not-allowed"
              style={{ background: 'var(--bg-elev-2)', color: 'var(--fg-4)', opacity: 0.35 }}
              aria-disabled="true"
            >
              0G Explorer ↗
            </span>
          ) : (
            <a
              href={cid.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-pill text-xs font-medium transition-colors duration-150"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              aria-label={`在 0G Explorer 查看 CID ${cid.shortHash}`}
            >
              0G Explorer ↗
            </a>
          )}
        </div>
      </div>

      <p className="text-sm text-sf-fg3 mb-4 leading-relaxed">{cid.description}</p>

      <dl className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <dt className="font-mono text-[10px] text-sf-fg4 w-20 shrink-0">CID</dt>
          <dd className="flex items-center font-mono text-sm text-sf-accent">
            <span title={cid.cid}>{cid.cid.slice(2, 10)}</span>
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
                style={{ background: 'var(--accent-tint)', color: 'var(--accent-bright)', border: '1px solid var(--accent-dim)' }}
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
  const [pageState, setPageState] = useState<PageState>(
    REGISTRY_ADDRESS ? 'fetching' : 'contract-not-deployed',
  );
  const [cidStatuses, setCidStatuses] = useState<CidStatus[]>([]);

  const verify = useCallback(async () => {
    if (!REGISTRY_ADDRESS) {
      setPageState('contract-not-deployed');
      return;
    }

    setPageState('fetching');
    const initial: CidStatus[] = EVIDENCE_CIDS.map((c) => ({ cid: c, confirmed: null, error: false }));
    setCidStatuses(initial);

    if (EVIDENCE_CIDS.length === 0) {
      setPageState('empty');
      return;
    }

    let confirmedCount = 0;
    let errorCount = 0;

    const updated: CidStatus[] = await Promise.all(
      EVIDENCE_CIDS.map(async (c) => {
        try {
          // Use the runId field if available, otherwise fall back to CID lookup
          const entry = await lookupRunId(c.cid);
          if (entry) {
            confirmedCount++;
            return { cid: c, confirmed: true, error: false };
          }
          return { cid: c, confirmed: false, error: false };
        } catch {
          errorCount++;
          return { cid: c, confirmed: null, error: true };
        }
      }),
    );

    setCidStatuses(updated);

    if (errorCount > 0 && confirmedCount === 0) {
      setPageState('rpc-error');
    } else if (errorCount > 0) {
      setPageState('partial-error');
    } else if (confirmedCount === 0) {
      setPageState('unindexed');
    } else {
      setPageState('success');
    }
  }, []);

  useEffect(() => {
    verify();
  }, [verify]);

  // ── Fetching skeleton ────────────────────────────────────────────────────
  if (pageState === 'fetching') {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // ── Contract not deployed (dev env) ─────────────────────────────────────
  if (pageState === 'contract-not-deployed') {
    return (
      <div className="space-y-4">
        <div className="rounded-sf border p-5 text-center"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}>
          <p className="text-sm font-mono" style={{ color: 'var(--fg-4)' }}>
            合约未配置（开发环境）
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--fg-5)' }}>
            设置 VITE_RUN_REGISTRY_ADDRESS 后链上证明将在此显示
          </p>
        </div>
        {EVIDENCE_CIDS.map((c) => (
          <CidCard key={c.cid} status={{ cid: c, confirmed: null, error: false }} />
        ))}
      </div>
    );
  }

  // ── Empty (no runs yet) ──────────────────────────────────────────────────
  if (pageState === 'empty') {
    return (
      <div className="rounded-sf border p-8 text-center"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}>
        <p className="text-sm" style={{ color: 'var(--fg-3)' }}>
          运行一个工作流后，链上证明将在此显示
        </p>
        <a href="/editor" className="mt-3 inline-block text-xs px-4 py-2 rounded-pill"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          打开编辑器
        </a>
      </div>
    );
  }

  // ── RPC error — show demo data + warning ────────────────────────────────
  if (pageState === 'rpc-error') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded"
          style={{ background: 'color-mix(in srgb,#f97316 12%,transparent)', border: '1px solid #f97316' }}>
          <span className="text-xs" style={{ color: '#f97316' }}>
            无法连接 0G Chain — 显示缓存数据
          </span>
        </div>
        {EVIDENCE_CIDS.map((c) => (
          <CidCard key={c.cid} status={{ cid: c, confirmed: null, error: false }} />
        ))}
      </div>
    );
  }

  // ── Normal rendering (success / unindexed / partial-error) ──────────────
  const displayItems = cidStatuses.length > 0 ? cidStatuses
    : EVIDENCE_CIDS.map((c) => ({ cid: c, confirmed: null as null, error: false }));

  return (
    <div className="space-y-4">
      {pageState === 'partial-error' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded"
          style={{ background: 'color-mix(in srgb,#f97316 12%,transparent)', border: '1px solid #f97316' }}>
          <span className="text-xs" style={{ color: '#f97316' }}>
            部分条目暂时不可查，其余正常显示
          </span>
        </div>
      )}
      {displayItems.map((s) => (
        <CidCard key={s.cid.cid} status={s} />
      ))}
      <p className="text-xs text-sf-fg4 text-center pt-2">
        链上数据永久存储于 0G Storage 网络 · 任何人可通过 CID 独立验证
      </p>
    </div>
  );
}
