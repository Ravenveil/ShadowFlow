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

---

## Phase 1：局部激活 / 选择机制

目标：

- 先把“哪些构件会被当前目标和状态激活”做出来

落地点：

1. `role activation`
2. `block activation`
3. `delegate candidate activation`
4. `gap detection`
5. `subgoal trigger`
6. `retry / review / rework gating`

补充：

- `LLM assistant` 可以作为这层的可插拔能力
- 但不再作为这层的默认本体

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

---

## Phase 3：Graph-RL / 自发协作最小版

目标：

- 让系统开始基于结构和反馈学会“更合理地长”

建议切入口：

1. block selection policy
2. delegate candidate selection
3. review / retry policy
4. edge mutation policy

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
2. 紧接着做 `Phase 1` 的局部激活机制
3. 同时在代码里开始埋 `Phase 2` 所需信号

也就是说：

**先做 assembly 本体，再做局部激活；并且从第一天开始按“未来要做 RL / graph learning”去设计日志和反馈接口。**
