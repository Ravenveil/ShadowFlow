# AgentGraph Runtime Contract Spec

> 版本：0.1
> 日期：2026-03-22
> 状态：Draft
> 适用阶段：Phase 1 / Runtime Contract Campaign

---

## 1. 文档目的

本文件定义 AgentGraph 在当前阶段的最小运行时契约。

目标是统一：

- workflow definition
- runtime request
- run lifecycle
- run result
- step result
- artifact
- checkpoint
- CLI / HTTP API 输入输出形态

这份文档优先服务于三个对象：

1. AgentGraph 核心实现者
2. Shadow 等外部宿主的 adapter 实现者
3. 未来的自动化执行器与测试体系

---

## 2. 设计目标

当前阶段的 runtime contract 应满足：

1. 可被 CLI 与 HTTP API 共用
2. 可被外部宿主系统稳定消费
3. 不依赖某个特定 UI
4. 不绑定某个特定 memory backend
5. 能表达最小可恢复执行链

---

## 3. 核心对象

当前阶段统一 7 个核心对象：

- `WorkflowDefinition`
- `RuntimeRequest`
- `RunRecord`
- `StepRecord`
- `ArtifactRef`
- `CheckpointRef`
- `RunResult`

---

## 4. WorkflowDefinition

`WorkflowDefinition` 是运行前的权威编排定义。

### 4.1 最小结构

```json
{
  "workflow_id": "docs-gap-review",
  "version": "0.1",
  "name": "Docs Gap Review",
  "entrypoint": "planner",
  "nodes": [],
  "edges": [],
  "defaults": {},
  "metadata": {}
}
```

### 4.2 字段约束

- `workflow_id`: 工作流稳定标识
- `version`: schema 或 workflow 版本
- `name`: 人类可读名称
- `entrypoint`: 起始节点 ID
- `nodes[]`: 节点定义列表
- `edges[]`: 边定义列表
- `defaults`: 默认 runtime 选项
- `metadata`: 非执行关键元信息

---

## 5. NodeDefinition

### 5.1 最小结构

```json
{
  "id": "planner",
  "kind": "agent",
  "type": "planning.analyze",
  "config": {
    "role": "planner",
    "prompt": "Analyze the task and produce a plan."
  },
  "inputs": [],
  "outputs": [],
  "retry_policy": {},
  "metadata": {}
}
```

### 5.2 当前阶段支持的 `kind`

- `agent`
- `node`

### 5.3 当前阶段推荐的控制流相关节点能力

- 顺序执行节点
- 条件判断节点
- 基础并行 fan-out + barrier join 节点
- 有限循环/重试节点
- Phase 1 ideal 中可加入并行/barrier 节点

---

## 6. EdgeDefinition

### 6.1 最小结构

```json
{
  "from": "planner",
  "to": "reviewer",
  "type": "conditional",
  "condition": "state.gap_count > 0",
  "metadata": {}
}
```

### 6.2 当前阶段支持的边类型

- `default`
- `conditional`
- `final`

### 6.3 Phase 1 ideal 可扩展

- `parallel`
- `barrier`
- `loop-back`

---

## 7. RuntimeRequest

`RuntimeRequest` 是宿主系统或 CLI 提交给 runtime 的统一请求对象。

### 7.1 最小结构

```json
{
  "request_id": "req-001",
  "workflow": {},
  "input": {
    "goal": "Analyze docs gap and produce review notes"
  },
  "context": {},
  "memory_scope": "session",
  "execution_mode": "sync",
  "idempotency_key": "req-001",
  "metadata": {}
}
```

### 7.2 字段说明

- `request_id`: 本次请求 ID
- `workflow`: 内联 workflow definition，或后续可扩展为引用方式
- `input`: 主输入对象
- `context`: 外部注入上下文
- `memory_scope`: `session | user | global`
- `execution_mode`: `sync | async`
- `idempotency_key`: 幂等键
- `metadata`: 宿主附带信息

### 7.3 宿主推荐附带元数据

- `source_system`
- `domain_profile`
- `user_id`
- `session_id`
- `trace_parent`

---

## 8. Run 生命周期

当前阶段统一 Run 生命周期如下：

1. `accepted`
2. `validated`
3. `running`
4. `succeeded | failed | cancelled`

可选中间态：

- `checkpointed`
- `waiting`

---

## 9. RunRecord

### 9.1 最小结构

```json
{
  "run_id": "run-001",
  "request_id": "req-001",
  "workflow_id": "docs-gap-review",
  "status": "running",
  "started_at": "2026-03-22T14:00:00Z",
  "ended_at": null,
  "entrypoint": "planner",
  "current_step_id": null,
  "metadata": {}
}
```

### 9.2 关键要求

- `run_id` 在一次运行中全局唯一
- `status` 必须反映真实生命周期状态
- `started_at` / `ended_at` 必须可用于恢复与审计

---

## 10. StepRecord

`StepRecord` 是当前阶段最重要的执行输出对象。

### 10.1 最小结构

```json
{
  "step_id": "step-001",
  "run_id": "run-001",
  "node_id": "planner",
  "status": "succeeded",
  "index": 1,
  "input": {},
  "output": {},
  "trace": [],
  "artifacts": [],
  "error": null,
  "started_at": "2026-03-22T14:00:01Z",
  "ended_at": "2026-03-22T14:00:03Z",
  "metadata": {}
}
```

### 10.2 `status` 枚举

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`
- `cancelled`

### 10.3 `trace` 最小要求

trace 至少应支持以下事件：

- reasoning
- tool_call
- tool_result
- route_decision
- validation_result
- warning

---

## 11. ArtifactRef

`ArtifactRef` 表示运行产生的外部化结果引用。

### 11.1 最小结构

```json
{
  "artifact_id": "artifact-001",
  "kind": "document",
  "name": "review-notes.md",
  "uri": "file:///tmp/review-notes.md",
  "producer_step_id": "step-002",
  "metadata": {}
}
```

### 11.2 当前阶段建议支持的 `kind`

- `text`
- `json`
- `document`
- `report`
- `patch`
- `log`

### 11.3 当前阶段 writeback 要求

- `ArtifactRef` 当前必须带 `writeback`
- 宿主应优先保存 artifact reference，而不是假设 runtime 会替它写回
- `writeback.target` 当前支持：`host | docs | memory | graph`
- `writeback.mode` 当前支持：`reference | inline`
- 如果当前 artifact 含 inline 内容，统一通过 `writeback.content_field == "metadata.content"` 暴露
- 当前优先级为：
  - `workflow.defaults.writeback`
  - `RuntimeRequest.metadata.writeback`
  - `node.config.artifact.writeback`

---

## 12. CheckpointRef

`CheckpointRef` 用于表达最小可恢复执行状态。

### 12.1 最小结构

```json
{
  "checkpoint_id": "ckpt-001",
  "run_id": "run-001",
  "step_id": "step-002",
  "state_ref": "checkpoint://run-001/step-002",
  "created_at": "2026-03-22T14:00:03Z",
  "metadata": {}
}
```

### 12.2 当前阶段要求

- 可以定位到某个 run 与 step
- 可以标识恢复所需状态引用
- 不强制规定底层存储实现

### 12.3 当前阶段 resume / writeback 要求

- `CheckpointRef` 当前必须带 `writeback`
- `writeback.target` 当前支持：`host | docs | memory | graph`
- `writeback.mode` 当前固定为 `reference`
- `writeback.resume_supported` 表示宿主是否应把它当作可恢复入口保存
- `writeback.next_node_id` 表示当前恢复后建议的下一节点

---

## 13. RunResult

`RunResult` 是 CLI 和 HTTP API 的统一返回对象。

### 13.1 最小结构

```json
{
  "run": {},
  "status": "succeeded",
  "final_output": {},
  "steps": [],
  "artifacts": [],
  "checkpoints": [],
  "errors": [],
  "metadata": {}
}
```

### 13.2 当前阶段最小要求

- `run`
- `status`
- `final_output`
- `steps[]`
- `artifacts[]`
- `metadata`

### 13.3 推荐扩展字段

- `checkpoints[]`
- `warnings[]`
- `metrics`

---

## 14. CLI Contract

### 14.1 `agentgraph validate`

输入：

- workflow file path

输出：

```json
{
  "valid": true,
  "workflow_id": "docs-gap-review",
  "errors": [],
  "warnings": []
}
```

### 14.2 `agentgraph run`

输入：

- workflow file path
- runtime input
- optional context

输出：

- 标准 `RunResult`

CLI 可以提供人类友好格式，但必须能输出 machine-readable JSON。

---

## 15. HTTP API Contract

### 15.1 `POST /workflow/validate`

请求体：

- `WorkflowDefinition`

响应：

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

### 15.2 `POST /workflow/run`

请求体：

- `RuntimeRequest`

响应：

- `RunResult`

### 15.3 `GET /runs/{id}`

响应：

- `RunResult`
- 或最小 `RunRecord + steps + artifacts`

---

## 16. 错误契约

错误对象至少包含：

```json
{
  "code": "workflow.validation_failed",
  "message": "Entrypoint node not found",
  "step_id": null,
  "node_id": null,
  "retryable": false,
  "metadata": {}
}
```

### 16.1 建议错误分类

- `workflow.*`
- `runtime.*`
- `node.*`
- `tool.*`
- `checkpoint.*`
- `adapter.*`

---

## 17. 与 Shadow 的 Adapter Boundary

Shadow 或其他宿主系统与 AgentGraph 的最小边界应是：

- 宿主提交 `RuntimeRequest`
- AgentGraph 返回 `RunResult`
- 宿主消费 `steps / artifacts / checkpoints / final_output`
- 宿主自行负责 writeback 到自己的 docs、memory、graph substrate

这意味着 AgentGraph 不应在当前阶段直接承担：

- 宿主的统一图底座
- 宿主的长期知识沉淀
- 宿主的 UI 工作台状态

---

## 18. Phase 1 强制一致性要求

在 Phase 1 中，下面几件事必须保持一致：

1. CLI 与 HTTP API 消费同一份 `WorkflowDefinition`
2. CLI 与 HTTP API 返回同一结构的 `RunResult`
3. step 的字段名、状态枚举、artifact/checkpoint 结构必须统一
4. 示例 workflow 与文档里的 contract 保持一致

---

## 19. 当前明确不规定的内容

本规范在当前阶段故意不强规定：

- 具体 memory backend
- 具体 trace 存储实现
- 具体 checkpoint 序列化格式
- 是否使用 LangGraph 作为内部适配层
- UI editor 的模型细节

这些内容可以演进，但不得破坏对外 contract。

---

## 20. 下一步

本规范之后，建议补充以下文档：

1. `WORKFLOW_SCHEMA_REFERENCE.md`
2. `EXECUTION_MODEL.md`
3. `SHADOW_ADAPTER_GUIDE.md`

后续实现、测试与自动化应优先对齐本文件，而不是对齐零散历史草稿。
