/**
 * BlueprintCanvas — Team tab DAG visualisation.
 *
 * Built on top of the shared SfReactFlowBase shell — only the live-mode
 * specifics live here:
 *   - custom AgentBlueprintNode (avatar + title + status dot, accent border)
 *   - column-based seed layout (longest-path-from-root) for newly-arrived
 *     SSE nodes; existing nodes' positions are preserved across re-renders
 *     so the user can freely drag without being undone by streaming updates
 *   - spotlight: when an agent flips to status='building', the canvas
 *     gently pans to it so the user always sees the active worker
 *   - bottom-left chip showing NODES / EDGES / STATUS counts
 *
 * Empty state: nodes.length === 0 renders an idle pulse with dotted-grid
 * background, no react-flow needed.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from 'reactflow';
import SfReactFlowBase from '../../core/components/Canvas/SfReactFlowBase';
import type { RunSessionNode, RunSessionEdge } from '../../core/hooks/useRunSession';

export interface BlueprintCanvasProps {
  nodes: RunSessionNode[];
  edges: RunSessionEdge[];
}

const NODE_W = 168;
const NODE_H = 78;
const COL_GAP = 96;
const ROW_GAP = 28;

function statusVisual(status: RunSessionNode['status']): { ring: string; dot: string; label: string } {
  switch (status) {
    case 'building':
      return { ring: 'var(--status-run, #60a5fa)', dot: 'var(--status-run, #60a5fa)', label: 'BUILDING' };
    case 'ready':
      return { ring: 'var(--status-ok, #34d399)', dot: 'var(--status-ok, #34d399)', label: 'READY' };
    case 'pending':
    default:
      return { ring: 'var(--t-border, #27272A)', dot: 'var(--t-fg-4, #737373)', label: 'PENDING' };
  }
}

interface AgentBlueprintNodeData {
  node: RunSessionNode;
}

function AgentBlueprintNode({ data, selected }: NodeProps<AgentBlueprintNodeData>) {
  const { node } = data;
  const v = statusVisual(node.status);
  const isCoordinator = node.type === 'coordinator';
  return (
    <div
      className="sf-node"
      data-testid={`blueprint-node-${node.id}`}
      style={{
        width: NODE_W,
        height: NODE_H,
        padding: '10px 12px',
        borderRadius: 12,
        background: 'var(--t-bg-elev-2, #141414)',
        border: `1px solid ${isCoordinator ? 'var(--t-accent, #A855F7)' : v.ring}`,
        boxShadow: selected
          ? '0 0 0 2px var(--t-accent, #A855F7), 0 6px 18px -8px rgba(0,0,0,.4)'
          : isCoordinator
            ? 'var(--glow-accent, 0 0 0 3px rgba(168,85,247,.15))'
            : '0 2px 12px -4px rgba(0,0,0,.3)',
        color: 'var(--t-fg-1, #FAFAFA)',
        opacity: node.status === 'pending' ? 0.6 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontFamily: 'inherit',
      }}
      title={`${node.title} · ${v.label}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'transparent', border: 'none' }} />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span
              aria-hidden
              className={node.status === 'building' ? 'sf-pulse' : undefined}
              style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, flexShrink: 0 }}
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
      <Handle type="source" position={Position.Right} style={{ background: 'transparent', border: 'none' }} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { agentBlueprint: AgentBlueprintNode };

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
  const queue: string[] = [];
  for (const n of nodes) {
    if ((incoming[n.id] ?? []).length === 0) {
      col.set(n.id, 0);
      queue.push(n.id);
    }
  }
  const guard = nodes.length * 4 + 8;
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
  for (const n of nodes) {
    if (!col.has(n.id)) col.set(n.id, 0);
  }
  return col;
}

function seedPositions(
  nodes: RunSessionNode[],
  edges: RunSessionEdge[],
): Map<string, { x: number; y: number }> {
  const cols = computeColumns(nodes, edges);
  const buckets: RunSessionNode[][] = [];
  for (const n of nodes) {
    const c = cols.get(n.id) ?? 0;
    while (buckets.length <= c) buckets.push([]);
    buckets[c].push(n);
  }
  const out = new Map<string, { x: number; y: number }>();
  for (let c = 0; c < buckets.length; c++) {
    const bucket = buckets[c];
    for (let r = 0; r < bucket.length; r++) {
      out.set(bucket[r].id, {
        x: c * (NODE_W + COL_GAP),
        y: r * (NODE_H + ROW_GAP),
      });
    }
  }
  return out;
}

function BlueprintCanvasInner({ nodes, edges }: BlueprintCanvasProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<AgentBlueprintNodeData>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const seededRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const layout = seedPositions(nodes, edges);
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n] as const));
      return nodes.map<Node<AgentBlueprintNodeData>>((n) => {
        const existing = prevById.get(n.id);
        if (existing) {
          return { ...existing, data: { node: n } };
        }
        seededRef.current.add(n.id);
        const pos = layout.get(n.id) ?? { x: 0, y: 0 };
        return {
          id: n.id,
          type: 'agentBlueprint',
          position: pos,
          data: { node: n },
          draggable: true,
        };
      });
    });
  }, [nodes, edges, setRfNodes]);

  useEffect(() => {
    const next: Edge[] = edges.map((e, i) => {
      const active = e.status === 'active';
      return {
        id: `${e.from}->${e.to}-${i}`,
        source: e.from,
        target: e.to,
        type: 'default',
        animated: active,
        style: {
          stroke: active ? 'var(--t-accent, #A855F7)' : 'var(--t-fg-4, #737373)',
          strokeWidth: active ? 1.75 : 1.25,
          strokeOpacity: active ? 0.95 : 0.45,
          strokeDasharray: active ? undefined : '4 4',
        },
      };
    });
    setRfEdges(next);
  }, [edges, setRfEdges]);

  // Spotlight the latest agent that just started building. We track which
  // building-id we last centred on so spotlighting only fires on transition,
  // not on every re-render.
  const lastSpotlightRef = useRef<string | null>(null);
  const spotlightNodeId = useMemo(() => {
    const building = nodes.find((n) => n.status === 'building');
    if (!building) return null;
    if (lastSpotlightRef.current === building.id) return null;
    lastSpotlightRef.current = building.id;
    return building.id;
  }, [nodes]);

  const miniMapNodeColor = (n: Node) => {
    const d = (n.data as AgentBlueprintNodeData | undefined)?.node;
    if (!d) return 'var(--t-fg-4, #737373)';
    return statusVisual(d.status).dot;
  };

  return (
    <SfReactFlowBase
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitViewOnNodeCountGrow
      spotlightNodeId={spotlightNodeId}
      miniMapNodeColor={miniMapNodeColor}
      nodesConnectable={false}
      // Live mode — no provider override (base provides one)
      withProvider
    />
  );
}

const BlueprintCanvas: React.FC<BlueprintCanvasProps> = ({ nodes, edges }) => {
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
          style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--t-fg-4, #737373)' }}
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

  return (
    <div
      data-testid="blueprint-canvas"
      data-component="blueprint-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--t-bg, #0a0a0a)',
        overflow: 'hidden',
      }}
    >
      <BlueprintCanvasInner nodes={nodes} edges={edges} />

      {/* Bottom status bar — pinned over the canvas, doesn't intercept pan */}
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
        {(statusCounts.building > 0 || statusCounts.ready > 0) && statusCounts.pending > 0 ? ' · ' : null}
        {statusCounts.pending > 0 ? `${statusCounts.pending} PENDING` : null}
        {statusCounts.building === 0 && statusCounts.ready === 0 && statusCounts.pending === 0
          ? 'IDLE'
          : null}
      </div>
    </div>
  );
};

export default BlueprintCanvas;
