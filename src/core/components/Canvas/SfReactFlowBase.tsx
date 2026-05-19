/**
 * SfReactFlowBase — shared react-flow shell used by all three canvases.
 *
 * Why this exists
 * ---------------
 * The codebase has three DAG views of the same conceptual thing (an agent
 * workflow):
 *   - `/editor`            → WorkflowCanvas        (creator mode, Zustand store)
 *   - `/teams/:id`         → TeamWorkflowEditor    (config mode, REST persisted)
 *   - `/run-session/:id`   → BlueprintCanvas       (live mode, SSE stream)
 *
 * Before this refactor they each re-implemented Background/Controls/MiniMap,
 * pan/zoom config, edge styling, and keyboard shortcuts independently. Any
 * new feature had to be added three times; visual regressions slipped through
 * one canvas while another stayed fixed. This module centralises the shell
 * so the three callers only diff in `nodeTypes`, handlers, and overlay Panels
 * passed as `children`.
 *
 * What it standardises
 * --------------------
 *   - Background: dotted grid with --t-border-subtle color
 *   - Controls:   bottom-right, panel-elev styling
 *   - MiniMap:    bottom-left (optional, opt-in via showMiniMap)
 *   - Viewport:   minZoom 0.1, maxZoom 2, panOnDrag, zoomOnScroll/Pinch
 *   - Perf:       onlyRenderVisibleElements ON by default
 *   - Edges:      MarkerType.ArrowClosed default (caller can override)
 *   - Keyboard:   `f` = fitView, `Escape` = clear selection
 *   - Spotlight:  `spotlightNodeId` prop gently pans to that node on change
 *   - Auto-fit:   `fitViewOnNodeCountGrow` re-fits when new nodes stream in
 *
 * What it does NOT do
 * -------------------
 *   - Manage node/edge state — caller owns `useNodesState`/`useEdgesState`
 *     (or a Zustand store for the editor case)
 *   - Decide undo/redo behavior — that's editor-specific, lives in caller
 *   - Right-click menus / Panels — pass as `children`
 *
 * Provider
 * --------
 * The component wraps itself in `ReactFlowProvider` by default so each canvas
 * gets its own viewport. Set `withProvider={false}` if a parent already
 * provides one (e.g. when two canvases share a viewport — currently no
 * caller needs this).
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeMouseHandler,
  type ConnectionMode,
  type ReactFlowProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

const DEFAULT_FIT_PADDING = 0.18;

export interface SfReactFlowBaseProps {
  nodes: Node[];
  edges: Edge[];
  /** Node renderer registry — required so callers pass their own node UI. */
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;

  // ─── state callbacks (optional in live/readonly modes) ────────────────
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  onConnect?: OnConnect;
  onNodeClick?: NodeMouseHandler;
  onNodeDragStop?: NodeMouseHandler;
  onPaneClick?: (event: React.MouseEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
  onDragOver?: (event: React.DragEvent) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onNodesDelete?: (nodes: Node[]) => void;
  onEdgesDelete?: (edges: Edge[]) => void;

  // ─── viewport features ─────────────────────────────────────────────────
  /** Auto-fitView whenever the node count grows (streaming SSE case). */
  fitViewOnNodeCountGrow?: boolean;
  /** When set, pan-center on the matching node id with a gentle ease. */
  spotlightNodeId?: string | null;

  // ─── shell controls ────────────────────────────────────────────────────
  showMiniMap?: boolean;
  miniMapNodeColor?: (node: Node) => string;
  showControls?: boolean;
  /** Press `f` to fit view. Default ON. */
  enableKeyboardShortcuts?: boolean;
  /** Standard interactivity guards. */
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
  connectionMode?: ConnectionMode;

  // ─── escape hatches ────────────────────────────────────────────────────
  withProvider?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Extra Panel/overlay children rendered inside <ReactFlow>. */
  children?: React.ReactNode;
  /** Pass-through for any ReactFlow prop we haven't surfaced explicitly. */
  reactFlowProps?: Partial<ReactFlowProps>;
}

function SfReactFlowBaseInner({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onNodeDragStop,
  onPaneClick,
  onDrop,
  onDragOver,
  onEdgeClick,
  onNodesDelete,
  onEdgesDelete,
  fitViewOnNodeCountGrow = false,
  spotlightNodeId = null,
  showMiniMap = true,
  miniMapNodeColor,
  showControls = true,
  enableKeyboardShortcuts = true,
  nodesDraggable = true,
  nodesConnectable = true,
  elementsSelectable = true,
  connectionMode,
  className,
  style,
  children,
  reactFlowProps,
}: Omit<SfReactFlowBaseProps, 'withProvider'>) {
  const { fitView, setCenter, getNode } = useReactFlow();
  const lastNodeCountRef = React.useRef(0);

  // Decorate edges with the default arrow marker unless the caller already
  // specified one. This is the visual that was missing from BlueprintCanvas
  // and TeamWorkflowEditor before the unification.
  const decoratedEdges = useMemo(() => {
    return edges.map((e) => {
      if (e.markerEnd !== undefined) return e;
      const strokeColor =
        (e.style?.stroke as string | undefined) ?? 'var(--t-fg-4, #737373)';
      return {
        ...e,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 16,
          height: 16,
        },
      };
    });
  }, [edges]);

  // Auto-fit when the node set grows (streaming case). Existing nodes' user
  // drags are preserved by the caller's state — we only re-fit, don't
  // re-layout.
  useEffect(() => {
    if (!fitViewOnNodeCountGrow) return;
    if (nodes.length > lastNodeCountRef.current && nodes.length > 0) {
      lastNodeCountRef.current = nodes.length;
      requestAnimationFrame(() => {
        fitView({ padding: DEFAULT_FIT_PADDING, duration: 320 });
      });
    }
  }, [nodes.length, fitViewOnNodeCountGrow, fitView]);

  // Spotlight a specific node — gentle pan, preserve zoom.
  useEffect(() => {
    if (!spotlightNodeId) return;
    const n = getNode(spotlightNodeId);
    if (!n) return;
    // Pan to the node's centre. ReactFlow positions are top-left of node;
    // we approximate centre by adding measured size when known. If unknown
    // (newly mounted), `width`/`height` may be undefined — setCenter still
    // works on the raw position, the slight offset is acceptable.
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    const cx = n.position.x + w / 2;
    const cy = n.position.y + h / 2;
    setCenter(cx, cy, { duration: 480 });
  }, [spotlightNodeId, getNode, setCenter]);

  // Keyboard: `f` fit view, `Escape` deselect. Editor-specific shortcuts
  // (undo/redo/delete) stay in the caller — they need store access.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enableKeyboardShortcuts) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        fitView({ padding: DEFAULT_FIT_PADDING, duration: 240 });
      } else if (e.key === 'Escape' && onPaneClick) {
        onPaneClick(new MouseEvent('click') as unknown as React.MouseEvent);
      }
    },
    [enableKeyboardShortcuts, fitView, onPaneClick],
  );
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcuts, handleKeyDown]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={decoratedEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={onPaneClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onEdgeClick={onEdgeClick}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onContextMenu={(e) => e.preventDefault()}
      proOptions={proOptions}
      fitView
      fitViewOptions={{ padding: DEFAULT_FIT_PADDING }}
      minZoom={0.1}
      maxZoom={2}
      panOnDrag
      panOnScroll={false}
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      selectNodesOnDrag={false}
      nodesDraggable={nodesDraggable}
      nodesConnectable={nodesConnectable}
      elementsSelectable={elementsSelectable}
      connectionMode={connectionMode}
      onlyRenderVisibleElements
      deleteKeyCode={null}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--t-bg, #0a0a0a)',
        ...style,
      }}
      {...reactFlowProps}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1}
        color="var(--t-border-subtle, rgba(255,255,255,.06))"
      />
      {showControls && (
        <Controls
          showInteractive={false}
          position="bottom-right"
          style={{
            background: 'var(--t-bg-elev-2, #141414)',
            border: '1px solid var(--t-border, #27272A)',
            borderRadius: 7,
          }}
        />
      )}
      {showMiniMap && (
        <MiniMap
          pannable
          zoomable
          position="bottom-left"
          maskColor="rgba(0,0,0,0.55)"
          style={{
            background: 'var(--t-bg-elev-2, #141414)',
            border: '1px solid var(--t-border, #27272A)',
            borderRadius: 7,
            width: 160,
            height: 96,
          }}
          nodeColor={miniMapNodeColor ?? ((n) => {
            const d = n.data as { color?: string } | undefined;
            return d?.color || 'var(--t-fg-4, #737373)';
          })}
        />
      )}
      {children}
    </ReactFlow>
  );
}

const SfReactFlowBase: React.FC<SfReactFlowBaseProps> = ({
  withProvider = true,
  ...props
}) => {
  const inner = <SfReactFlowBaseInner {...props} />;
  return withProvider ? <ReactFlowProvider>{inner}</ReactFlowProvider> : inner;
};

export default SfReactFlowBase;
