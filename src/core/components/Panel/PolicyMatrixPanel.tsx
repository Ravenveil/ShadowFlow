/**
 * PolicyMatrixPanel — Story 4.5 + 4.6.
 *
 * Visualises sender × receiver policy matrix, 3-state cells (permit/deny/warn).
 * Clicking a cell cycles state. "Save & Apply" POST /workflow/runs/{id}/policy.
 *
 * Patches applied (Chunk B review 2026-04-22):
 *   P2  — isDirty reactive: subscribes to matrix + savedMatrix separately, derives
 *          dirty via useMemo so markClean() triggers a re-render.
 *   P3  — highlightedCell consumed: yellow outline on the matching cell.
 *   P4  — workflowStore wiring: useEffect watches canvas nodes, calls setAgents
 *          so the matrix auto-expands when agents are dragged into the canvas.
 *   P5  — onSave try/catch: exceptions no longer prevent markClean().
 *   P16 — effectiveReRun: adds default POST /reconfigure when runId is provided,
 *          regardless of whether onReRun prop is passed.
 */

import { useEffect, useMemo } from 'react';
import { usePolicyStore, CellState, PolicyMatrix } from '../../hooks/usePolicyStore';
import { useWorkflow } from '../../stores/workflowStore';

const STATE_STYLES: Record<CellState, { bg: string; color: string; glyph: string; label: string }> = {
  permit: { bg: 'rgba(34,197,94,0.18)',  color: '#22C55E', glyph: '✓', label: 'Permit' },
  deny:   { bg: 'rgba(239,68,68,0.22)',  color: '#EF4444', glyph: '✗', label: 'Deny' },
  warn:   { bg: 'rgba(245,158,11,0.22)', color: '#F59E0B', glyph: '⚠', label: 'Warn (non-blocking)' },
};

export interface PolicyMatrixPanelProps {
  /** When provided, Save button calls this handler. Otherwise POSTs to `/workflow/runs/{runId}/policy`. */
  onSave?: (matrix: PolicyMatrix) => void | Promise<void>;
  runId?: string | null;
  apiBase?: string;
  /** For Story 4.6: optional re-run handler override (triggers full reconfigure). */
  onReRun?: (matrix: PolicyMatrix) => void | Promise<void>;
  onSaveAsTemplate?: (matrix: PolicyMatrix) => void;
}

export function PolicyMatrixPanel({
  onSave,
  runId,
  apiBase = '',
  onReRun,
  onSaveAsTemplate,
}: PolicyMatrixPanelProps): JSX.Element {
  const agents         = usePolicyStore((s) => s.agents);
  const matrix         = usePolicyStore((s) => s.matrix);
  const savedMatrix    = usePolicyStore((s) => s.savedMatrix);   // P2
  const highlightedCell = usePolicyStore((s) => s.highlightedCell); // P3
  const cycle          = usePolicyStore((s) => s.cycleCell);
  const markClean      = usePolicyStore((s) => s.markClean);
  const setAgents      = usePolicyStore((s) => s.setAgents);

  // P2: reactive dirty check — re-renders whenever matrix or savedMatrix changes
  const dirty = useMemo(() => {
    const allKeys = new Set([...Object.keys(matrix), ...Object.keys(savedMatrix)]);
    for (const sender of allKeys) {
      const a = matrix[sender] ?? {};
      const b = savedMatrix[sender] ?? {};
      const rKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const receiver of rKeys) {
        if (a[receiver] !== b[receiver]) return true;
      }
    }
    return false;
  }, [matrix, savedMatrix]);

  // P4: wire canvas nodes → policy matrix auto-expand
  const workflowNodes = useWorkflow((s) => s.nodes);
  useEffect(() => {
    const agentIds = workflowNodes
      .filter((n) => n.type === 'agent' || n.data?.category === 'agent' || n.data?.nodeType === 'agent')
      .map((n) => n.id);
    if (agentIds.length > 0) {
      setAgents(agentIds);
    }
  }, [workflowNodes, setAgents]);

  // P5: wrap onSave in try/catch so exceptions don't prevent markClean()
  const effectiveSave = async () => {
    try {
      if (onSave) {
        await onSave(matrix);
      } else if (runId) {
        const res = await fetch(`${apiBase}/workflow/runs/${runId}/policy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matrix }),
        });
        if (!res.ok) {
          console.error('Policy save failed', res.status);
          return;
        }
      }
      markClean();
    } catch (e) {
      console.error('Policy save error', e);
      // markClean() intentionally NOT called on error — store stays dirty
    }
  };

  // P16: effectiveReRun — default fetch to /reconfigure when runId available
  const effectiveReRun = async () => {
    try {
      if (onReRun) {
        await onReRun(matrix);
      } else if (runId) {
        const res = await fetch(`${apiBase}/workflow/runs/${runId}/reconfigure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policy_matrix: matrix }),
        });
        if (!res.ok) {
          console.error('Reconfigure failed', res.status);
          return;
        }
      } else {
        return; // no-op when neither prop nor runId is available
      }
      markClean();
    } catch (e) {
      console.error('Reconfigure error', e);
    }
  };

  const canReRun = Boolean(onReRun || runId);

  const rows = useMemo(() => (agents.length ? agents : Object.keys(matrix)), [agents, matrix]);

  return (
    <section
      data-testid="policy-matrix-panel"
      aria-label="Policy Matrix Panel"
      style={{
        background: 'var(--skin-panel, #0F0F11)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 420,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>
            Policy Matrix
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg-0)' }}>
            {rows.length} × {rows.length} sender × receiver
          </div>
        </div>
        {onSaveAsTemplate && (
          <button
            type="button"
            onClick={() => onSaveAsTemplate(matrix)}
            data-testid="policy-save-template"
            style={{
              padding: '6px 12px',
              fontSize: 12,
              color: 'var(--fg-2)',
              background: 'var(--bg-elev-1)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Save as Template
          </button>
        )}
        {/* P16: Re-run button shown whenever onReRun prop OR runId is available */}
        {canReRun && (
          <button
            type="button"
            disabled={!dirty}
            onClick={effectiveReRun}
            data-testid="policy-rerun"
            title={!runId && !onReRun ? 'No runId provided — cannot reconfigure' : undefined}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              color: dirty ? '#fff' : 'var(--fg-5)',
              background: dirty ? '#A07AFF' : 'var(--bg-elev-1)',
              border: '1px solid rgba(168,85,247,.4)',
              borderRadius: 8,
              cursor: dirty ? 'pointer' : 'not-allowed',
            }}
          >
            Save &amp; Re-run
          </button>
        )}
        <button
          type="button"
          disabled={!dirty}
          onClick={effectiveSave}
          data-testid="policy-save"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: dirty ? '#fff' : 'var(--fg-5)',
            background: dirty ? 'var(--accent)' : 'var(--bg-elev-1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: dirty ? 'pointer' : 'not-allowed',
          }}
        >
          Save &amp; Apply
        </button>
      </header>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>No agents configured.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            data-testid="policy-matrix-table"
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <thead>
              <tr>
                <th style={{ padding: 4, textAlign: 'left', color: 'var(--fg-5)' }}></th>
                {rows.map((r) => (
                  <th
                    key={`col-${r}`}
                    style={{ padding: 4, textAlign: 'center', color: 'var(--fg-3)', fontWeight: 600 }}
                  >
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((sender) => (
                <tr key={`row-${sender}`}>
                  <th style={{ padding: 4, textAlign: 'left', color: 'var(--fg-3)', fontWeight: 600 }}>
                    {sender}
                  </th>
                  {rows.map((receiver) => {
                    const state: CellState = matrix[sender]?.[receiver] ?? 'permit';
                    const styling = STATE_STYLES[state];
                    // P3: highlight the cell that was clicked in a rejection toast
                    const isHighlighted =
                      highlightedCell?.sender === sender &&
                      highlightedCell?.receiver === receiver;
                    return (
                      <td
                        key={`${sender}-${receiver}`}
                        style={{ padding: 2 }}
                      >
                        <button
                          type="button"
                          aria-label={`${sender} to ${receiver}: ${styling.label}`}
                          data-testid={`cell-${sender}-${receiver}`}
                          data-state={state}
                          title={`${sender} → ${receiver}: ${styling.label}`}
                          onClick={() => cycle(sender, receiver)}
                          style={{
                            width: 34,
                            height: 24,
                            border: isHighlighted
                              ? '2px solid #F59E0B'
                              : `1px solid ${styling.color}55`,
                            background: styling.bg,
                            color: styling.color,
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                            fontWeight: 700,
                            outline: isHighlighted ? '1px solid #F59E0B40' : undefined,
                            transition: 'border 0.15s, outline 0.15s',
                          }}
                        >
                          {styling.glyph}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>
        ✓ permit &nbsp;·&nbsp; ✗ deny &nbsp;·&nbsp; ⚠ warn (non-blocking) &nbsp;·&nbsp; click to cycle
      </footer>
    </section>
  );
}

export default PolicyMatrixPanel;
