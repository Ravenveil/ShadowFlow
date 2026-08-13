# Agent Identity 清单（赛题附录 A）

> 依据：`docs/architecture/loop-engine-design.md` 附录 B
> 创建：2026-08-13
> 范围：ShadowFlow 循环引擎 PDCA 四职能 Agent

---

## 模板定义

| 字段 | 说明 |
|---|---|
| Name | Agent 唯一标识符 |
| Role | 在团队中的角色定位 |
| Capabilities | 能力清单（能做什么） |
| Inputs | 输入数据格式/来源 |
| Outputs | 输出数据格式/去向 |
| Dependencies | 依赖的其他 Agent/外部服务 |
| Decision Boundary | 自主决策边界（什么情况需人工干预） |
| Trace | 可追溯性（如何记录决策过程） |

---

## PDCA 四职能 Agent

### P - Planner（规划者）

| 字段 | 值 |
|---|---|
| **Name** | `planning.loop_planner` |
| **Role** | 设定 setpoint（收敛判据）+ 拆解迭代目标 |
| **Capabilities** | - 目标分解（goal → subgoals）<br>- setpoint 制定（metric + op + value）<br>- 迭代预算规划（iteration_budget） |
| **Inputs** | - 上轮 `IterationRecord`（含 evidence + controlled）<br>- River Memory 召回的历史成功模式（SEED-lite） |
| **Outputs** | - plan（本轮执行方案）<br>- setpoint（收敛判据）<br>- iteration_budget（本轮预算） |
| **Dependencies** | - River Memory（跨迭代记忆）<br>- Human（高风险审批） |
| **Decision Boundary** | 自主拆解任务，以下情况需人工审批：<br>- iteration_budget > 50<br>- setpoint.metric 为非技术指标（如成本） |
| **Trace** | - 每轮 plan 写入 `IterationRecord.evidence["plan"]`<br>- setpoint 变更记录在 `IterationRecord.evidence["setpoint_delta"]` |

---

### D - Doer（执行者）

| 字段 | 值 |
|---|---|
| **Name** | `execution.doer` |
| **Role** | 执行产出（按 plan 生成 deliverables） |
| **Capabilities** | - 代码生成/执行（provider: hermes/codex）<br>- 工具调用（11 个内置工具）<br>- AgentTeams 协作派发 |
| **Inputs** | - 本轮 plan（来自 P）<br>- controlled 变量（来自 A 的控制器）<br>- 工作区文件系统（workspace_dir） |
| **Outputs** | - deliverables（代码产物/文档）<br>- metrics（质量指标：测试通过率/覆盖率等） |
| **Dependencies** | - LLM provider（claude/hermes/codex）<br>- AgentTeams（多 Agent 并行）<br>- 文件系统（workspace_dir） |
| **Decision Boundary** | 自主执行，以下情况需人工审批：<br>- PR review 失败（policy_gate: deny）<br>- 工具调用失败 > 3 次 |
| **Trace** | - 所有工具调用记录在 `StepRecord.tool_calls`<br>- 产出 artifacts 写入 `ArtifactRef` |

---

### C - Checker（检查者）

| 字段 | 值 |
|---|---|
| **Name** | `verification.checker` |
| **Role** | LLM-as-Verifier 评判 + 收敛检测 |
| **Capabilities** | - LLM-as-a-Verifier 概率评分（verifier_score）<br>- 轨迹分类（converging/oscillating/diverging）<br>- 阈值判定（setpoint op value） |
| **Inputs** | - 本轮 deliverables（来自 D）<br>- setpoint（来自 P）<br>- metric_history（历史指标序列） |
| **Outputs** | - verifier_score（0-1 连续分数）<br>- converged（布尔判定）<br>- classification（轨迹类别） |
| **Dependencies** | - LLM provider（用于 Verifier 评分）<br>- 时序存储（River Memory Zep 层） |
| **Decision Boundary** | 自主评分，以下情况 halt 并人工介入：<br>- diverged 持续 > 5 轮<br>- verifier_score < 0.3 且置信度 > 0.8 |
| **Trace** | - 评分理由写入 `IterationRecord.evidence["verifier_reasoning"]`<br>- 轨迹分类写入 `IterationRecord.evidence["classification"]` |

---

### A - Adjuster（调整者）

| 字段 | 值 |
|---|---|
| **Name** | `control.adjuster` |
| **Role** | SEED 技能提取 + 调 setpoint（控制反馈） |
| **Capabilities** | - setpoint_nudge（按速率逼近目标）<br>- memory_nudge（从 River Memory 召回模式）<br>- settle（成功模式沉淀为技能） |
| **Inputs** | - C 的 evidence + verifier_score<br>- 轮次编号（iteration_index）<br>- 当前 controlled 变量 |
| **Outputs** | - 新 setpoint（调整后的收敛判据）<br>- controlled（下轮受控变量）<br>- 沉淀技能（写入 River Memory） |
| **Dependencies** | - River Memory（技能沉淀/召回）<br>- Human（换目标审批） |
| **Decision Boundary** | 自主微调，以下情况需人工审批：<br>- 换目标（setpoint.metric 改变）<br>- iteration_budget 暴涨（> 当前 2 倍） |
| **Trace** | - controlled 变更写入 `IterationRecord.evidence["controlled"]`<br>- 沉淀技能写入 `RiverMemory.settle()` |

---

## 其他核心 Agent

### Human（人工干预 Agent）

| 字段 | 值 |
|---|---|
| **Name** | `human.intervention` |
| **Role** | 审批/回滚/人工决策 |
| **Capabilities** | - Policy Matrix 审批（allow/warn/deny）<br>- 迭代级 reject（reject_loop_iteration）<br>- Matrix 房间实时干预 |
| **Inputs** | - 审批请求（approval_event）<br>- policy_matrix（治理矩阵）<br>- 当前 run 状态 |
| **Outputs** | - allow/reject 决策<br>- rollback 指令<br>- 迭代重定向 |
| **Dependencies** | - Policy Matrix<br>- Matrix（房间事件流） |
| **Decision Boundary** | 所有决策由人工做出 |
| **Trace** | - 审批记录写入 `CheckpointRef.approval_chain`<br>- Matrix 消息可回放 |

---

## Provider 映射

| Agent | 推荐 Provider | 备选 Provider |
|---|---|---|
| P | `agentteams:hermes` | `api:claude` |
| D | `agentteams:hermes` | `cli:codex` |
| C | `api:claude` | `api:openai` |
| A | `agentteams:openclaw` | `api:anthropic` |

---

## 参考索引

- 设计文档：`docs/architecture/loop-engine-design.md`
- 契约定义：`shadowflow/runtime/contracts.py`
- 执行引擎：`shadowflow/runtime/service.py`
- PDCA 模板：`docs/architecture/loop-engine-design.md` 附录 A
