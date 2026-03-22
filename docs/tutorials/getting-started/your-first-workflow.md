# Your First Workflow

本教程基于 AgentGraph Phase 1 的 canonical workflow schema，目标是让你创建一份可被 CLI 和 HTTP API 一致消费的 workflow。

## Prerequisites

在开始前，请确认：

- Python 3.9 或更高版本
- 已安装 `agentgraph`
- 你会使用命令行运行 YAML workflow

## Step 1: 创建第一份 canonical workflow

创建 `hello_world.yaml`：

```yaml
workflow_id: "hello-world"
version: "0.1"
name: "Hello World"
entrypoint: "greeter"
nodes:
  - id: "greeter"
    kind: "agent"
    type: "greeting.respond"
    config:
      role: "greeter"
      prompt: "Welcome the user and ask how to help."
      message_template: "[greeter] welcomed the user and offered help."
      emit:
        greeted: true
edges:
  - from: "greeter"
    to: "END"
    type: "final"
defaults: {}
metadata: {}
```

## Step 2: 校验 workflow

```bash
agentgraph validate -w hello_world.yaml
```

如果结构正确，你会得到一个 JSON 校验结果，其中 `valid` 为 `true`。

## Step 3: 运行 workflow

```bash
agentgraph run -w hello_world.yaml -i "{\"goal\":\"Say hello to a new user\"}"
```

当前 CLI 会输出完整的 `RunResult` JSON，其中包含：

- `run`
- `steps`
- `final_output`
- `trace`
- `artifacts`
- `checkpoints`

## Step 4: 创建一个双节点 workflow

创建 `multi_step.yaml`：

```yaml
workflow_id: "question-review"
version: "0.1"
name: "Question Review"
entrypoint: "researcher"
nodes:
  - id: "researcher"
    kind: "agent"
    type: "research.collect"
    config:
      role: "researcher"
      prompt: "Collect findings for the user question."
      message_template: "[researcher] collected findings."
      emit:
        draft_ready: true
        quality_score: 8
      set_state:
        draft_ready: true
  - id: "reviewer"
    kind: "agent"
    type: "review.evaluate"
    config:
      role: "reviewer"
      prompt: "Review the findings and approve them."
      message_template: "[reviewer] approved the findings."
      emit:
        approved: true
edges:
  - from: "researcher"
    to: "reviewer"
    type: "conditional"
    condition: "result.draft_ready == true && result.quality_score >= 7"
  - from: "reviewer"
    to: "END"
    type: "conditional"
    condition: "result.approved == true"
defaults: {}
metadata: {}
```

这个例子展示了当前 Phase 1 已支持的条件边写法。

## Step 5: 理解输出结构

一次运行会返回统一 `RunResult`，核心结构类似：

```json
{
  "run": {
    "run_id": "run-001",
    "workflow_id": "question-review",
    "status": "succeeded"
  },
  "steps": [
    {
      "step_id": "step-001",
      "node_id": "researcher",
      "status": "succeeded"
    }
  ],
  "final_output": {
    "message": "[reviewer] approved the findings."
  },
  "trace": [],
  "artifacts": [],
  "checkpoints": []
}
```

## 当前最重要的约束

请优先遵守以下规则：

1. 不再把旧 `memory.backend`、`timeout`、`parallel_execution` 当作 canonical schema 顶层字段
2. 所有边必须引用真实节点或 `END`
3. `entrypoint` 必须指向存在节点
4. 若需要查看更多字段约束，直接以 [Workflow Schema](../../WORKFLOW_SCHEMA.md) 为准

## Next Steps

继续阅读：

1. [Workflow Schema](../../WORKFLOW_SCHEMA.md)
2. [Runtime Contract Spec](../../RUNTIME_CONTRACT_SPEC.md)
3. [Examples README](../../../examples/README.md)
