/**
 * BlueprintCanvas — Team tab DAG visualisation.
 *
 * Renders the live RunSession blueprint as a horizontal DAG:
 *   - one rounded-rect node per RunSessionNode (avatarChar + title + status)
 *   - SVG edges between nodes (currentColor accent + sf-pulse when active)
 *   - dotted grid background (matches design-spec `.team-canvas::before`)
 *   - bottom status bar `NODES n · EDGES m · STATUS …` (mono)
 *
 * Layout: deterministic horizontal column layout — column index = longest
 * path from any root node (so coordinators end up left, leaves end up right).
 * Within a column nodes stack vertically. No force-directed simulation.
 *
 * Empty state: nodes.length === 0 renders a centred idle pulse + caption.
 *
 * Click handler: TODO — currently console.log only; agent-4 may decide
 * whether to surface an `onNodeClick` prop wiring into AgentPanel focus.
 */
import React, { useMemo } from 'react';
import type { RunSessionNode, RunSessionEdge } from '../../core/hooks/useRunSession';

export interface BlueprintCanvasProps {
  nodes: RunSessionNode[];
  edges: RunSessionEdge[];
}

// Node box geometry. Kept here so edge anchor maths stays in one place.
const NODE_W = 168;
const NODE_H = 78;
const COL_GAP = 96;
const ROW_GAP = 28;
const MARGIN_X = 60;
const MARGIN_Y = 56;
// PolicyMatrixMini is 262px wide and floats at right:16. We reserve this much
// padding on the right of the canvas so the DAG never collides with the
// HUD card when content is centered. 262 (card) + 16 (right gap) + 24 (air).
const RACI_SAFE_AREA = 302;

interface PositionedNode {
  node: RunSessionNode;
  x: number;
  y: number;
  col: number;
  row: number;
}

/**
 * Compute each node's column (longest path from a root). Cycles (which
 * shouldn't happen for a DAG but might during streaming) fall back to BFS
 * depth so we never loop forever.
 */
function computeColumns(nodes: RunSessionNode[], edges: RunSessionEdge[]): Map<string, number> {
  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};
  for (const n of nodes) {
    incoming[n.id] = [];
    outgoing[n.id] = [];
  }
  for (const e of edges) {
    if (incoming[e.to]) incoming[e.to].push(e.from);
    if (outgoing[e.from]) outgoing[e.from].push(e.to);
  }

  const col = new Map<string, number>();
  // Roots have column 0
  const queue: string[] = [];
  for (const n of nodes) {
    if ((incoming[n.id] ?? []).length === 0) {
      col.set(n.id, 0);
      queue.push(n.id);
    }
  }
  // BFS — relax columns forward
  const guard = nodes.length * 4 + 8; // safety cap against bad cycles
  let steps = 0;
  while (queue.length && steps++ < guard) {
    const id = queue.shift()!;
    const c = col.get(id) ?? 0;
    for (const next of outgoing[id] ?? []) {
      const prev = col.get(next);
      if (prev === undefined || prev < c + 1) {
        col.set(next, c + 1);
        queue.push(next);
      }
    }
  }
  // Any node still uncoloured (orphan / cycle) → column 0
  for (const n of nodes) {
    if (!col.has(n.id)) col.set(n.id, 0);
  }
  return col;
}

function layoutNodes(nodes: RunSessionNode[], edges: RunSessionEdge[]): PositionedNode[] {
  if (nodes.length === 0) return [];
  const cols = computeColumns(nodes, edges);
  // Bucket per column, preserve insertion order so streaming feels stable.
  const buckets: RunSessionNode[][] = [];
  for (const n of nodes) {
    const c = cols.get(n.id) ?? 0;
    while (buckets.length <= c) buckets.push([]);
    buckets[c].push(n);
  }
  const out: PositionedNode[] = [];
  for (let c = 0; c < buckets.length; c++) {
    const bucket = buckets[c];
    for (let r = 0; r < bucket.length; r++) {
      out.push({
        node: bucket[r],
        col: c,
        row: r,
        x: MARGIN_X + c * (NODE_W + COL_GAP),
        y: MARGIN_Y + r * (NODE_H + ROW_GAP),
      });
    }
  }
  return out;
}

/**
 * Map status → ring color + dot color. Uses --status-* / --t-* tokens with
 * conservative fallbacks. 'building' = run-tint blue, 'ready' = ok green,
 * 'pending' = muted/grey.
 */
function statusVisual(status: RunSessionNode['status']): { ring: string; dot: string; label: string } {
  switch (status) {
    case 'building':
      return {
        ring: 'var(--status-run, #60a5fa)',
        dot: 'var(--status-run, #60a5fa)',
        label: 'BUILDING',
      };
    case 'ready':
      return {
        ring: 'var(--status-ok, #34d399)',
        dot: 'var(--status-ok, #34d399)',
        label: 'READY',
      };
    case 'pending':
    default:
      return {
        ring: 'var(--t-border, #27272A)',
        dot: 'var(--t-fg-4, #737373)',
        label: 'PENDING',
      };
  }
}

const BlueprintCanvas: React.FC<BlueprintCanvasProps> = ({ nodes, edges }) => {
  const positioned = useMemo(() => layoutNodes(nodes, edges), [nodes, edges]);
  const nodeById = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    for (const p of positioned) m.set(p.node.id, p);
    return m;
  }, [positioned]);

  // Status summary for footer bar
  const statusCounts = useMemo(() => {
    let building = 0;
    let ready = 0;
    let pending = 0;
    for (const n of nodes) {
      if (n.status === 'building') building++;
      else if (n.status === 'ready') ready++;
      else pending++;
    }
    return { building, ready, pending };
  }, [nodes]);

  // Empty state
  if (nodes.length === 0) {
    return (
      <div
        data-testid="blueprint-canvas-empty"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--t-bg, #0a0a0a)',
          backgroundImage:
            'linear-gradient(var(--t-border-subtle, rgba(255,255,255,.04)) 1px,transparent 1px),' +
            'linear-gradient(90deg,var(--t-border-subtle, rgba(255,255,255,.04)) 1px,transparent 1px)',
          backgroundSize: '24px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <span
          aria-hidden
          className="sf-pulse"
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--t-fg-4, #737373)',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11,
            color: 'var(--t-fg-4, #737373)',
            letterSpacing: '0.06em',
          }}
        >
          等待 Team 蓝图生成…
        </span>
      </div>
    );
  }

  // Canvas extent — pad so the right-most node + 262px PolicyMatrixMini
  // floating card don't overlap.
  const maxCol = positioned.reduce((m, p) => Math.max(m, p.col), 0);
  const maxRow = positioned.reduce((m, p) => Math.max(m, p.row), 0);
  const contentW = MARGIN_X + (maxCol + 1) * NODE_W + maxCol * COL_GAP + MARGIN_X;
  const contentH = MARGIN_Y + (maxRow + 1) * NODE_H + maxRow * ROW_GAP + MARGIN_Y + 40;

  return (
    <div
      data-testid="blueprint-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--t-bg, #0a0a0a)',
        overflow: 'auto',
      }}
    >
      {/* dotted grid layer */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(var(--t-border-subtle, rgba(255,255,255,.04)) 1px,transparent 1px),' +
            'linear-gradient(90deg,var(--t-border-subtle, rgba(255,255,255,.04)) 1px,transparent 1px)',
          backgroundSize: '24px 24px',
          pointerEvents: 'none',
        }}
      />

      {/* Centering wrapper. flex-center the DAG within the visible canvas
          minus the RACI-card safe area on the right. When content exceeds
          available width (many nodes / narrow viewport), the section's
          overflow:auto kicks in for horizontal scroll — the DAG stays
          intact, never hides behind the HUD. */}
      <div
        style={{
          position: 'relative',
          minWidth: '100%',
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 32,
          paddingRight: RACI_SAFE_AREA,
          paddingTop: 32,
          paddingBottom: 32,
          boxSizing: 'border-box',
        }}
      >
      {/* scroll viewport content */}
      <div style={{ position: 'relative', width: contentW, height: contentH, flexShrink: 0 }}>
        {/* SVG layer — edges. Sits behind nodes (z-index 1). */}
        <svg
          width={contentW}
          height={contentH}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
        >
          <defs>
            <marker
              id="bp-arrow-active"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--t-accent, #A855F7)" />
            </marker>
            <marker
              id="bp-arrow-idle"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--t-fg-4, #737373)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;
            // Anchor: right-mid of source, left-mid of target. If both nodes
            // happen to share a column we instead route top→bottom so the
            // arrow doesn't collapse into a zero-length segment.
            let x1: number;
            let y1: number;
            let x2: number;
            let y2: number;
            if (a.col === b.col) {
              x1 = a.x + NODE_W / 2;
              y1 = a.y + NODE_H;
              x2 = b.x + NODE_W / 2;
              y2 = b.y;
            } else {
              x1 = a.x + NODE_W;
              y1 = a.y + NODE_H / 2;
              x2 = b.x;
              y2 = b.y + NODE_H / 2;
            }
            // Cubic bezier with horizontal-tangent control points.
            const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
            const cp1x = x1 + dx;
            const cp1y = y1;
            const cp2x = x2 - dx;
            const cp2y = y2;
            const active = e.status === 'active';
            return (
              <path
                key={`${e.from}->${e.to}-${i}`}
                d={`M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`}
                fill="none"
                stroke={active ? 'var(--t-accent, #A855F7)' : 'var(--t-fg-4, #737373)'}
                strokeWidth={active ? 1.75 : 1.25}
                strokeOpacity={active ? 0.95 : 0.45}
                strokeDasharray={active ? undefined : '4 4'}
                markerEnd={`url(#${active ? 'bp-arrow-active' : 'bp-arrow-idle'})`}
                className={active ? 'sf-pulse' : undefined}
              />
            );
          })}
        </svg>

        {/* Node layer — z-index 2 above edges. */}
        {positioned.map(({ node, x, y }) => {
          const v = statusVisual(node.status);
          const isCoordinator = node.type === 'coordinator';
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                // eslint-disable-next-line no-console
                console.log(
                  '[BlueprintCanvas] node click — TODO agent-4 may wire onNodeClick',
                  node.id,
                );
              }}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: NODE_W,
                height: NODE_H,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'var(--t-bg-elev-2, #141414)',
                border: `1px solid ${isCoordinator ? 'var(--t-accent, #A855F7)' : v.ring}`,
                boxShadow: isCoordinator
                  ? 'var(--glow-accent, 0 0 0 3px rgba(168,85,247,.15))'
                  : '0 2px 12px -4px rgba(0,0,0,.3)',
                color: 'var(--t-fg-1, #FAFAFA)',
                cursor: 'pointer',
                textAlign: 'left',
                zIndex: 2,
                opacity: node.status === 'pending' ? 0.6 : 1,
                fontFamily: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
              title={`${node.title} · ${v.label}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    background: isCoordinator
                      ? 'var(--t-accent-tint, rgba(168,85,247,.12))'
                      : 'var(--t-bg-elev-3, #1c1c1c)',
                    border: `1px solid ${isCoordinator ? 'var(--t-accent, #A855F7)' : 'var(--t-border, #27272A)'}`,
                    color: isCoordinator ? 'var(--t-accent, #A855F7)' : v.dot,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {node.avatarChar || node.title.charAt(0) || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--t-fg-1, #FAFAFA)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {node.title}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    <span
                      aria-hidden
                      className={node.status === 'building' ? 'sf-pulse' : undefined}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: v.dot,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        color: 'var(--t-fg-4, #737373)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {node.sub || v.label}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      </div>{/* end centering wrapper */}

      {/* Bottom status bar — fixed within the canvas, not in scroll content */}
      <div
        style={{
          position: 'absolute',
          left: 14,
          bottom: 14,
          padding: '4px 10px',
          background: 'var(--t-bg-elev-2, #141414)',
          border: '1px solid var(--t-border, #27272A)',
          borderRadius: 7,
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 10,
          color: 'var(--t-fg-3, #A1A1AA)',
          letterSpacing: '0.04em',
          pointerEvents: 'none',
          zIndex: 4,
        }}
      >
        NODES {nodes.length} · EDGES {edges.length} · STATUS{' '}
        {statusCounts.building > 0 ? `${statusCounts.building} BUILDING` : null}
        {statusCounts.building > 0 && statusCounts.ready > 0 ? ' · ' : null}
        {statusCounts.ready > 0 ? `${statusCounts.ready} READY` : null}
        {(statusCounts.building > 0 || statusCounts.ready > 0) && statusCounts.pending > 0
          ? ' · '
          : null}
        {statusCounts.pending > 0 ? `${statusCounts.pending} PENDING` : null}
        {statusCounts.building === 0 && statusCounts.ready === 0 && statusCounts.pending === 0
          ? 'IDLE'
          : null}
      </div>
    </div>
  );
};

export default BlueprintCanvas;
