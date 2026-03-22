# 河网同步系统设计

> **状态**：已确认，准备开发
> **日期**：2026-03-08
> **重要性**：⭐⭐⭐⭐⭐ 核心架构设计

---

## 一、设计背景

### 1.1 痛点问题

```
场景：前端 Agent 和后端 Agent 并行开发

时间线：
────────────────────────────────────────────────────────────▶

前端 Agent: ──▶ 选了 TypeScript + React
                   ↓ (如何通知后端？)

后端 Agent: ──▶ 选了 Python + FastAPI
                   ↓ (前端不知道！)

后期合并：❌ 技术栈不对齐，接口定义不一致，重构成本高
```

### 1.2 纯河流模型的局限

| 问题 | 描述 |
|------|------|
| **单向流动** | 河流是单向的，适合串行任务 |
| **并行盲区** | 并行分支之间无法直接通信 |
| **发现太晚** | 汇入主流时决策已做出，冲突修复成本高 |

### 1.3 解决方案

**河网 + 同步点模型**：
- 不仅是一条河，而是**河网**
- 支流之间可以通过**同步点**实时协调
- 冲突在发生时就被检测，而不是合并时

---

## 二、架构设计

### 2.1 河网同步模型

```
┌─────────────────────────────────────────────────────────────────┐
│                    RiverNetwork 河网同步模型                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        ┌─────────┐                              │
│                        │  主流   │ ← 全局共享记忆                │
│                        │ (Main)  │                              │
│                        └────┬────┘                              │
│                             │                                   │
│          ┌──────────────────┼──────────────────┐               │
│          ↓                  ↓                  ↓               │
│    ┌──────────┐       ┌──────────┐       ┌──────────┐         │
│    │ 支流 A   │       │ 支流 B   │       │ 支流 C   │         │
│    │ (前端)   │◄─────►│ (后端)   │◄─────►│ (测试)   │         │
│    └────┬─────┘       └────┬─────┘       └────┬─────┘         │
│         │                  │                  │                 │
│         │    ┌─────────────┴─────────────┐    │                 │
│         │    │                           │    │                 │
│         └───►│      同步点 (SyncPoint)   │◄───┘                 │
│              │   - 决策广播               │                     │
│              │   - 冲突检测               │                     │
│              │   - 共识达成               │                     │
│              └───────────────────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 三层通信机制

```typescript
// 通信层级设计
interface CommunicationLayers {
  // Layer 1: 主流 - 全局共享
  mainRiver: {
    type: 'broadcast';      // 广播模式
    scope: 'global';        // 全局可见
    latency: 'eventual';    // 最终一致
    useCase: '全局规范、项目配置、里程碑通知';
  };

  // Layer 2: 支流 - 组内共享
  branch: {
    type: 'multicast';      // 组播模式
    scope: 'team';          // 组内可见
    latency: 'near-realtime';
    useCase: '组内决策、任务进度、内部状态';
  };

  // Layer 3: 同步点 - 实时协商
  syncPoint: {
    type: 'peer-to-peer';   // 点对点
    scope: 'participants';  // 参与者可见
    latency: 'realtime';    // 实时
    useCase: '接口对齐、冲突解决、紧急协调';
  };
}
```

### 2.3 通信模式对比

| 模式 | 适用场景 | 延迟 | 复杂度 | 示例 |
|------|----------|------|--------|------|
| **主流广播** | 全局通知、状态更新 | 最终一致 | 低 | "项目规范已更新" |
| **订阅/发布** | 特定主题变更 | 近实时 | 中 | "API接口已修改" |
| **同步点协商** | 决策对齐、冲突解决 | 实时 | 高 | "接口格式协商" |
| **P2P直连** | 紧急协调、快速同步 | 实时 | 中 | "这个参数能改吗？" |

---

## 三、核心类型定义

### 3.1 支流 (Branch)

```typescript
// 支流定义
interface Branch {
  id: string;
  name: string;
  role: Role;                    // 执行组角色
  responsibilities: string[];    // 职责范围

  // 支流状态
  status: 'active' | 'paused' | 'merged' | 'abandoned';

  // 私有记忆池
  memoryPool: MemoryPool;

  // 订阅的主题
  subscriptions: Set<string>;

  // 决策历史
  decisions: Decision[];
}

// 支流配置
interface BranchConfig {
  name: string;
  role: Role;
  responsibilities: string[];
  subscribeTo?: string[];        // 初始订阅的支流
  syncWith?: string[];           // 需要同步的支流
}
```

### 3.2 同步点 (SyncPoint)

```typescript
// 同步点定义
interface SyncPoint {
  id: string;
  name: string;

  // 同步点类型
  type: 'decision' | 'milestone' | 'conflict' | 'checkpoint' | 'manual';

  // 参与的支流
  participants: string[];

  // 同步触发条件
  trigger: {
    type: 'time-based' | 'event-based' | 'dependency-based' | 'manual';
    condition?: string;
    interval?: number;           // 时间间隔（分钟）
  };

  // 同步内容
  payload: {
    decisions: Decision[];       // 已做出的决策
    dependencies: Dependency[];  // 依赖声明
    conflicts: Conflict[];       // 检测到的冲突
    agreements: Agreement[];     // 已达成的共识
  };

  // 状态
  status: 'pending' | 'syncing' | 'resolved' | 'failed';

  // 创建时间
  createdAt: Date;

  // 最后同步时间
  lastSyncAt?: Date;
}

// 决策声明
interface Decision {
  id: string;
  agent: string;                 // 哪个 Agent 做的决策
  branch: string;                // 哪个支流
  topic: string;                 // 决策主题
  content: any;                  // 决策内容
  impact: string[];              // 影响范围（其他支流）
  timestamp: Date;

  // 决策状态
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
}

// 依赖声明
interface Dependency {
  id: string;
  agent: string;                 // 依赖方
  branch: string;                // 依赖方支流
  dependsOn: string;             // 被依赖方支流
  topic: string;                 // 依赖主题
  required: boolean;             // 是否必需
  status: 'pending' | 'satisfied' | 'blocked';
}

// 冲突
interface Conflict {
  id: string;
  type: ConflictType;
  parties: string[];             // 冲突方
  details: any;
  detectedAt: Date;
  status: 'detected' | 'negotiating' | 'resolved' | 'escalated';
  resolution?: ConflictResolution;
}

type ConflictType =
  | 'type-mismatch'        // 类型不匹配
  | 'naming-collision'     // 命名冲突
  | 'dependency-cycle'     // 依赖循环
  | 'resource-conflict'    // 资源冲突
  | 'semantic-conflict';   // 语义冲突

// 冲突解决
interface ConflictResolution {
  strategy: 'negotiate' | 'vote' | 'escalate' | 'auto';
  result: any;
  resolvedBy?: string;           // 解决者（人或Agent）
  resolvedAt: Date;
}
```

### 3.3 消息与订阅

```typescript
// 支流消息
interface BranchMessage {
  id: string;
  from: string;                  // 发送方支流
  to: string | 'broadcast';      // 接收方（broadcast = 广播）
  topic: string;                 // 消息主题
  type: MessageType;
  payload: any;
  timestamp: Date;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

type MessageType =
  | 'decision'           // 决策通知
  | 'dependency'         // 依赖声明
  | 'conflict'           // 冲突告警
  | 'sync-request'       // 同步请求
  | 'sync-response'      // 同步响应
  | 'query'              // 查询请求
  | 'query-response';    // 查询响应

// 订阅配置
interface Subscription {
  subscriber: string;            // 订阅者支流
  publisher: string;             // 发布者支流
  topics: string[];              // 订阅的主题
  filters?: MessageFilter[];     // 消息过滤条件
}

interface MessageFilter {
  field: string;
  operator: 'eq' | 'ne' | 'in' | 'contains';
  value: any;
}
```

---

## 四、核心接口设计

### 4.1 RiverNetwork 主接口

```typescript
/**
 * 河网访问接口
 * 扩展自河流记忆接口，支持多支流协作
 */
interface RiverNetworkAccess {
  // ===== 主流操作 =====

  /** 获取主流 */
  getMainFlow(): MainFlow;

  /** 向主流广播消息 */
  broadcast(message: BranchMessage): void;

  // ===== 支流操作 =====

  /** 创建支流 */
  createBranch(config: BranchConfig): Branch;

  /** 获取支流 */
  getBranch(branchId: string): Branch | undefined;

  /** 获取所有支流 */
  listBranches(): Branch[];

  /** 切换到支流上下文 */
  switchToBranch(branchId: string): void;

  /** 合并支流到主流 */
  mergeBranch(branchId: string): MergeResult;

  /** 废弃支流 */
  abandonBranch(branchId: string, reason: string): void;

  // ===== 同步点操作 =====

  /** 创建同步点 */
  createSyncPoint(config: SyncPointConfig): SyncPoint;

  /** 获取同步点 */
  getSyncPoint(syncPointId: string): SyncPoint | undefined;

  /** 加入同步点 */
  joinSyncPoint(syncPointId: string, branchId: string): void;

  /** 触发同步 */
  triggerSync(syncPointId: string): Promise<SyncResult>;

  /** 获取相关的同步点 */
  getRelatedSyncPoints(branchId: string): SyncPoint[];

  // ===== 决策与依赖 =====

  /** 发布决策 */
  publishDecision(branchId: string, decision: Omit<Decision, 'id' | 'timestamp'>): Decision;

  /** 声明依赖 */
  declareDependency(branchId: string, dependency: Omit<Dependency, 'id'>): Dependency;

  /** 检查依赖是否满足 */
  checkDependencies(branchId: string): DependencyStatus[];

  // ===== 冲突管理 =====

  /** 检测冲突 */
  detectConflicts(options?: ConflictDetectionOptions): Conflict[];

  /** 解决冲突 */
  resolveConflict(conflictId: string, resolution: ConflictResolution): void;

  /** 获取未解决的冲突 */
  getUnresolvedConflicts(): Conflict[];

  // ===== 订阅与消息 =====

  /** 订阅支流 */
  subscribe(subscription: Subscription): void;

  /** 取消订阅 */
  unsubscribe(subscriber: string, publisher: string): void;

  /** 发送消息 */
  sendMessage(message: Omit<BranchMessage, 'id' | 'timestamp'>): void;

  /** 接收消息（回调） */
  onMessage(branchId: string, callback: (msg: BranchMessage) => void): void;

  /** 查询其他支流 */
  query(branchId: string, targetBranch: string, topic: string, query: any): Promise<any>;
}
```

### 4.2 支流内部接口

```typescript
/**
 * 支流内部操作接口
 * 供 Agent 在支流内部使用
 */
interface BranchAccess {
  // ===== 记忆操作（继承自河流接口）=====

  /** 取水 - 读取记忆 */
  drink(type?: MemoryType): IMemoryChunk[];

  /** 用过滤网取水 */
  scoop(filter: MemoryFilter): IMemoryChunk[];

  /** 注水 - 写入记忆 */
  pour(chunk: IMemoryChunk): void;

  /** 沉淀 - 记录学习 */
  settle(pattern: IPattern): void;

  // ===== 支流特有操作 =====

  /** 发布决策到同步点 */
  publishDecision(decision: Omit<Decision, 'id' | 'branch' | 'timestamp'>): Decision;

  /** 声明对其他支流的依赖 */
  declareDependency(targetBranch: string, topic: string, required: boolean): Dependency;

  /** 订阅其他支流的消息 */
  subscribe(targetBranch: string, topics: string[]): void;

  /** 发送消息给其他支流 */
  sendTo(targetBranch: string, topic: string, payload: any, priority?: Priority): void;

  /** 广播消息 */
  broadcast(topic: string, payload: any): void;

  /** 查询其他支流 */
  query(targetBranch: string, topic: string, query: any): Promise<any>;

  /** 请求同步 */
  requestSync(participants: string[], reason: string): SyncPoint;

  /** 获取相关决策 */
  getRelatedDecisions(topic?: string): Decision[];

  /** 检查是否有冲突 */
  checkConflicts(): Conflict[];
}
```

---

## 五、前后端协作示例

### 5.1 完整协作流程

```typescript
// 前后端并行开发协作示例
async function frontendBackendCollaboration() {
  const river = new RiverNetwork();

  // ========================================
  // Phase 1: 初始化
  // ========================================

  // 1.1 创建主流，注入项目规范
  const main = river.getMainFlow();
  main.pour({
    type: 'knowledge',
    content: {
      projectType: 'web-app',
      techStack: {
        frontend: { language: 'TypeScript', framework: 'React' },
        backend: { language: 'TypeScript', framework: 'NestJS' }  // 提前对齐！
      },
      apiStyle: 'REST',
      dataFormat: 'JSON'
    },
    metadata: { importance: 1.0 }
  });

  // 1.2 创建前端支流
  const frontendBranch = river.createBranch({
    name: 'frontend',
    role: 'dev',
    responsibilities: ['UI组件', '页面逻辑', '状态管理'],
    subscribeTo: ['backend'],
    syncWith: ['backend']
  });

  // 1.3 创建后端支流
  const backendBranch = river.createBranch({
    name: 'backend',
    role: 'dev',
    responsibilities: ['API接口', '数据模型', '业务逻辑'],
    subscribeTo: ['frontend'],
    syncWith: ['frontend']
  });

  // ========================================
  // Phase 2: 创建同步点
  // ========================================

  // 2.1 API 设计同步点
  const apiSyncPoint = river.createSyncPoint({
    name: 'api-design',
    type: 'decision',
    participants: ['frontend', 'backend'],
    trigger: {
      type: 'event-based',
      condition: 'api-decision-made'
    }
  });

  // 2.2 数据模型同步点
  const dataSyncPoint = river.createSyncPoint({
    name: 'data-model',
    type: 'decision',
    participants: ['frontend', 'backend'],
    trigger: {
      type: 'dependency-based',
      condition: 'model-changed'
    }
  });

  // ========================================
  // Phase 3: 前端开发
  // ========================================

  // 3.1 前端声明依赖
  frontendBranch.declareDependency('backend', 'API接口定义', true);
  frontendBranch.declareDependency('backend', '数据模型', true);

  // 3.2 前端订阅后端变更
  frontendBranch.subscribe('backend', [
    'api-changed',
    'model-changed',
    'endpoint-added'
  ]);

  // 3.3 前端做出决策并发布
  frontendBranch.publishDecision({
    topic: '前端状态管理',
    content: { solution: 'Zustand', reason: '轻量级' },
    impact: []  // 不影响后端
  });

  // 3.4 前端定义期望的 API
  frontendBranch.publishDecision({
    topic: 'API期望',
    content: {
      endpoints: [
        { method: 'GET', path: '/api/users', response: 'User[]' },
        { method: 'POST', path: '/api/users', body: 'CreateUserDTO' }
      ]
    },
    impact: ['backend']  // 影响后端
  });

  // ========================================
  // Phase 4: 后端开发
  // ========================================

  // 4.1 后端收到前端的 API 期望
  backendBranch.onMessage((msg) => {
    if (msg.topic === 'api-decision-made') {
      console.log('收到前端 API 期望:', msg.payload);
    }
  });

  // 4.2 后端发布 API 设计
  backendBranch.publishDecision({
    topic: 'API接口定义',
    content: {
      endpoints: [
        {
          method: 'GET',
          path: '/api/users',
          response: { type: 'User[]', fields: ['id', 'name', 'email'] }
        },
        {
          method: 'POST',
          path: '/api/users',
          body: { type: 'CreateUserDTO', fields: ['name', 'email', 'password'] }
        }
      ]
    },
    impact: ['frontend']
  });

  // 4.3 后端通知前端
  backendBranch.sendTo('frontend', 'api-changed', {
    message: 'API 接口已定义，请查看同步点'
  });

  // ========================================
  // Phase 5: 同步与冲突检测
  // ========================================

  // 5.1 触发同步
  const syncResult = await river.triggerSync(apiSyncPoint.id);

  // 5.2 检测冲突
  const conflicts = river.detectConflicts({
    branches: ['frontend', 'backend'],
    topics: ['API期望', 'API接口定义']
  });

  // 5.3 处理冲突（如果有）
  for (const conflict of conflicts) {
    console.log('检测到冲突:', conflict);

    if (conflict.type === 'type-mismatch') {
      // 自动协商
      river.resolveConflict(conflict.id, {
        strategy: 'negotiate',
        result: { action: 'adopt-backend', reason: '后端定义更完整' }
      });
    } else {
      // 升级到人工
      river.resolveConflict(conflict.id, {
        strategy: 'escalate',
        result: { action: 'human-review-required' }
      });
    }
  }

  // ========================================
  // Phase 6: 完成后合并
  // ========================================

  // 6.1 检查所有依赖是否满足
  const frontendDeps = river.checkDependencies('frontend');
  const allSatisfied = frontendDeps.every(d => d.status === 'satisfied');

  if (allSatisfied) {
    // 6.2 合并支流
    river.mergeBranch('frontend');
    river.mergeBranch('backend');

    console.log('前后端开发完成，已合并到主流');
  }
}
```

### 5.2 关键时间线

```
时间线：
─────────────────────────────────────────────────────────────────────▶

T0: 主流注入项目规范（技术栈已对齐：TypeScript + React/NestJS）

T1: 创建前端支流 ◄─────────────────► 创建后端支流
    │                                    │
    │  订阅后端变更                       │  订阅前端变更
    │                                    │
T2: │  声明依赖：API接口定义             │
    │                                    │
T3: │  发布：期望的API结构               │
    │  ────────消息─────────────────────►│
    │                                    │
T4: │                                    │  收到前端期望
    │                                    │  发布：API接口定义
    │  ◄────────消息──────────────────── │
    │                                    │
T5: │  收到后端定义                       │
    │  对齐实现                           │
    │                                    │
T6: ◄────── 同步点同步 ──────────────────►
    │                                    │
T7: │  冲突检测（无冲突）                  │
    │                                    │
T8: ◄────── 合并到主流 ──────────────────►
```

---

## 六、冲突检测规则

### 6.1 冲突类型与检测

```typescript
// 冲突检测规则定义
interface ConflictRule {
  id: string;
  type: ConflictType;
  description: string;
  detector: (context: ConflictContext) => Conflict | null;
  autoResolvable: boolean;
}

// 检测上下文
interface ConflictContext {
  decisions: Decision[];
  dependencies: Dependency[];
  branches: Branch[];
}

// ========================================
// 规则 1: 类型不匹配
// ========================================
const typeMismatchRule: ConflictRule = {
  id: 'type-mismatch',
  type: 'type-mismatch',
  description: '前后端对同一字段的类型定义不一致',
  autoResolvable: true,

  detector: (ctx) => {
    // 获取前端的类型定义
    const frontendTypes = ctx.decisions.filter(
      d => d.branch === 'frontend' && d.topic === '数据类型'
    );

    // 获取后端的类型定义
    const backendTypes = ctx.decisions.filter(
      d => d.branch === 'backend' && d.topic === '数据类型'
    );

    // 比较同名字段
    for (const ft of frontendTypes) {
      const bt = backendTypes.find(
        b => b.content.field === ft.content.field
      );

      if (bt && ft.content.type !== bt.content.type) {
        return {
          id: `conflict-${Date.now()}`,
          type: 'type-mismatch',
          parties: ['frontend', 'backend'],
          details: {
            field: ft.content.field,
            frontendType: ft.content.type,
            backendType: bt.content.type
          },
          detectedAt: new Date(),
          status: 'detected'
        };
      }
    }

    return null;
  }
};

// ========================================
// 规则 2: 命名冲突
// ========================================
const namingCollisionRule: ConflictRule = {
  id: 'naming-collision',
  type: 'naming-collision',
  description: '不同支流使用了相同的名称但含义不同',
  autoResolvable: false,

  detector: (ctx) => {
    const namesByBranch = new Map<string, Map<string, any>>();

    for (const decision of ctx.decisions) {
      if (!decision.content.name) continue;

      if (!namesByBranch.has(decision.branch)) {
        namesByBranch.set(decision.branch, new Map());
      }

      namesByBranch.get(decision.branch)!.set(
        decision.content.name,
        decision.content
      );
    }

    // 检查跨分支的命名冲突
    for (const [branch1, names1] of namesByBranch) {
      for (const [branch2, names2] of namesByBranch) {
        if (branch1 >= branch2) continue;

        for (const [name, content1] of names1) {
          if (names2.has(name)) {
            const content2 = names2.get(name);

            // 检查语义是否相同
            if (!deepEqual(content1, content2)) {
              return {
                id: `conflict-${Date.now()}`,
                type: 'naming-collision',
                parties: [branch1, branch2],
                details: {
                  name,
                  definitions: [
                    { branch: branch1, content: content1 },
                    { branch: branch2, content: content2 }
                  ]
                },
                detectedAt: new Date(),
                status: 'detected'
              };
            }
          }
        }
      }
    }

    return null;
  }
};

// ========================================
// 规则 3: 依赖循环
// ========================================
const dependencyCycleRule: ConflictRule = {
  id: 'dependency-cycle',
  type: 'dependency-cycle',
  description: '支流之间存在循环依赖',
  autoResolvable: false,

  detector: (ctx) => {
    // 构建依赖图
    const graph = new Map<string, Set<string>>();

    for (const dep of ctx.dependencies) {
      if (!graph.has(dep.branch)) {
        graph.set(dep.branch, new Set());
      }
      graph.get(dep.branch)!.add(dep.dependsOn);
    }

    // 检测循环
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const [node] of graph) {
      if (hasCycle(node, graph, visited, recursionStack)) {
        return {
          id: `conflict-${Date.now()}`,
          type: 'dependency-cycle',
          parties: Array.from(recursionStack),
          details: {
            cycle: Array.from(recursionStack)
          },
          detectedAt: new Date(),
          status: 'detected'
        };
      }
    }

    return null;
  }
};

function hasCycle(
  node: string,
  graph: Map<string, Set<string>>,
  visited: Set<string>,
  stack: Set<string>
): boolean {
  if (stack.has(node)) return true;
  if (visited.has(node)) return false;

  visited.add(node);
  stack.add(node);

  const neighbors = graph.get(node);
  if (neighbors) {
    for (const neighbor of neighbors) {
      if (hasCycle(neighbor, graph, visited, stack)) {
        return true;
      }
    }
  }

  stack.delete(node);
  return false;
}
```

### 6.2 自动解决策略

```typescript
// 自动解决策略
interface AutoResolutionStrategy {
  conflictType: ConflictType;
  strategy: 'prefer-newer' | 'prefer-backend' | 'prefer-frontend' | 'merge' | 'ask';
  apply: (conflict: Conflict) => ConflictResolution;
}

const autoResolutionStrategies: AutoResolutionStrategy[] = [
  {
    conflictType: 'type-mismatch',
    strategy: 'prefer-backend',
    apply: (conflict) => ({
      strategy: 'auto',
      result: {
        action: 'adopt-backend-type',
        reason: '后端是数据源，以后端定义为准'
      },
      resolvedAt: new Date()
    })
  },

  {
    conflictType: 'naming-collision',
    strategy: 'ask',
    apply: (conflict) => ({
      strategy: 'escalate',
      result: {
        action: 'human-review-required',
        reason: '命名冲突需要人工判断语义'
      },
      resolvedAt: new Date()
    })
  },

  {
    conflictType: 'dependency-cycle',
    strategy: 'ask',
    apply: (conflict) => ({
      strategy: 'escalate',
      result: {
        action: 'human-review-required',
        reason: '循环依赖需要重新设计架构'
      },
      resolvedAt: new Date()
    })
  }
];
```

---

## 七、与四层架构的整合

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    统一工作流框架 + 河网通信                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Layer 1: 规范层                                                        │
│  ├─ 规范注入到主流                                                      │
│  └─ 全局约束通过主流广播到所有支流                                       │
│                                                                         │
│  Layer 2: 执行层                                                        │
│  ├─ 每个执行组在独立支流中运行                                          │
│  ├─ 相关执行组通过同步点对齐决策                                        │
│  └─ 执行结果汇入主流沉淀                                                │
│                                                                         │
│  Layer 3: 上下文层                                                      │
│  ├─ 主流：全局共享记忆                                                  │
│  ├─ 支流：组内私有记忆                                                  │
│  ├─ 同步点：跨组协调                                                    │
│  └─ 消息总线：实时通信                                                  │
│                                                                         │
│  Layer 4: 协作层                                                        │
│  ├─ 规划：决定何时创建同步点                                            │
│  ├─ 审核：监控冲突并介入                                                │
│  ├─ 调度：分配任务到支流                                                │
│  └─ 执行组：在支流中并行工作                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 八、实现任务清单

### Phase 1: 核心类型定义
- [ ] `src/types/river-network.ts` - 河网类型定义
- [ ] Branch, SyncPoint, Decision, Conflict 接口

### Phase 2: 主流与支流实现
- [ ] `src/memory/main-flow.ts` - 主流实现
- [ ] `src/memory/branch.ts` - 支流实现
- [ ] `src/memory/branch-manager.ts` - 支流管理器

### Phase 3: 同步点实现
- [ ] `src/memory/sync-point.ts` - 同步点实现
- [ ] `src/memory/sync-manager.ts` - 同步管理器
- [ ] 同步触发机制

### Phase 4: 冲突检测与解决
- [ ] `src/memory/conflict-detector.ts` - 冲突检测器
- [ ] `src/memory/conflict-resolver.ts` - 冲突解决器
- [ ] 自动解决策略

### Phase 5: 消息与订阅
- [ ] `src/memory/message-bus.ts` - 消息总线
- [ ] `src/memory/subscription-manager.ts` - 订阅管理器
- [ ] P2P 通信机制

### Phase 6: 可视化
- [ ] 河网可视化组件
- [ ] 同步点状态面板
- [ ] 冲突告警界面

---

## 九、设计决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-03-08 | 采用河网模型而非纯河流 | 解决并行协作的通信问题 |
| 2026-03-08 | 引入同步点机制 | 支持实时协调和冲突检测 |
| 2026-03-08 | 三层通信架构 | 平衡实时性和复杂度 |
| 2026-03-08 | 冲突自动解决 + 人工介入 | 提高效率的同时保证质量 |

---

*此文档为 AgentGraph 河网同步系统的核心设计，所有开发工作应以此为准。*
