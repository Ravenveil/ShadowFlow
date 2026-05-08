/**
 * Scene Canvas Shell — Story 8.3 (AC4, AC6)
 *
 * 把 AgentBlueprint 投影为可视节点/边的 Scene Canvas。
 * Decision F18: custom CSS positioned layout + SVG bezier edges instead of ReactFlow —
 *   avoids heavy dependency; sufficient for current tree-shaped topology.
 * selection 与 SceneTree / Inspector 双向联动。
 *
 * 布局逻辑：
 *   col 0 → Team root (x=40)
 *   col 1 → Boss nodes (x=220)
 *   col 2 → Top-level worker nodes (x=420)
 *   col 3 → Sub-agent (worker under boss) nodes (x=600)
 *   col 4 → Shared resource anchors (x=800)
 */
import { useMemo } from 'react';
import { useBuilderStore, blueprintToSceneProjection } from '../../stores/builderStore';
import type { AgentBlueprint } from '../../../common/types/agent-builder';
import type { SceneNode } from '../../stores/builderStore';
import { Icon } from '../../../common/icons/iconRegistry';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
// F2: col 3 separated from col 2 to prevent sub-agent/worker overlap
const COL_X: Record<number, number> = { 0: 40, 1: 220, 2: 420, 3: 600, 4: 800 };
const ROW_H = 90;
const ROW_BASE = 60;
const NODE_W = 160;
const NODE_H = 52;

function nodeX(col: number) {
  return COL_X[col] ?? 40;
}
function nodeY(row: number) {
  return ROW_BASE + row * ROW_H;
}

function centerX(node: SceneNode) {
  return nodeX(node.col) + NODE_W / 2;
}
function centerY(node: SceneNode) {
  return nodeY(node.row) + NODE_H / 2;
}

// ---------------------------------------------------------------------------
// Canvas node component
// ---------------------------------------------------------------------------

interface CanvasNodeProps {
  node: SceneNode;
  selected: boolean;
  onSelect: () => void;
}

function CanvasNode({ node, selected, onSelect }: CanvasNodeProps) {
  const x = nodeX(node.col);
  const y = nodeY(node.row);

  const kindIcon: Record<string, string> = {
    team: '◈',
    boss: 'Target',
    worker: 'HardHat',
    'shared-tools': 'Wrench',
    'shared-knowledge': 'BookOpen',
    'shared-memory': 'Brain',
  };

  const kindLabel: Record<string, string> = {
    team: 'team root',
    boss: 'boss · can_spawn_tasks',
    worker: 'worker',
    'shared-tools': 'tools · shared',
    'shared-knowledge': 'knowledge · shared',
    'shared-memory': 'memory · shared',
  };

  const isShared = node.kind.startsWith('shared-');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-testid={`canvas-node-${node.id}`}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      className={[
        'absolute cursor-pointer rounded-[12px] border px-3 py-2.5 transition-all',
        isShared
          ? 'border-dashed border-sf-border bg-transparent text-sf-fg3'
          : node.kind === 'boss'
          ? 'border-sf-accent bg-gradient-to-b from-sf-elev3 to-sf-accent-tint text-sf-fg1'
          : node.kind === 'team'
          ? 'border-sf-fg5 bg-sf-elev2 text-sf-fg1'
          : 'border-sf-border bg-sf-elev2 text-sf-fg2',
        selected
          ? 'shadow-[0_0_0_3px_var(--t-accent-tint)] border-sf-accent'
          : '',
      ].join(' ')}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${NODE_W}px`,
        minHeight: `${NODE_H}px`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center text-sf-fg2" aria-hidden>
          <Icon token={kindIcon[node.kind]} size={14} fallback={<span>{kindIcon[node.kind] ?? '·'}</span>} />
        </span>
        <span className="text-[12px] font-semibold leading-tight truncate">{node.label}</span>
      </div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-sf-fg5">
        {kindLabel[node.kind] ?? node.kind}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge SVG paths
// ---------------------------------------------------------------------------

interface EdgeProps {
  fromNode: SceneNode;
  toNode: SceneNode;
  dashed?: boolean;
}

function EdgePath({ fromNode, toNode, dashed }: EdgeProps) {
  // F1: x1 must be the right edge of fromNode, not an offset from centerX
  const x1 = nodeX(fromNode.col) + NODE_W; // right edge of from
  const y1 = centerY(fromNode);
  const x2 = nodeX(toNode.col);                     // left edge of to
  const y2 = centerY(toNode);
  const mx = (x1 + x2) / 2;

  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;

  return (
    <path
      d={d}
      fill="none"
      stroke={dashed ? 'rgba(113,113,122,0.4)' : 'rgba(113,113,122,0.6)'}
      strokeWidth={1.5}
      strokeDasharray={dashed ? '4 4' : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// SceneCanvasShell
// ---------------------------------------------------------------------------

interface SceneCanvasShellProps {
  blueprint: AgentBlueprint;
}

export function SceneCanvasShell({ blueprint }: SceneCanvasShellProps) {
  const selection = useBuilderStore((s) => s.selection);
  const setSelection = useBuilderStore((s) => s.setSelection);

  const projection = useMemo(
    () => blueprintToSceneProjection(blueprint),
    [blueprint],
  );

  const nodeMap = useMemo(() => {
    const map: Record<string, SceneNode> = {};
    projection.nodes.forEach((n) => (map[n.id] = n));
    return map;
  }, [projection.nodes]);

  // F9: use reduce instead of spread to avoid stack overflow with large node counts
  const maxRow = projection.nodes.reduce((max, n) => (n.row > max ? n.row : max), 0);
  const canvasH = ROW_BASE + (maxRow + 1) * ROW_H + 60;
  const canvasW = Math.max(900, nodeX(4) + NODE_W + 60);

  const hasRoles = blueprint.role_profiles.length > 0;

  if (projection.nodes.length === 0) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center bg-sf-bg"
        data-testid="scene-canvas-empty"
      >
        <p className="text-[13px] text-sf-fg5">No blueprint — fill in Goal Mode first.</p>
      </div>
    );
  }

  return (
    <div
      className="relative flex-1 overflow-auto"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(63,63,70,0.4) 1px, transparent 1.5px)',
        backgroundSize: '20px 20px',
        backgroundColor: '#0A0A0A',
      }}
      data-testid="scene-canvas"
    >
      {!hasRoles && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1"
          data-testid="scene-canvas-no-roles"
        >
          <p className="text-[13px] text-sf-fg3">Team created — add workers to get started.</p>
          <p className="font-mono text-[11px] text-sf-fg5">Select a boss node and click "Add worker"</p>
        </div>
      )}
      <div className="relative" style={{ width: `${canvasW}px`, height: `${canvasH}px` }}>
        {/* SVG edges */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          aria-hidden
        >
          {projection.edges.map((edge) => {
            const from = nodeMap[edge.from];
            const to = nodeMap[edge.to];
            if (!from || !to) return null;
            return (
              <EdgePath
                key={edge.id}
                fromNode={from}
                toNode={to}
                dashed={edge.dashed}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {projection.nodes.map((node) => (
          <CanvasNode
            key={node.id}
            node={node}
            selected={selection === node.id}
            onSelect={() => setSelection(node.id)}
          />
        ))}
      </div>
    </div>
  );
}
