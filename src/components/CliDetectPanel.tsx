/**
 * CliDetectPanel.tsx — "Local AI CLIs" settings panel (Story 15.19 v2)
 *
 * Lists every CLI in `KNOWN_CLIS` with: name, installed/missing status, path,
 * version, env-var hint, and a one-click "Copy install_cmd" for missing ones.
 *
 * Icon convention: lucide-react Check / X (single-color, line-art) per
 * `feedback_no_system_emoji_icons` memory — NEVER raw emoji.
 *
 * State machine:
 *   loading (initial)  → loaded
 *   loading (refresh)  → re-renders the same panel; previous data stays visible
 *   error              → shows banner + retry button
 */

import { useEffect, useState } from 'react';
import { Check, X, RefreshCw, Copy } from 'lucide-react';
import {
  listDetectedClis,
  refreshCliDetection,
  type DetectedCli,
  type DetectResponse,
} from '../api/cli';

interface PanelState {
  loading: boolean;
  data: DetectResponse | null;
  error: string | null;
}

export function CliDetectPanel() {
  const [state, setState] = useState<PanelState>({
    loading: true,
    data: null,
    error: null,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load(force: boolean): Promise<void> {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = force ? await refreshCliDetection() : await listDetectedClis();
      setState({ loading: false, data, error: null });
    } catch (err) {
      setState((s) => ({
        loading: false,
        data: s.data, // keep stale data so the user isn't left blank
        error: (err as Error).message,
      }));
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  async function copyInstall(it: DetectedCli) {
    try {
      await navigator.clipboard.writeText(it.install_cmd);
      setCopiedId(it.id);
      window.setTimeout(() => setCopiedId(null), 1200);
    } catch {
      // clipboard blocked — surface as transient state
      setCopiedId('error');
      window.setTimeout(() => setCopiedId(null), 1200);
    }
  }

  // ─── styles (mirrors GenerationSettings tokens) ────────────────────────────
  const cardStyle: React.CSSProperties = {
    border: '1px solid var(--t-border)',
    borderRadius: 12,
    background: 'var(--t-panel)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };
  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  };
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 8px',
    borderBottom: '1px solid var(--t-border)',
    fontWeight: 600,
    color: 'var(--t-fg-3)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 8px',
    borderBottom: '1px solid var(--t-border)',
    color: 'var(--t-fg-2)',
    verticalAlign: 'middle',
  };

  return (
    <div data-testid="cli-detect-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="hf-label" style={{ color: 'var(--t-accent)' }}>
          LOCAL AI CLIS
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
          Local AI CLIs
        </div>
        <p style={{ fontSize: 13, color: 'var(--t-fg-3)', marginTop: 6 }}>
          ShadowFlow auto-scans your PATH for known AI CLIs (claude, codex, gh-copilot, …)
          and lets Skills target them as executors. Click "Re-scan" after installing a new CLI.
        </p>
      </div>

      <div style={cardStyle}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono, monospace)' }}>
            {state.data
              ? `Scanned: ${new Date(state.data.scanned_at).toLocaleString()}`
              : state.loading
              ? 'Scanning…'
              : '—'}
          </div>
          <button
            type="button"
            data-testid="cli-rescan-btn"
            onClick={() => void load(true)}
            disabled={state.loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--t-border)',
              background: 'var(--t-panel-2, var(--t-panel))',
              color: 'var(--t-fg)',
              cursor: state.loading ? 'wait' : 'pointer',
              opacity: state.loading ? 0.6 : 1,
            }}
          >
            <RefreshCw
              size={12}
              style={state.loading ? { animation: 'spin 1s linear infinite' } : undefined}
            />
            Re-scan
          </button>
        </header>

        {state.error && (
          <div
            data-testid="cli-error-banner"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--t-warn-tint, rgba(245,158,11,0.1))',
              color: 'var(--t-warn, #f59e0b)',
              fontSize: 12,
            }}
          >
            Detection failed: {state.error}
          </div>
        )}

        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>CLI</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Version</th>
              <th style={thStyle}>Path</th>
              <th style={thStyle}>Install / Notes</th>
            </tr>
          </thead>
          <tbody>
            {!state.data && state.loading && (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--t-fg-4)' }}>
                  Scanning PATH…
                </td>
              </tr>
            )}
            {state.data?.items.map((it) => (
              <tr
                key={it.id}
                data-testid={`cli-row-${it.id}`}
                style={{ opacity: it.installed ? 1 : 0.5 }}
              >
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                  {it.id}
                </td>
                <td style={tdStyle}>
                  {it.installed ? (
                    <span
                      data-testid={`cli-status-${it.id}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--t-ok, #10b981)' }}
                    >
                      <Check size={14} strokeWidth={2.5} />
                      <span>installed</span>
                    </span>
                  ) : (
                    <span
                      data-testid={`cli-status-${it.id}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--t-fg-4)' }}
                    >
                      <X size={14} strokeWidth={2.5} />
                      <span>missing</span>
                    </span>
                  )}
                  {it.needs_env && !it.env_set && (
                    <div style={{ fontSize: 10, color: 'var(--t-warn, #f59e0b)', marginTop: 2 }}>
                      env {it.needs_env} not set
                    </div>
                  )}
                  {it.installed && it.capabilities && (() => {
                    const enabledKeys = Object.entries(it.capabilities)
                      .filter(([, v]) => v)
                      .map(([k]) => k);
                    if (enabledKeys.length === 0) return null;
                    const visible = enabledKeys.slice(0, 3);
                    const extra = enabledKeys.length - visible.length;
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                        {visible.map((cap) => (
                          <span
                            key={cap}
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 4,
                              border: '1px solid var(--t-border)',
                              background: 'var(--t-panel-2, var(--t-panel))',
                              color: 'var(--t-fg-3)',
                              fontFamily: 'var(--font-mono, monospace)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {cap}
                          </span>
                        ))}
                        {extra > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 4,
                              border: '1px solid var(--t-border)',
                              background: 'var(--t-panel-2, var(--t-panel))',
                              color: 'var(--t-fg-4)',
                              fontFamily: 'var(--font-mono, monospace)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            +{extra} more
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                  {it.version ?? '—'}
                  {it.installed && it.fallback_models && it.fallback_models.length > 0 && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 4,
                        border: '1px solid var(--t-border)',
                        background: 'var(--t-panel-2, var(--t-panel))',
                        color: 'var(--t-fg-4)',
                        fontFamily: 'var(--font-mono, monospace)',
                        whiteSpace: 'nowrap',
                      }}
                      title={it.fallback_models.join(', ')}
                    >
                      {it.fallback_models.length} models
                    </span>
                  )}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 11,
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={it.path ?? undefined}
                >
                  {it.path ?? '—'}
                </td>
                <td style={tdStyle}>
                  {it.installed ? (
                    <span style={{ color: 'var(--t-fg-4)' }}>—</span>
                  ) : (
                    <div>
                      <button
                        type="button"
                        data-testid={`cli-install-${it.id}`}
                        onClick={() => void copyInstall(it)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--t-border)',
                          background: 'transparent',
                          color: 'var(--t-fg-2)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono, monospace)',
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={it.install_cmd}
                      >
                        <Copy size={10} />
                        <span>
                          {copiedId === it.id ? 'copied!' : copiedId === 'error' ? 'copy blocked' : it.install_cmd}
                        </span>
                      </button>
                      {it.auth_hint && (
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--t-fg-4)',
                            fontStyle: 'italic',
                            marginTop: 3,
                          }}
                        >
                          {it.auth_hint}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CliDetectPanel;
