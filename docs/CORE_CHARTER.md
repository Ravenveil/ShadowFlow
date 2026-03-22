# AgentGraph Core Charter

> 版本：0.1
> 日期：2026-03-22
> 状态：Draft
> 适用阶段：Phase 1 / Runtime Contract Campaign

---

## 1. 文档目的

本文件用于定义 AgentGraph 作为独立项目的核心定位、边界、成立标准、阶段目标与治理原则。

它回答的不是“怎么实现所有设想”，而是下面四个更基础的问题：

1. AgentGraph 现在到底是什么。
2. AgentGraph 现在不是什么。
3. 做到什么程度，才算独立成立。
4. Phase 1 应该集中打哪一场主战役。

---

## 2. 项目定义

AgentGraph 当前阶段的正式定义是：

**一个面向多智能体任务编排的独立 runtime / schema / adapter 项目。**

AgentGraph 的核心职责是：

- 定义 workflow schema
- 提供 graph execution runtime
- 提供 agent / node / edge / router / memory / checkpoint 的基础抽象
- 提供 CLI 与 HTTP API 两个统一入口
- 输出可被外部宿主系统消费的结构化 run / step / trace / artifact 结果

AgentGraph 的直接服务对象包括：

- 独立使用的开发者
- 上层产品宿主
- 需要图编排能力的外部系统

当前最直接的外部宿主参考对象是 Shadow，但 AgentGraph 不以 Shadow 私有实现为前提成立。

---

## 3. 核心定位

### 3.1 AgentGraph 是什么

AgentGraph 是：

- 图编排运行时
- 多智能体执行契约层
- workflow schema 的权威定义者
- 外部宿主与编排内核之间的适配边界

### 3.2 AgentGraph 不是什么

AgentGraph 当前不是：

- Shadow 的完整产品工作台
- 统一知识图底座
- 全域长期记忆主脑
- 机器人控制平台
- 一次性打包 UI、memory、planner、graph substrate、agent marketplace 的总产品

---

## 4. 设计原则

### 4.1 先收敛 runtime，再扩张叙事

所有新能力都应先回答：

“它是否让 AgentGraph 更接近一个稳定的独立编排 runtime？”

如果答案是否定的，则不应进入当前主线。

### 4.2 先冻结契约，再推进自动化

在请求、响应、step、checkpoint、artifact 的契约未固定前，不进入大规模自动化实现。

### 4.3 对外黑盒，对内可演进

对外要提供稳定接口；对内可以继续重构 executor、router、memory、planner 的实现。

### 4.4 AgentGraph 与宿主解耦

AgentGraph 不依赖某个特定前端、数据库或知识系统才能成立。

### 4.5 文档归属清晰

凡是关于 AgentGraph 自身定位、schema、runtime、contract、phase roadmap 的内容，都应优先沉淀在 AgentGraph 项目内。

---

## 5. 范围边界

### 5.1 当前阶段必须负责

- canonical workflow definition
- execution model
- run lifecycle
- step result model
- trace / artifact / checkpoint contract
- CLI / HTTP API 同构入口
- 最小 adapter 边界

### 5.2 当前阶段可选负责

- planner 作为 workflow generation 配套模块
- memory adapter 作为 runtime 配套模块
- minimal web editor 作为演示或辅助工具

### 5.3 当前阶段明确不负责

- 统一图谱 substrate
- Shadow 的 docs-gap-verify-writeback 闭环主脑
- 完整产品工作台定型
- 机器人/物理执行主线
- 生态市场与平台化扩张

---

## 6. 独立成立标准

当且仅当满足下面条件时，AgentGraph 才算在当前阶段“独立成立”：

1. 同一份 workflow schema 能被 CLI 和 HTTP API 一致消费。
2. runtime 能稳定执行顺序、条件分支、有限循环/重试这三类基础控制流。
3. 每次 run 都能返回结构化 `run -> step -> final_output -> trace -> artifacts`。
4. checkpoint / memory / trace 的最小契约已经固定。
5. 外部宿主不需要理解 AgentGraph 内部实现，只需要按 contract 调用。
6. 至少有 2 个可重复执行的端到端样例。

---

## 7. 当前状态判断

当前项目状态可总结为：

- 愿景文档较丰富
- Python runtime 已有雏形
- 前端/Tauri 壳存在
- 但各部分尚未收敛为单一核心主线

当前最关键的问题不是“能力太少”，而是“主线不够收口”。

因此当前阶段最重要的工作不是继续横向加功能，而是把 AgentGraph 收敛成一个边界清晰、接口稳定的独立 runtime。

---

## 8. Phase 1 主战役

Phase 1 的正式主战役名称为：

**Runtime Contract Campaign**

### 8.1 主目标

将 AgentGraph 收敛成一个可被外部系统稳定调用的独立编排 runtime。

### 8.2 核心产物

- runtime contract
- canonical workflow schema
- unified run result model
- CLI / HTTP API 同构入口
- checkpoint 最小模型
- Shadow-ready adapter boundary

### 8.3 成功标志

- AgentGraph 可以被当作“黑盒编排引擎”调用
- 示例 workflow 稳定可运行
- 文档可以清晰区分“已支持 / 未支持 / 延后再做”

---

## 9. Phase 1 最小可交付

### MVP

1. `workflow.json|yaml` 的 canonical schema
2. 稳定的 graph runtime
3. 统一 `RunResult`
4. `agentgraph validate`
5. `agentgraph run`
6. `POST /workflow/validate`
7. `POST /workflow/run`
8. `GET /runs/{id}`
9. 最小 checkpoint 接口
10. 两个端到端示例 workflow

---

## 10. 当前明确不做

为了防止边界失控，Phase 1 明确不做：

- 不做 Shadow 全量集成
- 不做 unified graph substrate
- 不做固定形态的产品工作台
- 不做机器人路线主战役
- 不做 marketplace / agent hub
- 不把 planner、memory、UI、runtime 同时扩成一个巨型平台

---

## 11. 与 Shadow 的关系

AgentGraph 与 Shadow 的关系应定义为：

**独立编排 runtime 与产品宿主的关系。**

AgentGraph 负责：

- 编排
- 执行
- checkpoint / trace / artifact contract

Shadow 负责：

- docs 真源
- gap / verification / writeback 闭环
- memory space 与 unified graph substrate
- 工作台与用户界面

集成原则是：

- 对齐契约
- 不做整机搬运
- 不让 AgentGraph 成为 Shadow 的第二个主脑

---

## 12. 文档治理

### 12.1 AgentGraph 主文档应包含

- Core Charter
- Runtime Contract Spec
- Workflow Schema
- Execution Model
- Adapter Boundary
- Phase Roadmap

### 12.2 Shadow 侧只保留

- 集成动机
- 集成方式
- 写回路径
- 风险与降级策略

---

## 13. 决策准则

后续判断某项工作是否应该进入 AgentGraph Phase 1，可使用以下问题：

1. 它是否直接提升 runtime contract 的清晰度或稳定性？
2. 它是否让 CLI / HTTP API / adapter 更接近同构？
3. 它是否让外部宿主更容易把 AgentGraph 当黑盒调用？
4. 如果现在不做，会不会阻塞独立成立？

如果四个问题都不能得到明确的“是”，则该工作默认延后。

---

## 14. 下一步

在本 Charter 之后，Phase 1 的下一份权威文档应为：

- `RUNTIME_CONTRACT_SPEC.md`

后续所有实现和自动化，都应优先与这两份文档保持一致。
