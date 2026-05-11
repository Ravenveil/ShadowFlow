/**
 * RunSessionPage — Full-screen split-view for an active run session.
 *
 * Layout: 420px left panel (chat + progress stream) | flex-1 right panel
 * (blueprint canvas with nodes + edges).
 *
 * NOT wrapped in HfLayout — this is a standalone full-screen page.
 * Route: /run-session/:sessionId?goal=...
 *
 * Theme: All colors use var(--t-*) CSS tokens which respond to
 * data-theme="day" / "night" on <html>.
 */
import React, { useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Check, Circle, X, ExternalLink, Key } from 'lucide-react';
import { useRunSession } from '../core/hooks/useRunSession';
import type { RunSessionNode, RunSessionEdge, RunSessionStep } from '../core/hooks/useRunSession';
import {
  getStoredApiKey,
  getStoredString,
  setStoredString,
  LAST_SKILL_STORAGE,
  LAST_DS_STORAGE,
} from '../api/_base';
import { ApiKeySettings } from '../components/ApiKeySettings';
import { useI18n } from '../common/i18n';
import { ArtifactPreview } from '../components/ArtifactPreview';
import { SkillPicker } from '../components/SkillPicker';
import { DesignSystemPicker } from '../components/DesignSystemPicker';
// Story 15.29 — Conversation linkage UI in PreparationPanel.
import { ConversationPicker } from '../components/ConversationPicker';
import { createRunSession } from '../api/runSessions';
// Story 15.14 — 5+1 维质量自检雷达图（生成完后挂在右栏底部）
import { CritiqueResult } from '../components/CritiqueResult';

// ---------------------------------------------------------------------------
// Small spinner (inline div, no icon)
// ---------------------------------------------------------------------------
function InlineSpinner({ size = 10 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${size <= 10 ? 1.5 : 2}px solid transparent`,
        borderTopColor: 'var(--t-accent)',
        borderRightColor: 'var(--t-accent)',
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
          color: 'var(--t-ok)',
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
          background: 'var(--t-accent-tint)',
          border: '1px solid var(--t-accent)',
          color: 'var(--t-accent-bright)',
        }}
      >
        <InlineSpinner size={10} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...base,
        background: 'transparent',
        border: '1px dashed var(--t-border-2)',
        color: 'var(--t-fg-5)',
      }}
    >
      <Circle size={10} strokeWidth={1.5} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress steps card
// ---------------------------------------------------------------------------
interface ProgressStepsProps {
  steps: RunSessionStep[];
  activeSubsteps: Array<{ parent_step: string; name: string; elapsed_ms?: number }>;
}

function ProgressSteps({ steps, activeSubsteps }: ProgressStepsProps) {
  return (
    <div
      style={{
        border: '1px solid var(--t-border)',
        borderRadius: 14,
        background: 'var(--t-panel)',
        padding: 6,
      }}
    >
      {steps.map((step, idx) => {
        const isActive = step.status === 'running';
        const substeps = activeSubsteps.filter(s => s.parent_step === step.name);
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
                  background: 'var(--t-border)',
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
                background: isActive ? 'var(--t-accent-tint)' : 'transparent',
                border: isActive ? '1px solid var(--t-accent)' : '1px solid transparent',
              }}
            >
              <StepIcon status={step.status} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: step.status === 'pending' ? 500 : 600,
                  color: step.status === 'pending' ? 'var(--t-fg-4)' : 'var(--t-fg)',
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
                  color: step.status === 'running' ? 'var(--t-accent-bright)' : 'var(--t-fg-4)',
                  alignSelf: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.elapsed ?? (step.status === 'running' ? '…' : '')}
              </span>
            </div>
            {/* Active substeps — shown below the running step row */}
            {isActive && substeps.length > 0 && (
              <div style={{ paddingBottom: 4 }}>
                {substeps.map((sub, j) => (
                  <div
                    key={j}
                    style={{
                      paddingLeft: 30,
                      fontSize: 11,
                      color: 'var(--t-fg-4)',
                      fontFamily: 'var(--font-mono, monospace)',
                      lineHeight: 1.8,
                    }}
                  >
                    › {sub.name}{sub.elapsed_ms ? ` ${(sub.elapsed_ms / 1000).toFixed(1)}s` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent node avatar colors (cycle through a palette — uses rgba so they work
// in both day and night themes)
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  { bg: 'rgba(59,130,246,.22)', border: 'rgba(59,130,246,.5)', color: 'var(--t-run)' },
  { bg: 'rgba(16,185,129,.16)', border: 'rgba(16,185,129,.45)', color: 'var(--t-ok)' },
  { bg: 'rgba(245,158,11,.16)', border: 'rgba(245,158,11,.45)', color: 'var(--t-warn)' },
  { bg: 'rgba(239,68,68,.16)', border: 'rgba(239,68,68,.45)', color: 'var(--t-err)' },
];

// ---------------------------------------------------------------------------
// Blueprint canvas node
// ---------------------------------------------------------------------------
interface BlueprintNodeProps {
  node: RunSessionNode;
  style?: React.CSSProperties;
  colorIdx?: number;
  selected?: boolean;
  onClick?: () => void;
}

function BlueprintNode({ node, style, colorIdx = 0, selected = false, onClick }: BlueprintNodeProps) {
  const isCoord = node.type === 'coordinator';
  const isPending = node.status === 'pending';
  const avatarColor = isCoord
    ? { bg: 'var(--t-accent-tint)', border: 'var(--t-accent)', color: 'var(--t-accent-bright)' }
    : AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        width: isCoord ? 200 : 184,
        borderRadius: 14,
        padding: '10px 12px',
        background: isCoord
          ? 'var(--t-panel-2)'
          : 'var(--t-panel)',
        border: selected
          ? '2px solid var(--t-accent-bright)'
          : isPending
          ? '1px dashed var(--t-border)'
          : `1px solid ${isCoord ? 'var(--t-accent)' : avatarColor.border}`,
        borderLeft: isCoord && !selected ? '2px solid var(--t-accent)' : undefined,
        boxShadow: selected
          ? '0 0 0 3px var(--t-accent-tint), 0 0 28px -4px rgba(124,58,237,.5)'
          : isPending
          ? 'none'
          : isCoord
          ? '0 0 0 1px var(--t-accent-tint), 0 0 28px -6px rgba(124,58,237,.3)'
          : 'none',
        opacity: isPending ? 0.45 : 1,
        transition: 'opacity 0.3s ease, box-shadow 0.3s ease, border 0.15s ease',
        cursor: onClick ? 'pointer' : 'default',
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
              color: 'var(--t-fg)',
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
              color: 'var(--t-fg-4)',
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
                background: isCoord ? 'var(--t-accent-tint)' : 'var(--t-panel-2)',
                color: isCoord ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
                border: `1px solid ${isCoord ? 'var(--t-accent)' : 'var(--t-border)'}`,
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
            background: isCoord ? 'var(--t-accent)' : avatarColor.color,
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
        <style>{`
          @keyframes rs-dash { to { stroke-dashoffset: -20; } }
          .rs-edge-active { stroke: var(--t-accent); }
          .rs-edge-pending { stroke: var(--t-border-2); }
          .rs-arrow-active { fill: var(--t-accent); }
          .rs-arrow-pending { fill: var(--t-border-2); }
        `}</style>
        <marker id="arrow-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="rs-arrow-active" />
        </marker>
        <marker id="arrow-pending" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="rs-arrow-pending" />
        </marker>
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
            className={isActive ? 'rs-edge-active' : 'rs-edge-pending'}
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
  zoom: number;
  onZoomChange: (updater: (prev: number) => number) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
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

function BlueprintCanvas({ session, zoom, onZoomChange, selectedNodeId, onSelectNode }: BlueprintCanvasProps) {
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
        background: 'var(--t-bg)',
        overflow: 'hidden',
      }}
    >
      {/* Dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(var(--t-dot) 1px, transparent 1px)',
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
            'radial-gradient(ellipse 60% 50% at 50% 45%, var(--t-accent-tint) 0%, transparent 70%)',
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
            transform: `scale(${zoom / 100})`,
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
              selected={selectedNodeId === coordinator.id}
              onClick={() => onSelectNode(coordinator.id === selectedNodeId ? null : coordinator.id)}
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
                background: 'var(--t-panel)',
                border: '1px dashed var(--t-border)',
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
                selected={selectedNodeId === agent.id}
                onClick={() => onSelectNode(agent.id === selectedNodeId ? null : agent.id)}
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
                    background: 'var(--t-panel)',
                    border: '1px dashed var(--t-border)',
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
          color: 'var(--t-fg-4)',
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
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <button
          key="zoom-out"
          type="button"
          onClick={() => onZoomChange(z => Math.max(40, z - 10))}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-4)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            padding: '4px 8px',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          −
        </button>
        <span
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-4)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            padding: '4px 8px',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {zoom}%
        </span>
        <button
          key="zoom-in"
          type="button"
          onClick={() => onZoomChange(z => Math.min(150, z + 10))}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-4)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            padding: '4px 8px',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel tab type
// ---------------------------------------------------------------------------
type RightTab = 'team' | 'agent' | 'overview';

// ---------------------------------------------------------------------------
// Right panel — full panel wrapper with toolbar
// ---------------------------------------------------------------------------
interface RightPanelProps {
  session: ReturnType<typeof useRunSession>;
  onOpenEditor: () => void;
  zoom: number;
  onZoomChange: (updater: (prev: number) => number) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  /** Story 15.6 — needed to wire ArtifactPreview download / ZIP buttons. */
  sessionId: string;
}

function RightPanel({ session, onOpenEditor, zoom, onZoomChange, selectedNodeId, onSelectNode, sessionId }: RightPanelProps) {
  const filename = session.blueprintFile ?? 'untitled.yml';
  const [rightTab, setRightTab] = useState<RightTab>('team');

  // Story 15.3 — Outer panel mode: 'canvas' (BlueprintCanvas + sub-tabs) vs
  // 'preview' (ArtifactPreview iframe / pre). Auto-switches to 'preview' when
  // useRunSession reducer sets state.activePanel='preview' on BLUEPRINT event.
  const [panelMode, setPanelMode] = useState<'canvas' | 'preview'>('canvas');
  const lastActivePanelRef = useRef<typeof session.activePanel>(session.activePanel);
  React.useEffect(() => {
    if (session.activePanel !== lastActivePanelRef.current) {
      lastActivePanelRef.current = session.activePanel;
      if (session.activePanel === 'preview' && session.artifactUrl) {
        setPanelMode('preview');
      }
    }
  }, [session.activePanel, session.artifactUrl]);

  const previewAvailable = !!session.artifactUrl;

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-bg)',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: 44,
          background: 'var(--t-panel)',
          borderBottom: '1px solid var(--t-border)',
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
              color: 'var(--t-fg-4)',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            BLUEPRINT
          </span>
          <span style={{ color: 'var(--t-border-2)', fontSize: 12, flexShrink: 0 }}>/</span>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              color: 'var(--t-fg-3)',
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
                background: 'var(--t-accent-tint)',
                border: '1px solid var(--t-accent)',
                fontSize: 10,
                color: 'var(--t-accent-bright)',
                fontFamily: 'var(--font-mono, monospace)',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--t-accent)',
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
          <div style={{ width: 1, height: 16, background: 'var(--t-border)' }} />
          <button
            type="button"
            style={{
              ...toolbarBtn,
              color: 'var(--t-fg-3)',
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
              background: session.isComplete ? 'var(--t-accent-tint)' : 'transparent',
              color: session.isComplete ? 'var(--t-accent-bright)' : 'var(--t-border-2)',
              border: `1px solid ${session.isComplete ? 'var(--t-accent)' : 'var(--t-border)'}`,
              cursor: session.isComplete ? 'pointer' : 'not-allowed',
            }}
          >
            在 Editor 中打开
            <ExternalLink size={11} strokeWidth={2} style={{ marginLeft: 4 }} />
          </button>
        </div>
      </div>

      {/* Story 15.3 — Outer mode switcher: Blueprint Canvas vs Artifact Preview.
          Disabled "Artifact 预览" until backend emits artifact_url via blueprint SSE event. */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px 16px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
          background: 'var(--t-panel)',
        }}
      >
        {([
          { key: 'canvas', label: '蓝图画布', enabled: true },
          { key: 'preview', label: 'Artifact 预览', enabled: previewAvailable },
        ] as const).map(({ key, label, enabled }) => (
          <button
            key={key}
            type="button"
            onClick={() => enabled && setPanelMode(key)}
            disabled={!enabled}
            data-testid={`panel-mode-${key}`}
            data-active={panelMode === key}
            style={{
              height: 26,
              padding: '0 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: panelMode === key ? 'var(--t-accent-tint)' : 'transparent',
              color: panelMode === key
                ? 'var(--t-accent-bright)'
                : enabled ? 'var(--t-fg-3)' : 'var(--t-fg-5)',
              border: panelMode === key
                ? '1px solid rgba(168,85,247,.3)'
                : '1px solid transparent',
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? 1 : 0.5,
              fontFamily: 'inherit',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {panelMode === 'preview' && session.artifactUrl ? (
        <ArtifactPreview
          url={session.artifactUrl}
          type={session.artifactType}
          content={session.blueprintYaml ?? ''}
          sessionId={sessionId}
          // artifact_url shape: /projects/<session_id>/<filename>
          // 2026-05-10 review M (15.6): URL parsing 取最后段，跨平台安全（避免
          // Windows 下若 artifactUrl 含 `\` 时 split('/') 失效）。OpenDesign
          // 用 URL/posix 思路；这里直接用 URL.pathname 对 forward-slash 安全。
          filename={(() => {
            try {
              const u = new URL(session.artifactUrl, window.location.origin);
              const segs = u.pathname.split('/').filter(Boolean);
              return segs[segs.length - 1] ?? undefined;
            } catch {
              return session.artifactUrl.split('/').filter(Boolean).pop() ?? undefined;
            }
          })()}
          isComplete={session.isComplete}
        />
      ) : (
        <>
          {/* Sub-tab bar (Team / Agent / Overview) — only visible in canvas mode */}
          <div
            style={{
              display: 'flex',
              gap: 2,
              padding: '6px 16px',
              borderBottom: '1px solid var(--t-border)',
              flexShrink: 0,
            }}
          >
            {(['team', 'agent', 'overview'] as RightTab[]).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setRightTab(tab)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: rightTab === tab ? 'var(--t-accent-tint)' : 'transparent',
                  color: rightTab === tab ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
                  border: rightTab === tab ? '1px solid rgba(168,85,247,.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                {tab === 'team' ? 'Team' : tab === 'agent' ? 'Agent' : 'Overview'}
              </button>
            ))}
          </div>

          {/* Team tab — Blueprint Canvas */}
          {rightTab === 'team' && (
            <BlueprintCanvas
              session={session}
              zoom={zoom}
              onZoomChange={onZoomChange}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          )}

      {/* Agent tab — selected node details */}
      {rightTab === 'agent' && (
        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          {selectedNodeId ? (() => {
            const node = session.nodes.find(n => n.id === selectedNodeId);
            if (!node) {
              return (
                <div style={{ color: 'var(--t-fg-4)', fontSize: 12 }}>
                  选择一个节点查看详情
                </div>
              );
            }
            return (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-fg)', marginBottom: 4 }}>
                  {node.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-fg-3)', marginBottom: 12 }}>
                  {node.sub}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {node.chips.map((chip, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'var(--t-panel-2)',
                        border: '1px solid var(--t-border)',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono, monospace)',
                        color: 'var(--t-fg-3)',
                      }}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            );
          })() : (
            <div style={{ color: 'var(--t-fg-4)', fontSize: 12 }}>
              点击 Team 视图中的节点查看详情
            </div>
          )}
        </div>
      )}

      {/* Overview tab — session summary */}
      {rightTab === 'overview' && (
        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--t-fg-4)',
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                marginBottom: 6,
              }}
            >
              模式
            </div>
            <div style={{ fontSize: 13, color: 'var(--t-fg)' }}>
              {session.mode ?? '—'} · {session.outputType ?? '—'}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--t-fg-4)',
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                marginBottom: 6,
              }}
            >
              节点 ({session.nodes.length})
            </div>
            {session.nodes.map(n => (
              <div key={n.id} style={{ fontSize: 12, color: 'var(--t-fg-2)', lineHeight: 2 }}>
                {n.avatarChar} {n.title}{' '}
                <span style={{ color: 'var(--t-fg-4)' }}>·</span>{' '}
                {n.sub}
              </div>
            ))}
          </div>
          {session.blueprintFile && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--t-fg-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  marginBottom: 6,
                }}
              >
                Blueprint
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--t-accent-bright)',
                }}
              >
                {session.blueprintFile}
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}
      {/* Story 15.14 — 5+1 维质量自检结果（生成完成 + critique 完成后才出现） */}
      {session.critiqueResult && (
        <div
          data-testid="critique-result-mount"
          style={{
            borderTop: '1px solid var(--t-border)',
            background: 'var(--t-panel)',
            flexShrink: 0,
          }}
        >
          <CritiqueResult result={session.critiqueResult} />
        </div>
      )}
    </section>
  );
}

const toolbarIconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--t-fg-4)',
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
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  // Story 15.7: re-render whenever the stored API key changes (save / clear).
  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey());
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const agentCount = session.nodes.filter((n) => n.type === 'agent').length;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

  const handleSend = () => {
    if (session.isComplete) return;
    const text = message.trim();
    if (!text) return;
    // POST to /api/run-sessions/:sessionId/messages
    fetch(`/api/run-sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    }).catch(() => {}); // silently ignore — backend may not be implemented yet
    setMessage('');
  };

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-panel)',
        borderRight: '1px solid var(--t-border)',
        width: 420,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid var(--t-border)',
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
            background: 'var(--t-accent-tint)',
            border: '1.5px solid var(--t-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            color: 'var(--t-accent-bright)',
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
              color: 'var(--t-fg)',
              lineHeight: 1.2,
            }}
          >
            Run Session
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'var(--t-fg-4)',
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
            color: 'var(--t-fg-4)',
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
        {/* Story 15.7 — BYOK banner: shown when no Anthropic key is configured. */}
        {!apiKey && !showKeyEditor && (
          <div
            data-testid="byok-banner"
            style={{
              background: 'rgba(245,158,11,.08)',
              border: '1px solid rgba(245,158,11,.35)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              color: 'var(--t-warn, #f59e0b)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <Key size={14} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ flex: 1, lineHeight: 1.5 }}>
              {t('skillStudio.byok.bannerNeed')}
              <button
                type="button"
                onClick={() => setShowKeyEditor(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: 4,
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                {t('skillStudio.byok.bannerCta')}
              </button>
            </span>
          </div>
        )}

        {/* Inline ApiKey editor — when user clicks "立即配置" or while no key + editor open. */}
        {(!apiKey && showKeyEditor) || (apiKey && showKeyEditor) ? (
          <ApiKeySettings
            compact
            onChange={(next) => {
              setApiKey(next);
              if (next) setShowKeyEditor(false);
            }}
          />
        ) : null}

        {/* Error banner */}
        {session.error && (
          <div
            style={{
              background: 'rgba(239,68,68,.08)',
              border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--t-err)',
            }}
          >
            {/* AC3: NO_API_KEY surfaces here via session.error (server emits error event with code). */}
            {session.error}
            {(/no.?api.?key|anthropic.*key|sk-ant-/i.test(session.error) && !apiKey) && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setShowKeyEditor(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: 12,
                  }}
                >
                  配置 API Key
                </button>
              </>
            )}
          </div>
        )}

        {/* Retrying indicator */}
        {session.retrying && (
          <div
            style={{
              color: 'var(--t-fg-4)',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            重连中… 第 {session.retryAttempt} 次
          </div>
        )}

        {/* User goal bubble */}
        {goal && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div
              style={{
                maxWidth: 340,
                padding: '10px 14px',
                borderRadius: '14px 14px 4px 14px',
                background: 'var(--t-accent-tint)',
                border: '1px solid var(--t-accent)',
                color: 'var(--t-accent-bright)',
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
              color: 'var(--t-fg-4)',
              padding: '4px 0',
            }}
          >
            已识别 · {session.mode} 模式{agentCount > 0 ? ` · ${agentCount} 个 Agent` : ''}
          </div>
        )}

        {/* Progress steps */}
        {session.steps.length > 0 && (
          <ProgressSteps
            steps={session.steps}
            activeSubsteps={session.activeSubsteps}
          />
        )}

        {/* Rationale cards */}
        {session.rationaleCards.map((card, i) => (
          <div
            key={i}
            style={{
              background: 'var(--t-accent-tint)',
              border: '1px solid rgba(168,85,247,.2)',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--t-accent-bright)',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                marginBottom: 4,
              }}
            >
              {card.title}
              {card.duration_ms ? ` · ${(card.duration_ms / 1000).toFixed(1)}s` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-fg-3)', lineHeight: 1.6 }}>
              {card.body}
            </div>
          </div>
        ))}

        {/* YAML real-time stream */}
        {session.yamlLines.length > 0 && (
          <div
            style={{
              background: 'var(--t-panel-2)',
              border: '1px solid var(--t-border)',
              borderRadius: 8,
              padding: '8px 12px',
              maxHeight: 160,
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--t-fg-4)',
                marginBottom: 4,
              }}
            >
              blueprint.yaml · {session.yamlLines.length} 行
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--t-accent-bright)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {session.yamlLines.join('\n')}
            </pre>
          </div>
        )}

        {/* Thinking bubble */}
        {session.thinkingMessage && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div
              style={{
                padding: '9px 13px',
                borderRadius: '4px 14px 14px 14px',
                background: 'var(--t-panel-2)',
                border: '1px solid var(--t-border)',
                color: 'var(--t-fg-3)',
                fontSize: 12,
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <InlineSpinner size={10} />
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
              color: 'var(--t-fg-4)',
              padding: '4px 0',
            }}
          >
            {session.isComplete ? '已完成' : '流式中'} · 已写入 {session.tokenCount.toLocaleString()} tokens
          </div>
        )}
      </div>

      {/* Footer — Composer */}
      <div
        style={{
          borderTop: '1px solid var(--t-border)',
          padding: '12px 14px 14px',
          flexShrink: 0,
        }}
      >
        {/* Cancel button + textarea row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            style={{
              background: 'transparent',
              border: '1px solid var(--t-border)',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 11,
              color: 'var(--t-fg-4)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
              alignSelf: 'flex-start',
              marginTop: 1,
            }}
          >
            <X size={11} strokeWidth={2} />
            取消
          </button>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={session.isComplete}
            placeholder={session.isComplete ? 'Session 已完成' : '补充说明或调整方向…'}
            style={{
              flex: 1,
              background: 'var(--t-bg)',
              color: 'var(--t-fg)',
              border: '1px solid var(--t-border)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              resize: 'none',
              minHeight: 40,
              maxHeight: 160,
              width: '100%',
              fontFamily: 'var(--font-mono, monospace)',
              outline: 'none',
              lineHeight: 1.5,
              opacity: session.isComplete ? 0.5 : 1,
              cursor: session.isComplete ? 'not-allowed' : 'text',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={session.isComplete || !message.trim()}
            style={{
              background: 'var(--t-accent-tint)',
              border: '1px solid var(--t-accent)',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 11,
              color: 'var(--t-accent-bright)',
              cursor: (session.isComplete || !message.trim()) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
              alignSelf: 'flex-start',
              marginTop: 1,
              opacity: (session.isComplete || !message.trim()) ? 0.4 : 1,
            }}
          >
            ↵
          </button>
        </div>
        {/* Keyboard hint */}
        <div
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9.5,
            color: 'var(--t-fg-5)',
          }}
        >
          {isMac ? '⌘↵' : 'Ctrl↵'} 发送 · ⇧↵ 换行
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
// Preparation panel — Story 15.4 (rendered when no :sessionId in URL)
// ---------------------------------------------------------------------------
function PreparationPanel() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Story 15.9 — restore last user choice from localStorage. SettingsPage's
  // GenerationSettings panel writes the same keys, so a default chosen there
  // surfaces here on the next visit. Hardcoded fallback preserves the prior
  // out-of-the-box behavior when no preference exists.
  const [skillId, setSkillId] = useState<string>(
    () => getStoredString(LAST_SKILL_STORAGE) ?? 'agent-team-blueprint',
  );
  // Story 15.5 — Design System selection. Default to 'tailwind' so the
  // web-prototype path is opinionated out of the box; the picker auto-hides
  // for skills with no compatible DS, and stale ids gracefully degrade to
  // 'none' on the server. Story 15.9: restore from localStorage when present.
  const [dsId, setDsId] = useState<string>(() => {
    const stored = getStoredString(LAST_DS_STORAGE);
    if (stored !== null) return stored;
    return 'tailwind';
  });
  const [goal, setGoal] = useState<string>(searchParams.get('goal') ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Story 15.29 — selected Conversation. URL `?conversation_id=` takes priority
  // (so a "back to prep" round-trip auto-selects the previous conversation),
  // otherwise undefined → "Untitled / start fresh" → server auto-creates a new
  // anonymous conversation under the 'default' project.
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(
    () => searchParams.get('conversation_id') ?? undefined,
  );

  const canSubmit = goal.trim().length > 0 && !submitting;

  // Skills that have any compatible (non-'none') DS. Mirrors the registry on
  // the server — we keep the list short and explicit to avoid a second fetch.
  const skillSupportsDS = skillId === 'web-prototype';

  async function handleStart() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // Story 15.9 — persist user's current selections so the next visit
      // restores them (also feeds the SettingsPage GenerationSettings panel).
      const effectiveDs = skillSupportsDS ? dsId : '';
      setStoredString(LAST_SKILL_STORAGE, skillId);
      setStoredString(LAST_DS_STORAGE, effectiveDs);

      // createRunSession() merges localStorage generation settings
      // (max_tokens / temperature) into the body automatically, so the user's
      // SettingsPage edits take effect on every run without any extra plumbing.
      const resp = await createRunSession({
        goal: goal.trim(),
        skill_name: skillId,
        // Only send DS when the skill actually supports one beyond 'none' —
        // avoids leaking stale state from a previous skill selection.
        design_system_id: skillSupportsDS ? dsId : undefined,
        // Story 15.29 — link to selected conversation; server auto-creates an
        // anonymous one when undefined and echoes the id back so we can
        // forward it through the URL so a future "back to prep" round-trip
        // auto-selects the same Conversation (AC8 step 3).
        conversation_id: selectedConversationId,
      });
      const cid = resp.conversation_id ?? selectedConversationId;
      const qs = new URLSearchParams();
      qs.set('goal', goal.trim());
      if (cid) qs.set('conversation_id', cid);
      navigate(`/run-session/${resp.session_id}?${qs.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败');
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 880,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            启动新 Run Session
          </h1>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 13, color: 'var(--t-fg-3)' }}>
            选择执行 Skill 并描述你的目标，系统会用对应的专业角色规划执行。
          </p>
        </div>

        {/* Story 15.29 — Conversation picker. Shown at the top so users see
            it before drilling into Skill / DS choices. */}
        <ConversationPicker
          projectId="default"
          selectedId={selectedConversationId}
          onChange={setSelectedConversationId}
          disabled={submitting}
        />

        <div>
          <h3 style={{ fontSize: 12, color: 'var(--t-fg-3)', margin: '0 0 12px', fontWeight: 500 }}>
            选择执行 Skill
          </h3>
          <SkillPicker value={skillId} onChange={setSkillId} />
        </div>

        {/* Story 15.5 — Design System picker (only for skills with compatible DS). */}
        {skillSupportsDS && (
          <div data-testid="design-system-section">
            <h3 style={{ fontSize: 12, color: 'var(--t-fg-3)', margin: '0 0 8px', fontWeight: 500 }}>
              Design System（可选）
            </h3>
            <DesignSystemPicker value={dsId} onChange={setDsId} skillId={skillId} />
          </div>
        )}

        <div>
          <h3 style={{ fontSize: 12, color: 'var(--t-fg-3)', margin: '0 0 8px', fontWeight: 500 }}>
            描述你的目标
          </h3>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="帮我设计一个 SaaS 产品的落地页…"
            data-testid="run-session-goal"
            style={{
              width: '100%',
              minHeight: 96,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--t-border)',
              borderRadius: 12,
              padding: 12,
              color: 'var(--t-fg)',
              fontSize: 13,
              lineHeight: 1.55,
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 12,
              color: '#fca5a5',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '8px 12px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleStart}
            data-testid="run-session-start"
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid rgba(124,58,237,0.45)',
              background: canSubmit ? '#7c3aed' : 'rgba(124,58,237,0.25)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.5,
              fontFamily: 'inherit',
            }}
          >
            {submitting ? '启动中…' : '开始执行 →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RunSessionPage — root (Story 15.4 split: prep vs live)
// ---------------------------------------------------------------------------
export default function RunSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [searchParams] = useSearchParams();
  const goal = searchParams.get('goal') ?? '';
  const navigate = useNavigate();

  // Story 15.4: no :sessionId → preparation phase. Hooks below depend on a
  // sessionId so we bail out before mounting the live view (per rules of hooks).
  if (!sessionId) {
    return (
      <>
        <InjectKeyframes />
        <PreparationPanel />
      </>
    );
  }

  return (
    <RunSessionLiveView
      sessionId={sessionId}
      goal={goal}
      onNavigate={navigate}
    />
  );
}

interface RunSessionLiveViewProps {
  sessionId: string;
  goal: string;
  onNavigate: ReturnType<typeof useNavigate>;
}

function RunSessionLiveView({ sessionId, goal, onNavigate }: RunSessionLiveViewProps) {
  const session = useRunSession(sessionId);
  const [collapsed, setCollapsed] = useState(false);
  const [zoom, setZoom] = useState(82);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  function handleOpenEditor() {
    if (session.redirectUrl) {
      onNavigate(session.redirectUrl);
    } else {
      onNavigate('/editor');
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
          background: 'var(--t-bg)',
          color: 'var(--t-fg)',
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
        <RightPanel
          session={session}
          onOpenEditor={handleOpenEditor}
          zoom={zoom}
          onZoomChange={setZoom}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          sessionId={sessionId}
        />
      </div>
    </>
  );
}
