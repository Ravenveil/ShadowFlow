# AgentGraph 记忆互通设计

> 记忆是工作流中节点之间传递的上下文和数据，是智能体协作的核心。

---

## 〇、最终设计方案

### 核心设计原则

借鉴 Claude Code、Claude Flow、Mem0、Zep、Letta/MemGPT、LangGraph 等系统的精华：

| 来源 | 借鉴内容 |
|------|----------|
| **Claude Code** | 分级记忆、条件规则、Auto Memory |
| **Claude Flow** | 内存协调、Hive-mind共享 |
| **Mem0** | 自改进引擎、冲突解决 |
| **Zep** | 时序知识图谱、实体关系 |
| **Letta/MemGPT** | 分层虚拟记忆、自主管理 |
| **LangGraph** | 不可变快照、Reducer、检查点 |

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                  AgentGraph 记忆系统                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: 工作流级记忆（类似CLAUDE.md）                       │
│  ├── workflow.md: 项目架构、全局规则                         │
│  └── 条件规则: 按节点类型匹配加载                            │
│                                                             │
│  Layer 2: 节点级记忆（端口声明）                              │
│  ├── needs: 节点声明需要什么记忆                             │
│  └── produces: 节点产出什么记忆                              │
│                                                             │
│  Layer 3: 运行时记忆池（不可变快照 + Reducer）                │
│  ├── context: 上下文记忆                                     │
│  ├── execution: 执行结果                                     │
│  ├── working: 工作记忆                                       │
│  └── knowledge: 知识记忆                                     │
│                                                             │
│  Layer 4: 检查点持久化                                       │
│  ├── 节点完成后自动创建                                      │
│  ├── 支持恢复和时间旅行调试                                  │
│  └── 记录完整状态快照 + 执行位置                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键机制：不可变快照 + Reducer（借鉴 LangGraph）

```
┌─────────┐     读取快照      ┌─────────┐
│ Node A  │ ◀──────────────── │  状态   │
└─────────┘                   │ (不可变) │
     │                        └─────────┘
     ▼ 返回changeA                 │
┌─────────┐                        ▼
│ changeA │                   ┌─────────┐
└─────────┘                   │ Reducer │ ◀── 原子性合并
                              └─────────┘
┌─────────┐     读取快照            │
│ Node B  │ ◀────────────────      ▼
└─────────┘                   ┌─────────┐
     │                        │ 新状态   │
     ▼ 返回changeB            └─────────┘
┌─────────┐
│ changeB │
└─────────┘
```

**优点**：
- ✅ 并行节点无竞态条件
- ✅ 可恢复执行
- ✅ 时间旅行调试
- ✅ 审计追踪

---

## 一、核心概念

### 1.1 记忆的本质

在工作流中，"记忆"是节点之间传递的信息载体：

```
┌──────────┐    记忆流（边）    ┌──────────┐
│  节点 A  │ ─────────────────▶ │  节点 B  │
└──────────┘                    └──────────┘
     │                               │
     ▼                               ▼
  [输出记忆]                      [输入记忆]
```

### 1.2 记忆类型层次

```
┌─────────────────────────────────────────────────────────────────┐
│                        记忆类型体系                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📦 执行结果 (Execution Result)                            │   │
│  │    - 节点执行产生的直接输出                                │   │
│  │    - 结构化数据、文本、文件等                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🧠 上下文记忆 (Context Memory)                            │   │
│  │    - 任务理解、决策依据、推理过程                          │   │
│  │    - 用于下游节点理解"为什么"                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💭 工作记忆 (Working Memory)                              │   │
│  │    - 当前任务相关的临时状态                                │   │
│  │    - 计数器、标志位、中间变量                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📚 知识记忆 (Knowledge Memory)                            │   │
│  │    - 持久化的经验和知识                                    │   │
│  │    - 跨工作流共享                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、记忆流通设计

### 2.1 边作为记忆通道

边不仅仅是连接，更是记忆流通的通道：

```typescript
/**
 * 记忆通道（边）
 */
interface IMemoryChannel {
  /** 通道 ID */
  id: string;

  /** 源节点 */
  source: string;
  /** 源端口 */
  sourceHandle: string;

  /** 目标节点 */
  target: string;
  /** 目标端口 */
  targetHandle: string;

  /** 记忆传递策略 */
  memoryPolicy: IMemoryPolicy;

  /** 通道状态 */
  status: 'idle' | 'flowing' | 'blocked';

  /** 通过的记忆量（可视化用） */
  throughput?: {
    bytes: number;
    tokens: number;
    items: number;
  };
}

/**
 * 记忆传递策略
 */
interface IMemoryPolicy {
  /** 传递哪些类型的记忆 */
  types: MemoryType[];

  /** 过滤规则 */
  filter?: {
    /** 包含的字段 */
    include?: string[];
    /** 排除的字段 */
    exclude?: string[];
    /** 自定义过滤表达式 */
    expression?: string;
  };

  /** 转换规则 */
  transform?: {
    /** 字段映射 */
    mapping?: Record<string, string>;
    /** 聚合方式 */
    aggregate?: 'last' | 'all' | 'merge';
  };

  /** 流量控制 */
  flowControl?: {
    /** 最大记忆量（字节） */
    maxBytes?: number;
    /** 最大 Token 数 */
    maxTokens?: number;
    /** 截断策略 */
    truncation?: 'head' | 'tail' | 'summarize';
    /** 优先级字段 */
    priority?: string[];
  };
}
```

### 2.2 记忆流通可视化

```
边的表现形式：

1. 静止状态（无记忆流通）
   A ──────────── B    细灰色虚线

2. 流通状态（记忆正在传递）
   A ════════════▶ B   粗实线 + 动画 + 箭头

3. 高流量状态（大量记忆）
   A ████████████▶ B   粗蓝线 + 流动粒子效果

4. 阻塞状态（记忆传递受限）
   A ─ ─ ─ ─ ─ ─ ▶ B   虚线 + 警告图标

5. 不同记忆类型的颜色：
   - 执行结果：蓝色
   - 上下文记忆：紫色
   - 工作记忆：绿色
   - 知识记忆：金色
```

---

## 三、记忆分配机制

### 3.1 节点的记忆需求声明

每个节点声明它需要什么类型的记忆：

```typescript
/**
 * 节点记忆需求
 */
interface INodeMemoryRequirement {
  /** 必需的记忆类型 */
  required: {
    type: MemoryType;
    /** 最小量 */
    minAmount?: number;
    /** 描述 */
    description: string;
  }[];

  /** 可选的记忆类型（增强效果） */
  optional: {
    type: MemoryType;
    /** 优先级 */
    priority: 'low' | 'medium' | 'high';
    description: string;
  }[];

  /** 记忆产出 */
  produces: {
    type: MemoryType;
    /** 预估产出量 */
    estimatedAmount?: number;
    description: string;
  }[];
}
```

### 3.2 记忆分配器

```typescript
/**
 * 记忆分配器
 */
class MemoryAllocator {
  /**
   * 为节点分配记忆
   */
  allocate(
    nodeId: string,
    requirement: INodeMemoryRequirement,
    availableMemory: IMemoryPool
  ): IMemoryAllocation {
    const allocation: IMemoryAllocation = {
      nodeId,
      allocated: {},
      missing: [],
      warnings: []
    };

    // 分配必需记忆
    for (const req of requirement.required) {
      const available = availableMemory.get(req.type);
      if (available && available.amount >= (req.minAmount || 0)) {
        allocation.allocated[req.type] = this.takeMemory(
          availableMemory,
          req.type,
          req.minAmount
        );
      } else {
        allocation.missing.push(req);
      }
    }

    // 分配可选记忆（按优先级）
    const sortedOptional = requirement.optional.sort(
      (a, b) => priorityWeight(b.priority) - priorityWeight(a.priority)
    );

    for (const req of sortedOptional) {
      const available = availableMemory.get(req.type);
      if (available && available.amount > 0) {
        allocation.allocated[req.type] = this.takeMemory(
          availableMemory,
          req.type,
          available.amount
        );
      }
    }

    return allocation;
  }
}
```

### 3.3 记忆池

```typescript
/**
 * 记忆池 - 管理工作流中的所有可用记忆
 */
interface IMemoryPool {
  /** 按类型存储的记忆 */
  memories: Map<MemoryType, IMemoryChunk[]>;

  /** 获取某类型记忆 */
  get(type: MemoryType): IMemoryChunk[] | null;

  /** 添加记忆 */
  add(type: MemoryType, chunk: IMemoryChunk): void;

  /** 消耗记忆 */
  consume(type: MemoryType, amount: number): IMemoryChunk[];

  /** 记忆总量 */
  getTotalAmount(type: MemoryType): number;
}

/**
 * 记忆块
 */
interface IMemoryChunk {
  /** 块 ID */
  id: string;

  /** 来源节点 */
  sourceNode: string;

  /** 记忆类型 */
  type: MemoryType;

  /** 内容 */
  content: any;

  /** 元数据 */
  metadata: {
    /** 创建时间 */
    createdAt: Date;
    /** Token 数 */
    tokens: number;
    /** 字节大小 */
    bytes: number;
    /** 重要性评分 */
    importance: number;
    /** 过期时间 */
    expiresAt?: Date;
  };

  /** 记忆摘要（用于传递） */
  summary?: string;
}
```

---

## 四、图形界面体现

### 4.1 边的配置面板

当点击一条边时，显示记忆配置：

```
┌─────────────────────────────────────────┐
│ 🔗 记忆通道配置                          │
├─────────────────────────────────────────┤
│                                         │
│ 传递的记忆类型:                          │
│ ┌─────────────────────────────────────┐ │
│ │ ☑ 执行结果 (Execution Result)       │ │
│ │ ☑ 上下文记忆 (Context Memory)       │ │
│ │ ☐ 工作记忆 (Working Memory)         │ │
│ │ ☐ 知识记忆 (Knowledge Memory)       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 流量控制:                                │
│ ┌─────────────────────────────────────┐ │
│ │ 最大 Token: [  4000  ] ▼            │ │
│ │ 最大字节:  [  64KB  ] ▼             │ │
│ │ 截断策略:  [ 智能摘要 ] ▼            │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 字段过滤:                                │
│ ┌─────────────────────────────────────┐ │
│ │ 包含字段: result, analysis, ...     │ │
│ │ 排除字段: debug_info, raw_data      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 高级选项:                                │
│ ┌─────────────────────────────────────┐ │
│ │ ☐ 聚合上游所有记忆                   │ │
│ │ ☑ 仅传递最新记忆                     │ │
│ │ ☐ 自动生成摘要                       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│        [取消]  [应用]  [确定]            │
└─────────────────────────────────────────┘
```

### 4.2 节点的记忆视图

节点上显示记忆状态：

```
┌───────────────────────────┐
│  🧠 Understand Node       │
├───────────────────────────┤
│                           │
│  📥 输入记忆:              │
│  ├── 执行结果 ✓ (2.3KB)   │
│  ├── 上下文 ✓ (1.1KB)     │
│  └── 工作记忆 ⚠ (缺失)    │
│                           │
│  📤 输出记忆:              │
│  └── 上下文 (预估 3KB)    │
│                           │
│  💾 记忆使用: 3.4KB / 8KB │
│  [████████░░░░░░░░] 42%   │
└───────────────────────────┘
```

### 4.3 全局记忆面板

```
┌─────────────────────────────────────────────────────────────┐
│ 📊 工作流记忆总览                          [实时] [刷新]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  记忆池状态:                                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 类型          │ 数量  │ 大小    │ Token │ 状态        │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ 执行结果      │ 5     │ 12.3KB  │ 2847  │ 🟢 正常     │ │
│  │ 上下文记忆    │ 3     │ 4.2KB   │ 982   │ 🟢 正常     │ │
│  │ 工作记忆      │ 8     │ 1.1KB   │ 256   │ 🟢 正常     │ │
│  │ 知识记忆      │ 2     │ 45.6KB  │ 8234  │ 🟡 接近上限 │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  记忆流向图:                                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │   [Receive] ═══════════════▶ [Understand] ════▶ ...   │ │
│  │       │      (2.3KB)              │     (1.8KB)       │ │
│  │       │                           │                   │ │
│  │       ▼                           ▼                   │ │
│  │   记忆池 ◀═══════════════════════╝                   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  记忆热点:                                                   │
│  • Code 节点消耗最多上下文记忆 (45%)                         │
│  • Review 节点产出最多知识记忆 (60%)                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、记忆流通的抽象模型

### 5.1 三层抽象

```
┌─────────────────────────────────────────────────────────────────┐
│                        记忆抽象三层模型                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: 物理层 (Physical)                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 实际的数据传输                                        │   │
│  │  • 内存管理、序列化                                      │   │
│  │  • 压缩、加密                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  Layer 2: 逻辑层 (Logical)                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 记忆类型定义                                          │   │
│  │  • 过滤、转换规则                                        │   │
│  │  • 分配策略                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  Layer 3: 表现层 (Presentation)                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 可视化展示                                            │   │
│  │  • 用户交互                                              │   │
│  │  • 配置界面                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 记忆流通量计算

```typescript
/**
 * 记忆流通量计算器
 */
class MemoryFlowCalculator {
  /**
   * 计算边的记忆流通量
   */
  calculateFlow(edge: IMemoryChannel): IMemoryFlowMetrics {
    const sourceNode = this.getNode(edge.source);
    const targetNode = this.getNode(edge.target);

    // 获取源节点的产出
    const production = sourceNode.getMemoryProduction();

    // 应用边的策略
    const filtered = this.applyPolicy(production, edge.memoryPolicy);

    // 计算流通量
    return {
      // 物理量
      bytes: this.calculateBytes(filtered),
      tokens: this.calculateTokens(filtered),

      // 逻辑量
      chunks: filtered.length,
      types: this.countTypes(filtered),

      // 效率指标
      compressionRatio: this.calculateCompression(production, filtered),
      relevanceScore: this.calculateRelevance(filtered, targetNode),

      // 可视化参数
      visualWeight: this.calculateVisualWeight(filtered),
      color: this.determineColor(filtered),
      animationSpeed: this.determineAnimationSpeed(filtered)
    };
  }

  /**
   * 计算视觉权重（用于边的粗细）
   */
  private calculateVisualWeight(memory: IMemoryChunk[]): number {
    const baseWeight = 1;
    const tokenFactor = memory.reduce((sum, m) => sum + m.metadata.tokens, 0) / 1000;
    const importanceFactor = memory.reduce((sum, m) => sum + m.metadata.importance, 0) / memory.length;

    return Math.min(5, baseWeight + tokenFactor * 0.5 + importanceFactor * 2);
  }
}
```

### 5.3 记忆衰减与优先级

```typescript
/**
 * 记忆优先级与衰减
 */
interface IMemoryDecay {
  /** 时间衰减因子 */
  timeDecay: number; // 0-1, 越大衰减越快

  /** 距离衰减（与当前节点的距离） */
  distanceDecay: number;

  /** 使用频率加权 */
  frequencyWeight: number;

  /** 最小保留量 */
  minRetention: number;
}

/**
 * 优先级计算
 */
function calculatePriority(
  memory: IMemoryChunk,
  decay: IMemoryDecay,
  context: IExecutionContext
): number {
  let score = 1.0;

  // 时间衰减
  const ageMs = Date.now() - memory.metadata.createdAt.getTime();
  score *= Math.exp(-decay.timeDecay * ageMs / 60000); // 每分钟衰减

  // 距离衰减
  const distance = context.getNodeDistance(memory.sourceNode);
  score *= Math.exp(-decay.distanceDecay * distance);

  // 重要性加权
  score *= memory.metadata.importance;

  // 使用频率
  const usageCount = context.getMemoryUsageCount(memory.id);
  score *= 1 + decay.frequencyWeight * Math.log(1 + usageCount);

  return score;
}
```

---

## 六、实现示例

### 6.1 记忆类型定义

```typescript
// src/types/memory.ts

export type MemoryType =
  | 'execution_result'   // 执行结果
  | 'context'            // 上下文记忆
  | 'working'            // 工作记忆
  | 'knowledge';         // 知识记忆

export interface IMemorySystem {
  /** 记忆池 */
  pool: IMemoryPool;

  /** 分配器 */
  allocator: MemoryAllocator;

  /** 流通计算器 */
  flowCalculator: MemoryFlowCalculator;

  /** 创建记忆通道 */
  createChannel(config: IMemoryChannelConfig): IMemoryChannel;

  /** 传递记忆 */
  transfer(channel: IMemoryChannel): Promise<IMemoryChunk[]>;

  /** 获取节点可用记忆 */
  getAvailableMemory(nodeId: string): IMemoryPool;

  /** 可视化数据 */
  getVisualizationData(): IMemoryVisualization;
}
```

### 6.2 边的扩展定义

```typescript
// 扩展现有的 IEdge 接口
export interface IMemoryEdge extends IEdge {
  /** 记忆策略 */
  memoryPolicy: IMemoryPolicy;

  /** 运行时记忆状态 */
  memoryState?: {
    /** 当前流通量 */
    currentFlow: IMemoryFlowMetrics;
    /** 累计传递 */
    totalTransferred: {
      bytes: number;
      tokens: number;
      chunks: number;
    };
    /** 最后传递时间 */
    lastTransferAt?: Date;
  };
}
```

### 6.3 节点执行上下文扩展

```typescript
// 扩展 INodeContext
export interface INodeContextWithMemory extends INodeContext {
  /** 可用记忆 */
  availableMemory: IMemoryPool;

  /** 记忆分配结果 */
  memoryAllocation: IMemoryAllocation;

  /** 记忆操作接口 */
  memory: {
    /** 读取记忆 */
    read(type: MemoryType): IMemoryChunk[];

    /** 写入记忆 */
    write(type: MemoryType, content: any, metadata?: Partial<IMemoryMetadata>): void;

    /** 查询记忆 */
    query(filter: IMemoryFilter): IMemoryChunk[];

    /** 清除记忆 */
    clear(type?: MemoryType): void;
  };
}
```

---

## 七、使用场景

### 7.1 简单线性流

```yaml
# 简单的记忆传递
nodes:
  - id: receive
    type: input/receive
  - id: understand
    type: input/understand
  - id: code
    type: execution/code

edges:
  - from: receive
    to: understand
    memory:
      types: [execution_result]
  - from: understand
    to: code
    memory:
      types: [execution_result, context]
      maxTokens: 4000
```

### 7.2 并行分支与记忆复制

```yaml
# 并行分支 - 记忆复制到多个下游
nodes:
  - id: analyze
    type: planning/analyze
  - id: code_frontend
    type: execution/code
  - id: code_backend
    type: execution/code

edges:
  - from: analyze
    to: code_frontend
    memory:
      types: [execution_result, context]
      filter:
        include: ["frontend_*", "ui_*", "shared_*"]
  - from: analyze
    to: code_backend
    memory:
      types: [execution_result, context]
      filter:
        include: ["backend_*", "api_*", "shared_*"]
```

### 7.3 循环与记忆累积

```yaml
# 循环 - 记忆累积
nodes:
  - id: iterate
    type: decision/loop
  - id: process
    type: execution/code

edges:
  - from: iterate
    to: process
    memory:
      types: [execution_result, working]
      aggregate: merge  # 合并所有迭代结果
  - from: process
    to: iterate
    memory:
      types: [working]
      # 工作记忆保留迭代状态
```

---

## 八、总结

### 核心设计原则

1. **边即通道**：连接线不仅是拓扑关系，更是记忆流通的管道
2. **类型化记忆**：不同类型的记忆有不同的特性和用途
3. **策略化传递**：用户可配置记忆传递的过滤、转换、限流策略
4. **可视化反馈**：记忆流通在界面上有直观的视觉体现
5. **按需分配**：节点声明需求，系统智能分配可用记忆

### 抽象体现

| 概念 | 抽象体现 |
|------|----------|
| 记忆是否流通 | 边的策略配置（types、filter） |
| 分配多少 | flowControl（maxTokens、maxBytes） |
| 记忆类型 | 四种类型（执行、上下文、工作、知识） |
| 优先级 | priority 字段 + 衰减算法 |
| 可视化 | 边粗细、颜色、动画速度 |
