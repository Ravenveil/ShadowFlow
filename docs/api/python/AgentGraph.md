# Python API: AgentGraph (Legacy)

> Legacy API Notice
>
> 本页描述的是 AgentGraph 早期 `AgentGraph` Python Graph API。
> 它**不是**当前 Phase 1 的权威 public API，也不应作为新的集成入口。
>
> 如果你要按当前主线使用 AgentGraph，请优先阅读：
>
> - [Runtime Contract Spec](../../RUNTIME_CONTRACT_SPEC.md)
> - [Workflow Schema](../../WORKFLOW_SCHEMA.md)
> - [HTTP API README](../http/README.md)

## 当前主线入口

当前 Phase 1 推荐的 Python 使用方式是 runtime-contract first：

```python
from agentgraph import WorkflowDefinition, RuntimeRequest, RuntimeService

workflow = WorkflowDefinition.model_validate(payload)
service = RuntimeService()
result = await service.run(
    RuntimeRequest(
        workflow=workflow,
        input={"goal": "Analyze docs gaps"},
        metadata={"source_system": "python"},
    )
)
```

## 为什么这页被降级为 legacy

历史 `AgentGraph` API 主要围绕以下对象展开：

- `AgentGraph`
- `add_agent(...)`
- `invoke(input, user_id, workflow_id)`
- `get_workflow_state(...)`
- `cancel_workflow(...)`
- `SQLiteMemory` / `RedisMemory`

这些接口反映的是旧 graph/memory-centric 编排模型，而不是当前已经收敛的：

- `WorkflowDefinition`
- `RuntimeRequest`
- `RunResult`
- `CheckpointRef`

## 当前结论

- `AgentGraph` 类仍可视为历史兼容 surface
- 但它不是当前 Phase 1 runtime contract 的权威入口
- 新的示例、教程、宿主集成和自动化执行，应统一围绕 runtime contract 展开
