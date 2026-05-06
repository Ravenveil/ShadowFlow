/**
 * 节点注册中心
 *
 * 集中管理所有节点的注册、查找和生命周期
 */

import { INode, INodeExecutor, NodeCategory, NodeTypeId } from '../types/node-core';
import { INPUT_NODES } from './node-definitions';
import { PLANNING_NODES } from './node-definitions';
import { EXECUTION_NODES } from './node-definitions';
import { REVIEW_NODES } from './node-definitions';
import { DECISION_NODES } from './node-definitions';
import { COORDINATE_NODES } from './node-definitions';
import { OUTPUT_NODES } from './node-definitions';

/**
 * 节点注册表项
 */
export interface NodeRegistryItem {
  /** 节点定义 */
  definition: INode;

  /** 节点执行器类（工厂） */
  executorFactory: () => INodeExecutor;

  /** 注册时间 */
  registeredAt: Date;

  /** 是否为自定义节点 */
  isCustom: boolean;

  /** 节点元数据 */
  metadata?: {
    version?: string;
    author?: string;
    tags?: string[];
  };
}

/**
 * 节点注册中心
 *
 * 提供节点的注册、查找、创建和管理功能
 */
export class NodeRegistry {
  private registry: Map<string, NodeRegistryItem> = new Map();
  private categoryIndex: Map<NodeCategory, Set<string>> = new Map();
  private customNodes: Set<string> = new Set();

  constructor() {
    this.initializeBuiltinNodes();
  }

  // ===== 初始化 =====

  /**
   * 初始化内置节点
   */
  private initializeBuiltinNodes(): void {
    this.registerBulk(INPUT_NODES, false);
    this.registerBulk(PLANNING_NODES, false);
    this.registerBulk(EXECUTION_NODES, false);
    this.registerBulk(REVIEW_NODES, false);
    this.registerBulk(DECISION_NODES, false);
    this.registerBulk(COORDINATE_NODES, false);
    this.registerBulk(OUTPUT_NODES, false);
  }

  // ===== 注册操作 =====

  /**
   * 注册单个节点
   * @param definition 节点定义
   * @param executorFactory 执行器工厂函数
   * @param isCustom 是否为自定义节点
   * @param metadata 节点元数据
   */
  register(
    definition: INode,
    executorFactory: () => INodeExecutor,
    isCustom: boolean = true,
    metadata?: NodeRegistryItem['metadata']
  ): void {
    if (this.registry.has(definition.id)) {
      throw new Error(`Node with id '${definition.id}' is already registered`);
    }

    const item: NodeRegistryItem = {
      definition,
      executorFactory,
      registeredAt: new Date(),
      isCustom,
      metadata,
    };

    this.registry.set(definition.id, item);

    // 更新分类索引
    if (!this.categoryIndex.has(definition.category)) {
      this.categoryIndex.set(definition.category, new Set());
    }
    this.categoryIndex.get(definition.category)!.add(definition.id);

    // 标记自定义节点
    if (isCustom) {
      this.customNodes.add(definition.id);
    }
  }

  /**
   * 批量注册节点
   * @param definitions 节点定义列表
   * @param isCustom 是否为自定义节点
   */
  private registerBulk(definitions: INode[], isCustom: boolean): void {
    for (const definition of definitions) {
      // 内置节点的执行器通过动态导入延迟加载
      const executorFactory = () => this.createBuiltinExecutor(definition.id);
      this.registry.set(definition.id, {
        definition,
        executorFactory,
        registeredAt: new Date(),
        isCustom,
        metadata: { version: '1.0.0', author: 'AgentGraph' },
      });

      // 更新分类索引
      if (!this.categoryIndex.has(definition.category)) {
        this.categoryIndex.set(definition.category, new Set());
      }
      this.categoryIndex.get(definition.category)!.add(definition.id);
    }
  }

  /**
   * 注销节点
   * @param nodeId 节点ID
   * @returns 是否成功注销
   */
  unregister(nodeId: string): boolean {
    const item = this.registry.get(nodeId);
    if (!item) {
      return false;
    }

    // 内置节点不允许注销
    if (!item.isCustom) {
      throw new Error(`Cannot unregister builtin node '${nodeId}'`);
    }

    this.registry.delete(nodeId);
    this.customNodes.delete(nodeId);

    // 更新分类索引
    const category = item.definition.category;
    const categorySet = this.categoryIndex.get(category);
    if (categorySet) {
      categorySet.delete(nodeId);
      if (categorySet.size === 0) {
        this.categoryIndex.delete(category);
      }
    }

    return true;
  }

  // ===== 查找操作 =====

  /**
   * 按 ID 获取节点
   * @param nodeId 节点ID
   * @returns 节点注册表项或 undefined
   */
  get(nodeId: string): NodeRegistryItem | undefined {
    return this.registry.get(nodeId);
  }

  /**
   * 检查节点是否存在
   * @param nodeId 节点ID
   * @returns 是否存在
   */
  has(nodeId: string): boolean {
    return this.registry.has(nodeId);
  }

  /**
   * 按分类获取节点
   * @param category 节点分类
   * @returns 节点注册表项列表
   */
  getByCategory(category: NodeCategory): NodeRegistryItem[] {
    const nodeIds = this.categoryIndex.get(category);
    if (!nodeIds) {
      return [];
    }

    const items: NodeRegistryItem[] = [];
    for (const nodeId of nodeIds) {
      const item = this.registry.get(nodeId);
      if (item) {
        items.push(item);
      }
    }
    return items;
  }

  /**
   * 获取所有节点
   * @returns 所有节点注册表项
   */
  getAll(): NodeRegistryItem[] {
    return Array.from(this.registry.values());
  }

  /**
   * 获取所有自定义节点
   * @returns 自定义节点注册表项列表
   */
  getCustomNodes(): NodeRegistryItem[] {
    const items: NodeRegistryItem[] = [];
    for (const nodeId of this.customNodes) {
      const item = this.registry.get(nodeId);
      if (item) {
        items.push(item);
      }
    }
    return items;
  }

  /**
   * 按标签搜索节点
   * @param tags 标签列表
   * @returns 匹配的节点注册表项列表
   */
  searchByTags(tags: string[]): NodeRegistryItem[] {
    return this.getAll().filter(item => {
      if (!item.metadata?.tags) {
        return false;
      }
      return tags.some(tag => item.metadata!.tags!.includes(tag));
    });
  }

  /**
   * 按名称搜索节点
   * @param keyword 搜索关键词
   * @param searchInDescription 是否在描述中搜索
   * @returns 匹配的节点注册表项列表
   */
  searchByName(keyword: string, searchInDescription: boolean = true): NodeRegistryItem[] {
    const lowerKeyword = keyword.toLowerCase();

    return this.getAll().filter(item => {
      const nameMatches =
        item.definition.name.en.toLowerCase().includes(lowerKeyword) ||
        item.definition.name.zh.toLowerCase().includes(lowerKeyword);

      if (searchInDescription) {
        const descMatches =
          item.definition.description.en.toLowerCase().includes(lowerKeyword) ||
          item.definition.description.zh.toLowerCase().includes(lowerKeyword);
        return nameMatches || descMatches;
      }

      return nameMatches;
    });
  }

  // ===== 创建执行器 =====

  /**
   * 创建节点执行器实例
   * @param nodeId 节点ID
   * @returns 节点执行器实例
   * @throws 节点不存在时抛出错误
   */
  createExecutor(nodeId: string): INodeExecutor {
    const item = this.get(nodeId);
    if (!item) {
      throw new Error(`Node '${nodeId}' not found in registry`);
    }

    return item.executorFactory();
  }

  /**
   * 创建内置节点执行器
   * @param nodeId 节点ID
   * @returns 节点执行器实例
   */
  private createBuiltinExecutor(nodeId: string): INodeExecutor {
    // 根据节点ID动态导入对应的执行器
    const executorMap: Record<string, () => INodeExecutor> = {
      // 输入类节点
      receive: () => this.createDynamicExecutor('input/receive-executor', 'ReceiveExecutor'),
      understand: () => this.createDynamicExecutor('input/understand-executor', 'UnderstandExecutor'),
      clarify: () => this.createDynamicExecutor('input/clarify-executor', 'ClarifyExecutor'),

      // 规划类节点
      analyze: () => this.createDynamicExecutor('planning/analyze-executor', 'AnalyzeExecutor'),
      design: () => this.createDynamicExecutor('planning/design-executor', 'DesignExecutor'),
      decompose: () => this.createDynamicExecutor('planning/decompose-executor', 'DecomposeExecutor'),
      spec: () => this.createDynamicExecutor('planning/spec-executor', 'SpecExecutor'),

      // 执行类节点
      code: () => this.createDynamicExecutor('execution/code-executor', 'CodeExecutor'),
      test: () => this.createDynamicExecutor('execution/test-executor', 'TestExecutor'),
      generate: () => this.createDynamicExecutor('execution/generate-executor', 'GenerateExecutor'),
      transform: () => this.createDynamicExecutor('execution/transform-executor', 'TransformExecutor'),

      // 审核类节点
      review: () => this.createDynamicExecutor('review/review-executor', 'ReviewExecutor'),
      validate: () => this.createDynamicExecutor('review/validate-executor', 'ValidateExecutor'),
      security: () => this.createDynamicExecutor('review/security-executor', 'SecurityExecutor'),

      // 决策类节点
      branch: () => this.createDynamicExecutor('decision/branch-executor', 'BranchExecutor'),
      merge: () => this.createDynamicExecutor('decision/merge-executor', 'MergeExecutor'),
      loop: () => this.createDynamicExecutor('decision/loop-executor', 'LoopExecutor'),

      // 协调类节点
      parallel: () => this.createDynamicExecutor('coordinate/parallel-executor', 'ParallelExecutor'),
      sequence: () => this.createDynamicExecutor('coordinate/sequence-executor', 'SequenceExecutor'),
      assign: () => this.createDynamicExecutor('coordinate/assign-executor', 'AssignExecutor'),
      aggregate: () => this.createDynamicExecutor('coordinate/aggregate-executor', 'AggregateExecutor'),
      barrier: () => this.createDynamicExecutor('coordinate/barrier-executor', 'BarrierExecutor'),
      negotiate: () => this.createDynamicExecutor('coordinate/negotiate-executor', 'NegotiateExecutor'),

      // 输出类节点
      report: () => this.createDynamicExecutor('output/report-executor', 'ReportExecutor'),
      store: () => this.createDynamicExecutor('output/store-executor', 'StoreExecutor'),
      notify: () => this.createDynamicExecutor('output/notify-executor', 'NotifyExecutor'),
    };

    const factory = executorMap[nodeId];
    if (!factory) {
      throw new Error(`No executor factory for builtin node '${nodeId}'`);
    }

    return factory();
  }

  /**
   * 动态创建执行器（延迟加载）
   * @param path 执行器路径
   * @param className 类名
   * @returns 执行器实例
   */
  private createDynamicExecutor(path: string, className: string): INodeExecutor {
    // 这里使用简单的延迟加载实现
    // 在实际项目中，可能需要使用动态导入
    try {
      const module = require(`./${path}`);
      const ExecutorClass = module[className];
      return new ExecutorClass();
    } catch (error) {
      throw new Error(`Failed to load executor '${className}' from '${path}': ${error}`);
    }
  }

  // ===== 统计信息 =====

  /**
   * 获取注册统计信息
   * @returns 统计信息
   */
  getStats(): {
    total: number;
    builtin: number;
    custom: number;
    byCategory: Record<NodeCategory, number>;
  } {
    const stats = {
      total: this.registry.size,
      builtin: 0,
      custom: 0,
      byCategory: {} as Record<NodeCategory, number>,
    };

    for (const [category, nodeIds] of this.categoryIndex) {
      stats.byCategory[category] = nodeIds.size;
    }

    for (const [nodeId, item] of this.registry) {
      if (item.isCustom) {
        stats.custom++;
      } else {
        stats.builtin++;
      }
    }

    return stats;
  }

  /**
   * 获取分类列表
   * @returns 所有节点分类
   */
  getCategories(): NodeCategory[] {
    return Array.from(this.categoryIndex.keys());
  }

  /**
   * 获取分类下的节点数量
   * @param category 节点分类
   * @returns 节点数量
   */
  getCountByCategory(category: NodeCategory): number {
    return this.categoryIndex.get(category)?.size || 0;
  }

  // ===== 清理操作 =====

  /**
   * 清空所有自定义节点
   */
  clearCustomNodes(): void {
    for (const nodeId of this.customNodes) {
      this.unregister(nodeId);
    }
  }

  /**
   * 重置注册表（仅保留内置节点）
   */
  reset(): void {
    this.clearCustomNodes();
    // 重新初始化内置节点
    this.registry.clear();
    this.categoryIndex.clear();
    this.initializeBuiltinNodes();
  }
}

// ===== 全局注册表实例 =====

/**
 * 全局节点注册表单例
 */
let globalRegistry: NodeRegistry | null = null;

/**
 * 获取全局节点注册表实例
 * @returns 节点注册表实例
 */
export function getNodeRegistry(): NodeRegistry {
  if (!globalRegistry) {
    globalRegistry = new NodeRegistry();
  }
  return globalRegistry;
}

/**
 * 重置全局节点注册表（用于测试）
 */
export function resetNodeRegistry(): void {
  globalRegistry = null;
}

/**
 * 创建新的节点注册表实例
 * @returns 节点注册表实例
 */
export function createNodeRegistry(): NodeRegistry {
  return new NodeRegistry();
}
