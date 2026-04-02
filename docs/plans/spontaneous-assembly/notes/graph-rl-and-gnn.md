# 图强化学习、GNN 与 ShadowFlow

> 目的：判断 GNN、图强化学习、MARL 与 `ShadowFlow` 的自发层如何结合

## 一句话结论

`ShadowFlow` 非常适合未来接 `GNN + RL`，因为我们的状态天然就是图。

## 为什么图和 RL 能接上

在 `ShadowFlow` 里，可用于学习的对象天然包括：

- assembly graph
- workflow graph
- run graph
- `task_tree`
- artifact lineage graph
- checkpoint lineage graph

RL 需要状态编码。  
GNN 擅长编码图状态。

所以一个自然组合是：

- **GNN 负责图状态表征**
- **RL 负责在图上选择动作**

## 为什么 MARL 也有借鉴意义

如果未来我们真的走向：

- 多 agent 协同决策
- 分布式 delegate
- 局部观察 + 全局目标

那问题会越来越接近 MARL。

## 为什么因果要一起看

如果只有图 + RL，我们能学到策略，但不一定知道：

- 为什么这个动作有效
- 哪条边真正带来了改善

因果方法可以帮助：

- counterfactual evaluation
- intervention analysis
- 更稳的 reward attribution
