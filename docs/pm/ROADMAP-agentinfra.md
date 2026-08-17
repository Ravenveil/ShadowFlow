# ROADMAP — 借鉴《一切皆插件》(dsh)× AgentInfra 赛事

> 本计划的骨架就是文章本身。文章拆解了五样东西：**插件运行时、Agent Loop、事件
> 日志、工具管线、可替换能力架构**；给出的纪律是：**Agent Loop 只负责驱动，把
> 模型/工具/会话/审批做成可替换模块；项目规模小保持简单，等能力开始独立变化再
> 逐步插件化**。下面的阶段按文章章节组织，每阶段标注"启动信号"——不满足信号就
> 不做，这是文章 §12 的要求，不是客套。
>
> 用法：每阶段一个独立 prompt，复制对应小节喂给 agent；锚点与代码现实不符时停下
> 报告；完成 = 验收全绿 + `docs/EXTENSION_POINTS.md` 同步 + CHANGELOG。

## 一、先回答五个问题（计划的地基，不重复论证）

**1. 我们目前能借鉴的是什么？** 借"模式"不借"代码"：Agent Loop 最小驱动（§05）、
统一工具管线 pre-execute→guards→execute→post-execute（§08）、事件日志与
"model-visible means logged"纪律（§07）、Capability Seam 三角色（§09）。其中
Python 工作流引擎侧已落地大半（ExecutorRegistry / hook_pipeline 瀑布 / RunEvent
durable 日志 / permissions）。**阶段 0 审计（2026-08-17，
`docs/pm/GAP-dsh-alignment.md`）修正了本节最初判断**：Node 会话链的 tool_use
loop 已是纯驱动且有统一管线骨架（ConversationRuntime + ToolRunner，双路径接线），
缺口收窄为「prompt 审批只有软拒绝没有交互回路」等四项——明细见 GAP 文档 §4。

**2. 我们接入 AgentTeams 作为底座了吗？** 没有，也不应该。运行时底座 100% 自研
（Python 引擎 + Node 会话链，依赖清单无 AgentTeams/Hiclaw）。现状是**桥接+导出
层**：`agentteams_bridge.py`（Team CR 渲染 + Matrix 客户端）、`executors.py:129`
的 `AgentTeamsExecutor`（无集群 dry-run）、`agentteams_package.py`（离线代码包）。

**3. 接了 AgentTeams 还用做文章里的事吗？** 要。AgentTeams 是**赛事交付格式**，
不是我们的运行时——它管"编队怎么描述、怎么交给评委验证"，不管"我们的 Agent
Loop 长得好不好"。文章里的事是让自研底座工程化，两者并行不冲突。

**4. dsh 哪些代码能拿过来前后端用？** 直接可搬的≈0——它的核心（agent loop、event
log、tool pipeline）全部绑定 Cordis 的 Context/Service/Effect 模型，搬代码等于先
引入 Cordis（架构级决策，见阶段 5 压着）。能"抄作业"的独立小件：compaction 首尾
剪枝策略、超长结果 spill 外置、KV-cache 稳定前缀的组装纪律（§06 性能点）。

**5. 技术栈一样吗？** 前端几乎同款（React 18 + Vite + TS）；后端异构（dsh 纯
Node/TS + Cordis 单体；我们 Python FastAPI 引擎 + Node/TS 网关双进程）。所以
"拿代码"只在同构的前端层理论上可行，但 dsh 前端深度绑定其 client runtime，实际
意义也不大。

## 二、推进原则（文章 §11–§12 的纪律，写进每阶段）

- **只为会独立变化的能力建接缝**：判断三问——这项能力以后会不会换？有没有自己的
  启动/销毁时机？是否被多个模块使用？三个都不是 → 写普通函数。
- **不为每个辅助函数造插件**；不为"架构美感"提前抽象。
- **复杂度没有消失，只是搬家**：每开一个接缝，就要接受它的接口/事件/生命周期成本。
- **每阶段有启动信号**；信号没到，阶段不做。

---

## 阶段 0 — 差距审计 ✅ 已完成（2026-08-17；产出 `docs/pm/GAP-dsh-alignment.md`，阶段 1–3 已据此修订）

【对应文章】全篇五维：插件运行时 / Agent Loop / 事件日志 / 工具管线 / 可替换能力。

【背景锚点】`docs/EXTENSION_POINTS.md` 全表（🟡/⏳ 清单）；`server/src/assembler.ts`
头注释（Phase 2 Orchestration⊥Transport 决策）；`server/src/transport/dispatcher.ts`
的 `resolveCallable()`；Python 侧已落地件：`executors.py`（ExecutorRegistry）、
`hook_pipeline.py`（瀑布）、`run_event_log.py`（durable 日志）、`permissions.py`。

【目标】产出 `docs/pm/GAP-dsh-alignment.md`：**Python 引擎与 Node 会话链各一张
五行表**（行=文章五维，列=已有/部分/缺失+证据文件:行号），据此修订本计划的阶段
1–3 范围（允许删减，不允许静默扩大）。

【范围】只新增审计文档。**不动**任何运行时代码。

【验收】① 两张五维表齐全，每个"缺失/部分"有代码证据；② Node 侧 tool_use loop
的管线与审批挂点结论明确；③ 每个差距标注"赛事必答/非赛事"+ 启动信号是否已到。

---

## 阶段 1 — 审批交互回路接通 ✅ 已完成（2026-08-17；启动信号：**已到**——write-tier 工具已声明 prompt 需求，GAP §4 G1）

> 完成（2026-08-17）：`lib/tool-approval.ts`（pending 注册表，超时/中止
> fail-closed）+ `ToolRunner` prompter 路径（无 prompter 保持 v1 软拒绝）+ 双路径
> 接线（assembler 非团队分支 / executor 团队每节点，write-tier→prompt）+
> `GET/POST /api/run-sessions/:id/permissions(/:requestId)` 决策端点；请求与决策
> 均为 `permission_check` 命名事件落 run 日志可重放。测试 23+14 用例全过，
> tsc 零错误。见 CHANGELOG 2026-08-17 与 EXTENSION_POINTS 新行。

> 阶段 0 审计结论：原目标①（loop 收敛）**已完成**——`ConversationRuntime.runTurn`
> 已是纯驱动且双路径接线（`conversation-runtime-impl.ts:156-385`、
> `assembler.ts:867-905`、`workflow/executor.ts:261-301`）；原目标②③中的参数
> 校验 / guards / post-execute 结果治理信号未到，删出本阶段（GAP G2/G3/G7）。
> 本阶段只剩一件事。

【对应文章】§08 工具管线的 pre-execute 审批段；§12 最小借鉴版第 2 条（工具执行
前后留事件入口——`tool-use`/`tool-result`/`permission_check` 帧已存在，本阶段只补
决策回路，不另建事件面）。

【背景锚点】断点三处：`lib/permission-policy-v2.ts:102-107`（prompt = v1 软拒绝）、
`lib/tool-runner.ts:151-166`（`decision:'deny'`）、`routes/` 全目录无审批端点；可
复用回路模板：`assembler.ts:1341-1350` AskUserQuestion→question-form→POST→续跑；
Python 语义参照：`permissions.py`（auto|prompt|block，决策落 durable 日志）+
`approval/service.py`（pending/approve/reject）。

【目标】把 `prompt` 模式从软拒绝接成真审批回路：SSE `permission_check` 征询 →
用户经端点批准/拒绝 → runtime 挂起等待决策 → 批准则执行续跑、拒绝则落 is_error
tool_result；决策为命名事件进事件流可回放。语义与 Python 侧同名同义，不发明第二套。

【范围】限 `server/src/lib/`（tool-runner / permission-policy-v2 /
conversation-runtime-impl 的挂起等待）+ 接线处（assembler / workflow/executor 的
policy 构建）+ 审批端点（routes）。审计修正：管线实际位于 `lib/` 而非原假设的
`transport/`，此为位置修正非扩大。**不动**：Python 侧 permissions.py、skills
定义、前端组件（permission_check 帧结构除外）。外部 agent（CLI/ACP/MCP）路径的
审批介入不在本阶段（GAP G8，信号未到）。

【验收】① prompt 批准/拒绝两路单测 + 既有 deny 分支测试回归；② 审批决策事件
重放可见；③ 既有 skill E2E 回归不破；④ 白名单可见性测试（只读任务 registry
不含写工具——机制已在 `executor.ts:278-285`，补测试固化）；⑤ EXTENSION_POINTS
加行 + CHANGELOG。

---

## 阶段 2 — 统一事件命名表（阶段 0 审计后收缩；启动信号：**已到**——Python 14 durable 类型 vs Node 23 wire 事件两套语言是现存摩擦，GAP §4 G4）

> 阶段 0 审计删减：原目标②"可重建审计"——重启恢复机制与测试已在
> （`run-event-bus.ts:274-306` hydration、`run-event-bus.test.ts` O4/重放用例），
> 审计结论已并入 GAP 文档，不再立项；原目标③三件"抄作业"（首尾剪枝 + spill
> 外置 + 稳定前缀）——信号未到（GAP G3：无超长结果/成本故障记录），删除，待
> 痛点出现再议。

【对应文章】§07 Event Log——"任何能进入模型请求的内容都必须能从会话日志重建"；
§11 第四类成本"状态纪律不能偷偷把重要上下文留在内存变量里"。

【背景锚点】Python 三分法（`docs/EXTENSION_POINTS.md` 文末：durable=SQLite 可重放
/ live=RunEventBus→SSE / 瀑布=hook_pipeline）；`run_event_log.py:36-51` 的 14 个
`DURABLE_EVENT_TYPES` 与 `replay_run_summary`；Node 23 个 SSE 命名事件清单
（GAP §2 表 B）。

【目标】Node SSE 事件命名与 Python 三分法对齐成一套语言，产出**统一事件命名表**
落 docs：每个 Node wire 事件标注 durable/live 归属与 Python 对应物（或"无对应"
的显式结论）；顺带完成「model-visible means logged」Node 侧对账——逐项确认进入
LLM 请求的内容（system/prompt/history/tool schema）刷新/重启后可从事件流或
SessionRecord 恢复，不可恢复的列整改项（GAP G5 余量）。

【范围】纯文档 + 双端命名一致性测试。**不动**：run_event_log.py 既有事件类型
语义、Node 事件帧结构与事件名（命名表是登记与对账，不是改名迁移）、前端 reducer。

【验收】① 命名表入 docs 且双端一致（一致性测试）；② 前端 useRunSession 相关
测试回归（零改动通过，证明确未动帧结构）；③ EXTENSION_POINTS + CHANGELOG。

---

## 阶段 3 — 可替换能力：把会独立变化的接缝补完（启动信号：各自的独立变化需求已出现——逐一判断，不同时全开）

【对应文章】§09 Capability Seam——接口定义 / Provider 实现 / Consumer 三角色齐备
才叫可替换；§12 第 4 条"只为真正会独立变化的能力建立 Provider"。

> 本阶段 = 既有 🟡 清单的收尾 + 0G 下线，每项独立成 prompt，按信号单独排期。
> 阶段 0 审计（GAP §1 表 A）确认：3.1–3.4 信号均未到（writeback 实际只用
> host/docs、River 无真实使用、team hooks 的 Node 消费无需求、.sfplugin 无分发
> 需求），维持门控不提前；3.5 已触发照做。本阶段无新增项。

### 3.1 writeback 通道收尾（信号：宿主写回场景已实际使用 host/docs 两通道，缺通道开始挡需求）
锚点 `docs/WRITEBACK_ADAPTER_CONTRACT.md` + 已有 `host_adapter.py`/`markdown_adapter.py`；补缺失通道（预计 memory/graph；zerog 随 3.5 下线移出契约）。验收：每通道实现+单测、多通道集成测试、总表 🟡→✅。

### 3.2 River Memory 持久化（信号：跨 run 记忆开始有真实使用而非 demo）
锚点 `river_memory.py` 头注释（"durable backend 可替换而不动接口"）+ `checkpoint_store.py` 组织模式；SQLite store、接口不变。验收：重启恢复测试（settle→重启→dredge 命中）、与 InMemory 对拍、总表更新。

### 3.3 团队级 validation_hooks Node 侧（信号：团队工作流在 Node 执行成为主路径）
锚点 `server/src/workflow/validation-hook-types.ts` + Python 瀑布语义（`hook_pipeline.py` 的 pass/transform/HookRejected）；scheduler 真正消费 team 级 hooks。验收：双端 schema 一致性测试、blocker/warn/retry 三分支单测、总表 🟡→✅。

### 3.4 `.sfplugin` apply（信号：出现"无仓库访问分发扩展"的真实需求）
锚点 `plugin_package.py`（v1 validate-only，头注释写明 apply 为后续）；实现 apply-plugin：幂等、可回滚、决策落日志。验收：二次 apply 零变更、rollback 复原、provides 与内容不符拒绝。

### 3.5 0G 组件下线（信号：已触发——方向取消，2026-08-16 决定）
删除 `ZeroGCheckpointStore`、`bridge/`、`@0glabs/*` 及仅服务 0G 的 ethers/hardhat 依赖、`vite.config.ts` ZgFile stub 与 `src/_stubs/`、`.0g-skills/`、契约 zerog 通道、`upload_sfagent_to_zerog` + upload 端点；checkpoint 留 InMemory/SQLite 两实现，`.sfagent` 离线导出不动。验收：全库 grep `0g|zerog` 零残留（node_modules/CHANGELOG 除外）、前端 build+测试过、pytest 过、CHANGELOG 记 breaking。

---

## 阶段 4（B 线）— 赛事合规：AgentTeams 闭环（不属 dsh 借鉴，按赛事日历倒排，与阶段 1–3 并行、互不阻塞）

【背景锚点】`agentteams_bridge.py` 头注释（gated behind `AGENTTEAMS_CONTROLLER_URL`
+ `MATRIX_HOMESERVER`）；`executors.py:129-190`；`agentteams_package.py`；赛事硬
要求：≥3 职能 Agent + 附录 A Identity 清单 + 复赛"可执行代码包"。

【目标】① `scripts/devops/agentteams/` 本地 kind 集群 + controller + Matrix(Tuwunel)
一键部署/拆除 + 文档；② AgentTeamsExecutor 非 dry-run 全链路（CR apply → room 派发
→ 回执入 RunEvent）；③ `export-agentteams` 离线包与附录 A 对齐（先从参赛手册 PDF
提取附录 A 落 `docs/pm/appendix-a-identity.md`），产出五要素映射表
`docs/pm/agentteams-mapping.md`（角色编排/任务拆解/上下文传递/协同执行/状态追踪 →
框架能力）。

【范围】改 bridge/executor/package + 脚本文档。**不动** loop_engine、前端。

【验收】① 环境可重复部署可拆除；② `requires_cluster` marker 测试（无集群 skip、
有集群过）；③ demo workflow 事件日志可见派发与回执；④ 无 env 时 dry-run 行为不变
（回归）；⑤ 导出包 ≥3 workers、Identity 完整、run.sh 离线校验过、翻译确定性不破。

---

## 阶段 5 — 插件运行时（Cordis 或自研轻量版）：**压着不动**

【对应文章】§03 五概念 / §04 Profile 与 Bundle / §10 五收益 —— 同时对照 §11 五类
成本（概念/配置/边界/状态纪律/性能）。

【启动信号】（文章 §12 的清单，出现两条以上再启动）：同一任务要支持多模型多环境
且更换频繁；.sfplugin 要求热应用；多租户能力隔离；新功能上线总要改那段不敢动的
主循环。**入口**：3.4 的 apply 机制 + 阶段 0 的差距结论。在此之前，`ExecutorRegistry
+ preset YAML + .sfplugin` 就是我们"够用且诚实"的插件化程度。

---

## 排序建议

阶段 0 ✅（2026-08-17）→ 阶段 1 ✅（2026-08-17，审批回路）→ 阶段 2（命名表，纯文档；
信号已独立到位，可开始）；阶段 3 各项按信号穿插；
阶段 4 按赛事日历与主线并行，勿互相阻塞；阶段 5 压着。若复赛交期临近，4 插队优先
——那是硬门槛，其余是"新增能力时还需不需要打开心脏"（文章结语）的长期账。
