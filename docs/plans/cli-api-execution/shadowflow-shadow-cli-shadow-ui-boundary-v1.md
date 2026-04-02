# ShadowFlow / Shadow CLI / Shadow UI 职责边界与推进优先级 v1

> 日期：2026-03-31
> 状态：Draft for Main Direction
> 目的：在正式改名为 `ShadowFlow` 后，固定三层分工，明确哪些能力属于内核、哪些属于终端入口、哪些属于可视化工作台

---

## 1. 改名后的统一命名

建议后续统一使用下面这套命名：

- `Shadow`
  总品牌
- `ShadowFlow`
  多 Agent 编排内核
- `Shadow CLI`
  面向终端型用户的工作台入口
- `Shadow UI`
  面向可视化用户的工作空间入口

这套命名的核心价值是：

1. 与外部 `AgentGraph / MCP Agent Graph` 明确区分
2. 和 `ShadowClaw`、`Shadow UI`、`Shadow CLI` 形成同一品牌体系
3. 让“内核”和“入口”分离，避免后面边界继续发散

---

## 2. 一句话结论

后续主线不要再理解成：

- “一个 ShadowFlow 项目 + 自己也做一套用户侧 CLI/UI”

而应该理解成：

- `ShadowFlow` 负责编排内核
- `Shadow CLI` 负责唯一的用户侧终端入口
- `Shadow UI` 负责图形工作台

也就是说：

**ShadowFlow 是引擎，Shadow CLI 和 Shadow UI 是两种用户入口。**
**用户面向的 CLI 不再由 ShadowFlow 单独对外承载。**

---

## 3. 三层职责边界

### 3.1 ShadowFlow

`ShadowFlow` 应负责：

1. Agent / Workflow / Memory / Tool / MCP 的核心对象模型
2. WorkflowTemplate、Policy Matrix、Stage、Lane、Compile Validation
3. Sub-agent runtime、任务树、任务追踪 ID
4. Artifact、Checkpoint、Writeback、Handoff
5. CLI / API / 后续 Claw 的统一执行协议
6. Run / Step / Trace / Graph contract

`ShadowFlow` 不应负责：

1. 重交互前端
2. 图形工作台壳层
3. 团队页面和邀请码页面
4. 用户日常的终端体验壳
5. 一个独立对外包装的产品级 CLI

说明：

- `ShadowFlow` 仓库里可以保留内部开发、测试、调试所需的命令入口
- 但这些入口不再作为单独产品能力对外主推
- 用户真正使用的 CLI 统一收敛到 `Shadow CLI`

### 3.2 Shadow CLI

`Shadow CLI` 应负责：

1. scaffold / init / import / export
2. run / watch / resume / inspect
3. 子任务发起与终端观察
4. 面向工程师和操作者的命令工作流
5. 文件协作、artifact 查看、handoff 操作入口
6. 对 `ShadowFlow` 引擎能力的统一封装与暴露

`Shadow CLI` 不应负责：

1. 承担全部可视化 workflow 编辑
2. 承担团队协作和分享页
3. 变成另一个编排内核

### 3.3 Shadow UI

`Shadow UI` 应负责：

1. 可视化 workflow / graph 工作面
2. 块式工作台
3. 知识库、图谱、白板、Agent Workspace
4. 团队协作、邀请码、资源共享
5. 非终端型用户的创建器与运行观察面

`Shadow UI` 不应负责：

1. 重写一套独立编排 runtime
2. 自己定义与 `ShadowFlow` 脱节的 workflow contract

---

## 4. 借鉴点的正式归属

这次从外部项目里值得借的 6 个点，建议这样落位。

### 4.1 Agent / Workflow / Memory / MCP 分层清楚

归属：

- **主归属：`ShadowFlow`**

原因：

- 这是系统骨架，不是 UI 功能
- 这是后面所有 CLI、UI、团队功能共用的底层模型

结论：

**必须先在 `ShadowFlow` 收口。**

### 4.2 可视化工作流是一等能力

归属：

- **主归属：`Shadow UI`**

原因：

- 这是图形工作面
- 不适合塞进 `Shadow CLI`
- 也不应该污染 `ShadowFlow` 本体

结论：

**先由 `ShadowFlow` 提供 graph contract，再由 `Shadow UI` 承接可视化。**

### 4.3 Sub-agent + 独立上下文 + 任务追踪

归属：

- **核心归属：`ShadowFlow`**
- **操作入口：`Shadow CLI`**
- **可视化观察：`Shadow UI`**

原因：

- 独立上下文、任务树、追踪 ID 是 runtime 能力
- CLI 适合发起和检查
- UI 适合可视化追踪

结论：

**这是典型的跨层能力，但内核必须先做在 `ShadowFlow`。**

### 4.4 内置 Agent / Workflow / Prompt / MCP 创建器

归属：

- **第一阶段：`Shadow CLI`**
- **第二阶段：`Shadow UI`**

原因：

- 第一版最适合做成 scaffold / wizard 命令
- 等高层 schema 稳定后，再做可视化创建器

结论：

**先命令式创建，再图形式创建。**

### 4.5 文件系统作为协作介质

归属：

- **核心归属：`ShadowFlow`**
- **主要入口：`Shadow CLI`**

原因：

- Artifact、writeback、handoff、checkpoint 都属于 runtime 基础设施
- 终端里做文件协作和检查最自然

结论：

**应先把文件协作当成 `ShadowFlow` 的正式能力。**

### 4.6 团队 / 邀请码 / 资源共享

归属：

- **主归属：`Shadow UI`**

原因：

- 这是产品与协作层能力
- 不应该成为 `ShadowFlow` 当前主线阻塞项

结论：

**先不进入当前 P0，放到 UI 协作层的后续阶段。**

---

## 5. 现在最适合推进的内容

不是 6 点一起上，而是分优先级推进。

### P0：现在就该推进

1. `ShadowFlow` 的 Agent / Workflow / Memory / Tool / MCP 分层彻底定稳
2. `ShadowFlow` 的 Sub-agent runtime 与任务追踪 contract
3. `ShadowFlow` 的文件协作、artifact、handoff、writeback
4. `Shadow CLI` 的 scaffold / init / run / watch / resume / inspect
5. `ShadowFlow` 停止继续扩张“独立对外 CLI 产品面”

### P1：接着推进

1. `Shadow CLI` 的引导式创建器
2. Agent / Prompt / MCP / Template 导入导出
3. `ShadowFlow` 的 run trace / task tree / graph projection contract
4. `Shadow UI` 的最小 Agent Workspace 与 graph 观察面

### P2：后续推进

1. `Shadow UI` 的可视化 workflow editor
2. `Shadow UI` 的团队 / 邀请码 / 资源共享
3. `Shadow UI` 的可视化创建器

---

## 6. 近期最稳的产品路径

按当前阶段，最稳的路线不是“大而全平台”，而是：

1. 先把 `ShadowFlow` 做成真正可用的多 Agent 编排内核
2. 让 `Shadow CLI` 成为唯一的用户侧 CLI 入口
3. 让 `Shadow UI` 先承接工作空间和运行观察
4. 最后再长出图形 workflow 编辑与团队能力

一句话说：

**先有内核，再有终端入口，再有图形工作台，最后再做协作平台。**

---

## 7. 对当前主线的直接影响

这份边界一旦成立，后续开发应避免这几种偏移：

1. 不要让 `ShadowFlow` 去长一整套前端工作台
2. 不要让 `Shadow CLI` 变成第二个 runtime
3. 不要让 `Shadow UI` 自己定义独立 workflow 协议
4. 不要把团队协作能力提前到当前核心主线前面
5. 不要再把 `ShadowFlow` 包装成一套独立的用户侧 CLI 产品

---

## 8. 最终结论

改名后，我们的主线应该被重新描述为：

- `ShadowFlow`
  负责多 Agent 编排、Sub-agent runtime、文件协作、执行协议和任务追踪
- `Shadow CLI`
  负责终端创建、运行、观察、继续、导入导出，以及对引擎能力的统一命令封装
- `Shadow UI`
  负责块式工作台、图谱、白板、可视化 workflow 和团队能力

所以这轮真正该推进的，不是“再造一个大平台”，而是：

**把 `ShadowFlow` 做成真正稳定的内核，把 `Shadow CLI` 做成唯一用户侧 CLI 入口，把 `Shadow UI` 留作可视化放大器。**
