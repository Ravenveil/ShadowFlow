# AgentGraph CLI 与 Shadow CLI 边界 v1

> 日期：2026-03-30
> 状态：Draft v1
> 目的：固定 AgentGraph CLI、Shadow CLI、对话能力、任务面板和图形可视化的边界，避免后续功能继续混线

---

## 1. 核心结论

当前最重要的结论不是“AgentGraph CLI 能不能继续做”，而是：

**AgentGraph CLI 不应该对标 Claude Code。**

更合适的分工是：

- `AgentGraph CLI`：编排型 CLI、开发者 CLI、运行时调试 CLI
- `Shadow CLI`：用户型 CLI、产品级工作台 CLI、对话与任务入口 CLI

也就是说：

- AgentGraph 应该继续做自己的 CLI
- 但不应该把目标设成“再做一个 Claude Code”

---

## 2. 为什么 AgentGraph CLI 不该对标 Claude Code

原因有四个。

### 2.1 AgentGraph 的核心价值不在“再做一个 coding shell”

AgentGraph 当前真正值钱的部分是：

- workflow orchestration
- CLI / API 调度
- run / step / trace / checkpoint
- graph export
- 给宿主系统提供稳定 runtime contract

如果 AgentGraph 再继续吸收下面这些东西：

- 文件读写壳
- patch / edit 工作流
- repo 操作工作台
- shell 辅助体验
- 用户对话主界面
- 任务面板和 dashboard

它就会重新长成一个边界混乱的大平台。

### 2.2 Shadow CLI 更适合承接用户体验层

Shadow CLI 本来就更像产品宿主和用户入口，天然更适合承接：

- 对话
- 任务发起
- 文件读写
- 工程操作
- 本地工具协作
- 记忆管理
- 任务面板

所以对用户来说，合理路径应该是：

`用户 -> Shadow CLI -> AgentGraph runtime`

而不是：

`用户 -> AgentGraph CLI -> AgentGraph 同时再长成工作台`

### 2.3 AgentGraph 更适合做 headless runtime

AgentGraph 当前最自然的定位是：

- headless runtime
- orchestration engine
- execution kernel
- graph / trace / checkpoint provider

它可以有 CLI 和 HTTP API，但它们更像：

- 调试入口
- 开发者入口
- 集成入口

而不是最终产品壳。

### 2.4 产品边界越早定，后面越不容易返工

如果现在不定边界，最容易出现的情况就是：

- AgentGraph 补一半用户 CLI
- Shadow CLI 再补一半用户 CLI
- 两边都能发任务、都能对话、都能看状态
- 结果命令重叠、契约漂移、维护成本翻倍

所以这份文档本质上是在帮后续开发“提前止损”。

---

## 3. AgentGraph CLI 的正确定位

AgentGraph CLI 应该保留，而且要继续完善。

但它的定位应该固定成：

### 3.1 开发者 CLI

给内部开发者和集成者使用，用于：

- 校验 workflow
- 执行 workflow
- 导出 workflow graph
- 查看 run 结果
- 调试 executor
- 调试 checkpoint / resume

### 3.2 编排调试 CLI

它应该帮助开发者确认：

- workflow 是否合法
- node 如何路由
- artifact / checkpoint 是否生成
- CLI / API executor 是否跑通
- run graph / trace 是否符合预期

### 3.3 runtime 运维 CLI

后续继续完善的方向应该是：

- `runs list`
- `runs get`
- `runs graph`
- `checkpoints get`
- `resume`
- `chat sessions list`
- `chat sessions get`

这类命令都属于“运行时可观测性与调试能力”，是 AgentGraph CLI 应该强化的方向。

---

## 4. Shadow CLI 的正确定位

Shadow CLI 应该承接用户与产品层能力。

更具体地说，Shadow CLI 适合负责：

### 4.1 用户对话入口

- 多轮对话
- 会话列表
- 对话历史
- 用户态上下文
- 更自然的人机交互

### 4.2 本地工程工作台能力

- 文件读写
- 项目浏览
- patch / edit
- 本地命令执行
- repo 级工作流

### 4.3 任务入口与任务面板

- 发起任务
- 查看任务状态
- 查看 run 详情
- 查看 artifacts / checkpoints
- 查看失败原因

### 4.4 记忆与知识层体验

- 文档记忆
- 搜索与检索
- 记忆写回
- 用户态知识沉淀

一句话说：

**Shadow CLI 是用户工作台，AgentGraph CLI 是编排与调试入口。**

---

## 5. 现在 AgentGraph 已经具备什么

截至这轮实现，AgentGraph 现在已经不是“只有 contract 的概念稿”。

它已经具备：

### 5.1 编排与执行

- `workflow validate`
- `workflow run`
- `checkpoint / resume`
- CLI executor
- API executor

### 5.2 图与运行数据

- `workflow graph` 导出
- `run list`
- `run graph`
- `trace`
- `artifacts`
- `checkpoints`

### 5.3 基础对话态

- `chat session` contract
- `chat session` create / get / list
- `chat turn` 执行

但这里要强调：

**它现在具备的是“对话 runtime 能力”，不是“完整对话产品体验”。**

---

## 6. 现在 AgentGraph 还不是什么

为了避免误判，这里需要明确写清楚：

AgentGraph 当前还不是：

- 完整聊天产品
- 完整本地 agent 工作台
- Claude Code 替代品
- Codex CLI 替代品
- 用户任务面板产品
- 图形化 dashboard 产品

它可以被这些产品调用，但它不该自己演化成它们。

---

## 7. 图形可视化还要不要做

结论是：

**要做可视化数据接口，但不急着在 AgentGraph 内部做重前端。**

也就是：

### 7.1 AgentGraph 应该做的

- workflow graph export
- run graph export
- trace export
- status / artifacts / checkpoints 的结构化接口

### 7.2 AgentGraph 不该优先做的

- 单独做一套完整前端
- 单独做复杂图形面板
- 单独做 dashboard 产品壳

### 7.3 更合理的承接方

图形可视化更适合由 Shadow 承接。

原因是：

- Shadow 离用户更近
- Shadow 更适合作为产品壳
- Shadow 更需要把 graph / run / task / memory 串到一个界面里

所以这轮的正确策略是：

**AgentGraph 提供 graph data contract，Shadow 提供可视化界面。**

---

## 8. “基本功能”应该补到哪一边

这里要严格区分“编排层基本功能”和“工作台基本功能”。

### 8.1 AgentGraph 应继续补的基本功能

这些属于编排层和运行时层：

- `runs list`
- `runs get`
- `runs graph`
- `checkpoints get`
- `resume`
- `chat sessions list`
- `chat sessions get`
- executor profile
- workflow graph export
- run inspect

### 8.2 AgentGraph 不该优先补的基本功能

这些更像用户工作台能力：

- 通用文件读写命令
- patch / edit 命令
- repo 操作壳
- 本地 coding assistant 壳
- 用户任务工作台壳

这些应该优先放到 Shadow CLI。

---

## 9. 当前建议的路线

当前最合理的推进路线是：

### 9.1 AgentGraph

继续收口成：

- headless orchestration runtime
- developer / operator CLI
- HTTP runtime service
- graph / trace / checkpoint provider

### 9.2 Shadow

继续收口成：

- 用户交互壳
- 对话壳
- 任务面板壳
- 记忆壳
- 图形化展示壳

### 9.3 两边连接方式

后续主路径应该是：

`Shadow CLI / Shadow UI -> AgentGraph HTTP 或嵌入式 runtime -> CLI/API executors`

---

## 10. 这份文档对后续命令设计的直接影响

如果后续继续补 AgentGraph CLI，默认应优先补：

1. `runs list`
2. `runs get`
3. `runs graph`
4. `checkpoints get`
5. `chat sessions list`
6. `chat sessions get`
7. `resume`

而不是优先补：

1. 文件编辑命令
2. patch 命令
3. 本地项目工作台命令
4. 大量用户态交互命令

这份文档的价值就在于：

**后面每补一个命令，都能先问一句：这是 AgentGraph 的命令，还是 Shadow 的命令？**

---

## 11. 最终一句话

这轮最重要的边界判断是：

**AgentGraph CLI 要继续做，但要做成“开发者/运维/编排 CLI”；Shadow CLI 才应该做成“用户/对话/任务工作台 CLI”。**

