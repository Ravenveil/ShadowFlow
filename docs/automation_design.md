# 🛠️ AgentGraph 自动化工作流与 LangGraph 集成设计方案

## 1. 核心理念：原子切片与元数据 (Atomic Units & Metadata)

自动化“搭积木”形成工作流，本质上是实现 **“从自然语言意图到 DAG 配置”** 的自动转换。这要求每个“积木块”（Agent/Node）都具备清晰的自描述能力。

### 元数据定义规范 (Metadata Schema)
每个原子节点必须包含：
- **Name/ID**: 唯一标识。
- **Capability Description**: 详细描述该节点能做什么（用于 Planner 匹配）。
- **Input Schema**: 期望接收的数据格式。
- **Output Schema**: 执行后产生的数据格式。
- **Dependencies**: 运行所需的外部工具或环境。

---

## 2. 自动化搭积木：Planner（规划器）模式

我们要实现自动化，必须在 `AgentGraph` 中引入一个**“超级建筑师”角色（LLM Planner）**。

### 自动化执行流程：
1.  **能力发现 (Capability Discovery)**：系统扫描所有可用的原子节点，并提取其元数据。
2.  **意图解析 (Intent Parsing)**：LLM 接收用户需求，分析出逻辑步骤。
3.  **拓扑生成 (Topology Generation)**：LLM 根据步骤和可用节点，生成 JSON 结构的 Nodes 和 Edges。
4.  **自动连接 (Auto-Wiring)**：基于输入输出的 Schema 自动匹配 Edge 的 `condition`。

---

## 3. 集成 LangGraph：提升引擎上限

LangGraph 作为一个“有状态的图引擎”，能为 AgentGraph 带来以下核心提升：

### 1. 状态持久化 (Checkpoints / Time Travel)
- **断点续传**：支持长流程工作流的中断与恢复。
- **时间旅行调试**：允许在 Shadow 中回溯到任意执行步骤查看状态快照。

### 2. 支持循环 (Cycles)
- **自愈能力**：支持“执行-检查-重跑”的闭环，特别适用于代码生成、SQL 查询等易错场景。
- **递归任务**：允许积木块在满足特定条件前不断循环执行。

### 3. 强类型全局状态 (StateSchema)
- 提供统一的 `State` 管理，避免积木块之间复杂的变量透传，使数据流更稳固。

---

## 4. 实施路径 (Roadmap)

1.  **规范化原子节点**：完善 `AgentConfig`，强化 Metadata 字段。
2.  **开发 LLM Planner**：实现“输入一段话，自动生成积木连线”的功能。
3.  **引入 LangGraph Adapter**：创建适配层，将 AgentGraph 的 JSON 定义转换为 LangGraph 的执行逻辑。
4.  **Shadow AI 对话深度集成**：将对话流程视为一个动态 LangGraph，支持多步思考与工具调用。
