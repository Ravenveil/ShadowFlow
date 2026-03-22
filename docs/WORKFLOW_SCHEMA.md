# AgentGraph Workflow Schema

> 版本：0.1
> 日期：2026-03-22
> 状态：Draft
> 适用阶段：Phase 1 / Runtime Contract Campaign

---

## 1. 文档目的

本文件把 `RUNTIME_CONTRACT_SPEC.md` 中的 `WorkflowDefinition` 进一步落成可直接编写、校验、执行的 canonical schema 说明。

当前目标不是覆盖所有未来设想，而是明确：

- Phase 1 现在真正支持什么
- workflow YAML / JSON 应该长什么样
- 示例和测试应该围绕什么结构编写

---

## 2. Canonical 顶层结构

```yaml
workflow_id: "docs-gap-review"
version: "0.1"
name: "Docs Gap Review"
entrypoint: "planner"
nodes: []
edges: []
defaults: {}
metadata: {}
```

顶层字段说明：

- `workflow_id`: 工作流稳定 ID
- `version`: workflow/schema 版本
- `name`: 人类可读名称
- `entrypoint`: 起始节点 ID
- `nodes`: 节点列表
- `edges`: 边列表
- `defaults`: 默认 runtime 选项
- `metadata`: 非执行关键元数据

---

## 3. NodeDefinition

### 3.1 最小结构

```yaml
- id: "planner"
  kind: "agent"
  type: "planning.analyze"
  config:
    role: "planner"
    prompt: "Analyze the task and produce a plan."
  inputs: []
  outputs: []
  retry_policy: {}
  metadata: {}
```

### 3.2 Phase 1 当前支持

- `kind`: `agent | node`
- `type`: 任意稳定字符串，由宿主或运行时解释
- `config.role`: 节点执行身份标签
- `config.prompt`: 节点用途说明
- `config.message_template`: 该节点产出的消息模板
- `config.emit`: 注入到 step output 的键值
- `config.set_state`: 写入运行时共享状态的键值
- `config.copy_input`: 从 step input 复制字段到输出
- `config.context_echo`: 从 request context 回显字段
- `config.artifact`: 为该 step 生成 artifact

### 3.3 当前暂不承诺

- 并行节点
- barrier 节点
- 真正外部工具执行
- 节点级远程 worker 分发

---

## 4. EdgeDefinition

### 4.1 最小结构

```yaml
- from: "planner"
  to: "reviewer"
  type: "conditional"
  condition: "result.gap_count > 0"
  metadata: {}
```

### 4.2 Phase 1 当前支持

- `type: default`
- `type: conditional`
- `type: final`
- `to: END` 表示工作流结束

### 4.3 条件表达式

当前条件表达式支持：

- `result.xxx > 0`
- `result.xxx == "value"`
- `state.xxx == true`
- `result.xxx contains "foo"`
- `a && b`

注意：

- `result` 指当前 step output
- `state` 指共享运行态
- 当前不支持复杂脚本表达式

---

## 5. RuntimeRequest 与 workflow 的关系

CLI 和 HTTP API 都消费 `RuntimeRequest`，而 `workflow` 字段就是这份 canonical `WorkflowDefinition`。

最小请求示例：

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
    "source_system": "cli"
  }
}
```

---

## 6. Phase 1 已支持 / 未支持

### 已支持

- 单节点 workflow
- 顺序执行
- 条件分支
- 显式 final edge
- step trace / checkpoint / artifact 结构化输出
- CLI / HTTP API 共用同一 contract

### 未支持

- 真正循环恢复
- 并行 / barrier
- streaming
- workflow 引用注册表
- 可插拔 memory adapter 接入到新 runtime contract

---

## 7. 官方示例

当前阶段的正式 contract 对齐示例：

- `examples/runtime-contract/docs-gap-review.yaml`
- `examples/runtime-contract/research-review-loop.yaml`

这两份示例是 Phase 1 评估“独立成立标准”时的权威样例。

---

## 8. 编写建议

1. 先确保 `entrypoint` 指向存在节点
2. 所有边只引用存在节点或 `END`
3. 优先使用 `emit`、`set_state`、`artifact` 表达 Phase 1 结果
4. 不要再混用旧 `memory.backend`、`timeout`、`parallel_execution` 之类旧格式作为 canonical schema
5. 若需要旧实验格式，应明确标记为 legacy，而不是官方主线示例
