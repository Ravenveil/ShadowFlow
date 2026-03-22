# AgentGraph Phase 1 主战役规划草稿

> 日期：2026-03-22
> 状态：Draft
> 目的：明确 AgentGraph 作为独立项目的边界、成立标准、第一阶段主战役与后续 Shadow 集成接口

---

## 1. 当前判断

AgentGraph 适合以“独立项目预备主战役”的方式启动，但不适合直接进入大规模自动化实现。

原因不是方向不对，而是当前项目呈现出明显的“三层错位”：

1. 愿景和设计文档已经很大。
2. Python 核心运行时已经有可用雏形。
3. 前端/Tauri 壳、规划器、记忆模型、Shadow 关联叙事仍处于并行生长、尚未收敛。

因此第一阶段不应追求“把全部设想做出来”，而应先把 AgentGraph 收敛成一个可以独立成立的最小编排运行时。

---

## 2. AgentGraph 的独立定位

AgentGraph 在当前阶段的最合理定位是：

**一个面向多智能体任务编排的独立 runtime / schema / adapter 项目。**

它当前应负责：

- 定义 workflow schema
- 提供 graph execution runtime
- 提供 agent / node / router / memory 的基础抽象
- 提供 CLI / HTTP API 两个统一入口
- 提供 checkpoint / trace / step 级结果结构

它当前不负责：

- 直接成为 Shadow 的完整工作台
- 吞掉 Shadow 的知识底座、图谱、产品 UI、长期状态系统
- 一次性解决机器人、OpenClaw、统一图数据库、全域外在大脑

---

## 3. 项目成立标准

AgentGraph 第一阶段做到以下几点，才算“独立成立”：

1. 同一份 workflow schema 能被 CLI 和 HTTP API 一致消费。
2. 运行时可以稳定执行串行、条件分支、基础并行三类图节点。
3. 每次 run 都能产出结构化 `run -> step -> output -> trace` 结果。
4. checkpoint / memory / trace 的最小契约固定下来。
5. Shadow 不需要理解 AgentGraph 内部实现，只需要通过契约调用它。

---

## 4. 第一阶段主战役

第一阶段主战役建议命名为：

**Runtime Contract Campaign**

主目标不是“功能最多”，而是“把 AgentGraph 收敛成一个可被外部系统稳定调用的独立编排 runtime”。

### 4.1 战役范围

- 收敛 Python runtime 的核心对象：
  - `Workflow`
  - `Node/Agent`
  - `Edge`
  - `Run`
  - `Step`
  - `Checkpoint`
- 固定统一请求/响应 schema
- 打通 CLI 与 FastAPI 的同构执行路径
- 明确 Router、Memory、Planner 中哪些是核心、哪些是扩展
- 提供 2-3 个可信示例 workflow

### 4.2 战役成功标志

- Shadow 或其他外部宿主可以把 AgentGraph 当作“黑盒编排引擎”调用
- 示例 workflow 可重复运行
- 返回结果结构稳定，可被集成层消费
- 文档能明确说清“什么是现在支持的，什么是以后再做的”

---

## 5. 第一阶段最小可交付

### MVP

1. `workflow.json|yaml` 的 canonical schema
2. Python runtime 能稳定执行：
   - 顺序节点
   - 条件分支
   - 基础 loop 或有限重试
3. 统一 `RunResult`
   - `run_id`
   - `status`
   - `final_output`
   - `steps[]`
   - `artifacts[]`
   - `trace[]`
4. CLI：
   - `agentgraph validate`
   - `agentgraph run`
5. HTTP API：
   - `POST /workflow/validate`
   - `POST /workflow/run`
   - `GET /runs/{id}`
6. 最小 checkpoint 接口
7. 2 个端到端样例：
   - docs-gap / review loop
   - multi-agent research / review

---

## 6. 第一阶段理想可交付

### Ideal

- 基础并行节点与 barrier 节点
- 可恢复 run
- 事件流或 step streaming
- 可插拔 memory adapter
- Shadow-ready adapter schema
- 最小 benchmark 与测试矩阵
- “LangGraph adapter / native executor” 的清晰边界说明

---

## 7. 当前明确不做

为防止边界失控，第一阶段明确不做：

- 不做 Shadow 全量知识底座迁移
- 不做统一图谱 substrate
- 不做完整可视化工作台定型
- 不做机器人/物理设备主线
- 不做 marketplace / agent hub / 全生态扩张
- 不把 Planner、Memory、UI、Runtime 同时打成一个巨型产品

---

## 8. 文档归属

### 应沉淀在 AgentGraph 的主文档

- 项目定位与非目标
- runtime contract
- workflow schema
- execution model
- checkpoint / trace / artifact schema
- adapter boundary
- Shadow integration contract
- phase roadmap

### 只保留在 Shadow 的文档

- Shadow 为什么需要 AgentGraph
- Shadow 如何调用 AgentGraph
- Shadow 内部哪些对象映射到 AgentGraph run/step/artifact
- 集成风险、降级策略、写回路径

---

## 9. 与 Shadow 的后续集成点

最自然的集成点不是 UI 层，而是运行时契约层：

1. Shadow 产生任务意图、上下文、domain profile。
2. Shadow 将其编译为 AgentGraph workflow request。
3. AgentGraph 执行并返回结构化 run/step/artifact/trace。
4. Shadow 将结果写回自己的 memory space / unified graph / status docs。

建议接口形态：

- `WorkflowDefinition`
- `RuntimeRequest`
- `RunResult`
- `StepEvent`
- `ArtifactRef`
- `CheckpointRef`

---

## 10. 风险清单

### 当前最大风险

1. 文档愿景远大于运行时收敛度。
2. Python runtime、前端编辑器、Tauri 壳存在双线并行。
3. HTTP API 与核心 graph 接口已有不一致迹象。
4. 测试状态显示前端侧仍未收敛到可稳定维护。

### 控制策略

1. 先冻结第一阶段 runtime contract。
2. 将 Planner、Memory、UI 都降级为“围绕 runtime 的配套模块”。
3. Shadow 只按契约集成，不按内部实现耦合。

---

## 11. 下一步建议

1. 先补一份 `AgentGraph Core Charter`，明确范围与非目标。
2. 再补一份 `Runtime Contract Spec`，固定请求/响应与 checkpoint schema。
3. 之后再开自动化，围绕第一阶段主战役推进。

只有在这两份核心文档收敛后，AgentGraph 才适合正式进入“独立主战役自动化”。
