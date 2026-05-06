/**
 * AgentGraph 记忆系统类型定义
 *
 * 设计原则：
 * 1. 不可变快照 + Reducer 模式（借鉴 LangGraph）
 * 2. 分级记忆（借鉴 Claude Code）
 * 3. 全局记忆池 + 端口声明需求
 * 4. 检查点持久化 + 时间旅行调试
 */

// ==================== 基础类型 ====================

/**
 * 记忆类型
 */
export type MemoryType =
  | 'context'      // 上下文记忆：任务理解、决策依据
  | 'execution'    // 执行结果：节点产出
  | 'working'      // 工作记忆：临时状态、计数器
  | 'knowledge';   // 知识记忆：持久化知识

/**
 * 记忆层级（借鉴 Claude Code 分级）
 */
export type MemoryLevel =
  | 'workflow'     // 工作流级：全局规则
  | 'node_type'    // 节点类型级：某类节点通用
  | 'instance'     // 实例级：单个节点个性化
  | 'runtime';     // 运行时级：当前会话

/**
 * 记忆块
 */
export interface IMemoryChunk {
  /** 唯一ID */
  id: string;

  /** 记忆类型 */
  type: MemoryType;

  /** 记忆层级 */
  level: MemoryLevel;

  /** 来源节点 */
  sourceNode: string;

  /** 内容 */
  content: any;

  /** 元数据 */
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    tokens: number;
    bytes: number;
    importance: number;  // 0-1，用于衰减和优先级
    expiresAt?: Date;
  };

  /** 时序信息（借鉴 Zep） */
  temporal?: {
    validFrom: Date;
    validUntil?: Date;
    version: number;
  };
}

// ==================== 状态快照（借鉴 LangGraph） ====================

/**
 * 记忆状态快照（不可变）
 */
export interface IMemorySnapshot {
  /** 快照ID */
  id: string;

  /** 创建时间 */
  timestamp: Date;

  /** 记忆池内容 */
  memoryPool: {
    context: IMemoryChunk[];
    execution: IMemoryChunk[];
    working: IMemoryChunk[];
    knowledge: IMemoryChunk[];
  };

  /** 节点执行结果 */
  nodeResults: Map<string, INodeResult>;

  /** 全局变量 */
  variables: Record<string, any>;

  /** 执行路径 */
  executionPath: string[];
}

/**
 * 记忆变更（节点返回的，不是直接修改）
 */
export interface IMemoryChange {
  /** 变更类型 */
  type: 'add' | 'update' | 'delete';

  /** 目标记忆类型 */
  memoryType: MemoryType;

  /** 变更内容 */
  payload: IMemoryChunk | { id: string };

  /** 变更来源 */
  source: {
    nodeId: string;
    portName?: string;
  };
}

// ==================== Reducer 模式 ====================

/**
 * 记忆 Reducer（原子性合并变更）
 */
export type MemoryReducer<T extends IMemoryChunk[]> = (
  prev: T,
  changes: IMemoryChange[]
) => T;

/**
 * Reducer 配置
 */
export interface IMemoryReducers {
  context: MemoryReducer<IMemoryChunk[]>;
  execution: MemoryReducer<IMemoryChunk[]>;
  working: MemoryReducer<IMemoryChunk[]>;
  knowledge: MemoryReducer<IMemoryChunk[]>;
}

/**
 * 默认 Reducer 实现
 */
export const defaultReducers: IMemoryReducers = {
  context: (prev, changes) => {
    const result = [...prev];
    for (const change of changes) {
      if (change.memoryType !== 'context') continue;
      if (change.type === 'add') {
        result.push(change.payload as IMemoryChunk);
      } else if (change.type === 'update') {
        const idx = result.findIndex(c => c.id === (change.payload as IMemoryChunk).id);
        if (idx >= 0) result[idx] = change.payload as IMemoryChunk;
      } else if (change.type === 'delete') {
        const idx = result.findIndex(c => c.id === (change.payload as { id: string }).id);
        if (idx >= 0) result.splice(idx, 1);
      }
    }
    return result;
  },

  execution: (prev, changes) => {
    // 执行结果通常是追加
    const result = [...prev];
    for (const change of changes) {
      if (change.memoryType !== 'execution') continue;
      if (change.type === 'add') {
        result.push(change.payload as IMemoryChunk);
      }
    }
    return result;
  },

  working: (prev, changes) => {
    // 工作记忆通常是覆盖更新
    const result = [...prev];
    for (const change of changes) {
      if (change.memoryType !== 'working') continue;
      if (change.type === 'add' || change.type === 'update') {
        const existing = result.findIndex(c => c.id === (change.payload as IMemoryChunk).id);
        if (existing >= 0) {
          result[existing] = change.payload as IMemoryChunk;
        } else {
          result.push(change.payload as IMemoryChunk);
        }
      }
    }
    return result;
  },

  knowledge: (prev, changes) => {
    // 知识记忆需要合并，避免重复
    const result = [...prev];
    for (const change of changes) {
      if (change.memoryType !== 'knowledge') continue;
      if (change.type === 'add') {
        const chunk = change.payload as IMemoryChunk;
        // 检查是否已存在相似知识
        const similar = result.findIndex(k =>
          JSON.stringify(k.content) === JSON.stringify(chunk.content)
        );
        if (similar < 0) {
          result.push(chunk);
        }
      }
    }
    return result;
  }
};

// ==================== 检查点 ====================

/**
 * 检查点触发类型
 */
export type CheckpointTrigger =
  | 'node_complete'     // 节点完成后
  | 'edge_eval'         // 条件边评估前
  | 'pause'             // 工作流暂停
  | 'error'             // 错误发生
  | 'manual';           // 手动创建

/**
 * 检查点
 */
export interface ICheckpoint {
  /** 检查点ID */
  id: string;

  /** 创建时间 */
  timestamp: Date;

  /** 触发原因 */
  trigger: CheckpointTrigger;

  /** 完整状态快照 */
  snapshot: IMemorySnapshot;

  /** 执行位置 */
  position: {
    completedNode: string;
    nextNodes: string[];
    pendingEdges: string[];
  };

  /** 元数据 */
  metadata: {
    executionTime: number;
    tokensUsed: number;
    nodeName: string;
  };
}

// ==================== 端口记忆声明 ====================

/**
 * 端口记忆需求声明
 */
export interface IPortMemoryDeclaration {
  /** 需要的记忆类型 */
  needs?: {
    type: MemoryType;
    /** 条件匹配（类似 Claude Code paths） */
    filter?: {
      sourceNode?: string[];
      contentPattern?: string;
    };
    /** 是否必需 */
    required: boolean;
  }[];

  /** 产出的记忆 */
  produces?: {
    type: MemoryType;
    /** 产出内容描述 */
    description: string;
  }[];
}

/**
 * 扩展端口定义
 */
export interface IPortWithMemory {
  /** 端口名称 */
  name: string;

  /** 数据类型 */
  dataType: string;

  /** 记忆声明 */
  memory?: IPortMemoryDeclaration;
}

// ==================== 记忆系统接口 ====================

/**
 * 记忆系统主接口
 */
export interface IMemorySystem {
  // ========== 快照操作 ==========

  /** 获取当前快照（不可变） */
  getSnapshot(): IMemorySnapshot;

  /** 获取指定时间点的快照 */
  getSnapshotAt(timestamp: Date): IMemorySnapshot | null;

  // ========== 变更操作 ==========

  /** 应用变更（通过 Reducer） */
  applyChanges(changes: IMemoryChange[]): void;

  /** 批量应用变更（原子性） */
  applyChangesAtomic(changes: IMemoryChange[][]): void;

  // ========== 检查点操作 ==========

  /** 创建检查点 */
  createCheckpoint(trigger: CheckpointTrigger): ICheckpoint;

  /** 恢复到检查点 */
  restoreCheckpoint(checkpointId: string): void;

  /** 获取所有检查点 */
  getCheckpoints(): ICheckpoint[];

  /** 获取检查点 */
  getCheckpoint(id: string): ICheckpoint | null;

  // ========== 节点记忆访问 ==========

  /** 获取节点可访问的记忆 */
  getNodeMemory(nodeId: string, declaration: IPortMemoryDeclaration): IMemoryChunk[];

  /** 写入节点记忆 */
  writeNodeMemory(nodeId: string, chunks: IMemoryChunk[]): IMemoryChange[];

  // ========== 查询操作 ==========

  /** 按类型查询 */
  queryByType(type: MemoryType): IMemoryChunk[];

  /** 按来源查询 */
  queryBySource(nodeId: string): IMemoryChunk[];

  /** 时序查询（借鉴 Zep） */
  queryByTimeRange(start: Date, end: Date): IMemoryChunk[];

  // ========== 自动学习（借鉴 Claude Code Auto Memory） ==========

  /** 记录学习 */
  recordLearning(nodeId: string, pattern: any): void;

  /** 获取学习到的模式 */
  getLearnedPatterns(nodeId: string): any[];
}

// ==================== 节点执行上下文扩展 ====================

/**
 * 扩展的节点上下文（包含记忆访问）
 */
export interface INodeContextWithMemory {
  /** 原有上下文 */
  taskId: string;
  workflowId: string;
  executionId: string;
  node: any;
  definition: any;
  inputs: Record<string, any>;
  config: Record<string, any>;
  logger: any;

  /** 记忆访问接口 */
  memory: {
    /** 读取可用记忆（不可变快照） */
    read(): IMemoryChunk[];

    /** 按类型读取 */
    readByType(type: MemoryType): IMemoryChunk[];

    /** 声明变更（不直接修改） */
    proposeChange(change: IMemoryChange): void;

    /** 批量声明变更 */
    proposeChanges(changes: IMemoryChange[]): void;

    /** 获取当前检查点 */
    getCurrentCheckpoint(): ICheckpoint | null;
  };
}

// ==================== 河网同步系统类型 ====================

/**
 * 角色类型
 */
export type Role = 'dev' | 'qa' | 'doc' | 'design' | 'planner' | 'reviewer' | 'coordinator';

/**
 * 消息优先级
 */
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * 消息类型
 */
export type MessageType =
  | 'decision'           // 决策通知
  | 'dependency'         // 依赖声明
  | 'conflict'           // 冲突告警
  | 'sync-request'       // 同步请求
  | 'sync-response'      // 同步响应
  | 'query'              // 查询请求
  | 'query-response';    // 查询响应

/**
 * 冲突类型
 */
export type ConflictType =
  | 'type-mismatch'        // 类型不匹配
  | 'naming-collision'     // 命名冲突
  | 'dependency-cycle'     // 依赖循环
  | 'resource-conflict'    // 资源冲突
  | 'semantic-conflict';   // 语义冲突

/**
 * 支流配置
 */
export interface BranchConfig {
  id?: string;
  name: string;
  role: Role;
  responsibilities: string[];
  subscribeTo?: string[];
  syncWith?: string[];
}

/**
 * 支流定义
 */
export interface Branch {
  id: string;
  name: string;
  role: Role;
  responsibilities: string[];
  status: 'active' | 'paused' | 'merged' | 'abandoned';
  subscriptions: Set<string>;
  decisions: Decision[];
}

/**
 * 同步点配置
 */
export interface SyncPointConfig {
  id?: string;
  name: string;
  type?: 'decision' | 'milestone' | 'conflict' | 'checkpoint' | 'manual';
  participants: string[];
  trigger: {
    type: 'time-based' | 'event-based' | 'dependency-based' | 'manual';
    condition?: string;
    interval?: number;
  };
}

/**
 * 同步点定义
 */
export interface SyncPoint {
  id: string;
  name: string;
  type: 'decision' | 'milestone' | 'conflict' | 'checkpoint' | 'manual';
  participants: string[];
  trigger: {
    type: 'time-based' | 'event-based' | 'dependency-based' | 'manual';
    condition?: string;
    interval?: number;
  };
  payload: {
    decisions: Decision[];
    dependencies: Dependency[];
    conflicts: Conflict[];
    agreements: Agreement[];
  };
  status: 'pending' | 'syncing' | 'resolved' | 'failed';
  createdAt: Date;
  lastSyncAt?: Date;
}

/**
 * 决策定义
 */
export interface Decision {
  id: string;
  agent: string;
  branch: string;
  topic: string;
  content: any;
  impact: string[];
  timestamp: Date;
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
}

/**
 * 依赖定义
 */
export interface Dependency {
  id: string;
  agent: string;
  branch: string;
  dependsOn: string;
  topic: string;
  required: boolean;
  status: 'pending' | 'satisfied' | 'blocked';
}

/**
 * 冲突定义
 */
export interface Conflict {
  id: string;
  type: ConflictType;
  parties: string[];
  details: any;
  detectedAt: Date;
  status: 'detected' | 'negotiating' | 'resolved' | 'escalated';
  resolution?: ConflictResolution;
}

/**
 * 冲突解决
 */
export interface ConflictResolution {
  strategy: 'negotiate' | 'vote' | 'escalate' | 'auto';
  result: any;
  resolvedBy?: string;
  resolvedAt: Date;
}

/**
 * 共识定义
 */
export interface Agreement {
  id: string;
  syncPointId: string;
  decisions: Decision[];
  reachedAt: Date;
}

/**
 * 支流消息
 */
export interface BranchMessage {
  id: string;
  from: string;
  to: string | 'broadcast';
  topic: string;
  type: MessageType;
  payload: any;
  timestamp: Date;
  priority: Priority;
}

/**
 * 订阅配置
 */
export interface Subscription {
  subscriber: string;
  publisher: string;
  topics: string[];
  filters?: MessageFilter[];
}

/**
 * 消息过滤器
 */
export interface MessageFilter {
  field: string;
  operator: 'eq' | 'ne' | 'in' | 'contains';
  value: any;
}

/**
 * 合并结果
 */
export interface MergeResult {
  success: boolean;
  mergedCount?: number;
  error?: string;
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean;
  conflicts: Conflict[];
  agreement?: Agreement;
  error?: string;
}

/**
 * 依赖状态
 */
export interface DependencyStatus {
  dependency: Dependency;
  status: string;
}

/**
 * 冲突检测选项
 */
export interface ConflictDetectionOptions {
  branches?: string[];
  topics?: string[];
}

/**
 * 河网访问接口
 */
export interface RiverNetworkAccess {
  // ===== 主流操作 =====
  getMainFlow(): MainFlow;
  broadcast(message: Omit<BranchMessage, 'id' | 'timestamp'>): void;

  // ===== 支流操作 =====
  createBranch(config: BranchConfig): Branch;
  getBranch(branchId: string): Branch | undefined;
  listBranches(): Branch[];
  switchToBranch(branchId: string): void;
  mergeBranch(branchId: string): MergeResult;
  abandonBranch(branchId: string, reason: string): void;

  // ===== 同步点操作 =====
  createSyncPoint(config: SyncPointConfig): SyncPoint;
  getSyncPoint(syncPointId: string): SyncPoint | undefined;
  joinSyncPoint(syncPointId: string, branchId: string): void;
  triggerSync(syncPointId: string): Promise<SyncResult>;
  getRelatedSyncPoints(branchId: string): SyncPoint[];

  // ===== 决策与依赖 =====
  publishDecision(branchId: string, decision: Omit<Decision, 'id' | 'timestamp'>): Decision;
  declareDependency(branchId: string, dependency: Omit<Dependency, 'id'>): Dependency;
  checkDependencies(branchId: string): DependencyStatus[];

  // ===== 冲突管理 =====
  detectConflicts(options?: ConflictDetectionOptions): Conflict[];
  resolveConflict(conflictId: string, resolution: ConflictResolution): void;
  getUnresolvedConflicts(): Conflict[];

  // ===== 订阅与消息 =====
  subscribe(subscription: Subscription): void;
  unsubscribe(subscriber: string, publisher: string): void;
  sendMessage(message: Omit<BranchMessage, 'id' | 'timestamp'>): void;
  onMessage(branchId: string, callback: (msg: BranchMessage) => void): void;
  query(branchId: string, targetBranch: string, topic: string, query: any): Promise<any>;
}

/**
 * 主流接口
 */
export interface MainFlow {
  addMemory(memory: any): void;
  getMemories(): any[];
  broadcast(message: string): void;
}

// ==================== 导出 ====================

export const MemorySystemTypes = {
  MemoryType: {} as MemoryType,
  MemoryLevel: {} as MemoryLevel,
  CheckpointTrigger: {} as CheckpointTrigger,
  ConflictType: {} as ConflictType,
  MessageType: {} as MessageType,
  Role: {} as Role,
  Priority: {} as Priority,
};
