/**
 * RunSessionPage — Full-screen split-view for an active run session.
 *
 * Layout: 420px left panel (chat + progress stream) | flex-1 right panel
 * (blueprint canvas with nodes + edges).
 *
 * NOT wrapped in HfLayout — this is a standalone full-screen page.
 * Route: /run-session/:sessionId?goal=...
 */
import React, { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Check, Circle, X, ExternalLink } from 'lucide-react';
import { useRunSession } from '../core/hooks/useRunSession';
import type { RunSessionNode, RunSessionEdge, RunSessionStep } from '../core/hooks/useRunSession';

// ---------------------------------------------------------------------------
// Small spinner (inline div, no icon)
// ---------------------------------------------------------------------------
function InlineSpinner({ size = 10, color = '#c4b5fd' }: { size?: number; color?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${size <= 10 ? 1.5 : 2}px solid transparent`,
        borderTopColor: color,
        borderRightColor: color,
        animation: 'rs-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Step icon
// ---------------------------------------------------------------------------
function StepIcon({ status }: { status: RunSessionStep['status'] }) {
  const base: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    zIndex: 1,
  };

  if (status === 'done') {
    return (
      <div
        style={{
          ...base,
          background: 'rgba(34,197,94,.16)',
          border: '1px solid rgba(34,197,94,.45)',
          color: '#22c55e',
        }}
      >
        <Check size={10} strokeWidth={2.5} />
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div
        style={{
          ...base,
          background: 'rgba(124,58,237,.18)',
          border: '1px solid rgba(124,58,237,.5)',
          color: '#c4b5fd',
        }}
      >
        <InlineSpinner size={10} color="#c4b5fd" />
      </div>
    );
  }
  return (
    <div
      style={{
        ...base,
        background: 'transparent',
        border: '1px dashed #30363d',
        color: '#6e7681',
      }}
    >
      <Circle size={10} strokeWidth={1.5} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress steps card
// ---------------------------------------------------------------------------
function ProgressSteps({ steps }: { steps: RunSessionStep[] }) {
  return (
    <div
      style={{
        border: '1px solid #30363d',
        borderRadius: 14,
        background: '#161b22',
        padding: 6,
      }}
    >
      {steps.map((step, idx) => {
        const isActive = step.status === 'running';
        return (
          <div key={step.name} style={{ position: 'relative' }}>
            {/* Vertical connector line between icons */}
            {idx < steps.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  left: 16 + 6 - 1, // center of icon (padding 10 + icon 22 / 2 - 1)
                  top: 22 + 9, // icon height + top padding
                  width: 1,
                  height: 14,
                  background: '#30363d',
                  zIndex: 0,
                }}
              />
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '22px 1fr auto',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 10,
                background: isActive ? 'rgba(124,58,237,.06)' : 'transparent',
                border: isActive ? '1px solid rgba(124,58,237,.22)' : '1px solid transparent',
              }}
            >
              <StepIcon status={step.status} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: step.status === 'pending' ? 500 : 600,
                  color: step.status === 'pending' ? '#6e7681' : '#e6edf3',
                  alignSelf: 'center',
                  lineHeight: 1.3,
                }}
              >
                {step.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 10,
                  color: step.status === 'running' ? '#c4b5fd' : '#6e7681',
                  alignSelf: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.elapsed ?? (step.status === 'running' ? '…' : '')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent node avatar colors (cycle through a palette)
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  { bg: 'rgba(59,130,246,.22)', border: 'rgba(59,130,246,.5)', color: '#93c5fd' },
  { bg: 'rgba(16,185,129,.16)', border: 'rgba(16,185,129,.45)', color: '#6ee7b7' },
  { bg: 'rgba(245,158,11,.16)', border: 'rgba(245,158,11,.45)', color: '#fcd34d' },
  { bg: 'rgba(239,68,68,.16)', border: 'rgba(239,68,68,.45)', color: '#fca5a5' },
];

// ---------------------------------------------------------------------------
// Blueprint canvas node
// ---------------------------------------------------------------------------
interface BlueprintNodeProps {
  node: RunSessionNode;
  style?: React.CSSProperties;
  colorIdx?: number;
}

function BlueprintNode({ node, style, colorIdx = 0 }: BlueprintNodeProps) {
  const isCoord = node.type === 'coordinator';
  const isPending = node.status === 'pending';
  const avatarColor = isCoord
    ? { bg: 'rgba(124,58,237,.22)', border: 'rgba(124,58,237,.5)', color: '#c4b5fd' }
    : AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];

  return (
    <div
      style={{
        position: 'absolute',
        width: isCoord ? 200 : 184,
        borderRadius: 14,
        padding: '10px 12px',
        background: isCoord
          ? 'linear-gradient(180deg, #141022, #0d1117)'
          : '#0d1117',
        border: isPending
          ? '1px dashed #30363d'
          : `1px solid ${isCoord ? 'rgba(124,58,237,.45)' : avatarColor.border}`,
        borderLeft: isCoord ? '2px solid #7c3aed' : undefined,
        boxShadow: isPending
          ? 'none'
          : isCoord
          ? '0 0 0 1px rgba(124,58,237,.45), 0 0 28px -6px rgba(124,58,237,.6)'
          : `0 0 16px -4px ${avatarColor.bg}`,
        opacity: isPending ? 0.45 : 1,
        transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
        ...style,
      }}
    >
      {/* Node header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: avatarColor.bg,
            border: `1px solid ${avatarColor.border}`,
            color: avatarColor.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {isCoord ? '⌘' : node.avatarChar}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#e6edf3',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.title}
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#6e7681',
              fontFamily: 'var(--font-mono, monospace)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.sub}
          </div>
        </div>
      </div>

      {/* Chips */}
      {node.chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {node.chips.map((chip) => (
            <span
              key={chip}
              style={{
                fontSize: 9,
                fontFamily: 'var(--font-mono, monospace)',
                padding: '2px 6px',
                borderRadius: 4,
                background: isCoord ? 'rgba(124,58,237,.14)' : 'rgba(255,255,255,.06)',
                color: isCoord ? '#c4b5fd' : '#8b949e',
                border: `1px solid ${isCoord ? 'rgba(124,58,237,.25)' : '#30363d'}`,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {/* Status dot */}
      {!isPending && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isCoord ? '#7c3aed' : avatarColor.color,
            boxShadow: `0 0 6px 1px ${isCoord ? 'rgba(124,58,237,.6)' : avatarColor.bg}`,
            animation: 'rs-pulse 1.8s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG edges overlay
// ---------------------------------------------------------------------------
interface EdgePoint {
  x: number;
  y: number;
}

interface CanvasEdgesProps {
  edges: RunSessionEdge[];
  nodePositions: Record<string, EdgePoint>;
  canvasW: number;
  canvasH: number;
}

function CanvasEdges({ edges, nodePositions, canvasW, canvasH }: CanvasEdgesProps) {
  if (edges.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      preserveAspectRatio="none"
    >
      <defs>
        <marker id="arrow-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#7c3aed" />
        </marker>
        <marker id="arrow-pending" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#30363d" />
        </marker>
        <style>{`
          @keyframes rs-dash { to { stroke-dashoffset: -20; } }
        `}</style>
      </defs>
      {edges.map((edge) => {
        const from = nodePositions[edge.from];
        const to = nodePositions[edge.to];
        if (!from || !to) return null;
        const isActive = edge.status === 'active';
        // Cubic bezier control points
        const midY = (from.y + to.y) / 2;
        const d = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
        return (
          <path
            key={`${edge.from}-${edge.to}`}
            d={d}
            fill="none"
            stroke={isActive ? '#7c3aed' : '#30363d'}
            strokeWidth={isActive ? 1.4 : 1}
            strokeDasharray={isActive ? '6 4' : '3 5'}
            style={
              isActive
                ? { animation: 'rs-dash 1.2s linear infinite', strokeDashoffset: 0 }
                : undefined
            }
            markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow-pending)'}
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Right panel — Blueprint canvas
// ---------------------------------------------------------------------------
interface BlueprintCanvasProps {
  session: ReturnType<typeof useRunSession>;
}

const CANVAS_W = 900;
const CANVAS_H = 600;
const COORD_CX = CANVAS_W / 2; // 450
const COORD_TOP = 100;
const COORD_W = 200;
const AGENT_TOP = 340;
const AGENT_W = 184;

function getAgentPositions(count: number): Array<{ cx: number }> {
  if (count === 0) return [];
  if (count === 1) return [{ cx: CANVAS_W / 2 }];
  if (count === 2) {
    return [
      { cx: CANVAS_W * 0.3 },
      { cx: CANVAS_W * 0.7 },
    ];
  }
  // 3+: evenly spaced across 12%–88%
  const span = CANVAS_W * 0.76;
  const step = span / (count - 1);
  const start = CANVAS_W * 0.12;
  return Array.from({ length: count }, (_, i) => ({ cx: start + i * step }));
}

function BlueprintCanvas({ session }: BlueprintCanvasProps) {
  const coordinator = session.nodes.find((n) => n.type === 'coordinator');
  const agents = session.nodes.filter((n) => n.type === 'agent');
  const agentPositions = getAgentPositions(agents.length);

  // Build a position map for edge rendering (center-bottom of from, center-top of to)
  const nodePositions: Record<string, { x: number; y: number }> = {};
  if (coordinator) {
    nodePositions[coordinator.id] = {
      x: COORD_CX,
      y: COORD_TOP + 80, // approximate node height
    };
  }
  agents.forEach((agent, i) => {
    const pos = agentPositions[i];
    if (pos) {
      nodePositions[agent.id] = {
        x: pos.cx,
        y: AGENT_TOP, // top of agent node = where edge arrives
      };
    }
  });

  const workflowMode = session.mode ?? '—';
  const nodeCount = session.nodes.length;
  const edgeCount = session.edges.length;

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        background: '#161b22',
        overflow: 'hidden',
      }}
    >
      {/* Dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
        }}
      />
      {/* Purple center glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(124,58,237,.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Canvas content — scaled to fit */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: CANVAS_W,
            height: CANVAS_H,
            flexShrink: 0,
            transform: 'scale(0.82)',
            transformOrigin: 'center center',
          }}
        >
          {/* SVG edge layer */}
          <CanvasEdges
            edges={session.edges}
            nodePositions={nodePositions}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
          />

          {/* Coordinator node */}
          {coordinator ? (
            <BlueprintNode
              node={coordinator}
              style={{ left: COORD_CX - COORD_W / 2, top: COORD_TOP }}
            />
          ) : (
            /* Placeholder coordinator while loading */
            <div
              style={{
                position: 'absolute',
                left: COORD_CX - 100,
                top: COORD_TOP,
                width: 200,
                height: 84,
                borderRadius: 14,
                background: '#0d1117',
                border: '1px dashed #30363d',
                animation: 'rs-pulse 1.4s ease-in-out infinite',
              }}
            />
          )}

          {/* Agent nodes */}
          {agents.map((agent, i) => {
            const pos = agentPositions[i];
            if (!pos) return null;
            return (
              <BlueprintNode
                key={agent.id}
                node={agent}
                colorIdx={i}
                style={{ left: pos.cx - AGENT_W / 2, top: AGENT_TOP }}
              />
            );
          })}

          {/* Agent skeleton placeholders (shown when no agents yet) */}
          {agents.length === 0 &&
            [0, 1, 2].map((i) => {
              const dummyPositions = getAgentPositions(3);
              const pos = dummyPositions[i];
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: pos.cx - AGENT_W / 2,
                    top: AGENT_TOP,
                    width: AGENT_W,
                    height: 84,
                    borderRadius: 14,
                    background: '#0d1117',
                    border: '1px dashed #30363d',
                    opacity: 0.4,
                    animation: 'rs-pulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              );
            })}
        </div>
      </div>

      {/* Canvas meta — bottom left */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 20,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 10,
          color: '#6e7681',
          lineHeight: 1.6,
          pointerEvents: 'none',
        }}
      >
        NODES {nodeCount} · EDGES {edgeCount} · MODE {workflowMode}
      </div>

      {/* Zoom controls — bottom right */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {['−', '82%', '+'].map((label) => (
          <button
            key={label}
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6e7681',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              padding: '4px 8px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel — full panel wrapper with toolbar
// ---------------------------------------------------------------------------
interface RightPanelProps {
  session: ReturnType<typeof useRunSession>;
  onOpenEditor: () => void;
}

function RightPanel({ session, onOpenEditor }: RightPanelProps) {
  const filename = session.blueprintFile ?? 'untitled.yml';

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#161b22',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: 44,
          background: '#0d1117',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          flexShrink: 0,
        }}
      >
        {/* Left: BLUEPRINT / filename / badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              color: '#6e7681',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            BLUEPRINT
          </span>
          <span style={{ color: '#30363d', fontSize: 12, flexShrink: 0 }}>/</span>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              color: '#8b949e',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {filename}
          </span>
          {!session.isComplete && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(124,58,237,.14)',
                border: '1px solid rgba(124,58,237,.3)',
                fontSize: 10,
                color: '#c4b5fd',
                fontFamily: 'var(--font-mono, monospace)',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#7c3aed',
                  animation: 'rs-pulse 1.4s ease-in-out infinite',
                }}
              />
              构建中…
            </span>
          )}
        </div>

        {/* Right: icon buttons + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            title="Fit to screen"
            style={toolbarIconBtn}
          >
            ⊡
          </button>
          <button
            type="button"
            title="Toggle split"
            style={toolbarIconBtn}
          >
            ⇄
          </button>
          <div style={{ width: 1, height: 16, background: '#30363d' }} />
          <button
            type="button"
            style={{
              ...toolbarBtn,
              color: '#8b949e',
            }}
          >
            查看 YAML
          </button>
          <button
            type="button"
            onClick={session.isComplete ? onOpenEditor : undefined}
            disabled={!session.isComplete}
            style={{
              ...toolbarBtn,
              background: session.isComplete ? 'rgba(124,58,237,.16)' : 'transparent',
              color: session.isComplete ? '#c4b5fd' : '#30363d',
              border: `1px solid ${session.isComplete ? 'rgba(124,58,237,.35)' : '#30363d'}`,
              cursor: session.isComplete ? 'pointer' : 'not-allowed',
            }}
          >
            在 Editor 中打开
            <ExternalLink size={11} strokeWidth={2} style={{ marginLeft: 4 }} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <BlueprintCanvas session={session} />
    </section>
  );
}

const toolbarIconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#6e7681',
  fontSize: 14,
  width: 28,
  height: 28,
  borderRadius: 5,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

const toolbarBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  transition: 'background 120ms ease, color 120ms ease',
};

// ---------------------------------------------------------------------------
// Left panel
// ---------------------------------------------------------------------------
interface LeftPanelProps {
  sessionId: string;
  goal: string;
  session: ReturnType<typeof useRunSession>;
  collapsed: boolean;
  onCollapse: () => void;
}

function LeftPanel({ sessionId, goal, session, collapsed, onCollapse }: LeftPanelProps) {
  const [message, setMessage] = useState('');
  const agentCount = session.nodes.filter((n) => n.type === 'agent').length;

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#0d1117',
        borderRight: '1px solid #30363d',
        width: 420,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid #30363d',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        {/* Spinning S mark */}
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'rgba(124,58,237,.12)',
            border: '1.5px solid transparent',
            backgroundClip: 'padding-box',
            boxShadow: '0 0 0 1.5px rgba(124,58,237,.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            color: '#c4b5fd',
            animation: 'rs-spin 3s linear infinite',
            flexShrink: 0,
          }}
        >
          S
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#e6edf3',
              lineHeight: 1.2,
            }}
          >
            Run Session
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: '#6e7681',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            run_{sessionId} · {session.isComplete ? '已完成' : '构建中'}
          </div>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse left panel"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6e7681',
            fontSize: 16,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Stream area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* User goal bubble */}
        {goal && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div
              style={{
                maxWidth: 340,
                padding: '10px 14px',
                borderRadius: '14px 14px 4px 14px',
                background: 'rgba(124,58,237,.16)',
                border: '1px solid rgba(124,58,237,.32)',
                color: '#ede9fe',
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              {goal}
            </div>
          </div>
        )}

        {/* Mode divider */}
        {session.mode && (
          <div
            style={{
              textAlign: 'center',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: '#6e7681',
              padding: '4px 0',
            }}
          >
            已识别 · {session.mode} 模式{agentCount > 0 ? ` · ${agentCount} 个 Agent` : ''}
          </div>
        )}

        {/* Progress steps */}
        {session.steps.length > 0 && <ProgressSteps steps={session.steps} />}

        {/* Thinking bubble */}
        {session.thinkingMessage && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div
              style={{
                padding: '9px 13px',
                borderRadius: '4px 14px 14px 14px',
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#8b949e',
                fontSize: 12,
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <InlineSpinner size={10} color="#8b949e" />
              {session.thinkingMessage}
            </div>
          </div>
        )}

        {/* Token counter divider */}
        {session.tokenCount > 0 && (
          <div
            style={{
              textAlign: 'center',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: '#6e7681',
              padding: '4px 0',
            }}
          >
            {session.isComplete ? '已完成' : '流式中'} · 已写入 {session.tokenCount.toLocaleString()} tokens
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: '1px solid #30363d',
          padding: '12px 14px 14px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            style={{
              background: 'transparent',
              border: '1px solid #30363d',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 11,
              color: '#6e7681',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            <X size={11} strokeWidth={2} />
            取消
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="有调整意见？直接说…"
            style={{
              flex: 1,
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 12,
              color: '#e6edf3',
              fontFamily: 'inherit',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button
            type="button"
            style={{
              background: 'rgba(124,58,237,.16)',
              border: '1px solid rgba(124,58,237,.35)',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 11,
              color: '#c4b5fd',
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            ↵
          </button>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9.5,
            color: '#6e7681',
            marginTop: 8,
          }}
        >
          插话不打断 · ↵ 发送 · esc 取消
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Keyframe injection (once, client-side)
// ---------------------------------------------------------------------------
const KEYFRAMES = `
@keyframes rs-spin { to { transform: rotate(360deg); } }
@keyframes rs-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes rs-dash { to { stroke-dashoffset: -20; } }
`;

function InjectKeyframes() {
  return (
    <style
      // biome-ignore lint/security/noDangerouslySetInnerHtml: animation keyframes only
      dangerouslySetInnerHTML={{ __html: KEYFRAMES }}
    />
  );
}

// ---------------------------------------------------------------------------
// RunSessionPage — root
// ---------------------------------------------------------------------------
export default function RunSessionPage() {
  const { sessionId = 'demo' } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const goal = searchParams.get('goal') ?? '';
  const navigate = useNavigate();
  const session = useRunSession(sessionId);
  const [collapsed, setCollapsed] = useState(false);

  function handleOpenEditor() {
    if (session.redirectUrl) {
      navigate(session.redirectUrl);
    } else {
      navigate('/editor');
    }
  }

  return (
    <>
      <InjectKeyframes />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: collapsed ? '44px 1fr' : '420px 1fr',
          height: '100vh',
          background: '#0d1117',
          color: '#e6edf3',
          fontFamily: 'inherit',
          overflow: 'hidden',
          transition: 'grid-template-columns 0.2s ease',
        }}
      >
        <LeftPanel
          sessionId={sessionId}
          goal={goal}
          session={session}
          collapsed={collapsed}
          onCollapse={() => setCollapsed((v) => !v)}
        />
        <RightPanel session={session} onOpenEditor={handleOpenEditor} />
      </div>
    </>
  );
}
