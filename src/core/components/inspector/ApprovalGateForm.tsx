import { useState, useEffect } from 'react';
import type { WorkflowNode } from '../../types';

const DEFAULT_TIMEOUT = 300;

interface ApprovalGateFormProps {
  node: WorkflowNode;
  roles: string[];
  downstreamIds: string[];
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, color: 'var(--fg-4)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.1em' }}>
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
  const [timeout,    setTimeout_]   = useState(Number(cfg.timeout    ?? DEFAULT_TIMEOUT));

  // Sync when node changes
  useEffect(() => {
    setApprover(String(cfg.approver   ?? ''));
    setOnApprove(String(cfg.on_approve ?? ''));
    setOnReject(String(cfg.on_reject  ?? ''));
    setTimeout_(Number(cfg.timeout    ?? DEFAULT_TIMEOUT));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const push = (patch: Record<string, unknown>) => {
    onUpdate(node.id, { ...cfg, ...patch });
  };

  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)', marginBottom: 12 }}>
        approval gate · config
      </div>

      <Field label="Approver">
        <select value={approver} style={selectStyle}
          onChange={(e) => { setApprover(e.target.value); push({ approver: e.target.value }); }}>
          <option value="">— 未指定 —</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>

      <Field label="On Approve →">
        <select value={onApprove} style={selectStyle}
          onChange={(e) => { setOnApprove(e.target.value); push({ on_approve: e.target.value }); }}>
          <option value="">— none —</option>
          {downstreamIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </Field>

      <Field label="On Reject →">
        <select value={onReject} style={selectStyle}
          onChange={(e) => { setOnReject(e.target.value); push({ on_reject: e.target.value }); }}>
          <option value="">— none —</option>
          {downstreamIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </Field>

      <Field label="Timeout (s)">
        <input type="number" min={10} max={86400} value={timeout} style={inputStyle}
          onChange={(e) => {
            const v = Math.max(10, Math.min(86400, parseInt(e.target.value) || DEFAULT_TIMEOUT));
            setTimeout_(v);
            push({ timeout: v });
          }}
        />
      </Field>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)', lineHeight: 1.6 }}>
        approve → green handle · reject → red handle
      </div>
    </div>
  );
}
