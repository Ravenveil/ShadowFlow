# Shadow 体系集成战略（Legacy / Concept Note）

> 这是一份历史性概念说明，不是当前主线集成文档，也不是产品路线图。
> 当前主线入口请以 AgentGraph 的 runtime contract、CLI 和 HTTP API 文档为准。
> 推荐优先阅读：
>
> - [文档入口](./README.md)
> - [Runtime Contract Spec](./RUNTIME_CONTRACT_SPEC.md)
> - [Workflow Schema](./WORKFLOW_SCHEMA.md)
> - [HTTP API README](./api/http/README.md)
> - [AgentGraph Phase 1 主战役规划草稿](./plans/agentgraph-phase1-campaign-draft.md)

## 这份文档曾经在讨论什么

这份文档原本尝试把 Shadow、ShadowClaw、AgentGraph 和若干工具链放进同一张叙事图里，核心想法是“以知识和记忆为中心组织自动化”。它更像是一份概念拼图，而不是可执行的实施规范。

当时的讨论重点大致是：

- Shadow 作为知识与记忆的概念中心。
- AgentGraph 作为编排与推理的执行面。
- ShadowClaw 作为文档处理与底层工具的概念集合。
- 通过记忆同步、原子切片、状态回写来串起自动化流程。

## 现阶段应如何理解

今天回看，这些内容更适合被理解为历史设想，而不是当前主线承诺。文档里关于节点粒度、接口样例、命令设计、分阶段路线图的写法，已经超出了“概念说明”的范围，也容易让读者误以为它仍然描述当前实现。

因此，这里只保留结论层面的理解：

- Shadow 相关叙事可以作为背景材料。
- AgentGraph 的当前主线不应再从这份文档里取实施细节。
- 如果要继续推进集成，应以 runtime contract 和当前入口文档为准，而不是复用这里的旧方案。

## 当前主线入口

如果现在要找“应该从哪里进入”，请直接看：

- `WorkflowDefinition`
- `RuntimeRequest`
- `RuntimeService`
- `agentgraph` CLI
- HTTP API 的 runtime contract 入口

换句话说，Shadow 相关内容在当前阶段更像是概念上下文；真正的主线入口已经收敛到 AgentGraph 的统一契约与同构入口层。

## 归档结论

- 这份文档保留为历史说明。
- 不再把它当作当前集成方案或产品路线图。
- 新的实现、示例、教程和对外说明，应统一对齐当前 runtime contract 文档。
