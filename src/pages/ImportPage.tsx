import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  downloadTrajectory,
  isDownloadInFlight,
  MerkleVerificationError,
  CID_RE,
  type DownloadResult,
} from '../adapter/zerogStorage';
import { CidVerifiedBanner } from '../core/components/CidVerifiedBanner';
import { AuthorLineageChip } from '../core/components/AuthorLineageChip';

const HISTORY_KEY = 'shadowflow_import_cid_history';
const MAX_HISTORY = 10;
const EXPLORER_BASE = 'https://storagescan-newton.0g.ai/file/';

interface FailureLog {
  cid: string;
  error_type: string;
  timestamp: number;
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch { /* localStorage full — ignore */ }
}

function addToHistory(cid: string): void {
  const history = loadHistory().filter((c) => c !== cid);
  history.unshift(cid);
  saveHistory(history);
}

function shortenCid(cid: string): string {
  if (cid.length <= 16) return cid;
  return `${cid.slice(0, 10)}…${cid.slice(-6)}`;
}

export default function ImportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [cid, setCid] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'timeout' } | null>(null);
  const [verifiedCid, setVerifiedCid] = useState<string | null>(null);
  const [authorLineage, setAuthorLineage] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [failureLogs, setFailureLogs] = useState<FailureLog[]>([]);
  const [autoLoadedCid, setAutoLoadedCid] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const isValidCid = CID_RE.test(cid.trim());

  const handleLoad = useCallback(async (overrideCid?: string) => {
    const trimmed = (overrideCid ?? cid).trim();
    if (!CID_RE.test(trimmed) || isDownloadInFlight()) return;

    setLoading(true);
    setToast(null);
    setVerifiedCid(null);
    setAuthorLineage([]);

    try {
      const result: DownloadResult = await downloadTrajectory(trimmed);
      addToHistory(trimmed);
      setHistory(loadHistory());
      setVerifiedCid(trimmed);

      const lineage = result.trajectory?.metadata?.author_lineage;
      setAuthorLineage(Array.isArray(lineage) ? lineage : []);
    } catch (err) {
      const isMerkle = err instanceof MerkleVerificationError;
      const errorType = isMerkle ? err.errorType : 'unknown';
      const message = isMerkle
        ? err.errorType === 'timeout'
          ? '下载超时,请检查 CID 或网络'
          : 'Merkle 验证失败,数据可能被篡改'
        : String(err);

      setToast({
        message,
        type: errorType === 'timeout' ? 'timeout' : 'error',
      });
      setVerifiedCid(null);
      setAuthorLineage([]);

      setFailureLogs((prev) => [
        ...prev,
        { cid: trimmed, error_type: errorType, timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [cid]);

  // Auto-load CID from query param (e.g. /import?cid=0x...). Fires once per
  // unique query CID — re-firing the same CID would be a wasted round-trip.
  useEffect(() => {
    const queryCid = searchParams.get('cid')?.trim();
    if (!queryCid || !CID_RE.test(queryCid)) return;
    if (autoLoadedCid === queryCid) return;
    setCid(queryCid);
    setAutoLoadedCid(queryCid);
    void handleLoad(queryCid);
  }, [searchParams, autoLoadedCid, handleLoad]);

  const handleHistoryClick = (historyCid: string) => {
    setCid(historyCid);
    setToast(null);
    setVerifiedCid(null);
    setAuthorLineage([]);
  };

  const copyFailureLogs = () => {
    const text = failureLogs
      .map((l) => `CID: ${l.cid} | Error: ${l.error_type} | Time: ${new Date(l.timestamp).toISOString()}`)
      .join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg-1)' }}>
      {/* Nav bar */}
      <div
        style={{
          height: 60,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(10,10,10,.85)',
          backdropFilter: 'blur(14px)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 32px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--fg-3)',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          ← Back
        </button>
        <div className="sf-logo">
          <div className="sf-logo-mark">S</div>
          <div className="sf-logo-word">ShadowFlow</div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-4)',
            letterSpacing: '.1em',
          }}
        >
          IMPORT BY CID
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            padding: '12px 20px',
            borderRadius: 10,
            background: toast.type === 'timeout' ? 'var(--status-warn-tint)' : 'rgba(239,68,68,.12)',
            border: `1px solid ${toast.type === 'timeout' ? 'rgba(245,158,11,.4)' : 'rgba(239,68,68,.4)'}`,
            color: toast.type === 'timeout' ? 'var(--status-warn)' : 'var(--status-reject)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          }}
        >
          <span>{toast.type === 'timeout' ? '⏱' : '✗'}</span>
          {toast.message}
          <button
            onClick={() => setToast(null)}
            style={{
              marginLeft: 12,
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 14,
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 32px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: '-.03em',
            margin: '0 0 8px',
          }}
        >
          Import by CID
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'var(--fg-3)',
            margin: '0 0 32px',
            lineHeight: 1.6,
          }}
        >
          粘贴一个 0G Storage CID,下载 trajectory 并验证 Merkle root 完整性。
        </p>

        {/* Input + Load */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            type="text"
            value={cid}
            onChange={(e) => {
              setCid(e.target.value);
              setToast(null);
              setVerifiedCid(null);
              setAuthorLineage([]);
            }}
            placeholder="0x3f7a…bc91 (64-char hex CID)"
            style={{
              flex: 1,
              height: 48,
              padding: '0 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              background: 'var(--bg-elev-1)',
              border: `1px solid ${cid && !isValidCid ? 'rgba(239,68,68,.5)' : 'var(--border)'}`,
              borderRadius: 10,
              color: 'var(--fg-1)',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValidCid && !loading) handleLoad();
            }}
          />
          <button
            onClick={handleLoad}
            disabled={!isValidCid || loading}
            style={{
              height: 48,
              padding: '0 24px',
              borderRadius: 10,
              border: 'none',
              background: !isValidCid || loading ? 'var(--bg-elev-3)' : 'var(--accent)',
              color: !isValidCid || loading ? 'var(--fg-5)' : '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: !isValidCid || loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {loading && (
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  border: '2px solid currentColor',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'sf-spin .7s linear infinite',
                }}
              />
            )}
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>

        {/* CID format hint */}
        {cid && !isValidCid && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--status-reject)',
              marginBottom: 16,
            }}
          >
            CID 格式: 0x + 64 位十六进制字符
          </div>
        )}

        {/* Verified banner + lineage */}
        {verifiedCid && (
          <div style={{ marginBottom: 24 }}>
            <CidVerifiedBanner cid={verifiedCid} />

            {/* Author lineage */}
            <div style={{ marginTop: 14 }}>
              <AuthorLineageChip lineage={authorLineage} showPendingSelf />
            </div>

            {/* CID short identifier + explorer link */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--fg-4)',
              }}
            >
              <span>CID: {shortenCid(verifiedCid)}</span>
              <a
                href={`${EXPLORER_BASE}${verifiedCid}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-bright)', textDecoration: 'none', fontSize: 11 }}
              >
                0G Explorer ↗
              </a>
            </div>

            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--fg-4)',
                marginTop: 10,
              }}
            >
              模板已通过 Merkle 验证,可安全加载到编辑器。
            </p>
          </div>
        )}

        {/* GDPR immutability tooltip */}
        <div
          style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--bg-elev-1)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-4)',
            lineHeight: 1.5,
          }}
          title="上链后永久不可变,请确认已通过 sanitize。如需撤销,请申请新 CID 并弃用旧链接(PRD GDPR 应对)"
        >
          <span style={{ color: 'var(--status-warn)', marginRight: 6 }}>ⓘ</span>
          上链数据永久不可变 — 发布前请确保已通过 sanitize 扫描。如需撤回内容,只能发布新 CID 并弃用旧链接。
        </div>

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--fg-4)',
                marginBottom: 12,
              }}
            >
              Recent CIDs
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map((h) => (
                <button
                  key={h}
                  onClick={() => handleHistoryClick(h)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: 'var(--bg-elev-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--fg-2)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ color: 'var(--accent-bright)' }}>⑂</span>
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Failure logs */}
        {failureLogs.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--fg-5)',
                  margin: 0,
                }}
              >
                Failure Log
              </h3>
              <button
                onClick={copyFailureLogs}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--fg-4)',
                  cursor: 'pointer',
                }}
              >
                Copy logs
              </button>
            </div>
            {failureLogs.slice(-5).map((log, i) => (
              <div
                key={i}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--fg-5)',
                  padding: '4px 0',
                }}
              >
                {new Date(log.timestamp).toLocaleTimeString()} · {log.error_type} · {log.cid.slice(0, 14)}…
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes sf-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
