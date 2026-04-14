/**
 * 水闸检查点实现
 *
 * 基于设计文档 docs/River-Memory-Design.md 的 Layer 4: 水闸
 * 参考 LangGraph 的检查点机制
 *
 * 功能：
 * - buildDam() - 建闸（创建检查点）
 * - openDam(checkpointId) - 开闸（恢复到检查点）
 * - listDams() - 查看所有水闸
 *
 * 创建时机：
 * - 节点完成后
 * - 条件边评估前
 * - 工作流暂停时
 */

import {
  ICheckpoint,
  CheckpointTrigger,
  IMemorySnapshot,
  IMemoryChunk,
  IMemoryChange,
  MemoryType,
  INodeResult
} from '../types/memory';

/**
 * 检查点配置选项
 */
export interface DamConfig {
  /** 最大检查点数量 */
  maxCheckpoints?: number;
  /** 检查点持久化路径 */
  persistencePath?: string;
  /** 是否自动持久化 */
  autoPersist?: boolean;
  /** 检查点过期时间（毫秒） */
  checkpointExpiration?: number;
}

/**
 * 执行位置信息
 */
export interface ExecutionPosition {
  /** 已完成的节点 */
  completedNode: string;
  /** 下一步的节点列表 */
  nextNodes: string[];
  /** 待处理的边 */
  pendingEdges: string[];
}

/**
 * 检查点元数据
 */
export interface CheckpointMetadata {
  /** 执行时间（毫秒） */
  executionTime: number;
  /** 使用的 token 数量 */
  tokensUsed: number;
  /** 节点名称 */
  nodeName: string;
  /** 自定义元数据 */
  custom?: Record<string, any>;
}

/**
 * 水闸管理器 - 负责检查点的创建、存储和恢复
 */
export class DamManager {
  /** 存储的检查点 */
  private dams: Map<string, ICheckpoint> = new Map();

  /** 检查点创建顺序（用于 LRU 淘汰） */
  private damOrder: string[] = [];

  /** 当前状态快照 */
  private currentSnapshot: IMemorySnapshot | null = null;

  /** 配置选项 */
  private config: Required<DamConfig>;

  /** 持久化存储 */
  private persistence?: {
    load: () => ICheckpoint[];
    save: (checkpoint: ICheckpoint) => void;
    delete: (checkpointId: string) => void;
  };

  constructor(config: DamConfig = {}) {
    this.config = {
      maxCheckpoints: config.maxCheckpoints ?? 100,
      persistencePath: config.persistencePath ?? '.agentgraph/checkpoints',
      autoPersist: config.autoPersist ?? true,
      checkpointExpiration: config.checkpointExpiration ?? 7 * 24 * 60 * 60 * 1000 // 7天
    };

    // 初始化持久化
    if (this.config.autoPersist) {
      this.initPersistence();
    }
  }

  /**
   * 初始化持久化存储
   */
  private initPersistence(): void {
    // 在实际实现中，这里会初始化文件系统或数据库存储
    // 简化实现，仅提供接口定义
    this.persistence = {
      load: () => {
        // TODO: 从文件系统加载检查点
        return [];
      },
      save: (checkpoint: ICheckpoint) => {
        // TODO: 持久化检查点到文件系统
      },
      delete: (checkpointId: string) => {
        // TODO: 从文件系统删除检查点
      }
    };

    // 尝试加载已持久化的检查点
    try {
      const loaded = this.persistence.load();
      for (const checkpoint of loaded) {
        this.dams.set(checkpoint.id, checkpoint);
        this.damOrder.push(checkpoint.id);
      }
    } catch (error) {
      console.warn('Failed to load checkpoints from persistence:', error);
    }
  }

  /**
   * 更新当前状态快照
   * @param snapshot 最新的状态快照
   */
  public updateSnapshot(snapshot: IMemorySnapshot): void {
    this.currentSnapshot = snapshot;
  }

  /**
   * 建闸 - 创建检查点
   * @param trigger 触发类型
   * @param position 执行位置
   * @param metadata 元数据
   * @returns 检查点ID
   */
  public buildDam(
    trigger: CheckpointTrigger,
    position: ExecutionPosition,
    metadata?: Partial<CheckpointMetadata>
  ): string {
    if (!this.currentSnapshot) {
      throw new Error('No current snapshot available. Call updateSnapshot first.');
    }

    const checkpointId = this.generateCheckpointId(trigger);
    const timestamp = new Date();

    // 深度克隆快照，确保不可变性
    const snapshot = this.deepCloneSnapshot(this.currentSnapshot);

    const checkpoint: ICheckpoint = {
      id: checkpointId,
      timestamp,
      trigger,
      snapshot,
      position: {
        completedNode: position.completedNode,
        nextNodes: [...position.nextNodes],
        pendingEdges: [...position.pendingEdges]
      },
      metadata: {
        executionTime: metadata?.executionTime ?? 0,
        tokensUsed: metadata?.tokensUsed ?? 0,
        nodeName: metadata?.nodeName ?? 'unknown'
      }
    };

    // 存储检查点
    this.dams.set(checkpointId, checkpoint);
    this.damOrder.push(checkpointId);

    // 持久化
    if (this.persistence) {
      this.persistence.save(checkpoint);
    }

    // 检查并清理过期或过多的检查点
    this.cleanupCheckpoints();

    return checkpointId;
  }

  /**
   * 建闸（简化版）- 使用当前快照和指定节点
   * @param trigger 触发类型
   * @param nodeId 当前节点ID
   * @param nextNodes 下一节点列表
   * @returns 检查点ID
   */
  public buildDamSimple(
    trigger: CheckpointTrigger,
    nodeId: string,
    nextNodes: string[] = []
  ): string {
    return this.buildDam(trigger, {
      completedNode: nodeId,
      nextNodes,
      pendingEdges: []
    }, { nodeName: nodeId });
  }

  /**
   * 开闸 - 恢复到检查点
   * @param checkpointId 检查点ID
   * @returns 恢复的快照
   */
  public openDam(checkpointId: string): IMemorySnapshot {
    const checkpoint = this.dams.get(checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // 验证检查点是否过期
    if (this.isCheckpointExpired(checkpoint)) {
      this.dams.delete(checkpointId);
      const orderIndex = this.damOrder.indexOf(checkpointId);
      if (orderIndex >= 0) {
        this.damOrder.splice(orderIndex, 1);
      }
      throw new Error(`Checkpoint has expired: ${checkpointId}`);
    }

    // 深度克隆并更新当前快照
    this.currentSnapshot = this.deepCloneSnapshot(checkpoint.snapshot);

    return this.currentSnapshot;
  }

  /**
   * 查看所有水闸
   * @returns 所有检查点列表
   */
  public listDams(): ICheckpoint[] {
    // 按时间倒序返回
    const checkpoints = Array.from(this.dams.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // 过滤掉过期的检查点
    return checkpoints.filter(cp => !this.isCheckpointExpired(cp));
  }

  /**
   * 获取指定检查点
   * @param checkpointId 检查点ID
   * @returns 检查点或null
   */
  public getCheckpoint(checkpointId: string): ICheckpoint | null {
    const checkpoint = this.dams.get(checkpointId);
    if (!checkpoint || this.isCheckpointExpired(checkpoint)) {
      return null;
    }
    return checkpoint;
  }

  /**
   * 删除指定检查点
   * @param checkpointId 检查点ID
   */
  public deleteDam(checkpointId: string): void {
    if (!this.dams.has(checkpointId)) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    this.dams.delete(checkpointId);

    const orderIndex = this.damOrder.indexOf(checkpointId);
    if (orderIndex >= 0) {
      this.damOrder.splice(orderIndex, 1);
    }

    // 从持久化存储删除
    if (this.persistence) {
      this.persistence.delete(checkpointId);
    }
  }

  /**
   * 获取当前快照
   * @returns 当前快照或null
   */
  public getCurrentSnapshot(): IMemorySnapshot | null {
    return this.currentSnapshot ? this.deepCloneSnapshot(this.currentSnapshot) : null;
  }

  /**
   * 清空所有检查点
   */
  public clearAllDams(): void {
    this.dams.clear();
    this.damOrder = [];
  }

  /**
   * 获取检查点数量
   * @returns 检查点数量
   */
  public getDamCount(): number {
    return this.dams.size;
  }

  /**
   * 按触发类型过滤检查点
   * @param trigger 触发类型
   * @returns 匹配的检查点列表
   */
  public getDamsByTrigger(trigger: CheckpointTrigger): ICheckpoint[] {
    return this.listDams().filter(cp => cp.trigger === trigger);
  }

  /**
   * 按时间范围获取检查点
   * @param from 开始时间
   * @param to 结束时间
   * @returns 时间范围内的检查点列表
   */
  public getDamsByTimeRange(from: Date, to: Date): ICheckpoint[] {
    return this.listDams().filter(cp =>
      cp.timestamp >= from && cp.timestamp <= to
    );
  }

  /**
   * 检查点是否过期
   * @param checkpoint 检查点
   * @returns 是否过期
   */
  private isCheckpointExpired(checkpoint: ICheckpoint): boolean {
    const now = Date.now();
    const checkpointTime = checkpoint.timestamp.getTime();
    return (now - checkpointTime) > this.config.checkpointExpiration;
  }

  /**
   * 清理过期或过多的检查点
   */
  private cleanupCheckpoints(): void {
    const now = Date.now();

    // 清理过期的检查点
    for (const [id, checkpoint] of this.dams.entries()) {
      if (this.isCheckpointExpired(checkpoint)) {
        this.dams.delete(id);
        const orderIndex = this.damOrder.indexOf(id);
        if (orderIndex >= 0) {
          this.damOrder.splice(orderIndex, 1);
        }
      }
    }

    // 如果超过最大数量，移除最旧的
    while (this.dams.size > this.config.maxCheckpoints && this.damOrder.length > 0) {
      const oldestId = this.damOrder.shift();
      if (oldestId) {
        this.dams.delete(oldestId);
      }
    }
  }

  /**
   * 生成检查点ID
   * @param trigger 触发类型
   * @returns 检查点ID
   */
  private generateCheckpointId(trigger: CheckpointTrigger): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `checkpoint_${trigger}_${timestamp}_${random}`;
  }

  /**
   * 深度克隆快照
   * @param snapshot 原始快照
   * @returns 克隆的快照
   */
  private deepCloneSnapshot(snapshot: IMemorySnapshot): IMemorySnapshot {
    return {
      id: snapshot.id,
      timestamp: new Date(snapshot.timestamp),
      memoryPool: {
        context: this.deepCloneMemoryChunks(snapshot.memoryPool.context),
        execution: this.deepCloneMemoryChunks(snapshot.memoryPool.execution),
        working: this.deepCloneMemoryChunks(snapshot.memoryPool.working),
        knowledge: this.deepCloneMemoryChunks(snapshot.memoryPool.knowledge)
      },
      nodeResults: new Map(snapshot.nodeResults),
      variables: this.deepCloneObject(snapshot.variables),
      executionPath: [...snapshot.executionPath]
    };
  }

  /**
   * 深度克隆记忆块数组
   * @param chunks 原始记忆块数组
   * @returns 克隆的记忆块数组
   */
  private deepCloneMemoryChunks(chunks: IMemoryChunk[]): IMemoryChunk[] {
    return chunks.map(chunk => ({
      id: chunk.id,
      type: chunk.type,
      level: chunk.level,
      sourceNode: chunk.sourceNode,
      content: this.deepCloneObject(chunk.content),
      metadata: {
        createdAt: new Date(chunk.metadata.createdAt),
        updatedAt: new Date(chunk.metadata.updatedAt),
        tokens: chunk.metadata.tokens,
        bytes: chunk.metadata.bytes,
        importance: chunk.metadata.importance,
        expiresAt: chunk.metadata.expiresAt ? new Date(chunk.metadata.expiresAt) : undefined
      },
      temporal: chunk.temporal ? {
        validFrom: new Date(chunk.temporal.validFrom),
        validUntil: chunk.temporal.validUntil ? new Date(chunk.temporal.validUntil) : undefined,
        version: chunk.temporal.version
      } : undefined
    }));
  }

  /**
   * 深度克隆对象
   * @param obj 原始对象
   * @returns 克隆的对象
   */
  private deepCloneObject<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }
    if (obj instanceof Map) {
      return new Map(Array.from(obj.entries()).map(([k, v]) =>
        [k, this.deepCloneObject(v)]
      )) as unknown as T;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepCloneObject(item)) as unknown as T;
    }
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        (cloned as any)[key] = this.deepCloneObject((obj as any)[key]);
      }
    }
    return cloned;
  }

  /**
   * 导出检查点数据
   * @param checkpointId 检查点ID
   * @returns 检查点的序列化数据
   */
  public exportCheckpoint(checkpointId: string): string | null {
    const checkpoint = this.getCheckpoint(checkpointId);
    if (!checkpoint) {
      return null;
    }
    return JSON.stringify(checkpoint, this.jsonReplacer, 2);
  }

  /**
   * 导入检查点数据
   * @param jsonData 检查点的序列化数据
   * @returns 检查点ID
   */
  public importCheckpoint(jsonData: string): string {
    const checkpoint = JSON.parse(jsonData, this.jsonReviver) as ICheckpoint;

    if (!this.dams.has(checkpoint.id)) {
      this.dams.set(checkpoint.id, checkpoint);
      this.damOrder.push(checkpoint.id);
    } else {
      // 如果ID已存在，生成新ID
      checkpoint.id = this.generateCheckpointId(checkpoint.trigger);
      this.dams.set(checkpoint.id, checkpoint);
      this.damOrder.push(checkpoint.id);
    }

    return checkpoint.id;
  }

  /**
   * JSON 序列化替换器 - 处理 Date 和 Map
   */
  private jsonReplacer(key: string, value: any): any {
    if (value instanceof Date) {
      return { __date__: value.toISOString() };
    }
    if (value instanceof Map) {
      return { __map__: Array.from(value.entries()) };
    }
    return value;
  }

  /**
   * JSON 反序列化恢复器 - 处理 Date 和 Map
   */
  private jsonReviver(key: string, value: any): any {
    if (value && typeof value === 'object' && '__date__' in value) {
      return new Date(value.__date__);
    }
    if (value && typeof value === 'object' && '__map__' in value) {
      return new Map(value.__map__);
    }
    return value;
  }
}

/**
 * 创建默认水闸管理器
 */
export function createDamManager(config?: DamConfig): DamManager {
  return new DamManager(config);
}

/**
 * 创建初始空快照
 * @returns 初始快照
 */
export function createInitialSnapshot(): IMemorySnapshot {
  return {
    id: 'initial',
    timestamp: new Date(),
    memoryPool: {
      context: [],
      execution: [],
      working: [],
      knowledge: []
    },
    nodeResults: new Map(),
    variables: {},
    executionPath: []
  };
}
