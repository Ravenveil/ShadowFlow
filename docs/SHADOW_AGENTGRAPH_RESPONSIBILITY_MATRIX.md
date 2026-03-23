# Shadow 与 AgentGraph 责任矩阵

这份文档用于固定当前主线下的责任边界。

- Shadow 是产品宿主，负责把能力真正接进系统、接进数据真源、接进用户与任务流程。
- AgentGraph 是编排运行时（runtime）内核，负责把工作流（workflow）、运行时契约（contract）、检查点存储（checkpoint store）与写回适配器（writeback adapter）这套公共能力收敛稳定。

当前结论很明确：

- 生产集成主要由 Shadow 负责。
- AgentGraph 负责通用运行时与公共契约。
- 参考实现只是桥接样板，不是最终生产实现。

## 文档目的

这份文档回答三件事：

1. 哪些事情应该由 AgentGraph 继续做。
2. 哪些事情应该由 Shadow 来做。
3. 两边未来怎么交接，才不会把边界再次混在一起。

它是当前主线下的权威边界说明。历史集成草稿、早期设计叙事、跨项目背景稿，都不能覆盖这里的结论。

## 当前责任矩阵

| 领域 | AgentGraph 负责 | Shadow 负责 | 当前状态 | 下一步交接点 |
| --- | --- | --- | --- | --- |
| 工作流定义 | 定义权威工作流结构、字段约束、校验规则 | 按产品任务把真实需求编译成工作流输入 | 已有 `WorkflowDefinition`、`WORKFLOW_SCHEMA.md` 和官方样例 | Shadow 按当前 schema 构造真实任务 |
| 运行时执行 | 负责 validate / run / resume、步骤推进、检查点生成、结果结构化 | 负责决定何时发起执行、何时恢复、如何把执行挂到真实任务上 | 已有 `RuntimeService`、CLI、HTTP 同构入口 | Shadow 实现任务到 `RuntimeRequest` 的接线 |
| 命令行 / HTTP 入口 | 维护一致的命令行与 HTTP 入口语义 | 选择直接嵌入还是远程调用方式 | 已有 CLI 与 FastAPI 入口 | Shadow 初期优先直接嵌入 Python 运行时 |
| 产物 / 检查点 / 写回契约 | 定义 `RunResult`、`ArtifactRef`、`CheckpointRef`、`writeback` 字段 | 按契约消费结果并做真实保存 | 契约、默认验证矩阵和 writeback 场景化已完成 | Shadow 对接 `RunResult` 与 writeback 规则 |
| 文档、记忆、图谱真写回 | 提供参考写回适配器与最小字段约定 | 把结果真正写入 Shadow 的文档、记忆、图谱真源 | 目前只有 reference adapter stub | Shadow 实现生产级写回适配器 |
| 检查点存储 | 定义最小检查点存储契约、提供参考实现 | 提供真实持久化存储、索引、生命周期管理 | 已有 `InMemoryCheckpointStore` 和最小契约文档 | Shadow 实现生产级检查点存储 |
| 请求上下文保存 | 只定义恢复时最小需要哪些上下文 | 保存真实请求上下文、用户信息、会话信息与任务来源 | 当前只有 `register_request_context` 的最小机制 | AgentGraph 补正式接口，Shadow 提供真实外部存储 |
| 多租户 / 生命周期 | 明确最小边界，不吸收宿主私有规则 | 真正负责租户隔离、保留期、清理与权限 | 当前未完成 | Shadow 定义产品规则，AgentGraph 只补最小契约说明 |
| 重试 / 降级 / 可观测性 | 继续收紧失败语义、宿主边界和 receipts 表达 | 负责真实重试策略、告警、观测、产品级降级 | 当前已有部分失败语义，但未完成生产策略 | AgentGraph 继续补通用错误模型，Shadow 落真实策略 |
| 产品界面 / 任务调度 | 不负责产品界面与产品流程编排 | 负责任务入口、交互界面、真实调度和状态呈现 | 当前未纳入 AgentGraph 主线 | Shadow 自己承接产品层调度与界面 |

## 集成边界

### Shadow 调 AgentGraph 的最小输入

Shadow 调用 AgentGraph 时，至少需要构造这些对象：

- 工作流定义 `WorkflowDefinition`
- 运行请求 `RuntimeRequest`

其中真实的用户、会话、任务来源、产品态上下文，都应由 Shadow 自己整理后放入请求上下文或元数据，而不是让 AgentGraph 猜测。

### AgentGraph 返回给 Shadow 的最小输出

AgentGraph 返回给 Shadow 的核心对象包括：

- 运行结果 `RunResult`
- 产物引用 `ArtifactRef`
- 检查点引用 `CheckpointRef`
- 写回说明 `writeback`

Shadow 应只消费这些公开字段，不应依赖 AgentGraph 内部状态结构来实现产品逻辑。

## 已具备 / 未具备

### 已具备

- 统一的工作流与运行时契约
- CLI / HTTP / Python 运行时共用的主路径
- checkpoint / resume 主链
- writeback 的 target / mode 场景化
- 参考写回适配器
- 内存版检查点存储
- 默认自动化验证基线

### 仍未具备

- Shadow 的生产级文档写回
- Shadow 的生产级记忆写回
- Shadow 的生产级图谱写回
- Shadow 的生产级检查点存储
- 请求上下文外部化正式接口
- 多租户、保留期、清理和权限边界
- 生产级写回失败重试协议

## 对 Shadow 的直接含义

这份责任矩阵要表达的意思不是“Shadow 现在还不能开始接”。

恰恰相反，当前结论是：

- 现在已经可以开始接 Shadow。
- 但这不等于 Shadow 集成已经完成。

更准确地说：

- AgentGraph 现在已经提供了可接的运行时内核、参考写回适配器、参考检查点存储和受控恢复链。
- Shadow 现在应该开始做自己的生产集成，把参考桥接替换成真实接线。

## 边界约束

- AgentGraph 不应内置 Shadow 私有业务语义。
- Shadow 不应把 AgentGraph 的内部状态对象当成公共接口。
- 参考写回适配器和内存版检查点存储只作为最小桥接样板与回归基线，不应直接当作最终生产实现。

## 相关权威文档

- [CORE_CHARTER.md](CORE_CHARTER.md)
- [RUNTIME_CONTRACT_SPEC.md](RUNTIME_CONTRACT_SPEC.md)
- [WORKFLOW_SCHEMA.md](WORKFLOW_SCHEMA.md)
- [ADAPTER_BOUNDARY.md](ADAPTER_BOUNDARY.md)
- [WRITEBACK_ADAPTER_CONTRACT.md](WRITEBACK_ADAPTER_CONTRACT.md)
- [CHECKPOINT_STORE_CONTRACT.md](CHECKPOINT_STORE_CONTRACT.md)
