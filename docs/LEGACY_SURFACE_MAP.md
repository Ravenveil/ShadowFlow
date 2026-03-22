# AgentGraph Legacy Surface Map

> 日期：2026-03-23
> 状态：Updated

## 1. 文档目的

本文件用于明确：

- 哪些文档/示例仍然属于 legacy surface
- 为什么它们当前不能作为 Phase 1 权威入口
- 后续应迁移、保留还是归档

这不是为了否定历史探索，而是为了防止 legacy 内容继续干扰 `Runtime Contract Campaign` 主线。

## 2. 当前权威入口

当前 Phase 1 权威入口只有这些：

- [CORE_CHARTER.md](CORE_CHARTER.md)
- [RUNTIME_CONTRACT_SPEC.md](RUNTIME_CONTRACT_SPEC.md)
- [WORKFLOW_SCHEMA.md](WORKFLOW_SCHEMA.md)
- [WHAT_IS_AGENTGRAPH.md](WHAT_IS_AGENTGRAPH.md)
- [plans/agentgraph-phase1-campaign-draft.md](plans/agentgraph-phase1-campaign-draft.md)
- `examples/runtime-contract/*.yaml`

## 3. 当前 legacy surface

### A. Legacy workflow examples

以下示例仍主要使用旧 schema 或旧能力设想：

- `examples/simple_workflow.yaml`
- `examples/multi-agent/content-creation-workflow.yaml`
- `examples/complex-workflows/data-processing-pipeline.yaml`
- `examples/integrations/github-monitoring-workflow.yaml`
- `examples/templates/*.yaml`

典型 legacy 特征：

- 顶层 `name` / `memory.backend`
- `to: "output"`
- `parallel_execution`
- `${...}` 条件表达式
- 旧命令或未实现能力假设

### B. Legacy tutorials

- `docs/tutorials/multi-agent/creating-cooperative-agents.md`

原因：

- 教程仍大面积展示旧 workflow 结构与旧能力设定。

### C. Legacy API docs

- 历史版 HTTP API 文档曾描述认证、workflow CRUD、streaming execution 等当前未实现能力。

现状：

- 该入口已改写为当前 contract 版本，但如果后续看到旧草稿，应视为 legacy。

### D. AgentGraph historical large docs

以下文档仍包含大量历史阶段判断、旧产品叙事或早期集成设想：

- `docs/PHASE0_SUMMARY.md`
- `docs/AGENTGRAPH_INTEGRATION.md`
- `docs/CLI_ANYTHING_RELATION.md`
- `docs/agentgraph与langgraph`
- `docs/agentgraph计划书`

原因：

- 它们保留历史价值，但不应作为当前 Phase 1 contract、当前集成边界或当前 public API 的权威入口。

### E. Cross-project background notes kept inside this repo

以下文档仍在本仓库中，但更适合被理解为跨项目背景稿或概念噪音，而不是 AgentGraph 当前主线文档：

- `docs/shadow_integration_strategy.md`
- `docs/SHADOW_CLAW_DESIGN.md`
- `docs/shadow_system_master_strategy.md`
- `docs/shadow_system_unified_strategy.md`
- `docs/unified_strategy.md`
- `examples/ai-code-assistant/README.md`

原因：

- 它们保留背景价值，但不应继续占据 AgentGraph 历史文档主体位置，更不应作为当前 Phase 1 contract、当前集成边界或当前 public API 的权威入口。

### F. Legacy tests

- `tests/legacy/`

原因：

- 这些测试主要覆盖旧 `AgentGraph` 图对象、旧 memory backend、旧 router / topology 和早期 workflow 执行模型。
- 它们仍有历史回归价值，但不应继续污染默认 Phase 1 contract baseline。

## 4. 处理策略

### 立即执行

- 在高风险 legacy 示例和教程顶部加显式标记
- 在权威入口文档中明确 canonical vs legacy
- 不再把 legacy 示例列为“Quick Start”
- 默认 `pytest -q` 只运行 Phase 1 contract baseline
- legacy tests 迁移到 `tests/legacy/`，需要显式 `--run-legacy`

### 后续迁移

- 逐步将高价值 legacy 示例迁移到 canonical `WorkflowDefinition`
- 将无法短期迁移的内容保留为历史研究材料
- 清理仍依赖旧接口的测试与 README 引导
- 将高噪音历史大文档收敛为简短 legacy/concept note，并把读者导向当前主线入口
- 继续按需把仍有价值的 legacy tests 分批修复或保留为历史回归面

## 5. 当前结论

AgentGraph 不是“没有历史资产”，而是当前必须区分：

- 什么是 Phase 1 权威 contract
- 什么只是历史探索或未来设想

只有先把这层边界说清，并把 legacy tests 在目录层显式隔离，runtime contract 主线才不会继续被旧叙事和旧实现口径带偏。
