# Spontaneous Assembly Summary v1

> 日期：2026-04-01
> 状态：阶段性汇总

## 一句话结论

`ShadowFlow` 的自发装配最合理的推进方式，是做成一个三层系统：

1. `Assembly Substrate`
2. `Local Activation / Selection Layer`
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

### 2. 第二层：局部激活 / 选择层

这一层不是中央大脑，也不是最终的 RL learner。

它的目标更像：

- 决定当前目标会激活哪些局部构件
- 决定哪些 role / block / delegate 候选值得进入候选池
- 给第三层提供可学习、可筛选的局部动作空间
- 把“全局先验规划”改成“局部响应 + 后续选择”

它最适合做的事情是：

- `role activation`
- `block activation`
- `delegate candidate activation`
- `gap detection`
- `subgoal trigger`
- `local route / local overlay suggestion`

一句话说：

**第二层先负责“谁被激活、谁进入候选空间”，不是先交给 LLM 一次性决定全图。**

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

- 一个中央 LLM 助理
- 或者另一套 runtime

但它其实都不是。

它更准确的定位是：

**assembly substrate 和自发学习层之间的局部激活接口层。**

没有它，就会出现两个问题：

1. 候选空间太大，第三层学习太难
2. 如果直接让中央 LLM 决定结构，又会压掉“涌现”的可能

所以第二层的价值在于：

1. 先做局部激活，而不是全局拍板
2. 为后面的 RL / 自发层提供更可控的动作空间
3. 让执行层拿到的是被激活后的候选结构，而不是一张凭空生成的大图

## 第二层和执行层怎么接

这一层最值得直接落到执行层的，不是“大模型建议”，而是：

1. 当前 run / task / context 下激活哪些 block
2. 当前节点下激活哪些 delegate 候选
3. 当前缺口是否触发 `spawn_child` / `create_subgoal`
4. 当前失败状态是否激活 `retry / rework / review`

也就是说，它不是悬在高层的产品逻辑，而是可以逐步变成：

- runtime gating
- route gating
- delegate gating
- subgoal gating

这也正是后面强化学习最容易接进来的地方。

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

## 当前最稳的判断

如果只说一句最重要的话：

**第二层的作用，不是替系统做最终规划，而是先把“什么值得被激活”这件事做出来，让第 3 层有真正可学习的局部结构空间。**
