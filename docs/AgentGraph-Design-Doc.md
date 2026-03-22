# AgentGraph 设计文档

> 版本: 0.1.0
> 日期: 2026-03-07
> 状态: 草稿

## 一、项目概述

### 1.1 愿景

AgentGraph 致力于解决 AI Agent 编排的核心问题：
- **如何根据任务需求自动化设计工作流？**
- **如何让用户方便地自定义和管理自定义工作流？**
- **如何实现团队内部的高效信息互通？**
- **如何动态管理团队成员？**

### 1.2 核心定位

AgentGraph 不是单一的工作流模式（如三省六部），而是一个**工作流元平台**，能够：
1. 根据任务特征自动推荐/生成合适的工作流
2. 支持用户自定义工作流模板
3. 动态管理 Agent 团队
4. 自动发现和分配 MCP/Skills

### 1.3 与现有工具的关系

| 工具 | 定位 | AgentGraph 的关系 |
|------|------|------------------|
| LangGraph | 状态机编排引擎 | 底层编排引擎之一 |
| Claude Flow | Swarm 蜂群模式 | 工作流模板之一 |
| ToWow | Agent 协商协议 | 协商层实现参考 |
| OpenSpec | 规范驱动 | 规范管理层参考 |
| Superpowers | TDD 方法论 | 执行方法论参考 |
| GSD | 上下文工程 | 上下文管理参考 |

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AgentGraph 平台                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    用户交互层                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ CLI 界面 │  │ Web 看板 │  │ 图形编辑器│  │ API 接口 │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    工作流管理层                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │工作流推荐│  │工作流设计│  │工作流执行│  │工作流监控│   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    团队管理层                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │Agent 池  │  │动态调度  │  │权限控制  │  │绩效监控  │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    能力层                                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │MCP 注册表│  │Skills 库 │  │工具市场  │  │依赖管理  │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    编排引擎层                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │LangGraph │  │自定义引擎│  │子代理管理│  │状态持久化│   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块

#### 2.2.1 工作流管理层

**工作流推荐引擎**
- 输入：任务描述、上下文、历史偏好
- 处理：任务特征提取 → 模式匹配 → 推荐排序
- 输出：推荐的工作流模板列表

**工作流设计器**
- DSL 定义（领域特定语言）
- 图形化编辑器（可选）
- 模板导入/导出

**工作流执行器**
- 支持多种执行模式（串行、并行、混合）
- 断点续传
- 错误恢复

#### 2.2.2 团队管理层

**Agent 池**
- 预定义 Agent 模板库
- Agent 能力画像
- 热加载/卸载

**动态调度器**
- 任务分解
- Agent 匹配
- 负载均衡

**权限控制**
- 通信矩阵
- 操作权限
- 数据访问控制

---

## 三、工作流推荐引擎

### 3.0 设计理念

工作流推荐引擎是 AgentGraph 的核心创新点，它解决了"选择哪个工作流"的问题。

**设计目标**：
1. **零配置启动** - 用户无需了解各种工作流模式，系统自动推荐
2. **可解释性** - 推荐理由清晰可见
3. **可覆盖** - 用户可以手动选择不同的工作流
4. **持续学习** - 根据用户选择反馈优化推荐

### 3.1 任务特征向量

```python
class TaskFeatures:
    # 复杂度特征
    file_count: int           # 涉及文件数
    estimated_loc: int        # 预估代码行数
    dependency_complexity: float  # 依赖复杂度 (0-1)

    # 类型特征 (独热编码)
    is_code_development: bool
    is_code_review: bool
    is_data_analysis: bool
    is_documentation: bool
    is_research: bool
    is_testing: bool
    is_security_audit: bool

    # 协作特征
    needs_negotiation: bool   # 是否需要协商
    needs_review: bool        # 是否需要审核
    can_parallelize: bool     # 是否可并行
    needs_iteration: bool     # 是否需要迭代

    # 上下文特征
    estimated_tokens: int     # 预估 token 数
    needs_persistence: bool   # 是否需要持久化
    has_history: bool         # 是否有历史上下文

    # 优先级
    priority: 'critical' | 'high' | 'normal' | 'low'
```

### 3.2 工作流评分模型

```python
class WorkflowScorer:
    def __init__(self):
        self.workflow_profiles = {
            'spec-driven': {
                'complexity_range': (0.5, 1.0),  # 适合中高复杂度
                'types': ['code_development', 'documentation'],
                'needs_review': True,
                'context_weight': 0.8,
            },
            'collaborative': {
                'complexity_range': (0.3, 0.9),
                'types': ['research', 'data_analysis'],
                'needs_negotiation': True,
                'context_weight': 0.6,
            },
            'swarm': {
                'complexity_range': (0.4, 1.0),
                'types': ['code_development', 'testing'],
                'can_parallelize': True,
                'context_weight': 0.7,
            },
            'check-balance': {
                'complexity_range': (0.6, 1.0),
                'types': ['code_review', 'security_audit'],
                'needs_review': True,
                'priority': ['critical', 'high'],
            },
            'tdd': {
                'complexity_range': (0.2, 0.8),
                'types': ['code_development', 'testing'],
                'context_weight': 0.5,
            },
        }

    def score(self, features: TaskFeatures, workflow_id: str) -> float:
        profile = self.workflow_profiles[workflow_id]
        score = 0.0

        # 复杂度匹配
        c_min, c_max = profile['complexity_range']
        complexity = features.dependency_complexity
        if c_min <= complexity <= c_max:
            score += 0.3

        # 类型匹配
        if any(getattr(features, f'is_{t}', False) for t in profile.get('types', [])):
            score += 0.3

        # 协作需求匹配
        if profile.get('needs_review') == features.needs_review:
            score += 0.2

        # 优先级匹配
        if 'priority' in profile and features.priority in profile['priority']:
            score += 0.2

        return score
```

### 3.3 推荐流程

```
用户输入任务
    │
    ↓
┌─────────────────┐
│ 任务解析        │ - 提取关键词、识别意图
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 特征提取        │ - 计算各维度特征值
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 工作流评分      │ - 对每个工作流打分
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Top-K 推荐      │ - 返回前 K 个推荐
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 推荐解释        │ - 生成推荐理由
└─────────────────┘
```

### 3.4 示例输出

```json
{
  "recommendations": [
    {
      "workflow_id": "tdd",
      "score": 0.85,
      "reason": "任务涉及代码开发，复杂度中等，适合 TDD 流程"
    },
    {
      "workflow_id": "spec-driven",
      "score": 0.72,
      "reason": "项目较大，建议采用规范驱动确保质量"
    },
    {
      "workflow_id": "swarm",
      "score": 0.65,
      "reason": "任务可并行分解，蜂群模式可加速执行"
    }
  ],
  "auto_select": "tdd",
  "confidence": 0.85
}
```

---

## 四、工作流模式库

### 3.1 内置工作流模式

#### 3.1.1 规范驱动型（Spec-Driven）

适用场景：新项目、大型系统、需要审计的项目

```
需求分析 → 规范制定 → 技术设计 → 任务分解 → 执行 → 验证
    ↑________________________________↓
           (可选：迭代循环)
```

参考实现：Spec-Kit, OpenSpec

#### 3.1.2 协作协商型（Collaborative）

适用场景：需要多方协商、自由讨论的任务

```
┌─────────────────────────────────────┐
│           协商空间                   │
│  ┌─────┐  ┌─────┐  ┌─────┐        │
│  │Agent│←→│Agent│←→│Agent│        │
│  └─────┘  └─────┘  └─────┘        │
│      ↓         ↓         ↓         │
│  ┌─────────────────────────┐       │
│  │       共识达成          │       │
│  └─────────────────────────┘       │
└─────────────────────────────────────┘
```

参考实现：ToWow, AutoGen

#### 3.1.3 蜂群并行型（Swarm）

适用场景：可并行执行的大任务

```
          ┌─────────────┐
          │  Queen Agent │
          │   (协调者)   │
          └──────┬──────┘
                 │
    ┌────────────┼────────────┐
    ↓            ↓            ↓
┌───────┐  ┌───────┐  ┌───────┐
│Worker1│  │Worker2│  │Worker3│
└───────┘  └───────┘  └───────┘
    ↓            ↓            ↓
    └────────────┼────────────┘
                 ↓
          ┌─────────────┐
          │   结果汇总   │
          └─────────────┘
```

参考实现：Claude Flow

#### 3.1.4 审核制衡型（Check-Balance）

适用场景：需要质量保障的关键任务

```
规划层 → 审核层 → 执行层
   ↑        │
   └────────┘ (封驳打回)
```

参考实现：三省六部（Edict）

#### 3.1.5 TDD 开发型（TDD）

适用场景：代码开发任务

```
头脑风暴 → 编写测试 → 实现代码 → 运行测试 → 代码审查
                ↑__________________↓
                      (红绿重构)
```

参考实现：Superpowers

### 3.2 工作流选择决策树

```
任务输入
    │
    ├─ 任务复杂度评估
    │   ├─ 简单（单文件/小修改）→ 单 Agent 直接执行
    │   ├─ 中等（功能模块）→ 规范驱动型
    │   └─ 复杂（系统级）→ 继续判断
    │
    ├─ 任务类型判断
    │   ├─ 代码开发 → TDD 开发型
    │   ├─ 分析调研 → 协作协商型
    │   ├─ 关键任务 → 审核制衡型
    │   └─ 可并行任务 → 蜂群并行型
    │
    └─ 上下文窗口评估
        ├─ 短会话 → 直接执行
        └─ 长会话 → 启用上下文管理（GSD 模式）
```

---

## 五、元工作流设计

### 5.1 概念

**元工作流（Meta-Workflow）** 是"选择工作流的工作流"，用于根据任务特征自动选择最适合的工作流模式。

```
┌─────────────────────────────────────────────────────────────┐
│                      元工作流层                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   输入任务 ─→ 特征分析 ─→ 工作流匹配 ─→ 执行推荐的工作流    │
│                  │              │                          │
│                  ↓              ↓                          │
│           ┌──────────┐   ┌──────────┐                      │
│           │ 特征向量 │   │ 匹配得分 │                      │
│           └──────────┘   └──────────┘                      │
│                                                             │
│   工作流模式库:                                              │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│   │Spec-    │ │Collab-  │ │ Swarm   │ │Check-   │        │
│   │Driven   │ │orative  │ │         │ │Balance  │        │
│   └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐                    │
│   │  TDD    │ │  GSD    │ │ Custom  │                    │
│   └─────────┘ └─────────┘ └─────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 元工作流 DSL

```yaml
# meta-workflow.yaml
name: "adaptive-workflow-selector"
description: "根据任务特征自动选择工作流"

rules:
  # 规则 1: 高复杂度 + 代码开发 → Spec-Driven
  - condition: "complexity > 0.7 AND is_code_development"
    workflow: "spec-driven"
    confidence: 0.9

  # 规则 2: 需要审核 → Check-Balance
  - condition: "needs_review == true"
    workflow: "check-balance"
    confidence: 0.85

  # 规则 3: 可并行 + 大任务 → Swarm
  - condition: "can_parallelize == true AND estimated_tokens > 50000"
    workflow: "swarm"
    confidence: 0.8

  # 规则 4: 长会话 → GSD 模式叠加
  - condition: "estimated_tokens > 100000"
    workflow: "$current + gsd"  # 叠加 GSD 上下文管理
    confidence: 0.75

  # 默认规则
  - condition: "true"
    workflow: "spec-driven"
    confidence: 0.5

# 组合规则
combinations:
  - when: "complexity > 0.8 AND needs_review"
    use: ["spec-driven", "check-balance"]
    mode: "sequential"  # 先 spec-driven 规划，再 check-balance 审核
```

### 5.3 动态工作流组合

AgentGraph 支持工作流的**动态组合**，即根据任务需要组合多个工作流模式：

```typescript
interface WorkflowComposition {
  // 主工作流
  primary: Workflow;

  // 叠加的工作流（增强功能）
  overlays: {
    gsd?: {  // 上下文管理增强
      contextThreshold: number;
    };
    tdd?: {  // TDD 增强
      strict: boolean;
    };
  };

  // 前置/后置工作流
  preWorkflow?: Workflow;   // 如规范制定
  postWorkflow?: Workflow;  // 如质量审核
}
```

---

## 六、动态团队管理

### 4.1 Agent 能力画像

每个 Agent 包含以下属性：

```yaml
agent:
  id: "coder-001"
  name: "代码开发专家"
  type: "developer"

  capabilities:
    - code_generation
    - code_review
    - debugging
    - refactoring

  skills:
    - name: "python-expert"
      level: 5
    - name: "typescript-basic"
      level: 3

  tools:
    - mcp: "filesystem"
    - mcp: "github"
    - skill: "tdd-workflow"

  constraints:
    max_concurrent_tasks: 3
    preferred_context_size: 50000

  metadata:
    created_at: "2026-03-07"
    total_tasks_completed: 150
    success_rate: 0.95
```

### 4.2 动态调度算法

```
function scheduleTeam(task):
    1. 分析任务需求
       - 提取任务类型
       - 评估复杂度
       - 识别所需能力

    2. 匹配 Agent
       - 从 Agent 池中筛选
       - 按能力匹配度排序
       - 考虑负载均衡

    3. 组建团队
       - 确定团队规模
       - 分配角色和职责
       - 建立通信矩阵

    4. 执行监控
       - 跟踪任务进度
       - 动态调整团队
       - 处理异常情况
```

### 4.3 团队信息互通机制

**设计目标**：
1. **实时同步** - 团队状态变更即时通知
2. **选择性接收** - Agent 只接收相关消息
3. **可追溯** - 所有通信可审计
4. **高效** - 最小化通信开销

**通信模式**

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent 通信矩阵                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  模式 1: 直接通信 (Direct)                                   │
│  ┌─────┐         ┌─────┐                                   │
│  │  A  │ ──────→ │  B  │   一对一，点对点                   │
│  └─────┘         └─────┘                                   │
│                                                             │
│  模式 2: 广播通信 (Broadcast)                                │
│  ┌─────┐         ┌─────┐                                   │
│  │  A  │ ──┬──→ │  B  │                                   │
│  └─────┘   ├──→ │  C  │   一对多                           │
│            └──→ │  D  │                                   │
│                                                             │
│  模式 3: 共享状态 (Shared State)                             │
│  ┌─────┐         ┌─────────┐         ┌─────┐              │
│  │  A  │ ──→     │ Task    │     ←── │  B  │              │
│  └─────┘         │ List    │         └─────┘              │
│                  └─────────┘                               │
│                  (共享内存/文件)                             │
│                                                             │
│  模式 4: 发布订阅 (Pub/Sub)                                  │
│  ┌─────┐                    ┌─────────┐                    │
│  │  A  │ ──publish(event)──→│ Event   │                    │
│  └─────┘                    │ Bus     │                    │
│                             │         │                    │
│  ┌─────┐  ←──subscribe──    │         │                    │
│  │  B  │                    └─────────┘                    │
│  └─────┘                                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**消息协议**

```typescript
// 基础消息结构
interface BaseMessage {
  id: string;              // 消息唯一 ID
  type: MessageType;
  from: string;            // 发送者 Agent ID
  to: string | string[];   // 接收者 Agent ID(s) 或 '*' 表示广播
  timestamp: number;
  correlation_id?: string; // 关联消息 ID（用于请求-响应模式）
  priority: 'high' | 'normal' | 'low';
  ttl?: number;            // 消息存活时间（秒）
}

// 任务相关消息
interface TaskMessage extends BaseMessage {
  type: 'task_assign' | 'task_update' | 'task_complete' | 'task_failed';
  payload: {
    task_id: string;
    action: string;
    inputs: Record<string, any>;
    deadline?: number;
  };
}

// 查询/响应消息
interface QueryMessage extends BaseMessage {
  type: 'query' | 'response';
  payload: {
    query: string;
    context?: any;
  };
}

// 协商消息 (ToWow 风格)
interface NegotiationMessage extends BaseMessage {
  type: 'propose' | 'accept' | 'reject' | 'counter_offer';
  payload: {
    proposal_id: string;
    terms: Record<string, any>;
    reason?: string;
  };
}

// 心跳消息
interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  payload: {
    status: 'idle' | 'busy' | 'error';
    current_task?: string;
    load: number;  // 0-1
  };
}
```

**共享任务列表设计**

```typescript
interface SharedTaskList {
  // 任务结构
  tasks: Task[];

  // 操作
  claim(taskId: string, agentId: string): boolean;
  release(taskId: string, agentId: string): void;
  complete(taskId: string, result: any): void;
  fail(taskId: string, error: Error): void;

  // 依赖管理
  addDependency(taskId: string, dependsOn: string[]): void;
  getReadyTasks(): Task[];  // 返回可执行的任务

  // 事件
  on(event: 'task_claimed' | 'task_completed' | 'task_failed', callback: Function): void;
}

// 任务状态机
// pending → claimed → in_progress → completed
//                 ↘ failed
//                 ↘ cancelled
```

**通信矩阵配置**

```yaml
# communication-matrix.yaml
team: "development-team"

# 通信规则
rules:
  # 规划者可以向执行者分配任务
  - from: "planner"
    to: ["developer", "analyst"]
    allowed_types: ["task_assign", "query"]

  # 执行者可以向审核者提交结果
  - from: ["developer", "analyst"]
    to: "reviewer"
    allowed_types: ["task_complete", "query"]

  # 审核者可以向规划者反馈
  - from: "reviewer"
    to: "planner"
    allowed_types: ["task_complete", "task_failed"]

  # 所有人可以广播
  - from: "*"
    to: "*"
    allowed_types: ["broadcast"]
    requires_approval: false

  # 禁止越级通信
  - from: "developer"
    to: "planner"
    allowed_types: []  # 禁止直接通信
```

---

## 五、MCP/Skills 自动化

### 5.1 MCP 注册表设计

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Registry                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ 本地索引    │  │ 远程仓库    │  │ 社区市场    │        │
│  │ ~/.mcp/     │  │ GitHub等    │  │ mcp.market  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│         │                │                │                │
│         └────────────────┼────────────────┘                │
│                          ↓                                 │
│                  ┌─────────────┐                           │
│                  │ 统一搜索接口 │                           │
│                  └─────────────┘                           │
│                          ↓                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ MCP 元数据                                            │ │
│  │ - name, version, description                          │ │
│  │ - capabilities (提供的工具列表)                        │ │
│  │ - dependencies (依赖的其他 MCP)                        │ │
│  │ - compatibility (兼容的平台/模型)                      │ │
│  │ - rating, downloads                                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 自动发现和安装流程

```
1. 任务分析阶段
   └─ 识别任务所需的能力
       └─ 查询 MCP 注册表
           └─ 生成推荐列表

2. 安装决策
   ├─ 自动安装（已信任的 MCP）
   └─ 用户确认（新的 MCP）

3. 安装执行
   ├─ 下载/克隆
   ├─ 依赖检查
   ├─ 配置生成
   └─ 权限设置

4. 分配给 Agent
   └─ 更新 Agent 的工具列表
```

---

## 六、用户自定义工作流

### 6.1 工作流 DSL

```yaml
# workflow.yaml
name: "code-review-pipeline"
description: "代码审查流水线"
version: "1.0.0"

triggers:
  - type: "webhook"
    path: "/review"
  - type: "schedule"
    cron: "0 9 * * *"

agents:
  - id: "reviewer"
    template: "code-reviewer"
    tools: ["github", "filesystem"]

  - id: "security"
    template: "security-auditor"
    tools: ["security-scanner"]

  - id: "reporter"
    template: "documentation-writer"

flow:
  - step: "analyze"
    agent: "reviewer"
    action: "review_code"
    inputs:
      repo: "${trigger.repo}"

  - step: "security-check"
    agent: "security"
    action: "scan"
    depends_on: ["analyze"]

  - step: "report"
    agent: "reporter"
    action: "generate_report"
    depends_on: ["analyze", "security-check"]

outputs:
  - type: "file"
    path: "./reports/${date}.md"
  - type: "notification"
    channel: "slack"
```

### 6.2 图形化编辑器设计

**核心组件**

1. **节点面板**
   - Agent 节点
   - 条件节点
   - 并行节点
   - 工具节点

2. **画布区域**
   - 拖拽放置
   - 连线绘制
   - 缩放平移

3. **属性面板**
   - 节点配置
   - 参数设置
   - 条件表达式

4. **调试工具**
   - 单步执行
   - 断点设置
   - 变量查看

**技术选型**

```
前端框架: React + TypeScript
图形库: ReactFlow / X6
状态管理: Zustand
样式: Tailwind CSS
```

### 6.3 模板市场

```
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Template Market                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ 🏷️ 代码审查     │  │ 🏷️ 数据分析     │                  │
│  │ 自动化审查流水线│  │ 多源数据聚合    │                  │
│  │ ⭐ 4.8  📥 1.2k │  │ ⭐ 4.6  📥 890  │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ 🏷️ API 开发     │  │ 🏷️ 文档生成     │                  │
│  │ 全栈 API 开发流 │  │ 自动文档维护    │                  │
│  │ ⭐ 4.9  📥 2.1k │  │ ⭐ 4.7  📥 1.5k │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  [搜索...]                              [筛选] [排序]       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、实现路线图

### Phase 1: 核心框架 (MVP)

- [ ] 基础 Agent 管理
- [ ] 简单工作流执行
- [ ] CLI 界面
- [ ] 本地 MCP 支持

### Phase 2: 工作流引擎

- [ ] 内置工作流模板库
- [ ] 工作流推荐引擎
- [ ] 动态团队调度
- [ ] Web 看板

### Phase 3: 用户自定义

- [ ] 工作流 DSL
- [ ] 图形化编辑器
- [ ] 模板市场
- [ ] 版本控制

### Phase 4: 生态扩展

- [ ] MCP/Skills 自动发现
- [ ] 插件系统
- [ ] 多平台集成
- [ ] 企业级功能

---

## 八、关键研究发现

### 8.1 LangGraph 深度分析

**LangGraph** 是 LangChain 生态中的核心工作流编排框架，采用有向图架构：

**核心概念**
- **StateGraph**: 状态图是核心抽象，通过节点和边构建循环工作流
- **节点 (Nodes)**: 处理状态的函数，签名模式为 `State -> Partial[State]`
- **边 (Edges)**: 控制节点之间的执行流程，包括静态边和条件边
- **状态 (State)**: 使用 TypedDict 或 Pydantic 模型定义

**执行模型**
- 采用 **Super-step** 执行模型，每个超级步骤后自动保存 checkpoint
- 原生支持并行执行多个节点
- 支持循环和条件分支

**LangSmith Studio 功能**
1. **图结构可视化** - 直观展示节点和边的连接关系
2. **实时执行追踪** - 流式显示每个步骤的执行情况
3. **交互式调试** - 可随时中断执行进入调试模式
4. **状态操作** - 可直接修改特定步骤的 Agent 响应
5. **代码热重载** - 检测代码变更并支持重新运行节点

**状态管理机制**
- **Checkpointing**: 每个超级步骤后自动保存状态快照
- **Reducer 模式**: 状态更新通过 reducer 函数合并
- **状态通道**: LastValue, BinaryOperatorAggregate, EphemeralValue, NamedBarrierValue
- **Human-in-the-Loop**: 可在特定节点中断等待人工输入

**与其他框架对比**
| 特性 | LangGraph | CrewAI | AutoGen |
|------|-----------|--------|---------|
| 编排模式 | 图驱动（状态机） | 角色扮演团队 | 对话式协作 |
| 控制能力 | 高度可控 | 中等 | 较低 |
| 状态管理 | 丰富的持久化 | 内置记忆系统 | 对话历史 |
| 可视化 | LangSmith Studio | 有限支持 | 有限支持 |
| 并行执行 | 原生支持 | 有限支持 | 较少支持 |

**AgentGraph 借鉴点**
- 采用 **StateGraph** 作为核心工作流抽象
- 实现 **Checkpoint** 持久化机制
- 开发类似 **LangSmith Studio** 的可视化调试界面
- 原生支持 **Human-in-the-Loop**

### 8.2 MCP Registry 生态

**官方 MCP 注册表** 已于 2025 年推出，是 MCP 服务器的官方发现平台：

**核心能力**
- **统一索引** - 类似 npm/Maven 的包管理体验
- **元数据标准化** - name, version, capabilities, dependencies
- **安全网关** - 验证和审核机制

**现有资源**
1. [官方 MCP Registry](https://registry.modelcontextprotocol.io/)
2. [GitHub MCP Registry](https://github.blog/changelog/2025-09-16-github-mcp-registry-the-fastest-way-to-discover-ai-tools/)
3. 社区维护的 awesome-mcp-servers

**AgentGraph 集成方案**
```
AgentGraph MCP 层
├── 本地缓存 (~/.agentgraph/mcp-cache/)
├── 官方 Registry 同步
├── GitHub 源支持
└── 自定义源配置
```

### 8.3 工作流自动化方法论

**任务特征提取维度**

1. **复杂度维度**
   - 文件数量
   - 代码行数
   - 依赖关系复杂度
   - 时间估算

2. **任务类型维度**
   - 代码开发 vs 代码审查
   - 数据分析 vs 文档生成
   - 单一领域 vs 跨领域

3. **协作需求维度**
   - 是否需要协商
   - 是否需要审核
   - 是否可并行

4. **上下文需求维度**
   - 会话长度预估
   - 状态持久化需求
   - 历史依赖程度

**工作流匹配算法**

```python
def match_workflow(task):
    features = extract_features(task)

    scores = {}
    for workflow in WORKFLOW_TEMPLATES:
        score = 0
        # 复杂度匹配
        score += complexity_match(features.complexity, workflow.optimal_complexity)
        # 类型匹配
        score += type_match(features.task_type, workflow.supported_types)
        # 协作需求匹配
        score += collaboration_match(features.collab_needs, workflow.collab_model)
        # 上下文匹配
        score += context_match(features.context_needs, workflow.context_handling)

        scores[workflow.id] = score

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

### 8.4 动态团队调度算法

**Agent 匹配策略**

```
输入: 任务需求 R = {r1, r2, ..., rn} (能力需求列表)
     Agent 池 A = {a1, a2, ..., am}

输出: 最优团队 T ⊆ A

算法:
1. 能力覆盖度计算
   coverage(ai, R) = |capabilities(ai) ∩ R| / |R|

2. 负载均衡因子
   load_factor(ai) = current_tasks(ai) / max_tasks(ai)

3. 综合评分
   score(ai) = w1 * coverage(ai, R) - w2 * load_factor(ai) + w3 * success_rate(ai)

4. 贪心选择
   T = {}
   uncovered = R
   while uncovered ≠ ∅:
       best = argmax{score(ai) | capabilities(ai) ∩ uncovered ≠ ∅}
       T = T ∪ {best}
       uncovered = uncovered - capabilities(best)

5. 团队规模优化
   if |T| > max_team_size:
       T = merge_similar_agents(T)
```

### 8.5 图形化编辑器技术选型

**推荐方案对比**

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| ReactFlow | 生态成熟、文档完善 | 定制性一般 | ⭐⭐⭐⭐ |
| X6 (AntV) | 功能强大、国内支持 | 学习曲线陡 | ⭐⭐⭐⭐ |
| Rete.js | 模块化好 | 社区较小 | ⭐⭐⭐ |
| elk-graph | 自动布局强 | 只做布局 | ⭐⭐⭐ |

**推荐技术栈**
```
前端框架: React 18 + TypeScript
图形引擎: ReactFlow (主) + elk (自动布局)
状态管理: Zustand
UI 组件: shadcn/ui + Tailwind CSS
代码生成: Prettier + AST 解析
```

---

## 九、设计决策记录

### ADR-001: 工作流引擎选择

**决策**: 采用 **多引擎适配器** 模式

**理由**:
- 不同场景需要不同的编排模式
- LangGraph 适合状态机场景
- 自定义引擎适合协商场景
- 保持灵活性，不绑定单一引擎

### ADR-002: MCP 集成策略

**决策**: 优先使用 **官方 MCP Registry**

**理由**:
- 官方 Registry 已成熟，2026年持续更新
- 避免重复造轮子
- 保持与生态的兼容性

### ADR-003: 图形编辑器定位

**决策**: 作为 **可选增强功能**，非核心依赖

**理由**:
- DSL 优先，确保可编程性
- 图形编辑器增加开发成本
- 可通过社区贡献逐步完善

---

## 十、核心 API 设计

### 10.1 工作流 API

```typescript
// 工作流定义
interface Workflow {
  id: string;
  name: string;
  version: string;
  description?: string;

  // 触发器
  triggers: Trigger[];

  // Agent 定义
  agents: AgentConfig[];

  // 流程定义
  flow: FlowStep[];

  // 输出配置
  outputs: OutputConfig[];
}

// 流程步骤
interface FlowStep {
  id: string;
  type: 'agent' | 'condition' | 'parallel' | 'loop' | 'subworkflow';
  agent?: string;  // 引用的 Agent ID
  action?: string; // 执行的动作
  inputs?: Record<string, any>;
  depends_on?: string[];

  // 条件分支
  condition?: {
    expression: string;
    then: FlowStep[];
    else?: FlowStep[];
  };

  // 并行执行
  parallel?: FlowStep[];
}

// 工作流执行器 API
class WorkflowExecutor {
  // 执行工作流
  async execute(workflow: Workflow, inputs: any): Promise<ExecutionResult>;

  // 暂停/恢复
  async pause(executionId: string): Promise<void>;
  async resume(executionId: string): Promise<void>;

  // 取消
  async cancel(executionId: string): Promise<void>;

  // 获取状态
  async getStatus(executionId: string): Promise<ExecutionStatus>;
}
```

### 10.2 Agent API

```typescript
// Agent 配置
interface AgentConfig {
  id: string;
  name: string;
  template?: string;  // 引用模板

  // 能力定义
  capabilities: string[];

  // 工具配置
  tools: ToolConfig[];

  // 约束条件
  constraints: {
    maxConcurrentTasks: number;
    preferredContextSize: number;
    timeout: number;
  };

  // 提示词配置
  systemPrompt: string | PromptTemplate;
}

// Agent 管理器 API
class AgentManager {
  // 创建 Agent
  async create(config: AgentConfig): Promise<Agent>;

  // 获取 Agent
  async get(id: string): Promise<Agent>;

  // 列出所有 Agent
  async list(filter?: AgentFilter): Promise<Agent[]>;

  // 删除 Agent
  async delete(id: string): Promise<void>;

  // 更新 Agent 能力
  async updateCapabilities(id: string, capabilities: string[]): Promise<void>;

  // 分配工具
  async assignTool(agentId: string, tool: ToolConfig): Promise<void>;
}
```

### 10.3 团队 API

```typescript
// 团队配置
interface TeamConfig {
  id: string;
  name: string;

  // 成员
  members: TeamMember[];

  // 通信矩阵
  communicationMatrix: CommunicationRule[];

  // 调度策略
  scheduling: {
    strategy: 'round-robin' | 'capability-based' | 'load-balanced';
    maxTeamSize: number;
  };
}

// 团队成员
interface TeamMember {
  agentId: string;
  role: string;
  permissions: string[];
}

// 通信规则
interface CommunicationRule {
  from: string;  // Agent ID 或 "*"
  to: string;    // Agent ID 或 "*"
  allowed: boolean;
  messageTypes?: string[];  // 限制消息类型
}

// 团队管理器 API
class TeamManager {
  // 组建团队
  async assemble(requirement: TaskRequirement): Promise<Team>;

  // 解散团队
  async disband(teamId: string): Promise<void>;

  // 添加成员
  async addMember(teamId: string, member: TeamMember): Promise<void>;

  // 移除成员
  async removeMember(teamId: string, agentId: string): Promise<void>;

  // 发送消息
  async sendMessage(
    teamId: string,
    message: AgentMessage
  ): Promise<void>;

  // 获取团队状态
  async getStatus(teamId: string): Promise<TeamStatus>;
}
```

### 10.4 MCP/Skills API

```typescript
// MCP 注册表 API
class MCPRegistry {
  // 搜索 MCP
  async search(query: MCPQuery): Promise<MCPEntry[]>;

  // 安装 MCP
  async install(name: string, options?: InstallOptions): Promise<MCPInstance>;

  // 卸载 MCP
  async uninstall(name: string): Promise<void>;

  // 列出已安装
  async listInstalled(): Promise<MCPInstance[]>;

  // 推荐 MCP（基于任务）
  async recommend(task: TaskDescription): Promise<MCPEntry[]>;
}

// Skills 库 API
class SkillsLibrary {
  // 搜索 Skills
  async search(query: SkillQuery): Promise<Skill[]>;

  // 安装 Skill
  async install(skillId: string): Promise<void>;

  // 分配给 Agent
  async assignToAgent(skillId: string, agentId: string): Promise<void>;

  // 执行 Skill
  async execute(skillId: string, inputs: any): Promise<SkillResult>;
}
```

---

## 十一、CLI 命令设计

### 11.1 工作流命令

```bash
# 创建新工作流
agentgraph workflow create <name>
agentgraph workflow create my-flow --template=tdd-workflow

# 列出工作流
agentgraph workflow list

# 执行工作流
agentgraph workflow run <workflow-id>
agentgraph workflow run my-flow --input='{"repo": "owner/repo"}'

# 验证工作流
agentgraph workflow validate <workflow-file>

# 导出/导入
agentgraph workflow export <workflow-id> -o workflow.yaml
agentgraph workflow import workflow.yaml
```

### 11.2 Agent 命令

```bash
# 创建 Agent
agentgraph agent create <name> --template=developer
agentgraph agent create reviewer --capabilities=code-review,security

# 列出 Agent
agentgraph agent list
agentgraph agent list --status=active

# 查看 Agent 详情
agentgraph agent show <agent-id>

# 分配工具
agentgraph agent assign-tool <agent-id> github-mcp
```

### 11.3 团队命令

```bash
# 自动组建团队
agentgraph team assemble "分析这个项目的架构"

# 查看团队状态
agentgraph team status <team-id>

# 发送消息
agentgraph team message <team-id> --to=agent-1 --content="开始执行"

# 解散团队
agentgraph team disband <team-id>
```

### 11.4 MCP 命令

```bash
# 搜索 MCP
agentgraph mcp search "database"
agentgraph mcp search --capability=filesystem

# 安装 MCP
agentgraph mcp install github-mcp
agentgraph mcp install github-mcp --version=1.2.0

# 列出已安装
agentgraph mcp list

# 推荐 MCP
agentgraph mcp recommend "我需要访问 GitHub 和数据库"
```

---

## 十二、配置文件格式

### 12.1 全局配置

```yaml
# ~/.agentgraph/config.yaml
version: "1.0"

# 默认 LLM 配置
llm:
  provider: "anthropic"
  model: "claude-sonnet-4-6"
  api_key_env: "ANTHROPIC_API_KEY"

# MCP 注册表源
registries:
  - name: "official"
    url: "https://registry.modelcontextprotocol.io"
  - name: "github"
    url: "https://github.com/mcp-servers"

# 本地缓存
cache:
  directory: "~/.agentgraph/cache"
  max_size: "1GB"

# 日志
logging:
  level: "info"
  file: "~/.agentgraph/logs/agentgraph.log"
```

### 12.2 项目配置

```yaml
# .agentgraph/project.yaml
name: "my-project"
version: "1.0.0"

# 项目级 Agent
agents:
  - file: "./agents/reviewer.yaml"
  - file: "./agents/developer.yaml"

# 项目级工作流
workflows:
  - file: "./workflows/ci-pipeline.yaml"

# 项目级 MCP 配置
mcp:
  servers:
    - name: "project-database"
      type: "sqlite"
      config:
        path: "./data/project.db"

# 项目规范（可选）
spec:
  constitution: "./specs/constitution.md"
  templates_dir: "./specs/templates/"
```

### 12.3 Agent 模板示例

```yaml
# ~/.agentgraph/templates/developer.yaml
id: "developer"
name: "代码开发专家"
description: "专注于代码编写和重构的 Agent"

system_prompt: |
  你是一位资深的软件工程师，擅长编写高质量代码。
  你遵循以下原则：
  1. 代码可读性优先
  2. 测试驱动开发
  3. 持续重构

capabilities:
  - code_generation
  - code_review
  - debugging
  - refactoring
  - testing

default_tools:
  - filesystem
  - github
  - terminal

constraints:
  max_concurrent_tasks: 2
  preferred_context_size: 80000
  timeout: 300000
```

---

## 十三、监控和可观测性

### 13.1 指标收集

```typescript
interface Metrics {
  // 执行指标
  executions: {
    total: number;
    success: number;
    failed: number;
    avg_duration: number;
  };

  // Agent 指标
  agents: {
    active: number;
    idle: number;
    avg_load: number;
  };

  // 工作流指标
  workflows: {
    by_type: Record<string, number>;
    by_status: Record<string, number>;
  };

  // MCP 指标
  mcp: {
    calls: number;
    errors: number;
    avg_latency: number;
  };
}
```

### 13.2 Web 看板功能

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AgentGraph Dashboard                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │ 活跃工作流  │  │ 活跃 Agent  │  │ MCP 调用    │                │
│  │     12      │  │     8       │  │   1,234     │                │
│  └─────────────┘  └─────────────┘  └─────────────┘                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      工作流执行列表                           │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ 🔵 code-review-pipeline    运行中   45%  ████░░░░░░   │  │  │
│  │  │ 🟢 api-development         完成     100% ██████████   │  │  │
│  │  │ 🟡 data-analysis           等待中   0%   ░░░░░░░░░░   │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Agent 状态                               │  │
│  │  reviewer-1   🟢 空闲    developer-1   🔵 执行中             │  │
│  │  analyst-1    🔵 执行中  architect-1   🟢 空闲               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 十四、安全考虑

### 14.1 权限模型

```typescript
// 权限定义
interface Permission {
  resource: string;      // 资源类型：workflow, agent, mcp, file
  action: string;        // 动作：create, read, update, delete, execute
  scope: string;         // 范围：global, project, agent
}

// 角色定义
interface Role {
  id: string;
  name: string;
  permissions: Permission[];
}

// 预定义角色
const ROLES = {
  admin: {
    permissions: [{ resource: '*', action: '*', scope: 'global' }]
  },
  developer: {
    permissions: [
      { resource: 'workflow', action: '*', scope: 'project' },
      { resource: 'agent', action: 'read,execute', scope: 'project' },
    ]
  },
  viewer: {
    permissions: [
      { resource: '*', action: 'read', scope: 'project' }
    ]
  }
};
```

### 14.2 MCP 安全

```typescript
// MCP 安全配置
interface MCPSecurityConfig {
  // 信任级别
  trustLevel: 'verified' | 'community' | 'untrusted';

  // 权限限制
  permissions: {
    filesystem: {
      read: string[];   // 允许读取的路径
      write: string[];  // 允许写入的路径
    };
    network: {
      allowed_hosts: string[];
    };
  };

  // 审计
  audit: {
    enabled: boolean;
    log_all_calls: boolean;
  };
}
```

---

## 附录

### A. 参考资料

1. [LangGraph 官方文档](https://langchain-doc.cn/)
2. [Claude Flow GitHub](https://github.com/ruvnet/claude-flow)
3. [ToWow GitHub](https://github.com/NatureBlueee/Towow)
4. [OpenSpec GitHub](https://github.com/Fission-AI/OpenSpec)
5. [Superpowers GitHub](https://github.com/obra/superpowers)
6. [GSD GitHub](https://github.com/gsd-build/get-shit-done)

### B. 术语表

- **MCP**: Model Context Protocol，模型上下文协议
- **SDD**: Spec-Driven Development，规范驱动开发
- **DSL**: Domain Specific Language，领域特定语言
- **Agent**: 智能代理，具有特定能力的 AI 实体
- **Workflow**: 工作流，定义任务执行流程的模式

---

## 十五、总结与下一步

### 15.1 核心设计决策总结

| 问题 | 解决方案 | 关键技术 |
|------|---------|---------|
| 如何自动化设计工作流？ | 元工作流 + 特征匹配 | 任务特征向量、评分模型 |
| 如何让用户自定义工作流？ | DSL + 图形编辑器（可选） | YAML DSL、ReactFlow |
| 如何实现信息互通？ | 多模式通信 + 共享状态 | 消息协议、任务列表 |
| 如何动态管理团队？ | 能力画像 + 动态调度 | 匹配算法、负载均衡 |
| 如何自动发现 MCP/Skills？ | 官方 Registry + 本地缓存 | MCP 协议、依赖管理 |

### 15.2 与现有工具的差异化定位

```
                工作流灵活性
                    ↑
                    │
     AgentGraph ● │
                    │
    ───────────────┼───────────────→ 易用性
                    │
  LangGraph ●      │   ● n8n
         Claude Flow ●
                    │
```

**AgentGraph 的独特价值**：
1. **工作流推荐** - 不只是执行，还能智能推荐
2. **模式组合** - 支持多种工作流模式的动态组合
3. **生态集成** - 原生支持 MCP/Skills 自动发现
4. **可扩展** - 用户可自定义工作流模板

### 15.3 下一步行动

**短期（1-2 周）**
- [ ] 完成 MCP Registry 集成原型
- [ ] 实现基础的工作流推荐引擎
- [ ] 创建 3-5 个内置工作流模板

**中期（1-2 月）**
- [ ] 完成动态团队调度器
- [ ] 实现 DSL 解析器和执行引擎
- [ ] 开发 Web 监控看板

**长期（3-6 月）**
- [ ] 图形化工作流编辑器
- [ ] 模板市场和社区生态
- [ ] 企业级功能（权限、审计、多租户）

### 15.4 开放问题

1. **性能优化**：大规模 Agent 团队的调度效率
2. **成本控制**：Token 消耗的预测和优化
3. **质量保障**：如何确保工作流执行的正确性
4. **人机协作**：Human-in-the-loop 的最佳实践

---

## 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| 0.1.0 | 2026-03-07 | 初始设计文档 |

---

> **注意**：本文档是设计阶段的草稿，具体实现可能根据技术调研和用户反馈进行调整。
