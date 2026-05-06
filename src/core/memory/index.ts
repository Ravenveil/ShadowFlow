/**
 * 河流式记忆系统 - 统一入口
 *
 * 整合 River、Sediment、Dam、Purifier 四层架构
 * 提供统一的记忆系统访问接口
 */

// ==================== 导出所有模块 ====================

// 主干河流
export {
  River,
  type IScoopFilter,
  type IRiverConfig,
  type RiverEventType,
  type RiverEventData,
  DEFAULT_RIVER_CONFIG,
} from './river';

// 水闸检查点
export {
  DamManager,
  DamConfig,
  ExecutionPosition,
  CheckpointMetadata,
  createDamManager,
  createInitialSnapshot
} from './dam';

// 沉淀层
export {
  SedimentManager,
  SedimentConfig,
  IPattern,
  PatternType,
  createSedimentManager
} from './sediment';

// 自净化层
export {
  Purifier,
  PurifierConfig,
  PurificationResult,
  ConflictInfo,
  MergeResult,
  createPurifier
} from './purifier';

// 河网同步系统
export {
  BranchImpl,
} from './branch';

export {
  SyncPointImpl,
} from './sync-point';

export {
  RiverNetwork,
  createRiverNetwork,
} from './river-network';

export {
  MainFlowImpl,
  createMainFlow,
} from './main-flow';

export {
  MessageBus,
  createMessageBus,
} from './message-bus';

export {
  ConflictDetector,
  createConflictDetector,
} from './conflict-detector';

// 导出类型
export * from '../types/memory';

// ==================== 统一记忆系统 ====================

import { River, IRiverMemoryAccess, IScoopFilter } from './river';
import { SedimentManager, createSedimentManager, IPattern } from './sediment';
import { DamManager, createDamManager, ICheckpoint, CheckpointTrigger } from './dam';
import { Purifier, createPurifier } from './purifier';
import {
  IMemoryChunk,
  MemoryType,
  IMemorySnapshot,
} from '../types/memory';
import { EventEmitter } from 'events';

// ==================== 配置接口 ====================

/**
 * 记忆系统配置
 */
export interface IMemorySystemConfig {
  /** 记忆存储路径 */
  storagePath?: string;

  /** 河流配置 */
  river?: {
    maxPoolSize?: number;
    enableEvents?: boolean;
  };

  /** 沉淀层配置 */
  sediment?: {
    memoryPath?: string;
    topicDir?: string;
    maxEntryLines?: number;
    settleThreshold?: number;
  };

  /** 水闸配置 */
  dam?: {
    maxCheckpoints?: number;
    defaultTTL?: number;
    persistPath?: string;
  };

  /** 净化器配置 */
  purifier?: {
    similarityThreshold?: number;
    decayFactor?: number;
    removalThreshold?: number;
  };
}

// ==================== 统一记忆系统类 ====================

/**
 * 河流式记忆系统
 *
 * 整合四层架构：
 * - Layer 1: 源头（分级记忆）
 * - Layer 2: 主流（River）
 * - Layer 3: 沉淀层（Sediment）
 * - Layer 4: 水闸（Dam）
 * - 自净化层（Purifier）
 */
export class RiverMemorySystem extends EventEmitter {
  private river: River;
  private sediment: SedimentManager;
  private damManager: DamManager;
  private purifier: Purifier;
  private config: IMemorySystemConfig;

  constructor(config: IMemorySystemConfig = {}) {
    super();
    this.config = config;

    // 初始化各层
    this.river = new River({
      maxPoolSize: config.river?.maxPoolSize,
    });

    this.sediment = createSedimentManager({
      memoryPath: config.sediment?.memoryPath || './.workflow/memory',
      topicDir: config.sediment?.topicDir || 'topics',
      maxEntryLines: config.sediment?.maxEntryLines || 200,
      settleThreshold: config.sediment?.settleThreshold || 0.5,
    });

    this.damManager = createDamManager({
      maxCheckpoints: config.dam?.maxCheckpoints || 100,
      defaultTTL: config.dam?.defaultTTL || 24 * 60 * 60 * 1000,
      persistPath: config.dam?.persistPath,
    });

    this.purifier = createPurifier({
      similarityThreshold: config.purifier?.similarityThreshold || 0.9,
      decayFactor: config.purifier?.decayFactor || 0.99,
      removalThreshold: config.purifier?.removalThreshold || 0.1,
    });

    // 事件转发
    this.setupEventForwarding();
  }

  // ==================== 节点访问接口 ====================

  /**
   * 获取节点记忆访问接口
   * 这是节点执行时使用的入口
   */
  getNodeAccess(nodeId: string): IRiverMemoryAccess {
    const self = this;

    return {
      // ===== 取水（读取）=====
      drink: (type?: MemoryType) => {
        return self.river.drink(type);
      },

      scoop: (filter: IScoopFilter) => {
        return self.river.scoop(filter);
      },

      dredge: (filter?: any) => {
        return self.sediment.dredge(filter);
      },

      // ===== 注水（写入）=====
      pour: (chunk: IMemoryChunk) => {
        chunk.sourceNode = chunk.sourceNode || nodeId;
        self.river.pour(chunk);
        self.emit('memory:pour', { nodeId, chunk });

        // 检查是否需要沉淀
        self.checkAndSettle(chunk);
      },

      settle: (pattern: IPattern) => {
        pattern.associatedNodes = pattern.associatedNodes || [];
        if (!pattern.associatedNodes.includes(nodeId)) {
          pattern.associatedNodes.push(nodeId);
        }
        self.sediment.settle(pattern);
        self.emit('memory:settle', { nodeId, pattern });
      },

      // ===== 水闸操作 =====
      buildDam: () => {
        const snapshot = self.river.createSnapshot();
        const checkpoint = self.damManager.buildDam(
          snapshot,
          { completedNode: nodeId, nextNodes: [], pendingEdges: [] },
          'node_complete'
        );
        self.emit('dam:build', { nodeId, checkpoint });
        return checkpoint.id;
      },

      openDam: (checkpointId: string) => {
        const checkpoint = self.damManager.openDam(checkpointId);
        if (checkpoint) {
          self.river.restoreSnapshot(checkpoint.snapshot);
          self.emit('dam:open', { nodeId, checkpoint });
        }
      },

      listDams: () => {
        return self.damManager.listDams();
      },
    };
  }

  // ==================== 系统级操作 ====================

  /**
   * 执行完整净化流程
   */
  async purify(): Promise<void> {
    const allChunks = this.getAllChunks();
    const result = this.purifier.purify(allChunks);

    // 应用净化结果
    if (result.merged.size > 0 || result.removed.length > 0) {
      this.applyPurificationResult(result);
      this.emit('system:purify', result);
    }
  }

  /**
   * 创建检查点（系统级）
   */
  createCheckpoint(
    trigger: CheckpointTrigger,
    position?: { completedNode: string; nextNodes: string[]; pendingEdges: string[] }
  ): ICheckpoint {
    const snapshot = this.river.createSnapshot();
    return this.damManager.buildDam(
      snapshot,
      position || { completedNode: '', nextNodes: [], pendingEdges: [] },
      trigger
    );
  }

  /**
   * 恢复到检查点
   */
  restoreCheckpoint(checkpointId: string): boolean {
    const checkpoint = this.damManager.openDam(checkpointId);
    if (checkpoint) {
      this.river.restoreSnapshot(checkpoint.snapshot);
      this.emit('system:restore', { checkpoint });
      return true;
    }
    return false;
  }

  /**
   * 获取当前快照
   */
  getSnapshot(): IMemorySnapshot {
    return this.river.createSnapshot();
  }

  // ==================== 私有方法 ====================

  private setupEventForwarding(): void {
    this.river.on('memory:change', (data: any) => this.emit('memory:change', data));
    this.river.on('memory:pour', (data: any) => this.emit('river:flow', data));
  }

  private checkAndSettle(chunk: IMemoryChunk): void {
    // 检查是否满足沉淀条件
    const shouldSettle = this.sediment.evaluateSettle({
      type: 'success_pattern',
      content: chunk.content,
      importance: chunk.metadata.importance,
      sourceNode: chunk.sourceNode,
    });

    if (shouldSettle) {
      // 自动沉淀
      this.sediment.settle({
        type: 'success_pattern',
        content: chunk.content,
        importance: chunk.metadata.importance,
        reason: '自动沉淀：满足重要性阈值',
        associatedNodes: [chunk.sourceNode!],
      });
    }
  }

  private getAllChunks(): IMemoryChunk[] {
    const snapshot = this.river.createSnapshot();
    return [
      ...snapshot.memoryPool.context,
      ...snapshot.memoryPool.execution,
      ...snapshot.memoryPool.working,
      ...snapshot.memoryPool.knowledge,
    ];
  }

  private applyPurificationResult(result: any): void {
    // 移除已标记删除的记忆
    for (const removedId of result.removed) {
      // River 需要实现 removeChunk 方法
    }
  }
}

// ==================== 全局实例 ====================

let globalInstance: RiverMemorySystem | null = null;

/**
 * 获取全局记忆系统实例
 */
export function getMemorySystem(config?: IMemorySystemConfig): RiverMemorySystem {
  if (!globalInstance) {
    globalInstance = new RiverMemorySystem(config);
  }
  return globalInstance;
}

/**
 * 重置全局实例（测试用）
 */
export function resetMemorySystem(): void {
  globalInstance = null;
}

/**
 * 创建新的记忆系统实例
 */
export function createMemorySystem(config?: IMemorySystemConfig): RiverMemorySystem {
  return new RiverMemorySystem(config);
}
