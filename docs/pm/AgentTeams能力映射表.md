# ShadowFlow ↔ AgentTeams 能力映射表

> 依据：赛题手册 12.2.1"协同设计基点" + `docs/architecture/loop-engine-design.md` §3/§10
> 创建：2026-08-13
> 目的：证明 ShadowFlow 不是"提到 AgentTeams"，而是真跑在 AgentTeams 基点上

---

## 映射原则

**自研 vs AgentTeams 边界**：
- **ShadowFlow 自研**：循环编排/PDCA 分形/监督/因果/治理/审计/UI/契约/Executor Registry
- **AgentTeams 基座**：单次迭代内部多 Agent 协作执行（角色编排/任务拆解/共享状态/协作事件）

**验证标准**（手册 12.2.1 五项）：
1. 角色编排 → AgentTeams Manager-Workers
2. 任务拆解 → control.loop 跨迭代 + Manager 团队内
3. 上下文传递 → IterationRecord + River Memory + Matrix 房间
4. 协同执行 → AgentTeams Workers 并行嵌套于 control.loop
5. 状态追踪 → RunRecord/StepRecord/LoopFrame + Matrix 审计

---

## 核心能力映射

### 1. 角色编排（Role Orchestration）

| ShadowFlow 概念 | AgentTeams 能力 | 映射方式 |
|---|---|---|
| PDCA 四职能（P/D/C/A） | Manager 编排 Workers | `AgentTeamsExecutor.dispatch()` → Team CR 的 `workers` 字段 |
| NodeDefinition.role | Worker 角色标签 | Team CR `workers[].role` |
| 群聊 DAG（chat-dag） | Manager 拆解任务 | `run-team-dag.ts` → Manager.task_decomposed 事件 |

**实现位置**：
- ShadowFlow：`shadowflow/runtime/executors.py:AgentTeamsExecutor`
- AgentTeams：Team CRD spec.workers

---

### 2. 任务拆解（Task Decomposition）

| ShadowFlow 概念 | AgentTeams 能力 | 映射方式 |
|---|---|---|
| control.loop 跨迭代 | 外层 loop driver | `RuntimeService._execute_loop_node()` → 每轮 dispatch 新 goal |
| 子图拆分（subgraph） | Manager 任务拆解 | `config.subgraph` → Manager 拆解为 Workers 并行任务 |
| 条件边（conditional） | Worker 选择逻辑 | `edges[].condition` → Worker 能力匹配 |

**实现位置**：
- ShadowFlow：`shadowflow/runtime/service.py:_execute_loop_node()`
- AgentTeams：Manager.task_decomposed Matrix 事件

---

### 3. 上下文传递（Context Passing）

| ShadowFlow 概念 | AgentTeams 能力 | 映射方式 |
|---|---|---|
| IterationRecord | 轮次间上下文 | `LoopRecord.iterations` → Matrix 房间消息历史 |
| River Memory | 跨迭代记忆 | `RiverMemory.drink()` → MinIO 共享文件 |
| controlled 变量 | 控制器输出 | `Controller.setpoint_nudge` → Matrix 房间实时调整 |
| artifact 交接 | 产物传递 | `ArtifactRef` → MinIO 文件引用 |

**实现位置**：
- ShadowFlow：`shadowflow/runtime/contracts.py`（IterationRecord/LoopRecord）
- ShadowFlow：`shadowflow/runtime/river_memory.py`
- AgentTeams：Matrix 房间 + MinIO 共享存储

---

### 4. 协同执行（Collaborative Execution）

| ShadowFlow 概念 | AgentTeams 能力 | 映射方式 |
|---|---|---|
| 并行扇出（parallel） | Workers 并行 | `control.parallel` → Manager 并行调度 |
| 协作事件 | Matrix 房间事件流 | `MatrixClient.room_events()` → AgentEvent 桥接 |
| 人工干预 | Human 角色接入 | Matrix 房间消息 → HumanApprovalCard |
| 实时观测 | AgentLoop 可观测 | Matrix 事件 → SSE stream |

**实现位置**：
- ShadowFlow：`shadowflow/runtime/agentteams_bridge.py:MatrixClient`
- AgentTeams：Matrix 协议（Tuwunel）

---

### 5. 状态追踪（State Tracking）

| ShadowFlow 概念 | AgentTeams 能力 | 映射方式 |
|---|---|---|
| RunRecord/StepRecord | 运行态记录 | RunRecord 写入本地 → Matrix 审计备份 |
| LoopFrame（调用栈） | 分形执行追踪 | `state["loop_frames"]` → Team CR status.subloops |
| checkpoint/resume | 中断恢复 | `CheckpointState` → AgentTeams `make replay` |
| policy_matrix 审批 | 治理决策 | Matrix 房间审批消息 → policy 拦截 |

**实现位置**：
- ShadowFlow：`shadowflow/runtime/contracts.py`（RunRecord/CheckpointState）
- ShadowFlow：`shadowflow/runtime/service.py:reject_loop_iteration()`
- AgentTeams：`make replay` CLI

---

## 架构分层图

```
┌──────────────────────────────────────────────────────────┐
│  ShadowFlow 自研层（循环引擎 + 治理 + 因果）               │
│  ┌────────────────── control.loop / PDCA ──────────────┐ │
│  │  - 迭代驱动（_execute_loop_node）                   │ │
│  │  - 分形深度边界（max_depth/depth_factor）            │ │
│  │  - Sensor/Controller 闭环（_sense/_control）        │ │
│  │  - Policy Matrix 审批（reject_loop_iteration）      │ │
│  │  - River Memory 跨迭代记忆（drink/settle）           │ │
│  └─────────────────────────────────────────────────────┘ │
│                      ↓ kind="agentteams"                  │
│  ┌────────────────── AgentTeamsExecutor ─────────────────┐│
│  │  - dispatch(): Team CR + Matrix 房间               ││
│  │  - stream_events(): Matrix → AgentEvent 桥接        ││
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                      ↓ Matrix / MinIO
┌──────────────────────────────────────────────────────────┐
│  AgentTeams 协作基座（赛题硬约束）                        │
│  ┌─────────────── Manager-Workers ───────────────────┐ │
│  │  - K8s CRD 调谐（Team/Worker/Human CRs）            │ │
│  │  - 并行协作（Workers 同步执行）                      │ │
│  │  - Matrix 房间协作（事件源）                         │ │
│  │  - Higress 网关（LLM 凭证/Skills/MCP）              │ │
│  │  - MinIO 共享文件（产物/轨迹）                       │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 端到端流程示例

**场景**：PDCA 四职能闭环

1. **P（Planner）** → `AgentTeamsExecutor.dispatch(provider="hermes")`
   - 生成 Team CR（workers: [planner, doer, checker, adjuster]）
   - 创建 Matrix 房间 `shadowflow-hermes`
   - 发送 goal 消息

2. **D（Doer）** → Manager 调度 Worker 并行执行
   - Matrix 事件：`worker.doer.message` → `AgentEvent(agent.step)`
   - Worker 产出 deliverables → MinIO 存储
   - SSE 推送到前端

3. **C（Checker）** → `_sense_with_verifier()` 评判
   - LLM 调用（BYOK）→ verifier_score
   - 结果写回 `IterationRecord`
   - 收敛信号 → Matrix 房间

4. **A（Adjuster）** → `_control(setpoint_nudge)` 调整
   - 修改 controlled 变量
   - 新 setpoint 写入 Matrix 房间
   - River Memory.settle() 沉淀成功模式

5. **Policy Gate** → 人工审批（如需要）
   - Matrix 房间消息 → HumanApprovalCard
   - 拒绝 → `reject_loop_iteration()` 回滚

---

## 验收证据

### 可验证项（无需真实环境）

| 证据 | 位置 |
|---|---|
| Team CR 生成 | `shadowflow/runtime/agentteams_bridge.py:render_team_cr()` |
| Matrix 客户端实现 | `shadowflow/runtime/agentteams_bridge.py:MatrixClient` |
| SSE 事件流 | `server/src/routes/runs.ts:streamRunEvents()` |
| checkpoint/resume | `shadowflow/runtime/service.py:reject_loop_iteration()` |
| Policy Matrix 审批 | `shadowflow/runtime/service.py:_reject_locked()` |

### 需真实环境（K8s + Matrix）

| 证据 | 方式 |
|---|---|
| Team CR apply 成功 | `kubectl get team shadowflow-*` |
| Matrix 房间创建 | Matrix Client API 响应 |
| Workers 并行执行 | Manager 日志 / Matrix 事件流 |
| `make replay` 可重放 | AgentTeams CLI 输出 |

---

## 对标 OpsPilot Zero

| 维度 | ShadowFlow | OpsPilot Zero |
|---|---|---|
| 协作基点 | AgentTeams（✅ 真实桥接） | AgentTeams |
| Agent 数量 | 4 职能（PDCA） | 7 职能 |
| Skill 数量 | 10 核心 | 4 类 |
| 治理 | Policy Matrix + 回滚 | Nacos 资源治理 |
| 闭环 | PDCA + Sensor/Controller | 单向执行 |
| 可观测 | SSE + checkpoint | AgentLoop |

**差异化**：ShadowFlow = **多 Agent 基础设施**（循环引擎 + 治理 + 因果），OpsPilot = **运维场景应用**

---

## 参考索引

- 设计文档：`docs/architecture/loop-engine-design.md` §3/§10
- AgentTeams：agentscope-ai/AgentTeams
- 赛题手册：参赛手册.pdf §12.2.1
