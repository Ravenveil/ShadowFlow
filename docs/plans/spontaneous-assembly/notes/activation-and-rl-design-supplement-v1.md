# Activation And RL Design Supplement v1

> 日期：2026-04-01
> 状态：Draft
> 目的：补充 `ShadowFlow` 在“局部激活 / 可学习 gating / 强化学习闭环”上的工程判断

---

## 一句话结论

`ShadowFlow` 下一步最值得补的，不是继续增加更多静态 workflow 模式，而是把激活机制升级成一层**可学习的 gating 系统**：

1. 先产生候选
2. 再显式打分和裁剪
3. 然后执行选择
4. 最后把反馈回流成下一轮激活信号

一句话说：

**先把 activation 做成训练友好的选择层，再决定后面具体用什么 RL / Graph RL 算法。**

---

## 这份补充文档回答什么

这份文档只回答一个问题：

**在“激活 + 强化学习”这条线上，我们接下来该怎么补 `ShadowFlow`。**

它不重新讨论整个 spontaneous assembly，也不重新讨论所有 workflow pattern。

---

## 当前判断

### 1. 现在的方向是对的

我们已经做了第一版显式建模：

- `local_activation`
- `template_activation`
- `ActivationRecord`
- `ExecutionFeedbackRecord`
- `activation` / `feedback_signal` memory events

这一步很关键，因为它把“为什么这个节点被执行”和“执行后发生了什么”从匿名 trace 里拉成了 typed contract。

### 2. 但现在还停在“记录层”

当前更像是：

- 运行后记录它为什么被激活
- 运行后记录它产生了什么反馈

还没有真正进入：

- 候选生成
- 候选筛选
- 显式 suppression / defer
- 策略更新后影响下一次激活

所以接下来真正该做的是：

**把 activation 从记录层推进到执行层。**

---

## Towow 给我们的启发

这里的判断来自本地备份仓库，不是推测：

- [Towow README](D:\VScode\towow-repo\README.md)
- [Towow CLAUDE.md](D:\VScode\towow-repo\CLAUDE.md)
- [Towow DEV_LOG_V2](D:\VScode\towow-repo\docs\engineering\DEV_LOG_V2.md)
- [Towow projection vs essence guide](D:\VScode\towow-repo\docs\guides\guide-001-projection-vs-essence.md)

### Towow 最值得借鉴的不是 LLM，而是这三点

#### A. 发现层明确倾向 zero-LLM matching

Towow 在 `CLAUDE.md` 和 `DEV_LOG_V2` 里都很明确：

- 发现层偏 `intent matching`
- 匹配层追求 `zero-LLM`
- formulation 不该污染匹配主链

这对我们很重要，因为它意味着：

**激活的第一步不该默认交给中央 LLM。**

更稳的做法是先用：

- goal/context/artifact/memory/feedback
- 规则和相似性
- 预算和阈值

把候选激活出来。

#### B. feedback 不该只是审计数据

Towow 的 V2 判断很重要：

- `demand`
- `profile`
- `feedback`

都应该进入同一个协议语义层，而不是把 feedback 当成外部日志。

映射到 `ShadowFlow`，意思就是：

**feedback 应该变成 activation 的正式输入源。**

也就是说，后续 activation 不能只看：

- goal
- context
- memory

还应该看：

- 上一轮 review 结果
- child run 成功率
- 某类 delegate 的历史 adoption
- 某类 artifact 是否真的被 downstream 使用

#### C. projection 不能各自长自己的语义

Towow 那篇 “projection vs essence” 文档非常值得我们记住：

不同页面可以有不同投影，但不能各自长一套本体。

这对 `ShadowFlow` 的启发是：

- `run_graph`
- `task_tree`
- `memory_relation_graph`
- `checkpoint_lineage_graph`

都应该消费同一批 activation / feedback 本体，而不是各自复制一套“激活解释”。

---

## GitHub 上最值得借鉴的公开信号

### 1. Agent Lightning

GitHub:

- <https://github.com/microsoft/agent-lightning>

从仓库 README 可以直接确认几件事：

- 它主张“几乎零代码改动”把 agent 接进训练闭环
- 支持多 agent system 的选择性优化
- 训练器读取 runtime 产生的 structured spans / traces / rewards
- 算法侧再把 prompt / policy weight 等更新资源回写给推理侧

这对我们的启发非常直接：

**不要让训练逻辑先侵入 runtime 主循环。**

更好的做法是：

1. 先把 runtime 事件做成稳定的结构化 records
2. 再提供 trainer-facing export
3. 最后让训练器消费这些 records

这和我们现在已经有的：

- `ActivationRecord`
- `ExecutionFeedbackRecord`
- `memory_events`
- `projection graphs`

是高度一致的。

### 2. LangGraph Supervisor

GitHub:

- <https://github.com/langchain-ai/langgraph-supervisor-py>

它最值得借鉴的是 handoff 这一层的工程表达：

- handoff 可以显式带 task description
- handoff 不只是跳转，还会对 parent graph 的 state 做 update
- 可以控制 handoff message 是否进入状态

这对 activation 的意义是：

**delegate activation 不能只有“选中了谁”，还要记录“把什么任务交了出去，以及父状态怎么变化”。**

也就是说，后续我们不能只保留：

- `delegate_candidates`

还应该逐步补：

- delegation intent
- delegated task description
- parent state delta
- downstream acceptance

### 3. LangGraph

GitHub:

- <https://github.com/langchain-ai/langgraph>

它强在：

- durable execution
- stateful graph
- compile + checkpoint

但至少从公开主 README 看，它并没有把 activation / gating / RL 学习化作为核心抽象。

所以它更像：

**我们的执行底座参考。**

而不是 activation-RL 设计的直接答案。

### 4. DMCG MARL

GitHub:

- <https://github.com/Nikunj-Gupta/dmcg-marl>

这个仓库和 agent workflow 不同，但它给了一个很有价值的结构启发：

- coordination graph 不必固定
- 多 agent 协同可以通过动态关系图来学习
- 高阶和多跳关系是值得显式建模的

这点对 `ShadowFlow` 的长期意义在于：

**我们后面不一定只是学习“选哪个单点 agent”，而可能学习“当前该激活哪一片局部关系结构”。**

---

## ShadowFlow 下一阶段最该补的 contract

下面这些是我认为会直接影响代码设计的第一批新增对象。

### 1. `ActivationCandidate`

这应该是 activation 的前置对象。

它解决的问题不是“谁被激活了”，而是：

**本轮有哪些候选进入了可选空间。**

建议字段：

- `candidate_id`
- `run_id`
- `task_id`
- `step_id`
- `candidate_type`
  - `node`
  - `agent`
  - `delegate_target`
  - `subgoal`
- `candidate_ref`
- `source_signals`
- `score`
- `selected`
- `suppressed_reason`

### 2. `ActivationPolicySnapshot`

现在我们有 activation record，但还没有把“当时采用的策略”记录下来。

建议新增：

- `policy_id`
- `policy_kind`
  - `rule`
  - `heuristic`
  - `learned`
- `threshold`
- `top_k`
- `budget`
- `suppression_rules`
- `metadata`

目的很简单：

**以后训练失败或效果变差时，我们要能知道当时到底是按什么 gating policy 做选择的。**

### 3. `ExecutionFeedbackRecord` 再升级一层

现在的版本已经够第一阶段用了，但离训练友好还差一些。

建议后面继续补：

- `outcome_label`
- `accepted_by_downstream`
- `review_result`
- `retry_cost`
- `child_run_success`
- `artifact_adopted`
- `feedback_weight`

### 4. `ActivationLineage`

我们已经在 `memory_relation_graph` 里有了 `activates` 和 `records_feedback` 边。

后面应该进一步正式化为可查询 lineage：

- `activates`
- `suppresses`
- `delegates_to`
- `spawns_subgoal_from`
- `reinforces`
- `penalizes`

这会让“激活历史”不再只是一串时间顺序事件，而是能形成训练用图。

### 5. `TrainerFacingExport`

不要等以后训练时再去从 `RunResult` 里临时拼数据。

建议正式提供导出：

- activation trajectories
- feedback dataset
- graph snapshots
- reward views

一句话说：

**让训练器消费正式导出，而不是直接消费 runtime 内部对象。**

---

## 执行层该怎么推进

我建议按下面的顺序来。

### Phase A：从记录层到候选层

先新增：

- `ActivationCandidate`
- `ActivationPolicySnapshot`

并在 runtime 里先做最小流程：

1. 生成候选
2. 打分
3. 选中
4. 记录未选中项

### Phase B：从候选层到 gating 层

让 activation 真正影响执行，而不是只做记录：

- suppressed candidate 不执行
- deferred candidate 推迟
- top-k candidate 才能 delegate
- budget 不够时裁剪 subgoal expansion

### Phase C：从 feedback 到学习闭环

这时再把 feedback 接回 activation：

- 最近失败的 delegate target 降权
- 被 downstream 接受的 artifact producer 升权
- review 常失败的节点提升审查 gate
- 高成功率 activation path 优先进入候选池

### Phase D：接 RL / Graph RL

等前三步稳定以后，再接：

- contextual bandit
- policy gradient
- graph-RL
- causal evaluation

---

## 当前最重要的产品判断

### 不是“让 LLM 决定谁激活”

而是：

**先让局部结构自己进入候选空间，再让策略选择谁被执行。**

### 不是“先训一个大一统模型”

而是：

**先把 activation / feedback / lineage 做成训练友好的 substrate。**

### 不是“先追求涌现”

而是：

**先做出可被反馈塑形的局部选择层。**

---

## 对 ShadowFlow 当前代码的直接建议

基于现在仓库里的进度，下一步最推荐的不是再补文档，而是直接做这三件事：

1. 在 runtime contract 里新增 `ActivationCandidate`
2. 在 runtime service 里把 activation 流程拆成 `candidate -> select -> execute`
3. 给 projection/export 增加 trainer-facing activation dataset

如果只做一句最关键的话：

**把 activation 从“执行后说明为什么发生了”推进到“执行前显式选择要不要发生”。**

这一步一旦做完，强化学习和图学习就真正有落点了。

