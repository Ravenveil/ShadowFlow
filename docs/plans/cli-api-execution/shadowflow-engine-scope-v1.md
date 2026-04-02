# ShadowFlow Engine Scope v1

> 日期：2026-03-31
> 状态：Engine Mainline
> 目的：在 `ShadowFlow` 正式收口为引擎后，明确它现在应该负责什么、不应该负责什么，以及近期最值得推进的能力边界

---

## 1. 一句话结论

`ShadowFlow` 现在不再承担用户侧 CLI 产品包装，也不承担 UI 产品壳。

它应被明确收口为：

**多 Agent 编排引擎。**

也就是说，`ShadowFlow` 当前最该做的是：

- 运行时 contract
- 编排与编译
- 任务树与子任务
- 文件协作与 writeback
- graph projection
- 执行协议

而不是：

- 对话产品壳
- 用户侧 CLI 体验
- 知识库入口体验
- 模型设置面板
- 工作台排布

---

## 2. 为什么现在要这样收口

结合 `Shadow` 当前主线可以看到：

1. `ShadowClaw` 正在向“对话 + 执行 + 记忆 + 工具 + 图谱”的统一入口收敛
2. `Shadow CLI` 正在承担终端型用户入口
3. `Shadow UI` 正在承接工作空间、图谱、白板和执行工作面

因此 `ShadowFlow` 再继续扩张“用户入口壳”，只会造成：

1. 双 CLI 冲突
2. 双工作台冲突
3. 协议重复定义
4. 产品心智混乱

所以此时最正确的动作不是“再包装引擎”，而是：

**把引擎做深。**

---

## 3. ShadowFlow 应负责的 6 类核心能力

## 3.1 运行时对象模型（Runtime Contract）

`ShadowFlow` 必须正式拥有并维护这些对象：

1. `task`
2. `run`
3. `step`
4. `artifact`
5. `checkpoint`
6. `memory_event`
7. `handoff`

这些对象应满足三件事：

1. 可恢复
2. 可追踪
3. 可投影

也就是：

- `Shadow CLI` 可以查询、继续、观察
- `Shadow UI` 可以投影成 graph / workspace / detail panel
- 后续记忆系统可以消费并沉淀

## 3.2 Sub-agent Runtime 与任务树

`ShadowFlow` 应负责：

1. 父任务与子任务的关系建模
2. 独立上下文空间
3. 任务树追踪 ID
4. 子任务之间的 handoff contract
5. 子任务失败、重试、恢复的正式语义

这块是 `ShadowFlow` 非常关键的独特价值。

`Shadow CLI` 和 `Shadow UI` 都会消费它，但它必须先在引擎里成立。

## 3.3 WorkflowTemplate -> Compile -> Run 主链

`ShadowFlow` 当前已经有高层 schema 雏形，接下来要继续把这条主链做成熟：

1. `Tool / Skill / Role / Agent / WorkflowTemplate`
2. `policy matrix`
3. `stages / lanes`
4. `assignment`
5. `compile-time validation`
6. `compiled workflow definition`

这是引擎的核心主线之一。

## 3.4 执行协议（Execution Contract）

`ShadowFlow` 应负责统一：

1. `CLI execution`
2. `API execution`
3. 未来的 `Claw execution`

但注意：

这里负责的是 **协议和运行时适配边界**，不是用户侧 CLI 产品壳。

也就是说：

- 引擎定义怎么调用
- 引擎返回什么结构
- 引擎如何审计、追踪、写回

但不负责：

- 命令行产品体验
- 用户交互式 CLI 壳

## 3.5 文件协作与 Writeback Contract

`ShadowFlow` 应把文件系统正式视作协作介质。

至少包括：

1. artifact 落地
2. handoff 文件
3. docs/writeback target
4. memory note
5. run output snapshot

这里的重点不是 UI，而是：

**文件协作语义本身。**

也就是：

- 哪些文件属于 step output
- 哪些属于 artifact
- 哪些属于 writeback target
- 哪些属于 memory materialization

## 3.6 Graph Projection Contract

`ShadowFlow` 不做 graph surface，但必须做 graph projection。

也就是把：

1. `task / run / step`
2. `artifact / memory_event`
3. `handoff / relation`

投影成可消费的数据结构，供：

- `Shadow UI` 做 graph view
- 工作台做 run graph
- 图谱层做任务关系可视化

一句话说：

**引擎不画图，但引擎要产出可画的图。**

---

## 4. ShadowFlow 现在不该负责什么

为了保证主线干净，下面这些当前不该再由 `ShadowFlow` 承担：

1. 用户侧 CLI 产品面
2. Chat / 对话产品壳
3. provider/model 设置体验
4. 知识库绑定与知识库入口文案
5. 权限模式的产品交互与说明界面
6. `doc-loop contract` 的页面摆放
7. 工作台布局、白板、图谱 UI
8. 团队 / 邀请码 / 资源共享

这些能力现在都更适合由 `Shadow CLI` 或 `Shadow UI` 承担。

---

## 5. ShadowFlow 与 Shadow 侧主线的配合关系

## 5.1 ShadowFlow 提供什么

提供：

1. 正式 runtime objects
2. 正式 sub-agent tree
3. 正式 compile/run pipeline
4. 正式 execution contract
5. 正式 artifact/writeback contract
6. 正式 graph projection data

## 5.2 Shadow CLI 消费什么

消费：

1. `run`
2. `resume`
3. `inspect`
4. `task tree`
5. `artifact`
6. `handoff`

## 5.3 Shadow UI 消费什么

消费：

1. `run graph`
2. `task graph`
3. `memory event graph`
4. `artifact detail`
5. `execution contract summary`

---

## 6. 近期最值得推进的 P0

当前 `ShadowFlow` 引擎最值得推进的是下面 5 件事。

### P0-1 运行时对象 contract 固化

把：

- `task / run / step / artifact / checkpoint / memory_event / handoff`

固定成正式 schema，并统一命名、持久化和查询边界。

### P0-2 Sub-agent runtime 成熟化

把：

- 父子任务
- 独立上下文
- task id / lineage
- handoff
- retry / resume

做成正式 runtime 语义，而不是只停留在 workflow 拼接层。

### P0-3 WorkflowTemplate compile 主链成熟化

补强：

- policy matrix
- stage / lane
- compile validation
- pattern library

让 workflow 真正可治理，而不是只可描述。

### P0-4 文件协作与 writeback contract

让 artifact / handoff / writeback target / memory note 的边界稳定下来。

### P0-5 graph projection data

为 `Shadow UI` 提供稳定的 graph projection，而不是让 UI 自己从 run 结果里临时拼。

---

## 7. P1 能力

在 P0 稳定后，可以进入：

1. 更强的 run/task graph 查询接口
2. 更细的 memory_event 分类
3. 更丰富的 pattern library
4. 更完整的 compile summary / explainability
5. 更稳的 Claw execution adapter 预留

---

## 8. 对旧文档和旧心智的影响

这次收口后，后续应避免继续沿用下面这些旧心智：

1. `ShadowFlow` 还要做自己的独立用户 CLI
2. `ShadowFlow` 还要做自己的对话入口
3. `ShadowFlow` 还要自己承接 graph surface
4. 引擎还要负责 provider/model 产品面

这些都应视为已经退出主线。

---

## 9. 最终结论

现在的 `ShadowFlow` 应当被清楚地描述为：

**一个服务于 `Shadow CLI` 和 `Shadow UI` 的多 Agent 编排引擎。**

它现在最重要的不是“看起来像产品”，而是：

1. contract 稳
2. runtime 稳
3. sub-agent 稳
4. compile 稳
5. writeback 稳
6. graph projection 稳

这 6 件事做稳以后，`Shadow` 那边的 CLI 和记忆系统、工作台和图谱，才能真正站在一个结实的引擎之上。
