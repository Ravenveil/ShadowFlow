/**
 * 河流式记忆系统核心类型定义
 *
 * 基于 docs/River-Memory-Design.md 设计文档
 * 记忆像河流一样流动，节点可以自由取水（读）和注水（写）
 */

// ============================================================================
// 基础枚举类型
// ============================================================================

/**
 * 记忆类型 - 四种流动的记忆
 *
 * - context: 上下文记忆（任务理解、决策依据）
 * - execution: 执行结果记忆（节点产出、代码、文档、数据）
 * - working: 工作记忆（临时状态、计数器、标志位）
 * - knowledge: 知识记忆（持久化知识、模式、规则、经验）
 */
export type MemoryType = 'context' | 'execution' | 'working' | 'knowledge';

/**
 * 记忆层级 - 记忆的抽象层级
 *
 * - workflow: 工作流级别记忆（全局架构、项目规则）
 * - node_type: 节点类型级别记忆（特定类型节点的通用模式）
 * - instance: 实例级别记忆（特定节点实例的状态）
 * - runtime: 运行时级别记忆（执行时的临时数据）
 */
export type MemoryLevel = 'workflow' | 'node_type' | 'instance' | 'runtime';

// ============================================================================
// 记忆块相关类型
// ============================================================================

/**
 * 时间戳信息 - 记忆的时序标记
 */
export interface ITemporalInfo {
  /** 创建时间戳 */
  createdAt: Date;
  /** 最后修改时间戳 */
  updatedAt: Date;
  /** 最后访问时间戳（用于衰减计算） */
  lastAccessedAt: Date;
}

/**
 * 记忆元数据 - 附加的扩展信息
 */
export interface IMemoryMetadata {
  /** 重要性评分 (0-1)，用于衰减机制 */
  importance: number;
  /** 访问计数（用于评估重要性） */
  accessCount: number;
  /** 标签数组（用于快速筛选） */
  tags: string[];
  /** 自定义扩展字段 */
  [key: string]: any;
}

/**
 * 记忆块 - 河流中流动的基本记忆单元
 */
export interface IMemoryChunk {
  /** 唯一标识符 */
  id: string;

  /** 记忆类型 */
  type: MemoryType;

  /** 记忆层级 */
  level: MemoryLevel;

  /** 来源节点ID（记录记忆的产出节点） */
  sourceNode: string;

  /** 记忆内容（可以是任意类型） */
  content: unknown;

  /** 元数据 */
  metadata: IMemoryMetadata;

  /** 时间戳信息 */
  temporal: ITemporalInfo;

  /** 可选的引用计数（用于记忆依赖追踪） */
  references?: string[];

  /** 可选的父记忆ID（用于记忆链追踪） */
  parentId?: string;
}

// ============================================================================
// 检查点（水闸）相关类型
// ============================================================================

/**
 * 执行位置 - 记录检查点时的执行状态
 */
export interface IExecutionPosition {
  /** 当前执行的节点ID */
  currentNodeId: string;
  /** 已执行的节点路径 */
  executedPath: string[];
  /** 当前执行的节点索引 */
  currentIndex: number;
  /** 可选：条件边的评估状态 */
  edgeStates?: Record<string, boolean>;
}

/**
 * 记忆池快照 - 检查点时刻的记忆状态
 */
export interface IMemorySnapshot {
  /** 主流中的所有记忆块 */
  mainstream: IMemoryChunk[];
  /** 沉淀层中的所有模式 */
  sediments: IPattern[];
  /** 快照时间戳 */
  timestamp: Date;
  /** 快照大小（字节数） */
  size: number;
}

/**
 * 检查点（水闸） - 河流中的检查点，可保存和恢复状态
 */
export interface ICheckpoint {
  /** 检查点唯一标识符 */
  id: string;

  /** 记忆池快照 */
  snapshot: IMemorySnapshot;

  /** 执行位置 */
  position: IExecutionPosition;

  /** 检查点元数据 */
  metadata: {
    /** 检查点创建时间 */
    createdAt: Date;
    /** 创建检查点的节点ID */
    createdBy: string;
    /** 检查点描述 */
    description?: string;
    /** 检查点标签 */
    tags: string[];
    /** 是否自动创建 */
    autoCreated: boolean;
  };
}

// ============================================================================
// 沉淀模式相关类型
// ============================================================================

/**
 * 模式类型 - 沉淀在河床的记忆类型
 */
export type PatternType =
  | 'code_pattern'      // 代码模式
  | 'workflow_pattern'  // 工作流模式
  | 'user_preference'   // 用户偏好
  | 'solution_pattern'  // 解决方案模式
  | 'error_pattern';    // 错误模式

/**
 * 沉淀模式 - 沉淀在河床的重要记忆
 */
export interface IPattern {
  /** 模式唯一标识符 */
  id: string;

  /** 模式类型 */
  type: PatternType;

  /** 模式内容（可以是任意结构） */
  content: unknown;

  /** 沉淀原因（为什么这个模式重要） */
  reason: string;

  /** 成功次数（该模式被成功应用的次数） */
  successCount: number;

  /** 失败次数（该模式失败应用的次数） */
  failureCount: number;

  /** 可信度评分 (0-1) */
  confidence: number;

  /** 最后验证时间 */
  lastVerifiedAt: Date;

  /** 模式元数据 */
  metadata: {
    /** 创建时间 */
    createdAt: Date;
    /** 关联的节点类型 */
    nodeTypes?: string[];
    /** 关联的记忆块ID */
    relatedMemoryIds: string[];
    /** 标签 */
    tags: string[];
  };
}

// ============================================================================
// 过滤器类型
// ============================================================================

/**
 * 时间范围过滤器
 */
export interface ITimeRangeFilter {
  /** 起始时间 */
  from: Date;
  /** 结束时间 */
  to: Date;
}

/**
 * 记忆块过滤器 - 用于 scoop 操作的条件查询
 */
export interface IMemoryFilter {
  /** 记忆类型 */
  type?: MemoryType;

  /** 记忆层级 */
  level?: MemoryLevel;

  /** 来源节点ID */
  sourceNode?: string;

  /** 时间范围 */
  timeRange?: ITimeRangeFilter;

  /** 标签过滤（匹配所有给定标签） */
  tags?: string[];

  /** 重要性范围 */
  importanceRange?: {
    min: number;
    max: number;
  };

  /** 自定义谓词函数 */
  predicate?: (chunk: IMemoryChunk) => boolean;
}

/**
 * 模式过滤器 - 用于 dredge 操作的条件查询
 */
export interface IPatternFilter {
  /** 模式类型 */
  type?: PatternType;

  /** 关联的节点类型 */
  nodeTypes?: string[];

  /** 最小可信度 */
  minConfidence?: number;

  /** 最小成功次数 */
  minSuccessCount?: number;

  /** 标签过滤 */
  tags?: string[];

  /** 自定义谓词函数 */
  predicate?: (pattern: IPattern) => boolean;
}

// ============================================================================
// 河流访问接口 - 节点与河流交互的接口
// ============================================================================

/**
 * 河流记忆访问接口
 *
 * 节点通过此接口与河流式记忆系统交互
 * 提供取水（读取）和注水（写入）以及水闸操作
 */
export interface IRiverMemoryAccess {
  // ========================================================================
  // 取水（读取）操作
  // ========================================================================

  /**
   * 从主流取水 - 自由读取记忆
   *
   * @param type - 可选的记忆类型过滤器
   * @returns 匹配的记忆块数组
   *
   * @example
   * ```ts
   * // 获取所有记忆
   * const all = river.drink();
   *
   * // 获取上下文记忆
   * const context = river.drink('context');
   * ```
   */
  drink(type?: MemoryType): IMemoryChunk[];

  /**
   * 用过滤网取水 - 条件查询记忆
   *
   * @param filter - 过滤条件
   * @returns 匹配的记忆块数组
   *
   * @example
   * ```ts
   * const results = river.scoop({
   *   sourceNode: 'analyze',
   *   type: 'execution',
   *   timeRange: { from: startTime, to: endTime }
   * });
   * ```
   */
  scoop(filter: IMemoryFilter): IMemoryChunk[];

  /**
   * 从沉淀层取水 - 读取学习到的模式
   *
   * @param filter - 可选的过滤器
   * @returns 匹配的模式数组
   *
   * @example
   * ```ts
   * // 获取所有模式
   * const patterns = river.dredge();
   *
   * // 获取高可信度的代码模式
   * const codePatterns = river.dredge({
   *   type: 'code_pattern',
   *   minConfidence: 0.8
   * });
   * ```
   */
  dredge(filter?: IPatternFilter): IPattern[];

  // ========================================================================
  // 注水（写入）操作
  // ========================================================================

  /**
   * 向主流注水 - 自由写入记忆
   *
   * @param chunk - 要写入的记忆块
   *
   * @example
   * ```ts
   * river.pour({
   *   type: 'execution',
   *   level: 'instance',
   *   sourceNode: 'code',
   *   content: { code: '...' },
   *   metadata: { importance: 0.8, tags: ['generated'] },
   *   temporal: { ... }
   * });
   * ```
   */
  pour(chunk: IMemoryChunk): void;

  /**
   * 向沉淀层注水 - 记录学习到的模式
   *
   * @param pattern - 要沉淀的模式
   *
   * @example
   * ```ts
   * river.settle({
   *   type: 'code_pattern',
   *   content: { style: 'functional' },
   *   reason: '用户认可的代码风格',
   *   successCount: 1,
   *   failureCount: 0,
   *   confidence: 0.5,
   *   lastVerifiedAt: new Date(),
   *   metadata: { ... }
   * });
   * ```
   */
  settle(pattern: IPattern): void;

  // ========================================================================
  // 水闸（检查点）操作
  // ========================================================================

  /**
   * 建闸 - 创建检查点
   *
   * 保存当前记忆池状态和执行位置
   *
   * @param metadata - 可选的检查点元数据
   * @returns 检查点ID
   *
   * @example
   * ```ts
   * const checkpointId = river.buildDam({
   *   description: '代码生成后',
   *   tags: ['pre-review']
   * });
   * ```
   */
  buildDam(metadata?: Partial<ICheckpoint['metadata']>): string;

  /**
   * 开闸 - 恢复到检查点
   *
   * 将记忆池恢复到检查点时的状态
   *
   * @param checkpointId - 要恢复的检查点ID
   *
   * @example
   * ```ts
   * river.openDam(checkpointId);
   * ```
   */
  openDam(checkpointId: string): void;

  /**
   * 查看所有水闸 - 获取所有检查点
   *
   * @returns 所有检查点数组
   */
  listDams(): ICheckpoint[];

  /**
   * 删除水闸 - 删除指定的检查点
   *
   * @param checkpointId - 要删除的检查点ID
   */
  removeDam(checkpointId: string): void;
}

// ============================================================================
// 河流状态类型
// ============================================================================

/**
 * 河流统计信息 - 河流的当前状态统计
 */
export interface IRiverStats {
  /** 主流中的记忆块数量 */
  mainstreamCount: number;

  /** 沉淀层中的模式数量 */
  sedimentsCount: number;

  /** 检查点数量 */
  checkpointCount: number;

  /** 记忆类型分布 */
  typeDistribution: Record<MemoryType, number>;

  /** 记忆层级分布 */
  levelDistribution: Record<MemoryLevel, number>;

  /** 平均重要性评分 */
  averageImportance: number;

  /** 总存储大小（字节数） */
  totalSize: number;
}

/**
 * 河流状态 - 河流式记忆系统的完整状态
 */
export interface IRiverState {
  /** 主流中的所有记忆块 */
  mainstream: IMemoryChunk[];

  /** 沉淀层中的所有模式 */
  sediments: IPattern[];

  /** 所有检查点 */
  checkpoints: Map<string, ICheckpoint>;

  /** 当前执行位置 */
  currentPosition: IExecutionPosition | null;

  /** 河流统计信息 */
  stats: IRiverStats;
}

// ============================================================================
// 河流事件类型 - 用于事件系统
// ============================================================================

/**
 * 河流事件类型
 */
export type RiverEventType =
  | 'memory_poured'      // 记忆被注水
  | 'memory_accessed'    // 记忆被访问
  | 'memory_removed'     // 记忆被移除
  | 'pattern_settled'    // 模式被沉淀
  | 'pattern_verified'   // 模式被验证
  | 'checkpoint_created'// 检查点被创建
  | 'checkpoint_restored'// 检查点被恢复
  | 'conflict_detected'; // 冲突被检测到

/**
 * 河流事件 - 河流中发生的事件
 */
export interface IRiverEvent {
  /** 事件类型 */
  type: RiverEventType;

  /** 事件时间戳 */
  timestamp: Date;

  /** 事件数据（根据事件类型不同） */
  data: {
    /** 记忆ID（适用于记忆相关事件） */
    memoryId?: string;
    /** 模式ID（适用于模式相关事件） */
    patternId?: string;
    /** 检查点ID（适用于检查点相关事件） */
    checkpointId?: string;
    /** 额外数据 */
    [key: string]: unknown;
  };
}

/**
 * 河流事件监听器
 */
export type RiverEventListener = (event: IRiverEvent) => void;
