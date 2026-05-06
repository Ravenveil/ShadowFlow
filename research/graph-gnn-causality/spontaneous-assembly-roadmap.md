# Spontaneous Assembly Roadmap v1

> 日期：2026-04-01  
> 状态：Draft

## Phase 0：本体先站稳

目标：

- 先把“可装配的结构空间”做出来

落地点：

1. `WorkflowBlockSpec`
2. `WorkflowAssemblySpec`
3. `AssemblyConstraintSpec`
4. block catalog v1
5. assembly compiler v1

不做：

- 不急着上 RL
- 不急着上图学习
- 不急着做 fully autonomous assembly

---

## Phase 1：LLM 装配助理

目标：

- 让用户能从自然语言快速进入 assembly

落地点：

1. `goal -> assembly draft`
2. `assembly critique`
3. `invalid composition repair`
4. recipe import + mutation
5. 参数补全和 role suggestion

产物：

- assembly assistant prompt contract
- compile-time validation feedback loop

---

## Phase 2：反馈信号标准化

目标：

- 为自发层和 RL 准备可学习信号

落地点：

1. run outcome schema
2. reward candidate schema
3. reviewer rejection taxonomy
4. artifact quality signals
5. delegation / retry / checkpoint traces

关键原则：

- 先把信号采集和归档做好
- 不急着直接在线学习

---

## Phase 3：Graph-RL / 自发协作最小版

目标：

- 让系统开始基于结构和反馈学会“更合理地长”

可选切入口：

1. block selection policy
2. delegate candidate selection
3. review / retry policy
4. edge mutation policy

这里建议先做：

- 离线 replay
- policy ranking
- contextual bandit

而不是一上来就全量在线 RL。

---

## Phase 4：因果增强

目标：

- 提高策略更新的解释性和稳健性

落地点：

1. credit assignment 改善
2. counterfactual evaluation
3. intervention logging
4. 因果特征与奖励拆分

---

## 当前执行建议

现在最应该做的是：

1. 进入 `Phase 0`
2. 同时在代码里开始埋 `Phase 2` 所需信号

也就是说：

**先做 assembly 本体，但从第一天开始按“未来要做 RL / graph learning”去设计日志和反馈接口。**
