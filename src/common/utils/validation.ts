// ============================================================================
// 验证工具函数
// ============================================================================

import { WorkflowNode, WorkflowEdge, PortDefinition } from '../types';

/**
 * 验证节点数据
 */
export function validateNode(node: WorkflowNode): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!node.id) {
    errors.push('Node ID is required');
  }

  if (!node.type) {
    errors.push('Node type is required');
  }

  if (!node.data || !node.data.nodeType) {
    errors.push('Node data or nodeType is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证边数据
 */
export function validateEdge(edge: WorkflowEdge, nodes: WorkflowNode[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!edge.id) {
    errors.push('Edge ID is required');
  }

  if (!edge.source) {
    errors.push('Edge source is required');
  }

  if (!edge.target) {
    errors.push('Edge target is required');
  }

  // 检查源节点是否存在
  const sourceNode = nodes.find(n => n.id === edge.source);
  if (!sourceNode) {
    errors.push(`Source node ${edge.source} not found`);
  }

  // 检查目标节点是否存在
  const targetNode = nodes.find(n => n.id === edge.target);
  if (!targetNode) {
    errors.push(`Target node ${edge.target} not found`);
  }

  // 检查端口是否存在
  if (sourceNode && edge.sourceHandle) {
    const portExists = sourceNode.data.outputs.some(
      p => p.name === edge.sourceHandle
    );
    if (!portExists) {
      errors.push(
        `Source port ${edge.sourceHandle} does not exist on node ${edge.source}`
      );
    }
  }

  if (targetNode && edge.targetHandle) {
    const portExists = targetNode.data.inputs.some(
      p => p.name === edge.targetHandle
    );
    if (!portExists) {
      errors.push(
        `Target port ${edge.targetHandle} does not exist on node ${edge.target}`
      );
    }
  }

  // 检查自环
  if (edge.source === edge.target) {
    errors.push('Edge cannot connect a node to itself');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证工作流
 */
export function validateWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证所有节点
  nodes.forEach((node, index) => {
    const nodeValidation = validateNode(node);
    if (!nodeValidation.valid) {
      errors.push(
        `Node ${index} (${node.id}): ${nodeValidation.errors.join(', ')}`
      );
    }
  });

  // 验证所有边
  edges.forEach((edge, index) => {
    const edgeValidation = validateEdge(edge, nodes);
    if (!edgeValidation.valid) {
      errors.push(
        `Edge ${index} (${edge.id}): ${edgeValidation.errors.join(', ')}`
      );
    }
  });

  // 检查孤立节点
  const connectedNodeIds = new Set([
    ...edges.map(e => e.source),
    ...edges.map(e => e.target),
  ]);
  const isolatedNodes = nodes.filter(n => !connectedNodeIds.has(n.id));
  if (isolatedNodes.length > 0) {
    warnings.push(
      `Found ${isolatedNodes.length} isolated node(s): ${isolatedNodes.map(n => n.id).join(', ')}`
    );
  }

  // 检查环路
  if (hasCycle(nodes, edges)) {
    warnings.push('Workflow contains cycles. This may cause infinite loops during execution.');
  }

  // 检查未连接的必需端口
  nodes.forEach(node => {
    node.data.inputs
      .filter(input => input.required)
      .forEach(input => {
        const hasConnection = edges.some(
          e => e.target === node.id && e.targetHandle === input.name
        );
        if (!hasConnection) {
          warnings.push(
            `Required input port '${input.name}' on node ${node.id} (${node.data.nodeType}) is not connected`
          );
        }
      });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 检测工作流中是否存在环路
 */
function hasCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
  const adjList = new Map<string, string[]>();

  // 构建邻接表
  edges.forEach(edge => {
    if (!adjList.has(edge.source)) {
      adjList.set(edge.source, []);
    }
    adjList.get(edge.source)!.push(edge.target);
  });

  // 使用 DFS 检测环路
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const dfs = (nodeId: string): boolean => {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  // 从每个未访问的节点开始 DFS
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true;
    }
  }

  return false;
}

/**
 * 验证端口类型是否兼容
 */
export function validatePortTypes(
  sourcePort: PortDefinition,
  targetPort: PortDefinition
): {
  compatible: boolean;
  reason?: string;
} {
  // 'any' 类型可以连接任何类型
  if (sourcePort.type === 'any' || targetPort.type === 'any') {
    return { compatible: true };
  }

  // 精确匹配
  if (sourcePort.type === targetPort.type) {
    return { compatible: true };
  }

  // 类型兼容性规则
  const compatibilityRules: Record<string, string[]> = {
    string: ['any'],
    number: ['any'],
    boolean: ['any'],
    object: ['any'],
    array: ['any'],
    // 允许某些隐式转换
  };

  if (compatibilityRules[sourcePort.type]?.includes(targetPort.type)) {
    return { compatible: true };
  }

  return {
    compatible: false,
    reason: `Type ${sourcePort.type} is not compatible with ${targetPort.type}`,
  };
}
