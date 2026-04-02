# 06. Provenance 论文精读提炼与 ShadowFlow 设计映射

> 日期：2026-04-01  
> 状态：Actionable Extraction  
> 目的：把 `provenance / lineage / runtime graph` 相关论文的关键思想，翻译成 `ShadowFlow` 可直接采用的设计点

---

## 1. 为什么要单独做这份提炼

前面的研究笔记已经说明了方向：

- 图可以继续作为统一本体
- `task tree` 更适合作为一种 projection
- `responsibility matrix` 解决静态治理
- delegated run / lineage 解决动态执行

但如果要继续往实现推进，我们还需要更进一步回答：

1. provenance 到底应该落成哪些对象
2. 哪些关系必须建成 typed edge
3. projection 为什么不能只是“导出一份 JSON”
4. query、lineage、audit、summary 之间应该怎么分层

这份文档就是把论文里的这些答案提出来。

---

## 2. 论文逐篇提炼

### 2.1 HyProv

来源：<https://arxiv.org/abs/2511.07574>

这篇论文最值得我们吸收的点，不是 scientific workflow 这个场景本身，而是它对 provenance 的组织方式：

1. workflow 本体和结果对象不会被割裂看待
2. provenance 既不是单纯日志，也不是单纯元数据
3. 运行过程与结果数据之间，需要稳定、可追踪的关联层

对 `ShadowFlow` 的直接映射是：

- `workflow graph`
- `run graph`
- `artifact lineage`
- `checkpoint lineage`

不能各自做成互不相干的输出对象，而应该共用一套底层关系语义。

### 2.2 ProvG-Searcher

来源：<https://arxiv.org/abs/2309.03647>

这篇论文最关键的提醒是：

1. provenance 图如果不能被搜索和遍历，它的价值会迅速下降
2. provenance 的重点不只是存下来，而是能围绕任务去做回查、定位、复现、分析

对 `ShadowFlow` 的映射很直接：

- `graph projection` 必须伴随 query contract
- 至少要支持 `run -> task -> step -> artifact` 的基础 lineage 遍历
- UI 和 CLI 后续真正消费的，往往不是整图，而是针对具体问题的局部子图

### 2.3 Kairos

来源：<https://arxiv.org/abs/2308.05034>

Kairos 更偏系统因果可视化，但它给我们的启发很强：

1. causality 不只用于解释模型
2. whole-system provenance 非常适合解释“为什么系统会走到这里”
3. 一个可视化/可解释系统，核心不是节点画得多漂亮，而是边类型和链路解释是否清楚

对 `ShadowFlow` 的映射是：

- `resume_from`
- `retry_of`
- `delegation`
- `handoff_to`
- `derived_from_checkpoint`

这些关系必须是显式边，而不是散在 metadata 里的字符串。

### 2.4 Efficiently Processing Workflow Provenance Queries on Spark

来源：<https://arxiv.org/abs/1808.08424>

这篇虽然较早，但对系统实现很有现实意义。它强调：

1. provenance query 的性能问题是真实问题
2. 不应该每次都从全量 provenance 图做暴力遍历
3. 需要利用 workflow dependency graph 和局部连通子集来缩小查询范围

对 `ShadowFlow` 的设计提醒是：

1. projection 要有“热查询友好”的 summary/index
2. 审计态与恢复态、查询态要分层
3. 后面做 `artifact lineage`、`checkpoint lineage` 时，不能只依赖全量 `RunResult` 回放

---

## 3. 从论文到 ShadowFlow 的 6 条设计原则

### 3.1 provenance 必须进入正式 graph ontology

不能把 provenance 当成：

- 日志附件
- trace 文本
- 若干 metadata 字段

它应该成为图里的正式实体和关系。

### 3.2 projection 和 query 必须一起设计

仅有 `export_*` 接口是不够的。

还必须同步定义：

- scope
- filter
- traversal boundary
- lineage direction
- summary payload

否则 projection 只是“能导出”，而不是“能消费”。

### 3.3 运行图必须 typed

建议至少区分这些实体：

1. `workflow_node`
2. `run`
3. `task`
4. `step`
5. `artifact`
6. `checkpoint`
7. `memory_event`
8. `handoff`

建议至少区分这些边：

1. `control_flow`
2. `conditional_flow`
3. `belongs_to_run`
4. `belongs_to_task`
5. `executes_node`
6. `delegation`
7. `handoff_to`
8. `produces_artifact`
9. `emits_memory_event`
10. `creates_checkpoint`
11. `derived_from_checkpoint`
12. `resume_from`
13. `retry_of`

### 3.4 干预边必须和自然执行边区分

对系统解释来说，下面这些动作不是普通状态变化：

1. `resume`
2. `retry`
3. `cancel`
4. `spawn child run`
5. `force handoff`

这些更像“干预”，所以应该能在 graph 上被识别出来。

### 3.5 审计态和热查询态要分层

论文里对性能和可用性的提醒很一致：

- 全量 provenance 很重要
- 但热查询不应总扫全量图

对 `ShadowFlow` 来说，更合理的分层是：

1. `audit graph`
   保存完整 trace、事件和关系
2. `projection summary`
   保存 UI / CLI 高频查询需要的轻量节点与边
3. `lineage index`
   保存 artifact、checkpoint、task tree 这些常见遍历入口

### 3.6 workflow-aware 很重要

provenance 不是脱离 workflow 独立存在的。

后续很多查询都会依赖：

- workflow structure
- node type
- run-time instantiation
- task lineage

所以 `workflow graph` 和 `run graph` 必须能够互相映射。

---

## 4. 对 ShadowFlow 的直接设计映射

### 4.1 先做统一的 graph envelope

不管是 `workflow graph`、`run graph` 还是 `artifact lineage`，都建议共用一个基础壳：

```json
{
  "projection_kind": "run_graph",
  "scope": {
    "workflow_id": "...",
    "run_id": "..."
  },
  "nodes": [],
  "edges": [],
  "summary": {},
  "filters": {}
}
```

这样后续 UI/CLI 不需要为每种图写完全不同的消费器。

### 4.2 先做 6 种一等 projection

1. `workflow_graph`
2. `run_graph`
3. `task_tree`
4. `artifact_lineage_graph`
5. `memory_relation_graph`
6. `checkpoint_lineage_graph`

### 4.3 先做 4 组高价值查询

1. `run -> task -> step`
2. `step -> artifact`
3. `checkpoint -> resumed run`
4. `handoff -> downstream step/task`

### 4.4 对当前代码的现实判断

当前 `RuntimeService` 已经有：

1. `export_workflow_graph()`
2. `export_run_graph()`

但这还只是第一层：

- `run graph` 仍然基本等于 workflow 节点状态图
- 还没有独立 `task tree`
- 还没有 `artifact/memory/checkpoint lineage`
- 还没有正式 query contract

所以接下来的文档和实现，重点应放在“把这些对象和关系提成一等接口”。

---

## 5. 下一步最值得落的文档

1. `shadowflow-graph-projection-contract-v1.md`
2. `shadowflow-delegated-run-semantics-v1.md`
3. 后续再补 `artifact-lineage-contract` 或并入 projection contract

---

## 6. 当前结论

这批 provenance 论文最后落到 `ShadowFlow` 身上的结论非常清楚：

**我们现在最该做的，不是继续争“图还是树”，也不是把 GNN 提前塞进引擎，而是把 runtime graph、projection、query、lineage 这几件事正式做成 contract。**
