# Agent Graph Neural Network Hypothesis v1

> 日期：2026-04-01
> 状态：Guiding Draft
> 目的：把 `ShadowFlow` 的一个核心长期判断正式记录下来：我们正在做的，也许不只是一个工作流系统，而是在逐步构建一种可学习的 `agent graph network`

---

## 1. 一句话结论

`ShadowFlow` 不应只被理解成一个“多 Agent 工作流引擎”。

更长远地看，它可能正在逼近一种新的系统形态：

**一个以 agent / block / subgraph 为基本单元、以图为结构本体、以局部激活和反馈学习为核心机制的可训练网络系统。**

一句话说：

**我们也许不是在“外接图神经网络”，而是在逐步把 `ShadowFlow` 做成一种 agent graph neural system。**

---

## 2. 为什么会有这个判断

最初我们说的是：

- 积木
- block
- workflow assembly

这是对的，但还不够。

因为随着系统继续往下长，我们已经开始出现这些特征：

1. 一个 `agent` 不再只是一个静态角色，而更像一个局部计算单元
2. 一个 `agent` 本身可以展开成一个小图
3. 多个 agent 再连接成更大的图
4. 图在运行中不是全量激活，而是局部激活
5. 子任务可以递归派生，图会继续展开
6. 运行结果会回流，影响后续结构选择

这些特征放在一起时，它已经开始像：

- hierarchical graph
- graph-of-graphs
- dynamic neural substrate

也就是说，我们现在做的东西和“神经网络式系统”之间的距离，已经比“普通模板工作流系统”更近了。

---

## 3. 结构映射：我们现在的对象像神经网络里的什么

下面这个映射不是严格数学定义，而是一个非常重要的设计类比。

### 3.1 `block` 像神经元或可组合算子

- 一个 block 有输入
- 有配置
- 有输出
- 可以组合
- 可以被激活或不激活

所以它很像：

- neuron
- operator
- functional unit

### 3.2 `agent` 像局部子网络

一个 agent 往往不是一个简单节点，而是：

- 带角色
- 带能力
- 带内部状态
- 可以继续展开为若干步骤或子图

所以更像：

- local module
- subnetwork
- expert unit

### 3.3 `workflow graph` 像大脑的结构图

我们的 workflow 不是线性脚本，而是图：

- 有节点
- 有边
- 有层次
- 有分支
- 有并行
- 有递归

所以它很像：

- structural graph
- computational graph
- dynamic connectivity graph

### 3.4 `task_tree` / lineage 像动态图展开轨迹

这不是静态权重图，而是运行中长出来的图：

- 哪个任务派生了哪个任务
- 哪个 checkpoint 分裂出哪条恢复链
- 哪个 artifact 来自哪个步骤

这更像：

- execution graph
- unfolding graph
- dynamic expansion trace

### 3.5 `activation / gating` 像局部激活机制

我们现在说的局部激活，本质上是：

- 谁被激活
- 谁不被激活
- 哪条边被打开
- 哪个子图被展开
- 哪些候选进入下一步

这和神经网络里的：

- activation
- gating
- routing
- sparse computation

已经非常接近。

### 3.6 `feedback / reward` 像训练信号

如果系统能记录：

- reviewer 是否通过
- artifact 是否有效
- token / 时间 / 成本
- retry 是否过多
- delegation 是否成功

那这些其实就已经是：

- reward signal
- supervision signal
- policy update signal

---

## 4. 为什么“局部激活”是关键

这一点非常重要。

如果没有局部激活，系统通常会退化成两种样子：

1. 全图固定执行
2. 中央大脑一次性规划全图

这两种都不太像真正的涌现。

而局部激活意味着：

- 当前目标只激活图的一部分
- 当前上下文只打开局部边
- 当前缺口只派生局部子图
- 当前失败只触发部分修正

这时系统开始具备：

- sparse computation
- local adaptation
- structural plasticity

这也是为什么我们前面把第二层从 `LLM Assembly Assistant` 修正成了：

**局部激活 / 选择层。**

因为从长期看，这层更像“神经系统里的局部门控机制”，而不是“中央规划器”。

---

## 5. 为什么这件事和图神经网络很像

如果我们继续往前走，就会发现：

- 状态本身是图
- 决策对象是图
- 反馈也来自图上的执行结果

那么很自然就会走向：

- 图状态编码
- 图上动作选择
- 图上结构更新

这正是 GNN / graph RL 最自然的应用位置。

也就是说，未来我们完全可以这样理解：

1. 图是系统本体
2. GNN 负责图状态表征
3. RL 负责在图上学习动作策略
4. 因果方法负责更稳的 credit assignment 和 counterfactual evaluation

所以不是“以后拿 GNN 来分析一下我们的系统”，而更像：

**我们的系统从现在开始就在朝着 graph-learnable architecture 发展。**

---

## 6. 为什么这件事和 Transformer 也有关系

你前面提到 Transformer，这个方向也非常值得记下来。

原因在于：

- Transformer 的很多能力本身就表现为参数化学习后的“涌现”
- 它擅长关系建模、模式抽取、序列化结构学习

所以未来有两条都可能成立的学习路线：

### 6.1 GNN 路线

更贴图本体：

- assembly graph
- workflow graph
- run graph
- `task_tree`

优点：

- 结构感强
- 与当前 ontology 非常贴合

### 6.2 Transformer 路线

更贴轨迹和演化历史：

- run trace
- graph edit history
- activation sequence
- delegation / retry / review sequence

优点：

- 更适合序列化经验学习
- 更容易吸收大模型范式的经验

所以长期并不一定是：

- GNN 替代 Transformer

更可能是：

- GNN 学结构表征
- Transformer 学轨迹与策略模式

---

## 7. 这不等于“现在立刻做一个神经网络”

这个判断非常重要。

这份文档的意思不是：

- 我们现在就去把系统张量化
- 现在就把全部逻辑交给一个模型训练
- 现在就停止工程化 contract 设计

恰恰相反。

这份文档真正想说的是：

**如果我们未来想让系统真的变成可训练的 agent graph network，那么现在的 contract、projection、activation、feedback 就必须按这个方向设计。**

所以当前阶段最重要的不是“先训练”，而是：

1. 把结构空间定义对
2. 把激活机制显式建模
3. 把执行反馈收集起来
4. 把图投影和 lineage 做清楚

也就是说：

**先把它做成可训练的系统，再决定具体怎么训练。**

---

## 8. 这对 ShadowFlow 的直接指导意义

如果这份假设成立，那么接下来很多设计都要跟着变。

### 8.1 `block` 设计不能只看 UI 方便不方便

因为未来它可能就是：

- 基本计算单元
- 基本选择单元
- 基本激活单元

### 8.2 `activation / gating` 要升级为正式 contract

因为未来它可能对应：

- 稀疏激活机制
- 路由机制
- 策略选择入口

### 8.3 `task_tree` / lineage 不能只当展示图

因为未来它可能对应：

- 训练轨迹
- credit assignment 视图
- graph state history

### 8.4 `delegated run` 不能只当工程封装

因为未来它可能是：

- 子图展开
- 递归结构生成
- 局部计算图扩张

### 8.5 `feedback schema` 必须尽早设计

因为没有反馈，后面就没有真正的学习能力。

---

## 9. 我们建议采用的长期总纲

基于这份假设，我建议把 `ShadowFlow` 的长期方向收成下面这句：

**ShadowFlow 是一个以 agent / block / subgraph 为基本单元、以图为本体、以局部激活和反馈学习为核心机制的可进化执行网络。**

它短期表现为：

- assembly system
- orchestration engine
- runtime graph

它长期可能演化为：

- agent graph learning system
- graph-native coordination substrate
- 可训练的多 agent 神经式执行网络

---

## 10. 当前阶段性结论

如果把这份文档压成最短的一句话，那就是：

**我们现在也许不是在“做一个工作流工具”，而是在做一种未来可以被图学习化、神经化、训练化的 agent graph substrate。**

这就是为什么：

- 局部激活重要
- 图本体重要
- feedback 重要
- RL / GNN / Transformer 这些方向值得尽早纳入总纲

但同样也因为如此：

**现在更要把基础 contract 做稳。**

---

## 11. 原话式判断稿

下面这段故意保留更接近我们当前讨论的表达方式，作为后续继续扩写的种子。

我们现在做的，也许已经不只是一个工作流系统了。

我们一开始说的是积木，但再往里看，它其实更接近图。  
一个 agent 本身就是一个图。  
很多个 agent 再连起来，又是更大的图。  
子任务继续派生时，图还会继续往外长。

如果从这个角度看，我们现在做的东西，已经开始有点像神经网络了。  
只是它不是传统那种直接做张量前向传播的神经网络，而是一种：

- agent 是高阶单元
- block 是局部算子
- graph 是整体结构
- activation 是局部激活
- delegation 是子图展开
- feedback 是训练信号

局部激活为什么重要？  
因为这就像神经网络里“谁被激活、谁不被激活、谁继续传信息、谁不继续传信息”。  
如果没有局部激活，系统就容易退化成：

- 全图固定执行
- 或者中央大脑一次性把全图想完

这两种都不太像真正的涌现。

所以真正关键的，不是先让一个 LLM 在中间统治一切，  
而是先把：

- 哪些局部会被激活
- 哪些边会被打开
- 哪些子图会被展开
- 哪些反馈会回流

这些东西正式做出来。

一旦这些东西成立，我们后面再接强化学习，就会非常自然。  
因为强化学习学的正是：

- 什么该激活
- 什么不该激活
- 什么该继续传
- 什么该停止
- 什么样的结构在反馈里更有效

如果再往前走，图神经网络也就不是“外面接上来的一层分析模型”了，  
而可能会慢慢变成这个系统自己的学习核心。  
到那时，我们就不是在“给工作流加一个 GNN”，而是在做一种真正可训练的 agent graph network。

所以这个方向的关键不是：

- 现在立刻做一个神经网络

而是：

- 先把它做成一个将来可以被训练的系统

也就是说，今天最重要的仍然是：

- 图本体
- activation / gating
- delegated subgraph expansion
- feedback schema
- lineage / trace / projection

这些基础一旦做好，后面的 RL、GNN、Transformer-style policy learning 才有真正落地的土壤。
