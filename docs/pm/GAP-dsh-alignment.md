# GAP — dsh《一切皆插件》五维对齐审计（ROADMAP 阶段 0 产出）

> 产出日期：2026-08-17。对应 `docs/pm/ROADMAP-agentinfra.md` 阶段 0。
> 方法：行=文章五维（插件运行时 / Agent Loop / 事件日志 / 工具管线 / 可替换能力），
> 对 Python 引擎（`shadowflow/runtime/`）与 Node 会话链（`server/src/`）各做一张表，
> 每格给"已有/部分/缺失"判定 + 代码证据（文件:行号）。只审计，不改运行时代码。
>
> **审计推翻了 ROADMAP 阶段 1 的前提**：Node 侧并非"没有统一管线"——`ToolRunner`
> （注册表→权限门→执行）与 `ConversationRuntime`（纯驱动 loop）已于 Round 4 PR-D
> 落地且双路径接线。真正的缺口收窄为：**审批只有软拒绝没有交互回路**、**工具 schema
> 宽松**、**结果无治理**、**双端事件语言未对齐**。

## 0. 三句话结论

1. **Python 引擎**五维中四维"已有"（插件运行时/Agent Loop(工作流形态)/事件日志/可替换能力），
   工具管线"部分"（审批+post-execute 验证齐，pre-execute 参数校验弱、结果治理缺）。
2. **Node 会话链**的 tool_use loop 已收敛为纯驱动、已有统一工具管线骨架
   （`ToolRunner`：注册表检查→权限门→执行）；**唯一实质缺口是 `prompt` 审批模式
   退化为 deny，没有用户批准回路**（`routes/` 无审批端点）。
3. 阶段 1–3 据此**删减**：阶段 1 从"建管线+收敛 loop"缩为"接通审批回路（单点）"；
   阶段 2 删掉已完成的重启恢复与信号未到的 spill/剪枝，只留事件命名表；
   阶段 3 维持信号门控不变（修订明细见 §5，已回写 ROADMAP）。

---

## 1. 表 A — Python 引擎（shadowflow/runtime/）

| 五维 | 判定 | 证据（文件:行号） | 缺口 |
|---|---|---|---|
| **插件运行时** | 🟡 部分 | `executors.py:684` `ExecutorRegistry` + `:704-706` 注册即开放 schema 校验（`register_executor_kind`）；`provider_presets.yaml` 零代码接入 CLI agent（EXTENSION_POINTS.md:10 ✅）；`loop_engine.py:169` `register_loop_preset` / `SF_LOOP_PRESETS` YAML（:137）；`plugin_package.py:1-19` `.sfplugin` v1 **validate-only** | `.sfplugin` apply（安装/合并）未实现——EXTENSION_POINTS.md:36 🟡。**非赛事必答**；启动信号未到（无"无仓库访问分发扩展"的真实需求，ROADMAP 3.4 门控维持）。 |
| **Agent Loop** | ✅ 已有（形态=工作流循环） | `loop_engine.py:263` `LoopBodyPlan`（循环体=主 DAG 子图）、`:169-199` preset 展开、迭代边界 halt（EXTENSION_POINTS.md:20）、task.ledger 账本（:32） | 文章的 Agent Loop 指 LLM tool_use 驱动循环；Python 引擎**设计上不做**这件事（LLM 单次调用=节点执行器，tool_use loop 是 Node 会话链与各 CLI agent 内部的职责）。职责划分而非缺口。**赛事必答项是 PDCA 闭环演示**——已就绪（GOAI 8/15 计划 M2 🟢）。 |
| **事件日志** | ✅ 已有 | `run_event_log.py:36-51` `DURABLE_EVENT_TYPES`（14 类）；`:68` `replay_run_summary`（可重放投影=「model-visible means logged」不变式的证明，EXTENSION_POINTS.md:48）；`:167` `SqliteRunEventLog` + `:271` `SqliteRunStore`；三分法（durable/live/瀑布）成文于 EXTENSION_POINTS.md:40-44 | 无实质缺口。live 事件（RunEventBus→SSE）与 durable 的边界已有纪律约束。**赛事相关**（运行证据/回放演示），已满足。 |
| **工具管线** | 🟡 部分 | **pre-execute 审批已有**：`permissions.py:34` `auto\|prompt\|block` 三态，`:82-99` 决策落 durable 日志（`permission.checked`/`permission.blocked`），`prompt` 复用 approval_gate（:1-24 头注释）；审批后端齐：`approval/service.py:137` pending 列表 / `:194` approve / `:250` reject（真驳回链），REST 层 `shadowflow/api/approvals.py`，ACP 桥 `approval/bridge.py:14`。**post-execute 验证已有**：`hook_pipeline.py:43` `WaterfallPipeline`（pass/transform/`HookRejected` :31，on_fail=blocker/warn/retry），`:92` `register_builtin_validator`，`:136-171` `ValidationHookRunner` | ① 工具/执行器入参的 schema 校验只在注册期（kind schema），运行期 dispatch 前无逐参校验；② 结果治理（超长截断/spill 外置）缺失；③ 跨工具 guards 无（policy_matrix 是图级治理）。①②③ 均**非赛事必答**；启动信号未到（无相关故障记录）。审批+验证两段对赛事"治理矩阵/人在环"演示已够用。 |
| **可替换能力** | ✅ 已有 | 接口/实现/消费者三角色齐：`checkpoint_store.py:31` `BaseCheckpointStore`（InMemory :45 / SQLite :87 / 0G :184 待随 3.5 下线）；`executors.py:198` `AgentExecutor` ABC 四通道（Cli :231 / Acp :420 / Mcp :514）；`:997` `ApiExecutor` provider 可换（zhipu/openai/anthropic 兼容网关）；`:1228` `RagExecutor`；verifier BYOK（EXTENSION_POINTS.md:16） | 三个 🟡 按 ROADMAP 阶段 3 信号门控：writeback 通道缺 memory/graph（EXTENSION_POINTS.md:26）、River Memory 仅 InMemory（:29）、team 级 hooks Node 侧未消费（:28）。**非赛事必答**。 |

## 2. 表 B — Node 会话链（server/src/）

| 五维 | 判定 | 证据（文件:行号） | 缺口 |
|---|---|---|---|
| **插件运行时** | ❌ 缺失 | 无任何插件分发机制。新传输通道=改代码：`transport/dispatcher.ts:38-43` 硬编码五前缀语法（`cli:/acp:/mcp:/byok:/anthropic-direct`）+ `api-clients/` 新类；skill 是仓内编译（`lib/skill-compiler/`），不经外部包 | **非赛事必答**；启动信号未到（对应 ROADMAP 阶段 5 压着不动——`.sfplugin` apply 是 Python 侧 3.4 的事，Node 接入更远）。 |
| **Agent Loop** | ✅ 已有（已是纯驱动） | `lib/conversation-runtime-impl.ts:156-385` `runTurn`：组装(system+history+toolSpecs)→stream→收集 tool_use→`toolRunner.dispatch`→回填 tool_result→无 pending 即 break；能力一律从 ToolRunner 进，loop 内无权限/工具逻辑。双路径接线：非团队组装分支 `assembler.ts:867-905`，团队每节点 `workflow/executor.ts:261-301`。CLI/ACP/MCP 传输自带 loop（`assembler.ts:855-857` 注释明示，外部 agent 内部循环，不经我们） | 无。"loop 收敛"（原阶段 1 目标①）**已达成**，本轮审计确认后从阶段 1 删除。 |
| **事件日志** | 🟡 部分（机制全，纪律缺） | 机制：`lib/run-event-bus.ts:24-30` 单调编号事件 + `:162-168` emit/attach 可重连重放（Last-Event-ID cursor）；`:274-306` 重启 hydrate + 中断合成 error 帧；`:356-401` emit 含 status_line 优先驱逐；`lib/run-event-store.ts:53-104` 磁盘快照（防抖+原子写）；`lib/session-store.ts:1-23` 会话 JSON 恢复。测试：`lib/__tests__/run-event-bus.test.ts`（重放/O4 懒恢复）。命名事件 23 个（grep `run-sessions.ts`/`timeline-projector.ts`/`assembler.ts`/`parser.ts`：assemble/error/node/thinking-chunk/edge/complete/classify/blueprint/yaml-line/text/agent-substep/agent-persona/usage/unknown-tag/raw/question-form/message/assembly-meta/tool-use/tool-result/policy/message-patch/discovery） | ① 与 Python 三分法对齐的**统一事件命名表**不存在（EXTENSION_POINTS.md 只登记 Python 侧；Node 23 事件无 durable/live 归属判定，双端语义重叠处如 `node.started` vs `node`/`agent-substep` 各说各话）；② "进入 LLM 请求的内容皆可重建"未做过系统审计（机制上 messages 落 SessionRecord、事件可重放，但无对账）。**均非赛事必答**（Demo 刷新/重连恢复已工作）；①信号已到（双端两套语言是现存摩擦），②已由本审计部分完成、余量并入①。 |
| **工具管线** | 🟡 部分（骨架有，三处缺） | `lib/tool-runner.ts:99-212` `ToolRunner.dispatch` 单一入口：注册表检查(:129-138)→权限门(:141-173)→executor 查找(:178-187)→abort(:190-196)→执行+错误包装(:200-210)；`lib/permission-policy-v2.ts:111-139` `authorize` 三态；`lib/tool-spec.ts:57` `ToolRegistry`（base/conditional、last-write-wins）；builtin 工具 10 个（`lib/tools/builtin/`：read/write/edit-file、shell-exec、fetch-url、web-search、glob/grep/list-dir、read-skill） | ① **审批无交互回路**（最大缺口，专项结论见 §3）：`prompt` 模式=软拒绝（`permission-policy-v2.ts:102-107` "v1 = treated as deny"；`tool-runner.ts:151-166` `decision:'deny'`），`permission_check` 仅以 tool-use 芯片帧透出（`conversation-runtime-impl.ts:315-324`→`assembler.ts:1325-1340`），`routes/` 全目录无 approve/审批端点（grep 仅命中 lib 层）；② 参数校验缺：注册处宽松 schema `{type:'object',properties:{}}`（`assembler.ts:880-889`、`workflow/executor.ts:278-285`，真 schema 只有 read_skill），dispatch 无逐参校验；③ post-execute 结果治理缺：`outputToString` 直接 stringify（`conversation-runtime-impl.ts:104-106`），无截断/spill/改写。CLI/ACP/MCP 路径完全不经 ToolRunner（自带 loop，Node 无任何审批挂点，`AcpCallable.ts` 零 permission 处理）。①**信号已到**（write-tier 工具已声明 prompt 需求：`permission-policy.ts:6-9`），非赛事必答（赛事人在环演示走 Python approval_gate 即可）；②③信号未到，非赛事必答。 |
| **可替换能力** | ✅ 已有 | 三角色齐：接口 `transport/LlmCallable.ts:127-139`（一方法一流一信号）；Provider=4 实现（ApiClient/Cli/Acp/McpCallable）+ 15 ApiClient 工厂（`ApiClientCallable.ts:81-101`）+ BYOK（`byokKey.ts`）；消费者（assembler/scheduler）只认 `turn()`，`dispatcher.ts:79-169` `resolveCallable()` 单一工厂，Orchestration 不感知后端（`assembler.ts:11-21` Phase 2 头注释） | 无实质缺口。`capabilities` 仅信息性是设计决策（LlmCallable.ts:36-40）。 |

## 3. 专项结论：Node tool_use loop 的管线与审批挂点（验收②）

**管线现状**：自研 ApiClient 路径上，tool_use loop（`ConversationRuntime.runTurn`）与
工具管线（`ToolRunner.dispatch`）已经分离且双向接线（组装分支 + 团队每节点），
形态与文章 §05/§08 的"驱动⊥能力"一致——文章五段式中的"参数校验、guards、
post-execute 治理"三段缺，"审批"段有挂点但只有半条命。

**审批挂点结论（明确版）**：
- **语义挂点存在**：`PermissionPolicyV2` 已定义 `allow|deny|prompt`，与 Python
  `permissions.py` 的 `auto|prompt|block` 同名近义（allow↔auto），deny/block 均落
  `is_error` tool_result 且 loop 续跑——这部分语义已对齐。
- **交互回路断裂**：`prompt` 在 Node 侧被编译期注定的 v1 行为软拒绝（"treated as
  deny"），没有"暂停→征询→用户 POST 决定→续跑/终止"的通路。Python 侧对照物完整：
  `approval/service.py` pending/approve/reject + SSE + 决策落 durable 事件。
- **可复用的既有回路**：`askUserQuestionToFormEvent`（`assembler.ts:1341-1350`）已经
  实现"工具调用→question-form 模态→用户作答 POST→会话续跑"的完整人在环——审批回路
  可以照抄这条通路（permission_check 帧 + 决策端点 + runtime 等待），无需发明新机制。
- **外部 agent 路径无挂点**（如实记录）：CLI/ACP/MCP 传输的 tool loop 在子进程/外部
  agent 内部，Node 侧对其无审批介入（`AcpCallable.ts` 无 requestPermission 处理）。
  Python 侧有 `AcpApprovalBridge` 桥接 ACP 权限请求；Node 侧如需等效能力属于新增
  范围，本轮不排（信号未到）。

## 4. 差距总清单（含赛事/信号标注）

| # | 差距 | 侧 | 赛事必答? | 启动信号 |
|---|---|---|---|---|
| G1 | `prompt` 审批无交互回路（软拒绝） | Node | 非赛事（人在环演示走 Python approval_gate） | **已到**（write_file/edit_file 声明 prompt 需求，permission-policy.ts:6-9；回路模板 question-form 已存在）→ **已解决（2026-08-17，阶段 1 落地，见 ROADMAP/CHANGELOG）** |
| G2 | 工具 input schema 校验缺（宽松 schema） | Node | 非赛事 | 未到（无幻觉参数故障记录） |
| G3 | post-execute 结果治理（截断/spill）缺 | 双侧 | 非赛事 | 未到（无超长结果故障/成本记录） |
| G4 | 统一事件命名表（双端三分法对齐）缺 | 双侧 | 非赛事（Demo 重连恢复已工作） | **已到**（双端 14 durable vs 23 wire 两套语言是现存摩擦；纯文档活）→ **已解决（2026-08-17，阶段 2 落地：docs/EVENT_NAMING.md + 四向一致性测试；实数 27 事件）** |
| G5 | "model-visible means logged" Node 侧系统审计 | Node | 非赛事 | 部分完成 → **已完成对账（2026-08-17，EVENT_NAMING §4）：内容帧双路可恢复；system prompt 与工具白名单登记为整改候选 R1/R2（信号未到不实现）** |
| G6 | `.sfplugin` apply | Python | 非赛事 | 未到（ROADMAP 3.4 门控） |
| G7 | guards 跨工具策略（路径/参数级） | 双侧 | 非赛事 | 未到 |
| G8 | CLI/ACP/MCP 外部 loop 的审批介入 | Node | 非赛事 | 未到（Python AcpApprovalBridge 可作参照，需要时再议） |
| G9 | 插件运行时（Node 侧分发机制） | Node | 非赛事 | 未到（阶段 5 压着） |

赛事红线（GOAI 复赛 9.3：可执行 AgentTeams 代码包 + 可运行 Demo + 运行证据，
见 `docs/pm/GOAI开发计划-分模块-2026-08-15.md:3`）**不依赖上表任何一项**；
G1/G4 是工程化收益，按信号穿插，不与阶段 4（赛事 B 线）争抢窗口。

## 5. 阶段 1–3 范围修订指令（已回写 ROADMAP-agentinfra.md）

- **阶段 1**：原目标①（loop 收敛）已完成→删除；原目标②③收缩为**单点：接通 prompt
  审批交互回路**（复用 question-form 通路模式 + Python 审批语义；schema 校验/guards/
  结果治理按 G2/G3/G7 信号未到删出本阶段）。范围锚点从 `transport/` 修正为
  `lib/`（tool-runner/permission-policy-v2/conversation-runtime-impl）+ 接线处
  （assembler/executor/routes）——这是位置修正非扩大。
- **阶段 2**：删目标②（重启恢复——run-event-bus hydration+测试已在）与目标③
  （剪枝/spill/稳定前缀——G3 信号未到）；只留目标①统一事件命名表（G4，信号已到，
  含 G5 余量）。验收相应收缩。
- **阶段 3**：结构与信号门控维持；按本审计确认 3.1–3.4 信号均未到、3.5 已触发，
  无新增项。
