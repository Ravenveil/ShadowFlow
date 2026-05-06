import { useState, useEffect } from 'react';
import type { WorkflowNode } from '../../types';

// P1-α fix: registry key is 'timeout_s', not 'timeout' — align form to registry schema
const DEFAULT_TIMEOUT_S = 300;

interface ApprovalGateFormProps {
  node: WorkflowNode;
  roles: string[];
  downstreamIds: string[];
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
}

// P3-2 fix: unique ids for label htmlFor association
const FIELD_IDS = {
  approver:  'agf-approver',
  onApprove: 'agf-on-approve',
  onReject:  'agf-on-reject',
  timeout:   'agf-timeout',
} as const;

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        htmlFor={htmlFor}
        style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, color: 'var(--fg-4)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.1em' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', background: 'var(--bg-elev-2)',
  border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--fg-1)', fontSize: 12, fontFamily: 'var(--font-mono)',
  outline: 'none', cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', background: 'var(--bg-elev-2)',
  border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--fg-1)', fontSize: 12, fontFamily: 'var(--font-mono)',
  outline: 'none', boxSizing: 'border-box',
};

export function ApprovalGateForm({ node, roles, downstreamIds, onUpdate }: ApprovalGateFormProps) {
  const cfg = (node.data.config ?? {}) as Record<string, unknown>;
  const [approver,   setApprover]   = useState(String(cfg.approver   ?? ''));
  const [onApprove,  setOnApprove]  = useState(String(cfg.on_approve ?? ''));
  const [onReject,   setOnReject]   = useState(String(cfg.on_reject  ?? ''));
  // P1-α: use timeout_s key; P1-β: separate string state for mid-edit UX
  const [timeoutS,   setTimeoutS]   = useState(Number(cfg.timeout_s  ?? DEFAULT_TIMEOUT_S));
  const [timeoutStr, setTimeoutStr] = useState(String(Number(cfg.timeout_s ?? DEFAULT_TIMEOUT_S)));

  // Sync when node id changes (different node selected)
  useEffect(() => {
    const c = (node.data.config ?? {}) as Record<string, unknown>;
    setApprover(String(c.approver   ?? ''));
    setOnApprove(String(c.on_approve ?? ''));
    setOnReject(String(c.on_reject  ?? ''));
    const ts = Number(c.timeout_s ?? DEFAULT_TIMEOUT_S);
    setTimeoutS(ts);
    setTimeoutStr(String(ts));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  // P1-γ fix: spread current local state values into push so rapid sequential changes
  // don't clobber each other via stale `cfg` prop snapshot.
  const push = (patch: Record<string, unknown>) => {
    onUpdate(node.id, {
      ...cfg,
      approver,
      on_approve: onApprove,
      on_reject:  onReject,
      timeout_s:  timeoutS,
      ...patch,       // patch overrides the above — ensures the triggering field is up-to-date
    });
  };

  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)', marginBottom: 12 }}>
        approval gate · config
      </div>

      <Field label="Approver" htmlFor={FIELD_IDS.approver}>
        <select id={FIELD_IDS.approver} value={approver} style={selectStyle}
          onChange={(e) => { setApprover(e.target.value); push({ approver: e.target.value }); }}>
          <option value="">— 未指定 —</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>

      <Field label="On Approve →" htmlFor={FIELD_IDS.onApprove}>
        <select id={FIELD_IDS.onApprove} value={onApprove} style={selectStyle}
          onChange={(e) => { setOnApprove(e.target.value); push({ on_approve: e.target.value }); }}>
          <option value="">— none —</option>
          {downstreamIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </Field>

      <Field label="On Reject →" htmlFor={FIELD_IDS.onReject}>
        <select id={FIELD_IDS.onReject} value={onReject} style={selectStyle}
          onChange={(e) => { setOnReject(e.target.value); push({ on_reject: e.target.value }); }}>
          <option value="">— none —</option>
          {downstreamIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </Field>

      <Field label="Timeout (s)" htmlFor={FIELD_IDS.timeout}>
        {/* P1-β fix: use string state so user can clear field mid-edit without
            the input snapping. Only push valid numeric values. */}
        <input
          id={FIELD_IDS.timeout}
          type="number" min={10} max={86400}
          value={timeoutStr}
          style={inputStyle}
          onChange={(e) => {
            setTimeoutStr(e.target.value);
            // P1-β: parseInt(e.target.value, 10) returns NaN on empty string — check with isNaN
            const raw = parseInt(e.target.value, 10);
            if (!isNaN(raw)) {
              const v = Math.max(10, Math.min(86400, raw));
              setTimeoutS(v);
              push({ timeout_s: v });
            }
            // If NaN (empty or partial), do not push — let user finish typing
          }}
        />
      </Field>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)', lineHeight: 1.6 }}>
        approve → green handle · reject → red handle
      </div>
    </div>
  );
}
