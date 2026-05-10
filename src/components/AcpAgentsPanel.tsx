/**
 * AcpAgentsPanel.tsx — "Remote Agents (ACP/MCP)" settings panel (Story 15.23)
 *
 * Mirrors `CliDetectPanel.tsx` styling and lifecycle so the Settings page has
 * a consistent visual rhythm. Two sub-sections under one card:
 *   - ACP agents (online/offline + transport hint)
 *   - MCP servers (placeholder note — server list comes from .shadowflow/mcp.json
 *     which the front-end doesn't currently read directly; the server panel
 *     surfaces ACP entries that have type='mcp' if any registry rows opt in)
 *
 * Empty state + offline tooltips per AC7. Icons are lucide-react (single-color
 * line-art) per `feedback_no_system_emoji_icons` memory — never raw emoji.
 */

import { useEffect, useState } from 'react';
import { Check, X, RefreshCw, Cloud, Terminal } from 'lucide-react';
import {
  listAcpAgents,
  refreshAcpAgents,
  type DetectedAcpAgent,
  type AcpDetectResponse,
} from '../api/acp';

interface PanelState {
  loading: boolean;
  data: AcpDetectResponse | null;
  error: string | null;
}

export function AcpAgentsPanel() {
  const [state, setState] = useState<PanelState>({ loading: true, data: null, error: null });

  async function load(force: boolean): Promise<void> {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = force ? await refreshAcpAgents() : await listAcpAgents();
      setState({ loading: false, data, error: null });
    } catch (err) {
      setState((s) => ({ loading: false, data: s.data, error: (err as Error).message }));
    }
  }

  useEffect(() => { void load(false); }, []);

  const cardStyle: React.CSSProperties = {
    border: '1px solid var(--t-border)',
    borderRadius: 12,
    background: 'var(--t-panel)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };
  const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px',
    borderBottom: '1px solid var(--t-border)',
    fontWeight: 600,
    color: 'var(--t-fg-3)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px',
    borderBottom: '1px solid var(--t-border)',
    color: 'var(--t-fg-2)',
    verticalAlign: 'middle',
  };

  const items = state.data?.items ?? [];

  return (
    <div data-testid="acp-agents-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="hf-label" style={{ color: 'var(--t-accent)' }}>REMOTE AGENTS · ACP / MCP</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, letterSpacing: '-.02em', color: 'var(--t-fg)' }}>
          Remote Agents (ACP / MCP)
        </div>
        <p style={{ fontSize: 13, color: 'var(--t-fg-3)', marginTop: 6 }}>
          ShadowFlow auto-detects ACP-protocol agents (e.g. Hermes, ShadowSoul) and MCP servers via PATH scan
          and TCP ping. Use <code>executor: acp:&lt;id&gt;</code> or <code>executor: mcp:&lt;server&gt;/&lt;tool&gt;</code> in
          a SKILL.md to route a skill to a remote agent.
        </p>
      </div>

      <div style={cardStyle}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono, monospace)' }}>
            {state.data
              ? `Scanned: ${new Date(state.data.scanned_at).toLocaleString()}`
              : state.loading
              ? 'Scanning…'
              : '—'}
          </div>
          <button
            type="button"
            data-testid="acp-rescan-btn"
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
            <RefreshCw size={12} style={state.loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            Re-scan
          </button>
        </header>

        {state.error && (
          <div
            data-testid="acp-error-banner"
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

        {!state.loading && items.length === 0 && !state.error && (
          <div
            data-testid="acp-empty-state"
            style={{ padding: '24px 8px', color: 'var(--t-fg-4)', fontSize: 12, textAlign: 'center' }}
          >
            No ACP / MCP agents detected. Add entries to <code>.shadowflow/acp-agents.json</code> or
            <code> .shadowflow/mcp.json</code>, then click Re-scan.
          </div>
        )}

        {items.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Transport</th>
                <th style={thStyle}>Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: DetectedAcpAgent) => (
                <tr
                  key={it.id}
                  data-testid={`acp-row-${it.id}`}
                  style={{ opacity: it.installed ? 1 : 0.55 }}
                  title={it.error ?? undefined}
                >
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                    {it.id}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 11,
                        color: it.type === 'acp' ? '#a855f7' : '#22c55e',
                      }}
                    >
                      {it.type === 'acp' ? <Cloud size={12} /> : <Terminal size={12} />}
                      {it.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {it.installed ? (
                      <span
                        data-testid={`acp-status-${it.id}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--t-ok, #10b981)' }}
                      >
                        <Check size={14} strokeWidth={2.5} />
                        <span>online</span>
                      </span>
                    ) : (
                      <span
                        data-testid={`acp-status-${it.id}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--t-fg-4)' }}
                      >
                        <X size={14} strokeWidth={2.5} />
                        <span>offline</span>
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                    {it.transport}
                    {it.endpoint && ` (${it.endpoint})`}
                    {it.path && ` (${it.path})`}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                    {it.capabilities && it.capabilities.length > 0 ? it.capabilities.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AcpAgentsPanel;
