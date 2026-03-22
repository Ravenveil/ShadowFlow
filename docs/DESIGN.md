# AgentGraph 设计文档

> 基于 LangGraph、抽象节点动态组装、河网同步系统的工作流自动化设计系统

## 一、项目概述

### 1.1 核心理念

**不是推荐固定模式，而是从抽象节点自动组装合适的工作流**

- 从 7 大类 25+ 原子节点出发
- 根据任务特征动态组装工作流
- 支持多种工作流模式（三权分立、TDD、蜂群并行等）

### 1.2 愿景

AgentGraph 致力于成为**最智能的 AI Agent 工作流设计平台**，让用户通过自然语言描述任务，系统自动：
- 分析任务需求
- 选择合适的节点组合
- 组建动态团队
- 执行并监控工作流

### 1.3 核心特性

| 特性 | 描述 |
|------|------|
| 🎨 **可视化工作流设计** | 拖拽式图形编辑器，基于 ReactFlow |
| 🧩 **抽象节点动态组装** | 7大类25+原子节点，按需组合 |
| 📋 **多种工作流模式** | 三权分立、TDD、蜂群并行、协商共识等 |
| 🌊 **河网同步系统** | 主流 + 支流 + 同步点的并行协作通信 |
| 🔍 **MCP 自动发现** | 语义搜索、自动安装、安全验证 |
| 📊 **实时监控看板** | 任务状态监控面板 |
| ⏪ **时间旅行调试** | Checkpoint 回滚、状态追踪 |

---

## 二、技术架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    AgentGraph 四层架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: 工作流设计层（可视化）                                 │
│  ├── ReactFlow 拖拽式画布                                       │
│  ├── 7大类 25+ 原子节点（可组合积木）                           │
│  └── 自动组装算法 + 手动调整                                    │
│                                                                 │
│  Layer 2: 工作流模式层（可选模板）                               │
│  ├── 三权分立模式：规划 → 审核 → 调度 → 执行                    │
│  ├── TDD 模式：测试 → 编码 → 验证 → 重构                        │
│  ├── 蜂群并行模式：分解 → 并行执行 → 汇总                       │
│  ├── 协商共识模式：提议 → 协商 → 投票 → 执行                    │
│  └── 自定义模式：用户自由组合节点                               │
│                                                                 │
│  Layer 3: 河网同步层（并行协作）                                 │
│  ├── 主流：全局共享记忆                                         │
│  ├── 支流：组内私有记忆                                         │
│  ├── 同步点：跨组协调、冲突检测                                 │
│  └── 消息总线：实时通信                                         │
│                                                                 │
│  Layer 4: 能力与监控层（基础设施）                               │
│  ├── MCP Registry：语义搜索 + 自动安装                          │
│  ├── Skills Matcher：能力匹配 + 角色推荐                        │
│  ├── 监控看板：实时状态、Agent 健康监控                         │
│  ├── 审计日志：完整审计轨迹                                     │
│  └── 时间旅行：Checkpoint 回滚调试                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈选型

| 层级 | 技术 | 版本 | 理由 |
|------|------|------|------|
| **前端框架** | Next.js | 15.x | React 框架，SSR 支持 |
| **UI 框架** | React | 19.x | 最新特性，性能优化 |
| **类型系统** | TypeScript | 5.7+ | 类型安全 |
| **图可视化** | ReactFlow | latest | 业界最佳图编辑器 |
| **自动布局** | Dagre | latest | 有向图布局算法 |
| **状态管理** | Zustand | 5.x | 轻量级，支持时间旅行 |
| **样式** | Tailwind CSS | 4.x | 原子化 CSS |
| **组件库** | Radix UI | latest | 无障碍支持 |
| **动画** | Framer Motion | 12.x | 流畅动画 |
| **后端框架** | FastAPI | 0.115+ | 高性能 Python API |
| **工作流引擎** | LangGraph | 1.x | 状态机编排 |
| **数据库** | PostgreSQL | 16+ | 关系型数据库 |
| **缓存** | Redis | 7.x | 缓存 + 消息队列 |

---

## 三、核心模块设计

### 3.1 抽象节点系统

详见 [Workflow-Nodes-Analysis.md](./Workflow-Nodes-Analysis.md)

**7 大类 25+ 原子节点**：

```
┌─────────────────────────────────────────────────────────────────┐
│                     抽象工作节点分类                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ 输入节点 (Input)     - Receive, Understand, Clarify        │
│  2️⃣ 规划节点 (Plan)      - Analyze, Design, Decompose, Spec    │
│  3️⃣ 执行节点 (Execute)   - Code, Test, Generate, Transform     │
│  4️⃣ 审核节点 (Review)    - Review, Validate, Security          │
│  5️⃣ 决策节点 (Decision)  - Branch, Merge, Loop                 │
│  6️⃣ 协调节点 (Coordinate)- Parallel, Sequence, Assign,         │
│  │                        Aggregate, Barrier, Negotiate          │
│  7️⃣ 输出节点 (Output)    - Report, Store, Notify               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3.2 工作流模式库

系统内置多种工作流模式，根据任务特征自动选择或由用户指定：

#### 3.2.1 模式一：三权分立（审核制衡型）

**适用场景**：高质量要求、需要人工把关的项目

```
[Receive] → [Plan] → [Review] → [Assign] → [Execute] → [Report]
               ↑        ↓
               ←──[Reject]←── (可驳回)
```

**节点组合**：
- 规划：负责 Plan, Decompose
- 审核：负责 Review, Validate
- 调度：负责 Assign, Aggregate
- 执行组：负责 Code, Test, Generate 等

#### 3.2.2 模式二：TDD 循环（测试驱动型）

**适用场景**：需要高质量代码的开发任务

```
[Understand] → [Test(write)] → [Code] → [Test(run)] → [Validate]
                                ↑______________↓ (失败重试)
```

**节点组合**：Understand → Test → Code → Validate → Loop

#### 3.2.3 模式三：蜂群并行（高效执行型）

**适用场景**：可分解的独立子任务

```
[Decompose] → [Parallel: [Worker1] [Worker2] [Worker3]] → [Aggregate] → [Report]
```

**节点组合**：Decompose → Parallel → Worker[] → Aggregate

#### 3.2.4 模式四：协商共识（多方协调型）

**适用场景**：需要多方达成一致的任务

```
[Propose] → [Negotiate] → [Branch: 同意?]
                                ↓ 是      ↓ 否
                            [Execute]  [Negotiate] (循环)
```

**节点组合**：Propose → Negotiate → Branch → Accept/Reject

#### 3.2.5 模式五：快速通道（简单任务型）

**适用场景**：简单、低风险任务

```
[Receive] → [Execute] → [Report]
```

**节点组合**：Receive → Execute → Report

#### 3.2.6 模式六：规范驱动（Spec-Kit 型）

**适用场景**：新项目、需要完整审计轨迹

```
[Constitution] → [Specify] → [Plan] → [Taskify] → [Implement] → [Verify]
```

#### 3.2.7 用户自定义模式

用户可以从节点库自由拖拽组合，创建自己的工作流模板：

```yaml
# custom-workflows/my-workflow.yaml
name: "我的自定义工作流"
description: "用于处理特定类型任务"
version: "1.0.0"

# 定义工作流节点
nodes:
  - id: "input"
    type: "receive"
    config:
      parser: "natural"

  - id: "understand"
    type: "understand"
    config:
      depth: "deep"

  - id: "my_custom_node"
    type: "custom"
    package: "./nodes/my-custom-node"

  - id: "review"
    type: "review"
    config:
      strictness: "normal"

  - id: "output"
    type: "report"

# 定义节点连接
edges:
  - from: "input"
    to: "understand"
  - from: "understand"
    to: "my_custom_node"
  - from: "my_custom_node"
    to: "review"
  - from: "review"
    to: "output"
    condition: "approved"
  - from: "review"
    to: "understand"
    condition: "rejected"
    label: "驳回重做"

# 定义触发条件
trigger:
  taskTypes: ["custom-task"]
  tags: ["my-workflow"]
```

**自定义工作流模板功能**：
- 从节点库拖拽组合
- 支持自定义节点
- 支持条件分支和循环
- 支持保存为可复用模板
- 支持版本管理
- 支持分享给团队

---

### 3.3 模式选择决策树

```typescript
// 根据任务特征选择工作流模式
function selectWorkflowPattern(features: TaskFeatures): WorkflowPattern {
  // 高质量要求 → 三权分立
  if (features.qualityRequirement === 'critical') {
    return 'three-powers';
  }

  // 可分解 + 可并行 → 蜂群并行
  if (features.canDecompose && features.canParallel) {
    return 'swarm';
  }

  // 需要多方协商 → 协商共识
  if (features.needsNegotiation) {
    return 'negotiate';
  }

  // 开发任务 + 高质量 → TDD
  if (features.type === 'coding' && features.qualityRequirement === 'high') {
    return 'tdd';
  }

  // 新项目 + 需要审计 → 规范驱动
  if (features.projectType === 'greenfield' && features.needsAudit) {
    return 'spec-driven';
  }

  // 简单任务 → 快速通道
  if (features.complexity < 0.3) {
    return 'fast-track';
  }

  // 默认 → 三权分立（平衡）
  return 'three-powers';
}
```

---

### 3.4 角色与权限系统（可配置）

角色和权限是可配置的模块，用户可以根据工作流需要自由定义。

#### 3.4.1 角色定义

```typescript
// 角色定义（可自定义）
interface Role {
  id: string;
  name: string;
  description: string;

  // 该角色可以执行的节点类型
  allowedNodes: NodeCategory[];

  // 该角色的能力标签
  capabilities: string[];

  // 角色优先级（用于冲突解决）
  priority: number;
}

// 预定义角色模板
const BUILTIN_ROLES: Record<string, Role> = {
  // 三权分立模式角色
  planner: {
    id: 'planner',
    name: '规划',
    description: '负责任务规划和分配',
    allowedNodes: ['input', 'planning', 'coordinate'],
    capabilities: ['analyze', 'design', 'decompose', 'assign'],
    priority: 3
  },
  reviewer: {
    id: 'reviewer',
    name: '审核',
    description: '负责质量把关和审批',
    allowedNodes: ['review', 'decision'],
    capabilities: ['review', 'validate', 'approve', 'reject'],
    priority: 4
  },
  dispatcher: {
    id: 'dispatcher',
    name: '调度',
    description: '负责资源调度和协调',
    allowedNodes: ['coordinate', 'output'],
    capabilities: ['assign', 'aggregate', 'dispatch'],
    priority: 2
  },

  // 执行组角色
  developer: {
    id: 'developer',
    name: '开发者',
    description: '负责代码实现',
    allowedNodes: ['execution', 'review'],
    capabilities: ['code', 'test', 'debug', 'refactor'],
    priority: 1
  },
  dataEngineer: {
    id: 'dataEngineer',
    name: '数据工程师',
    description: '负责数据处理',
    allowedNodes: ['execution'],
    capabilities: ['transform', 'query', 'analyze'],
    priority: 1
  },
  docWriter: {
    id: 'docWriter',
    name: '文档工程师',
    description: '负责文档生成',
    allowedNodes: ['execution', 'output'],
    capabilities: ['generate', 'format'],
    priority: 1
  },
  compliance: {
    id: 'compliance',
    name: '合规专员',
    description: '负责安全审计',
    allowedNodes: ['review'],
    capabilities: ['security-audit', 'compliance-check'],
    priority: 2
  },
  deployer: {
    id: 'deployer',
    name: '部署专员',
    description: '负责发布上线',
    allowedNodes: ['execution', 'output'],
    capabilities: ['build', 'deploy', 'monitor'],
    priority: 1
  }
};
```

#### 3.4.2 权限矩阵（可配置）

```typescript
// 权限定义
interface Permission {
  // 可以向谁发送消息/任务
  canSendTo: string[];

  // 可以从谁接收消息/任务
  canReceiveFrom: string[];

  // 可以访问的记忆类型
  canAccessMemory: MemoryType[];

  // 可以执行的决策
  canDecide: DecisionType[];

  // 是否可以创建/销毁 Agent
  canManageAgents: boolean;

  // 是否可以修改工作流
  canModifyWorkflow: boolean;
}

// 权限矩阵模板
const PERMISSION_TEMPLATES = {
  // 三权分立模式权限
  'three-powers': {
    planner: {
      canSendTo: ['reviewer', 'dispatcher'],
      canReceiveFrom: ['dispatcher'],
      canAccessMemory: ['context', 'knowledge'],
      canDecide: ['plan', 'assign'],
      canManageAgents: false,
      canModifyWorkflow: false
    },
    reviewer: {
      canSendTo: ['planner', 'dispatcher'],
      canReceiveFrom: ['planner'],
      canAccessMemory: ['context', 'execution', 'knowledge'],
      canDecide: ['approve', 'reject'],
      canManageAgents: false,
      canModifyWorkflow: false
    },
    dispatcher: {
      canSendTo: ['planner', 'reviewer', 'developer', 'dataEngineer', 'docWriter', 'compliance', 'deployer'],
      canReceiveFrom: ['reviewer', 'developer', 'dataEngineer', 'docWriter', 'compliance', 'deployer'],
      canAccessMemory: ['all'],
      canDecide: ['dispatch', 'aggregate'],
      canManageAgents: true,
      canModifyWorkflow: false
    }
  },

  // 蜂群并行模式权限（扁平化）
  'swarm': {
    queen: {
      canSendTo: ['*'],
      canReceiveFrom: ['*'],
      canAccessMemory: ['all'],
      canDecide: ['all'],
      canManageAgents: true,
      canModifyWorkflow: true
    },
    worker: {
      canSendTo: ['queen'],
      canReceiveFrom: ['queen'],
      canAccessMemory: ['context', 'working'],
      canDecide: [],
      canManageAgents: false,
      canModifyWorkflow: false
    }
  },

  // 扁平协作模式（无层级）
  'flat': {
    member: {
      canSendTo: ['*'],
      canReceiveFrom: ['*'],
      canAccessMemory: ['all'],
      canDecide: ['vote'],
      canManageAgents: false,
      canModifyWorkflow: true
    }
  }
};
```

#### 3.4.3 节点到角色的映射

```yaml
# config/role-node-mapping.yaml
# 定义每种角色可以执行哪些节点

roles:
  planner:
    allowedNodes:
      - receive      # 接收任务
      - understand   # 理解需求
      - analyze      # 分析复杂度
      - design       # 技术设计
      - decompose    # 任务分解
      - spec         # 制定规范
      - assign       # 分配任务
    priority: 3

  reviewer:
    allowedNodes:
      - review       # 质量审核
      - validate     # 规范验证
      - security     # 安全审计
      - branch       # 决策分支
    priority: 4

  dispatcher:
    allowedNodes:
      - assign       # 分配任务
      - aggregate    # 汇总结果
      - parallel     # 并行调度
      - sequence     # 顺序调度
      - barrier      # 屏障同步
      - report       # 生成报告
      - notify       # 发送通知
    priority: 2

  developer:
    allowedNodes:
      - code         # 编码
      - test         # 测试
      - transform    # 数据转换
      - generate     # 内容生成
    priority: 1

  docWriter:
    allowedNodes:
      - generate     # 内容生成
      - transform    # 格式转换
      - report       # 报告生成
    priority: 1

  compliance:
    allowedNodes:
      - security     # 安全审计
      - validate     # 合规验证
      - review       # 审核检查
    priority: 2

  deployer:
    allowedNodes:
      - transform    # 构建
      - store        # 存储
      - notify       # 通知
    priority: 1
```

#### 3.4.4 自定义角色配置

用户可以定义自己的角色和权限：

```yaml
# custom-roles/my-team.yaml
name: "我的团队角色配置"
version: "1.0.0"

roles:
  # 自定义角色：技术负责人
  techLead:
    name: "技术负责人"
    description: "负责技术决策和代码审查"
    allowedNodes:
      - design
      - review
      - validate
      - branch
    capabilities:
      - architecture-decision
      - code-review
      - tech-approval
    priority: 5

  # 自定义角色：全栈开发
  fullStackDev:
    name: "全栈开发"
    description: "负责前后端开发"
    allowedNodes:
      - code
      - test
      - transform
      - generate
    capabilities:
      - frontend
      - backend
      - database
    priority: 1

# 自定义权限矩阵
permissions:
  techLead:
    canSendTo: ['*']
    canReceiveFrom: ['*']
    canAccessMemory: ['all']
    canDecide: ['approve', 'reject', 'override']
    canManageAgents: true
    canModifyWorkflow: true

  fullStackDev:
    canSendTo: ['techLead', 'fullStackDev']
    canReceiveFrom: ['techLead']
    canAccessMemory: ['context', 'execution', 'working']
    canDecide: []
    canManageAgents: false
    canModifyWorkflow: false

# 角色之间的通信规则
communication:
  - from: fullStackDev
    to: techLead
    type: request-review
  - from: techLead
    to: fullStackDev
    type: feedback
  - from: techLead
    to: techLead
    type: self-approve  # 技术负责人可以自我审批
```

#### 3.4.5 工作流模式与角色配置绑定

```typescript
// 工作流模式包含角色配置
interface WorkflowPattern {
  id: string;
  name: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];

  // 该模式使用的角色配置
  roles: RoleConfig;

  // 该模式使用的权限配置
  permissions: PermissionConfig;
}

// 示例：三权分立模式的角色配置
const threePowersPattern: WorkflowPattern = {
  id: 'three-powers',
  name: '三权分立',
  nodes: [...],
  edges: [...],
  roles: {
    // 使用预定义角色
    use: ['planner', 'reviewer', 'dispatcher', 'developer', 'compliance', 'deployer'],
    // 或自定义角色
    custom: []
  },
  permissions: {
    // 使用预定义权限模板
    template: 'three-powers',
    // 或覆盖特定权限
    overrides: {}
  }
};

// 示例：自定义模式的角色配置
const myCustomPattern: WorkflowPattern = {
  id: 'my-custom',
  name: '我的自定义模式',
  nodes: [...],
  edges: [...],
  roles: {
    use: [],
    custom: [
      { id: 'techLead', ... },
      { id: 'fullStackDev', ... }
    ]
  },
  permissions: {
    template: null,
    custom: {
      techLead: { ... },
      fullStackDev: { ... }
    }
  }
};
```

### 3.5 节点与河网的整合

详见 [Workflow-Nodes-Analysis.md](./Workflow-Nodes-Analysis.md) 第十二章

### 3.2 工作流节点类型

```typescript
// 节点类型定义
type NodeType =
  | 'agent'        // Agent 节点
  | 'mcp_server'   // MCP 服务器节点
  | 'skill'        // 技能节点
  | 'condition'    // 条件分支
  | 'parallel'     // 并行网关
  | 'loop'         // 循环节点
  | 'human'        // 人工审核
  | 'start'        // 开始节点
  | 'end';         // 结束节点

// 节点数据结构
interface GraphNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, any>;
    // Agent 节点特有
    agent?: {
      role: Department;
      skills: string[];
      mcps: string[];
    };
    // MCP 节点特有
    mcp?: {
      package: string;
      tools: string[];
    };
  };
}

// 边数据结构
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'default' | 'conditional' | 'animated';
  label?: string;
  condition?: string;  // 条件表达式
}
```

### 3.3 MCP 自动发现机制

```typescript
// MCP 元数据结构
interface MCPMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  provider: 'npm' | 'pip' | 'github' | 'custom';
  capabilities: string[];      // 能力标签
  compatible_roles: string[];  // 兼容的 Agent 角色
  required_mcps: string[];     // 依赖
  tools: MCPTool[];
  security: {
    verified: boolean;
    signature: string;
  };
}

// 自动发现流程
async function discoverMCPs(task: string): Promise<MCPMetadata[]> {
  // 1. 能力提取
  const capabilities = await extractCapabilities(task);

  // 2. 语义搜索
  const mcps = await vectorSearch(capabilities);

  // 3. 相关度排序
  const ranked = rankByRelevance(mcps, task);

  // 4. 依赖解析
  const resolved = await resolveDependencies(ranked);

  return resolved;
}
```

---

## 四、API 设计

### 4.1 RESTful API

```
POST   /api/workflows              # 创建工作流
GET    /api/workflows/:id          # 获取工作流
PUT    /api/workflows/:id          # 更新工作流
DELETE /api/workflows/:id          # 删除工作流
POST   /api/workflows/:id/execute  # 执行工作流

POST   /api/teams                  # 创建团队
GET    /api/teams/:id              # 获取团队状态
POST   /api/teams/:id/scale        # 动态扩缩容

GET    /api/mcp/search             # 搜索 MCP
POST   /api/mcp/install            # 安装 MCP
GET    /api/mcp/installed          # 已安装列表

GET    /api/tasks                  # 任务列表
GET    /api/tasks/:id/status       # 任务状态
POST   /api/tasks/:id/approve      # 审核批准
POST   /api/tasks/:id/reject       # 审核驳回
```

### 4.2 WebSocket 事件

```typescript
// 客户端订阅事件
socket.on('task:created', (task) => {});
socket.on('task:progress', (progress) => {});
socket.on('task:completed', (result) => {});
socket.on('agent:status', (status) => {});
socket.on('workflow:node:active', (nodeId) => {});

// 服务端推送
socket.emit('subscribe', { taskId: string });
socket.emit('unsubscribe', { taskId: string });
```

---

## 五、数据库设计

### 5.1 核心表结构

```sql
-- 工作流表
CREATE TABLE workflows (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  graph JSONB NOT NULL,        -- ReactFlow 图数据
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 团队表
CREATE TABLE teams (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent 实例表
CREATE TABLE agent_instances (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id),
  role VARCHAR(50) NOT NULL,   -- 角色类型
  status VARCHAR(50) DEFAULT 'idle',
  skills JSONB,                -- 技能列表
  mcps JSONB,                  -- MCP 列表
  created_at TIMESTAMP DEFAULT NOW()
);

-- 任务表
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  team_id UUID REFERENCES teams(id),
  status VARCHAR(50) DEFAULT 'pending',
  -- 状态: pending, planning, reviewing, executing, completed, rejected
  input JSONB,
  output JSONB,
  checkpoints JSONB,           -- 时间旅行快照
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- 审计日志
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  stage VARCHAR(50) NOT NULL,  -- 规划/审核/执行/反馈
  content JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 六、开发计划

### Phase 1: 基础框架 (2周)

- [x] 项目初始化
- [ ] ReactFlow 工作流画布
- [ ] 节点拖拽和连线
- [ ] 工作流保存/加载

### Phase 2: 核心功能 (3周)

- [ ] 三权分立协调系统
- [ ] 河网同步系统（主流 + 支流）
- [ ] 动态团队管理
- [ ] 任务执行引擎
- [ ] 实时状态推送

### Phase 3: 高级功能 (3周)

- [ ] 同步点机制
- [ ] 冲突检测与解决
- [ ] MCP 自动发现机制
- [ ] 时间旅行调试
- [ ] 实时监控看板
- [ ] 审计日志系统

### Phase 4: 优化完善 (2周)

- [ ] 性能优化
- [ ] 安全加固
- [ ] 文档完善
- [ ] 测试覆盖

---

## 七、相关设计文档

| 文档 | 描述 |
|------|------|
| [River-Network-Design.md](./River-Network-Design.md) | 河网同步系统详细设计 |
| [River-Memory-Design.md](./River-Memory-Design.md) | 河流式记忆系统设计 |
| [Workflow-Nodes-Analysis.md](./Workflow-Nodes-Analysis.md) | 工作流节点抽象设计 |
| [Node-Implementation-Details.md](./Node-Implementation-Details.md) | 节点实现细节 |

---

## 八、参考项目

| 项目 | Stars | 借鉴内容 |
|------|-------|---------|
| [LangGraph](https://github.com/langchain-ai/langgraph) | 127K+ | 工作流引擎、状态机 |
| [LangGraph Studio](https://github.com/langchain-ai/langgraph-studio) | - | 图可视化、时间旅行 |
| [三权分立 Edict](https://github.com/cft0808/edict) | - | 分权制衡、看板设计 |
| [Claude Flow](https://github.com/ruvnet/claude-flow) | 14K+ | 多 Agent 编排 |
| [ToWow](https://github.com/NatureBlueee/Towow) | - | Agent 协商协议 |
| [ReactFlow](https://github.com/xyflow/xyflow) | 25K+ | 图编辑器 |

---

*文档版本: 1.0.0*
*最后更新: 2026-03-07*
