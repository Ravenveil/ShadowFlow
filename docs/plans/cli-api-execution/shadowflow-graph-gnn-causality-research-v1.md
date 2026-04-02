# ShadowFlow Graph / GNN / Causality Research v1

> 日期：2026-04-01
> 状态：Research Notes
> 目的：围绕 `ShadowFlow` 当前“图、任务树、责任矩阵、delegated run`”讨论，补充近两年的图神经网络、因果推断与图相关资料，并提炼出对引擎设计真正有帮助的判断

---

## 1. 这份笔记要回答什么

当前我们讨论的核心，不是“要不要做 GNN 产品”，而是：

1. `ShadowFlow` 是否应该继续把“图”作为统一本体
2. `task tree` 是否只是 `graph projection` 的一种视角
3. `责任矩阵 / policy matrix` 与运行时 delegated run 的关系是什么
4. 因果图、动态图、GNN 的最新研究，能给我们的引擎设计什么启发

一句话先说结论：

**从最新研究看，图本身完全可以作为统一建模容器；真正关键不是“图还是树”，而是是否把时间、干预、关系类型、恢复语义做成图运行时的一等公民。**

---

## 2. 阅读材料清单

以下优先选择论文原文或正式会议版本，尽量避免二手总结。

### 2.1 图神经网络 / 图学习

1. **Graph Foundation Models: A Comprehensive Survey**
   日期：2025-05-21
   链接：<https://arxiv.org/abs/2505.15116>
   关键词：graph foundation model、通用图表征、预训练、适配

2. **A Survey of Graph Transformers: Architectures, Theories and Applications**
   日期：2025-02-23
   链接：<https://arxiv.org/abs/2502.16533>
   关键词：graph transformer、表达能力、结构编码、应用

3. **Classic GNNs are Strong Baselines: Reassessing GNNs for Node Classification**
   日期：2024-06-13
   链接：<https://arxiv.org/abs/2406.08993>
   关键词：经典 GNN、Graph Transformer、强基线、经验重评估

4. **A Comprehensive Survey of Dynamic Graph Neural Networks: Models, Frameworks, Benchmarks, Experiments and Challenges**
   日期：2024-05-01
   链接：<https://arxiv.org/abs/2405.00476>
   关键词：dynamic graph、时间演化、动态图框架、benchmark

5. **Improving the Effective Receptive Field of Message-Passing Neural Networks**
   日期：2025-05-29
   链接：<https://arxiv.org/abs/2505.23185>
   关键词：long-range dependency、effective receptive field、over-squashing、多尺度消息传递

### 2.2 因果推断 / 因果图 / 图与因果

6. **A Survey of Out-of-distribution Generalization for Graph Machine Learning from a Causal View**
   日期：2024-09-15
   链接：<https://arxiv.org/abs/2409.09858>
   关键词：graph ML、OOD generalization、causal view、trustworthy GML

7. **Graph Neural Networks for Causal Inference Under Network Confounding**
   初版日期：2022-11-15
   最近版本：2025-12-28
   链接：<https://arxiv.org/abs/2211.07823>
   关键词：network confounding、interference、GNN for causal adjustment

8. **Causal GNNs: A GNN-Driven Instrumental Variable Approach for Causal Inference in Networks**
   日期：2024-09-13
   链接：<https://arxiv.org/abs/2409.08544>
   关键词：instrumental variable、network causal inference、hidden confounder

9. **Causality-Inspired Spatial-Temporal Explanations for Dynamic Graph Neural Networks**
   会议：ICLR 2024
   链接：<https://proceedings.iclr.cc/paper_files/paper/2024/file/6e2a1a8a037f9a06004fe651054e8938-Paper-Conference.pdf>
   关键词：dynamic graph、causal explanation、时间+空间解释

10. **The Landscape of Causal Discovery Data: Grounding Causal Discovery in Real-World Applications**
    年份：PMLR 2025
    链接：<https://philippe-brouillard.com/publication/landscape-of-causal-discovery/landscape-of-causal-discovery.pdf>
    关键词：causal discovery、real-world data、evaluation bias、DAG learning

11. **Learning Causal Graphs at Scale: A Foundation Model Approach**
    日期：2025-06-23
    链接：<https://arxiv.org/abs/2506.18285>
    关键词：foundation model、DAG learning、causal discovery、multi-task prior

---

## 3. 从这些资料里先提炼出的几条判断

### 3.1 图不是问题，问题是图是否有“时间”和“干预”语义

从动态图和因果图两个方向看，研究界已经很清楚：

1. 静态结构图不够
2. 只表达连接关系也不够
3. 还必须表达：
   - 时间演化
   - 关系类型
   - 干预
   - 可恢复状态
   - 观测与潜变量边界

对 `ShadowFlow` 的启发是：

**我们现在真正该强化的不是“再发明一个树模型”，而是把 graph runtime 从“静态 workflow 图”升级成“带时间、带操作语义、带关系类型的运行图”。**

所以：

- `task tree` 更像是 runtime graph 的一种投影
- `run graph`、`artifact relation graph`、`memory relation graph` 也是投影

这和“树是图的子集”这个直觉是一致的。

### 3.2 责任矩阵解决静态治理，不自动解决动态运行

责任矩阵当然重要，而且从计划文档看，它已经是 `WorkflowTemplate Compile` 主链的一部分。

但从因果和动态图的视角看，静态结构和动态过程必须分开：

1. 静态层回答：
   - 谁应该做什么
   - 哪些边界合法
   - 哪些工具和副作用可用

2. 动态层回答：
   - 这次到底 spawn 了什么执行实例
   - 它和父任务是什么关系
   - 失败、重试、恢复发生在哪里
   - 哪些 artifact 和 memory_event 属于这个执行实例

因此更准确的说法不是：

“因为图不够，所以要做 sub-agent”

而是：

**责任矩阵定义的是 graph 的静态治理层；delegated run / child run 语义定义的是 graph 的动态执行层。**

### 3.3 不要轻易把 Graph Transformer 或 Foundation Model 当成“当然更强”

`Classic GNNs are Strong Baselines` 的一个直接提醒是：

1. 新模型的表达能力更强，不等于在真实任务上就稳定更强
2. 很多 benchmark 上，经典 GNN 经过认真调参后仍然很有竞争力

这对我们也很有用。

它提醒我们不要陷入：

1. “树比图高级”
2. “多一层抽象当然更先进”
3. “模型越复杂越贴近未来”

而应该先问：

**当前问题到底是表达能力不足，还是运行语义还没被显式建模？**

对于 `ShadowFlow`，我现在更倾向于后者。

### 3.4 动态图研究对我们最有价值的不是“预测”，而是“状态演化视角”

动态图 survey 给我们的最大启发，不是去做时间序列预测，而是：

1. 图不是一次性结构
2. 图的节点、边、状态会随着时间变化
3. 需要区分：
   - 当前结构
   - 历史快照
   - 动态事件流

这和我们 runtime 非常像：

- `workflow graph` 是静态定义
- `run graph` 是单次执行态
- `checkpoint` 是时序快照
- `memory_event` 是事件流

也就是说，`ShadowFlow` 与其把 task tree 当成另一套本体，不如更明确地承认：

**我们在做的是一个时间演化的 typed runtime graph。**

### 3.5 因果视角的最大帮助，是让我们更认真地区分“相关”与“可干预”

因果推断材料反复强调：

1. 结构不是装饰
2. 干预语义不能被统计相关替代
3. 真正重要的是：
   - 哪条边代表依赖
   - 哪条边代表生成
   - 哪条边代表委派
   - 哪条边可以被干预

对引擎设计来说，这非常关键。

例如当前 `ShadowFlow` 里的操作：

- `resume`
- `retry`
- `handoff`
- `spawn delegated run`
- `persist artifact`

这些都不是普通“相关关系”，而是带操作含义的边。

所以如果后续要把 graph 做深，应该优先把 relation type 规范化，而不是先争“图 vs 树”。

---

## 4. 对 ShadowFlow 当前讨论最有用的具体启发

### 4.1 图本体应继续保留，但必须 typed

建议明确区分至少这些边类型：

1. `control_flow`
2. `conditional_flow`
3. `delegation`
4. `handoff`
5. `produces_artifact`
6. `emits_memory_event`
7. `resume_from`
8. `derived_from_checkpoint`
9. `belongs_to_task`

这样 task tree 根本不需要成为另一套模型。

它只是：

- 在 `delegation / belongs_to_task` 这些边上做过滤和投影

### 4.2 需要把“操作”视为图上的干预，而不是仅仅视为状态变化

因果图最有价值的地方在于，它提醒我们：

不是所有变化都一样。

对 `ShadowFlow`，下面这些动作更接近“干预”：

1. pause
2. resume
3. retry
4. cancel
5. reassign
6. spawn child run
7. force handoff

这意味着后续如果我们要设计 graph projection 或 runtime query，最好允许表达：

- 这是自然执行产生的边
- 还是宿主/人/系统干预产生的边

### 4.3 真实系统更该重视可解释与真实评估，而不是只看结构好不好看

`The Landscape of Causal Discovery Data` 一个很有价值的提醒是：

1. 研究里非常容易过度依赖 synthetic 数据和结构指标
2. 到真实场景后，很多假设会失效

对我们很像。

如果 `ShadowFlow` 只追求：

- graph 漂亮
- 结构统一
- schema 完整

但不能回答：

1. 为什么这个任务会生成这个 child run
2. 为什么这个 handoff 被判定成立
3. 为什么这个 checkpoint 可以恢复到这里
4. UI 上为什么看到这条关系

那就还是不够。

所以 graph contract 后面必须有 explainability 配套，这和任务清单里的 `P1-1 Explainability` 是一致的。

### 4.4 现在不该把 GNN 直接塞进主 runtime

这是一个需要明确写下来的判断：

**当前阶段不建议把 GNN 当成 ShadowFlow runtime 的核心执行抽象。**

原因不是 GNN 没价值，而是：

1. 我们当前问题主要是运行时语义建模，不是图上的预测建模
2. runtime 需要的是可恢复、可审计、可干预
3. GNN 更适合未来做：
   - run pattern mining
   - workflow recommendation
   - anomaly detection
   - graph summarization
   - dependency scoring

也就是说：

- 短期：把 graph runtime 语义做稳
- 中期：把 graph log/trace 作为学习数据
- 长期：再考虑用 GNN 或 graph foundation model 做辅助优化

---

## 5. 结合当前计划文档后的落地判断

结合：

- [README.md](README.md)
- [shadowflow-engine-scope-v1.md](shadowflow-engine-scope-v1.md)
- [shadowflow-engine-task-list-v1.md](shadowflow-engine-task-list-v1.md)

我现在的判断是：

### 5.1 P0-2 其实不应被理解成“再做一套树”

更好的表述是：

**在 graph runtime 中，把 delegated run / child run 语义提升为正式能力。**

也就是：

1. 图上仍然是 node
2. node 可以是普通 step，也可以是 delegated step
3. delegated step 在 runtime 上生成 child run
4. task tree 只是 `delegation` 关系的投影

### 5.2 P0-5 Graph Projection 应该比现在更强

当前 `export_workflow_graph / export_run_graph` 还不够。

下一阶段至少要补：

1. `task_tree_projection`
2. `artifact_relation_projection`
3. `memory_relation_projection`
4. `checkpoint_resume_projection`
5. `delegation_projection`

### 5.3 P0-4 File Collaboration / Writeback Contract 应和图关系一起定义

artifact 不应只是“文件落盘结果”，还应该明确它在图里的关系：

1. 谁生成了它
2. 它服务于哪个 handoff
3. 它属于哪个 task/run
4. 它是否可作为 resume / explain / review 的依据

---

## 6. 当前最值得推进的设计问题

### 问题 1：什么样的 node 才算 delegated node

建议明确：

1. 普通 step node
2. delegated node
3. barrier / aggregate node
4. review / decision node

不要让所有 agent node 在 runtime 语义上都一样。

### 问题 2：Graph Projection 的最小 typed schema 应该是什么

建议最小包含：

1. `entity_type`
2. `entity_id`
3. `relation_type`
4. `source_id`
5. `target_id`
6. `created_at`
7. `run_id`
8. `task_id`
9. `metadata`

### 问题 3：哪些动作属于 intervention

建议先从这几个动作开始：

1. retry
2. resume
3. cancel
4. reassign
5. spawn_child

### 问题 4：哪些数据只该做 projection，不该进 checkpoint

目前我们已经开始做 checkpoint 瘦身。

下一步建议进一步把以下信息视为 projection-only：

1. task tree cache
2. relation graph cache
3. explain summary
4. large trace materialization

---

## 7. 一页结论

如果只保留一页判断，我会保留这几句：

1. **图可以继续作为 ShadowFlow 的统一本体，不需要为了 task tree 再换一套模型。**
2. **task tree、run graph、artifact graph、memory graph 都更像 typed projection，而不是不同本体。**
3. **责任矩阵解决的是静态治理；delegated run 解决的是动态执行。两者不是替代关系。**
4. **因果视角最重要的启发，不是“学一个因果模型”，而是把 dependency、delegation、handoff、resume 这些关系的操作语义明确化。**
5. **当前阶段不该急着把 GNN 塞进 runtime 主链；更合理的是先把 graph runtime 做稳，后续再考虑用 GNN 做推荐、分析或优化。**

---

## 8. 对后续文档的建议

基于这份研究笔记，建议后续优先新增两份文档：

1. `shadowflow-graph-projection-contract-v1.md`
   目标：把 typed graph projection 正式写成 contract

2. `shadowflow-delegated-run-semantics-v1.md`
   目标：把 delegated node / child run 在 graph runtime 中的正式语义写清楚

这样我们后面再讨论“图能不能承载任务树、责任矩阵和 delegated run”时，就不会停留在抽象层，而能回到具体 contract。
