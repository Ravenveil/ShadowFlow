# agentteams-mapping — 赛题五要素 × 框架能力映射表（阶段 4③ 产出）

> 依据：参赛手册 §8.1（多 Agent 设计必须以 AgentTeams 作为协同设计基点，说明
> 角色编排、任务拆解、上下文传递、协同执行与状态追踪如何映射到该框架能力）+
> §8.3 八步闭环。产出：2026-08-17（ROADMAP-agentinfra 阶段 4③）。
>
> **与 `AgentTeams能力映射表.md` 的分工**：那张表是 Neo 前端 UI↔端点接通状态；
> 本表是赛题评审视角的五要素/闭环 ↔ 框架能力映射，二者互补不重复。
>
> **三层事实（诚实声明）**：① 自研运行时（Python 引擎 + Node 会话链）是执行
> 底座；② AgentTeams 是赛事交付格式（Team CR + 集群编队 + Matrix 事件），
> 不是我们的运行时依赖；③ 离线代码包与 live spec 字节同构——两者共用
> `render_team_cr`（`agentteams_package.py:26` 头注释明示"the offline package
> IS the live spec, minus the cluster"）。live 全链路（CR apply → room 派发 →
> 回执入 RunEvent）已实现但 gated behind env（`executors.py:129-190`），本地
> docker/kind 不可用，集群联调待环境窗口。

## 1. 五要素主表（§8.1）

| 赛题要素 | 手册要求 | ShadowFlow 运行时机制（证据） | AgentTeams 交付映射 |
|---|---|---|---|
| **角色编排** | ≥3 个不同职能 Agent、清晰身份定义 | TeamDef/DAG 角色 + Policy Matrix 治理（`policy_matrix.py` 编译警告+运行期驳回→回滚）；身份八字段清单 `docs/pm/附录A-AgentIdentity.md`（PDCA 四职能 + Human，与手册附录 A 模板逐字段对齐） | `team-cr.yaml` `workers[].role`（`agentteams_bridge.py:render_team_cr`；DAG→Team spec 确定性翻译 `agentteams_package.py:translate_dag_to_team`） |
| **任务拆解** | 主控 Agent 或协同框架拆分任务 | 确定性 recipe 拆解（`server/src/assembly/select.ts` + rules 出口闸门）+ PDCA 循环拆解（`loop_engine.py:LoopBodyPlan` 循环体=主 DAG 子图，setpoint 收敛判据） | Team task `{goal_template, success_criteria(setpoint), iteration_budget}`（翻译器 `control.loop` → team task） |
| **上下文传递** | 任务上下文/历史/工具结果/中间结论传递 | **Artifact handoff**（Phase 2 决策 A2：跨 Agent 经工作区文件交接而非聊天记录，`workflow/executor.ts` 头注释 + `NodeContext.workspace`）+ ACP 会话谱系 `_meta.shadowflow`（run/node/agent + loopId/iteration/depth，`acp/messages.py:NewSessionRequest`） | Matrix room 事件流 = 团队协作枢纽（`agentteams_bridge.py:MatrixClient` create_room/send_message，`executors.py:172-178`） |
| **协同执行** | Agent 间协作完成端到端闭环 | DAG 分层调度（`workflow/scheduler.ts` runDag 层序推进 + 条件边跳过）+ 真并发 `control.parallel` gather（`service.py:_execute_parallel_gather`，EXTENSION_POINTS:19）+ 双端审批回路（Python approval_gate + Node `permission_check`，阶段 1） | `workers[].parallel` 标记（翻译器）；Matrix 派发 `dispatched_event`（`executors.py:179-186`） |
| **状态追踪** | 过程可记录、回放、审计 | Python durable 14 类事件 + `replay_run_summary` 可重放投影 + checkpoint + `task.ledger` 每轮账本（`run_event_log.py:36-51`）；Node runBus 27 wire 事件单调编号 + 重连重放 + 磁盘快照重启恢复（双端统一命名表 `docs/EVENT_NAMING.md`） | 派发/回执均落 RunEvent 事件日志（AgentTeamsExecutor 返回值携带 `team_cr`/`matrix_room`/`dispatched_event` 证据字段）；导出包含 `workflow.json` 原始 DAG 供对账 |

## 2. 八步闭环对照（§8.3）

| # | 手册闭环步骤 | ShadowFlow 对应机制 |
|---|---|---|
| 1 | 任务输入 | HTTP `POST /workflow/run`（告警/工单/日志文本皆可为 input）+ Neo 会话链 `POST /api/run-sessions/:id/messages` |
| 2 | 任务拆解 | recipe 确定性拆解 / PDCA `LoopBodyPlan` / AgentTeams team task（§1 第 2 行） |
| 3 | 上下文传递 | artifact handoff + ACP 谱系（§1 第 3 行） |
| 4 | 工具调用 | `ExecutorRegistry` 六类执行器（cli/acp/mcp/api/rag/agentteams，`executors.py:684`）+ Node `ToolRunner` 管线（权限门→执行） |
| 5 | 结果验证 | LLM-as-Verifier BYOK 评分收敛 + threshold/trajectory sensor（`service.py:_sense_with_verifier`）+ 团队级 validation_hooks（🟡 信号门控，ROADMAP 3.3） |
| 6 | 执行证据沉淀 | durable 事件日志（run/node 生命周期 + checkpoint + task.ledger）+ trajectory bundle + `.sfagent` 离线导出（`agent_bundle.py`）；Node runBus 快照 + `docs/competition/run-evidence/` |
| 7 | 审批与回滚 | Python `permissions.py` auto\|prompt\|block + approval REST/SSE 真驳回链（`approval/service.py`）+ 迭代级 reject/回滚（policy matrix）；Node `permission_check` 人在环回路（阶段 1） |
| 8 | 经验沉淀 | River Memory settle/dredge（跨 run 记忆，🟡 InMemory，持久化信号门控 ROADMAP 3.2）+ SEED-lite 成功模式沉淀入 `IterationRecord.evidence` |

## 3. 交付件对账（复赛"可执行代码包"）

| 手册要求 | 交付物 | 状态 |
|---|---|---|
| 可执行 AgentTeams 代码包 | `export-agentteams` CLI / `POST /workflow/export/agentteams`：team-cr.yaml + manifest.json + workflow.json + run.sh + README.md（`agentteams_package.py:build_package_files`） | ✅ 离线可产、翻译确定性有测试 |
| ≥3 职能 Agent | PDCA 四职能 + Human（附录 A 清单 ≥5） | ✅ |
| Agent Identity 清单 | `docs/pm/附录A-AgentIdentity.md`（手册附录 A 模板 8 字段逐项对齐 + 手册原文溯源） | ✅ |
| 可运行 Demo | knowledge-grounded-loop demo + verifier live 证据（`docs/competition/run-evidence/2026-08-15-verifier-live.md`） | ✅（live 演示待 key 额度，见 GOAI 计划） |
| 集群 live 全链路 | CR apply → Matrix 派发 → 回执入 RunEvent（`executors.py` 非 dry-run 路径代码已备） | ⏳ 环境阻塞（本机无 docker/kind；无 env 时 dry-run 回归不破） |

## 4. 环境阻塞记录（2026-08-17）

阶段 4①（kind 集群 + controller + Matrix 一键部署脚本）与 ②（非 dry-run live
联调验收）在本机不可执行：`docker`/`kind` 不在 PATH。脚本编写与"可重复部署可
拆除"验收需要 Docker Desktop + kind + Tuwunel 镜像拉取窗口，留给环境可用时
一次完成（对应 GOAI 开发计划 M1③"留到有环境窗口"的既有决策）。③ 的全部
离线交付物本轮已完成。
