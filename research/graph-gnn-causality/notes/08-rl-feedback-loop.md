# 强化学习与反馈闭环

> 目的：判断 RL 是否适合进入 `ShadowFlow` 的自发层

## 一句话结论

适合，但应该在 assembly 本体成立之后进入。

## 为什么像 RL

自发装配的基本循环其实就是：

1. 观察当前图状态
2. 选择一个结构动作
3. 编译并执行
4. 接收 outcome / reviewer / artifact / retry 反馈
5. 更新下次策略

这和 RL 的状态-动作-奖励循环高度一致。

## 可学习的动作

最容易落的动作包括：

1. 选哪个 block
2. 给哪个 block 加 review overlay
3. 是否 delegate
4. delegate 给谁
5. 失败后 retry / rework / split 哪种策略

## 奖励信号候选

1. 任务是否完成
2. reviewer 是否通过
3. artifact 质量是否达标
4. token / 时间 / 成本效率
5. 是否产生不必要的重试和分叉

## 主要风险

1. reward hacking
2. 稀疏奖励
3. credit assignment 困难
4. 在线学习影响稳定性

## 对 ShadowFlow 的建议

先做：

- reward schema
- offline replay
- contextual bandit / ranking

后做：

- 在线 RL
- 全图 mutation policy

所以 RL 应该是“渐进接入”，不是“一步上位”。
