/**
 * IOContractBar — bottom bar of AgentDetail showing INPUT / OUTPUT
 * contract (mono, left-right split). Mirrors run-session-v2.html `.ag-io`
 * styles (line ~684-695).
 *
 * 2026-05-18 — backend (useRunSession.RunSessionNode) does NOT yet expose
 * io_input / io_output fields. Until backend extension v2 lands, both
 * props are optional; if either is missing the column renders the literal
 * placeholder `contract: TBD` (NOT a mocked sample). This is the
 * "honest waiting" pattern used elsewhere in the panel.
 *
 * TODO(backend-v2): When server.NodeEvent gains io_input / io_output,
 * pipe them through useRunSession (reducer NODE case) into
 * RunSessionNode.ioInput / RunSessionNode.ioOutput and AgentDetail will
 * forward them down to this bar.
 */
import React from 'react';

export interface IOContractBarProps {
  input?: string;
  output?: string;
}

const placeholder = 'contract: TBD';

const colStyle: React.CSSProperties = {
  padding: '0 16px',
  minWidth: 0,
};

const headStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--fg-4)',
  fontWeight: 700,
  marginBottom: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 10.5,
  color: 'var(--fg-3)',
  lineHeight: 1.55,
  wordBreak: 'break-word',
};

const placeholderStyle: React.CSSProperties = {
  ...bodyStyle,
  color: 'var(--fg-5)',
  fontStyle: 'italic',
};

export const IOContractBar: React.FC<IOContractBarProps> = ({ input, output }) => {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--bg-elev-1)',
        padding: '12px 0',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        position: 'relative',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 12,
          bottom: 12,
          left: '50%',
          width: 1,
          background: 'var(--border)',
        }}
      />
      <div style={colStyle}>
        <div style={headStyle}>
          <span style={{ color: 'var(--accent)', fontWeight: 900 }}>▸</span>
          INPUT · expects
        </div>
        <div style={input ? bodyStyle : placeholderStyle}>
          {input || placeholder}
        </div>
      </div>
      <div style={colStyle}>
        <div style={headStyle}>
          <span style={{ color: 'var(--accent)', fontWeight: 900 }}>▸</span>
          OUTPUT · produces
        </div>
        <div style={output ? bodyStyle : placeholderStyle}>
          {output || placeholder}
        </div>
      </div>
    </div>
  );
};

export default IOContractBar;
