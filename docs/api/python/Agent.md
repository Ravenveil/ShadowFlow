# Python API: Agent (Legacy / Low-Level)

> Legacy API Notice
>
> 本页描述的是 AgentGraph 早期 `Agent` 抽象。
> 它不是当前 Phase 1 canonical workflow contract 的主入口。
>
> 如果你要构建当前主线 workflow，请优先参考：
>
> - [Workflow Schema](../../WORKFLOW_SCHEMA.md)
> - [Runtime Contract Spec](../../RUNTIME_CONTRACT_SPEC.md)

## 当前阶段如何理解 `Agent`

`Agent` 更接近：

- 历史低层实现对象
- runtime 内部可演进构件
- 旧 graph API 的组成部分

它不应该再被理解为：

- 当前对外首推的 Python public API
- 新工作流编排的首选建模入口

## 当前主线入口

当前阶段，外部调用更应该围绕：

- `WorkflowDefinition`
- `RuntimeRequest`
- `RuntimeService`
- `RunResult`

而不是围绕单个 `Agent.execute(...)` 来组织新集成。

## 当前结论

- `Agent` 抽象仍可作为低层或历史兼容能力保留
- 但新的教程、示例和集成不应把本页当作权威起点
