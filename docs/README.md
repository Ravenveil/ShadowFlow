# AgentGraph Docs

AgentGraph 文档入口页。  
当前阶段请先把它理解为：

**一个独立的多智能体编排 runtime / schema / adapter 项目。**

如果你要快速理解项目现在该怎么推进，先读下面三份核心文档。

---

## 1. 先读这三份

### 核心入口

1. [Core Charter](CORE_CHARTER.md)
   - 说明 AgentGraph 是什么、不是什么、Phase 1 打什么战役、哪些内容现在不做。
2. [Runtime Contract Spec](RUNTIME_CONTRACT_SPEC.md)
   - 说明 `WorkflowDefinition`、`RuntimeRequest`、`RunResult`、`StepRecord`、`CheckpointRef` 等运行时契约。
3. [Phase 1 主战役草稿](plans/agentgraph-phase1-campaign-draft.md)
   - 说明为什么现在适合启动独立主战役、第一阶段的最小可交付和理想可交付是什么。

这三份文档的关系是：

- `CORE_CHARTER.md`：项目宪章
- `RUNTIME_CONTRACT_SPEC.md`：运行时契约
- `plans/agentgraph-phase1-campaign-draft.md`：阶段推进草稿

---

## 2. 按角色阅读

### 如果你要判断项目边界

先读：

- [Core Charter](CORE_CHARTER.md)
- [Phase 1 主战役草稿](plans/agentgraph-phase1-campaign-draft.md)

### 如果你要实现 runtime / API / adapter

先读：

- [Runtime Contract Spec](RUNTIME_CONTRACT_SPEC.md)
- [Workflow Schema](WORKFLOW_SCHEMA.md)
- [Adapter Boundary](ADAPTER_BOUNDARY.md)
- [Architecture](ARCHITECTURE.md)
- [HTTP API README](api/http/README.md)

### 如果你要理解设计来源和历史叙事

先读：

- [AgentGraph 设计文档](AgentGraph-Design-Doc.md)
- [Phase 0 完成报告](PHASE0_SUMMARY.md)
- [AgentGraph 集成方案](AGENTGRAPH_INTEGRATION.md)
- [agentgraph与langgraph](agentgraph与langgraph)
- [agentgraph计划书](agentgraph计划书)

注意：

- 这些文档主要用于理解历史背景、设计来源和早期叙事
- 它们不应覆盖 `CORE_CHARTER / RUNTIME_CONTRACT_SPEC / WORKFLOW_SCHEMA` 这条当前主线

### 如果你要看教程或示例

先读：

- [你的第一个工作流](tutorials/getting-started/your-first-workflow.md)
- [Legacy Surface Map](LEGACY_SURFACE_MAP.md)
- [自定义节点开发](tutorials/advanced/custom-node-development.md)

---

## 3. 当前文档主线

### A. 项目治理与阶段规划

- [Core Charter](CORE_CHARTER.md)
- [Runtime Contract Spec](RUNTIME_CONTRACT_SPEC.md)
- [Workflow Schema](WORKFLOW_SCHEMA.md)
- [Adapter Boundary](ADAPTER_BOUNDARY.md)
- [AgentGraph 是什么产品，以及后续应该怎么推进](WHAT_IS_AGENTGRAPH.md)
- [Phase 1 主战役草稿](plans/agentgraph-phase1-campaign-draft.md)

### B. 架构与运行时

- [Architecture](ARCHITECTURE.md)
- [AgentGraph 设计文档](AgentGraph-Design-Doc.md)
- [PHASE1_IMPLEMENTATION](PHASE1_IMPLEMENTATION.md)
- [Node Implementation Details](Node-Implementation-Details.md)
- [Workflow Nodes Analysis](Workflow-Nodes-Analysis.md)

### C. Planner / Workflow 生成

- [工作流规划器使用指南](planner_usage.md)
- [自动化工作流与 LangGraph 集成设计](automation_design.md)
- [agent_config_system](agent_config_system.md)

### D. Memory / River 相关设计

- [Memory Flow Design](Memory-Flow-Design.md)
- [Memory Systems Research](Memory-Systems-Research.md)
- [MULTI_AGENT_MEMORY_DESIGN](MULTI_AGENT_MEMORY_DESIGN.md)
- [River Memory Design](River-Memory-Design.md)
- [River Network Design](River-Network-Design.md)

### E. 集成与外部关系

- [AgentGraph 集成方案](AGENTGRAPH_INTEGRATION.md)
- [CLI-Anything 与 AgentGraph / Shadow 的关系理解](CLI_ANYTHING_RELATION.md)
- [shadow_integration_strategy](shadow_integration_strategy.md)
- [SHADOW_CLAW_DESIGN](SHADOW_CLAW_DESIGN.md)
- [shadow_system_master_strategy](shadow_system_master_strategy.md)
- [shadow_system_unified_strategy](shadow_system_unified_strategy.md)
- [unified_strategy](unified_strategy.md)

### F. API 与教程

- [HTTP API README](api/http/README.md)
- [Legacy Surface Map](LEGACY_SURFACE_MAP.md)
- [你的第一个工作流](tutorials/getting-started/your-first-workflow.md)
- [自定义节点开发](tutorials/advanced/custom-node-development.md)

### G. Legacy API 与历史教程

- [Python API: AgentGraph (Legacy)](api/python/AgentGraph.md)
- [Python API: Agent (Legacy)](api/python/Agent.md)
- [Python API: Memory (Legacy)](api/python/Memory.md)
- [创建协作式多智能体 (Legacy)](tutorials/multi-agent/creating-cooperative-agents.md)

### H. 历史大文档与概念叙事

- [Phase 0 完成报告](PHASE0_SUMMARY.md)
- [AgentGraph 集成方案](AGENTGRAPH_INTEGRATION.md)
- [CLI-Anything 与 AgentGraph / Shadow 的关系理解](CLI_ANYTHING_RELATION.md)
- [agentgraph与langgraph](agentgraph与langgraph)
- [agentgraph计划书](agentgraph计划书)

---

## 4. 当前推荐阅读路径

### 路径 1：给项目负责人

1. [Core Charter](CORE_CHARTER.md)
2. [Runtime Contract Spec](RUNTIME_CONTRACT_SPEC.md)
3. [Workflow Schema](WORKFLOW_SCHEMA.md)
4. [Phase 1 主战役草稿](plans/agentgraph-phase1-campaign-draft.md)
5. [Architecture](ARCHITECTURE.md)

### 路径 2：给 runtime 实现者

1. [Runtime Contract Spec](RUNTIME_CONTRACT_SPEC.md)
2. [Workflow Schema](WORKFLOW_SCHEMA.md)
3. [Adapter Boundary](ADAPTER_BOUNDARY.md)
4. [HTTP API README](api/http/README.md)
5. [Architecture](ARCHITECTURE.md)
6. [PHASE1_IMPLEMENTATION](PHASE1_IMPLEMENTATION.md)

### 路径 3：给后续集成者

1. [Core Charter](CORE_CHARTER.md)
2. [Runtime Contract Spec](RUNTIME_CONTRACT_SPEC.md)
3. [Workflow Schema](WORKFLOW_SCHEMA.md)
4. [Adapter Boundary](ADAPTER_BOUNDARY.md)
5. [HTTP API README](api/http/README.md)

---

## 5. 文档归属原则

当前文档归属应遵守下面的原则：

- 凡是 AgentGraph 自身定位、schema、runtime、contract、phase roadmap，优先放在 AgentGraph 项目内。
- 凡是 Shadow 为什么接 AgentGraph、如何接、接完写回哪里，保留在 Shadow 侧文档。

这意味着当前 AgentGraph 项目的权威文档起点就是：

- [Core Charter](CORE_CHARTER.md)
- [Runtime Contract Spec](RUNTIME_CONTRACT_SPEC.md)
- [Workflow Schema](WORKFLOW_SCHEMA.md)
- [Adapter Boundary](ADAPTER_BOUNDARY.md)
- [HTTP API README](api/http/README.md)
- [Phase 1 主战役草稿](plans/agentgraph-phase1-campaign-draft.md)
- [Legacy Surface Map](LEGACY_SURFACE_MAP.md)

---

## 6. 当前阶段结论

当前阶段的 AgentGraph，不应被理解为一个已经定型的大而全平台。

更准确的理解是：

**AgentGraph 正在从“设计叙事 + 多线原型”收敛为“独立编排 runtime + 稳定 contract”。**

因此后续所有新增文档、实现和自动化，默认都应优先回答一个问题：

“它是否让 AgentGraph 更接近一个可被外部系统稳定调用的独立 runtime？”
