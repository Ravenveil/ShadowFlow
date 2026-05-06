/**
 * 河流式记忆系统 - 主干河流
 *
 * 核心功能：
 * - drink(): 从主流取水（读取记忆）
 * - scoop(): 用过滤网取水（条件查询）
 * - pour(): 向主流注水（写入记忆）
 * - 记忆池管理：context、execution、working、knowledge
 * - 事件发射：记忆变化时发出事件
 *
 * 参考：docs/River-Memory-Design.md
 */

import { EventEmitter } from 'events';
import {
  MemoryType,
  IMemoryChunk,
  ICheckpoint,
  CheckpointTrigger,
  IMemorySnapshot,
  defaultReducers,
  IMemoryChange,
} from '../types/memory';

// ==================== 河流访问接口 ====================

/**
 * 过滤器接口 - 用于 scoop 操作
 */
export interface IScoopFilter {
  /** 记忆类型 */
  type?: MemoryType;
  /** 来源节点 */
  sourceNode?: string;
  /** 时间范围 */
  timeRange?: { from: Date; to: Date };
  /** 最小重要性 */
  minImportance?: number;
  /** 内容匹配（简单字符串包含） */
  contentPattern?: string;
  /** ID 列表 */
  ids?: string[];
}

/**
 * 模式接口 - 用于沉淀层
 */
export interface IPattern {
  /** 模式类型 */
  type: string;
  /** 模式内容 */
  content: any;
  /** 学习原因 */
  reason: string;
  /** 出现次数 */
  occurrences: number;
  /** 首次发现时间 */
  firstSeen: Date;
  /** 最后更新时间 */
  lastUpdated: Date;
  /** 重要性评分 */
  importance: number;
}

/**
 * 节点结果接口
 */
export interface INodeResult {
  /** 成功标志 */
  success: boolean;
  /** 输出数据 */
  outputs: Record<string, any>;
  /** 错误信息 */
  error?: Error;
  /** 执行指标 */
  metrics?: {
    executionTime: number;
    tokensUsed?: number;
  };
}

/**
 * 日志接口
 */
export interface ILogger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
}

// ==================== 河流事件 ====================

/**
 * 河流事件类型
 */
export type RiverEventType =
  | 'memory:added'      // 记忆添加
  | 'memory:updated'    // 记忆更新
  | 'memory:deleted'     // 记忆删除
  | 'memory:poolChanged' // 记忆池变化
  | 'checkpoint:created' // 检查点创建
  | 'checkpoint:restored' // 检查点恢复
  | 'pattern:settled'    // 模式沉淀
  | 'river:flushed';     // 河流清空

/**
 * 河流事件数据
 */
export interface RiverEventData {
  eventType: RiverEventType;
  memoryType?: MemoryType;
  chunks?: IMemoryChunk[];
  checkpoint?: ICheckpoint;
  pattern?: IPattern;
  timestamp: Date;
}

// ==================== 河流配置 ====================

/**
 * 河流配置
 */
export interface IRiverConfig {
  /** 最大池大小（每个池） */
  maxPoolSize?: number;
  /** 自动衰减间隔（毫秒） */
  decayInterval?: number;
  /** 衰减率 */
  decayRate?: number;
  /** 是否启用自动衰减 */
  enableDecay?: boolean;
  /** 是否启用事件发射 */
  enableEvents?: boolean;
}

/**
 * 默认河流配置
 */
export const DEFAULT_RIVER_CONFIG: Required<IRiverConfig> = {
  maxPoolSize: 10000,
  decayInterval: 60000, // 1分钟
  decayRate: 0.01,
  enableDecay: false,
  enableEvents: true,
};

// ==================== 主干河流类 ====================

/**
 * 主干河流 - 河流式记忆系统的核心
 *
 * 提供自由存取的记忆流，节点可以随时取水（读）或注水（写）
 */
export class River extends EventEmitter {
  // ========== 内部状态 ==========

  /** 河流配置 */
  protected config: Required<IRiverConfig>;

  /** 日志记录器 */
  protected logger: ILogger;

  /** 四个记忆池 */
  protected pools: Map<MemoryType, IMemoryChunk[]> = new Map();

  /** 沉淀层 - 学习到的模式 */
  protected sediment: Map<string, IPattern> = new Map();

  /** 检查点历史 */
  protected checkpoints: Map<string, ICheckpoint> = new Map();

  /** 当前检查点 ID */
  protected currentCheckpointId: string | null = null;

  /** 执行路径 */
  protected executionPath: string[] = [];

  /** 节点结果映射 */
  protected nodeResults: Map<string, INodeResult> = new Map();

  /** 全局变量 */
  protected variables: Record<string, any> = {};

  /** 衰减定时器 */
  protected decayTimer: NodeJS.Timeout | null = null;

  /** 河流创建时间 */
  protected readonly createdAt: Date;

  // ========== 构造函数 ==========

  /**
   * 创建一条新的河流
   */
  constructor(config?: Partial<IRiverConfig>, logger?: ILogger) {
    super();
    this.config = { ...DEFAULT_RIVER_CONFIG, ...config };
    this.logger = logger || this.createDefaultLogger();
    this.createdAt = new Date();

    // 初始化记忆池
    this.initializePools();

    // 启动自动衰减
    if (this.config.enableDecay) {
      this.startDecay();
    }

    this.logger.info('River created', { config: this.config });
  }

  // ========== 初始化 ==========

  /**
   * 初始化记忆池
   */
  private initializePools(): void {
    const types: MemoryType[] = ['context', 'execution', 'working', 'knowledge'];
    for (const type of types) {
      this.pools.set(type, []);
    }
  }

  /**
   * 创建默认日志记录器
   */
  private createDefaultLogger(): ILogger {
    return {
      debug: (message: string, data?: any) => console.debug(`[River] ${message}`, data),
      info: (message: string, data?: any) => console.info(`[River] ${message}`, data),
      warn: (message: string, data?: any) => console.warn(`[River] ${message}`, data),
      error: (message: string, data?: any) => console.error(`[River] ${message}`, data),
    };
  }

  // ========== 取水操作（读取）==========

  /**
   * 从主流取水 - 自由读取记忆
   *
   * @param type - 记忆类型，不指定则返回所有类型
   * @returns 记忆块数组
   */
  drink(type?: MemoryType): IMemoryChunk[] {
    if (type) {
      const pool = this.pools.get(type);
      return pool ? [...pool] : [];
    }

    // 返回所有池中的记忆（合并）
    const allChunks: IMemoryChunk[] = [];
    for (const pool of this.pools.values()) {
      allChunks.push(...pool);
    }
    return allChunks;
  }

  /**
   * 用过滤网取水 - 条件查询记忆
   *
   * @param filter - 过滤条件
   * @returns 匹配的记忆块数组
   */
  scoop(filter: IScoopFilter): IMemoryChunk[] {
    let chunks: IMemoryChunk[];

    // 1. 按类型过滤
    if (filter.type) {
      chunks = this.drink(filter.type);
    } else {
      chunks = this.drink();
    }

    // 2. 按来源节点过滤
    if (filter.sourceNode) {
      chunks = chunks.filter(c => c.sourceNode === filter.sourceNode);
    }

    // 3. 按时间范围过滤
    if (filter.timeRange) {
      const { from, to } = filter.timeRange;
      chunks = chunks.filter(c => {
        const createdAt = new Date(c.metadata.createdAt);
        return createdAt >= from && createdAt <= to;
      });
    }

    // 4. 按最小重要性过滤
    if (filter.minImportance !== undefined) {
      chunks = chunks.filter(c => c.metadata.importance >= filter.minImportance);
    }

    // 5. 按内容模式过滤
    if (filter.contentPattern) {
      const pattern = filter.contentPattern.toLowerCase();
      chunks = chunks.filter(c => {
        const contentStr = JSON.stringify(c.content).toLowerCase();
        return contentStr.includes(pattern);
      });
    }

    // 6. 按 ID 列表过滤
    if (filter.ids && filter.ids.length > 0) {
      const idSet = new Set(filter.ids);
      chunks = chunks.filter(c => idSet.has(c.id));
    }

    return chunks;
  }

  /**
   * 从沉淀层取水 - 读取学习到的模式
   *
   * @param type - 模式类型，不指定则返回所有模式
   * @returns 模式数组
   */
  dredge(type?: string): IPattern[] {
    const patterns = Array.from(this.sediment.values());

    if (type) {
      return patterns.filter(p => p.type === type);
    }

    // 按重要性排序
    return patterns.sort((a, b) => b.importance - a.importance);
  }

  // ========== 注水操作（写入）==========

  /**
   * 向主流注水 - 写入记忆块
   *
   * @param chunk - 记忆块或记忆块数组
   */
  pour(chunk: IMemoryChunk | IMemoryChunk[]): void {
    const chunks = Array.isArray(chunk) ? chunk : [chunk];

    for (const c of chunks) {
      this.validateAndNormalizeChunk(c);
      this.addChunkToPool(c);
    }

    this.emitEvent('memory:added', { chunks });
    this.emitEvent('memory:poolChanged', {});

    this.logger.info('Memory poured into river', {
      count: chunks.length,
      types: chunks.map(c => c.type),
    });
  }

  /**
   * 验证并规范化记忆块
   */
  private validateAndNormalizeChunk(chunk: IMemoryChunk): void {
    // 确保有 ID
    if (!chunk.id) {
      chunk.id = this.generateId();
    }

    // 确保元数据完整
    if (!chunk.metadata) {
      chunk.metadata = {
        createdAt: new Date(),
        updatedAt: new Date(),
        tokens: 0,
        bytes: 0,
        importance: 0.5,
      };
    } else {
      // 确保 createdAt 存在
      if (!chunk.metadata.createdAt) {
        chunk.metadata.createdAt = new Date();
      }
      // 更新 updatedAt
      chunk.metadata.updatedAt = new Date();
      // 默认重要性
      if (chunk.metadata.importance === undefined) {
        chunk.metadata.importance = 0.5;
      }
      // 估算大小
      if (chunk.metadata.bytes === 0) {
        chunk.metadata.bytes = JSON.stringify(chunk.content).length;
      }
    }

    // 确保默认层级
    if (!chunk.level) {
      chunk.level = 'runtime';
    }
  }

  /**
   * 添加记忆块到对应的池
   */
  private addChunkToPool(chunk: IMemoryChunk): void {
    const pool = this.pools.get(chunk.type);

    if (!pool) {
      throw new Error(`Invalid memory type: ${chunk.type}`);
    }

    // 检查池大小
    if (pool.length >= this.config.maxPoolSize) {
      this.logger.warn('Memory pool at capacity, removing oldest chunk', {
        type: chunk.type,
        maxSize: this.config.maxPoolSize,
      });
      pool.shift(); // 移除最旧的
    }

    // 添加新记忆
    pool.push(chunk);
  }

  /**
   * 向沉淀层注水 - 记录学习到的模式
   *
   * @param pattern - 模式或模式数组
   */
  settle(pattern: IPattern | IPattern[]): void {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];

    for (const p of patterns) {
      const existing = this.sediment.get(p.type);

      if (existing) {
        // 更新现有模式
        existing.occurrences += p.occurrences;
        existing.lastUpdated = new Date();
        existing.importance = Math.max(existing.importance, p.importance);
        this.logger.debug('Pattern updated', { type: p.type, occurrences: existing.occurrences });
      } else {
        // 添加新模式
        this.sediment.set(p.type, { ...p });
        this.logger.debug('Pattern settled', { type: p.type });
      }
    }

    this.emitEvent('pattern:settled', { patterns });
  }

  // ========== 水闸操作（检查点）==========

  /**
   * 建闸 - 创建检查点
   *
   * @param trigger - 触发类型
   * @param nodeInfo - 节点信息
   * @returns 检查点 ID
   */
  buildDam(
    trigger: CheckpointTrigger = 'node_complete',
    nodeInfo?: { nodeId: string; nodeName: string }
  ): string {
    const checkpointId = this.generateId();
    const timestamp = new Date();

    // 创建完整快照
    const snapshot: IMemorySnapshot = {
      id: this.generateId(),
      timestamp,
      memoryPool: {
        context: [...(this.pools.get('context') || [])],
        execution: [...(this.pools.get('execution') || [])],
        working: [...(this.pools.get('working') || [])],
        knowledge: [...(this.pools.get('knowledge') || [])],
      },
      nodeResults: new Map(this.nodeResults),
      variables: { ...this.variables },
      executionPath: [...this.executionPath],
    };

    // 创建检查点
    const checkpoint: ICheckpoint = {
      id: checkpointId,
      timestamp,
      trigger,
      snapshot,
      position: {
        completedNode: nodeInfo?.nodeId || '',
        nextNodes: [],
        pendingEdges: [],
      },
      metadata: {
        executionTime: nodeInfo ? (this.nodeResults.get(nodeInfo.nodeId)?.metrics?.executionTime || 0) : 0,
        tokensUsed: nodeInfo ? (this.nodeResults.get(nodeInfo.nodeId)?.metrics?.tokensUsed || 0) : 0,
        nodeName: nodeInfo?.nodeName || 'manual',
      },
    };

    this.checkpoints.set(checkpointId, checkpoint);
    this.currentCheckpointId = checkpointId;

    this.emitEvent('checkpoint:created', { checkpoint });
    this.logger.info('Checkpoint created', { id: checkpointId, trigger });

    return checkpointId;
  }

  /**
   * 开闸 - 恢复到检查点
   *
   * @param checkpointId - 检查点 ID
   */
  openDam(checkpointId: string): void {
    const checkpoint = this.checkpoints.get(checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // 恢复记忆池
    const { memoryPool } = checkpoint.snapshot;
    this.pools.set('context', [...memoryPool.context]);
    this.pools.set('execution', [...memoryPool.execution]);
    this.pools.set('working', [...memoryPool.working]);
    this.pools.set('knowledge', [...memoryPool.knowledge]);

    // 恢复节点结果
    this.nodeResults = new Map(checkpoint.snapshot.nodeResults);

    // 恢复变量
    this.variables = { ...checkpoint.snapshot.variables };

    // 恢复执行路径
    this.executionPath = [...checkpoint.snapshot.executionPath];

    this.currentCheckpointId = checkpointId;

    this.emitEvent('checkpoint:restored', { checkpoint });
    this.logger.info('Checkpoint restored', { id: checkpointId });

    // 清空沉淀层（通常不需要恢复）
    this.sediment.clear();
  }

  /**
   * 查看所有水闸
   *
   * @returns 检查点数组
   */
  listDams(): ICheckpoint[] {
    return Array.from(this.checkpoints.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * 获取指定检查点
   *
   * @param id - 检查点 ID
   * @returns 检查点或 null
   */
  getDam(id: string): ICheckpoint | null {
    return this.checkpoints.get(id) || null;
  }

  // ========== 变量操作 ==========

  /**
   * 设置变量
   */
  setVariable(key: string, value: any): void {
    this.variables[key] = value;
  }

  /**
   * 获取变量
   */
  getVariable(key: string): any {
    return this.variables[key];
  }

  /**
   * 获取所有变量
   */
  getAllVariables(): Record<string, any> {
    return { ...this.variables };
  }

  // ========== 节点结果操作 ==========

  /**
   * 记录节点结果
   */
  recordNodeResult(nodeId: string, result: INodeResult): void {
    this.nodeResults.set(nodeId, result);
    this.executionPath.push(nodeId);
  }

  /**
   * 获取节点结果
   */
  getNodeResult(nodeId: string): INodeResult | undefined {
    return this.nodeResults.get(nodeId);
  }

  /**
   * 获取所有节点结果
   */
  getAllNodeResults(): Map<string, INodeResult> {
    return new Map(this.nodeResults);
  }

  // ========== 执行路径操作 ==========

  /**
   * 获取执行路径
   */
  getExecutionPath(): string[] {
    return [...this.executionPath];
  }

  /**
   * 清空执行路径
   */
  clearExecutionPath(): void {
    this.executionPath = [];
  }

  // ========== 查询操作 ==========

  /**
   * 按类型查询
   */
  queryByType(type: MemoryType): IMemoryChunk[] {
    return this.drink(type);
  }

  /**
   * 按来源查询
   */
  queryBySource(nodeId: string): IMemoryChunk[] {
    return this.scoop({ sourceNode: nodeId });
  }

  /**
   * 时序查询（借鉴 Zep）
   */
  queryByTimeRange(start: Date, end: Date): IMemoryChunk[] {
    return this.scoop({ timeRange: { from: start, to: end } });
  }

  // ========== Reducer 操作 ==========

  /**
   * 应用变更（通过 Reducer）
   */
  applyChanges(changes: IMemoryChange[]): void {
    const affectedTypes = new Set<MemoryType>();

    for (const change of changes) {
      affectedTypes.add(change.memoryType);
      const pool = this.pools.get(change.memoryType);
      if (!pool) continue;

      const reducer = defaultReducers[change.memoryType];
      if (!reducer) continue;

      const newPool = reducer([...pool], changes.filter(c => c.memoryType === change.memoryType));
      this.pools.set(change.memoryType, newPool);
    }

    for (const type of affectedTypes) {
      this.emitEvent('memory:poolChanged', { memoryType: type });
    }

    this.logger.info('Changes applied', { count: changes.length, types: Array.from(affectedTypes) });
  }

  // ========== 自动衰减 ==========

  /**
   * 启动自动衰减
   */
  private startDecay(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
    }

    this.decayTimer = setInterval(() => {
      this.decayMemories();
    }, this.config.decayInterval);

    this.logger.info('Auto decay started', { interval: this.config.decayInterval });
  }

  /**
   * 停止自动衰减
   */
  stopDecay(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
      this.logger.info('Auto decay stopped');
    }
  }

  /**
   * 执行记忆衰减
   */
  protected decayMemories(): void {
    let decayedCount = 0;

    for (const [type, pool] of this.pools.entries()) {
      for (const chunk of pool) {
        const newImportance = chunk.metadata.importance * (1 - this.config.decayRate);

        if (newImportance < 0.1) {
          // 重要性过低，移除
          const idx = pool.indexOf(chunk);
          if (idx >= 0) {
            pool.splice(idx, 1);
            decayedCount++;
          }
        } else {
          chunk.metadata.importance = newImportance;
        }
      }
    }

    if (decayedCount > 0) {
      this.logger.info('Memories decayed', { count: decayedCount });
    }
  }

  // ========== 清空操作 ==========

  /**
   * 清空河流（所有记忆池）
   */
  flush(): void {
    for (const pool of this.pools.keys()) {
      this.pools.set(pool, []);
    }

    this.emitEvent('river:flushed', {});
    this.logger.info('River flushed');
  }

  /**
   * 清空指定类型的记忆池
   */
  flushPool(type: MemoryType): void {
    this.pools.set(type, []);
    this.emitEvent('memory:poolChanged', { memoryType: type });
    this.logger.info('Memory pool flushed', { type });
  }

  // ========== 状态查询 ==========

  /**
   * 获取当前快照
   */
  getSnapshot(): IMemorySnapshot {
    return {
      id: this.generateId(),
      timestamp: new Date(),
      memoryPool: {
        context: [...(this.pools.get('context') || [])],
        execution: [...(this.pools.get('execution') || [])],
        working: [...(this.pools.get('working') || [])],
        knowledge: [...(this.pools.get('knowledge') || [])],
      },
      nodeResults: new Map(this.nodeResults),
      variables: { ...this.variables },
      executionPath: [...this.executionPath],
    };
  }

  /**
   * 获取当前检查点 ID
   */
  getCurrentCheckpointId(): string | null {
    return this.currentCheckpointId;
  }

  /**
   * 获取河流统计信息
   */
  getStats(): {
    totalChunks: number;
    chunksByType: Record<MemoryType, number>;
    totalPatterns: number;
    totalCheckpoints: number;
    currentCheckpointId: string | null;
    executionPathLength: number;
    totalVariables: number;
    riverAge: number; // 毫秒
  } {
    const chunksByType: Record<MemoryType, number> = {
      context: 0,
      execution: 0,
      working: 0,
      knowledge: 0,
    };

    let totalChunks = 0;
    for (const [type, pool] of this.pools.entries()) {
      chunksByType[type] = pool.length;
      totalChunks += pool.length;
    }

    return {
      totalChunks,
      chunksByType,
      totalPatterns: this.sediment.size,
      totalCheckpoints: this.checkpoints.size,
      currentCheckpointId: this.currentCheckpointId,
      executionPathLength: this.executionPath.length,
      totalVariables: Object.keys(this.variables).length,
      riverAge: Date.now() - this.createdAt.getTime(),
    };
  }

  // ========== 事件发射 ==========

  /**
   * 发射事件
   */
  protected emitEvent(eventType: RiverEventType, data: Partial<RiverEventData>): void {
    if (!this.config.enableEvents) return;

    const eventData: RiverEventData = {
      eventType,
      timestamp: new Date(),
      ...data,
    };

    this.emit(eventType, eventData);
  }

  // ========== 工具方法 ==========

  /**
   * 生成唯一 ID
   */
  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ========== 清理 ==========

  /**
   * 销毁河流
   */
  destroy(): void {
    this.stopDecay();
    this.removeAllListeners();
    this.pools.clear();
    this.sediment.clear();
    this.checkpoints.clear();
    this.nodeResults.clear();

    this.logger.info('River destroyed');
  }
}

// ==================== 导出 ====================

export default River;
