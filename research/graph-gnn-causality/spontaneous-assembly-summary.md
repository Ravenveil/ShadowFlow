# Spontaneous Assembly Summary v1

> 日期：2026-04-01  
> 状态：阶段性汇总

## 一句话结论

`ShadowFlow` 的自发装配最合理的推进方式，是做成一个三层系统：

1. `Assembly Substrate`
2. `LLM Assembly Assistant`
3. `Spontaneous Coordination Layer`

其中，强化学习和图神经网络**更适合进入第 3 层**，而不是替代前两层。

---

## 三层到底分别在做什么

### 1. 第一层：积木本体

这一层解决的是：

- 有哪些 block
- block 有哪些端口和参数
- 哪些 block 可以连接
- 哪些组合合法
- 如何编译成 runtime workflow

它对应的是：

- `WorkflowBlockSpec`
- `WorkflowAssemblySpec`
- `AssemblyConstraintSpec`
- block catalog
- assembly compiler

这层的目标不是“智能”，而是：

**给系统提供一个可验证、可编译、可复用的结构空间。**

### 2. 第二层：LLM Assembly Assistant

这一层不是 runtime，也不是 RL learner。

它的目标更像：

- 降低用户手工装配成本
- 把模糊目标翻译成 assembly draft
- 帮用户修补不合法的组合
- 在 recipe 和自由装配之间做桥接

它最适合做的事情是：

- `goal -> assembly draft`
- `assembly critique`
- `assembly repair`
- 参数补全
- role / block / delegate suggestion
- recipe import 后的局部改造

一句话说：

**第二层是“装配助理”，不是“执行内核”。**

### 3. 第三层：自发协作层

这一层才是真正接近“自发”的地方。

它关注的是：

- 哪些参与者被激活
- 哪些 block 应该被选中
- 哪些边应该被长出来
- 什么时候该派生子任务
- 哪类组合在反馈里更常成功

这一层会逐步吸收：

- feedback loop
- reinforcement learning
- graph-based policy learning
- causal evaluation / counterfactual reasoning

一句话说：

**第三层是“让装配系统根据历史、图结构和反馈逐步学会怎么更好地长”。**

---

## 第二层为什么重要

第二层最容易被误解成：

- 模板推荐
- 或者另一套 runtime

但它其实都不是。

它更准确的定位是：

**人和 assembly substrate 之间的智能接口层。**

没有它，用户要直接面对 block、ports、constraints，门槛很高。  
只有它，也不够，因为没有底层结构空间，LLM 只会乱长。

所以第二层的价值在于：

1. 让自然语言目标更容易进入结构系统
2. 让自由装配不至于只剩手工拖拽
3. 让后面的 RL / 自发层不是直接面对人类模糊意图，而是面对结构化 assembly

---

## 强化学习能不能进来

能，而且我判断：

**强化学习和“反馈闭环”是高度同构的。**

因为自发系统天然就在做这件事：

- 观察当前状态
- 选择结构动作
- 执行
- 接收结果反馈
- 调整下次策略

这就是 RL 的基本形态。

但 RL 的位置要放对：

- 不该先拿 RL 去替代 block ontology
- 不该先拿 RL 去直接驱动整个 runtime
- 更适合先作为第 3 层的局部优化器和策略学习器

更稳的初始切入点包括：

1. block selection policy
2. edge / route mutation policy
3. delegate candidate policy
4. retry / resume / rework policy
5. overlay / review strictness policy

---

## GNN 和 RL 能不能结合

能，而且非常自然。

原因是我们的状态本身就是图：

- assembly graph
- workflow graph
- run graph
- `task_tree`
- artifact lineage
- checkpoint lineage

RL 需要状态编码，GNN 正好擅长编码关系结构。

所以一个很自然的组合是：

- **GNN 编码图状态**
- **RL 学习在图上做什么动作**

---

## 因果为什么也重要

如果只用 RL，很容易出现：

- reward hacking
- 错把相关性当因果
- 训练出短期有效但长期不稳的策略

因果的价值在于：

- 帮我们区分“什么改动真正导致了改善”
- 帮我们做 counterfactual 评估
- 帮我们做更稳的 credit assignment

所以更完整的图景其实是：

- graph 提供状态结构
- GNN 提供状态表征
- RL 提供策略学习
- causality 提供更稳的解释与归因

---

## 接下来的建议

### 近期

1. 先把 assembly 本体做出来
2. 再做 LLM assembly assistant 最小版
3. 同时开始埋反馈信号，不急着立刻训 RL

### 中期

1. 建立 run-level reward / outcome schema
2. 做 graph state encoder 抽象
3. 先做离线策略分析，再做在线 RL

### 后期

1. 做 spontaneous coordination policy
2. 引入 graph RL / MARL
3. 再考虑 causal policy evaluation

---

## 当前最稳的判断

如果只说一句最重要的话：

**第二层的作用，是把“人的模糊目标”变成“可被第 3 层继续学习和优化的结构化装配对象”。**

所以它不是多余的一层，反而是前两层和后面的 RL / GNN / causality 真正接得上的关键桥梁。
