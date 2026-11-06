# EVENT_NAMING — 双端事件命名统一表（阶段 2 产出）

> 产出日期：2026-08-17。对应 `docs/pm/ROADMAP-agentinfra.md` 阶段 2（GAP-dsh-alignment
> G4/G5）。**规则：任何一端新增/改名事件必须同步本表**——一致性测试
> `server/src/lib/__tests__/event-naming.test.ts` 扫描代码发射点与本表对账，
> 未登记即红（与 EXTENSION_POINTS.md 同款 guard）。
>
> 管辖范围：Node run-session 链的 wire 事件（runBus → `GET /:id/stream`）；群聊现场页
> （groups-chat B2/B3）复用 `message`/`message-patch` 帧，同表管辖。transport 层
> spawner 内部队列事件（`delta`/`end`，`transport/spawners/*.ts`）不上面：它们是
> TurnChunk 的原料，不直接上 wire。

## 0. 三分法 × Node 持久化模型（对齐的前提）

Python 三分法（`docs/EXTENSION_POINTS.md` 事件三分法节）：
**durable**（14 类落 SQLite，`/runs/{id}/event-log` 可读、投影可重放）/
**live**（`RunEventBus`→SSE，环形 1000，内存即可）/**瀑布**（hook_pipeline，
pass/transform/HookRejected）。

Node 差异（如实记录，不改代码）：runBus **没有 durable 子集概念**——整个事件缓冲
（≤2000）经 `run-event-store.ts` 防抖快照落盘、重启 hydrate，持久化是"整 run 快照"
而非"按类型"。因此本表对 Node 事件的归属判定采用**语义二分**：

- **事实帧（fact）**：承载"进入过模型现场/决策现场"的内容。丢失即破坏
  「model-visible means logged」不变式，驱逐策略必须最后牺牲它们。
- **观察帧（observation）**：可再生/仅展示用途。丢了可由重放其它帧或重新组装恢复
  （如 `status_line`——`run-event-bus.ts:365-388` 的驱逐策略已按此语义优先驱逐它）。

两套语言的对齐方向：Node 事实帧 ≈ Python durable 语义；Node 观察帧 ≈ Python live
语义；Python 瀑布在 Node 无对应物（团队级 hooks 未接，GAP G7/ROADMAP 3.3）。

## 1. 主表 — Node wire 事件 × Python 对应物

| Node 事件 | 发射处 | 语义 | 事实/观察 | Python 对应物 |
|---|---|---|---|---|
| `message` | timeline-projector / run-sessions | 会话时间线投影（kind 子表见 §3） | 事实（内容 kind）/观察（status_line 等） | 无统一对应；`agent.output`/`agent.thinking`（live）近似 |
| `message-patch` | timeline-projector | 时间线消息补丁（流式更新） | 观察 | 无对应 |
| `assemble` | assembler.ts | 组装阶段进度 | 观察 | 无对应 |
| `assembly-meta` | assembler.ts | 组装元信息（ask_workspace 等） | 观察 | 无对应 |
| `agent-persona` | parser.ts | 蓝图 agent 人格卡 | 观察 | 无对应 |
| `agent-substep` | parser.ts | agent 子步骤 | 观察 | 无对应 |
| `classify` | assembler.ts / parser.ts | 意图分类 | 观察 | 无对应 |
| `discovery` | parser.ts:484 | 发现卡 | 观察 | 无对应 |
| `node` | parser.ts | 蓝图节点卡 | 观察 | `node.started/completed/failed`（durable）部分对应（生命周期有、卡片内容无） |
| `edge` | parser.ts | 蓝图边 | 观察 | 无对应 |
| `complete` | parser.ts | 蓝图完成 | 观察 | `run.completed`（durable）部分对应 |
| `blueprint` | assembler.ts pipeChunksToSse | 蓝图 JSON 卡 | 观察 | 无对应 |
| `yaml-line` | assembler.ts pipeChunksToSse | 蓝图行流 | 观察 | 无对应 |
| `text` | parser.ts / assembler.ts | 正文文本帧 | **事实** | `agent.output`（live） |
| `raw` | parser.ts | 未识别内容兜底 | 观察 | 无对应 |
| `unknown-tag` | parser.ts | 未识别 `<sf:*>` 标签（诊断） | 观察 | 无对应 |
| `thinking-chunk` | assembler.ts | 思考流（display-only，不回填 history） | 观察 | `agent.thinking`（live） |
| `tool-use` | assembler.ts / ApiClientCallable | 工具调用 chip（含 permission_check 的 chunk 侧通道） | **事实** | `agent.tool_called`（live） |
| `tool-result` | assembler.ts | 工具结果 | **事实** | `agent.tool_result`（live） |
| `usage` | assembler.ts | token 用量 | 事实（计费/成本对账） | 无对应（Python usage 不作事件） |
| `error` | assembler.ts / runBus 合成帧 | 错误帧（含重启中断合成帧） | **事实** | `run.failed`/`node.failed`（durable） |
| `aborted` | run-sessions.ts（bus emit） | 用户中止 | **事实** | `run.cancelled`（durable） |
| `retry-pending` | run-sessions.ts（bus emit） | 步骤重试挂起 | 观察 | 无对应 |
| `resume-pending` | run-sessions.ts（bus emit） | 会话恢复挂起 | 观察 | `run.resumed`（live）部分对应 |
| `loop` | run-sessions.ts（loop-watcher emit） | 迭代环差分快照（control.loop 节点的 loop 记录数组；{status, iteration_count, converged} 变化才发。2026-08-19 导航架构统一批：迭代环并入右栏「过程」tab，本帧为其实时通道） | 观察 | 无统一对应（Python `GET /runs/:id/loops` 投影轮询的推流化） |
| `policy` | run-sessions.ts:2888 | 策略提示 | 观察 | `policy.violation`/`policy.updated`（live） |
| `question-form` | assembler.ts:1151 / parser.ts:398 | AskUserQuestion 交互表单 | **事实**（等待用户输入） | 无对应（Python 审批走 REST+SSE，见 `permission_check`） |
| `permission_check` | tool-approval.ts / tool-runner.ts（经 bus） | 工具审批请求与决策（decision: pending/approve/deny；decided_by: user/timeout/abort） | **事实**（决策现场） | `permission.checked`/`permission.blocked`（durable）。语义映射：decision=approve → `permission.checked`；deny/timeout/abort → `permission.blocked` |
| `team-saved` | team-persistence.ts / assembler.ts | 团队蓝本落库回执（带 PersistedTeam：team + agents 已写库，前端据此换成本地 id） | **事实**（落库回执） | 无对应（Python 团队落库走 REST 返回值，不发事件） |

## 2. 反向表 — Python durable 14 类 → Node 对应

| Python durable（run_event_log.py:36-51） | Node 对应 | 判定 |
|---|---|---|
| `run.started` | 无事件帧（run 创建=claimStart，隐式） | 显式无对应 |
| `run.completed` | `complete`（部分）+ 流自然关闭 | 部分对应 |
| `run.failed` / `run.cancelled` | `error` / `aborted` | 对应 |
| `node.started` / `node.completed` / `node.failed` | `node` 卡片 + 带 node_id 的 `error`；无逐节点生命周期帧 | 部分对应 |
| `checkpoint.saved` | 无 | 显式无对应（Node 无 checkpoint 概念） |
| `loop.iteration` / `loop.completed` / `loop.halt_requested` / `task.ledger` | 无 | 显式无对应（循环属 Python 引擎职责划分，GAP §1 表 A） |
| `permission.checked` / `permission.blocked` | `permission_check`（decision 字段区分） | 对应（§1 映射） |

Python live `agent.*` 命名空间（`events.py` AgentEventType：dispatched/thinking/
tool_called/tool_result/completed/failed/rejected/output/degraded/approval_requested）
与 Node 对应关系见 §1 各行"事实"帧；`agent.approval_requested` 在 Node 由
`permission_check`（pending 帧）承载。

## 3. 子表 — `message` 帧 kind（timeline-projector）

事实 kind（内容，驱逐最后牺牲）：`user_turn`、`assistant_text`、`tool_call`、`tool_echo`。
观察 kind（展示/可再生）：`assistant_meta`、`msg_foot`、`status_line`（驱逐优先，
`run-event-bus.ts:365-388`）、`thinking`、`raw`、`artifact_card`、`plan_card`、
`commit_record`、`diff_panel`、`file_diff`、`image_panel`、`table_panel`、`step_panel`、
`verdict_card`、`web_preview`。

## 4. model-visible means logged — Node 侧对账（GAP G5 余量）

不变式（EXTENSION_POINTS.md 不变式 1，Python 由 `replay_run_summary` 证明）：
凡进入 LLM 请求的内容必须可从事件日志重建。Node 逐项对账：

| 进入 LLM 请求的内容 | 恢复路径 | 判定 |
|---|---|---|
| 用户消息/目标 | `message`(user_turn) 帧 + 会话 JSON（session-store） | ✅ 双路可恢复 |
| 助手回复/工具调用/工具结果 | `text`/`tool-use`/`tool-result` 帧 + `SessionRecord.messages` | ✅ 双路可恢复 |
| system prompt | 仅可从 skill 定义 + 工作区文件重新推导；事件流无记录 | ❌ **整改候选 R1** |
| 工具白名单与 schema | 事件流只记录"被调用的"（tool-use），不记录"被提供的"清单 | ❌ **整改候选 R2** |
| thinking 增量 | 展示专用、刻意不回填模型输入（conversation-runtime-impl.ts P1） | 不在不变式范围（设计如此） |

R1/R2 为**登记不实现**的整改项：当前无"重放历史 run 的精确模型请求"的真实需求
（信号未到）；若做，落点分别是 `assembly-meta` 帧扩字段（R1，附 system 摘要）与
组装期一次性 registry 快照帧（R2）。出现需求再立项，不在阶段 2 扩范围。

## 5. 维护纪律

1. **一致性测试**：`server/src/lib/__tests__/event-naming.test.ts` 扫描生产发射点
   （`event: 'x'` 对象式 + `.emit(id, 'x',` 直发式）↔ 本表 §1 ↔ Python
   `DURABLE_EVENT_TYPES` ↔ `message` kind 子表。四者任一漂移即测试红。
2. 新增 Node wire 事件的流程：先加本表行（含事实/观察判定与 Python 对应结论，
   没有对应就写"无对应"），再动代码——顺序与 EXTENSION_POINTS 的 guard 相同。
3. 本表不改任何事件名：阶段 2 是登记与对账（ROADMAP 修订版范围），不是改名迁移。
