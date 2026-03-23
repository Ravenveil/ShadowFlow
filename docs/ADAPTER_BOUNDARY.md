# AgentGraph Adapter Boundary

> 版本：0.1
> 日期：2026-03-23
> 状态：Draft

## 1. 文档目的

本文件定义外部宿主系统如何把 AgentGraph 当作黑盒 runtime 调用，而不依赖内部 graph、memory 或 router 实现。

## 2. 宿主只需要理解的对象

- `WorkflowDefinition`
- `RuntimeRequest`
- `RunResult`
- `ArtifactRef`
- `CheckpointRef`
- `WritebackRef`

宿主不应依赖：

- `agentgraph.core.graph.AgentGraph`
- legacy memory 实现
- legacy router / topology 细节
- `CheckpointState.state` 的内部实现细节

## 3. 最小调用边界

### 输入边界

宿主提交：

- 一份 canonical `WorkflowDefinition`
- 一份 `RuntimeRequest.input`
- 可选 `context`
- 可选 `metadata`
- 可选 `metadata.writeback`

### 输出边界

宿主消费：

- `RunResult.run`
- `RunResult.steps`
- `RunResult.final_output`
- `RunResult.trace`
- `RunResult.artifacts`
- `RunResult.checkpoints`

## 4. 宿主最小 writeback 分流规则

宿主当前必须消费：

- `writeback.channel`
- `writeback.target`
- `writeback.mode`
- `writeback.host_action`

最小分流规则：

1. `artifact + inline`
   - 读 `writeback.content_field`
   - 当前若存在 inline 内容，固定读取 `metadata.content`
2. `artifact + reference`
   - 读 `uri`
3. `checkpoint + reference`
   - 读 `checkpoint_id / state_ref`
   - 若 `resume_supported == true`，再保存 `next_node_id`

如果需要更细的字段约定，请直接看：

- `docs/WRITEBACK_ADAPTER_CONTRACT.md`

## 5. Checkpoint 边界

`CheckpointRef` 是当前阶段最小恢复边界。

宿主可以：

- 保存 `checkpoint_id`
- 查询其关联 `run_id`
- 在支持恢复的情况下请求从该 checkpoint 恢复
- 按 `writeback.target` 把 checkpoint ref 写回自己的 memory/graph/host substrate

宿主不应：

- 假设底层一定是数据库、文件或特定内存结构
- 直接解析 runtime 内部对象实现
- 把 `CheckpointState.state` 当作长期稳定公共接口

## 6. 推荐宿主流程

1. 调用 `validate`
2. 调用 `run`
3. 读取 `RunResult`
4. 按 `ArtifactRef.writeback` / `CheckpointRef.writeback` 分流
5. 如果需要恢复点，保存 `CheckpointRef`
6. 如发生中断，再按 `checkpoint_id` 触发恢复

## 7. 官方验证基线

当前 adapter boundary 由以下基线共同维护：

- `docs/WRITEBACK_ADAPTER_CONTRACT.md`
- `examples/runtime-contract/official-examples.yaml`
- `agentgraph/runtime/official_examples.py`
- `tests/test_runtime_examples.py`
- `tests/test_runtime_contract.py`
- `tests/test_runtime_adapters.py`

当前已覆盖：

- 官方样例 `validate`
- 官方样例 `run`
- 选定官方样例的 `checkpoint -> resume`
- service/HTTP 的 artifact/checkpoint writeback 字段
- workflow/request/node 三层 writeback 优先级
- invalid target/mode 的校验失败
- `inline` 无内容的运行失败
- parallel/barrier 输出中的 `branch_outputs`
- reference writeback adapter 的 `docs / memory / graph` 分桶写回
- in-memory checkpoint store 的最小回读与跨 service resume

## 8. 当前未承诺

- streaming adapter 协议
- 多租户 checkpoint store 标准
- 远程 worker adapter
- 真正并发调度语义
- writeback 失败后的统一重试协议

当前已支持的最小并行边界是：

- `control.parallel` fan-out
- `control.barrier` join
- barrier 输出中的 `branch_outputs`

## 9. 当前结论

当前阶段 AgentGraph 的 adapter boundary 已经是 contract-first 且 writeback-aware。

当前还提供最小 reference implementation：

- `agentgraph.runtime.ReferenceWritebackAdapter`
- `agentgraph.runtime.InMemoryCheckpointStore`

外部系统当前只需要围绕：

- workflow schema
- runtime request
- run result
- artifact/checkpoint writeback

来调用 AgentGraph。
