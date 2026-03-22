# AgentGraph 多智能体记忆机制设计

> 基于 Claude Flow 研究成果，为 AgentGraph 设计完整的多节点记忆互通机制

---

## 一、设计决策概览

### 1.1 核心设计原则

| 原则 | 来源 | 实现 |
|------|------|------|
| **No files, no mail** | Claude Flow | 记忆存储在外部持久化层，避免上下文窗口限制 |
| **Hive-mind 协调** | Claude Flow | Queen-led 分层协调 + 共享记忆空间 |
| **三层作用域** | Claude Flow | project/local/user 隔离 + 跨智能体知识传递 |
| **智能路由** | SONA/EWC++ | 基于历史成功率的模式学习路由 |

### 1.2 架构决策

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AgentGraph 多智能体记忆架构                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Queen Coordinator                            │   │
│  │  (分层协调 + 记忆验证 + 目标漂移控制)                              │   │
│  │  类型: strategic / tactical / adaptive                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│          ┌─────────────────────┼─────────────────────┐                 │
│          ▼                     ▼                     ▼                 │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐           │
│  │   Worker A   │    │   Worker B   │    │   Worker C   │           │
│  │  (Researcher) │    │   (Coder)    │    │   (Tester)   │           │
│  └───────┬───────┘    └───────┬───────┘    └───────┬───────┘           │
│          │                    │                    │                     │
│          └────────────────────┼────────────────────┘                     │
│                               ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       Memory Pool (SQLite)                      │   │
│  │                                                                 │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │  Project Scope      │  Local Scope      │  User Scope   │ │   │
│  │  ├────────────────────────────────────────────────────────┤ │   │
│  │  │ knowledge memory   │ context memory    │ user context  │ │   │
│  │  │ consensus memory   │ task memory       │ preferences    │ │   │
│  │  │ error patterns     │ working memory    │ history        │ │   │
│  │  │ system patterns    │                  │                │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  索引: HNSW 向量搜索 (150x-12,500x 加速)                        │   │
│  │  持久化: SQLite WAL + LRU 缓存                                  │   │
│  │  学习: SONA + EWC++ (防止灾难性遗忘)                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、记忆类型体系

### 2.1 八种记忆类型（Claude Flow 设计）

```typescript
/**
 * 记忆类型枚举
 */
export enum MemoryType {
  /** 知识记忆 - 持久化的经验和模式 */
  KNOWLEDGE = 'knowledge',

  /** 上下文记忆 - 任务理解、决策依据 */
  CONTEXT = 'context',

  /** 任务记忆 - 具体任务相关的数据 */
  TASK = 'task',

  /** 错误记忆 - 失败模式和解决方案 */
  ERROR = 'error',

  /** 指标记忆 - 性能指标和统计数据 */
  METRIC = 'metric',

  /** 共识记忆 - 团队达成的共识决策 */
  CONSENSUS = 'consensus',

  /** 系统记忆 - 系统级配置和规则 */
  SYSTEM = 'system',

  /** 工作记忆 - 临时状态和中间变量 */
  WORKING = 'working',
}
```

### 2.2 记忆元数据

```typescript
/**
 * 记忆块元数据
 */
export interface MemoryMetadata {
  /** 创建时间 */
  createdAt: Date;

  /** 最后访问时间 */
  lastAccessedAt: Date;

  /** Token 数量 */
  tokenCount: number;

  /** 字节大小 */
  byteSize: number;

  /** 重要性评分 (0-1) */
  importance: number;

  /** 访问频率 */
  accessCount: number;

  /** 来源节点 */
  sourceNodeId: string;

  /** 关联任务 */
  taskId?: string;

  /** 过期时间 */
  expiresAt?: Date;

  /** 标签 */
  tags?: string[];

  /** 向量嵌入（用于语义搜索） */
  embedding?: number[];
}
```

---

## 三、记忆作用域隔离

### 3.1 三层作用域设计

```typescript
/**
 * 记忆作用域
 */
export enum MemoryScope {
  /** 项目级 - 跨工作流共享的知识和模式 */
  PROJECT = 'project',

  /** 本地级 - 单个工作流内的上下文 */
  LOCAL = 'local',

  /** 用户级 - 用户偏好和历史 */
  USER = 'user',
}

/**
 * 作用域权限矩阵
 */
export const SCOPE_PERMISSIONS: Record<MemoryScope, {
  canWrite: MemoryScope[];
  canRead: MemoryScope[];
  defaultTTL: number; // 毫秒
}> = {
  [MemoryScope.PROJECT]: {
    canWrite: [MemoryScope.PROJECT],      // Queen 可以写入
    canRead: [MemoryScope.PROJECT, MemoryScope.LOCAL, MemoryScope.USER],
    defaultTTL: Infinity,                  // 永久
  },
  [MemoryScope.LOCAL]: {
    canWrite: [MemoryScope.LOCAL, MemoryScope.PROJECT], // Worker 写入本地，Queen 可读取
    canRead: [MemoryScope.LOCAL, MemoryScope.PROJECT],
    defaultTTL: 24 * 60 * 60 * 1000,        // 24 小时
  },
  [MemoryScope.USER]: {
    canWrite: [MemoryScope.USER],
    canRead: [MemoryScope.USER],
    defaultTTL: 30 * 24 * 60 * 60 * 1000,   // 30 天
  },
};
```

### 3.2 作用域存储结构

```typescript
/**
 * 记忆存储键
 */
export interface MemoryKey {
  scope: MemoryScope;
  type: MemoryType;
  id: string;
  workflowId?: string;  // LOCAL scope 需要
  userId?: string;       // USER scope 需要
}

/**
 * 记忆存储接口
 */
export interface IMemoryStorage {
  /**
   * 写入记忆
   */
  write(key: MemoryKey, data: any, metadata: Partial<MemoryMetadata>): Promise<string>;

  /**
   * 读取记忆
   */
  read(key: MemoryKey): Promise<MemoryChunk | null>;

  /**
   * 搜索记忆（HNSW 向量搜索）
   */
  search(
    query: string | number[],
    scope: MemoryScope,
    types?: MemoryType[],
    limit?: number
  ): Promise<MemoryChunk[]>;

  /**
   * 删除记忆
   */
  delete(key: MemoryKey): Promise<boolean>;

  /**
   * 清理过期记忆
   */
  cleanup(): Promise<number>;
}
```

---

## 四、Hive-mind 协调机制

### 4.1 Queen 类型

```typescript
/**
 * Queen 类型
 */
export enum QueenType {
  /** 战略 Queen - 负责整体规划和方向 */
  STRATEGIC = 'strategic',

  /** 战术 Queen - 负责任务分配和协调 */
  TACTICAL = 'tactical',

  /** 自适应 Queen - 负责动态调整和优化 */
  ADAPTIVE = 'adaptive',
}

/**
 * Queen 配置
 */
export interface QueenConfig {
  type: QueenType;
  maxWorkers: number;      // 默认 6-8
  checkpointInterval: number; // 默认 5 分钟
  driftThreshold: number;  // 默认 0.3
}

/**
 * Queen 协调器接口
 */
export interface IQueenCoordinator {
  /**
   * 验证节点输出（通过共识算法）
   */
  validateOutput(
    nodeId: string,
    output: any,
    memoryContext: IMemoryContext
  ): Promise<ValidationResult>;

  /**
   * 分配记忆给 Worker
   */
  allocateMemory(
    workerId: string,
    requirements: MemoryRequirement[]
  ): Promise<IMemoryAllocation>;

  /**
   * 检测目标漂移
   */
  detectDrift(
    current: IWorkflowState,
    expected: IWorkflowState
  ): DriftAnalysis;

  /**
   * 创建检查点
   */
  createCheckpoint(workflowId: string): Promise<Checkpoint>;

  /**
   * 回滚到检查点
   */
  rollback(workflowId: string, checkpointId: string): Promise<boolean>;
}
```

### 4.2 共识算法

```typescript
/**
 * 共识算法类型
 */
export enum ConsensusType {
  /** 多数投票 */
  MAJORITY = 'majority',

  /** 加权投票（Queen 权重 3x） */
  WEIGHTED = 'weighted',

  /** 拜占庭容错 (f < n/3) */
  BYZANTINE = 'byzantine',
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否通过 */
  approved: boolean;

  /** 共识类型 */
  consensusType: ConsensusType;

  /** 投票详情 */
  votes: VoteDetail[];

  /** 共识记忆键 */
  consensusMemoryKey?: string;
}

/**
 * 投票详情
 */
export interface VoteDetail {
  nodeId: string;
  approved: boolean;
  weight: number;
  comment?: string;
}
```

---

## 五、节点记忆端口系统

### 5.1 端口定义

```typescript
/**
 * 记忆需求声明
 */
export interface MemoryPort {
  /** 端口名称 */
  name: string;

  /** 记忆类型 */
  type: MemoryType;

  /** 是否必需 */
  required: boolean;

  /** 作用域 */
  scope: MemoryScope;

  /** 最小 Token 数 */
  minTokens?: number;

  /** 最大 Token 数 */
  maxTokens?: number;

  /** 描述 */
  description?: { en: string; zh: string };

  /** 过滤条件 */
  filter?: {
    tags?: string[];
    sourceNodes?: string[];
    minImportance?: number;
  };
}

/**
 * 扩展的节点定义
 */
export interface INodeWithMemory extends INode {
  /** 输入记忆端口 */
  memoryInputs: MemoryPort[];

  /** 输出记忆端口 */
  memoryOutputs: MemoryPort[];

  /** 记忆产出预估 */
  estimatedMemoryOutput?: {
    type: MemoryType;
    estimatedTokens: number;
    scope: MemoryScope;
  }[];
}
```

### 5.2 边作为记忆通道

```typescript
/**
 * 记忆通道（边）
 */
export interface IMemoryChannel extends WorkflowEdge {
  /** 记忆传递策略 */
  memoryPolicy: IMemoryPolicy;

  /** 运行时状态 */
  memoryState?: {
    currentFlow: IMemoryFlowMetrics;
    totalTransferred: {
      bytes: number;
      tokens: number;
      chunks: number;
    };
    lastTransferAt?: Date;
  };
}

/**
 * 记忆传递策略
 */
export interface IMemoryPolicy {
  /** 传递的记忆类型 */
  types: MemoryType[];

  /** 过滤规则 */
  filter?: {
    include?: string[];
    exclude?: string[];
    minImportance?: number;
  };

  /** 转换规则 */
  transform?: {
    mapping?: Record<string, string>;
    aggregate?: 'last' | 'all' | 'merge';
  };

  /** 流量控制 */
  flowControl?: {
    maxBytes?: number;
    maxTokens?: number;
    truncation?: 'head' | 'tail' | 'summarize';
    priority?: string[];
  };
}

/**
 * 记忆流通量指标
 */
export interface IMemoryFlowMetrics {
  bytes: number;
  tokens: number;
  chunks: number;
  types: Record<MemoryType, number>;
  compressionRatio: number;
  relevanceScore: number;
  visualWeight: number;
  color: string;
  animationSpeed: number;
}
```

---

## 六、智能路由与学习系统

### 6.1 SONA 路由

```typescript
/**
 * SONA (Self-Optimizing Neural Architecture) 路由器
 */
export interface ISONARouter {
  /**
   * 根据任务特征选择最优节点
   */
  selectOptimalNodes(
    taskFeatures: TaskFeatures,
    availableNodes: INode[]
  ): Promise<NodeRoutingDecision[]>;

  /**
   * 记录执行结果用于学习
   */
  recordExecution(
    nodeId: string,
    success: boolean,
    metrics: NodeMetrics
  ): Promise<void>;

  /**
   * 获取节点历史成功率
   */
  getSuccessRate(nodeId: string, taskType?: string): Promise<number>;
}

/**
 * 节点路由决策
 */
export interface NodeRoutingDecision {
  nodeId: string;
  confidence: number;
  reason: string;
  expectedPerformance: {
    accuracy: number;
    speed: number;
    tokenEfficiency: number;
  };
}
```

### 6.2 EWC++ 防遗忘

```typescript
/**
 * EWC++ (Elastic Weight Consolidation) 防止灾难性遗忘
 */
export interface IEWCManager {
  /**
   * 计算参数重要性权重
   */
  computeImportanceWeights(
    oldPatterns: Pattern[],
    newPatterns: Pattern[]
  ): Map<string, number>;

  /**
   * 应用 EWC 惩罚项
   */
  applyEWCPenalty(
    loss: number,
    weights: Map<string, number>,
    parameters: Map<string, number>
  ): number;

  /**
   * 合并新旧知识
   */
  consolidateKnowledge(
    existing: KnowledgeBase,
    new: KnowledgeBase
  ): Promise<KnowledgeBase>;
}
```

### 6.3 HNSW 向量搜索

```typescript
/**
 * HNSW 向量搜索接口
 */
export interface IHNSWIndex {
  /**
   * 添加向量
   */
  add(id: string, vector: number[], metadata: any): Promise<void>;

  /**
   * KNN 搜索
   */
  search(
    query: number[],
    k: number,
    ef?: number  // 搜索宽度参数
  ): Promise<SearchResult[]>;

  /**
   * 删除向量
   */
  remove(id: string): Promise<boolean>;

  /**
   * 索引统计
   */
  stats(): IndexStats;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  id: string;
  distance: number;
  score: number;
  metadata: any;
}

/**
 * 索引统计
 */
export interface IndexStats {
  totalVectors: number;
  dimension: number;
  efConstruction: number;
  maxM: number;
}
```

---

## 七、实现示例

### 7.1 记忆块定义

```typescript
/**
 * 记忆块
 */
export interface MemoryChunk {
  /** 块 ID */
  id: string;

  /** 记忆类型 */
  type: MemoryType;

  /** 作用域 */
  scope: MemoryScope;

  /** 内容 */
  content: any;

  /** 元数据 */
  metadata: MemoryMetadata;

  /** 摘要（用于传递） */
  summary?: string;

  /** 关键词（用于搜索） */
  keywords?: string[];
}

/**
 * 记忆分配结果
 */
export interface IMemoryAllocation {
  /** 节点 ID */
  nodeId: string;

  /** 已分配的记忆 */
  allocated: Map<MemoryType, MemoryChunk[]>;

  /** 缺失的记忆 */
  missing: MemoryRequirement[];

  /** 警告信息 */
  warnings: string[];
}
```

### 7.2 记忆池实现

```typescript
/**
 * 记忆池 - 管理工作流中的所有可用记忆
 */
export class MemoryPool implements IMemoryStorage {
  private storage: Map<string, MemoryChunk>;
  private hnswIndex: IHNSWIndex;
  private lruCache: LRUCache<string, MemoryChunk>;
  private sqliteDB: SQLiteDatabase;

  constructor(config: MemoryPoolConfig) {
    this.storage = new Map();
    this.lruCache = new LRUCache(config.cacheSize);
    this.hnswIndex = new HNSWIndex(config.hnswParams);
    this.sqliteDB = new SQLiteDatabase(config.dbPath);
  }

  /**
   * 写入记忆
   */
  async write(
    key: MemoryKey,
    data: any,
    metadata: Partial<MemoryMetadata>
  ): Promise<string> {
    const id = this.generateKey(key);
    const now = new Date();

    const chunk: MemoryChunk = {
      id,
      type: key.type,
      scope: key.scope,
      content: data,
      metadata: {
        createdAt: now,
        lastAccessedAt: now,
        tokenCount: metadata.tokenCount || this.estimateTokens(data),
        byteSize: metadata.byteSize || this.estimateBytes(data),
        importance: metadata.importance ?? 0.5,
        accessCount: 0,
        sourceNodeId: metadata.sourceNodeId,
        taskId: key.workflowId,
        tags: metadata.tags,
        ...metadata,
      },
    };

    // 生成摘要
    chunk.summary = await this.generateSummary(chunk);

    // 计算向量嵌入
    if (this.shouldIndex(chunk)) {
      chunk.metadata.embedding = await this.computeEmbedding(chunk.content);
      await this.hnswIndex.add(id, chunk.metadata.embedding, {
        type: chunk.type,
        scope: chunk.scope,
        keywords: chunk.keywords,
      });
    }

    // 存储到 SQLite
    await this.sqliteDB.insert('memory_chunks', chunk);

    // 更新缓存
    this.lruCache.put(id, chunk);

    return id;
  }

  /**
   * 读取记忆
   */
  async read(key: MemoryKey): Promise<MemoryChunk | null> {
    const id = this.generateKey(key);

    // 先查缓存
    const cached = this.lruCache.get(id);
    if (cached) {
      cached.metadata.lastAccessedAt = new Date();
      cached.metadata.accessCount++;
      return cached;
    }

    // 查数据库
    const chunk = await this.sqliteDB.findOne('memory_chunks', { id });
    if (chunk) {
      chunk.metadata.lastAccessedAt = new Date();
      chunk.metadata.accessCount++;
      this.lruCache.put(id, chunk);
    }

    return chunk;
  }

  /**
   * 搜索记忆
   */
  async search(
    query: string | number[],
    scope: MemoryScope,
    types: MemoryType[] = [],
    limit: number = 10
  ): Promise<MemoryChunk[]> {
    let queryVector: number[];

    if (typeof query === 'string') {
      queryVector = await this.computeEmbedding(query);
    } else {
      queryVector = query;
    }

    const results = await this.hnswIndex.search(queryVector, limit * 2);

    // 过滤作用域和类型
    const filtered = results
      .filter(r => r.metadata.scope === scope)
      .filter(r => types.length === 0 || types.includes(r.metadata.type))
      .slice(0, limit);

    // 获取完整内容
    return Promise.all(
      filtered.map(r => this.read({ ...this.parseKey(r.id), scope }))
    );
  }

  /**
   * 清理过期记忆
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    const expired = await this.sqliteDB.findMany('memory_chunks', {
      $where: { expiresAt: { $lt: now } },
    });

    for (const chunk of expired) {
      await this.delete({ ...this.parseKey(chunk.id), scope: chunk.scope });
    }

    return expired.length;
  }
}
```

### 7.3 节点执行上下文扩展

```typescript
/**
 * 扩展的节点执行上下文
 */
export interface INodeContextWithMemory extends NodeContext {
  /** 记忆系统 */
  memory: IMemorySystem;

  /** 记忆分配结果 */
  memoryAllocation: IMemoryAllocation;

  /** 记忆操作接口 */
  memoryOps: {
    /** 读取记忆 */
    read: (type: MemoryType, scope?: MemoryScope) => Promise<MemoryChunk[]>;

    /** 写入记忆 */
    write: (type: MemoryType, content: any, scope?: MemoryScope, metadata?: Partial<MemoryMetadata>) => Promise<string>;

    /** 搜索记忆 */
    search: (query: string, scope?: MemoryScope, types?: MemoryType[]) => Promise<MemoryChunk[]>;

    /** 更新记忆 */
    update: (chunkId: string, updates: Partial<MemoryChunk>) => Promise<boolean>;

    /** 删除记忆 */
    delete: (chunkId: string) => Promise<boolean>;
  };
}
```

---

## 八、图形界面体现

### 8.1 边的视觉状态

```typescript
/**
 * 边的视觉状态
 */
export enum EdgeVisualState {
  /** 静止 - 无记忆流通 */
  IDLE = 'idle',

  /** 流通 - 记忆正在传递 */
  FLOWING = 'flowing',

  /** 高流量 - 大量记忆 */
  HIGH_FLOW = 'high_flow',

  /** 阻塞 - 记忆传递受限 */
  BLOCKED = 'blocked',
}

/**
 * 边样式计算器
 */
export class EdgeStyleCalculator {
  /**
   * 计算边的样式
   */
  static calculateStyle(metrics: IMemoryFlowMetrics): EdgeStyle {
    const state = this.determineState(metrics);
    const baseStyle: EdgeStyle = {
      strokeWidth: Math.min(5, 1 + metrics.visualWeight * 0.5),
      strokeColor: this.getColorByType(metrics.types),
      animated: state !== EdgeVisualState.IDLE,
    };

    switch (state) {
      case EdgeVisualState.FLOWING:
        return {
          ...baseStyle,
          strokeDasharray: undefined,
        };

      case EdgeVisualState.HIGH_FLOW:
        return {
          ...baseStyle,
          strokeWidth: baseStyle.strokeWidth * 1.5,
          strokeColor: '#3b82f6', // 蓝色
        };

      case EdgeVisualState.BLOCKED:
        return {
          ...baseStyle,
          strokeDasharray: '5,5',
          strokeColor: '#f59e0b', // 橙色
        };

      default:
        return {
          ...baseStyle,
          strokeDasharray: '3,3',
          strokeColor: '#9ca3af', // 灰色
          animated: false,
        };
    }
  }

  /**
   * 根据记忆类型确定颜色
   */
  private static getColorByType(types: Record<MemoryType, number>): string {
    const dominantType = Object.entries(types).sort((a, b) => b[1] - a[1])[0][0] as MemoryType;

    const colorMap: Record<MemoryType, string> = {
      [MemoryType.KNOWLEDGE]: '#fbbf24', // 金色
      [MemoryType.CONTEXT]: '#8b5cf6',  // 紫色
      [MemoryType.TASK]: '#3b82f6',     // 蓝色
      [MemoryType.ERROR]: '#ef4444',    // 红色
      [MemoryType.METRIC]: '#10b981',    // 绿色
      [MemoryType.CONSENSUS]: '#f59e0b'], // 橙色
      [MemoryType.SYSTEM]: '#6b7280',    // 灰色
      [MemoryType.WORKING]: '#22c55e'],  // 绿色
    };

    return colorMap[dominantType] || '#6b7280';
  }

  /**
   * 确定边的状态
   */
  private static determineState(metrics: IMemoryFlowMetrics): EdgeVisualState {
    if (metrics.tokens === 0) {
      return EdgeVisualState.IDLE;
    }
    if (metrics.tokens > 10000) {
      return EdgeVisualState.HIGH_FLOW;
    }
    if (metrics.relevanceScore < 0.3) {
      return EdgeVisualState.BLOCKED;
    }
    return EdgeVisualState.FLOWING;
  }
}
```

### 8.2 节点记忆面板

```typescript
/**
 * 节点记忆面板数据
 */
export interface NodeMemoryPanelData {
  nodeId: string;

  /** 输入记忆状态 */
  inputMemory: {
    type: MemoryType;
    status: 'present' | 'missing' | 'warning';
    amount: number;
    sources: string[];
  }[];

  /** 输出记忆预估 */
  outputMemory: {
    type: MemoryType;
    estimatedAmount: number;
    scope: MemoryScope;
  }[];

  /** 记忆使用量 */
  memoryUsage: {
    used: number;
    max: number;
    percentage: number;
  };
}
```

---

## 九、配置与默认值

### 9.1 系统默认配置

```typescript
/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  // Queen 配置
  queen: {
    maxWorkers: 8,
    checkpointInterval: 5 * 60 * 1000,  // 5 分钟
    driftThreshold: 0.3,
  },

  // 记忆池配置
  memoryPool: {
    cacheSize: 1000,
    hnswParams: {
      dimension: 1536,
      efConstruction: 200,
      maxM: 16,
    },
    dbPath: './data/memory.db',
  },

  // 记忆默认 TTL
  ttl: {
    [MemoryType.KNOWLEDGE]: Infinity,
    [MemoryType.CONTEXT]: 24 * 60 * 60 * 1000,
    [MemoryType.TASK]: 60 * 60 * 1000,
    [MemoryType.ERROR]: 30 * 24 * 60 * 60 * 1000,
    [MemoryType.METRIC]: 7 * 24 * 60 * 60 * 1000,
    [MemoryType.CONSENSUS]: 30 * 24 * 60 * 60 * 1000,
    [MemoryType.SYSTEM]: Infinity,
    [MemoryType.WORKING]: 60 * 60 * 1000,
  },

  // 路由配置
  routing: {
    minConfidence: 0.7,
    maxRetries: 3,
    learningRate: 0.01,
  },

  // 流量控制
  flowControl: {
    defaultMaxTokens: 8000,
    defaultMaxBytes: 64 * 1024,
    truncationStrategy: 'summarize',
  },
};
```

### 9.2 节点默认记忆端口

```typescript
/**
 * 各类节点的默认记忆端口
 */
export const DEFAULT_MEMORY_PORTS: Record<string, {
  inputs: MemoryPort[];
  outputs: MemoryPort[];
}> = {
  'input/receive': {
    inputs: [],
    outputs: [
      {
        name: 'task_context',
        type: MemoryType.TASK,
        required: true,
        scope: MemoryScope.LOCAL,
        minTokens: 100,
      },
    ],
  },
  'input/understand': {
    inputs: [
      {
        name: 'task',
        type: MemoryType.TASK,
        required: true,
        scope: MemoryScope.LOCAL,
      },
    ],
    outputs: [
      {
        name: 'context',
        type: MemoryType.CONTEXT,
        required: true,
        scope: MemoryScope.LOCAL,
      },
    ],
  },
  'execution/code': {
    inputs: [
      {
        name: 'context',
        type: MemoryType.CONTEXT,
        required: true,
        scope: MemoryScope.LOCAL,
      },
      {
        name: 'knowledge',
        type: MemoryType.KNOWLEDGE,
        required: false,
        scope: MemoryScope.PROJECT,
      },
    ],
    outputs: [
      {
        name: 'result',
        type: MemoryType.TASK,
        required: true,
        scope: MemoryScope.LOCAL,
      },
    ],
  },
  'review/validate': {
    inputs: [
      {
        name: 'result',
        type: MemoryType.TASK,
        required: true,
        scope: MemoryScope.LOCAL,
      },
      {
        name: 'context',
        type: MemoryType.CONTEXT,
        required: true,
        scope: MemoryScope.LOCAL,
      },
    ],
    outputs: [
      {
        name: 'consensus',
        type: MemoryType.CONSENSUS,
        required: true,
        scope: MemoryScope.PROJECT,
      },
    ],
  },
};
```

---

## 十、使用示例

### 10.1 创建带记忆的工作流

```typescript
import { MemoryPool, MemoryType, MemoryScope } from './memory';

// 创建记忆池
const memoryPool = new MemoryPool({
  cacheSize: 1000,
  hnswParams: { dimension: 1536, efConstruction: 200, maxM: 16 },
  dbPath: './data/memory.db',
});

// 初始化知识记忆
await memoryPool.write(
  {
    scope: MemoryScope.PROJECT,
    type: MemoryType.KNOWLEDGE,
    id: 'code_patterns',
  },
  {
    patterns: [
      {
        name: 'error_handling_pattern',
        code: 'try { ... } catch (e) { ... }',
        description: 'Standard error handling pattern',
      },
    ],
  },
  {
    importance: 0.9,
    tags: ['code', 'patterns', 'best_practices'],
  }
);

// 节点执行时读取记忆
async function executeNode(
  nodeId: string,
  requirements: MemoryPort[]
) {
  // 分配记忆
  const allocation = await queenCoordinator.allocateMemory(
    nodeId,
    requirements
  );

  // 执行节点
  const result = await nodeExecutor.execute({
    ...context,
    memoryOps: {
      read: (type, scope) => memoryPool.read({ scope: scope ?? MemoryScope.LOCAL, type, id: nodeId }),
      write: (type, content, scope, metadata) => memoryPool.write(
        { scope: scope ?? MemoryScope.LOCAL, type, id: nodeId },
        content,
        { sourceNodeId: nodeId, ...metadata }
      ),
      search: (query, scope, types) => memoryPool.search(query, scope ?? MemoryScope.LOCAL, types),
    },
  });

  return result;
}
```

### 10.2 记忆流通配置

```typescript
import { IMemoryChannel, MemoryType } from './types';

// 创建记忆通道
const memoryChannel: IMemoryChannel = {
  id: 'edge_understand_to_code',
  source: 'node_understand',
  target: 'node_code',
  sourceHandle: 'output_context',
  targetHandle: 'input_context',
  memoryPolicy: {
    types: [MemoryType.CONTEXT, MemoryType.KNOWLEDGE],
    filter: {
      minImportance: 0.5,
      tags: ['code', 'task'],
    },
    flowControl: {
      maxTokens: 4000,
      truncation: 'summarize',
    },
  },
};

// 更新边配置
workflowStore.updateEdge(edgeId, {
  data: {
    ...edge.data,
    memoryPolicy: memoryChannel.memoryPolicy,
  },
});
```

---

## 十一、总结

### 11.1 核心设计原则

1. **No files, no mail**: 记忆存储在外部持久化层，避免上下文窗口限制
2. **Hive-mind 协调**: Queen-led 分层协调 + 共享记忆空间
3. **三层作用域**: project/local/user 隔离 + 跨智能体知识传递
4. **类型化记忆**: 八种记忆类型，每种有不同的特性和用途
5. **智能路由**: SONA + EWC++ 基于历史成功率学习最优路由
6. **可视化反馈**: 记忆流通在界面上有直观的视觉体现
7. **防遗忘**: EWC++ 防止学习新模式时遗忘旧模式
8. **高效搜索**: HNSW 向量搜索提供 150x-12,500x 加速

### 11.2 与现有系统集成

| 组件 | 集成方式 |
|------|----------|
| `WorkflowState` | 添加 `memoryPool: IMemoryPool` |
| `NodeContext` | 扩展为 `INodeContextWithMemory` |
| `BaseNodeExecutor` | 添加 `memoryOps` 访问方法 |
| `WorkflowEdge` | 扩展为 `IMemoryChannel` |
| `WorkflowStore` | 添加记忆相关的 actions |

### 11.3 实现优先级

1. **Phase 1**: 基础记忆类型和存储接口
2. **Phase 2**: 三层作用域隔离和 SQLite 持久化
3. **Phase 3**: Queen 协调器和共识算法
4. **Phase 4**: 记忆通道和边配置
5. **Phase 5**: HNSW 向量搜索
6. **Phase 6**: SONA 智能路由和 EWC++ 防遗忘
7. **Phase 7**: 可视化界面完善

---

*文档版本: 1.0.0*
*最后更新: 2026-03-07*
