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
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Check, Circle, ExternalLink, Key, Paperclip, Settings } from 'lucide-react';
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
import { SettingsModal } from '../components/SettingsModal';
import { useI18n } from '../common/i18n';
import { ArtifactPreview } from '../components/ArtifactPreview';
import { SkillPicker } from '../components/SkillPicker';
import { DesignSystemPicker } from '../components/DesignSystemPicker';
// Story 15.29 — Conversation linkage UI in PreparationPanel.
import { ConversationPicker } from '../components/ConversationPicker';
import { createRunSession } from '../api/runSessions';
import { quickCreateAgent } from '../api/agents';
import { createTeam } from '../api/teams';
import { createGroup } from '../api/groupApi';
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

// Story 15.x — Tiny YAML syntax highlighter for the floating stream panel.
// Highlights: # comments, key: prefix, "quoted strings", bare numbers.
function highlightYamlLine(line: string, idx: number): React.ReactNode {
  // Whole-line comment
  if (/^\s*#/.test(line)) {
    return <span key={idx} className="cmt">{line}{'\n'}</span>;
  }
  // Inline-comment split: split on first " #" — keep RHS as comment
  let body = line;
  let trailingComment = '';
  const commentIdx = line.indexOf(' #');
  if (commentIdx > -1) {
    body = line.slice(0, commentIdx);
    trailingComment = line.slice(commentIdx);
  }
  // key: prefix
  const keyMatch = body.match(/^(\s*)([\w.-]+)(:)(.*)$/);
  let prefix: React.ReactNode = null;
  let rest = body;
  if (keyMatch) {
    prefix = (
      <>
        {keyMatch[1]}
        <span className="key">{keyMatch[2]}</span>
        {keyMatch[3]}
      </>
    );
    rest = keyMatch[4];
  }
  // Tokenize the remaining `rest` into strings / numbers / plain
  const tokens: React.ReactNode[] = [];
  const re = /("[^"]*")|('[^']*')|\b(\d+(?:\.\d+)?)\b/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let tIdx = 0;
  while ((m = re.exec(rest)) !== null) {
    if (m.index > lastIdx) tokens.push(rest.slice(lastIdx, m.index));
    if (m[1] || m[2]) {
      tokens.push(<span key={`s${tIdx}`} className="str">{m[1] || m[2]}</span>);
    } else if (m[3]) {
      tokens.push(<span key={`n${tIdx}`} className="num">{m[3]}</span>);
    }
    lastIdx = m.index + m[0].length;
    tIdx++;
  }
  if (lastIdx < rest.length) tokens.push(rest.slice(lastIdx));
  return (
    <span key={idx}>
      {prefix}
      {tokens}
      {trailingComment && <span className="cmt">{trailingComment}</span>}
      {'\n'}
    </span>
  );
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

      {/* Canvas meta — bottom left (legacy single-line). Kept for backward-compat;
          new `.rs-canvas-meta` overlay below renders the kit's richer 3-group bar. */}
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

      {/* Floating YAML stream panel — top-left (kit .rs-yaml-float) */}
      {session.yamlLines.length > 0 && session.blueprintFile && (
        <div className="rs-yaml-float" aria-label="blueprint yaml stream">
          <div className="rs-yaml-head">
            <span className="ttl">
              {session.blueprintFile} · {session.yamlLines.length} 行
            </span>
            {!session.isComplete && <span className="live">LIVE</span>}
          </div>
          <div className="rs-yaml-body">
            {session.yamlLines.slice(-12).map((ln, i) => highlightYamlLine(ln, i))}
            {!session.isComplete && <span className="cur" />}
          </div>
        </div>
      )}

      {/* Canvas meta status bar — bottom-left, 3 groups (kit .rs-canvas-meta) */}
      <div className="rs-canvas-meta" aria-label="canvas status">
        <span className="group">
          <span className="lbl">STATUS</span>
          <span className="val">
            {session.isComplete ? '已完成' : session.error ? '出错' : '运行中'}
          </span>
        </span>
        <span className="group">
          <span className="lbl">NODES</span>
          <span className="val">{session.nodes.length} 个</span>
        </span>
        {session.tokenCount > 0 && (
          <span className="group">
            <span className="lbl">TOKENS</span>
            <span className="val">{session.tokenCount.toLocaleString()}</span>
          </span>
        )}
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
type RightTab = 'team' | 'agent' | 'overview' | 'preview';

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
  const [rightTab, setRightTab] = useState<RightTab>('overview');
  const agents = session.nodes.filter(n => n.type === 'agent');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  // When agents arrive, default-select the first one
  React.useEffect(() => {
    if (agents.length > 0 && !activeAgentId) setActiveAgentId(agents[0].id);
  }, [agents.length]);

  const switchToAgent = (nodeId: string) => {
    setActiveAgentId(nodeId);
    onSelectNode(nodeId);
    setRightTab('agent');
  };

  // Auto-switch to 'preview' tab when artifact becomes available (Story 15.3)
  const lastActivePanelRef = useRef<typeof session.activePanel>(session.activePanel);
  React.useEffect(() => {
    if (session.activePanel !== lastActivePanelRef.current) {
      lastActivePanelRef.current = session.activePanel;
      if (session.activePanel === 'preview' && session.artifactUrl) {
        setRightTab('preview');
      }
    }
  }, [session.activePanel, session.artifactUrl]);

  const previewAvailable = !!session.artifactUrl;

  // Derive tab list — preview only appears when artifact available
  const rightTabs: { key: RightTab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'team', label: 'Team', count: session.nodes.length > 0 ? session.nodes.length : undefined },
    { key: 'agent', label: 'Agent', count: session.nodes.filter(n => n.type === 'agent').length || undefined },
    ...(previewAvailable ? [{ key: 'preview' as RightTab, label: 'Preview' }] : []),
  ];

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-bg)',
        overflow: 'hidden',
      }}
    >
      {/* Single combined toolbar — browser-tab style */}
      <div
        style={{
          height: 44,
          background: 'var(--t-panel)',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex',
          alignItems: 'flex-end',
          flexShrink: 0,
          position: 'relative',
          paddingRight: 16,
        }}
      >
        {/* View tabs (left, sit on the border) */}
        <div style={{ display: 'inline-flex', alignItems: 'flex-end' }}>
          {rightTabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              className={`rs-view-tab${rightTab === key ? ' rs-view-tab-on' : ''}`}
              onClick={() => setRightTab(key)}
            >
              {label}
              {count !== undefined && (
                <span className="rs-view-tab-ct">{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* File tab (center-left) */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            marginLeft: 12,
            paddingLeft: 12,
            borderLeft: '1px solid var(--t-border)',
            alignSelf: 'center',
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--t-fg-4)',
              flexShrink: 0,
            }}
          >
            Blueprint
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10.5,
              letterSpacing: '.04em',
              color: 'var(--t-fg-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {filename}
          </span>
        </div>

        {/* Status tag */}
        {!session.isComplete && (
          <span className="rs-tag" style={{ marginLeft: 10, alignSelf: 'center', flexShrink: 0 }}>
            <span className="rs-tag-dot" />
            构建中…
          </span>
        )}

        {/* Right tool buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}>
          <button type="button" title="Fit to screen" style={toolbarIconBtn}>⊡</button>
          <button type="button" title="Toggle split" style={toolbarIconBtn}>⇄</button>
          <div style={{ width: 1, height: 16, background: 'var(--t-border)' }} />
          <button type="button" style={{ ...toolbarBtn, color: 'var(--t-fg-3)' }}>查看 YAML</button>
          <button
            type="button"
            onClick={session.isComplete ? onOpenEditor : undefined}
            disabled={!session.isComplete}
            style={{
              ...toolbarBtn,
              background: session.isComplete ? 'var(--t-accent-tint)' : 'transparent',
              color: session.isComplete ? 'var(--t-accent-bright)' : 'var(--t-fg-5)',
              border: `1px solid ${session.isComplete ? 'var(--t-accent)' : 'var(--t-border)'}`,
              cursor: session.isComplete ? 'pointer' : 'not-allowed',
            }}
          >
            在 Editor 中打开
            <ExternalLink size={11} strokeWidth={2} style={{ marginLeft: 4 }} />
          </button>
        </div>
      </div>

      {/* Content area — keyed on tab */}
      {rightTab === 'preview' && session.artifactUrl ? (
        <ArtifactPreview
          url={session.artifactUrl}
          type={session.artifactType}
          content={session.blueprintYaml ?? ''}
          sessionId={sessionId}
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
      ) : rightTab === 'team' ? (
        <BlueprintCanvas
          session={session}
          zoom={zoom}
          onZoomChange={onZoomChange}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      ) : rightTab === 'agent' ? (
        /* Agent tab — per-agent sub-tabs + rich profile card */
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {agents.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-fg-4)', fontSize: 12 }}>
              等待 Agent 初始化…
            </div>
          ) : (
            <>
              {/* Agent sub-tab strip */}
              <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid var(--t-border)', background: 'var(--t-panel)', flexShrink: 0, overflowX: 'auto', paddingLeft: 8 }}>
                {agents.map(ag => (
                  <button key={ag.id} type="button"
                    className={`rs-view-tab${activeAgentId === ag.id ? ' rs-view-tab-on' : ''}`}
                    onClick={() => { setActiveAgentId(ag.id); onSelectNode(ag.id); }}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {ag.avatarChar && <span style={{ marginRight: 5, opacity: .7 }}>{ag.avatarChar}</span>}
                    {ag.title || ag.id}
                  </button>
                ))}
              </div>
              {/* Active agent profile */}
              {(() => {
                const nd = agents.find(n => n.id === activeAgentId) ?? agents[0];
                if (!nd) return null;
                const avatarLetter = nd.avatarChar ?? nd.title?.[0]?.toUpperCase() ?? '?';
                const isBuilding = nd.status === 'building';
                const isReady = nd.status === 'ready';
                // derive timeline states from chips / status
                const modelChip = nd.chips.find(c => /claude|gpt|gemini|deepseek|qwen/i.test(c));
                const toolChips = nd.chips.filter(c => !/claude|gpt|gemini|deepseek|qwen|review|plan|write|research/i.test(c));
                const tl = [
                  { step: 1, label: 'Identity', title: '命名 · 形象', body: `name  ${nd.title}\nrole  ${nd.type}`, st: 'done' },
                  { step: 2, label: 'Persona',  title: '角色性格',   body: nd.sub || '—',                     st: nd.sub ? 'done' : 'pending' },
                  { step: 3, label: 'Model',    title: '模型 · 参数', body: modelChip ?? '待分配',               st: modelChip ? 'done' : (isBuilding ? 'run' : 'pending') },
                  { step: 4, label: 'Tools',    title: '工具集',     body: toolChips.length ? toolChips.join(' · ') : '挑选中…', st: isReady ? 'done' : (isBuilding ? 'run' : 'pending') },
                  { step: 5, label: 'Memory',   title: '记忆 · Knowledge', body: '向量库 + scratch',           st: isReady ? 'done' : 'pending' },
                ] as const;

                // derive "picked" tools (chips that look like capabilities)
                const pickedTools = nd.chips.filter(c => !/claude|gpt|gemini/i.test(c)).slice(0, 3);
                const rejectedTools = ['web_search', 'image_gen'].filter(t => !pickedTools.includes(t));

                return (
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px' }}>
                    {/* Agent card */}
                    <div className="ag-card">
                      <div className="ag-avatar" style={{ animationPlayState: isBuilding ? 'running' : 'paused' }}>
                        {avatarLetter}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ag-name">{nd.title}</div>
                        <div className="ag-id">
                          agent_id: <span style={{ color: 'var(--t-fg)' }}>{nd.id}</span>
                          {' · '}status: <span style={{ color: isReady ? '#10B981' : '#A855F7' }}>{nd.status}</span>
                        </div>
                      </div>
                      <span className="rs-tag" style={{ flexShrink: 0 }}>
                        <span className="rs-tag-dot" />
                        {isReady ? '就绪' : '构建中…'}
                      </span>
                    </div>

                    {/* 5-step Timeline */}
                    <div className="ag-tl">
                      {tl.map(({ step, label, title, body, st }) => (
                        <div key={step} className={`ag-tl-cell ag-tl-${st}`}>
                          <div className="ag-tl-step">
                            <span className="ag-tl-num">{st === 'run' ? '…' : st === 'done' ? '✓' : step}</span>
                            <span>{label}</span>
                          </div>
                          <div className="ag-tl-title">{title}</div>
                          <div className="ag-tl-body">
                            {body.split('\n').map((line, i) => {
                              const [k, ...v] = line.split(/\s{2,}/);
                              return v.length ? (
                                <span key={i} style={{ display: 'block' }}>
                                  <span style={{ color: 'var(--t-accent-bright)', fontWeight: 600 }}>{k}</span>
                                  {'  '}{v.join('  ')}
                                </span>
                              ) : <span key={i} style={{ display: 'block' }}>{line}</span>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* System Prompt */}
                    <div className="ag-prompt">
                      <div className="ag-prompt-h">
                        <span>System Prompt</span>
                        <span style={{ opacity: .6, fontWeight: 400, letterSpacing: '.04em', textTransform: 'none' }}>writing · — / — tokens</span>
                      </div>
                      <pre className="ag-prompt-pre">{`role:  ${nd.type === 'coordinator' ? 'Coordinator' : 'Agent'} · ${nd.title}\ntask:  ${nd.sub || '—'}\ntools: ${nd.chips.join(' · ') || '—'}`}</pre>
                    </div>

                    {/* Tool Decision Log */}
                    {pickedTools.length > 0 && (
                      <div className="ag-tool-log">
                        <div className="ag-tool-log-h">Tool Decision Log
                          <span style={{ marginLeft: 'auto', opacity: .6 }}>候选 {pickedTools.length + rejectedTools.length} · 选定 {pickedTools.length}</span>
                        </div>
                        <div className="ag-tool-grid">
                          <div className="ag-tool-col">
                            <div className="ag-tool-col-h">PICKED <span style={{ marginLeft: 'auto' }}>{pickedTools.length}</span></div>
                            {pickedTools.map(t => (
                              <div key={t} className="ag-tool-row ag-tool-picked">
                                <span className="ag-tool-ic" style={{ background: '#10B981', color: '#0A0A0A' }}>✓</span>
                                <span className="ag-tool-nm">{t}</span>
                              </div>
                            ))}
                          </div>
                          <div className="ag-tool-col" style={{ borderLeft: '1px solid var(--t-border)' }}>
                            <div className="ag-tool-col-h">REJECTED <span style={{ marginLeft: 'auto' }}>{rejectedTools.length}</span></div>
                            {rejectedTools.map(t => (
                              <div key={t} className="ag-tool-row ag-tool-rejected">
                                <span className="ag-tool-ic" style={{ color: 'var(--t-fg-4)' }}>✗</span>
                                <span className="ag-tool-nm" style={{ opacity: .5 }}>{t}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live stream bar */}
                    {isBuilding && (
                      <div className="ag-stream">
                        <span className="ag-stream-lbl">LIVE</span>
                        <span style={{ color: 'var(--t-accent-bright)' }}>{nd.sub || '处理中…'}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      ) : (
        /* Overview tab — redesigned "Review run session" panel */
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '20px 22px 32px' }}>

            <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 4px', color: 'var(--t-fg)' }}>
              Review run session
            </h1>

            {/* Status card */}
            <section style={{ border: '1px solid var(--t-border)', borderRadius: 10, padding: '13px 15px', marginTop: 14, background: 'var(--t-panel)' }}>
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--t-fg-2)', margin: '0 0 11px' }}>
                Your AI team has produced a draft section. Approve to commit to the canvas, or send back for revision. Decisions are routed by the Policy Matrix.
              </p>
              <div style={{ display: 'flex', gap: 14, marginBottom: 11 }}>
                {[
                  { label: 'Live', on: true },
                  { label: 'On-chain', on: true },
                  { label: 'Auto-approve', on: false },
                ].map(({ label, on }) => (
                  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono, monospace)', fontSize: 10, cursor: 'pointer', color: 'var(--t-fg-3)' }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', border: `1px solid ${on ? '#10B981' : 'var(--t-border)'}`, background: on ? '#10B981' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: on ? '#0A0A0A' : 'var(--t-fg-4)', flexShrink: 0 }}>{on ? '✓' : '○'}</span>
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--t-fg-3)' }}>Open this run</span>
                <button
                  type="button"
                  onClick={session.isComplete ? onOpenEditor : undefined}
                  style={{ padding: '5px 11px', border: '1px solid var(--t-border)', borderRadius: 7, fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--t-fg-3)' }}
                >
                  ↗ Open in Editor
                </button>
              </div>
            </section>

            {/* Callout — retry budget / warning */}
            {!session.isComplete && session.nodes.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid rgba(245,158,11,.28)', borderRadius: 10, marginTop: 10, background: 'rgba(245,158,11,.05)' }}>
                <span style={{ fontSize: 13, flexShrink: 0, color: '#F59E0B' }}>⚠</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-fg)' }}>Retry budget low</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, marginTop: 2, lineHeight: 1.4, color: 'var(--t-fg-3)' }}>Reader is on round 2 of 3 — one more rejection will roll back to Draft.</div>
                </div>
                <button type="button" style={{ padding: '4px 10px', border: '1px solid rgba(245,158,11,.32)', borderRadius: 6, fontFamily: 'var(--font-mono, monospace)', fontSize: 10, cursor: 'pointer', background: 'transparent', color: '#F59E0B', flexShrink: 0 }}>↻ Adjust</button>
              </div>
            )}

            {/* Team section */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', flex: 1, color: 'var(--t-fg-3)' }}>Team</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--t-border)', color: 'var(--t-fg-4)' }}>{session.nodes.length || 4}</span>
                <span style={{ fontSize: 11, opacity: .45, color: 'var(--t-fg-4)' }}>›</span>
              </div>
              <div style={{ border: '1px solid var(--t-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--t-panel)' }}>
                {[
                  { name: 'workflow-dag', meta: `canvas · ${session.nodes.length || 0} nodes`, status: 'run' as const },
                  { name: 'policy-matrix', meta: '5 × 5', status: 'ok' as const },
                  { name: 'handoffs', meta: `${session.edges.length || 0} edges`, status: 'ok' as const },
                  { name: 'activity-log', meta: `${session.steps.length} events`, status: 'run' as const },
                ].map(row => (
                  <button key={row.name} type="button" className="rs-ov-row" onClick={() => setRightTab('team')}>
                    <span style={{ fontSize: 11, opacity: .38, flexShrink: 0, color: 'var(--t-fg-4)' }}>›</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--t-fg-4)' }}>{row.meta}</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginLeft: 4, background: row.status === 'run' ? '#A855F7' : '#10B981', boxShadow: row.status === 'run' ? '0 0 5px rgba(168,85,247,.5)' : 'none' }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Agents section */}
            {session.nodes.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', flex: 1, color: 'var(--t-fg-3)' }}>Agents</span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--t-border)', color: 'var(--t-fg-4)' }}>{session.nodes.filter(n => n.type === 'agent').length}</span>
                  <span style={{ fontSize: 11, opacity: .45, color: 'var(--t-fg-4)' }}>›</span>
                </div>
                <div style={{ border: '1px solid var(--t-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--t-panel)' }}>
                  {session.nodes.map(node => (
                    <button key={node.id} type="button" className="rs-ov-row" onClick={() => switchToAgent(node.id)}>
                      <span style={{ fontSize: 11, opacity: .38, flexShrink: 0, color: 'var(--t-fg-4)' }}>›</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.title || node.id}</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--t-fg-4)' }}>{node.sub || 'idle'}</span>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginLeft: 4, background: node.status === 'ready' ? '#10B981' : node.status === 'building' ? '#A855F7' : 'var(--t-fg-5)' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Blueprint file ref */}
            {session.blueprintFile && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--t-border)' }}>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--t-fg-4)', marginBottom: 6 }}>Blueprint</div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: 'var(--t-accent-bright)' }}>{session.blueprintFile}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Story 15.14 — 5+1 维质量自检结果（生成完成 + critique 完成后才出现）
          2026-05-11 Story 15.30 follow-up: 当 critique 因为无 BYOK key 跳过
          (NO_API_KEY) 时，CritiqueResult 返回 null — 同时 gate 外层 wrapper
          以免显示一条空的 borderTop+background 横条。 */}
      {session.critiqueResult && session.critiqueResult.error_code !== 'CRITIQUE_NO_API_KEY' && (
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
  // 2026-05-11 Story 15.30 follow-up: handleSend 现在派生新 run session 后需要
  // navigate 到新 URL，让 useRunSession hook 自动 teardown + 重订阅新 SSE 流。
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  // Story 15.7: re-render whenever the stored API key changes (save / clear).
  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey());
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const agentCount = session.nodes.filter((n) => n.type === 'agent').length;
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 2026-05-11 Layer 1 — Claude Code-style chat fallback.
  // Two triggers (both require "no canvas events seen"):
  //  (1) LLM is plain-text-replying (chatReply has content) → chat mode.
  //  (2) Run completed with NO canvas events at all → also chat mode. Covers
  //      the case where Claude CLI exited silently; route now synthesises a
  //      fallback text, but the panel state should collapse either way so
  //      the user sees only the chat surface + input box.
  const isChatMode =
    (session.chatReply.length > 0 || session.isComplete) &&
    session.steps.length === 0 &&
    session.nodes.length === 0 &&
    !session.blueprintFile;

  const handleSend = async () => {
    const text = message.trim();
    if (!text && attachedFiles.length === 0) return;

    // 读取文本类附件内容，拼成 fenced code block 放在消息最前面
    let fullContent = text;
    if (attachedFiles.length > 0) {
      const blocks: string[] = [];
      for (const file of attachedFiles) {
        const isText =
          file.type.startsWith('text/') ||
          /\.(txt|md|json|yaml|yml|ts|tsx|js|jsx|py|go|rs|sh|bash|css|html|xml|csv|toml|env)$/i.test(file.name);
        if (isText && file.size <= 100 * 1024) {
          const content = await file.text();
          const ext = file.name.split('.').pop() ?? '';
          blocks.push(`\`\`\`${ext} title="${file.name}"\n${content}\n\`\`\``);
        } else {
          blocks.push(`[附件: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`);
        }
      }
      fullContent = blocks.join('\n\n') + (text ? '\n\n' + text : '');
    }

    setMessage('');
    setAttachedFiles([]);
    try {
      const resp = await fetch(`/api/run-sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fullContent }),
      });
      if (!resp.ok) {
        console.warn(`[run-session] follow-up POST failed: HTTP ${resp.status}`);
        setMessage(text);
        return;
      }
      const data = (await resp.json()) as { session_id?: string };
      if (data.session_id) {
        const params = new URLSearchParams({ goal: fullContent.slice(0, 200) });
        navigate(`/run-session/${data.session_id}?${params.toString()}`);
      }
    } catch (err) {
      console.warn('[run-session] follow-up POST error:', err);
      setMessage(text);
    }
  };

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-panel)',
        borderRight: isChatMode ? 'none' : '1px solid var(--t-border)',
        width: isChatMode ? '100%' : 420,
        maxWidth: isChatMode ? 680 : 420,
        margin: isChatMode ? '0 auto' : 0,
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
        {/* Mark — rounded square with S-curve SVG + spinning conic border */}
        <div
          className="rs-mark"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(168,85,247,.28), rgba(168,85,247,.08))',
            border: '1px solid rgba(168,85,247,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--t-accent-bright)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M13.5 4C7 4 5.5 8 10 10C14.5 12 13 16 6.5 16" opacity=".22" transform="translate(2 1.5)" />
            <path d="M13.5 4C7 4 5.5 8 10 10C14.5 12 13 16 6.5 16" transform="translate(2 1.5)" />
          </svg>
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
        {/* Story 15.7 — BYOK banner: shown when no Anthropic key is configured.
            2026-05-11 bug fix — only show when the user is going to use the
            direct Anthropic SDK path (`anthropic-direct`). When they pick a
            local CLI (`cli:*`) the child binary handles its own auth (e.g.
            `claude login`), so the banner is misleading and would block users
            who legitimately don't have an Anthropic API key. */}
        {!apiKey && !showKeyEditor && (() => {
          try {
            // 2026-05-11 Story 15.30 (OpenDesign 模式): 默认 'cli:auto' — banner
            // 仅当用户显式选了 anthropic-direct 时才提醒 BYOK。cli:auto 路径无
            // CLI 时走 anthropic-direct fallback 时，server 端会 emit NO_API_KEY
            // error 事件，前端通过 onServerError 单独 handle（不再用 banner）。
            const ex = localStorage.getItem('sf.defaultExecutor') || 'cli:auto';
            return ex === 'anthropic-direct';
          } catch {
            return true;
          }
        })() && (
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

        {/* 2026-05-11 kit alignment — system-divider: transitional system event
            marker inside chat stream. Skipped in chat mode (chat bubbles ARE
            the visual). Shown when:
              • stream has nothing yet and run isn't done  → WAITING FOR LLM
              • run completed without error                → DONE  */}
        {!isChatMode &&
          session.steps.length === 0 &&
          session.nodes.length === 0 &&
          !session.chatReply &&
          !session.isComplete &&
          !session.error && (
            <div className="system-divider">WAITING FOR LLM</div>
          )}
        {!isChatMode && session.isComplete && session.error == null && (
          <div className="system-divider">DONE</div>
        )}

        {/* Assistant chat bubble — Claude Code-style plain reply. Renders
            incrementally as `text` SSE events arrive. Shown for both chat
            mode (no canvas) and the "LLM is thinking out loud before tags"
            transient window.
            2026-05-11 bug fix: `chatReply` 偶尔只累积 server text delta 里
            的换行/空白（Claude 在结构化 <sf:*> 标签之间或正式内容前的换行
            铺垫），truthy 但视觉是空白竖条。trim 后非空才渲染气泡。*/}
        {session.chatReply && session.chatReply.trim().length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                maxWidth: 420,
                padding: '10px 14px',
                // 2026-05-11 kit alignment: assistant bubble has sharp
                // TOP-LEFT corner (speaker comes from upper-left). CSS
                // shorthand is top-left top-right bottom-right bottom-left.
                borderRadius: '4px 14px 14px 14px',
                background: 'var(--t-panel)',
                border: '1px solid var(--t-border)',
                color: 'var(--t-fg-2)',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {session.chatReply}
              {!session.isComplete && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 14,
                    marginLeft: 2,
                    background: 'var(--t-fg-4)',
                    verticalAlign: 'text-bottom',
                    animation: 'sf-blink 1s steps(2) infinite',
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Canvas-mode-only chrome: mode divider + step list. Hidden in chat
            mode so trivial inputs ("hi") render only the chat bubble. */}
        {!isChatMode && session.mode && (
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

        {/* Progress steps — only after SSE delivers the first <sf:step>.
            2026-05-11 UX fix: previously 6 zh-CN placeholders rendered before
            any work began, leaking implementation detail.
            Layer 1: also suppressed in chat mode (no `<sf:step>` will ever
            arrive when LLM is plain-text-replying). */}
        {!isChatMode && session.steps.length > 0 ? (
          <ProgressSteps
            steps={session.steps}
            activeSubsteps={session.activeSubsteps}
          />
        ) : (!isChatMode && !session.isComplete && !session.error) && (
          <div
            style={{
              border: '1px solid var(--t-border)',
              borderRadius: 12,
              background: 'var(--t-panel)',
              padding: '14px 16px',
              fontSize: 12,
              color: 'var(--t-fg-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <InlineSpinner size={10} />
            <span>等待 LLM 开始…</span>
          </div>
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
          padding: '14px 16px',
          flexShrink: 0,
          background: 'var(--t-panel)',
          position: 'relative',
        }}
      >
        {showSettings && (
          <SettingsModal onClose={() => setShowSettings(false)} />
        )}
        {/* Inner bordered container */}
        <div
          style={{
            border: '1px solid var(--t-border)',
            borderRadius: 16,
            padding: '10px 12px 8px',
            background: 'var(--t-panel)',
          }}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) setAttachedFiles(prev => [...prev, ...files]);
              e.target.value = '';
            }}
          />
          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {attachedFiles.map((f, i) => (
                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px 2px 6px', border: '1px solid var(--t-border)', borderRadius: 999, fontSize: 11, color: 'var(--t-fg-3)', background: 'var(--t-bg)' }}>
                  <Paperclip size={10} strokeWidth={1.8} />
                  <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'var(--t-fg-4)', lineHeight: 1, marginLeft: 2 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          {/* 2026-05-11 Story 15.30 follow-up: 移除 isComplete 禁用 — Story 15.29
              multi-turn 上线后，session.isComplete=true 正是发后续 message 的
              黄金时机（handleSend 派生新 run session + 透传 conversation_id 让
              prompt-assembly 自动注入历史）。原逻辑误把"主流程完成"当"对话结束"。*/}
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              session.isComplete
                ? `继续对话 · 接着问 · ${kbdSendCmd()} 发送`
                : `补充指令 · 或保持沉默让 AI 完成 · ${kbdSendCmd()} 发送`
            }
            style={{
              width: '100%',
              background: 'transparent',
              border: 0,
              outline: 'none',
              color: 'var(--t-fg)',
              fontSize: 13,
              lineHeight: 1.55,
              resize: 'none',
              minHeight: 44,
              maxHeight: 160,
              fontFamily: 'inherit',
              cursor: 'text',
            }}
          />
          {/* composer-bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            {/* Left — icon buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Settings — toggles inline popup */}
              <button
                type="button"
                title="会话设置"
                onClick={() => setShowSettings(v => !v)}
                style={{
                  width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: showSettings ? 'var(--t-accent-tint)' : 'transparent',
                  border: showSettings ? '1px solid var(--t-accent)' : '0',
                  borderRadius: 7, cursor: 'pointer',
                  color: showSettings ? 'var(--t-accent-bright)' : 'var(--t-fg-4)',
                  transition: 'background .12s, color .12s',
                }}
              >
                <Settings size={14} strokeWidth={1.8} />
              </button>
              {/* Attach */}
              <button
                type="button"
                title="附件"
                onClick={() => fileInputRef.current?.click()}
                style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: attachedFiles.length > 0 ? 'var(--t-accent-tint)' : 'transparent', border: 0, borderRadius: 7, cursor: 'pointer', color: attachedFiles.length > 0 ? 'var(--t-accent-bright)' : 'var(--t-fg-4)' }}
              >
                <Paperclip size={14} strokeWidth={1.8} />
              </button>
              {/* Model chip — 2026-05-11 kit alignment: cmp-chip + cmp-chip-meta
                  pattern. [dot] claude-sonnet | 4.6. Click is a no-op for now
                  (model picker hook-up out of scope). */}
              <button type="button" title="模型" className="cmp-chip">
                <span className="cmp-chip-dot" aria-hidden="true" />
                <span>claude-sonnet</span>
                <span className="cmp-chip-meta">4.6</span>
              </button>
            </div>
            {/* Right — send */}
            {/* 2026-05-11 Story 15.30 follow-up: send 按钮仅依赖 input 非空 — 不
                看 session.isComplete (multi-turn 后续轮次允许发送)。*/}
            <button
              type="button"
              onClick={handleSend}
              disabled={!message.trim() && attachedFiles.length === 0}
              style={{
                width: 32, height: 28,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--t-accent)', border: '1px solid var(--t-accent)', borderRadius: 8,
                cursor: (!message.trim() && attachedFiles.length === 0) ? 'not-allowed' : 'pointer',
                color: 'var(--t-accent-ink)',
                opacity: (!message.trim() && attachedFiles.length === 0) ? 0.4 : 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </div>

        {/* 2026-05-11 kit alignment: composer-hint mono row below the bordered
            input. Discloses keyboard shortcuts (⌘↵ send / Esc cancel / 📎). */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 4px 0',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9.5,
            color: 'var(--t-fg-5)',
            letterSpacing: '.04em',
          }}
        >
          <kbd style={kbdStyle}>{kbdSendCmd()}</kbd>
          <span>发送</span>
          <span style={{ opacity: 0.4, padding: '0 2px' }}>·</span>
          <kbd style={kbdStyle}>Esc</kbd>
          <span>取消</span>
          <span style={{ opacity: 0.4, padding: '0 2px' }}>·</span>
          <kbd style={kbdStyle}>📎</kbd>
          <span>附件</span>
        </div>
      </div>
    </aside>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 4px',
  border: '1px solid var(--t-border)',
  background: 'var(--t-panel)',
  borderRadius: 3,
  fontSize: 9.5,
  fontFamily: 'var(--font-mono, monospace)',
  color: 'var(--t-fg-4)',
  lineHeight: 1,
};

// Mac uses ⌘↵, Windows/Linux use Ctrl+↵. Mirror useRunSession's platform-aware
// shortcut display from the StartPage so the hint matches what the keyDown
// handler actually accepts.
function kbdSendCmd(): string {
  if (typeof navigator === 'undefined') return '⌘↵';
  return navigator.platform.toLowerCase().includes('mac') ? '⌘↵' : 'Ctrl+↵';
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
/* spinning conic-gradient border overlay for the S mark */
.rs-mark::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 9px;
  background: conic-gradient(from 0deg, rgba(168,85,247,.7) 0%, transparent 30%);
  z-index: -1;
  animation: rs-spin 2.4s linear infinite;
}
/* right-panel browser-style view tabs */
.rs-view-tab {
  height: 36px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: -1px;
  border-radius: 8px 8px 0 0;
  background: transparent;
  border: 0;
  color: var(--t-fg-4);
  font-family: inherit;
  transition: color 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.rs-view-tab:hover:not(.rs-view-tab-on) { color: var(--t-fg); }
.rs-view-tab-on {
  color: var(--t-fg);
  background: var(--t-bg);
  box-shadow: inset 1px 0 0 0 var(--t-border), inset -1px 0 0 0 var(--t-border), inset 0 1px 0 0 var(--t-border);
}
.rs-view-tab-ct {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 700;
  height: 16px;
  min-width: 16px;
  padding: 0 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,.06);
  color: var(--t-fg-4);
}
.rs-view-tab-on .rs-view-tab-ct {
  background: rgba(168,85,247,.18);
  color: var(--t-accent-bright);
}
/* status tag */
.rs-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(168,85,247,.14);
  border: 1px solid rgba(168,85,247,.4);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--t-accent-bright);
}
.rs-tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--t-accent);
  animation: rs-pulse 1.4s ease-in-out infinite;
}
/* overview panel rows */
.rs-ov-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  background: transparent;
  border: none;
  border-top: 1px solid var(--t-border);
  color: var(--t-fg);
  font-family: inherit;
  transition: background 0.1s;
}
.rs-ov-row:first-child { border-top: none; }
.rs-ov-row:hover { background: rgba(255,255,255,.03); }

/* ── Agent profile card ─────────────────────────────── */
.ag-card {
  padding: 18px 20px;
  border: 1px solid rgba(168,85,247,.45);
  border-left: 2px solid #A855F7;
  border-radius: 16px;
  background: var(--t-panel);
  box-shadow: 0 0 0 1px rgba(168,85,247,.15), 0 0 28px -8px rgba(168,85,247,.25);
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}
.ag-avatar {
  width: 64px; height: 64px;
  border-radius: 14px;
  background: rgba(168,85,247,.18);
  border: 1px solid rgba(168,85,247,.5);
  color: #EDE9FE;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 800; letter-spacing: -.02em;
  position: relative; flex-shrink: 0;
}
.ag-avatar::after {
  content: ""; position: absolute; inset: -4px;
  border-radius: 18px;
  border: 1px solid transparent;
  border-top-color: rgba(196,181,253,.55);
  animation: rs-spin 2s linear infinite;
}
.ag-name { font-size: 18px; font-weight: 700; letter-spacing: -.01em; color: var(--t-fg); }
.ag-id { font-family: var(--font-mono, monospace); font-size: 10.5px; color: var(--t-fg-4); margin-top: 4px; letter-spacing: .04em; }

/* ── Timeline (5-col grid) ──────────────────────────── */
.ag-tl {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.ag-tl-cell {
  padding: 12px 13px;
  min-height: 108px;
  border: 1px solid var(--t-border);
  border-radius: 12px;
  background: var(--t-panel);
  display: flex; flex-direction: column; gap: 7px;
}
.ag-tl-pending { border-style: dashed; opacity: .6; }
.ag-tl-run { border-color: rgba(168,85,247,.45); background: rgba(168,85,247,.04); }
.ag-tl-done { border-color: rgba(16,185,129,.35); }
.ag-tl-step {
  font-family: var(--font-mono, monospace);
  font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  display: flex; align-items: center; gap: 5px; color: var(--t-fg-4);
}
.ag-tl-num {
  width: 15px; height: 15px; border-radius: 50%;
  border: 1px solid var(--t-border);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 8.5px;
}
.ag-tl-done .ag-tl-num { background: #10B981; border-color: #10B981; color: #0A0A0A; }
.ag-tl-run .ag-tl-num { background: rgba(168,85,247,.18); border-color: #A855F7; color: #C4B5FD; }
.ag-tl-title { font-size: 12px; font-weight: 600; color: var(--t-fg); letter-spacing: -.005em; }
.ag-tl-body { font-family: var(--font-mono, monospace); font-size: 10px; line-height: 1.55; color: var(--t-fg-3); flex: 1; }

/* ── System Prompt ──────────────────────────────────── */
.ag-prompt {
  border: 1px solid var(--t-border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
  background: var(--t-bg);
}
.ag-prompt-h {
  display: flex; justify-content: space-between;
  padding: 7px 12px;
  font-family: var(--font-mono, monospace);
  font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
  border-bottom: 1px solid var(--t-border);
  color: var(--t-fg-4);
  background: var(--t-panel);
}
.ag-prompt-pre {
  margin: 0; padding: 10px 14px;
  font-family: var(--font-mono, monospace);
  font-size: 11px; line-height: 1.65;
  color: var(--t-fg-3); white-space: pre-wrap;
}

/* ── Tool Decision Log ──────────────────────────────── */
.ag-tool-log {
  border: 1px solid var(--t-border);
  border-radius: 10px; overflow: hidden;
  background: var(--t-panel);
  margin-bottom: 14px;
}
.ag-tool-log-h {
  display: flex; align-items: center;
  padding: 7px 12px;
  font-family: var(--font-mono, monospace);
  font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
  color: var(--t-fg-4);
  border-bottom: 1px solid var(--t-border);
  background: var(--t-panel);
}
.ag-tool-grid { display: grid; grid-template-columns: 1fr 1fr; }
.ag-tool-col { padding: 10px 12px; }
.ag-tool-col-h {
  display: flex; align-items: center; gap: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--t-fg-4); padding-bottom: 8px; margin-bottom: 4px;
  border-bottom: 1px solid var(--t-border);
}
.ag-tool-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 6px; border-radius: 6px;
  margin-bottom: 3px; font-size: 10.5px;
}
.ag-tool-ic {
  width: 14px; height: 14px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; flex-shrink: 0;
}
.ag-tool-nm { font-family: var(--font-mono, monospace); font-size: 10.5px; font-weight: 500; color: var(--t-fg); }

/* ── Live stream bar ────────────────────────────────── */
.ag-stream {
  padding: 9px 14px;
  border: 1px solid var(--t-border);
  border-radius: 10px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  background: var(--t-panel);
  display: flex; align-items: center; gap: 10px;
  color: var(--t-fg-3);
}
.ag-stream-lbl {
  font-size: 9px; font-weight: 700; letter-spacing: .14em;
  color: var(--t-fg-5);
}
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
  const [savedTeamId, setSavedTeamId] = useState<string | null>(null);
  const savedRef = useRef(false);

  // Auto-persist team + agents + chat group when blueprint run completes
  useEffect(() => {
    if (!session.isComplete || session.nodes.length === 0 || savedRef.current) return;
    savedRef.current = true;

    const agentNodes = session.nodes.filter(n => n.type === 'agent');
    const coordinator = session.nodes.find(n => n.type === 'coordinator');
    const teamName = coordinator?.title ?? goal.slice(0, 40) ?? 'AI Team';

    (async () => {
      try {
        const created = await Promise.all(
          agentNodes.map(n => quickCreateAgent({ name: n.title, soul: n.sub || n.title }))
        );
        const agentIds = created.map(a => a.agent_id);
        const team = await createTeam({ name: teamName, description: goal, agent_ids: agentIds });
        await createGroup({ templateId: '', groupTemplateId: '', name: teamName, agentIds: agentIds, memberEmails: [], policyMatrix: {} });
        setSavedTeamId(team.team_id);
      } catch (e) {
        console.warn('[RunSession] auto-save failed:', e);
      }
    })();
  }, [session.isComplete, session.nodes.length]);

  // 2026-05-11 Layer 1 — chat-mode detection (mirrors LeftPanel).
  // Triggers when no canvas events at all AND either text streamed in OR
  // the run completed silently. Collapses the right canvas panel.
  const isChatMode =
    (session.chatReply.length > 0 || session.isComplete) &&
    session.steps.length === 0 &&
    session.nodes.length === 0 &&
    !session.blueprintFile;

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
      {savedTeamId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: 'var(--t-ok)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', fontSize: 12.5, fontWeight: 600 }}>
          <span>✓ Team saved —</span>
          <button type="button" onClick={() => onNavigate('/teams')} style={{ background: 'rgba(255,255,255,.25)', border: 'none', borderRadius: 5, color: '#fff', padding: '2px 10px', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}>查看 Teams →</button>
          <button type="button" onClick={() => onNavigate('/chat/default')} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 5, color: '#fff', padding: '2px 10px', cursor: 'pointer', fontSize: 11.5 }}>Chat →</button>
          <button type="button" onClick={() => onNavigate('/agents')} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 5, color: '#fff', padding: '2px 10px', cursor: 'pointer', fontSize: 11.5 }}>Agents →</button>
          <button type="button" onClick={() => setSavedTeamId(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, opacity: .7 }}>✕</button>
        </div>
      )}
      <div
        style={{
          display: 'grid',
          // 2026-05-11 Layer 1: chat mode collapses the right canvas panel
          // (nothing to draw when LLM is plain-text-replying).
          gridTemplateColumns: isChatMode
            ? '1fr'
            : (collapsed ? '44px 1fr' : '420px 1fr'),
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
        {!isChatMode && (
          <RightPanel
            session={session}
            onOpenEditor={handleOpenEditor}
            zoom={zoom}
            onZoomChange={setZoom}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            sessionId={sessionId}
          />
        )}
      </div>
    </>
  );
}
