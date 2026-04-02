# ShadowFlow Language Strategy v1

> 日期：2026-04-01
> 状态：Draft
> 目的：明确 `ShadowFlow` 作为多 Agent 编排引擎，当前是否应继续以 Python 为主，以及未来应如何分层引入 Rust / TypeScript

---

## 1. 一句话结论

`ShadowFlow` **短期内不应整体换语言**。

当前最合理的策略是：

- **Python 继续做主引擎语言**
- **Rust 作为未来可抽取的内核语言**
- **TypeScript 继续承担 UI / 可视化装配器 / 产品壳 / 协议接入层**

一句话说：

**现在不该“整体重写”，而该“先分层设计，再按需抽核”。**

---

## 2. 为什么现在不建议整体放弃 Python

### 2.1 当前主问题不是 Python 算不动

`ShadowFlow` 现在最核心的工作不是大规模数值计算，而是：

- contract/schema
- assembly compile
- workflow orchestration
- delegated run / child run
- checkpoint / resume
- lineage / projection
- adapter / executor 调度

这些工作更像：

- 控制面
- 编排面
- 校验面
- 观测面

而不是典型的高密度数值内核。

当前真实瓶颈通常更可能来自：

- LLM 调用延迟
- 外部 CLI / API 工具调用
- 文件与网络 I/O
- 持久化与序列化
- 复杂流程本身的状态管理

这类瓶颈，整体换语言往往不会立刻带来决定性收益。

### 2.2 语义还在快速演化

我们最近刚刚落地或还在持续定义的东西包括：

- typed runtime graph
- `task_tree`
- delegated run / child run semantics
- assembly contract
- projection contract

这说明：

- 高层模型还在定型
- schema 还在收口
- compile 规则还在长出来

在这个阶段整体换语言，通常会把“概念还没定稳”和“底层重写成本”叠在一起，风险很高。

### 2.3 Python 对当前生态最顺手

选择 Python 不是因为“只能跟着 LangGraph”，而是因为它在今天这条路线上依然最实用：

- LLM / agent 生态最成熟
- FastAPI / pydantic 非常适合 contract-first 引擎
- 实验、调试、快速迭代成本低
- 未来接 GNN / 因果推断 / graph analysis 也最顺

所以对 `ShadowFlow` 当前阶段来说，Python 不是妥协，而是合适。

---

## 3. 如果只看“性能最高、最不容易出错”，哪种语言更强

如果问题变成：

> 不考虑当前迁移成本，只看长期内核性能与稳定性，哪种语言更适合做 engine kernel？

我的判断是：

**Rust。**

原因很直接：

- 强类型
- 内存安全
- 并发安全
- 长期运行服务更稳
- 更适合做高可靠 graph / log / index / scheduler kernel

所以真正的对比不应该是：

- Python vs 一切

而应该是：

- **现在继续 Python**
- **未来按需抽 Rust kernel**

---

## 4. 为什么现在也不建议直接换到 TypeScript / Node

TypeScript 非常适合：

- UI
- 可视化编排器
- 协议接入层
- Web 产品壳
- 插件与 IDE 集成

但如果让它直接承担 `ShadowFlow` 的核心引擎主线，会有几个问题：

- 当前运行时 contract 大量依赖 Python 侧模型与测试积累
- LLM / graph research / GNN 生态依旧是 Python 更自然
- 我们真正担心的“内核稳定性”，TypeScript 也不如 Rust

所以 TypeScript 很重要，但它更适合做：

- assembly studio
- graph editor
- Shadow UI
- protocol gateway

而不是现在就取代 Python runtime。

---

## 5. 与我们当前代码结构的对应关系

当前仓库里最像“引擎心脏”的部分，主要在：

- `shadowflow/runtime/contracts.py`
- `shadowflow/runtime/service.py`
- `shadowflow/highlevel.py`

它们分别承担的是：

- contract / schema
- runtime orchestration / projection / checkpoint / delegated run
- 高层编译与模板能力

这些地方现在更像：

- 可验证的控制面
- 快速演化的语义层

这也是为什么，继续用 Python 会比现在整体换语言更稳。

---

## 6. 如果未来要接 GNN / 因果推断，Python 反而是加分项

如果未来 `ShadowFlow` 要继续吸收：

- 图神经网络
- 因果推断
- 图异常检测
- 路径推荐
- graph embedding / policy learning

那 Python 不是障碍，反而是优势。

因为这些方向的主流生态依然主要围绕：

- PyTorch
- PyG
- DGL
- 各类研究代码与 notebook 流程

所以从研究到实验到落地辅助分析层，Python 都更顺。

---

## 7. 推荐的三层语言分工

### 7.1 Python：主引擎语言

建议继续由 Python 承担：

- contract / schema
- block catalog
- assembly spec
- assembly compiler
- runtime orchestration
- delegated run semantics
- projection / lineage export
- LLM-assisted assembly
- GNN / graph analysis adapter

### 7.2 Rust：未来内核抽取语言

当这些能力变成热点时，再考虑抽成 Rust：

- graph validation kernel
- event log / checkpoint core
- lineage index engine
- 大规模 projection query engine
- 并发调度器
- 高吞吐 store / snapshot engine

### 7.3 TypeScript：产品与交互层

继续由 TypeScript 承担：

- Shadow UI
- 可视化装配器
- graph editor
- block market / recipe browser
- IDE / MCP / plugin 接入
- 面向用户的工作台

---

## 8. 什么时候才值得抽 Rust 内核

不是“感觉 Python 不高级”时抽。

而是在出现下面信号时才值得：

1. 单机运行时的热点已经清晰落在本地 CPU 计算，而不是模型 / I/O
2. projection / lineage / checkpoint 查询开始成为大规模热路径
3. 需要高并发长期运行调度，Python 的稳定性或吞吐开始持续成为瓶颈
4. 高层 schema 已经相对稳定，不再频繁推翻
5. 已经能明确抽出边界清晰的 kernel，而不是把整个系统一起搬家

如果这些条件还没出现，就不该急着重写。

---

## 9. 不推荐的路线

### 9.1 不推荐现在整体重写成 Rust

问题不是 Rust 不好，而是：

- 会打断当前主线推进
- 会拖慢 assembly / compile / projection 的定型
- 会把“概念风险”和“重写风险”绑在一起

### 9.2 不推荐现在整体改成 TypeScript 引擎

原因是：

- 对研究和模型生态不占优
- 对长期内核可靠性也不是最强选项
- 只会把当前已成形的 Python 引擎资产重新打散

### 9.3 不推荐继续无边界地把所有逻辑都塞进 Python

继续用 Python，不等于以后什么都不分层。

从现在开始就应该按“未来可抽核”的方式设计：

- contract 清晰
- 热路径明确
- 数据结构稳定
- store / query / scheduler 边界可拆

---

## 10. 对接下来的直接建议

基于当前阶段，最合理的动作是：

1. **继续用 Python 推进 Assembly 主线**
2. **把 runtime / assembly / projection 的接口边界定清楚**
3. **对热点路径做观测，而不是凭感觉重写**
4. **把 Rust 定位成 Phase 2 的 kernel option，而不是现在的主线**

也就是说：

**先把系统做对，再把局部做快。**

---

## 11. 最终判断

`ShadowFlow` 现在继续使用 Python，是正确选择。

但这个判断不是“Python 永远最好”，而是：

- 现在：Python 最适合推进主线
- 未来：Rust 最适合承接被证明需要抽核的部分
- 周边：TypeScript 最适合做产品壳和装配工作台

所以真正的策略不是“要不要换语言”，而是：

**用 Python 把引擎主线做深，同时按 Rust kernel 的未来可能性去设计边界。**
