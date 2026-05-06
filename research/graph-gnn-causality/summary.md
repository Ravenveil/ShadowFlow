# Graph / GNN / Causality Summary v1

> 日期：2026-04-01  
> 状态：阶段性汇总

## 一句话结论

**对 `ShadowFlow` 来说，最重要的不是把树抬成新本体，也不是立刻把 GNN 引进内核，而是把 graph runtime 升级成一个 typed、可投影、带时间与干预语义的运行图。**

## 研究后的关键判断

### 1. 图可以继续作为统一本体

从动态图与因果图角度看，图完全足够表达：

- 层级
- 依赖
- 委派
- 生成
- 恢复
- 干预

所以问题不在“图不行”，而在“语义是否被显式建模”。

### 2. `task tree` 更适合作为投影，而不是替代本体

树没有必要和图对立。  
更准确的说法是：

- graph 是统一容器
- task tree 是针对某些边类型的投影视图

这也让 `artifact graph`、`memory graph`、`checkpoint lineage graph` 有了统一的表达方式。

### 3. `responsibility matrix` 与 delegated run 不冲突

二者分工不同：

- `responsibility matrix / policy matrix`：静态治理
- delegated run / child run：动态执行

一个定义“应该怎么分工”，一个定义“分工之后如何运行、恢复、审计、查询”。

### 4. GNN 暂时不应该进入运行时核心

这批论文给我的判断是：

- 现在还不该把 GNN 当成主链必需能力
- 先把 runtime graph 的结构与语义定清楚更重要
- GNN 更适合作为下一层分析与辅助能力

### 5. provenance / lineage 论文对我们下一步更直接

第二批系统型论文进一步强化了一个判断：

- 真正贴近 `ShadowFlow` 下一步落地的，不是再找更花的图学习模型
- 而是把 provenance、lineage、query、projection 这些系统语义做实

也就是说，下一步更值得写的是：

- `graph projection contract`
- `delegated run semantics`
- `artifact / memory / checkpoint lineage`

补充：

- 这里的 `task tree` 指的是 graph 上的任务层级投影视图
- 不是在 graph 之外再维护另一套树本体

## 对下一步工作的建议

1. 先写 `graph projection contract`
2. 再写 `delegated run semantics`
3. 然后再评估是否需要“图分析层”

## 可直接衔接的候选文档

1. `research/graph-gnn-causality/summary.md` 作为研究汇总入口
2. `docs/plans/cli-api-execution/shadowflow-graph-projection-contract-v1.md`
3. `docs/plans/cli-api-execution/shadowflow-delegated-run-semantics-v1.md`

## 本轮新增落地

1. `research/graph-gnn-causality/notes/06-provenance-design-extract.md`
2. `docs/plans/cli-api-execution/shadowflow-graph-projection-contract-v1.md`
3. `research/graph-gnn-causality/spontaneous-assembly-README.md`
4. `research/graph-gnn-causality/spontaneous-assembly-summary.md`
