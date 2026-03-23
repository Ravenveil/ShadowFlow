# 2026-03-23 一周集成冲刺拆分单

## 一句话结论

这一周的主线只保留一个：

**跑通 `Shadow -> AgentGraph -> writeback -> checkpoint -> resume` 的第一条真实集成闭环。**

为了加快进度，这一周任务明确拆成两部分：

- 一部分交给 Shadow 侧开分支实现
- 一部分留在 AgentGraph 仓内继续冲刺

## A. 交给 Shadow 侧的任务

这部分是你可以直接带过去，让 Shadow 那边开新分支跑的内容。

### 建议分支名

`feature/agentgraph-runtime-binding`

### 目标

把 AgentGraph 真正接进 Shadow，让 Shadow 侧具备最小真实写回与最小恢复链。

### 成功标准

- Shadow 能发起至少 1 条真实任务到 AgentGraph
- Shadow 能真实写回文档、记忆、图谱中的至少 1 条
- Shadow 能保存请求上下文
- Shadow 能基于检查点恢复至少 1 次

### 工作包 1：Shadow 文档写回适配器

- 把 `writeback.target=docs` 的结果接到 Shadow 文档真源
- 同时支持：
  - `mode=inline`
  - `mode=reference`
- 需要有幂等键，避免重复写入

### 工作包 2：Shadow 记忆写回适配器

- 把 `writeback.target=memory` 的结果接到 Shadow 记忆系统
- 支持写摘要、结构化结果或引用信息
- 必须保留 `run_id / artifact_id / checkpoint_id` 这类追踪字段

### 工作包 3：Shadow 图谱写回适配器

- 把 `writeback.target=graph` 的结果接到 Shadow 图谱真源
- 至少先做最小版本：
  - 能建点
  - 能挂基础边
  - 能跟任务或运行编号关联

### 工作包 4：Shadow 检查点存储

- 实现真实检查点落库
- 至少支持：
  - `put`
  - `get`
  - `get_record`
  - `list_run`
- 索引字段至少要有：
  - `checkpoint_id`
  - `run_id`
  - `step_id`
  - `task_id`
  - `user_id`
  - `session_id`
  - `next_node_id`

### 工作包 5：请求上下文保存与恢复

- 每次运行时保存原始请求上下文
- 恢复时先回取上下文，再调用 AgentGraph 恢复
- 不允许长期依赖 AgentGraph 进程内上下文缓存

### 工作包 6：Shadow 到 AgentGraph 的接线层

- 初期优先用 Python 直接嵌入，不先走命令行子进程
- 接线层负责：
  - 构造 `RuntimeRequest`
  - 调用 `RuntimeService`
  - 消费 `RunResult`
  - 调用 Shadow 自己的写回适配器与检查点存储

### 工作包 7：Shadow 侧验证

- 至少跑通 1 条真实任务链：
  - 任务发起
  - AgentGraph 运行
  - 文档或记忆或图谱写回
  - 产生检查点
  - 从检查点恢复
- 至少覆盖 1 条失败链：
  - 写回失败
  - 或检查点保存失败

### 交付物

- Shadow 分支代码
- 一份简短运行说明
- 一份最小验证记录：
  - 成功链
  - 失败链
  - 当前已知问题

## B. 留在 AgentGraph 侧的任务

这部分由我在当前仓库继续冲刺。

### 建议主线目标

把宿主最依赖的公共接口继续收硬，减少 Shadow 对接时猜接口、猜状态、猜失败语义的成本。

### 成功标准

- 请求上下文不再只依赖最小注册机制
- 检查点存储契约更完整
- 写回失败语义更清楚
- 参考接入方式更容易直接照着接

### 工作包 1：请求上下文正式接口

- 新增可注入的请求上下文读取接口
- 让 `resume` 支持外部提供上下文加载器
- 明确恢复时最小必需字段
- 补对应测试

### 工作包 2：检查点存储契约强化

- 补 tenant / retention / cleanup 边界
- 明确哪些字段宿主必须保留
- 明确哪些字段属于内部状态，不承诺长期稳定
- 更新契约文档与测试

### 工作包 3：写回失败语义收紧

- 明确这些状态：
  - 执行成功但宿主持久化失败
  - 可重试失败
  - 不可重试失败
- 让 receipts 能表达失败结果
- 补 service / HTTP / 官方样例测试

### 工作包 4：接入说明强化

- 增加宿主快速接入说明
- 增加 reference adapter / checkpoint store 注入示例
- 让 Shadow 侧不用再反读内部实现

### 工作包 5：端到端基线扩展

- 扩展：
  - 请求上下文外部加载测试
  - 跨 service 实例恢复测试
  - 写回失败边界测试
  - receipts 一致性测试

### 我这边的一周交付目标

- 1 份更硬的请求上下文接口
- 1 份更硬的检查点存储契约
- 1 套写回失败语义与测试
- 1 份更清晰的宿主快速接入说明

## C. 依赖关系

### Shadow 依赖 AgentGraph 当前已具备的能力

- `RuntimeRequest`
- `RunResult`
- `ArtifactRef`
- `CheckpointRef`
- `writeback`
- `ReferenceWritebackAdapter`
- `InMemoryCheckpointStore`

### AgentGraph 依赖 Shadow 侧反馈的内容

- 文档真源怎么写
- 记忆真源怎么写
- 图谱真源怎么写
- 请求上下文在 Shadow 里的最小落点
- 检查点存储最小索引字段是否够用

## D. 推荐并行方式

为了压缩时间，这一周建议最少按 6 条并行线推进。

### Shadow 侧

- Worker 1：文档写回
- Worker 2：记忆写回
- Worker 3：图谱写回
- Worker 4：检查点存储 + 请求上下文

### AgentGraph 侧

- Worker 5：请求上下文正式接口
- Worker 6：写回失败语义 + 检查点契约 + 测试

主线程负责：

- 对齐边界
- 合并接口
- 控制不发散
- 跑端到端验证

## E. 本周验收线

这周如果做到下面这 4 件事，就可以认为“开始可用”：

1. Shadow 发起 1 条真实任务到 AgentGraph
2. 至少 1 条真实写回成功
3. 至少 1 次检查点恢复成功
4. 至少 1 条失败路径能被正确表达，而不是静默吞掉

## F. 当前建议

你现在可以直接把 A 部分交给 Shadow 那边开分支执行。
我这边继续按 B 部分留在 AgentGraph 仓内冲刺。
这样两边不会再串行等待，而是可以真正并行推进一周冲刺。
