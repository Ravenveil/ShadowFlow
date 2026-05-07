/**
 * WalletSection — Hi-Fi v2 Settings → 0G · Wallet
 *
 * Recreated 1:1 from hf-pages.jsx -> HfSettings:
 *   • headline  ── "0G · WALLET" label + "链上钱包 + on-chain team CID"
 *   • connection card (network · masked address · 复制 / 断开 buttons)
 *   • 4-stat grid (TEAMS PUBLISHED / CIDS HELD / GAS BUDGET / CITATIONS)
 *   • recent on-chain activity table (timestamp · op · label · cid · status)
 *   • Skin Pack 7-slot color grid (bg/panel/fg/muted/accent/ink/border)
 *
 * Data source: shadowflow.api.wallet  →  GET /api/wallet/{status,activity,skin-pack}
 */
import { useEffect, useState } from 'react';
import { HfPill } from '../../components/hifi';
import { getApiBase } from '../../api/_base';

interface WalletStats {
  teams_published: number;
  cids_held: number;
  gas_budget_og: number;
  citations: number;
}

interface WalletStatus {
  connected: boolean;
  network: string;
  address_masked: string;
  address_full: string;
  stats: WalletStats;
}

interface WalletActivityItem {
  timestamp: string;
  op: string;
  label: string;
  cid: string;
  status: string;
}

interface SkinSlot {
  slot: string;
  value: string;
}

const FALLBACK_STATUS: WalletStatus = {
  connected: true,
  network: '0G Galileo Testnet',
  address_masked: '0x3f7a · 4d12 · ab98 · bc91',
  address_full: '0x3f7a4d12ab98bc91',
  stats: { teams_published: 3, cids_held: 12, gas_budget_og: 0.42, citations: 7 },
};

const FALLBACK_ACTIVITY: WalletActivityItem[] = [
  { timestamp: '09:14', op: 'team.publish', label: '论文深读小队', cid: 'cid://Qm…3bx2a', status: 'ok' },
  { timestamp: '昨日',   op: 'team.fork',    label: 'from Newsroom',  cid: 'cid://Qm…f0d12', status: 'ok' },
  { timestamp: '昨日',   op: 'team.update',  label: 'Rebuttal 起草',  cid: 'cid://Qm…99cda', status: 'warn' },
];

const FALLBACK_SKIN: SkinSlot[] = [
  { slot: 'bg',     value: '#0A0A0A' },
  { slot: 'panel',  value: '#0F0F12' },
  { slot: 'fg',     value: '#FAFAFA' },
  { slot: 'muted',  value: '#A1A1AA' },
  { slot: 'accent', value: '#A855F7' },
  { slot: 'ink',    value: '#0A0A0A' },
  { slot: 'border', value: '#27272A' },
];

export function WalletSection() {
  const [status, setStatus] = useState<WalletStatus>(FALLBACK_STATUS);
  const [activity, setActivity] = useState<WalletActivityItem[]>(FALLBACK_ACTIVITY);
  const [skin, setSkin] = useState<SkinSlot[]>(FALLBACK_SKIN);

  useEffect(() => {
    let cancelled = false;
    const base = getApiBase();
    (async () => {
      try {
        const [s, a, k] = await Promise.all([
          fetch(`${base}/api/wallet/status`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${base}/api/wallet/activity`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${base}/api/wallet/skin-pack`).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (cancelled) return;
        if (s && typeof s === 'object') setStatus(s as WalletStatus);
        if (a && Array.isArray(a.items)) setActivity(a.items as WalletActivityItem[]);
        if (k && Array.isArray(k.slots)) setSkin(k.slots as SkinSlot[]);
      } catch {
        // Backend offline — render fallback data so the page still demos.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = status.stats;
  const statCells: Array<[string, string, string]> = [
    ['TEAMS PUBLISHED', String(stats.teams_published), '含 1 个 fork'],
    ['CIDS HELD',       String(stats.cids_held),       '引用别人 team'],
    ['GAS BUDGET',      `${stats.gas_budget_og} OG`,   '本月剩余'],
    ['CITATIONS',       String(stats.citations),       '被人 fork'],
  ];

  function handleCopy() {
    if (!status.address_full) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(status.address_full);
    }
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="hf-label" style={{ color: 'var(--t-accent)' }}>
        0G · WALLET
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          marginTop: 4,
          letterSpacing: '-.02em',
          color: 'var(--t-fg)',
        }}
      >
        链上钱包 + on-chain team CID
      </div>
      <p style={{ fontSize: 13, color: 'var(--t-fg-3)', marginTop: 6, maxWidth: 560 }}>
        ShadowFlow 把 team 当作链上资产 · 钱包用来签名上链、领取别人 fork 的 team。
      </p>

      {/* ── Connection card ── */}
      <div
        className="hf-card"
        style={{ padding: 16, marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: 'var(--t-accent-tint)',
            color: 'var(--t-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          ✦
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }}>
              {status.network}
            </span>
            <HfPill color={status.connected ? 'var(--t-ok)' : 'var(--t-fg-5)'}>
              ● {status.connected ? 'connected' : 'offline'}
            </HfPill>
          </div>
          <div
            className="hf-mono"
            style={{ fontSize: 11, marginTop: 4, color: 'var(--t-fg-3)' }}
          >
            {status.address_masked}
          </div>
        </div>
        <button
          type="button"
          className="hf-btn"
          style={{ fontSize: 11, cursor: 'pointer' }}
          onClick={handleCopy}
        >
          复制
        </button>
        <button
          type="button"
          className="hf-btn"
          style={{ fontSize: 11, cursor: 'pointer' }}
          onClick={() => {
            // No backend write endpoint — UI-only feedback so the design demo
            // doesn't 404. Replace with real disconnect call when the wallet
            // adapter is wired.
            setStatus((prev) => ({ ...prev, connected: false }));
          }}
        >
          断开
        </button>
      </div>

      {/* ── 4-stat grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginTop: 14,
        }}
      >
        {statCells.map(([k, v, s]) => (
          <div key={k} className="hf-card" style={{ padding: '12px 14px' }}>
            <div className="hf-label" style={{ marginBottom: 6 }}>
              {k}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-.02em',
                color: 'var(--t-fg)',
              }}
            >
              {v}
            </div>
            <div className="hf-meta" style={{ fontSize: 10, marginTop: 3 }}>
              {s}
            </div>
          </div>
        ))}
      </div>

      {/* ── Activity table ── */}
      <div className="hf-label" style={{ marginTop: 24, marginBottom: 10 }}>
        最近上链 · ACTIVITY
      </div>
      <div className="hf-card" style={{ padding: '4px 0' }}>
        {activity.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--t-fg-4)' }}>
            暂无上链活动。
          </div>
        )}
        {activity.map((r, i) => (
          <div
            key={`${r.timestamp}-${r.op}-${i}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '70px 130px 1fr 180px 80px',
              padding: '10px 16px',
              alignItems: 'center',
              gap: 14,
              borderTop: i > 0 ? '1px dashed var(--t-border)' : 'none',
            }}
          >
            <span className="hf-meta">{r.timestamp}</span>
            <span className="hf-mono" style={{ fontSize: 11, color: 'var(--t-accent)' }}>
              {r.op}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--t-fg)' }}>{r.label}</span>
            <span className="hf-mono" style={{ fontSize: 10, color: 'var(--t-fg-4)' }}>
              {r.cid}
            </span>
            <HfPill color={`var(--t-${r.status})`}>● {r.status}</HfPill>
          </div>
        ))}
      </div>

      {/* ── Skin Pack 7 slots ── */}
      <div className="hf-label" style={{ marginTop: 24, marginBottom: 10 }}>
        SKIN PACK · 7 SLOTS
      </div>
      <div className="hf-card" style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {skin.map((s) => (
            <div key={s.slot} style={{ textAlign: 'center' }}>
              <div
                style={{
                  height: 38,
                  borderRadius: 5,
                  background: s.value,
                  border: '1px solid var(--t-border)',
                }}
              />
              <div className="hf-label" style={{ fontSize: 8, marginTop: 5 }}>
                {s.slot}
              </div>
              <div className="hf-mono" style={{ fontSize: 8.5, color: 'var(--t-fg-4)' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
