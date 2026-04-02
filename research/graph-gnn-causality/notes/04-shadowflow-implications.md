# 04. 对 ShadowFlow 的设计启发

## 先给结论

从这批资料回看我们自己的讨论，我目前更倾向于下面这套说法：

1. 图继续作为统一建模容器
2. `task tree` 只是 graph projection，不是另一套本体
3. `responsibility matrix` 负责静态治理
4. delegated run / child run 负责动态执行语义
5. 当前阶段先做 typed runtime graph，比直接引入 GNN 更重要

## 为什么不是“树替代图”

树当然是图的子集，所以这里不该争“图 vs 树”。

真正该问的是：

- 现在的 graph runtime 是否已经有足够强的语义
- 是否区分了结构、状态、事件、干预、恢复
- 是否能把这些语义稳定投影成 task tree / run graph / artifact graph

如果这些没有做清楚，就算表面上加了树模型，本质问题也还在。

## 为什么责任矩阵还不够

责任矩阵很重要，但它回答的是：

- 谁应该做什么
- 哪些工具和副作用允许
- 哪些边界合法

它不自动回答：

- 这次运行里到底 spawn 了哪些独立执行实例
- 子任务和父任务如何恢复
- artifact / memory_event 属于谁
- 哪个执行实例被重试了

所以更合理的分层是：

- `policy matrix`：静态治理层
- `delegated run semantics`：动态执行层

## 我们现在最值得做的事情

### 1. 先补 graph projection contract

建议正式化至少这些投影：

1. `workflow graph`
2. `run graph`
3. `task tree`
4. `artifact relation graph`
5. `memory relation graph`
6. `checkpoint lineage graph`

### 2. 再补 delegated run semantics

建议至少落地这些语义：

1. `spawn_child_run`
2. `parent_run_id / root_run_id`
3. `parent_task_id / root_task_id`
4. context inheritance / isolation mode
5. child handoff summary
6. retry / resume on child boundary

### 3. 暂时把 GNN 放到“分析层候选”

后续真的值得用 GNN/图模型的地方，可能是：

1. workflow 模式挖掘
2. 失败路径聚类
3. artifact 关系推荐
4. replay / resume 策略推荐
5. 异常运行检测

这些都更像“分析层”或“智能辅助层”，不是当前运行时主链。

