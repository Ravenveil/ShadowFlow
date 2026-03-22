# HTTP API README

当前 Phase 1 的 HTTP API 是一个围绕 runtime contract 的最小入口层，而不是完整 workflow 管理平台。

## 当前基址

```text
http://127.0.0.1:8000
```

## 当前已支持端点

### `GET /`

返回服务基本状态。

### `GET /health`

返回健康状态。

### `POST /workflow/validate`

校验一份 canonical `WorkflowDefinition`。

请求体直接是 workflow 本身：

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

响应：

```json
{
  "valid": true,
  "workflow_id": "docs-gap-review",
  "errors": [],
  "warnings": []
}
```

### `POST /workflow/run`

执行一份 `RuntimeRequest`。

```json
{
  "workflow": {
    "workflow_id": "docs-gap-review",
    "version": "0.1",
    "name": "Docs Gap Review",
    "entrypoint": "planner",
    "nodes": [],
    "edges": []
  },
  "input": {
    "goal": "Analyze docs gap and produce review notes"
  },
  "context": {},
  "memory_scope": "session",
  "execution_mode": "sync",
  "metadata": {
    "source_system": "api"
  }
}
```

响应是统一 `RunResult`，包含：

- `run`
- `steps`
- `final_output`
- `trace`
- `artifacts`
- `checkpoints`
- `errors`

### `GET /runs/{run_id}`

获取已经执行过的 `RunResult`。

### `GET /checkpoints/{checkpoint_id}`

获取某个 `CheckpointRef`。

### `POST /runs/{run_id}/resume`

从指定 checkpoint 恢复执行。

```json
{
  "checkpoint_id": "ckpt-001",
  "metadata": {
    "source_system": "api-resume"
  }
}
```

## 当前明确未支持

以下能力不要再当作当前 HTTP API 的已实现能力：

- 认证 / Bearer token
- workflow CRUD
- execution list / cancel
- streaming events
- agent registry 查询

这些内容如果出现在旧文档或旧计划里，应视为 legacy 或 future work，而不是当前 contract。

## 推荐使用顺序

1. 先 `POST /workflow/validate`
2. 再 `POST /workflow/run`
3. 如需查询已执行结果，再 `GET /runs/{id}`

## 相关文档

- [Core Charter](../../CORE_CHARTER.md)
- [Runtime Contract Spec](../../RUNTIME_CONTRACT_SPEC.md)
- [Workflow Schema](../../WORKFLOW_SCHEMA.md)
