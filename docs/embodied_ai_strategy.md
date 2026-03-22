# 🛸 Shadow 具身智能体系：从数字记忆到物理执行

## 1. 体系架构：大脑、记忆、神经与躯体

这是一个完整的具身智能（Embodied AI）架构，各组件职责如下：

*   **Shadow (知识中枢与记忆管理员 - The Memory)**: 
    - 核心定位：文档智能助手 & 机器人记忆中枢。
    - 核心职责：管理用户知识库及机器人历史交互/环境记忆，提供执行所需的上下文。
*   **AgentGraph (智能编排引擎 - The Brain)**: 
    - 核心定位：基于 LangGraph 的逻辑决策中心。
    - 核心职责：将自然语言意图拆解为动作序列，利用 LangGraph 实现“执行-反馈-自愈”的逻辑闭环。
*   **ShadowClaw (物理执行器与技能库 - The Claw)**: 
    - 核心定位：安装在机器人上的高性能 Rust 核心。
    - 核心职责：提供原子化技能（Atomic Skills），直接操作物理硬件并反馈实时传感器状态。
*   **ai-sql-agent (逻辑进化模版 - The DNA)**: 
    - 核心定位：成熟的状态机案例。
    - 核心职责：提供复杂任务处理的模版，特别是“错误诊断-重试修正”的闭环逻辑。

---

## 2. 核心难题：自动化编排机器人工作流

“自动化搭积木”的本质是实现 **Intent -> Environment Context -> Atomic Skills -> Compiled Graph** 的映射。

### 自动化执行策略：
1.  **能力发现 (Capability Discovery)**：扫描 ShadowClaw 提供的原子技能元数据。
2.  **环境对齐 (Context Mapping)**：从 Shadow 记忆中调取当前环境的状态（如物体位置）。
3.  **动态规划 (Dynamic Planning)**：LLM Planner 生成带反馈回路的图结构，支持物理环境中的随机性与失败。
4.  **状态机执行**：通过 LangGraph 驱动执行，每一跳（Hop）都记录状态快照，支持断点续传。

---

## 3. ShadowClaw：定义“规范化原子节点”

在具身智能场景下，原子节点（积木块）必须包含物理属性和安全约束：

### 原子技能节点规范：
- **Identity**: 全局唯一 ID (如 `claw.act.pick_up`)。
- **Capability**: 节点功能的自然语言描述（供 Planner 匹配）。
- **Safety Constraints**: 物理限制、碰撞检测要求、力度上限。
- **State Interface**: 
    - **Input Schema**: 目标物、坐标、参数。
    - **Output/Feedback**: 执行状态、实时反馈数据（如抓取力矩）。

---

## 4. AgentGraph：LangGraph 的核心价值

集成 LangGraph 是实现“真智能”的关键：
- **物理自愈 (Physical Self-healing)**：动作失败时，自动触发调试节点（参考 `ai-sql-agent` 的 `debug_sql`），分析原因（如遮挡、重量超限）并调整策略重试。
- **持久化检查点 (Checkpoints)**：长任务中，机器人电量不足或网络中断后，可从检查点恢复任务。
- **多模态反馈循环**：将传感器数据（视觉、压力）实时更新进图状态（State），驱动下一步决策。

---

## 5. 执行路线图

### 第一阶段：Shadow 知识库与记忆接口化
- 建立 Shadow 的记忆提取接口，支持“场景重建”记忆。

### 第二阶段：AgentGraph 状态机重构 (基于 LangGraph)
- 设计 `EmbodiedState` 结构，支持机器人传感器数据与逻辑状态的融合。
- 开发 `LangGraphAdapter` 适配底层技能调用。

### 第三阶段：ShadowClaw 技能原子化
- 按照规范封装机器人底层的 Rust 技能，提供完整的 Metadata 描述。

---

## 6. 最终愿景：对话即操纵 (Talk to Act)

用户在 Shadow 界面的一句指令，通过 AgentGraph 的思考，驱动 ShadowClaw 在物理世界中完成一次完美的行动。所有的执行过程被 Shadow 永久记录，作为未来进化的养料。
