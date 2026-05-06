# Graph / GNN / Causality Research

> 日期：2026-04-01  
> 主题：图神经网络、动态图、因果推断、因果发现，以及这些材料对 `ShadowFlow` 图运行时设计的启发

## 目录说明

- `notes/`：按主题分批整理的研究笔记
- `papers/`：已下载的原论文 PDF 与论文索引
- `summary.md`：当前阶段的汇总结论

## 当前研究目标

这批资料不是为了把 `ShadowFlow` 直接做成一个 GNN 产品，而是为了回答几个更贴近引擎设计的问题：

1. 图是否应该继续作为统一建模容器
2. `task tree` 是否应该被看作 `runtime graph projection`
3. `policy matrix / responsibility matrix` 与 delegated run 之间的边界应该怎么定义
4. 因果图、动态图、图学习最新研究，对“typed runtime graph”有什么真正有价值的启发

## 当前笔记

1. [01-gnn-landscape.md](./notes/01-gnn-landscape.md)
2. [02-dynamic-graphs.md](./notes/02-dynamic-graphs.md)
3. [03-causality-and-graph.md](./notes/03-causality-and-graph.md)
4. [04-shadowflow-implications.md](./notes/04-shadowflow-implications.md)
5. [05-provenance-runtime-graphs.md](./notes/05-provenance-runtime-graphs.md)
6. [06-provenance-design-extract.md](./notes/06-provenance-design-extract.md)
7. [summary.md](./summary.md)
8. [spontaneous-assembly-README.md](./spontaneous-assembly-README.md)

## 当前阶段判断

一句话先定调：

**图本身不是问题，关键在于我们是否把“时间、操作、干预、关系类型、恢复语义”都提升成图运行时的一等公民。**

这意味着：

- `task tree` 更像 `graph projection`，不是另一套本体
- `responsibility matrix` 更像静态治理层
- `delegated run / child run` 更像动态执行层
- 当前阶段先补语义与投影 contract，比急着往内核里塞 GNN 更重要
- `provenance / lineage / runtime graph` 是下一批最值得继续深挖的系统型材料
