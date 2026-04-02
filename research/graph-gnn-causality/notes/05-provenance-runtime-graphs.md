# 05. Provenance、Lineage 与 Runtime Graph

## 为什么这批论文重要

如果说前几批资料主要帮我们回答“图是不是应该继续作为统一本体”，那么这批资料更直接回答：

1. 运行时图应该怎么保存 provenance
2. lineage / provenance query 应该怎么做
3. workflow graph、task lineage、artifact lineage 怎么统一看待
4. 为什么 `ShadowFlow` 的下一步重点更像系统型 graph contract，而不是继续抽象争论

## 核心材料

1. **HyProv: Hybrid Provenance Management Framework for Scientific Workflows and Their Resulting Datasets**  
   来源：<https://arxiv.org/abs/2511.07574>  
   本地：[`2025-hyprov-hybrid-provenance-management-scientific-workflows-2511.07574.pdf`](../papers/2025-hyprov-hybrid-provenance-management-scientific-workflows-2511.07574.pdf)

2. **ProvG-Searcher: Provenance Graph Search and Analysis for Reproducible Data Science**  
   来源：<https://arxiv.org/abs/2309.03647>  
   本地：[`2023-provg-searcher-provenance-graph-search-2309.03647.pdf`](../papers/2023-provg-searcher-provenance-graph-search-2309.03647.pdf)

3. **Kairos: Practical Intrahost Causality Visualization Using Whole-system Provenance**  
   来源：<https://arxiv.org/abs/2308.05034>  
   本地：[`2023-kairos-whole-system-provenance-2308.05034.pdf`](../papers/2023-kairos-whole-system-provenance-2308.05034.pdf)

4. **Efficiently Processing Workflow Provenance Queries on Spark**  
   来源：<https://arxiv.org/abs/1808.08424>  
   本地：[`2018-workflow-provenance-queries-spark-1808.08424.pdf`](../papers/2018-workflow-provenance-queries-spark-1808.08424.pdf)

## 当前阶段的筛选理由

这几篇不一定都和我们未来实现一一对应，但它们共同覆盖了四个对 `ShadowFlow` 很关键的点：

1. provenance 如何建模
2. provenance 如何查询
3. causality / lineage 如何可视化
4. workflow 与结果对象之间如何保持可追踪关系

## 初步启发

### 1. provenance 不是“日志附件”，而是图的一部分

这批论文的共同方向很明确：

- provenance 不只是存一串日志
- 它更适合被组织成可查询的图
- 图上需要有明确的实体、事件、关系类型

对 `ShadowFlow` 来说，这意味着：

**artifact、memory_event、checkpoint、handoff、retry、resume 都不该只是零散字段，它们应该进入统一的运行图语义。**

### 2. query 能力必须和 graph contract 一起设计

如果 provenance 图存在，但没有正式 query 入口，它的价值会迅速下降。

我们后续至少会需要这些查询：

1. 一个 `run` 派生了哪些 `task`
2. 某个 artifact 来源于哪些 step / task / checkpoint
3. 某次 `resume` 或 `retry` 是从哪条 lineage 继承来的
4. 哪些 memory_event 与最终 handoff 强相关

所以 `graph projection` 不能只是导出 JSON，而应该顺带定义：

- 查询视图
- 过滤边类型
- lineage 遍历语义

### 3. 因果可视化对我们不是“解释模型”，而是“解释运行”

Kairos 这类 whole-system provenance 论文提醒我们：

- causality 不一定只用于机器学习模型解释
- 也可以用于解释系统行为链路

这和 `ShadowFlow` 很像。

我们后面真正需要解释的，很可能是：

- 为什么这个 child run 被派生出来
- 为什么这个 artifact 出现在最终结果里
- 为什么这次恢复走了这条 checkpoint lineage

### 4. workflow 与 dataset / artifact 的绑定值得我们借鉴

HyProv 这类工作里，一个很关键的点是：

- workflow 本身
- 运行实例
- 结果对象
- 元数据

这些对象不会被割裂看待，而会通过 provenance 统一起来。

这和我们现在讨论的：

- workflow graph
- run graph
- task tree
- artifact graph
- memory graph

其实是同一类问题。

## 对 ShadowFlow 的实际建议

### 1. 给 lineage 关系起正式名字

建议至少考虑下面这些边：

1. `delegation`
2. `belongs_to_run`
3. `belongs_to_task`
4. `produces_artifact`
5. `emits_memory_event`
6. `derived_from_checkpoint`
7. `resume_from`
8. `retry_of`
9. `handoff_to`

### 2. projection 与 query 一起设计

建议后续文档里不要只写 export 接口，还要明确：

1. `export_run_graph(run_id)`
2. `export_task_tree(run_id)`
3. `export_artifact_lineage(artifact_id)`
4. `export_checkpoint_lineage(run_id)`

### 3. 先把 provenance 做成系统能力，再考虑学习层

如果运行图 contract 没立住，后面无论是：

- 图检索
- 异常检测
- 智能推荐
- GNN 分析

都会建立在一个语义不稳的底座上。

所以这批论文进一步支持了我们现在的方向：

**先把 runtime graph、projection、lineage 设计清楚。**
