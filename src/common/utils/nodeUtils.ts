// ============================================================================
// 节点工具函数
// ============================================================================

import { INode, NodeData, NodeCategory } from '../types';
import { useNodeRegistry } from '../stores/nodeRegistryStore';

/**
 * 从节点定义创建节点数据
 */
export function createNodeData(nodeType: string): NodeData | null {
  const nodeRegistry = useNodeRegistry.getState();
  const nodeDef = nodeRegistry.getNode(nodeType);

  if (!nodeDef) return null;

  return {
    nodeId: '',
    nodeType,
    category: nodeDef.category,
    name: nodeDef.name,
    description: nodeDef.description,
    icon: nodeDef.icon,
    color: nodeDef.color || '#6b7280',
    accentColor: nodeDef.accentColor || nodeDef.color,
    inputs: nodeDef.inputs,
    outputs: nodeDef.outputs,
    config: { ...nodeDef.defaultConfig },
    status: 'idle',
  };
}

/**
 * 根据分类获取节点颜色
 */
export function getCategoryColor(category: NodeCategory): string {
  const colors: Record<NodeCategory, string> = {
    input: '#3b82f6',      // 蓝色
    planning: '#8b5cf6',   // 紫色
    execution: '#f59e0b',   // 橙色
    review: '#10b981',      // 绿色
    decision: '#eab308',    // 黄色
    coordinate: '#06b6d4',  // 青色
    output: '#6b7280',      // 灰色
  };
  return colors[category] || '#6b7280';
}

/**
 * 根据分类获取背景色
 */
export function getCategoryBgColor(category: NodeCategory): string {
  const colors: Record<NodeCategory, string> = {
    input: 'bg-blue-50',
    planning: 'bg-purple-50',
    execution: 'bg-orange-50',
    review: 'bg-green-50',
    decision: 'bg-yellow-50',
    coordinate: 'bg-cyan-50',
    output: 'bg-gray-50',
  };
  return colors[category] || 'bg-gray-50';
}

/**
 * 根据分类获取边框色
 */
export function getCategoryBorderColor(category: NodeCategory): string {
  const colors: Record<NodeCategory, string> = {
    input: 'border-blue-200',
    planning: 'border-purple-200',
    execution: 'border-orange-200',
    review: 'border-green-200',
    decision: 'border-yellow-200',
    coordinate: 'border-cyan-200',
    output: 'border-gray-200',
  };
  return colors[category] || 'border-gray-200';
}

/**
 * 生成唯一节点 ID
 */
export function generateNodeId(nodeType: string): string {
  return `${nodeType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成唯一边 ID
 */
export function generateEdgeId(source: string, target: string): string {
  return `edge_${source}_${target}_${Date.now()}`;
}

/**
 * 验证节点配置
 */
export function validateNodeConfig(nodeDef: INode, config: Record<string, any>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (nodeDef.configSchema) {
    // 如果有配置 schema，验证配置
    for (const key of Object.keys(nodeDef.configSchema.properties || {})) {
      const property = nodeDef.configSchema.properties[key];

      if (property.required && !(key in config)) {
        errors.push(`Required config missing: ${key}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 合并默认配置和用户配置
 */
export function mergeConfig(
  defaultConfig: Record<string, any>,
  userConfig: Record<string, any>
): Record<string, any> {
  return {
    ...defaultConfig,
    ...userConfig,
  };
}

/**
 * 格式化节点数据用于显示
 */
export function formatNodeValue(value: any, maxLength = 50): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'string') {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
  }

  return String(value);
}
