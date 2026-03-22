# AgentGraph Writeback Adapter Contract

> 版本：0.1
> 日期：2026-03-23
> 状态：Draft

## 1. 文档目的

本文件专门定义宿主系统如何消费 AgentGraph 返回的：

- `ArtifactRef`
- `CheckpointRef`
- 与它们相关的 `writeback` 契约

它解决的问题不是“AgentGraph 自己把结果写回哪里”，而是：

- 宿主拿到哪些字段就足够继续自己的 writeback
- 宿主不应解析哪些 runtime 内部状态
- 当前默认自动化基线已经固定了哪些字段

## 2. 宿主应消费什么

当前阶段，宿主应把下面两类对象视为最小 writeback 单元：

### ArtifactRef

宿主最少读取：

- `artifact_id`
- `kind`
- `name`
- `uri`
- `producer_step_id`
- `writeback`
- `metadata.workflow_id`
- `metadata.producer_node_id`

如果 `writeback.content_field == "metadata.content"`，说明当前返回中已经包含可直接写回的内容载荷。

### CheckpointRef

宿主最少读取：

- `checkpoint_id`
- `run_id`
- `step_id`
- `state_ref`
- `state.current_node_id`
- `state.next_node_id`
- `writeback`
- `metadata.workflow_id`

如果 `writeback.resume_supported == true`，说明该 checkpoint 可作为宿主恢复入口被保存和传递。

## 3. WritebackRef 最小字段

当前阶段统一如下字段：

```json
{
  "channel": "artifact",
  "target": "host",
  "mode": "reference",
  "host_action": "persist_artifact_ref",
  "content_field": "metadata.content",
  "resume_supported": null,
  "next_node_id": null
}
```

字段说明：

- `channel`
  - `artifact | checkpoint`
- `target`
  - 当前固定为 `host`
- `mode`
  - 当前固定为 `reference`
- `host_action`
  - `persist_artifact_ref`
  - `persist_checkpoint_ref`
- `content_field`
  - 仅 artifact 可选
  - 当前若有 inline 内容，固定写为 `metadata.content`
- `resume_supported`
  - 仅 checkpoint 可选
- `next_node_id`
  - 仅 checkpoint 可选
  - 表示恢复后建议的下一节点

## 4. 当前宿主约定

### Artifact writeback

宿主当前应这样理解 artifact：

1. 先保存 `artifact_id / name / uri / producer_step_id`
2. 再保存 `writeback.host_action == "persist_artifact_ref"`
3. 如果需要直接写回文档内容，再读取 `metadata.content`

宿主当前不应假设：

- `uri` 一定是文件路径
- 内容一定只存在于 `metadata.content`
- AgentGraph 会负责替宿主写入自己的 docs / memory / graph

### Checkpoint writeback

宿主当前应这样理解 checkpoint：

1. 保存 `checkpoint_id / run_id / step_id / state_ref`
2. 保存 `writeback.resume_supported`
3. 若为 `true`，再保存 `writeback.next_node_id`

宿主当前不应假设：

- checkpoint 底层一定是数据库或磁盘
- `state.state` 的内部结构可作为长期稳定接口
- 只要拿到 checkpoint 就一定能跨版本恢复

## 5. 默认自动化基线

当前这份契约由下面的默认测试守护：

- `tests/test_runtime_examples.py`
  - 官方样例的 artifact/checkpoint writeback 字段
  - 官方 resume 样例矩阵
- `tests/test_runtime_contract.py`
  - HTTP `run / get_run / get_checkpoint / resume`
  - artifact/checkpoint writeback 断言
  - parallel barrier 的 `branch_outputs`

## 6. 当前结论

当前阶段，AgentGraph 只负责输出可消费的 `artifact/checkpoint/writeback` 契约，不负责替宿主完成最终 writeback。

宿主的最小职责仍然是：

- 保存 ArtifactRef
- 保存 CheckpointRef
- 在需要时用 checkpoint 触发恢复
- 把 artifact/checkpoint 信息写回自己的 docs、memory、graph substrate
