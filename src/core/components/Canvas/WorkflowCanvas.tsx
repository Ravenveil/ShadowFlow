// ============================================================================
// 工作流画布组件 - 基于 ReactFlow 的主画布
// ============================================================================

import React, { useCallback, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  Panel,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import { useI18n } from '../../../common/i18n';
import { useWorkflowActions } from '../../hooks/useWorkflow';
import { NodeContextMenu } from '../Node/NodeContextMenu';
import { SfNode } from '../Node/SfNode';
import { ApprovalGateNode } from '../Node/ApprovalGateNode';
import { BarrierNode } from '../Node/BarrierNode';
import { clsx } from 'clsx';

import 'reactflow/dist/style.css';

const nodeTypes = {
  custom: SfNode,
  default: SfNode,
  agent: SfNode,
  planning: SfNode,
  parallel: SfNode,
  retry: SfNode,
  decision: SfNode,
  approval_gate: ApprovalGateNode,
  barrier: BarrierNode,
};

export type SfEdgeType = 'default' | 'straight' | 'smoothstep' | 'step';

// 内部画布组件（使用 Provider 后）
function WorkflowCanvasInner({ edgeType }: { edgeType?: SfEdgeType }) {
  const { t } = useI18n();
  const { screenToFlowPosition } = useReactFlow();
  const workflow = useWorkflowActions();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);

  // 转换内部节点到 ReactFlow 节点格式
  const reactFlowNodes: Node[] = useMemo(() => {
    return workflow.nodes.map(node => {
      // Map data.nodeType to a registered ReactFlow node type key
      const dataNodeType = node.data.nodeType || 'default';
      const rfType = (dataNodeType in nodeTypes) ? dataNodeType : 'custom';

      return {
        id: node.id,
        type: rfType,
        position: node.position,
        data: {
          ...node.data,
          // 添加额外属性用于特殊显示
          progress: node.data.config?.progress || 0,
        },
        selected: workflow.selectedNodeIds.includes(node.id),
      };
    });
  }, [workflow.nodes, workflow.selectedNodeIds]);

  // 转换内部边到 ReactFlow 边格式
  const reactFlowEdges: Edge[] = useMemo(() => {
    return workflow.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edgeType || edge.type || 'default',
      animated: edge.animated || workflow.ui.isFlowing, // 运行时自动开启动画
      className: clsx(edge.className, workflow.ui.isFlowing && 'flowing'), // 增加 CSS 动画
      style: edge.style,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.style?.stroke as string || '#94a3b8',
      },
      label: edge.data?.label,
      data: edge.data,
    }));
  }, [workflow.edges, workflow.ui.isFlowing, edgeType]);

  // 处理节点拖拽
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      workflow.updateNode(node.id, { position: node.position });
    },
    [workflow]
  );

  // 处理节点点击
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // 右键点击显示菜单
      if (event.button === 2) {
        event.stopPropagation();
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        setContextMenu({
          nodeId: node.id,
          position: { x: rect.left, y: rect.bottom },
        });
        return;
      }

      if (workflow.selectedNodeIds.includes(node.id)) {
        workflow.deselectNode(node.id);
      } else {
        workflow.selectNode(node.id);
      }
    },
    [workflow]
  );

  // 处理画布点击（取消选择）
  const onPaneClick = useCallback(() => {
    workflow.deselectAll();
    setContextMenu(null);
  }, [workflow]);

  // 处理连接
  const onConnect = useCallback(
    (params: any) => {
      workflow.connectNodes(
        params.source,
        params.target,
        params.sourceHandle,
        params.targetHandle
      );
    },
    [workflow]
  );

  // 处理拖拽放置（从节点面板拖放）
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      workflow.addNode(nodeType, position);
    },
    [screenToFlowPosition, workflow]
  );

  // 处理节点删除
  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      deletedNodes.forEach(node => workflow.deleteNode(node.id));
    },
    [workflow]
  );

  // 处理边删除
  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      deletedEdges.forEach(edge => workflow.deleteEdge(edge.id));
    },
    [workflow]
  );

  // 快捷键处理
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ctrl/Cmd + Z: 撤销
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (workflow.canUndo) workflow.undo();
      }
      // Ctrl/Cmd + Shift + Z: 重做
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        if (workflow.canRedo) workflow.redo();
      }
      // Ctrl/Cmd + Y: 重做
      if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        event.preventDefault();
        if (workflow.canRedo) workflow.redo();
      }
      // Delete/Backspace: 删除选中
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        workflow.selectedNodeIds.length > 0
      ) {
        event.preventDefault();
        workflow.selectedNodeIds.forEach(id => workflow.deleteNode(id));
      }
    },
    [workflow]
  );

  // 注册快捷键
  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex-1 relative h-full w-full overflow-hidden">
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={() => {}} // 由我们的 store 管理
        onEdgesChange={() => {}} // 由我们的 store 管理
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        fitView
        onContextMenu={(e) => e.preventDefault()}
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        deleteKeyCode={null}
        panOnScroll={true}
        panOnDrag={true}
        nodesDraggable={true}
        onlyRenderVisibleElements={true}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="#3F3F46"
        />

        <Controls
          style={{ background: '#0F0F12', border: '1px solid #27272A', borderRadius: 8 }}
        />

        {workflow.ui.miniMapOpen && (
          <MiniMap
            style={{ background: '#0F0F12', border: '1px solid #27272A' }}
            nodeColor={(node) => {
              const nodeData = node.data as any;
              return nodeData?.color || '#52525B';
            }}
            maskColor="rgba(0,0,0,0.4)"
          />
        )}

        {/* 运行进度 */}
        {workflow.isRunning && (
          <Panel position="top-right" className="bg-white shadow-lg rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
              <div className="text-sm">
                <p className="font-medium">{t('workflowStarted')}</p>
                <div className="mt-2 w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${workflow.runProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {workflow.runProgress.toFixed(0)}%
                </p>
              </div>
            </div>
          </Panel>
        )}

        {/* 提示信息 */}
        {workflow.nodes.length === 0 && (
          <Panel position="top-center" style={{ background: '#0F0F12', border: '1px solid #27272A', borderRadius: 10, padding: '14px 20px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#71717A', marginBottom: 4 }}>Drag agents from the left panel to get started</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#52525B' }}>Connect nodes · Set policy · Run</p>
          </Panel>
        )}

        {/* 右键菜单 */}
        {contextMenu && (
          <NodeContextMenu
            nodeId={contextMenu.nodeId}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          />
        )}
      </ReactFlow>
    </div>
  );
}

// 画布组件 —— 调用方可选地在外层套 ReactFlowProvider 以共享同一个实例
export function WorkflowCanvas({ edgeType, withProvider = true }: { edgeType?: SfEdgeType; withProvider?: boolean } = {}) {
  const inner = <WorkflowCanvasInner edgeType={edgeType} />;
  return withProvider ? <ReactFlowProvider>{inner}</ReactFlowProvider> : inner;
}
