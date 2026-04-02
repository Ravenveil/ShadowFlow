# ShadowFlow x ToWow 自发协作判断 v1

> 日期：2026-04-01
> 状态：Draft
> 目的：判断 `ToWow / 通爻` 在“自发协作 / 自发装配”上的设计，对 `ShadowFlow` 有哪些可借鉴之处，以及哪些地方不能直接照搬

---

## 1. 一句话结论

`ToWow` 最值得我们借鉴的，不是某一个固定 workflow，而是它在尝试回答：

**协作如何从网络中“自发涌现”，而不是由预设流程硬塞出来。**

但同时，`ToWow` 更像：

- 发现层
- 协商层
- 价值网络层

而 `ShadowFlow` 当前更像：

- assembly 层
- compile 层
- runtime 层

所以正确的关系不是：

- 用 `ToWow` 替代 `ShadowFlow`

而是：

- 把 `ToWow` 式的“自发发现 / 自发协商”吸收到 `ShadowFlow` 的装配前层和装配辅助层

一句话说：

**ToWow 更像“协作如何浮现”，ShadowFlow 更像“浮现后的结构如何落地执行”。**

---

## 2. 本次判断依据

本次判断主要基于三类材料：

1. `ToWow` 官网公开信息
2. `ToWow` 公开仓库遗留信息与 README
3. 你本地保留的备份仓库：`D:\VScode\towow-repo`

从本地备份仓库能看到几个关键表述：

- `发现和协商这一层，是空白的。通爻填这个空白。`
- 体系分成：`发现层 / 协商层 / 价值交互层`
- `需求 formulation 是可插拔的`
- `不要预设哪些是回声信号，让重要性从共振强度中涌现`
- `Center = 拿着工具集的 LLM Agent`
- 协商单元可触发：`ask_agent`、`start_discovery`、`create_sub_demand`

这说明它确实不是在做“固定模板工作流”，而是在努力做：

- 信号发现
- 参与者筛选
- 协商式结构生成
- 子需求递归派生

---

## 3. ToWow 真正有价值的地方，不是“流程”，而是“自发”

### 3.1 它把协作前置成一个发现问题

传统 workflow 系统通常默认：

- 参与者已经知道
- 流程已经知道
- 只差执行

但 `ToWow` 反过来认为：

- 首先不知道谁最相关
- 其次不知道怎样分工最自然
- 最后也不知道最终方案是什么

所以它先做：

- intent encoding
- resonance / matching
- negotiation
- crystallization

这就是“自发”的来源。

### 3.2 它允许“结构不是先验给定的”

`ToWow` 最像你的地方，在于它不想只做 preset。

它尝试把：

- 参与者是谁
- 子任务怎么分
- 方案如何收敛

都交给一个更开放的动态过程，而不是先画死 DAG。

### 3.3 它把“子需求递归”看成一等能力

这一点和我们最近做的 delegated run 很像。

`ToWow` 文档里能看到：

- `create_sub_demand(gap_description)`：生成子需求，触发递归

而 `ShadowFlow` 现在已经有：

- child run
- delegated node
- `task_tree`

所以两者最容易接上的点，不是 UI，不是协议壳，而是：

**递归派生新任务单元。**

---

## 4. ToWow 和 ShadowFlow 的本质差异

### 4.1 ToWow 偏网络协作

它更关注：

- 谁和谁互补
- 如何被需求激活
- 多方如何协商
- 如何形成方案与信用沉淀

### 4.2 ShadowFlow 偏结构装配与执行

我们更关注：

- block 怎么定义
- graph 怎么编译
- run 怎么执行
- lineage 怎么追踪
- checkpoint 怎么恢复

### 4.3 所以两者不是替代关系

更准确的分层应该是：

- `ToWow-like layer`：自发发现 / 参与者匹配 / 协商生成
- `ShadowFlow layer`：assembly / compile / runtime / projection

也就是说，ToWow 更像我们未来的一层：

- `assembly assistant`
- `participant selector`
- `negotiation layer`

而不是现阶段直接替代我们的 runtime。

---

## 5. “自发”到底难在哪里

最难的不是“再做几个 block”，而是：

**怎么让 block 的组合不是完全预设，而是随着目标、参与者、信号和反馈自然浮现。**

这件事至少包含 4 个难点。

### 5.1 自发不是随机

如果没有约束，所谓“自发”很容易退化成：

- 随机拼图
- LLM 幻觉装配
- 每次都长得不一样但不可复用

所以“自发”不能没有边界。

### 5.2 自发需要候选空间

想让系统自发长出结构，前提是已经有：

- block catalog
- ports
- constraints
- 可组合规则

没有积木，LLM 就只能生成自然语言妄想。

### 5.3 自发需要选择机制

并不是所有 block 都应该参与。

必须有一层去决定：

- 哪些参与者进入候选池
- 哪些 block 被激活
- 哪些关系值得保留

`ToWow` 用的是“共振 / 匹配 / 协商”这类思路。

### 5.4 自发需要反馈闭环

没有反馈，自发就只是一轮生成。

真正的自发系统要能吸收：

- run 结果
- artifact 质量
- reviewer 拒绝原因
- checkpoint / retry 轨迹
- 哪类 block 组合更常成功

也就是说，**自发不是一次生成，而是持续校正。**

---

## 6. 对 ShadowFlow 最可借鉴的点

### 6.1 把 Assembly 分成“装配前”和“装配中”

现在我们更像只在做“装配中”：

- 用户给定结构
- 系统负责校验 / 编译 / 执行

可以新增“装配前层”：

- goal formulation
- participant matching
- role suggestion
- delegate candidate selection

### 6.2 引入“共振”思想，但不要照抄协议叙事

我们可以吸收的是：

- block activation score
- role relevance score
- candidate agent fit score
- cross-domain surprise score

也就是说，把“共振”翻译成更工程化的概念：

- relevance
- fit
- novelty
- confidence

### 6.3 把“子需求递归”纳入 Assembly 主线

我们已经有 child run 了。

下一步可以把它往上接成：

- `delegate`
- `spawn_child`
- `subworkflow`
- `create_subgoal`

这会让“自发派生”真正进入积木主线。

### 6.4 把 LLM 放到“自发装配助理”位置

LLM 最适合做：

- `goal -> assembly draft`
- `assembly mutation`
- `role/block filling`
- `repair invalid composition`

这样它就不是替代 block system，而是让 block system 活起来。

---

## 7. ToWow 哪些地方不能直接照搬

### 7.1 不能先做“网络叙事”，后补“装配本体”

如果我们先学它做：

- 网络
- 场
- 共振
- 协商

但底层没有：

- typed block
- assembly spec
- compile contract
- runtime lineage

那最后容易只剩产品叙事，没有稳定引擎。

### 7.2 不能把“自发”直接等同于“无结构”

自发不是没有结构，而是：

- 在结构空间中动态选择
- 在约束内涌现
- 在反馈中修正

### 7.3 不能直接把 ToWow 的参与者网络当成我们的 runtime

`ToWow` 的中心难题更像：

- 谁进入协商
- 如何形成方案

而我们当前的中心难题更像：

- 方案如何编译
- 任务如何执行
- run 怎么追踪与恢复

这两层需要区分。

---

## 8. 对 ShadowFlow 的直接落地方向

基于这次判断，我建议把“自发装配”拆成三层，而不是一步到位。

### 8.1 第一层：可组合的积木本体

先做：

- `WorkflowBlockSpec`
- `WorkflowAssemblySpec`
- `AssemblyConstraintSpec`
- block catalog

没有这层，就谈不上后面的自发。

### 8.2 第二层：LLM Assembly Assistant

再做：

- `goal -> assembly draft`
- `assembly critique`
- `assembly repair`
- `recipe import -> assembly mutation`

### 8.3 第三层：自发协作层

最后才做更像 `ToWow` 的东西：

- participant matching
- dynamic role suggestion
- delegate candidate selection
- spontaneous subgoal creation
- cross-run learning

也就是说：

**自发协作不是第一层能力，而是 assembly 做稳后的上层涌现能力。**

---

## 9. 最终判断

`ToWow` 对我们最有价值的启发，不是“照着它做一套协议”，而是提醒我们：

1. 协作不是总能预设
2. 参与者与结构可以动态浮现
3. 子需求递归是关键能力
4. 自发必须建立在可约束的装配空间里

所以对 `ShadowFlow` 来说，最正确的动作不是直接抄 `ToWow`，而是：

**先把 assembly 本体做出来，再把 ToWow 式的自发发现 / 自发协商，作为上层装配助理与网络协作层接进来。**
