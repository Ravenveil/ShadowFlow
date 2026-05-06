import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useMarketplace,
  useIsOwned,
  purchaseTemplate,
  withdrawEarnings,
  getPendingEarnings,
  type MarketTemplate,
} from '../hooks/useTemplateRegistry';
import { PublishTemplateDialog } from '../components/Template/PublishTemplateDialog';
import { parseWorkflowYaml } from '../lib/yamlSerializer';
import { useWorkflow } from '../stores/workflowStore';

const STORAGE_INDEXER =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ZEROG_STORAGE_INDEXER ??
  'https://indexer-storage-testnet-turbo.0g.ai';

// ── Wallet helpers ────────────────────────────────────────────────────────────

type EthProvider = { request: (args: { method: string }) => Promise<string[]> };

async function connectWallet(): Promise<string | null> {
  const eth = (window as { ethereum?: EthProvider }).ethereum;
  if (!eth) return null;
  try {
    const accounts = await eth.request({ method: 'eth_requestAccounts' });
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PriceBadge({ priceEth }: { priceEth: string }) {
  const isFree = priceEth === '0.0' || priceEth === '0';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.04em',
        background: isFree ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.18)',
        color: isFree ? '#4ade80' : '#a78bfa',
        border: `1px solid ${isFree ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.3)'}`,
      }}
    >
      {isFree ? 'FREE' : `${priceEth} A0GI`}
    </span>
  );
}

function CreatorAddress({ address }: { address: string }) {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--fg-5)', userSelect: 'all' }}>
      {address.slice(0, 6)}…{address.slice(-4)}
    </span>
  );
}

interface TemplateCardProps {
  template: MarketTemplate;
  walletAddress: string | null;
  onConnectWallet: () => Promise<string | null>;
  onImportToEditor: (cid: string) => Promise<void>;
}

function TemplateCard({ template, walletAddress, onConnectWallet, onImportToEditor }: TemplateCardProps) {
  const owned = useIsOwned(template.id, walletAddress);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const downloadUrl = `${STORAGE_INDEXER}/file?root=${encodeURIComponent(template.cid)}`;

  const handleBuy = useCallback(async () => {
    setBuyError(null);
    let addr = walletAddress;
    if (!addr) {
      addr = await onConnectWallet();
      if (!addr) { setBuyError('请先连接 MetaMask'); return; }
    }
    setBuying(true);
    try {
      await purchaseTemplate(template.id, template.price);
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : '购买失败');
    } finally {
      setBuying(false);
    }
  }, [walletAddress, onConnectWallet, template]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      await onImportToEditor(template.cid);
    } finally {
      setImporting(false);
    }
  }, [onImportToEditor, template.cid]);

  const canDownload = owned === true;

  return (
    <div
      style={{
        background: 'var(--bg-elev-1)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {template.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {template.description || '无描述'}
          </div>
        </div>
        <PriceBadge priceEth={template.priceEth} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--fg-5)' }}>
        <span>{template.salesCount} 次购买</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>创建者 <CreatorAddress address={template.creator} /></span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {canDownload ? (
          <>
            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                background: importing ? 'var(--bg-elev-2)' : 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.3)',
                color: importing ? 'var(--fg-4)' : '#4ade80',
                fontSize: 12,
                fontWeight: 600,
                cursor: importing ? 'not-allowed' : 'pointer',
                minHeight: 36,
              }}
            >
              {importing ? '加载中…' : '在编辑器中打开'}
            </button>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '7px 12px', borderRadius: 8,
                background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
                color: 'var(--fg-3)', fontSize: 11, textDecoration: 'none', minHeight: 36,
              }}
            >
              下载 YAML
            </a>
          </>
        ) : (
          <button
            onClick={handleBuy}
            disabled={buying}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              background: buying ? 'var(--bg-elev-2)' : 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.35)',
              color: buying ? 'var(--fg-4)' : '#c4b5fd',
              fontSize: 12,
              fontWeight: 600,
              cursor: buying ? 'not-allowed' : 'pointer',
              minHeight: 36,
            }}
          >
            {buying ? '处理中…' : template.priceEth === '0.0' || template.priceEth === '0' ? '免费获取' : `购买 ${template.priceEth} A0GI`}
          </button>
        )}

        {buyError && (
          <span style={{ fontSize: 11, color: '#f87171' }}>{buyError}</span>
        )}
      </div>
    </div>
  );
}

// ── Earnings strip ────────────────────────────────────────────────────────────

function EarningsStrip({ walletAddress }: { walletAddress: string }) {
  const [earnings, setEarnings] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadEarnings = useCallback(async () => {
    const e = await getPendingEarnings(walletAddress);
    setEarnings(e);
  }, [walletAddress]);

  const handleWithdraw = useCallback(async () => {
    setWithdrawing(true);
    setMsg(null);
    try {
      await withdrawEarnings();
      setMsg('提现成功');
      setEarnings('0.0');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提现失败');
    } finally {
      setWithdrawing(false);
    }
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--bg-elev-1)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--fg-4)' }}>待提现收益：</span>
      {earnings === null ? (
        <button
          onClick={loadEarnings}
          style={{ color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
        >
          查看
        </button>
      ) : (
        <span style={{ fontWeight: 700, color: '#a78bfa' }}>{earnings} A0GI</span>
      )}
      {earnings !== null && parseFloat(earnings) > 0 && (
        <button
          onClick={handleWithdraw}
          disabled={withdrawing}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            background: 'rgba(139,92,246,0.15)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: '#c4b5fd',
            fontSize: 11,
            fontWeight: 600,
            cursor: withdrawing ? 'not-allowed' : 'pointer',
          }}
        >
          {withdrawing ? '提现中…' : '提现'}
        </button>
      )}
      {msg && <span style={{ fontSize: 11, color: msg.includes('成功') ? '#4ade80' : '#f87171' }}>{msg}</span>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export interface MarketplacePageImplProps {
  onBack?: () => void;
}

export function MarketplacePageImpl({ onBack }: MarketplacePageImplProps) {
  const navigate = useNavigate();
  const { templates, loading, error, contractDeployed, refetch } = useMarketplace();
  const { setWorkflow } = useWorkflow();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const handleConnectWallet = useCallback(async (): Promise<string | null> => {
    setConnecting(true);
    const addr = await connectWallet();
    if (addr) setWalletAddress(addr);
    setConnecting(false);
    return addr;
  }, []);

  // Fetch YAML from 0G Storage gateway, parse, load into editor, navigate
  const handleImportToEditor = useCallback(async (cid: string) => {
    const url = `${STORAGE_INDEXER}/file?root=${encodeURIComponent(cid)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`下载失败 (${resp.status})`);
    const text = await resp.text();
    const result = parseWorkflowYaml(text);
    if (!result.ok) throw new Error(`YAML 解析失败: ${result.error}`);
    setWorkflow(result.nodes, result.edges);
    navigate('/editor');
  }, [setWorkflow, navigate]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg-0)',
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fg-4)',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: '4px 6px',
            }}
          >
            ←
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>
            0G Chain · Galileo Testnet
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--fg-0)' }}>
            模板市场
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-4)' }}>
            浏览无需钱包，购买 / 上架需连接 MetaMask
          </p>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {walletAddress && contractDeployed && (
            <button
              onClick={() => setShowPublish(true)}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                color: '#4ade80', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36,
              }}
            >
              发布模板
            </button>
          )}
          {walletAddress ? (
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--fg-4)', userSelect: 'all' }}>
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </span>
          ) : (
            <button
              onClick={handleConnectWallet}
              disabled={connecting}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)',
                color: '#c4b5fd', fontSize: 12, fontWeight: 600,
                cursor: connecting ? 'not-allowed' : 'pointer', minHeight: 36,
              }}
            >
              {connecting ? '连接中…' : '连接钱包'}
            </button>
          )}
        </div>
      </header>

      {/* Publish dialog */}
      {showPublish && <PublishTemplateDialog onClose={() => { setShowPublish(false); refetch(); }} />}

      {/* Earnings strip (only when wallet connected) */}
      {walletAddress && <EarningsStrip walletAddress={walletAddress} />}

      {/* Contract not deployed notice */}
      {!contractDeployed && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.25)',
            borderRadius: 10,
            fontSize: 12,
            color: '#fcd34d',
          }}
        >
          合约尚未部署。请在 <code>.env</code> 中设置 <code>VITE_TEMPLATE_REGISTRY_ADDRESS</code>，然后重启开发服务器。
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 10,
            fontSize: 12,
            color: '#fca5a5',
          }}
        >
          {error}
          <button
            onClick={() => refetch()}
            style={{ marginLeft: 10, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
          >
            重试
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--fg-5)', fontSize: 13 }}>
          加载模板中…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && contractDeployed && templates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg-5)', fontSize: 13 }}>
          暂无模板，成为第一个上架者吧。
        </div>
      )}

      {/* Template grid */}
      {templates.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 14,
          }}
        >
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              walletAddress={walletAddress}
              onConnectWallet={handleConnectWallet}
              onImportToEditor={handleImportToEditor}
            />
          ))}
        </div>
      )}
    </main>
  );
}
