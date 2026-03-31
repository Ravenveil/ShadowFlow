# AgentGraph / Shadow / Wave 定位判断 v1

> 日期：2026-03-30
> 目的：收口我们对 `Wave`、`Shadow` 和 `AgentGraph` 三者关系的判断，避免后续讨论又回到“是不是要做一个 Wave”这个岔路

---

## 1. 一句话结论

**我们不做一个 Wave。**

我们真正要做的是：

- `AgentGraph` 做编排内核
- `Shadow` 做工作空间与图形工作面
- 我们自己的 `CLI / agent workflow` 能舒服地跑在 `Wave` 这类终端工作台里

也就是说：

**Wave 是一个很好的运行环境和体验参考，不是我们要复制的产品本体。**

---

## 2. 用户真正表达的需求是什么

这轮讨论里，真正的需求不是：

- 再造一个终端
- 再造一个浏览器式工作台
- 再做一套完整多块布局系统

真正需求是：

1. 我们会调很多工具让 agent 干活
2. 需要一个地方看这些 agent 在干什么
3. 如果这些 CLI / agent 工作流能放到 `Wave` 里跑，会比较舒服
4. 可视化可以后做，但执行链要先通

所以本质问题不是“做不做 Wave”，而是：

**我们的工作流和 CLI，应该如何嵌进一个更舒服的工作台环境里。**

---

## 3. Wave 值得借的是什么

`wave.md` 真正值得借的，不是“它有很多功能”，而是它的工作台心智。

### 3.1 值得借的地方

1. `terminal as workbench`
   终端不只是黑框，而是工作面

2. `tab + block`
   多块并排，减少在多个应用间反复切换

3. 命令执行和图形观察放在同一空间
   这点对 agent 工作流尤其重要

4. 能一边执行，一边看结果，一边查上下文
   这和我们后面要做的 `agent workspace` 很契合

### 3.2 不该照搬的地方

1. 不要现在就做完整 Wave 式终端产品
2. 不要现在就做复杂块布局系统
3. 不要现在就做“浏览器、预览器、系统监控、远程会话”一整套

---

## 4. 三者的正确分工

### 4.1 AgentGraph

`AgentGraph` 应负责：

- workflow / template / compile
- CLI / API execution contract
- run / step / graph / checkpoint
- 编排层 runtime

它不该负责：

- 用户工作台
- 图形壳层
- 白板
- 知识图谱 UI

### 4.2 Shadow

`Shadow` 应负责：

- 工作空间
- 知识图谱画板
- 白板
- agent 运行观察面
- 运行解释、知识上下文、写回工作面

也就是说：

**Graph Surface 应该放在 Shadow，不应该放在 AgentGraph 本体里。**

### 4.3 Wave

`Wave` 对我们来说更像：

- 一个很舒服的 CLI 运行环境
- 一个适合承载终端型 agent 工作流的宿主
- 一个 UI/UX 灵感来源

不是：

- 我们要复制的产品目标

---

## 5. 关于 CLI 的判断

这一轮里最重要的判断之一是：

**先把 CLI 接起来，比先做重可视化更值。**

原因很简单：

1. CLI 是现在最成熟的执行入口
2. `AgentGraph` 已经有成熟 CLI
3. `Shadow` 最容易先通过 CLI 把执行链打通
4. 一旦 CLI 跑通，后面的可视化才能有真实数据和真实运行态

所以推荐顺序是：

### 第一阶段

`Shadow -> AgentGraph CLI`

先消费：

- `agentgraph run`
- `agentgraph validate`
- `agentgraph runs get`
- `agentgraph runs graph`
- `agentgraph resume`

### 第二阶段

`Shadow -> AgentGraph serve`

再接：

- 常驻 server
- 更实时的 run graph
- 更强的运行干预

---

## 6. 关于工作空间和白板

### 6.1 左侧要不要加工作空间

要，而且这是对的。

左侧的“工作空间”不应只是一个普通 tab，而应是统一入口，承接：

- `Agent Workspace`
- `Whiteboard`
- 后续 `H graph` 工作面

### 6.2 白板要不要做

要，但先做最小。

白板第一阶段应定位为：

- 思考画布
- 结构草图
- 任务块与箭头
- 解释和整理空间

不应一上来承担：

- workflow 可视化编排器
- schema 编辑器
- DAG 设计器

### 6.3 “看 agent 干活”的位置在哪

第一阶段建议放在：

- `Agent Workspace`

里面先展示：

- run list
- active run
- step flow
- graph export / trace export 入口

也就是说：

**先让用户看得到运行，再逐步让用户画得动流程。**

---

## 7. 第一阶段最合适的产品形态

如果只做最小版，我建议是：

### 7.1 Shadow 左侧

增加：

- `工作空间`

### 7.2 工作空间里

先只放两块：

1. `Agent Workspace`
   - 看运行中的 agent
   - 看步骤
   - 看 graph / trace / result

2. `Whiteboard`
   - 让用户手工画任务块和思考结构

### 7.3 执行层

先只接：

- `AgentGraph CLI`

---

## 8. 这意味着什么

这套判断会带来几个明确后果：

1. 我们现在不需要讨论“怎么做一个 Wave”
2. 我们需要讨论“怎么让自己的 CLI / workflow 在 Wave 里跑得舒服”
3. 我们需要优先把 `Shadow <-> AgentGraph CLI` 接通
4. 我们需要在 `Shadow` 里给 agent 一个真正的工作空间
5. 我们可以参考 Wave 的工作台心智，但不复制 Wave 的产品范围

---

## 9. 两类用户入口

这个判断还带来一个很重要的产品分层：

### 9.1 Shadow UI

`Shadow UI` 更适合服务这类用户：

- 不喜欢终端的人
- 更习惯图形界面的人
- 更喜欢工作空间、图谱、白板和可视化工作面的人

所以 `Shadow UI` 应该承接：

- 可视化工作空间
- 知识图谱画板
- 白板
- agent 运行观察面
- 非终端型用户的任务入口

### 9.2 Shadow CLI

`Shadow CLI` 更适合服务这类用户：

- 工程师
- 喜欢命令行的人
- 习惯直接调工具、脚本和 agent 的人

所以 `Shadow CLI` 应该承接：

- 终端型工作流
- 快速调度命令
- 面向代码与自动化用户的入口

### 9.3 底层共享同一个 runtime

这两条入口不应该变成两套系统。

它们应共享同一套底层：

- `AgentGraph` runtime
- workflow / run / step / graph contract
- memory / writeback / checkpoint contract

也就是说：

**可视化是给非终端型用户的工作台。**
**Shadow CLI 是给终端型用户的工作台。**
**二者共享同一个 AgentGraph 编排内核。**

---

## 10. 最终结论

**我们不做 Wave。**

**我们要做的是：**

- 自己的编排层：`AgentGraph`
- 自己的工作空间与图形工作面：`Shadow`
- 自己的 CLI / agent 工作流

然后让这些东西：

**能够舒服地跑在 Wave 这类终端工作台里。**

这是比“复制一个 Wave”更对路、也更克制的方向。
