/**
 * AgentStatePanel — Story 9.4 AC4
 *
 * Displays and manages an agent's persisted state.
 * Props: agentId: string
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Trash2, Check, X, Pencil } from '../../../common/icons/iconRegistry';
import type { AgentState, StateSnapshot } from '../../../common/types/agent-state';
import {
  createSnapshot,
  getState,
  listSnapshots,
  patchState,
  resetState,
  restoreSnapshot,
  StateApiError,
} from '../../../api/state';
import { ConfirmModal } from '../modals/ConfirmModal';

interface AgentStatePanelProps {
  agentId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function _shortId(id: string): string {
  return id.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldRowProps {
  label: string;
  value: unknown;
  onEdit?: (newVal: string) => void;
}

function FieldRow({ label, value, onEdit }: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const isEditable = onEdit !== undefined && (typeof value === 'string' || typeof value === 'number');

  const startEdit = () => {
    setDraft(String(value ?? ''));
    setEditing(true);
  };

  const commit = () => {
    onEdit?.(draft);
    setEditing(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ flex: '0 0 140px', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'monospace' }}>{label}</span>
      {editing ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            style={{ flex: 1, background: 'var(--bg-elev-3)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--fg-0)', fontSize: 12, padding: '2px 6px', fontFamily: 'monospace' }}
          />
          <button onClick={commit} style={_btnSm('var(--status-approve)')} aria-label="确认"><Check size={12} strokeWidth={2.5} aria-hidden /></button>
          <button onClick={() => setEditing(false)} style={_btnSm('var(--bg-elev-3)')} aria-label="取消"><X size={12} strokeWidth={2.5} aria-hidden /></button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-1)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
          </span>
          {isEditable && (
            <button onClick={startEdit} style={_btnSm('var(--bg-elev-3)')} aria-label="编辑"><Pencil size={12} strokeWidth={2} aria-hidden /></button>
          )}
        </>
      )}
    </div>
  );
}

function _btnSm(bg: string): React.CSSProperties {
  return {
    background: bg,
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--fg-2)',
    fontSize: 11,
    padding: '2px 6px',
    cursor: 'pointer',
    fontWeight: 600,
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentStatePanel({ agentId }: AgentStatePanelProps) {
  const [state, setState] = useState<AgentState | null>(null);
  const [snapshots, setSnapshots] = useState<StateSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(true);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null); // snapshot_id
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stateRes, snapsRes] = await Promise.all([
        getState(agentId).catch(e => {
          if (e instanceof StateApiError && e.status === 404) return null;
          throw e;
        }),
        listSnapshots(agentId),
      ]);
      setState(stateRes?.data ?? null);
      setSnapshots(snapsRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load state');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  const flash = (msg: string) => {
    setStatusMsg(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setStatusMsg(null), 2500);
  };

  // Inline field edit
  const handleFieldEdit = async (key: string, newVal: string) => {
    if (!state) return;
    const numVal = Number(newVal);
    const parsed = !isNaN(numVal) && newVal.trim() !== '' ? numVal : newVal;
    try {
      const res = await patchState(agentId, {
        version: state.state_version,
        state_fields: { ...state.state_fields, [key]: parsed },
      });
      setState(res.data);
      flash('字段已更新');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  // Create snapshot
  const handleSnapshot = async () => {
    try {
      await createSnapshot(agentId);
      const snapsRes = await listSnapshots(agentId);
      setSnapshots(snapsRes.data);
      flash('快照已创建');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot failed');
    }
  };

  // Restore
  const handleRestoreConfirm = async () => {
    if (!confirmRestore) return;
    setConfirmRestore(null);
    try {
      const res = await restoreSnapshot(agentId, confirmRestore);
      setState(res.data);
      flash('已从快照恢复');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    }
  };

  // Reset
  const handleResetConfirm = async () => {
    setConfirmReset(false);
    try {
      const res = await resetState(agentId);
      setState(res.data);
      flash('状态已重置');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={_panelWrap()}>
        <p style={{ color: 'var(--fg-3)', fontSize: 13 }}>加载中…</p>
      </div>
    );
  }

  return (
    <div style={_panelWrap()}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--fg-0)' }}>Agent 状态</h3>
        <button onClick={load} style={_btnSm('var(--bg-elev-3)')}>↺ 刷新</button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid var(--status-reject)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--status-reject)', marginBottom: 10 }}>
          {error}
        </div>
      )}

      {statusMsg && (
        <div style={{ background: 'rgba(34,197,94,.12)', border: '1px solid var(--status-approve)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--status-approve)', marginBottom: 10 }}>
          {statusMsg}
        </div>
      )}

      {/* ---- 概览区 ---- */}
      <Section title="概览">
        <FieldRow label="agent_id" value={agentId} />
        <FieldRow label="role_profile_ref" value={state?.role_profile_ref || '—'} />
        <FieldRow label="memory_profile_ref" value={state?.memory_profile_ref || '—'} />
        <FieldRow label="state_version" value={state?.state_version ?? '—'} />
        <FieldRow label="last_writeback_at" value={_formatDate(state?.last_writeback_at)} />
      </Section>

      {/* ---- State Fields ---- */}
      <Collapsible title="State Fields" open={fieldsOpen} onToggle={() => setFieldsOpen(o => !o)}>
        {state && Object.keys(state.state_fields).length > 0 ? (
          Object.entries(state.state_fields).map(([k, v]) => (
            <FieldRow
              key={k}
              label={k}
              value={v}
              onEdit={
                typeof v === 'string' || typeof v === 'number'
                  ? (newVal) => handleFieldEdit(k, newVal)
                  : undefined
              }
            />
          ))
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)' }}>暂无状态字段</p>
        )}
      </Collapsible>

      {/* ---- Session Summary ---- */}
      <Section title="Session Summary">
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}>
          {state?.session_summary || '—'}
        </p>
      </Section>

      {/* ---- Recent Artifacts ---- */}
      <Section title="Recent Artifacts">
        {state?.recent_artifacts?.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {state.recent_artifacts.map((a, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--fg-2)', padding: '2px 0' }}>{a}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)' }}>暂无产出</p>
        )}
      </Section>

      {/* ---- 快照操作栏 ---- */}
      <Section title="快照操作">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={handleSnapshot} style={_actionBtn('var(--bg-elev-3)')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Camera size={12} strokeWidth={2} /> 创建快照
            </span>
          </button>
          <button onClick={() => setSnapshotsOpen(o => !o)} style={_actionBtn('var(--bg-elev-3)')}>
            {snapshotsOpen ? '▲ 收起列表' : '▼ 展开列表'}
          </button>
          <button onClick={() => setConfirmReset(true)} style={_actionBtn('rgba(239,68,68,.15)', 'var(--status-reject)')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={12} strokeWidth={2} /> 重置状态
            </span>
          </button>
        </div>

        {snapshotsOpen && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            {snapshots.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)' }}>暂无快照</p>
            ) : (
              snapshots.map(snap => (
                <div key={snap.snapshot_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--fg-1)', flex: '0 0 80px' }}>{_shortId(snap.snapshot_id)}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg-3)', flex: 1 }}>{_formatDate(snap.created_at)}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg-3)', flex: '0 0 50px' }}>v{snap.state_version}</span>
                  <button
                    onClick={() => setConfirmRestore(snap.snapshot_id)}
                    style={_actionBtn('rgba(59,130,246,.15)', '#60a5fa')}
                  >
                    恢复
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </Section>

      {/* ---- 确认对话框 ---- */}
      <ConfirmModal
        open={confirmRestore !== null}
        title="恢复快照"
        message="恢复后当前状态将被覆盖，确认继续？"
        confirmLabel="确认恢复"
        onConfirm={handleRestoreConfirm}
        onCancel={() => setConfirmRestore(null)}
      />

      <ConfirmModal
        open={confirmReset}
        title="重置状态"
        message="将清空 state_fields、session_summary 及相关记录，确认继续？"
        confirmLabel="确认重置"
        onConfirm={handleResetConfirm}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function _panelWrap(): React.CSSProperties {
  return {
    background: 'var(--bg-elev-1)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '16px 20px',
    minWidth: 320,
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  };
}

function _actionBtn(bg: string, color = 'var(--fg-2)'): React.CSSProperties {
  return {
    background: bg,
    border: '1px solid var(--border)',
    borderRadius: 6,
    color,
    fontSize: 12,
    padding: '5px 12px',
    cursor: 'pointer',
    fontWeight: 600,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</p>
      {children}
    </div>
  );
}

function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={onToggle}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {open ? '▼' : '▶'} {title}
      </button>
      {open && children}
    </div>
  );
}
