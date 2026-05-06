// ============================================================================
// 节点注册中心
// ============================================================================

import type { NodeCategory } from '../types';
import type { INodeDefinition } from '../types/node';
import { BaseNode } from './base';

/**
 * 节点注册中心
 * 管理所有可用节点的注册和查找
 */
export class NodeRegistry {
  /** 节点定义映射 */
  private definitions: Map<string, INodeDefinition> = new Map();

  /** 节点实例映射 */
  private nodes: Map<string, BaseNode> = new Map();

  /** 分类索引 */
  private categoryIndex: Map<NodeCategory, Set<string>> = new Map();

  constructor() {
    // 初始化分类索引
    const categories: NodeCategory[] = ['input', 'planning', 'execution', 'review', 'decision', 'coordinate', 'output'];
    for (const cat of categories) {
      this.categoryIndex.set(cat, new Set());
    }
  }

  /**
   * 注册节点（同时注册定义和实例）
   */
  register(node: BaseNode, definition?: INodeDefinition): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node already registered: ${node.id}`);
    }

    this.nodes.set(node.id, node);
    this.categoryIndex.get(node.category)?.add(node.id);

    // 如果提供了定义，也注册定义
    if (definition) {
      this.definitions.set(node.id, definition);
    } else {
      // 从节点实例创建基础定义
      this.definitions.set(node.id, {
        id: node.id,
        type: node.type,
        category: node.category,
        icon: node.icon ?? '',
        name: node.name,
        description: node.description,
        inputs: node.inputs,
        outputs: node.outputs,
        configSchema: node.configSchema ? { fields: [] } : undefined
      });
    }
  }

  /**
   * 注册节点定义
   */
  registerDefinition(definition: INodeDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Node definition already registered: ${definition.id}`);
    }
    this.definitions.set(definition.id, definition);
    this.categoryIndex.get(definition.category)?.add(definition.id);
  }

  /**
   * 批量注册节点
   */
  registerAll(nodes: BaseNode[]): void {
    for (const node of nodes) {
      this.register(node);
    }
  }

  /**
   * 批量注册节点定义
   */
  registerAllDefinitions(definitions: INodeDefinition[]): void {
    for (const definition of definitions) {
      this.registerDefinition(definition);
    }
  }

  /**
   * 获取节点实例
   */
  get(id: string): BaseNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * 获取节点定义
   */
  getDefinition(id: string): INodeDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * 按分类获取节点实例
   */
  getByCategory(category: NodeCategory): BaseNode[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.nodes.get(id)!)
      .filter(Boolean);
  }

  /**
   * 按分类获取节点定义
   */
  getDefinitionsByCategory(category: NodeCategory): INodeDefinition[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.definitions.get(id)!)
      .filter(Boolean);
  }

  /**
   * 获取所有节点实例
   */
  getAll(): BaseNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 获取所有节点定义
   */
  getAllDefinitions(): INodeDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * 检查节点是否存在
   */
  has(id: string): boolean {
    return this.nodes.has(id) || this.definitions.has(id);
  }

  /**
   * 检查节点定义是否存在
   */
  hasDefinition(id: string): boolean {
    return this.definitions.has(id);
  }

  /**
   * 移除节点
   */
  remove(id: string): boolean {
    const node = this.nodes.get(id);
    const definition = this.definitions.get(id);

    if (!node && !definition) return false;

    this.nodes.delete(id);
    this.definitions.delete(id);

    if (node) {
      this.categoryIndex.get(node.category)?.delete(id);
    } else if (definition) {
      this.categoryIndex.get(definition.category)?.delete(id);
    }

    return true;
  }

  /**
   * 清空所有节点
   */
  clear(): void {
    this.nodes.clear();
    this.definitions.clear();
    for (const set of this.categoryIndex.values()) {
      set.clear();
    }
  }

  /**
   * 搜索节点实例
   */
  search(query: string): BaseNode[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(node =>
      node.name.en.toLowerCase().includes(lowerQuery) ||
      node.name.zh.toLowerCase().includes(lowerQuery) ||
      node.description.en.toLowerCase().includes(lowerQuery) ||
      node.description.zh.toLowerCase().includes(lowerQuery) ||
      node.id.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 搜索节点定义
   */
  searchDefinitions(query: string): INodeDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllDefinitions().filter(definition =>
      definition.name.en.toLowerCase().includes(lowerQuery) ||
      definition.name.zh.toLowerCase().includes(lowerQuery) ||
      definition.description.en.toLowerCase().includes(lowerQuery) ||
      definition.description.zh.toLowerCase().includes(lowerQuery) ||
      definition.id.toLowerCase().includes(lowerQuery) ||
      definition.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 获取分类统计
   */
  getCategoryStats(): Map<NodeCategory, number> {
    const stats = new Map<NodeCategory, number>();
    for (const [category, ids] of this.categoryIndex.entries()) {
      stats.set(category, ids.size);
    }
    return stats;
  }
}

// 全局注册中心实例
export const globalNodeRegistry = new NodeRegistry();
