# AgentGraph Writeback Adapter Contract

> 版本：0.2
> 日期：2026-03-23
> 状态：Draft

## 1. 文档目的

本文件定义宿主系统如何消费 AgentGraph 返回的：

- `ArtifactRef`
- `CheckpointRef`
- 它们携带的 `writeback` 契约

当前重点不是“runtime 自己把内容写到哪里”，而是：

- 宿主如何根据 `writeback.target / writeback.mode` 决定自己的写回动作
- 哪些 writeback 配置可以在 workflow / request / node 三层声明
- 哪些失败会在校验期暴露，哪些失败会在运行期暴露

## 2. 当前支持的 writeback 场景

### 2.1 target

当前 `writeback.target` 支持：

- `host`
- `docs`
- `memory`
- `graph`

解释：

- `host`
  - 宿主自己决定落点
- `docs`
  - 宿主应把结果写回文档/知识页面一类基底
- `memory`
  - 宿主应把结果写回自己的 memory substrate
- `graph`
  - 宿主应把结果写回自己的 graph substrate

### 2.2 mode

当前 `writeback.mode` 支持：

- artifact:
  - `reference`
  - `inline`
- checkpoint:
  - `reference`

解释：

- `reference`
  - runtime 返回引用对象，宿主自行保存 ref 和关联元数据
- `inline`
  - runtime 返回可直接写回的内容载荷；当前通过 `metadata.content` 暴露

## 3. 三层优先级

当前 writeback 的解析优先级如下：

### 3.1 workflow defaults

`WorkflowDefinition.defaults.writeback`

作用：

- 为整个 workflow 提供默认 artifact/checkpoint writeback 策略

示意：

```yaml
defaults:
  writeback:
    artifact:
      target: docs
      mode: inline
    checkpoint:
      target: memory
      mode: reference
```

### 3.2 runtime request metadata

`RuntimeRequest.metadata.writeback`

作用：

- 宿主可在发起 run 时覆盖 workflow 默认写回目标
- 这是当前 Host / CLI / HTTP adapter 层最直接的宿主场景入口

示意：

```json
{
  "metadata": {
    "writeback": {
      "artifact": { "target": "graph", "mode": "inline" },
      "checkpoint": { "target": "docs", "mode": "reference" }
    }
  }
}
```

### 3.3 node artifact override

`node.config.artifact.writeback`

作用：

- 仅对当前节点产出的 artifact 生效
- 优先级高于 workflow defaults 和 runtime request metadata
- 当前不支持节点级 checkpoint writeback

示意：

```yaml
artifact:
  kind: document
  name: content-creation-final.md
  content: "# Final"
  writeback:
    target: host
    mode: reference
```

## 4. 宿主最小消费字段

### 4.1 ArtifactRef

宿主最少读取：

- `artifact_id`
- `kind`
- `name`
- `uri`
- `producer_step_id`
- `writeback.channel`
- `writeback.target`
- `writeback.mode`
- `writeback.host_action`
- `writeback.content_field`
- `metadata.workflow_id`
- `metadata.producer_node_id`

当前 artifact 的 `host_action` 固定为：

- `persist_artifact_ref`

### 4.2 CheckpointRef

宿主最少读取：

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

当前 checkpoint 的 `host_action` 固定为：

- `persist_checkpoint_ref`

## 5. 失败路径

### 5.1 校验期失败

下面这些错误会在 Pydantic / contract 校验期直接失败：

- `workflow defaults.writeback` 不是对象
- `runtime request metadata.writeback` 不是对象
- channel 不是 `artifact` / `checkpoint`
- `target` 不在 `host/docs/memory/graph` 内
- checkpoint 使用 `mode: inline`
- node 级 `artifact.writeback` 结构非法

### 5.2 运行期失败

下面这些错误会在 runtime 执行期失败：

- artifact 的 `mode == inline`，但实际没有 `content`

这是当前阶段一个刻意保留的运行期校验，因为只有真正执行到节点、拿到 artifact payload 后才能知道内容是否存在。

## 6. 宿主应如何理解当前语义

### 6.1 artifact

如果看到：

- `target = docs`
- `mode = inline`

宿主应理解为：

- 结果应写回 docs substrate
- 可直接从 `metadata.content` 取内容

如果看到：

- `target = host`
- `mode = reference`

宿主应理解为：

- runtime 只保证给出 artifact ref
- 最终写入由宿主自己决定

### 6.2 checkpoint

checkpoint 当前始终是 `reference` 模式。

宿主应这样理解：

1. 先保存 `checkpoint_id / run_id / state_ref`
2. 再保存 `resume_supported / next_node_id`
3. 如需恢复，再通过 `checkpoint_id` 调用 resume

宿主当前不应假设：

- checkpoint 一定可跨版本恢复
- `state.state` 内部结构是长期稳定接口
- runtime 会替宿主决定最终持久化 backend

## 7. 默认自动化基线

当前这份契约由以下资产共同守护：

- `examples/runtime-contract/official-examples.yaml`
- `agentgraph/runtime/official_examples.py`
- `tests/test_runtime_examples.py`
- `tests/test_runtime_contract.py`

覆盖范围包括：

- 官方样例 `validate`
- 官方样例 `run`
- 官方样例 `checkpoint -> resume`
- scenarioized `writeback.target / writeback.mode`
- 节点级 artifact writeback override
- inline writeback 缺内容的失败路径
- HTTP `run / get_run / get_checkpoint / resume` 宿主最小调用链

## 8. 当前结论

AgentGraph 当前已经能输出“宿主可消费”的 writeback 契约，但还没有替宿主实现最终 writeback adapter。

也就是说，现在已经具备：

- 明确的 artifact/checkpoint/writeback 输出结构
- 可配置的目标与模式
- resume 可用的 checkpoint 语义
- 默认自动化验证基线

但宿主仍需自己完成：

- 真正的 docs/memory/graph 持久化动作
- writeback 失败后的重试与补偿
- 多租户 checkpoint store 策略
