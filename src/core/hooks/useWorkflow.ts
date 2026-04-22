// ============================================================================
// 工作流 Hook - 工作流操作的便捷封装
// ============================================================================

import { useCallback, useMemo } from 'react';
import { useWorkflow } from '../stores/workflowStore';
import { useNodeRegistry } from '../stores/nodeRegistryStore';
import { WorkflowNode, WorkflowEdge, NodeData, INode, NodeCategory } from '../types';

export function useWorkflowActions() {
  const workflow = useWorkflow();
  const nodeRegistry = useNodeRegistry();

  // 添加新节点到画布
  const addNode = useCallback(
    (nodeType: string, position: { x: number; y: number }) => {
      const nodeDef = nodeRegistry.getNode(nodeType);
      if (!nodeDef) return null;

      const nodeData: NodeData = {
        nodeId: '',
        nodeType,
        category: nodeDef.category,
        name: nodeDef.name,
        description: nodeDef.description,
        icon: nodeDef.icon,
        color: nodeDef.color || '#6b7280',
        inputs: nodeDef.inputs,
        outputs: nodeDef.outputs,
        config: { ...nodeDef.defaultConfig },
        status: 'idle',
      };

      const newNode: WorkflowNode = {
        id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        // P1-δ fix: preserve actual nodeType so external consumers (YAML export, runtime)
        // can route on node.type. WorkflowCanvas still uses data.nodeType for rfType lookup.
        type: nodeType,
        position,
        data: nodeData,
      };

      newNode.data.nodeId = newNode.id;
      workflow.addNode(newNode);

      return newNode;
    },
    [workflow, nodeRegistry]
  );

  // 连接两个节点
  const connectNodes = useCallback(
    (sourceId: string, targetId: string, sourceHandle?: string, targetHandle?: string) => {
      const edge: WorkflowEdge = {
        id: `edge_${sourceId}_${targetId}_${Date.now()}`,
        source: sourceId,
        target: targetId,
        sourceHandle,
        targetHandle,
        type: 'default',
        animated: true,
        style: { stroke: '#52525B', strokeWidth: 2, strokeLinecap: 'round' },
      };
      workflow.addEdge(edge);
      return edge;
    },
    [workflow]
  );

  // 根据节点类型查找节点
  const getNodesByType = useCallback(
    (nodeType: string) => {
      return workflow.nodes.filter(node => node.data.nodeType === nodeType);
    },
    [workflow.nodes]
  );

  // 根据分类查找节点
  const getNodesByCategory = useCallback(
    (category: NodeCategory) => {
      return workflow.nodes.filter(node => node.data.category === category);
    },
    [workflow.nodes]
  );

  // 查找节点的输入连接
  const getInputEdges = useCallback(
    (nodeId: string) => {
      return workflow.edges.filter(edge => edge.target === nodeId);
    },
    [workflow.edges]
  );

  // 查找节点的输出连接
  const getOutputEdges = useCallback(
    (nodeId: string) => {
      return workflow.edges.filter(edge => edge.source === nodeId);
    },
    [workflow.edges]
  );

  // 查找节点的依赖（上游节点）
  const getUpstreamNodes = useCallback(
    (nodeId: string) => {
      const inputEdges = getInputEdges(nodeId);
      const upstreamIds = inputEdges.map(e => e.source);
      return workflow.nodes.filter(node => upstreamIds.includes(node.id));
    },
    [getInputEdges, workflow.nodes]
  );

  // 查找节点的下游节点
  const getDownstreamNodes = useCallback(
    (nodeId: string) => {
      const outputEdges = getOutputEdges(nodeId);
      const downstreamIds = outputEdges.map(e => e.target);
      return workflow.nodes.filter(node => downstreamIds.includes(node.id));
    },
    [getOutputEdges, workflow.nodes]
  );

  // 获取节点的执行路径（从起始节点到当前节点）
  const getExecutionPath = useCallback(
    (nodeId: string) => {
      const path: string[] = [];
      let currentNodeId = nodeId;

      while (currentNodeId) {
        path.unshift(currentNodeId);
        const upstreamEdges = getInputEdges(currentNodeId);
        if (upstreamEdges.length === 0) break;
        currentNodeId = upstreamEdges[0].source;
      }

      return path;
    },
    [getInputEdges]
  );

  // 验证工作流
  const validateWorkflow = useCallback(() => {
    const errors: string[] = [];

    // 检查孤立节点
    const connectedNodeIds = new Set([
      ...workflow.edges.map(e => e.source),
      ...workflow.edges.map(e => e.target),
    ]);
    const isolatedNodes = workflow.nodes.filter(
      node => !connectedNodeIds.has(node.id)
    );

    if (isolatedNodes.length > 0) {
      errors.push(
        `Found ${isolatedNodes.length} isolated node(s): ${isolatedNodes.map(n => n.data.nodeType).join(', ')}`
      );
    }

    // 检查环路
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outputEdges = getOutputEdges(nodeId);
      for (const edge of outputEdges) {
        if (!visited.has(edge.target)) {
          if (detectCycle(edge.target)) return true;
        } else if (recursionStack.has(edge.target)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (detectCycle(node.id)) {
          errors.push(`Cycle detected in the workflow`);
          break;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
    };
  }, [workflow.nodes, workflow.edges, getOutputEdges]);

  // 获取工作流统计信息
  const getWorkflowStats = useCallback(() => {
    const nodesByCategory = new Map<NodeCategory, number>();
    workflow.nodes.forEach(node => {
      const count = nodesByCategory.get(node.data.category) || 0;
      nodesByCategory.set(node.data.category, count + 1);
    });

    return {
      totalNodes: workflow.nodes.length,
      totalEdges: workflow.edges.length,
      nodesByCategory: Object.fromEntries(nodesByCategory),
      selectedNodes: workflow.selectedNodeIds.length,
      selectedEdges: workflow.selectedEdgeIds.length,
    };
  }, [workflow.nodes, workflow.edges, workflow.selectedNodeIds, workflow.selectedEdgeIds]);

  return {
    // 状态
    nodes: workflow.nodes,
    edges: workflow.edges,
    selectedNodeIds: workflow.selectedNodeIds,
    selectedEdgeIds: workflow.selectedEdgeIds,
    isRunning: workflow.isRunning,
    runProgress: workflow.runProgress,
    ui: workflow.ui,
    river: workflow.river,

    // 操作
    addNode,
    updateNode: workflow.updateNode,
    deleteNode: workflow.deleteNode,
    duplicateNode: workflow.duplicateNode,
    addEdge: workflow.addEdge,
    updateEdge: workflow.updateEdge,
    deleteEdge: workflow.deleteEdge,
    connectNodes,

    // 河流记忆操作
    pour: workflow.pour,
    drink: workflow.drink,
    buildDam: workflow.buildDam,
    openDam: workflow.openDam,
    clearMainstream: workflow.clearMainstream,

    // 查询
    getNodesByType,
    getNodesByCategory,
    getInputEdges,
    getOutputEdges,
    getUpstreamNodes,
    getDownstreamNodes,
    getExecutionPath,

    // 批量操作
    selectNode: workflow.selectNode,
    deselectNode: workflow.deselectNode,
    selectNodes: workflow.selectNodes,
    deselectAll: workflow.deselectAll,

    // 工具方法
    validateWorkflow,
    getWorkflowStats,

    // 历史记录
    undo: workflow.undo,
    redo: workflow.redo,
    canUndo: workflow.historyIndex > 0,
    canRedo: workflow.historyIndex < workflow.history.length - 1,

    // 导入导出
    exportWorkflow: workflow.exportWorkflow,
    importWorkflow: workflow.importWorkflow,

    // 布局
    autoLayout: workflow.autoLayout,

    // 清空
    clearCanvas: workflow.clearCanvas,

    // 运行控制
    startRun: workflow.startRun,
    stopRun: workflow.stopRun,
    setRunProgress: workflow.setRunProgress,
  };
}
