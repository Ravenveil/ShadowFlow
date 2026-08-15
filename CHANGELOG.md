# Changelog

All notable changes to ShadowFlow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] — 2026-08-15（下午第二轮 · Polynoia 对标：单聊编排 → 分阶段派发 → 群聊现场）

### Added — Polynoia 式多 Agent 协作闭环（后端执行能力 + 群聊现场页）
- **WorktreeManager（`server/src/lib/worktree-manager.ts`）**：Polynoia「每 agent
  一分支一 worktree → 干完 merge --no-ff → 冲突标 needs-manual」的隔离闭环。
  `prepareWorktree`（回合起始 reset --hard + clean -fd）/ `commitWorktree`
  （agent 身份作 author，干净树零提交）/ `integrateAll`（专用 integration
  worktree 上并分支，绝不碰用户检出分支；冲突收集 `--diff-filter=U` 后 abort）。
  全防御式：非 git 仓库 / 超时 → null，绝不 throw。
- **INTENT_PARSE 编排拆解器（`server/src/lib/orchestrator-parse.ts`）**：群 DAG
  派发前用 BYOK LLM 把用户消息拆成 per-agent 子任务 prompt（严格 JSON，
  容围栏/杂文/未知 agent）；无 key / 解析失败 → 降级为原文分发，零回归。
- **群聊 team DAG 路径接线（`groups-chat.ts` runFanout）**：
  - 扇出前 `computeDagLayers` 分层 → **plan_card**（层号=并行批次，任务标题
    来自拆解结果）经 gateway run 下发；callAgent 包装层实时发 `plan_update_task`
    （running/done/failed + 耗时）。
  - callAgent 的 workspace 换成该 agent 专属 worktree；干完即 `commitWorktree`
    → **commit_record + file_diff** 证据卡（git-introspect 复用）。
  - DAG 收尾 `integrateAll` → 合并 commit_record / 多分支「回合合并结果」
    table_panel / 冲突表格卡 + 系统消息（needs-manual）。用户插话取消的回合
    不合并。串行降级路径同样注入 worktree（不发卡）。
- **群聊现场页 `/group/:groupId`（`src/neo/NeoGroupChat.tsx`）**：复用
  useGroupTimeline（B2 统一读路径 + 群 SSE + 活跃 run 订阅）+ 完整 Timeline
  渲染器——agents 干活现场的全部富内联卡（plan/commit/diff/table/preview）。
  NeoRail 新增「群聊现场」区（群列表行）；NeoChat 顶栏经 B1 互链反查加
  「群聊现场」跳转。单聊说话 → 编排拆解 → 群里看现场的全链路打通。
- **OpenCode 适配**：`cli-registry.ts` 新增 opencode 描述符（`run` 子命令 +
  stdin 消息 + plain-line 解析，检测/生成路径自动获得；本机实测已检出）；
  `provider_presets.yaml` 新增 opencode 预设（Python CliAgentExecutor 侧）。
- 端到端验证：git 仓库群 + 双 agent 团队消息 → timeline 实测含 plan_card
  （batch 1/2，done+耗时）/ 2×agent 回复 / 2×merge commit_record / 合并结果
  table；磁盘三 worktree（integration + 2 agent）+ 三分支（agent/*/…、
  sf/run/…），用户 master 检出未动。

### Fixed
- **`timeline-replay.ts` 服务端 applyPatch 缺 `plan_update_task` 分支**（存量
  缺口）：群时间线 REST 重放时 plan 卡任务状态被静默丢弃、刷新后退回 pending。
- `AppRoutes.test.tsx` 两条断言过期（Neo 重构已下架 /chat、/agent-dm 路由，
  断言仍找已删除页面的 testid）→ 改为断言重定向行为 + 新增 /group 路由用例。

### Added — 前一轮（2026-08-15 上午 · Polynoia 富内联消息渲染）
- **TimelineMessage 8 种新 kind**（前后端契约同步）：plan_card / commit_record /
  file_diff / table_panel / image_panel / web_preview / artifact_card /
  verdict_card + `plan_update_task` patch；投影器配套发射器
  （timeline-projector.ts onPlanCard 等 9 个）。
- **run-sessions 路径接线**：团队组装的 node 帧 → plan_card + 实时任务状态；
  blueprint → artifact_card（html 加 web_preview）；critique → verdict_card
  （5 维评分 + lint 摘要）；**git-introspect.ts**（git log/diff 优雅降级）在
  run 收尾产出 commit_record / file_diff / 变更统计 table。
- **消息编辑（「聊天里看还能编辑」）**：PATCH /api/run-sessions/:id/messages
  （经 O3 timeline back-trace 定位会话行，edited_at 列运行时迁移）+
  AssistantText 行内编辑 UI + useRunSession.editMessage。
- **Neo 中栏接入完整 Timeline 渲染器**（variant="neo" = chat 观感 + 外层滚动），
  替换原纯文本渲染——12+ 种内联渲染类型直接进 Neo 聊天。
- 测试：projector 富卡 / git-introspect（真实临时 git 仓库）/ 前端 richCards
  组件 + applyPatch 共 38 例新增全绿；run-sessions 冒烟实测 plan_card×1 +
  plan_update_task×30 + artifact_card×1 帧下发。

## [Unreleased] — 2026-08-15

### Added — 一键开发启动（对标 dsh web）
- `npm run dev`（`dev:all` 为别名）→ `scripts/dev.mjs` 统一启动器：拉起 Python
  uvicorn（:8000）+ Node 网关（:8002）+ Vite（:3007），三服务 HTTP 就绪探测通过后
  自动开浏览器；启动前端口占用预检；任一进程退出/Ctrl+C 即整树收摊——Windows 下
  以 PPID 后代清点 + netstat 端口反查双兜底，不留 `uvicorn --reload` 断链孤儿；
  Python 解释器自动探测（`SF_PYTHON` > 仓库 `.venv` > 系统 `python`）。

### Added — Loop Engine v2（DAG-native，对标 deepseek-harness 调研 P1–P5 落地）
- **循环体 = 主 DAG 子图**：`control.loop` 体节点间存在边时按图遍历（条件边/回边，`config.entry`
  可指定入口）；无边时保持 v1 线性顺序（存量兼容）；`shadowflow/runtime/loop_engine.py` 从
  service.py 抽出独立引擎模块。
- **Sensor/Controller 图节点化**：新节点类型 `control.sensor` / `control.controller` 可直接
  摆进循环体 DAG（verifier BYOK 语义不变）；显式节点取代引擎内嵌 C/A 阶段。
- **开放循环模板注册表**：`register_loop_preset()` / `SF_LOOP_PRESETS` YAML / 内置示例
  （pdca、ooda、generate_evaluate，均标注 example）——PDCA 从引擎形态降级为示例实例。
- **Durable RunEvent 日志（P1）**：append-only 事件流（run/node/checkpoint/loop 生命周期）
  落 SQLite（`shadowflow/runtime/run_event_log.py`），新增 `GET /runs/{id}/event-log`；
  `replay_run_summary` 证明"投影可从事件流重建"。
- **运行状态持久化**：`SqliteRunStore`/`SqliteRequestContextStore`/`SqliteCheckpointStore`
  单库（`SF_RUNTIME_STATE_DB`，默认 `.shadowflow/runtime.sqlite`）接入 server 装配——
  **进程重启后 runs 六投影不再 404**。
- **Executor kind 开放注册（P2）**：`ExecutorRegistry.register()` 自动开放 schema 校验
  （`register_executor_kind`），新 kind 不再需要改 contracts.py 白名单。
- **Validation hooks 瀑布语义（P3/N1 Python 侧）**：`shadowflow/runtime/hook_pipeline.py`
  （WaterfallPipeline + shell/webhook/builtin runner，on_fail=blocker/warn/retry），
  节点级 `config.validation_hooks[]` 内联接入执行管线。
- **control.parallel 真并发（GOAI M2）**：`config.execution="gather"` 时所有分支
  asyncio.gather 并发执行、单分支失败不拖垮兄弟分支；默认保持交错调度（checkpoint 语义优先）。
- **Live loop halt（GOAI）**：`POST /runs/{id}/loops/{loop_id}/halt` 从 placeholder 变为
  真实信号（迭代边界消费，`*` 通配挂起整 run 下一个循环）。
- **.sfagent bundle（GOAI M9）**：`agent_bundle.py` + CLI `export-sfagent` +
  `POST /workflow/export/sfagent`——identity（附录A）+ skills（附录B）+ 轨迹证据 +
  确定性 sha256 content id；上传/0G CID 为后续项。
- **文档工程（P4）**：新增 `docs/EXTENSION_POINTS.md` 扩展点总表（改扩展点必须更新）；
  `docs/DESIGN.md` 标注 SUPERSEDED；`loop-engine-design.md` 增补 §8。

### Added — 前期积压（2026-05-09 → 2026-08-15 摘要，详见 git log）
- Loop Engine v1（PDCA 分形/watch/Sensor-Controller/迭代级 reject/SEED-lite/River）与
  runs 六投影端点（8/13）；Neo UI chat-first 重构（8/13）；AgentTeams 离线代码包导出 +
  K 采样 Verifier + knowledge-grounded demo（8/15）；Verifier BYOK 化 + 智谱 GLM 通道 +
  真实 LLM 端到端收敛验证（8/15，`docs/competition/run-evidence/`）。

### Added — 第二轮（2026-08-15 下午，调研采纳清单落地）
- **权限三分法（采纳#3）**：`shadowflow/runtime/permissions.py` — auto/prompt/block 三态；
  node 级 `config.permissions` 或 workflow `defaults.permissions`；prompt 复用审批注册表
  （/api/approvals 可批准/驳回），全部决策落 durable 事件（permission.checked/blocked）。
- **ACP `_meta.shadowflow` 谱系（采纳#2）**：session/new 的保留 `_meta` 扩展 run/node/agent +
  loopId/iteration/depth/parentLoopId（循环体内派发时注入），Hermes provenance 惯例。
- **Task ledger 事件化（采纳#4）**：循环每轮自动 `task.ledger` durable 事件
  （goal/target/done/current/actuated），`replay_run_summary` 重建账本视图。
- **diagnostics 传感器（采纳#1）**：`control.sensor` 新 type=diagnostics（LSP 风格证据源），
  统计 body 输出的 diagnostics 数组（可 include=errors），issue ≤ target 即收敛。
- **M9 收尾**：`.sfagent` import（CLI `import-sfagent` + `POST /workflow/sfagent/import` 写入
  agent store）与 upload（`POST /workflow/sfagent/upload`，配 SHADOWFLOW_BRIDGE_URL 时经
  0G KV bridge 上传返回 CID，否则本地 sha256 content id）。
- **`.sfplugin` 插件包格式 v1（采纳#5）**：manifest + provider_presets/ + loop_presets.yaml；
  `validate-plugin` CLI 校验器（apply 待格式稳定）。
- **PDCA 显式 DAG demo**：`examples/runtime-contract/pdca-dag-demo.json` —— plan/do/check/act
  全部是图节点（check=control.sensor、act=control.controller），body_mode=dag 两轮收敛。

### Fixed — 存量测试清理（60 个失败全清零，套件 36f/20e → 0f/0e 于相关簇）
- 生产 bug：`SqliteRunStore.list_runs` 返回 dict 但调用方按对象访问 → `GET /runs` 500（改回
  RunSummary 契约 + 补列迁移）；`GET /runs/{id}/graph` 误调 export_workflow_graph 且套
  envelope → 改为 export_run_graph 扁平结构（对齐 src/api/runs.ts 契约），其余 5 个投影端点
  同步去 envelope。
- 测试侧：a2a_bridge 导入顺序污染（fixture monkeypatch 模块常量）；teams API 两文件缺
  agent store seed（照抄 test_teams_api 模式）+ 工作流负载引用不存在的节点/非成员 agent；
  workspaces 断言已移除的 AC6 自动建默认工作区旧行为；builder 空串被 Pydantic min_length
  先拦（断言改原生格式）；README 双语重写丢失 AGENT_PLUGIN_CONTRACT 链接（补回）。

### Fixed
- `_sense` verifier 分支返回未 await 协程的 live 路径 bug（2026-08-15，随 zhipu 通道提交）。

## [1.1.0] — 2026-05-09

### Added
- **RunSession pipeline** — goal-to-team-assembly with live SSE streaming (`RunSessionPage`, `useRunSession`, `src/api/runSessions.ts`)
  - POST `/api/run-sessions` creates a session and starts background assembly
  - GET `/api/run-sessions/{id}/stream` streams `classify → assemble → node/edge → blueprint → complete` events
  - Replay buffer so late-joining clients see full history
- **QuickSwitcher** (`⌘K` / `Ctrl+K`) — fuzzy navigation overlay with keyboard-driven item selection
- **FastAPI router** `shadowflow/api/run_session.py` — SSE backend with in-memory session store, mock fallback when IntentRouter unavailable
- **IntentRouter** `shadowflow/runtime/intent_router.py` — keyword-based goal classification (answer/report/review/workflow)
- **Vite proxy** — `/api` proxied to `http://localhost:8002` with SSE `cache-control: no-cache` passthrough; dev server moved to port 3007
- **Platform-aware kbd shortcut** on StartPage — shows `⌘ ⏎` on macOS and `Ctrl ⏎` on Windows/Linux

### Fixed
- Pre-existing test suite failures: 15 test files now receive `I18nProvider` context via `src/test/utils.tsx` custom render wrapper; `beforeAll` switches i18next to `zh`
- `PolicyHeatmap` color assertions updated to match CSS variable implementation
- `MessageItem` pending-approvals badge assertion updated after emoji → lucide icon migration
- `NarrowNav` label assertions updated to current i18n keys (`Inbox`, `关于`)
- `TeamPage` error text assertion updated to `/加载失败/`
- `AgentDMPage` multi-element `getByText` changed to `getAllByText`

### Security
- `goal` field capped at 2000 characters via Pydantic `Field(max_length=2000)` to prevent oversized payloads
- YAML injection in blueprint description: newlines stripped from goal text before interpolation
- Error messages sanitized — internal exception detail no longer sent to SSE clients
- `asyncio.create_task` reference stored in session dict to prevent premature GC

### Changed
- `getApiBase()` fallback changed from `http://localhost:8000` to `''` (empty string) — relative URLs are now used so Vite proxy handles routing in dev; production requires `VITE_API_BASE` or same-origin backend
- `navigator.platform` replaced with `navigator.userAgent` (platform is deprecated)
- `TICK_TOKEN` animation timer now stopped when run session completes

## [1.0.0] — initial release
