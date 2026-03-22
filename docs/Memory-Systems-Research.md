# AI Agent 记忆系统调研报告

> 调研时间：2026-03-07
> 目的：为 AgentGraph 设计记忆互通系统提供参考

---

## 一、主流记忆系统概览

| 系统 | 核心特点 | 适用场景 |
|------|----------|----------|
| **Claude Code** | 分级CLAUDE.md + Auto Memory | 单Agent长期记忆 |
| **Claude Flow** | Hive-mind内存协调 | 多Agent Swarm |
| **Mem0** | 自改进记忆层 | 个性化AI应用 |
| **Zep** | 时序知识图谱 | 复杂关系记忆 |
| **Letta/MemGPT** | 虚拟上下文管理 | 长期自主学习 |
| **LangGraph** | Reducer状态管理 | 工作流状态持久化 |
| **OpenAI Swarm** | 轻量协调+上下文传递 | 多Agent协作 |

---

## 二、Claude Code 记忆机制

### 2.1 四级分层架构

```
┌─────────────────────────────────────────┐
│ 1. Enterprise Policy (最高优先级)        │ ← 组织IT规则
├─────────────────────────────────────────┤
│ 2. Project Memory (.claude.md)          │ ← 项目指令
├─────────────────────────────────────────┤
│ 3. Project Rules (.claude/rules/)       │ ← 模块化条件规则
├─────────────────────────────────────────┤
│ 4. User Memory (~/.claude/CLAUDE.md)    │ ← 个人偏好
└─────────────────────────────────────────┘
```

### 2.2 条件规则（paths字段）

```yaml
---
paths:
  - "src/api/**/*.ts"
  - "src/routes/**/*.ts"
---
# API Security Rules
- Always validate JWT tokens
- Rate limiting on all endpoints
```

### 2.3 Auto Memory

- **存储位置**：`~/.claude/projects/<project>/memory/`
- **入口限制**：MEMORY.md 前200行自动加载
- **按需加载**：主题文件（如debugging.md）按需读取
- **自动学习**：Claude自行决定什么值得记住

### 2.4 关键设计原则

| 原则 | 说明 |
|------|------|
| 记忆是上下文 | 不是强制配置，系统尽力匹配 |
| 简洁具体有效 | "使用2空格缩进" 比 "格式化代码" 更可靠 |
| 条件加载 | 通过paths匹配，节省上下文 |
| 递归导入 | @path支持5层递归 |

---

## 三、Claude Flow 记忆机制

### 3.1 Hive-mind 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Planner Agent (协调者)                    │
│                         │                                   │
│         ┌───────────────┼───────────────┐                  │
│         ▼               ▼               ▼                  │
│    [Agent A]       [Agent B]       [Agent C]               │
│         │               │               │                  │
│         └───────────────┴───────────────┘                  │
│                         │                                   │
│                    Memory Pool                              │
│              (内存中协调，无文件无邮件)                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心特点

| 特点 | 说明 |
|------|------|
| **No files, no mail** | 一切在内存中协调 |
| **层级规划** | Planner Agent分配任务和记忆 |
| **持久化记忆** | 跨会话保持状态 |
| **并行策略** | 多Agent共享记忆池 |

### 3.3 记忆分配模式

```typescript
// Claude Flow 的记忆分配
interface SwarmMemory {
  // 全局共享记忆
  shared: MemoryPool;

  // 每个Agent的私有记忆
  private: Map<AgentId, MemoryPool>;

  // 任务相关记忆（按需分配）
  taskScoped: Map<TaskId, MemoryPool>;
}
```

---

## 四、Mem0 记忆架构

### 4.1 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Mem0 架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │   输入层    │───▶│  记忆提取   │───▶│  记忆存储   │    │
│  │  (消息)     │    │  (事实抽取) │    │  (向量+图)  │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│         │                  │                  │            │
│         ▼                  ▼                  ▼            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                   自改进引擎                          │ │
│  │  • 冲突检测与解决                                     │ │
│  │  • 记忆衰减与重要性评分                               │ │
│  │  • 自动合并相似记忆                                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 性能指标（官方数据）

| 指标 | 数值 |
|------|------|
| 准确性提升 | +26% vs OpenAI |
| 延迟降低 | 91% |
| Token节省 | 90% |

### 4.3 记忆类型

```typescript
interface Mem0Memory {
  // 短期记忆（会话内）
  shortTerm: {
    messages: Message[];
    context: Context;
  };

  // 长期记忆（持久化）
  longTerm: {
    facts: Fact[];        // 事实
    preferences: any;     // 用户偏好
    patterns: Pattern[];  // 行为模式
  };
}
```

---

## 五、Zep 时序知识图谱

### 5.1 Graphiti 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Zep Graphiti 架构                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   时间维度                                                   │
│      │                                                       │
│      │    ┌─────┐   ┌─────┐   ┌─────┐                      │
│      │    │ t=1 │──▶│ t=2 │──▶│ t=3 │  事件节点            │
│      │    └─────┘   └─────┘   └─────┘                      │
│      │         │         │         │                        │
│      │         ▼         ▼         ▼                        │
│      │    ┌─────────────────────────┐                       │
│      │    │      实体节点            │  知识图谱             │
│      │    │  User, Task, Code...    │                       │
│      │    └─────────────────────────┘                       │
│      │                                                       │
│      └──────────────────────────────────────▶ 空间维度       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 核心特点

| 特点 | 说明 |
|------|------|
| **时序感知** | 记忆带有时间戳，支持时间查询 |
| **知识图谱** | 实体关系建模，支持复杂查询 |
| **Neo4j存储** | 生产级图数据库 |
| **Deep Memory Retrieval** | 94.8%准确率（vs MemGPT 93.4%）|

### 5.3 记忆查询

```typescript
// Zep 的时序记忆查询
interface ZepQuery {
  // 时间范围
  timeRange?: { start: Date; end: Date };

  // 实体过滤
  entities?: string[];

  // 关系类型
  relations?: string[];

  // 重要性阈值
  minImportance?: number;
}
```

---

## 六、Letta/MemGPT 记忆模型

### 6.1 虚拟上下文管理

```
┌─────────────────────────────────────────────────────────────┐
│                    MemGPT 记忆架构                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  有限上下文窗口                         │ │
│  │   ┌─────────────────────────────────────────────┐     │ │
│  │   │  Working Context (当前活跃)                   │     │ │
│  │   └─────────────────────────────────────────────┘     │ │
│  └───────────────────────────────────────────────────────┘ │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  无限虚拟记忆                          │ │
│  │   ┌──────────────┐  ┌──────────────┐                 │ │
│  │   │ Core Memory  │  │ Archival     │                 │ │
│  │   │ (关键信息)    │  │ Memory       │                 │ │
│  │   │              │  │ (历史归档)    │                 │ │
│  │   └──────────────┘  └──────────────┘                 │ │
│  │   ┌──────────────┐  ┌──────────────┐                 │ │
│  │   │ Recall       │  │ Messages     │                 │ │
│  │   │ Memory       │  │ (对话历史)    │                 │ │
│  │   │ (检索索引)    │  │              │                 │ │
│  │   └──────────────┘  └──────────────┘                 │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 记忆类型

| 类型 | 用途 | 大小 |
|------|------|------|
| **Core Memory** | 关键信息、用户偏好 | 有限 |
| **Archival Memory** | 长期历史存储 | 无限 |
| **Recall Memory** | 对话检索索引 | 按需 |
| **Working Context** | 当前活跃上下文 | 受限 |

### 6.3 自主记忆管理

```typescript
// MemGPT 的自主记忆操作
interface MemGPTFunctions {
  // 核心记忆操作
  core_memory_append(section: string, content: string): void;
  core_memory_replace(section: string, old: string, new: string): void;

  // 归档操作
  archival_memory_insert(content: string): void;
  archival_memory_search(query: string): Memory[];

  // 对话检索
  conversation_search(query: string): Message[];
}
```

---

## 七、LangGraph 状态管理

### 7.1 Reducer-driven 状态

```typescript
// LangGraph 状态定义
interface AgentState {
  messages: Message[];
  context: Context;

  // 使用 Reducer 定义如何更新状态
  reducers: {
    messages: (prev: Message[], newMsg: Message) => Message[];
    context: (prev: Context, update: Partial<Context>) => Context;
  };
}
```

### 7.2 Checkpointing

```
┌─────────────────────────────────────────────────────────────┐
│                  LangGraph 检查点机制                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Node A ──▶ [Checkpoint 1] ──▶ Node B ──▶ [Checkpoint 2]  │
│                 │                           │               │
│                 ▼                           ▼               │
│           MemorySaver                  MemorySaver          │
│           (持久化存储)                 (持久化存储)          │
│                                                             │
│   恢复时：从最近检查点继续执行                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 两种记忆类型

| 类型 | 范围 | 存储 |
|------|------|------|
| **Short-term** | 会话内 | 内存 |
| **Long-term** | 跨会话 | 持久化存储 |

---

## 八、OpenAI Swarm 协调模式

### 8.1 轻量级设计

```typescript
// OpenAI Swarm 的简单协调
interface SwarmAgent {
  name: string;
  instructions: string;
  functions: Function[];

  // 上下文传递
  contextVariables: Record<string, any>;
}

// 协调器
interface Swarm {
  agents: SwarmAgent[];

  // 简单的上下文传递
  run(agent: SwarmAgent, messages: Message[]): Result;
}
```

### 8.2 核心原则

| 原则 | 说明 |
|------|------|
| **轻量级** | 教育框架，非生产级 |
| **高度可控** | 明确的Agent切换 |
| **易于测试** | 无隐藏状态 |
| **上下文传递** | Agent间通过contextVariables传递 |

---

## 九、综合对比

### 9.1 记忆存储方式

| 系统 | 存储方式 | 优点 | 缺点 |
|------|----------|------|------|
| Claude Code | Markdown文件 | 人类可读、版本控制 | 查询能力弱 |
| Mem0 | 向量+图 | 混合查询 | 复杂度高 |
| Zep | 知识图谱 | 关系查询强 | 需要图数据库 |
| MemGPT | 分层虚拟 | 无限扩展 | 实现复杂 |
| LangGraph | Checkpoint | 可恢复 | 粒度较粗 |

### 9.2 适用场景

```
简单场景 ────────────────────────────────────▶ 复杂场景

Claude Code    OpenAI Swarm    LangGraph    Mem0/Zep    MemGPT
   │              │               │            │           │
   ▼              ▼               ▼            ▼           ▼
单Agent        多Agent        工作流状态    复杂关系    无限记忆
长期记忆       简单协调       持久化        查询        自主管理
```

---

## 十、AgentGraph 设计建议

### 10.1 借鉴要点

| 来源 | 借鉴内容 |
|------|----------|
| **Claude Code** | 分级记忆、条件规则、Auto Memory |
| **Claude Flow** | 内存协调、Hive-mind共享 |
| **Mem0** | 自改进引擎、冲突解决 |
| **Zep** | 时序知识图谱、实体关系 |
| **MemGPT** | 分层虚拟记忆、自主管理 |
| **LangGraph** | Reducer状态、Checkpoint |
| **OpenAI Swarm** | 轻量上下文传递 |

### 10.2 推荐架构

```
┌─────────────────────────────────────────────────────────────┐
│                  AgentGraph 记忆系统                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: 工作流级记忆（类似CLAUDE.md）                       │
│  ├── workflow.md: 项目架构、全局规则                         │
│  └── 条件规则: 按节点类型匹配                                │
│                                                             │
│  Layer 2: 节点级记忆（类似Core Memory）                      │
│  ├── 端口声明: 节点声明需要什么记忆                          │
│  └── 自动学习: 节点学习到的模式                              │
│                                                             │
│  Layer 3: 运行时记忆池（类似Memory Pool）                    │
│  ├── 全局共享: 所有节点可访问                                │
│  ├── 任务作用域: 当前任务相关                                │
│  └── 时序追踪: 带时间戳的记忆                                │
│                                                             │
│  Layer 4: 持久化存储（类似Checkpoint）                       │
│  ├── 检查点: 可恢复的执行状态                                │
│  └── 知识图谱: 实体关系（可选）                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 用户易用性设计

| 级别 | 用户操作 | 说明 |
|------|----------|------|
| **Level 1** | 零配置 | 连线后自动传递，节点内置默认需求 |
| **Level 2** | 模板推荐 | 系统推荐记忆配置，一键应用 |
| **Level 3** | 精细控制 | 完全自定义端口声明和条件规则 |

### 10.4 LangGraph 的关键启发

#### 不可变状态 + Reducer 模式

```
传统方式（有竞态问题）：
Agent A ──直接修改──▶ 共享状态 ◀──直接修改── Agent B
                           ▲
                       竞态条件！

LangGraph方式（无竞态）：
Agent A ◀──读取快照── 状态(不可变) ──读取快照──▶ Agent B
    │                                              │
    ▼ 返回changeA                                  ▼ 返回changeB
    │                                              │
    └──────────────▶ Reducer ◀─────────────────────┘
                           │
                           ▼ 原子性合并
                       新状态
```

#### 检查点 = 恢复点

```typescript
interface AgentGraphCheckpoint {
  // 完整状态快照
  state: {
    memoryPool: MemoryChunk[];
    nodeResults: Map<NodeId, NodeResult>;
    variables: Record<string, any>;
  };

  // 当前位置
  position: {
    completedNode: NodeId;
    nextNodes: NodeId[];
    executionPath: NodeId[];
  };

  // 元数据
  metadata: {
    timestamp: Date;
    trigger: 'node_complete' | 'edge_eval' | 'pause' | 'error';
    executionTime: number;
  };
}
```

#### 检查点创建时机

| 时机 | 说明 |
|------|------|
| 节点完成后 | 每个节点成功执行后 |
| 条件边评估前 | 分支决策前 |
| 工作流暂停时 | 等待人工审批、外部输入 |
| 错误发生时 | 便于重试 |

#### 时间旅行调试

- 从任意检查点恢复执行
- 查看任意时刻的完整状态
- 重放执行路径

---

## 参考链接

- [Claude Code Memory Docs](https://code.claude.com/docs/en/memory)
- [Mem0 AI Memory Layer](https://mem0.ai/blog/ai-memory-layer-guide)
- [Zep Temporal Knowledge Graph](https://arxiv.org/abs/2501.13956)
- [Letta/MemGPT](https://www.letta.com/blog/agent-memory)
- [LangGraph Memory](https://docs.langchain.com/oss/python/langgraph/add-memory)
- [OpenAI Swarm](https://github.com/openai/swarm)
