# AgentGraph Checkpoint Store Contract

> 版本：0.1
> 日期：2026-03-23
> 状态：Draft

## 1. 文档目的

本文件定义 AgentGraph 当前阶段最小的 checkpoint store 外部契约。

它解决的问题是：

- checkpoint 至少要被怎样保存
- 宿主需要从 store 读回哪些字段
- 当前 reference implementation 到底支持到哪一步

## 2. 当前最小 store 能力

当前最小 checkpoint store 需要提供：

1. `put(checkpoint)`
2. `get(checkpoint_id)`
3. `get_record(checkpoint_id)`
4. `list_run(run_id)`

对应的 reference implementation 是：

- `agentgraph.runtime.InMemoryCheckpointStore`

## 3. 最小记录结构

当前 store 记录最少包含：

- `checkpoint_id`
- `run_id`
- `step_id`
- `target`
- `location`
- `state_ref`
- `next_node_id`
- `resume_supported`
- `stored_at`
- `metadata`

其中：

- `location` 是宿主可追踪的 store 位置
- `target` 与 `CheckpointRef.writeback.target` 一致
- `metadata.current_node_id` 用于快速判断恢复点所在节点

## 4. 当前恢复边界

当前 reference implementation 已支持：

- checkpoint 从 runtime 内存缓存写入 store
- 新的 `RuntimeService` 实例从共享 store 回读 checkpoint
- 在外部重新注册 request context 后继续 `resume`

当前明确还不支持：

- 只靠 checkpoint store 就完成跨进程恢复
- 自动恢复原始 `RuntimeRequest`
- 多租户隔离协议
- 跨版本 checkpoint 兼容承诺

## 5. 与宿主 adapter 的关系

当前推荐链路是：

1. runtime 产出 `CheckpointRef`
2. `ReferenceWritebackAdapter` 或宿主自己的 adapter 按 `writeback.target` 分流
3. checkpoint store 保存最小恢复记录
4. 宿主在需要时重新注入 request context，再触发 `resume`

这意味着当前 store 的职责是：

- 保存 checkpoint
- 暴露最小回读能力

而不是：

- 替宿主保存完整业务上下文
- 替宿主做租户治理
- 替宿主决定 checkpoint 生命周期策略

## 6. 当前结论

当前 checkpoint store 契约已经足够支撑：

- Phase 1 受控集成
- 同一宿主内的最小恢复链
- reference adapter 的回归验证

但它还不是最终的生产级 checkpoint subsystem。下一阶段需要继续补：

- request context 的外部化
- tenant scope
- retention / cleanup 策略
- store backend 插拔边界
