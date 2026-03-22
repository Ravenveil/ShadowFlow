# Shadow Claw 双层架构概念稿（Legacy / Concept Note）

> 这是一份历史概念说明，不是当前主线架构文档，也不是实施指南。
> 当前主线入口请以 AgentGraph 的 runtime contract、CLI 和 HTTP API 文档为准。
> 推荐优先阅读：
>
> - [文档入口](./README.md)
> - [Runtime Contract Spec](./RUNTIME_CONTRACT_SPEC.md)
> - [Workflow Schema](./WORKFLOW_SCHEMA.md)
> - [HTTP API README](./api/http/README.md)
> - [AgentGraph Phase 1 主战役规划草稿](./plans/agentgraph-phase1-campaign-draft.md)

## 这份文档曾经在讨论什么

Shadow Claw 这份设计稿主要讨论的是一种“双层交互”的想法：人类通过可视化界面使用，Agent 通过结构化命令和后台任务使用。它还延伸讨论了记忆分层、Hook、对话分支、后台运行和 UI 布局等主题。

这些内容本质上是在探索：

- 如何把人类操作面和 Agent 自动化面分开。
- 如何让知识库、记忆和工作流之间形成统一叙事。
- 如何给后续的工具链和界面留出一个可扩展的概念框架。

## 为什么它要降级为概念稿

原稿里包含了大量可直接照抄的实施内容，例如命令样例、接口草案、数据结构、运行方案、UI 草图和阶段路线图。这些内容更适合进入实现文档或阶段计划，而不适合继续放在一份历史设计稿里。

现在把它收敛后，只保留两个判断：

- 这套设计曾经代表一种方向性探索。
- 它不再是当前主线的权威入口，也不应被当成最新产品规划。

## 当前主线入口

如果要对齐现在的实现，请直接以 AgentGraph 的 runtime contract 为准：

- `WorkflowDefinition`
- `RuntimeRequest`
- `RuntimeService`
- `agentgraph` CLI
- HTTP API 的统一入口

对于 Shadow Claw 这个名字，当前更适合把它理解为历史概念或潜在工具集代号，而不是现行系统的默认架构名。

## 归档结论

- 这份文档保留为历史概念说明。
- 不再输出可执行实施细节。
- 后续若要重新讨论双层架构，应从当前 runtime contract 重新建模，而不是沿用这里的旧草案。
