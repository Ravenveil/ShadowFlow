/**
 * 节点执行器注册中心
 * 管理所有节点执行器的注册、查找和实例化
 */

import type { INode, NodeCategory, NodeTypeId } from '../types/node.types';
import type { NodeContext, NodeResult } from '../types/node.types';

// 基础类型
import type { BaseNodeExecutor } from './base-node-executor';

// 各分类执行器
import { ReceiveExecutor } from './input/receive-executor';
import { UnderstandExecutor } from './input/understand-executor';
import { ClarifyExecutor } from './input/clarify-executor';

import { AnalyzeExecutor } from './planning/analyze-executor';
import { DesignExecutor } from './planning/design-executor';
import { DecomposeExecutor } from './planning/decompose-executor';
import { SpecExecutor } from './planning/spec-executor';

import { CodeExecutor } from './execution/code-executor';
import { TestExecutor } from './execution/test-executor';
import { GenerateExecutor } from './execution/generate-executor';
import { TransformExecutor } from './execution/transform-executor';

import { ReviewExecutor } from './review/review-executor';
import { ValidateExecutor } from './review/validate-executor';
import { SecurityExecutor } from './review/security-executor';

import { BranchExecutor } from './decision/branch-executor';
import { MergeExecutor } from './decision/merge-executor';
import { LoopExecutor } from './decision/loop-executor';

import { ParallelExecutor } from './coordinate/parallel-executor';
import { SequenceExecutor } from './coordinate/sequence-executor';
import { AssignExecutor } from './coordinate/assign-executor';
import { AggregateExecutor } from './coordinate/aggregate-executor';
import { BarrierExecutor } from './coordinate/barrier-executor';
import { NegotiateExecutor } from './coordinate/negotiate-executor';

import { ReportExecutor } from './output/report-executor';
import { StoreExecutor } from './output/store-executor';
import { NotifyExecutor } from './output/notify-executor';

// 节点定义
import { ALL_NODES } from './node-definitions';

// ==================== 执行器工厂 ====================

/**
 * 执行器构造函数类型
 */
type ExecutorConstructor = new (node: INode) => BaseNodeExecutor;

/**
 * 执行器注册表
 */
interface ExecutorRegistration {
  executor: ExecutorConstructor;
  definition: INode;
}

// ==================== 节点执行器注册中心 ====================

/**
 * 节点执行器注册中心
 *
 * 功能：
 * 1. 注册节点执行器（关联节点定义和执行器类）
 * 2. 创建执行器实例
 * 3. 按分类查找执行器
 * 4. 按ID查找执行器
 * 5. 搜索执行器
 */
export class NodeExecutorRegistry {
  /** 执行器注册表 */
  private registry: Map<string, ExecutorRegistration> = new Map();

  /** 分类索引 */
  private categoryIndex: Map<NodeCategory, Set<string>> = new Map();

  /** 执行器类映射 */
  private executorClasses: Map<string, ExecutorConstructor> = new Map();

  constructor() {
    this.initializeCategories();
    this.registerDefaultExecutors();
  }

  // ==================== 初始化 ====================

  /**
   * 初始化分类索引
   */
  private initializeCategories(): void {
    const categories: NodeCategory[] = [
      'input',
      'planning',
      'execution',
      'review',
      'decision',
      'coordinate',
      'output'
    ];
    for (const category of categories) {
      this.categoryIndex.set(category, new Set());
    }
  }

  /**
   * 注册默认执行器
   */
  private registerDefaultExecutors(): void {
    // 注册输入类执行器
    this.registerExecutor('receive', ReceiveExecutor);
    this.registerExecutor('understand', UnderstandExecutor);
    this.registerExecutor('clarify', ClarifyExecutor);

    // 注册规划类执行器
    this.registerExecutor('analyze', AnalyzeExecutor);
    this.registerExecutor('design', DesignExecutor);
    this.registerExecutor('decompose', DecomposeExecutor);
    this.registerExecutor('spec', SpecExecutor);

    // 注册执行类执行器
    this.registerExecutor('code', CodeExecutor);
    this.registerExecutor('test', TestExecutor);
    this.registerExecutor('generate', GenerateExecutor);
    this.registerExecutor('transform', TransformExecutor);

    // 注册审核类执行器
    this.registerExecutor('review', ReviewExecutor);
    this.registerExecutor('validate', ValidateExecutor);
    this.registerExecutor('security', SecurityExecutor);

    // 注册决策类执行器
    this.registerExecutor('branch', BranchExecutor);
    this.registerExecutor('merge', MergeExecutor);
    this.registerExecutor('loop', LoopExecutor);

    // 注册协调类执行器
    this.registerExecutor('parallel', ParallelExecutor);
    this.registerExecutor('sequence', SequenceExecutor);
    this.registerExecutor('assign', AssignExecutor);
    this.registerExecutor('aggregate', AggregateExecutor);
    this.registerExecutor('barrier', BarrierExecutor);
    this.registerExecutor('negotiate', NegotiateExecutor);

    // 注册输出类执行器
    this.registerExecutor('report', ReportExecutor);
    this.registerExecutor('store', StoreExecutor);
    this.registerExecutor('notify', NotifyExecutor);
  }

  // ==================== 注册方法 ====================

  /**
   * 注册节点执行器
   *
   * @param nodeId 节点ID
   * @param ExecutorClass 执行器类
   */
  registerExecutor(nodeId: string, ExecutorClass: ExecutorConstructor): void {
    const definition = ALL_NODES.find(n => n.id === nodeId);
    if (!definition) {
      throw new Error(`Node definition not found for ID: ${nodeId}`);
    }

    if (this.registry.has(nodeId)) {
      throw new Error(`Executor already registered for node: ${nodeId}`);
    }

    this.registry.set(nodeId, { executor: ExecutorClass, definition });
    this.categoryIndex.get(definition.category)?.add(nodeId);
    this.executorClasses.set(nodeId, ExecutorClass);
  }

  /**
   * 批量注册执行器
   */
  registerAllExecutors(registrations: Map<string, ExecutorConstructor>): void {
    for (const [nodeId, ExecutorClass] of registrations.entries()) {
      this.registerExecutor(nodeId, ExecutorClass);
    }
  }

  // ==================== 创建方法 ====================

  /**
   * 创建节点执行器实例
   *
   * @param nodeId 节点ID
   * @returns 执行器实例
   */
  createExecutor(nodeId: string): BaseNodeExecutor {
    const registration = this.registry.get(nodeId);
    if (!registration) {
      throw new Error(`Executor not registered for node: ${nodeId}`);
    }

    const ExecutorClass = registration.executor;
    return new ExecutorClass(registration.definition);
  }

  /**
   * 创建多个执行器实例
   *
   * @param nodeIds 节点ID数组
   * @returns 执行器实例映射
   */
  createExecutors(nodeIds: string[]): Map<string, BaseNodeExecutor> {
    const executors = new Map<string, BaseNodeExecutor>();
    for (const nodeId of nodeIds) {
      try {
        executors.set(nodeId, this.createExecutor(nodeId));
      } catch (error) {
        console.error(`Failed to create executor for node ${nodeId}:`, error);
      }
    }
    return executors;
  }

  // ==================== 查询方法 ====================

  /**
   * 获取节点定义
   *
   * @param nodeId 节点ID
   * @returns 节点定义
   */
  getDefinition(nodeId: string): INode | undefined {
    return this.registry.get(nodeId)?.definition;
  }

  /**
   * 获取执行器类
   *
   * @param nodeId 节点ID
   * @returns 执行器类
   */
  getExecutorClass(nodeId: string): ExecutorConstructor | undefined {
    return this.executorClasses.get(nodeId);
  }

  /**
   * 按分类获取节点定义
   *
   * @param category 节点分类
   * @returns 节点定义数组
   */
  getDefinitionsByCategory(category: NodeCategory): INode[] {
    const nodeIds = this.categoryIndex.get(category);
    if (!nodeIds) return [];

    const definitions: INode[] = [];
    for (const nodeId of nodeIds) {
      const definition = this.getDefinition(nodeId);
      if (definition) {
        definitions.push(definition);
      }
    }
    return definitions;
  }

  /**
   * 获取所有节点定义
   *
   * @returns 所有节点定义
   */
  getAllDefinitions(): INode[] {
    return Array.from(this.registry.values()).map(r => r.definition);
  }

  /**
   * 检查节点是否已注册
   *
   * @param nodeId 节点ID
   * @returns 是否已注册
   */
  has(nodeId: string): boolean {
    return this.registry.has(nodeId);
  }

  /**
   * 获取已注册的节点ID列表
   *
   * @returns 节点ID数组
   */
  getRegisteredNodeIds(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * 搜索节点
   *
   * @param query 搜索关键词
   * @returns 匹配的节点定义
   */
  search(query: string): INode[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllDefinitions().filter(node =>
      node.name.en.toLowerCase().includes(lowerQuery) ||
      node.name.zh.toLowerCase().includes(lowerQuery) ||
      node.description.en.toLowerCase().includes(lowerQuery) ||
      node.description.zh.toLowerCase().includes(lowerQuery) ||
      node.id.toLowerCase().includes(lowerQuery)
    );
  }

  // ==================== 执行方法 ====================

  /**
   * 执行节点
   *
   * @param nodeId 节点ID
   * @param context 执行上下文
   * @returns 执行结果
   */
  async execute(nodeId: string, context: NodeContext): Promise<NodeResult> {
    const executor = this.createExecutor(nodeId);
    return executor.execute(context);
  }

  /**
   * 批量执行节点
   *
   * @param executions 执行任务数组
   * @returns 执行结果数组
   */
  async executeBatch(executions: Array<{ nodeId: string; context: NodeContext }>): Promise<Map<string, NodeResult>> {
    const results = new Map<string, NodeResult>();

    // 按依赖关系排序可以在这里实现
    for (const { nodeId, context } of executions) {
      try {
        const result = await this.execute(nodeId, context);
        results.set(nodeId, result);
      } catch (error) {
        results.set(nodeId, {
          success: false,
          outputs: {},
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: { duration: 0 }
        });
      }
    }

    return results;
  }

  // ==================== 统计方法 ====================

  /**
   * 获取分类统计
   *
   * @returns 分类统计映射
   */
  getCategoryStats(): Map<NodeCategory, number> {
    const stats = new Map<NodeCategory, number>();
    for (const [category, nodeIds] of this.categoryIndex.entries()) {
      stats.set(category, nodeIds.size);
    }
    return stats;
  }

  /**
   * 获取注册表摘要
   *
   * @returns 注册表摘要
   */
  getSummary(): {
    totalNodes: number;
    nodesByCategory: Record<string, number>;
    registeredExecutorClasses: number;
  } {
    const nodesByCategory: Record<string, number> = {};
    const categoryStats = this.getCategoryStats();

    for (const [category, count] of categoryStats.entries()) {
      nodesByCategory[category] = count;
    }

    return {
      totalNodes: this.registry.size,
      nodesByCategory,
      registeredExecutorClasses: this.executorClasses.size
    };
  }

  // ==================== 管理方法 ====================

  /**
   * 移除节点注册
   *
   * @param nodeId 节点ID
   * @returns 是否成功移除
   */
  unregister(nodeId: string): boolean {
    const registration = this.registry.get(nodeId);
    if (!registration) return false;

    this.registry.delete(nodeId);
    this.categoryIndex.get(registration.definition.category)?.delete(nodeId);
    this.executorClasses.delete(nodeId);

    return true;
  }

  /**
   * 清空所有注册
   */
  clear(): void {
    this.registry.clear();
    this.executorClasses.clear();
    for (const set of this.categoryIndex.values()) {
      set.clear();
    }
  }
}

// ==================== 全局注册中心实例 ====================

/**
 * 全局节点执行器注册中心实例
 */
export const globalNodeExecutorRegistry = new NodeExecutorRegistry();

// ==================== 便捷函数 ====================

/**
 * 注册自定义节点执行器
 *
 * @param nodeId 节点ID
 * @param ExecutorClass 执行器类
 */
export function registerCustomExecutor(nodeId: string, ExecutorClass: ExecutorConstructor): void {
  globalNodeExecutorRegistry.registerExecutor(nodeId, ExecutorClass);
}

/**
 * 创建并执行节点
 *
 * @param nodeId 节点ID
 * @param context 执行上下文
 * @returns 执行结果
 */
export async function createAndExecute(nodeId: string, context: NodeContext): Promise<NodeResult> {
  return globalNodeExecutorRegistry.execute(nodeId, context);
}
