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

## 对应到我们的可学习动作

1. graph node selection
2. edge mutation
3. delegation routing
4. branch / barrier policy
5. review / retry / resume policy

## 为什么 MARL 也有借鉴意义

如果未来我们真的走向：

- 多 agent 协同决策
- 分布式 delegate
- 局部观察 + 全局目标

那问题会越来越接近 MARL。

这时 GNN 的价值更强，因为它能更自然地编码：

- agent-agent 关系
- task-agent 关系
- 局部通信结构

## 为什么因果要一起看

如果只有图 + RL，我们能学到策略，但不一定知道：

- 为什么这个动作有效
- 哪条边真正带来了改善
- 某次成功到底是偶然还是结构性原因

因果方法可以帮助：

- counterfactual evaluation
- intervention analysis
- 更稳的 reward attribution

## 当前建议

现在不要先把 GNN 放进 runtime 核心。

更稳的顺序是：

1. graph schema 稳定
2. feedback schema 稳定
3. 离线图状态编码实验
4. 小范围 graph-RL policy

这样不会把研究风险提前压到主链上。
