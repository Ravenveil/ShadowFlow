# AgentGraph Adapter Boundary

> 版本：0.1
> 日期：2026-03-22
> 状态：Draft

## 1. 文档目的

本文件定义外部宿主系统如何把 AgentGraph 当作黑盒 runtime 调用，而不依赖内部实现细节。

## 2. 宿主只需要理解的对象

- `WorkflowDefinition`
- `RuntimeRequest`
- `RunResult`
- `CheckpointRef`

宿主不应依赖：

- `agentgraph.core.graph.AgentGraph`
- legacy memory 实现
- legacy router / topology 细节

## 3. 最小调用边界

### 输入边界

宿主提交：

- 一份 canonical `WorkflowDefinition`
- 一份 `RuntimeRequest.input`
- 可选 `context` / `metadata`

### 输出边界

宿主消费：

- `RunResult.run`
- `RunResult.steps`
- `RunResult.final_output`
- `RunResult.trace`
- `RunResult.artifacts`
- `RunResult.checkpoints`

## 4. Checkpoint 边界

`CheckpointRef` 是当前阶段最小恢复边界。

宿主可以：

- 保存 `checkpoint_id`
- 查询其关联 `run_id`
- 在支持恢复的情况下请求从该 checkpoint 恢复

宿主不应：

- 假设底层一定是数据库、文件或特定内存结构
- 直接解析 runtime 内部对象实现

## 5. 推荐宿主流程

1. 调用 `validate`
2. 调用 `run`
3. 读取 `RunResult`
4. 如果需要恢复点，保存 `CheckpointRef`
5. 如发生中断，再按 `checkpoint_id` 触发恢复

## 6. 当前未承诺

- streaming adapter 协议
- 多租户 checkpoint store 标准
- 远程 worker adapter
- 真正并发调度语义

当前已支持的最小并行边界是：

- `control.parallel` fan-out
- `control.barrier` join
- barrier 输出中的 `branch_outputs`

## 7. 当前结论

当前阶段 AgentGraph 的 adapter boundary 是 contract-first，而不是 implementation-first。

外部系统只需要围绕：

- workflow schema
- runtime request
- run result
- checkpoint reference

来调用 AgentGraph。
