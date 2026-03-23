# AgentGraph Writeback Adapter Contract

> 版本：0.1
> 日期：2026-03-23
> 状态：Draft

## 1. 文档目的

本文件定义宿主系统如何消费 AgentGraph 返回的：

- `ArtifactRef`
- `CheckpointRef`
- `WritebackRef`

重点不是“runtime 自己把结果写到哪里”，而是：

- runtime 会给宿主什么 writeback 指示
- 宿主该如何按 `target / mode / host_action` 分流
- 哪些 writeback 组合当前合法
- 哪些失败路径已经进入默认验证基线

## 2. 当前支持的 writeback 场景

### 2.1 `writeback.target`

当前 Phase 1 支持以下 target：

- `host`
- `docs`
- `memory`
- `graph`

它们表示宿主应该把该对象视为写回哪个外部 substrate，而不是表示 AgentGraph 会直接替宿主完成持久化。

### 2.2 `writeback.mode`

按 channel 区分：

- `artifact`
  - `reference`
  - `inline`
- `checkpoint`
  - 仅支持 `reference`

当前不支持：

- `checkpoint.inline`
- 节点级 checkpoint writeback override

## 3. 配置优先级

当前 writeback 配置按以下优先级解析：

1. `workflow.defaults.writeback`
2. `RuntimeRequest.metadata.writeback`
3. `node.config.artifact.writeback`

说明：

- 第 3 层只作用于 `artifact`
- `checkpoint` 当前只接受 workflow/request 两层配置
- 未配置时默认回落为：
  - `target: host`
  - `mode: reference`

## 4. 宿主最小消费规则

### 4.1 Artifact

宿主至少读取：

- `artifact_id`
- `kind`
- `name`
- `uri`
- `producer_step_id`
- `writeback.channel`
- `writeback.target`
- `writeback.mode`
- `writeback.host_action`
- `metadata.workflow_id`
- `metadata.producer_node_id`

分流规则：

1. `artifact + reference`
   - 优先读取 `uri`
   - 再按 `target` 决定写回到 docs/memory/graph/host
2. `artifact + inline`
   - 读取 `writeback.content_field`
   - 当前若存在 inline 内容，固定指向 `metadata.content`
   - 宿主可以直接用该内容继续写回 docs 或其他 substrate

### 4.2 Checkpoint

宿主至少读取：

- `checkpoint_id`
- `run_id`
- `step_id`
- `state_ref`
- `state.current_node_id`
- `state.next_node_id`
- `writeback.channel`
- `writeback.target`
- `writeback.mode`
- `writeback.host_action`
- `writeback.resume_supported`
- `writeback.next_node_id`
- `metadata.workflow_id`

分流规则：

1. `checkpoint + reference`
   - 保存 `checkpoint_id / state_ref`
   - 若 `resume_supported == true`，保存 `next_node_id`
   - 按 `target` 决定 checkpoint ref 属于 host/memory/graph 的哪条宿主链

## 5. 最小字段形状

### 5.1 Artifact writeback

```json
{
  "channel": "artifact",
  "target": "docs",
  "mode": "inline",
  "host_action": "persist_artifact_ref",
  "content_field": "metadata.content",
  "resume_supported": null,
  "next_node_id": null
}
```

### 5.2 Checkpoint writeback

```json
{
  "channel": "checkpoint",
  "target": "memory",
  "mode": "reference",
  "host_action": "persist_checkpoint_ref",
  "content_field": null,
  "resume_supported": true,
  "next_node_id": "reviewer"
}
```

## 6. 失败路径

### 6.1 contract validation failure

以下情况属于契约校验失败：

- `writeback.target` 不在 `host/docs/memory/graph`
- `artifact.mode` 不在 `reference/inline`
- `checkpoint.mode` 不是 `reference`
- `writeback` 不是对象
- `writeback` 包含不支持的 channel

这些失败会在：

- `WorkflowDefinition` 校验阶段
- `RuntimeRequest` 校验阶段

被尽量提前挡住。

### 6.2 runtime/build failure

以下情况属于运行期失败：

- `artifact.mode == inline`，但 artifact 没有可写回内容

当前运行时会直接抛错，HTTP adapter 会返回 `400`。

## 7. 默认自动化基线

当前这份契约由以下默认基线守护：

- `tests/test_runtime_examples.py`
  - 官方样例 `validate/run`
  - 官方样例 `checkpoint -> resume`
  - workflow/request/node 三层 writeback 优先级断言
- `tests/test_runtime_contract.py`
  - service 与 HTTP 的 artifact/checkpoint writeback 断言
  - invalid target/mode 校验失败
  - `inline` 无内容的失败路径
  - parallel/barrier 与 writeback 共存回归

## 8. 当前结论

当前阶段，AgentGraph 已经能够：

- 返回面向宿主可消费的 `artifact/checkpoint/writeback` 契约
- 用 `target / mode / host_action` 指示宿主该如何继续处理
- 对明显非法的 writeback 组合进行前置校验

当前阶段，AgentGraph 仍然不负责：

- 直接替宿主持久化 docs/memory/graph
- 定义多租户 checkpoint store 标准
- 定义 writeback 失败后的跨宿主重试协议
