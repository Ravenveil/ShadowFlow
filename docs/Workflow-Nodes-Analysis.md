# 工作流节点抽象设计

> **目标**：从现有工作流中提取通用原子节点，形成可组合的积木式系统，> **核心理念**：不是推荐固定模式，而是自动组装合适节点

---

## 一、现有工作流节点分析

## 一、现有工作流节点分析

### 1.1 Spec-Kit / OpenSpec（规范驱动型）

**节点拆解**：

| 节点 | 输入 | 输出 | 职责 |
|------|------|------|------|
| `Constitution` | 项目背景 | 全局约束规则 | 定义项目宪法 |
| `Specify` | 功能需求 | 功能规范(What/Why) | 描述做什么 |
| `Plan` | 功能规范 | 技术方案(How) | 设计怎么实现 |
| `Taskify` | 技术方案 | 任务清单 | 分解可执行任务 |
| `Implement` | 任务清单 | 代码/产物 | 执行实现 |
| `Verify` | 实现结果 | 验证报告 | 检查是否符合规范 |

**流程**: `Constitution → Specify → Plan → Taskify → Implement → Verify`

---

### 1.2 Superpowers（TDD 执行型）

**节点拆解**：

| 节点 | 输入 | 输出 | 职责 |
|------|------|------|------|
| `Brainstorm` | 任务描述 | 探索方案 | 头脑风暴、探索思路 |
| `WriteTest` | 探索方案 | 测试用例 | 先写测试（TDD）|
| `Implement` | 测试用例 | 实现代码 | 让测试通过 |
| `RunTest` | 实现代码 | 测试结果 | 运行测试验证 |
| `Refactor` | 测试通过代码 | 优化代码 | 重构优化 |
| `CodeReview` | 实现代码 | 审查报告 | 代码审查 |

**流程**: `Brainstorm → WriteTest → Implement → RunTest → (Refactor) → CodeReview`

---

### 1.3 GSD（上下文工程型）

**节点拆解**：

| 节点 | 输入 | 输出 | 职责 |
|------|------|------|------|
| `Discuss` | 用户需求 | 理解记录 | 讨论、澄清需求 |
| `Plan` | 理解记录 | 执行计划 | 制定执行计划 |
| `Execute` | 执行计划 | 执行结果 | 独立子代理执行 |
| `Verify` | 执行结果 | 验证报告 | 验证工作成果 |
| `Checkpoint` | 当前状态 | 持久化状态 | 保存检查点 |
| `Spawn` | 子任务 | 新 Agent | 创建独立子代理 |

**特点**: 每个节点都在独立的上下文中执行

---

### 1.4 三权分立（审核制衡型）

**节点拆解**：

| 节点 | 输入 | 输出 | 职责 |
|------|------|------|------|
| `Receive` | 用户指令 | 解析后的任务 | 接收并解析指令 |
| `Plan` | 解析后任务 | 执行方案 | 规划执行方案 |
| `Review` | 执行方案 | 审核结果 | 审核方案（可驳回）|
| `Dispatch` | 审核通过方案 | 分配给执行者 | 分配任务 |
| `Execute` | 分配的任务 | 执行结果 | 执行具体任务 |
| `Report` | 执行结果 | 汇总报告 | 汇总回报 |
| `Reject` | 审核不通过 | 驳回理由 | 驳回打回 |

**特点**: `Review` 节点可以触发 `Reject`，形成回环

---

### 1.5 Claude Flow / Swarm（蜂群并行型）

**节点拆解**：

| 节点 | 输入 | 输出 | 职责 |
|------|------|------|------|
| `Decompose` | 大任务 | 子任务列表 | 任务分解 |
| `Assign` | 子任务列表 | 分配方案 | 分配给 Worker |
| `Worker` | 单个子任务 | 子任务结果 | 并行执行 |
| `Aggregate` | 所有子结果 | 汇总结果 | 结果汇总 |
| `Queen` | 汇总结果 | 最终结果 | 协调决策 |

**特点**: 多个 `Worker` 节点并行执行

---

### 1.6 ToWow（协商协议型）

**节点拆解**：

| 节点 | 输入 | 输出 | 职责 |
|------|------|------|------|
| `Propose` | 初始提议 | 提案 | 发起提议 |
| `Negotiate` | 提案 | 协商结果 | 多方协商 |
| `Vote` | 协商选项 | 投票结果 | 投票决策 |
| `Accept` | 达成共识 | 最终协议 | 接受协议 |
| `Reject` | 无法共识 | 拒绝理由 | 拒绝并可能重议 |
| `Barrier` | 多方输入 | 同步点 | 屏障同步 |

**特点**: 支持多方协商、投票、共识达成

---

## 二、抽象工作节点分类

### 2.1 节点分类维度

经过分析，所有工作流节点可以归类为以下**7 大类**：

```
┌─────────────────────────────────────────────────────────────────┐
│                     抽象工作节点分类                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ 输入节点 (Input)     - 接收、解析、理解                     │
│  2️⃣ 规划节点 (Plan)      - 分析、设计、分解                     │
│  3️⃣ 执行节点 (Execute)   - 编码、生成、处理                     │
│  4️⃣ 审核节点 (Review)    - 检查、验证、审计                     │
│  5️⃣ 决策节点 (Decision)  - 判断、分支、路由                     │
│  6️⃣ 协调节点 (Coordinate)- 分配、汇总、同步                     │
│  7️⃣ 输出节点 (Output)    - 报告、存储、通知                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、抽象节点定义

### 3.1 输入节点 (Input Nodes)

#### 3.1.1 `Receive` - 接收节点

```yaml
id: "receive"
name: "接收"
category: "input"
description: "接收并解析用户输入"

inputs:
  - name: "raw_input"
    type: "string"
    required: true

outputs:
  - name: "parsed_task"
    type: "object"

config:
  - name: "parser"
    type: "enum"
    values: ["auto", "json", "markdown", "natural"]
    default: "auto"
```

#### 3.1.2 `Understand` - 理解节点

```yaml
id: "understand"
name: "理解"
category: "input"
description: "深入理解任务需求和上下文"

inputs:
  - name: "task"
    type: "object"
  - name: "context"
    type: "object"
    required: false

outputs:
  - name: "understanding"
    type: "object"
  - name: "questions"
    type: "array"

config:
  - name: "depth"
    type: "enum"
    values: ["shallow", "medium", "deep"]
    default: "medium"
```

#### 3.1.3 `Clarify` - 澄清节点

```yaml
id: "clarify"
name: "澄清"
category: "input"
description: "通过问答澄清不明确的需求"

inputs:
  - name: "task"
    type: "object"
  - name: "questions"
    type: "array"

outputs:
  - name: "clarified_task"
    type: "object"
  - name: "qa_history"
    type: "array"

config:
  - name: "max_rounds"
    type: "number"
    default: 3
```

---

### 3.2 规划节点 (Plan Nodes)

#### 3.2.1 `Analyze` - 分析节点

```yaml
id: "analyze"
name: "分析"
category: "plan"
description: "分析任务复杂度、依赖关系、所需资源"

inputs:
  - name: "task"
    type: "object"

outputs:
  - name: "complexity"
    type: "object"  # {component, coordinative, dynamic}
  - name: "dependencies"
    type: "array"
  - name: "required_capabilities"
    type: "array"
```

#### 3.2.2 `Design` - 设计节点

```yaml
id: "design"
name: "设计"
category: "plan"
description: "设计技术方案或架构"

inputs:
  - name: "requirements"
    type: "object"
  - name: "constraints"
    type: "object"

outputs:
  - name: "architecture"
    type: "object"
  - name: "tech_stack"
    type: "array"
  - name: "diagrams"
    type: "array"
```

#### 3.2.3 `Decompose` - 分解节点

```yaml
id: "decompose"
name: "分解"
category: "plan"
description: "将大任务分解为子任务"

inputs:
  - name: "task"
    type: "object"
  - name: "strategy"
    type: "enum"
    values: ["sequential", "parallel", "mixed"]

outputs:
  - name: "subtasks"
    type: "array"
  - name: "dependencies"
    type: "array"  # DAG
```

#### 3.2.4 `Spec` - 规范节点

```yaml
id: "spec"
name: "规范"
category: "plan"
description: "制定详细的执行规范"

inputs:
  - name: "requirements"
    type: "object"
  - name: "template"
    type: "string"
    required: false

outputs:
  - name: "specification"
    type: "object"
```

---

### 3.3 执行节点 (Execute Nodes)

#### 3.3.1 `Code` - 编码节点

```yaml
id: "code"
name: "编码"
category: "execute"
description: "编写代码"

inputs:
  - name: "specification"
    type: "object"
  - name: "language"
    type: "string"

outputs:
  - name: "code"
    type: "string"
  - name: "files"
    type: "array"
```

#### 3.3.2 `Test` - 测试节点

```yaml
id: "test"
name: "测试"
category: "execute"
description: "编写或运行测试"

inputs:
  - name: "code"
    type: "string"
  - name: "test_type"
    type: "enum"
    values: ["unit", "integration", "e2e"]

outputs:
  - name: "test_code"
    type: "string"
  - name: "test_results"
    type: "object"
```

#### 3.3.3 `Generate` - 生成节点

```yaml
id: "generate"
name: "生成"
category: "execute"
description: "生成内容（文档、报告等）"

inputs:
  - name: "template"
    type: "string"
  - name: "data"
    type: "object"

outputs:
  - name: "content"
    type: "string"
```

#### 3.3.4 `Transform` - 转换节点

```yaml
id: "transform"
name: "转换"
category: "execute"
description: "数据转换或处理"

inputs:
  - name: "input"
    type: "any"
  - name: "transformation"
    type: "string"

outputs:
  - name: "output"
    type: "any"
```

---

### 3.4 审核节点 (Review Nodes)

#### 3.4.1 `Review` - 审核节点

```yaml
id: "review"
name: "审核"
category: "review"
description: "审核产出物的质量"

inputs:
  - name: "artifact"
    type: "any"
  - name: "criteria"
    type: "object"

outputs:
  - name: "approved"
    type: "boolean"
  - name: "issues"
    type: "array"
  - name: "suggestions"
    type: "array"

config:
  - name: "strictness"
    type: "enum"
    values: ["loose", "normal", "strict"]
    default: "normal"
```

#### 3.4.2 `Validate` - 验证节点

```yaml
id: "validate"
name: "验证"
category: "review"
description: "验证是否符合规范或约束"

inputs:
  - name: "artifact"
    type: "any"
  - name: "schema"
    type: "object"

outputs:
  - name: "valid"
    type: "boolean"
  - name: "errors"
    type: "array"
```

#### 3.4.3 `Security` - 安全审计节点

```yaml
id: "security"
name: "安全审计"
category: "review"
description: "安全漏洞扫描和审计"

inputs:
  - name: "code"
    type: "string"

outputs:
  - name: "vulnerabilities"
    type: "array"
  - name: "risk_level"
    type: "enum"
    values: ["low", "medium", "high", "critical"]
```

---

### 3.5 决策节点 (Decision Nodes)

#### 3.5.1 `Branch` - 分支节点

```yaml
id: "branch"
name: "分支"
category: "decision"
description: "根据条件选择执行路径"

inputs:
  - name: "condition"
    type: "any"
  - name: "branches"
    type: "object"  # {condition: next_node}

outputs:
  - name: "selected_branch"
    type: "string"
```

#### 3.5.2 `Merge` - 合并节点

```yaml
id: "merge"
name: "合并"
category: "decision"
description: "合并多个分支的结果"

inputs:
  - name: "inputs"
    type: "array"

outputs:
  - name: "merged"
    type: "any"

config:
  - name: "strategy"
    type: "enum"
    values: ["first", "last", "combine", "vote"]
```

#### 3.5.3 `Loop` - 循环节点

```yaml
id: "loop"
name: "循环"
category: "decision"
description: "重复执行直到条件满足"

inputs:
  - name: "initial"
    type: "any"
  - name: "condition"
    type: "string"
  - name: "body"
    type: "workflow"

outputs:
  - name: "final_result"
    type: "any"
  - name: "iterations"
    type: "number"

config:
  - name: "max_iterations"
    type: "number"
    default: 10
```

---

### 3.6 协调节点 (Coordinate Nodes)

#### 3.6.1 `Parallel` - 并行节点

```yaml
id: "parallel"
name: "并行"
category: "coordinate"
description: "并行执行多个子任务"

inputs:
  - name: "tasks"
    type: "array"

outputs:
  - name: "results"
    type: "array"

config:
  - name: "max_concurrent"
    type: "number"
    default: 5
```

#### 3.6.2 `Sequence` - 顺序节点

```yaml
id: "sequence"
name: "顺序"
category: "coordinate"
description: "按顺序执行多个步骤"

inputs:
  - name: "steps"
    type: "array"

outputs:
  - name: "results"
    type: "array"
```

#### 3.6.3 `Assign` - 分配节点

```yaml
id: "assign"
name: "分配"
category: "coordinate"
description: "将任务分配给合适的 Agent"

inputs:
  - name: "task"
    type: "object"
  - name: "agents"
    type: "array"

outputs:
  - name: "assignment"
    type: "object"
```

#### 3.6.4 `Aggregate` - 汇总节点

```yaml
id: "aggregate"
name: "汇总"
category: "coordinate"
description: "汇总多个结果"

inputs:
  - name: "results"
    type: "array"

outputs:
  - name: "summary"
    type: "object"
```

#### 3.6.5 `Barrier` - 屏障节点

```yaml
id: "barrier"
name: "屏障"
category: "coordinate"
description: "等待所有输入到达后再继续"

inputs:
  - name: "inputs"
    type: "array"
  - name: "expected_count"
    type: "number"

outputs:
  - name: "all_inputs"
    type: "array"
```

#### 3.6.6 `Negotiate` - 协商节点

```yaml
id: "negotiate"
name: "协商"
category: "coordinate"
description: "多方协商达成共识"

inputs:
  - name: "proposal"
    type: "object"
  - name: "parties"
    type: "array"

outputs:
  - name: "consensus"
    type: "object"
  - name: "agreed"
    type: "boolean"

config:
  - name: "max_rounds"
    type: "number"
    default: 5
  - name: "decision_rule"
    type: "enum"
    values: ["unanimous", "majority", "weighted"]
```

---

### 3.7 输出节点 (Output Nodes)

#### 3.7.1 `Report` - 报告节点

```yaml
id: "report"
name: "报告"
category: "output"
description: "生成执行报告"

inputs:
  - name: "results"
    type: "any"
  - name: "format"
    type: "enum"
    values: ["markdown", "json", "html"]

outputs:
  - name: "report"
    type: "string"
```

#### 3.7.2 `Store` - 存储节点

```yaml
id: "store"
name: "存储"
category: "output"
description: "持久化存储结果"

inputs:
  - name: "data"
    type: "any"
  - name: "location"
    type: "string"

outputs:
  - name: "stored_path"
    type: "string"
```

#### 3.7.3 `Notify` - 通知节点

```yaml
id: "notify"
name: "通知"
category: "output"
description: "发送通知"

inputs:
  - name: "message"
    type: "string"
  - name: "channel"
    type: "string"

outputs:
  - name: "sent"
    type: "boolean"
```

---

## 四、节点组合模式

### 4.1 基础模式

```
[Receive] → [Understand] → [Execute] → [Review] → [Report]
```

### 4.2 TDD 模式

```
[Understand] → [Test] → [Code] → [Validate] → [Review]
                  ↑__________↓ (失败重试)
```

### 4.3 审核制衡模式

```
[Receive] → [Plan] → [Review] → [Assign] → [Execute] → [Report]
               ↑        ↓
               ←──[Reject]←── (驳回)
```

### 4.4 并行蜂群模式

```
[Decompose] → [Parallel: [Execute] [Execute] [Execute]] → [Aggregate] → [Report]
```

### 4.5 协商共识模式

```
[Propose] → [Negotiate] → [Branch: 同意?]
                                  ↓ 是     ↓ 否
                              [Execute]  [Negotiate] (循环)
```

---

## 五、节点属性汇总表

| 类别 | 节点 | 核心职责 | 可配置项 |
|------|------|---------|---------|
| **输入** | Receive | 接收解析 | parser |
| | Understand | 理解需求 | depth |
| | Clarify | 澄清疑问 | max_rounds |
| **规划** | Analyze | 复杂度分析 | - |
| | Design | 技术设计 | - |
| | Decompose | 任务分解 | strategy |
| | Spec | 制定规范 | template |
| **执行** | Code | 编写代码 | language |
| | Test | 编写/运行测试 | test_type |
| | Generate | 生成内容 | - |
| | Transform | 数据转换 | - |
| **审核** | Review | 质量审核 | strictness |
| | Validate | 规范验证 | schema |
| | Security | 安全审计 | - |
| **决策** | Branch | 条件分支 | - |
| | Merge | 合并结果 | strategy |
| | Loop | 循环执行 | max_iterations |
| **协调** | Parallel | 并行执行 | max_concurrent |
| | Sequence | 顺序执行 | - |
| | Assign | 任务分配 | - |
| | Aggregate | 结果汇总 | - |
| | Barrier | 屏障同步 | expected_count |
| | Negotiate | 多方协商 | decision_rule |
| **输出** | Report | 生成报告 | format |
| | Store | 持久化存储 | location |
| | Notify | 发送通知 | channel |

---

## 六、自动工作流生成规则

### 6.1 基于任务特征的节点选择

```python
def generate_workflow(task_features):
    nodes = []

    # 1. 输入阶段（必选）
    nodes.append(Node("receive"))
    nodes.append(Node("understand", depth="medium" if task_features.complexity > 0.5 else "shallow"))

    # 2. 规划阶段（复杂度 > 0.3 时添加）
    if task_features.complexity > 0.3:
        nodes.append(Node("analyze"))
        if task_features.needs_design:
            nodes.append(Node("design"))
        if task_features.can_decompose:
            nodes.append(Node("decompose", strategy="parallel" if task_features.can_parallel else "sequential"))

    # 3. 执行阶段
    if task_features.type == "coding":
        if task_features.needs_tdd:
            nodes.append(Node("test"))
        nodes.append(Node("code"))
    elif task_features.type == "documentation":
        nodes.append(Node("generate"))

    # 4. 审核阶段（质量要求高时添加）
    if task_features.quality_requirement in ["high", "critical"]:
        nodes.append(Node("review", strictness="strict" if task_features.quality_requirement == "critical" else "normal"))
        if task_features.type == "coding":
            nodes.append(Node("security"))

    # 5. 输出阶段（必选）
    nodes.append(Node("report"))

    return Workflow(nodes)
```

### 6.2 模式组合规则

| 条件 | 添加的节点/模式 |
|------|----------------|
| 需要并行 | `Decompose` → `Parallel` → `Aggregate` |
| 需要审核 | `Review` + 可能的回环 |
| 需要协商 | `Negotiate` + `Branch` |
| 需要 TDD | `Test` → `Code` → `Validate` 循环 |
| 高复杂度 | 完整的 `Analyze` → `Design` → `Spec` 链 |

---

## 七、用户拖拽设计

### 7.1 节点面板分组

```
┌─────────────────────────────────────┐
│ 📥 输入节点                         │
│  [Receive] [Understand] [Clarify]   │
├─────────────────────────────────────┤
│ 📋 规划节点                         │
│  [Analyze] [Design] [Decompose]     │
│  [Spec]                             │
├─────────────────────────────────────┤
│ ⚡ 执行节点                         │
│  [Code] [Test] [Generate]           │
│  [Transform]                        │
├─────────────────────────────────────┤
│ ✅ 审核节点                         │
│  [Review] [Validate] [Security]     │
├─────────────────────────────────────┤
│ 🔀 决策节点                         │
│  [Branch] [Merge] [Loop]            │
├─────────────────────────────────────┤
│ 🔗 协调节点                         │
│  [Parallel] [Sequence] [Assign]     │
│  [Aggregate] [Barrier] [Negotiate]  │
├─────────────────────────────────────┤
│ 📤 输出节点                         │
│  [Report] [Store] [Notify]          │
└─────────────────────────────────────┘
```

### 7.2 连线规则

- **数据流**: 实线箭头，表示数据传递
- **控制流**: 虚线箭头，表示执行顺序
- **回环**: 带标签的箭头，表示条件回跳

---

## 八、节点接口规范

### 8.1 标准节点接口

```typescript
/**
 * 所有节点必须实现的基础接口
 */
interface INode {
  // 元数据
  id: string;                    // 节点唯一标识
  type: 'builtin' | 'custom';    // 节点类型
  name: string;                   // 显示名称（支持 i18n）
  description: string;            // 描述（支持 i18n）
  category: NodeCategory;         // 所属分类
  icon?: string;                  // 图标

  // 输入输出定义
  inputs: PortDefinition[];
  outputs: PortDefinition[];

  // 配置 Schema
  configSchema?: JSONSchema;

  // 执行逻辑
  execute(context: NodeContext): Promise<NodeResult>;
}

// 节点分类
type NodeCategory =
  | 'input'      // 输入类
  | 'planning'   // 规划类
  | 'execution'  // 执行类
  | 'review'     // 审核类
  | 'decision'   // 决策类
  | 'coordinate' // 协调类
  | 'output'     // 输出类

// 端口定义
interface PortDefinition {
  name: string;
  type: PortType;
  required: boolean;
  description?: string;
  defaultValue?: any;
}

type PortType =
  | 'string' | 'number' | 'boolean'
  | 'object' | 'array' | 'any'
  | 'stream' | 'file'
  | 'agent' | 'task' | 'message';

// 节点执行上下文
interface NodeContext {
  taskId: string;
  workflowId: string;
  inputs: Record<string, any>;
  config: Record<string, any>;
  state: WorkflowState;
  logger: Logger;
  emitter?: EventEmitter;
}

// 节点执行结果
interface NodeResult {
  success: boolean;
  outputs: Record<string, any>;
  error?: Error;
  metrics?: NodeMetrics;
  nextNodes?: string[];  // 动态路由
}
```

### 8.2 自定义节点定义示例

```yaml
# custom-nodes/my-custom-node.yaml
id: "my-custom-node"
type: "custom"
category: "execution"

name:
  en: "My Custom Node"
  zh: "自定义节点"

description:
  en: "Does something custom"
  zh: "执行自定义操作"

icon: "🔧"

inputs:
  - name: "input_data"
    type: "any"
    required: true

outputs:
  - name: "output_data"
    type: "any"

configSchema:
  type: object
  properties:
    custom_param:
      type: string
      default: "default_value"

# 执行脚本（Python 或 JavaScript）
script: |
  def execute(context):
      input_data = context.inputs['input_data']
      custom_param = context.config.get('custom_param', 'default_value')

      # 处理逻辑
      result = process(input_data, custom_param)

      return NodeResult(
          success=True,
          outputs={'output_data': result}
      )
```

---

## 九、自动工作流生成算法

### 9.1 完整生成函数

```python
def generate_workflow(task_features: TaskFeatures) -> Workflow:
    """
    根据任务特征自动生成工作流
    """
    nodes = []
    edges = []
    current_node = None

    # ===== 1. 输入阶段（必选）=====
    receive_node = Node("receive", id="receive_1")
    nodes.append(receive_node)
    current_node = "receive_1"

    understand_depth = "deep" if task_features.complexity > 0.7 else "medium" if task_features.complexity > 0.3 else "shallow"
    understand_node = Node("understand", id="understand_1", config={"depth": understand_depth})
    nodes.append(understand_node)
    edges.append(Edge(current_node, "understand_1"))
    current_node = "understand_1"

    # ===== 2. 规划阶段（复杂度 > 0.3 时添加）=====
    if task_features.complexity > 0.3:
        analyze_node = Node("analyze", id="analyze_1")
        nodes.append(analyze_node)
        edges.append(Edge(current_node, "analyze_1"))
        current_node = "analyze_1"

        if task_features.needs_design:
            design_node = Node("design", id="design_1")
            nodes.append(design_node)
            edges.append(Edge(current_node, "design_1"))
            current_node = "design_1"

        if task_features.can_decompose:
            decompose_config = {
                "strategy": "parallel" if task_features.can_parallel else "sequential"
            }
            decompose_node = Node("decompose", id="decompose_1", config=decompose_config)
            nodes.append(decompose_node)
            edges.append(Edge(current_node, "decompose_1"))
            current_node = "decompose_1"

    # ===== 3. 执行阶段（根据任务类型选择）=====
    if task_features.type == "coding":
        if task_features.needs_tdd:
            test_node = Node("test", id="test_1", config={"test_type": "write"})
            nodes.append(test_node)
            edges.append(Edge(current_node, "test_1"))

            code_node = Node("code", id="code_1")
            nodes.append(code_node)
            edges.append(Edge("test_1", "code_1"))

            validate_node = Node("test", id="validate_1", config={"test_type": "run"})
            nodes.append(validate_node)
            edges.append(Edge("code_1", "validate_1"))

            # TDD 循环
            if task_features.needs_iteration:
                loop_config = {
                    "condition": "test_failed",
                    "max_iterations": 3
                }
                loop_node = Node("loop", id="tdd_loop", config=loop_config)
                nodes.append(loop_node)
                edges.append(Edge("validate_1", "tdd_loop"))
                edges.append(Edge("tdd_loop", "code_1", label="retry"))

            current_node = "validate_1"
        else:
            code_node = Node("code", id="code_1")
            nodes.append(code_node)
            edges.append(Edge(current_node, "code_1"))
            current_node = "code_1"

    elif task_features.type == "analysis":
        generate_node = Node("generate", id="generate_1", config={"output_type": "analysis_report"})
        nodes.append(generate_node)
        edges.append(Edge(current_node, "generate_1"))
        current_node = "generate_1"

    # ===== 4. 并行执行（如果需要）=====
    if task_features.can_parallel and task_features.estimated_subtasks > 1:
        parallel_config = {
            "max_concurrent": min(task_features.estimated_subtasks, 5)
        }
        parallel_node = Node("parallel", id="parallel_1", config=parallel_config)
        nodes.append(parallel_node)

        # 替换最后一个边，指向并行节点
        edges[-1] = Edge(edges[-1].from, "parallel_1")

        # 并行执行节点
        for i in range(task_features.estimated_subtasks):
            exec_node = Node("code" if task_features.type == "coding" else "generate",
                           id=f"exec_{i+1}")
            nodes.append(exec_node)
            edges.append(Edge("parallel_1", f"exec_{i+1}"))

        # 汇聚节点
        aggregate_node = Node("aggregate", id="aggregate_1")
        nodes.append(aggregate_node)
        for i in range(task_features.estimated_subtasks):
            edges.append(Edge(f"exec_{i+1}", "aggregate_1"))

        current_node = "aggregate_1"

    # ===== 5. 审核阶段（根据质量要求决定）=====
    if task_features.quality_requirement in ["high", "critical"]:
        review_config = {
            "strictness": "strict" if task_features.quality_requirement == "critical" else "normal",
            "auto_fix": task_features.quality_requirement != "critical"
        }
        review_node = Node("review", id="review_1", config=review_config)
        nodes.append(review_node)
        edges.append(Edge(current_node, "review_1"))

        # 审核回环（如果需要人工确认）
        if task_features.quality_requirement == "critical":
            branch_node = Node("branch", id="review_branch", config={
                "condition": "review_approved",
                "true_next": "report_1",
                "false_next": current_node
            })
            nodes.append(branch_node)
            edges.append(Edge("review_1", "review_branch"))
            edges.append(Edge("review_branch", current_node, label="rejected"))
            current_node = "review_branch"
        else:
            current_node = "review_1"

    # ===== 6. 输出阶段（必选）=====
    report_node = Node("report", id="report_1")
    nodes.append(report_node)
    edges.append(Edge(current_node, "report_1"))

    return Workflow(nodes=nodes, edges=edges)
```

### 9.2 节点组装规则表

| 任务特征 | 添加的节点序列 |
|---------|---------------|
| 复杂度 < 0.3 | `Receive → Understand → Execute → Report` |
| 复杂度 0.3-0.7 | `Receive → Understand → Analyze → Execute → Report` |
| 复杂度 > 0.7 | `Receive → Understand → Analyze → Design → Decompose → ... → Aggregate → Report` |
| 需要TDD | `... → Test(write) → Code → Test(run) → [Loop if failed] → ...` |
| 需要审核 | `... → Review → [Branch if rejected] → ...` |
| 可并行 | `... → Parallel → [Exec1, Exec2, ...] → Aggregate → ...` |
| 需要协商 | `... → Negotiate → [Branch: agreed?] → ...` |
| 高质量要求 | `... → Review(strict) → Validate → ...` |

---

## 十、双语言支持

### 10.1 节点名称国际化

```json
{
  "nodes": {
    "receive": {
      "name": {
        "en": "Receive",
        "zh": "接收"
      },
      "description": {
        "en": "Receive and parse user input",
        "zh": "接收并解析用户输入"
      }
    },
    "understand": {
      "name": {
        "en": "Understand",
        "zh": "理解"
      },
      "description": {
        "en": "Analyze and understand task requirements",
        "zh": "分析并理解任务需求"
      }
    }
  }
}
```

### 10.2 用户界面语言切换

```typescript
interface UILocale {
  language: 'en' | 'zh';
  fallbackLanguage: 'en';

  // 节点面板标题
  categories: {
    input: { en: string; zh: string };
    planning: { en: string; zh: string };
    execution: { en: string; zh: string };
    review: { en: string; zh: string };
    decision: { en: string; zh: string };
    coordinate: { en: string; zh: string };
    output: { en: string; zh: string };
  };
}
```

---

## 十一、总结

### 核心设计理念

| 维度 | 传统方法 | AgentGraph 方法 |
|------|---------|-----------------|
| **核心单位** | 工作流模式（固定）| 原子节点（可组合）|
| **灵活性** | 选择预定义模式 | 自由拖拽组合 |
| **用户控制** | 模式匹配 | 节点组装 |
| **自动化** | 推荐算法 | 生成算法 |
| **扩展性** | 添加新模式 | 定义新节点 |

### 7 大类 25+ 个原子节点

```
输入类:     Receive, Understand, Clarify
规划类:     Analyze, Design, Decompose, Spec
执行类:     Code, Test, Generate, Transform
审核类:     Review, Validate, Security
决策类:     Branch, Merge, Loop
协调类:     Parallel, Sequence, Assign, Aggregate, Barrier, Negotiate
输出类:     Report, Store, Notify
```

### 三层能力

1. **用户层** - 拖拽节点，自由组合工作流
2. **系统层** - 根据任务特征自动组装节点
3. **扩展层** - 定义自定义节点，注册到系统

---

## 十二、与河网同步系统的整合

### 12.1 节点在河网中的位置

```
┌─────────────────────────────────────────────────────────────────┐
│                    节点与河网的关系                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  主流 (Main Flow)                                                │
│  ├── 全局规范节点: Constitution, Spec                           │
│  └── 汇总输出节点: Aggregate, Report                            │
│                                                                 │
│  支流 A (前端)              支流 B (后端)                        │
│  ├── 输入节点               ├── 输入节点                        │
│  │   └── Receive, Understand│   └── Receive, Understand        │
│  ├── 规划节点               ├── 规划节点                        │
│  │   └── Design, Decompose  │   └── Design, Decompose          │
│  ├── 执行节点               ├── 执行节点                        │
│  │   └── Code, Test         │   └── Code, Test                 │
│  └── 输出节点               └── 输出节点                        │
│      └── Report                  └── Report                     │
│                                                                 │
│  同步点 (Sync Point)                                             │
│  ├── 协调节点: Negotiate, Barrier                               │
│  └── 审核节点: Review, Validate                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 节点的支流访问能力

```typescript
// 扩展节点上下文，支持河网访问
interface NodeContextWithRiver extends NodeContext {
  // 河网访问
  river: {
    // 当前支流操作
    branch: BranchAccess;

    // 同步点操作（需要协调时）
    sync?: SyncPointAccess;
  };
}

// 示例：Code 节点在支流中的执行
class CodeNode {
  async execute(context: NodeContextWithRiver) {
    const { river } = context;

    // 1. 从支流取水 - 获取组内上下文
    const design = river.branch.drink('design');
    const specs = river.branch.scoop({ sourceNode: 'spec' });

    // 2. 检查是否有跨支流依赖
    const conflicts = river.branch.checkConflicts();
    if (conflicts.length > 0) {
      // 3. 请求同步点协调
      const sync = river.branch.requestSync(
        ['frontend', 'backend'],
        '接口定义冲突'
      );
      // 等待同步完成
      await sync.waitForResolution();
    }

    // 4. 执行编码
    const code = await this.generateCode(design, specs);

    // 5. 发布决策到同步点
    river.branch.publishDecision({
      topic: 'API实现',
      content: { endpoints: code.apiEndpoints },
      impact: ['backend']  // 通知后端支流
    });

    // 6. 汇入支流
    river.branch.pour({
      type: 'execution',
      content: code
    });

    return { success: true, outputs: { code } };
  }
}
```

### 12.3 协调节点的特殊能力

```typescript
// Negotiate 节点 - 专门用于同步点协商
class NegotiateNode {
  async execute(context: NodeContextWithRiver) {
    const { river, inputs } = context;

    // 1. 创建同步点
    const syncPoint = river.branch.requestSync(
      inputs.participants,
      inputs.topic
    );

    // 2. 收集各方提案
    const proposals = await syncPoint.collectProposals();

    // 3. 检测冲突
    const conflicts = syncPoint.detectConflicts(proposals);

    // 4. 执行协商
    if (conflicts.length > 0) {
      // 尝试自动解决
      const autoResolved = await syncPoint.tryAutoResolve(conflicts);

      if (!autoResolved) {
        // 升级到人工
        return {
          success: false,
          outputs: {
            needsHumanIntervention: true,
            conflicts
          }
        };
      }
    }

    // 5. 达成共识
    const consensus = await syncPoint.reachConsensus(proposals);

    // 6. 广播到所有参与者
    syncPoint.broadcast(consensus);

    return {
      success: true,
      outputs: { consensus }
    };
  }
}
```

---

## 十三、下一步行动

1. **实现节点运行时** - 每个节点的执行逻辑
2. **定义节点接口** - 标准化的输入/输出 schema
3. **集成河网访问** - 节点上下文支持 river 访问
4. **实现工作流引擎** - 执行节点组合
5. **开发拖拽 UI** - ReactFlow 实现
6. **自动生成算法** - 基于任务特征选择节点
7. **双语言支持** - 中文/英文界面切换
