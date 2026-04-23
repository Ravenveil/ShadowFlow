# Deferred Work

Items deferred during code reviews. Each entry is a real issue that was found but intentionally not fixed in the reviewed story. Use this list to inform future story planning.

---

## Deferred from: code review of 0-1-docker-compose-一键启动 + 0-2-github-actions-ci-流水线 (2026-04-21)

- `@app.on_event("startup")` 已废弃，应迁移到 FastAPI `lifespan` context manager [shadowflow/server.py] — 非阻塞 deprecation warning，已在 Dev Notes 记录
- `PYTHONPATH` 硬编码 `/install/lib/python3.11/site-packages`，基础镜像升级后静默失败 [Dockerfile.api] — 低优先级，仅在升级基础镜像时触发
- healthcheck timeout 3s 在冷启动/重度机器可能不足 [docker-compose.yml] — start_period:10s 有缓冲，实机验证可收紧
- `MissingKeyBanner` fetch 无 AbortController / timeout [src/App.tsx] — UX 轻微，MVP 可接受
- 多 worker uvicorn 下 `app.state.missing_keys` 竞态窗口 [shadowflow/server.py] — 单 worker Docker CMD 不触发
- nginx config 用 printf 覆盖内置 default.conf，未来基础镜像更新可能失效 [Dockerfile.web] — 低优先级
- `CORS_ORIGINS` env var 在 .env.example 文档化但 server.py 未读取（Scope deviation #4）[shadowflow/server.py] — 留给 Security hardening story
- `npx vite build` 跳过 tsc 类型检查（Scope deviation #1）[Dockerfile.web] — 留给独立 tsconfig/tsc-fix story
- 6 个 legacy vitest 测试被排除 + `passWithNoTests: true` — 全部 6 个测试文件 import 路径已失效（非纯语法问题），需独立 story 重接路径后移除 exclude [vitest.config.ts]
- mypy 以 `|| true` advisory 运行，不阻断合并（125 存量类型错误）[.github/workflows/ci.yml] — post-MVP story 收紧
- ruff 收窄到 F-only（535 存量 E/W/I/N findings）[pyproject.toml] — post-MVP story 拧紧到原方案
- 移除 `--report-unused-disable-directives`，eslint-disable 注释无感知积累 [package.json] — hygiene cleanup

---

## Deferred from: code review of 3-1-react-editor-shell (2026-04-22)

- Inspector → `useSelectedNode` 实际订阅串接不在本 story diff 内（应在 legacy `EditorPageImpl`）[src/core/components/inspector/NodeInspector.tsx + 未 diff 的 EditorPageImpl] — 本轮审查窄化到 3-1 File List，无法验证 T3 "Inspector 订阅该 selector 精确渲染"，留给下一轮全量 canvas 审查或 Story 3-3 落地时复验
- **AC2 "8 角色 DAG ≤ 1s" blocked-by-3.6** [tests/e2e/editor-shell.spec.ts:30-37] — 依赖 Story 3-6 `templates/solo-company.yaml` 落地；3-6 合并后跑 `npx playwright test editor-shell.spec.ts` 验证通过后 close AC2。不用 mock fixture（抛弃性代码）

### Follow-up tasks（D1/D4 派生，非阻塞本 story Done）

- **D1: Shadow UI 映射表** — 新建 `docs/design/shadow-ui-mapping.md`，列 Shadow 原组件（sidebar/inspector/common/editor/modals/layout 各目录真实文件）→ ShadowFlow 重写对应文件 + 语义覆盖说明，守住 AR22 "不重造" 可追溯性
- **D4: Story 4-5 / 4-6 spec 护栏** — 在 `_bmad-output/implementation-artifacts/4-5-policymatrixpanel-可视化编辑-运行中改制度.md` 和 `4-6-运行中新增角色-re-run-with-new-policy.md` Dev Notes 加一行："`usePolicyStore` 已由 Story 3-1 落地（132 行实现含 cycleCell/highlightCell/markClean/matricesEqual），本 story 仅扩展 hot-swap/reconfigure 差异化 action，禁止重写已有 state/action"

---

## Deferred from: code review of story-2.1 + story-2.2 Chunk A (2026-04-22)

- 老 `BaseExecutor.execute()` 的 (kind only) fallback 可见性未验证 [shadowflow/runtime/executors.py:913-] — Chunk A diff 截断未含老 execute 方法体,延后到 Chunk C 或 runtime service 审查时复验
- `RunRecord`/`RunSummary`/`TaskRecord`/`StepRecord` 状态 Literal 三处独立维护 [shadowflow/runtime/contracts.py:190/199/208/237] — scope 属 Story 1.x;建议后续 Story 1.x 清理时提取共享 Literal 别名
- `WorkflowPolicyMatrixSpec.validate_structure` isinstance 检查无意义且未阻断 sender→sender 自回路 [contracts.py:148-157] — scope 属 Story 1.1 Policy Matrix
- `NodeDefinition.validate_approval_gate` 缺反向检查(普通节点带 approval 配置被静默忽略) [contracts.py:116-120] — scope 属 Story 1.2
- `AgentSpec.executor: Dict[str, Any]` 弱类型,子结构未强类型 [contracts.py:328] — 后续 Story 2.x 收口时再提升为嵌套 Pydantic
- openclaw preset `-m "{stdin}"` 把完整 prompt 作 CLI 参数 → Linux ~128KB / Windows ~32KB ARG_MAX 上限 [provider_presets.yaml:27-32] — 长 prompt 会截断或 `OSError`;交给后续 preset 优化 Story 切换到 stdin 输入
- Windows `shutil.which("claude")` 依赖 `PATHEXT`,Windows 下 `.cmd`/`.exe` 未在 PATHEXT 的 shell 会找不到 [executors.py:494] — 平台矩阵测试未覆盖;交给 CI 测试矩阵 Story

---

## Deferred from: code review of story-2.3 + story-2.4 Chunk B (2026-04-22)

### 2.3 ACP Client
- Python async generator GC 延迟导致 subprocess 僵尸 [shadowflow/runtime/acp/client.py:stream_events] — consumer 不 `aclose()` 则 finally 延后跑,transport 不被 stop;交后续 `contextlib.aclosing` 或 service 层 wrapper
- `AcpTransport` 未提供对称 `notify(method, params)` / `on_message` 回调接口 [shadowflow/runtime/acp/transport.py] — spec 子任务 [AC1-a] 隐含要求,当前可用但 API 不对称
- `AcpSessionTerminated` 在 `executors.py` except 分支实际死代码(client 已内部 catch) — 清理交独立 refactor
- JSON-RPC id `str` vs `number` 碰撞(`str(0) == str("0")`)[shadowflow/runtime/acp/transport.py:_pending] — spec 允许两种 id 类型,需 canonicalize

### 2.4 MCP Client
- `McpAgentExecutor(provider="generic")` `default_server=""` 存在目的不明 [shadowflow/runtime/executors.py:_build_mcp_executors] — dispatch 必 raise `MCP_SERVER_UNAVAILABLE`;交 Story 2.8 文档化
- MCP `stdio://sh -c 'evil'` URI 注入面 [shadowflow/runtime/mcp/transport.py:parse] — YAML 模板是信任边界,交 Epic 5 Security Hardening
- `default_tool="run_agent"` 硬字符串相等,server 用 namespace 命名(`hermes.run_agent`)则 `MCP_TOOL_NOT_FOUND` [shadowflow/runtime/executors.py:_build_mcp_executors] — 交 Story 2.8 文档化命名约定

---

## Deferred from: code review of 0-3 / 0-4 / 1-1 / 1-2 / 1-3 / 1-4 / 1-5 (2026-04-22)

### 0-3 Pydantic→TS Types
- `datetime` → `string` 丢 ISO8601 brand 信息 [scripts/generate_ts_types.py] — TS 类型表达力限制
- `int` 与 `number` 合并 [scripts/generate_ts_types.py] — TS 语言限制
- CRLF/行尾在 Windows 未验证，隐式依赖 Python universal newlines [scripts/check_contracts.py] — 需 `.gitattributes` 加固

### 0-4 README
- Prerequisites "不需要 Python/Node.js" vs Development 段矛盾 [README.md] — 受众不同，MVP 后分段说明
- 架构图 "0G Compute" 已实现 vs CID 占位 [README.md] — 发版前统一修辞

### 1-1 Policy Matrix
- 前端 TS 类型缺 `policy_warnings`/`PolicyWarning` — 被 Story 0-3 regenerate 覆盖
- `reconfigure()` 赋值绕过 Pydantic 校验 [shadowflow/runtime/service.py:583] — service 层设计问题

### 1-2 Approval Gate
- `ApprovalGateNode.tsx` 范围溢出（108 行完整组件 vs spec "占位"） [src/core/components/Node/] — Epic 3 会重做
- `reject()` 同步调用跨事件循环 [shadowflow/runtime/service.py] — 单进程 MVP 可接受

### 1-3 Runtime Reject
- `PolicyMismatch` 被 `/workflow/compile` 与全局 handler 返回 envelope 不一致 — 错误 envelope 统一属跨 story server layer

### 1-4 Checkpoint Resume
- Checkpoint TTL/eviction 缺失 [shadowflow/runtime/service.py] — 基础设施，非 1-4 引入
- 多进程部署下 `_approval_events`/`_rejection_events`/`_checkpoints` 不共享 — MVP 单进程假设，架构文档声明

### 1-5 Trajectory Export
- `RunTrajectory` 无 `approval_events`/`policy_violations`/`reject_events` 字段 — 跨 story 集成差距
- invalidated step 与重执行 step 无 `re_executes` 边 — 与 1-4 一起解决
- `HandoffRef.ts` 字段存在性 [shadowflow/runtime/contracts.py:406] — 原模型问题

---

## Deferred from: code review of Epic 4 Chunk A 后端 (2026-04-22)

### 4-5 Policy Matrix Hot-Swap (pre-existing runtime defects)
- `_get_latest_checkpoint` 在 `created_at=None` 时 `max()` TypeError [shadowflow/runtime/service.py:~595-601] — pre-existing,未守 None
- `reject()` 无 run_id 存在性检查 + 非 approval 节点仍 `submit_approval` 静默成功 [shadowflow/runtime/service.py:397,463] — 可被伪造 reject 事件
- `reject(retarget_stage=?)` 未知 stage 静默 fallback 到 node 0 [shadowflow/runtime/service.py:434-437] — 会把整条 run 置空 invalidated
- `reject()` invalidated 列表计算但从未标记 `StepRecord.status` [shadowflow/runtime/service.py:436-444] — archive/heatmap 看不见 invalidated
- approval_gate 线程安全 / 重入 / 默认 approve bias [shadowflow/runtime/service.py:2221-2265] — `asyncio.Event.set()` 跨线程不安全;重复键孤立首 waiter;默认 approve 反安全
- `_approval_decisions` 在 timeout 分支泄漏 [shadowflow/runtime/service.py:2253-2265] — 内存泄漏
- `submit_approval` 接受任意字符串 [shadowflow/runtime/service.py:467-473] — 改用 `Literal["approve","reject"]`

### 4-6 Reconfigure
- 无 idempotency key [shadowflow/runtime/service.py:522] — MVP 可接受

### 4-7 Ops Overview
- `trend_14pt` sparkline 永远空 [shadowflow/api/ops.py] — 需时序采样基础设施
- `providers/load` fallback 链数据缺失 [shadowflow/api/ops.py] — 跨 Story 3.5 provider config
- P95 ≤ 200ms NFR 测试缺失 [tests/test_ops_api.py] — NFR 测试集
- `tests/test_ops_aggregator.py` 未单独创建(已并入 test_ops_api.py) — 命名差异
- 无 authn/authz/tenancy — MVP 容忍

### 4-8 Trajectory Archive
- `intent` / `workflow_id` 未长度封顶或 CSV 转义 [shadowflow/api/archive.py:1252] — MVP 暂忽
- search 无索引 O(n) [shadowflow/api/archive.py:1201-1210] — MVP 10k runs 内可接受
- P95 ≤ 200ms + cursor 翻页无重叠 NFR 测试缺失 [tests/test_archive_api.py]

### 4-9 Policy Observability
- P95 ≤ 300ms + 50-runs 规模测试缺失 [tests/test_policy_obs.py]
- `RunEventBus._store` 无驱逐 [shadowflow/runtime/events.py] — 独立 eviction 故事
- `NODE_RETRIED` 常量在本 chunk 无发布点 [shadowflow/runtime/contracts.py] — Chunk B 使用
- `_rejection_events` 无上限 [shadowflow/runtime/service.py:460] — pre-existing 内存泄漏

---

## Deferred from: code review of Epic 4 Chunk B 前端 (2026-04-22)

### 4-1 SSE 事件总线
- `maxRetryMs` 选项在 `SseClientOptions` interface 声明但从未在实现中读取 [`src/adapter/sseClient.ts`] — 调用方传入此选项静默无效;留给 SSE 增强故事补实现

### 4-2 LiveDashboard
- Zustand actions 从 `useRunStore.getState()` 在 hook render 时解构,不在 `useCallback` 依赖数组内 [`src/core/hooks/useRunEvents.ts`] — Zustand `getState()` actions 是稳定引用,实际安全;pre-existing 全项目模式,不引入新风险
- `'*'` 通配符 + 命名 handler 导致 `handleEvent` 被双路调用 [`src/core/hooks/useRunEvents.ts`] — 每个命名 SSE 事件实际触发两次 `handleEvent`（store 写入幂等,无数据错误,但有冗余开销）;需改动 SseClient 架构,留独立故事
- `violations` 数组无上界增长 [`src/core/stores/useRunStore.ts`] — 长时间 run 中持续 append 内存线性增长;pre-existing 问题,留独立 eviction 故事

### 4-3 驳回 Toast
- Toast id `Date.now() + Math.random()` 碰撞风险 [`src/core/stores/useRejectionToastStore.ts`] — Firefox 隐私模式下 Date.now() 精度降至 100ms,同时到达的 toast 有小概率 id 碰撞;MVP 可接受,后续可改 `crypto.randomUUID()`
- Toast queue 无最大深度限制 [`src/core/stores/useRejectionToastStore.ts`] — 批量 violation 时 queue 可无限积累;需独立 eviction 故事

### 4-7 运营总览
- `useOpsStore.fetchAll` 无 AbortController —— 用户快速切换时间窗时多个并发 fetch 无取消机制,后发先至响应覆盖最新数据 [`src/core/stores/useOpsStore.ts`] — MVP 5s 轮询场景概率极低,留独立优化故事
- `AgentHealthGrid` 静默截断至 6 条,"View all X →" 渲染为 `<div>` 无 onClick/href [`src/core/components/Panel/AgentHealthGrid.tsx`] — 用户感知 agent 数不完整;留路由跳转实现故事

### 4-8 Trajectory Archive
- `useArchiveStore` 无 AbortController —— 多次快速翻页时并发 fetch 无取消,乱序响应可覆盖较新页数据 [`src/core/stores/useArchiveStore.ts`] — 用户操作间隔通常大于 RTT,MVP 可接受,留独立优化故事

---

## Deferred from: code review of story-2.5 ShadowSoul Rust Binary 接入 (2026-04-23)

- 模板编译时注入 `fallback_chain` vs 运行时 dispatch 降级 [shadowflow/runtime/executors.py:198-213] — spec 要求编译时注入,实现为运行时降级;运行时方案解耦更好(health 可在编译到执行间变化),Phase 2 统一
- `agent.degraded` 事件携带 `fallback_chain: ["api:claude"]` 但 runtime 未实际 auto-fallback re-dispatch [shadowflow/runtime/executors.py:247-261] — 当前仅通知 UI 层,实际回退需人工或 UI 层处理;Phase 2 实现自动 re-dispatch

---

## Deferred from: code review of story-2.6 AgentEvent 归一流 + SSE 集成 (2026-04-23)

- SSE endpoint `/workflow/runs/{run_id}/events` 无认证/鉴权 [shadowflow/server.py:527] — 跨切面安全问题,需统一中间件,不属于 Story 2-6 范畴
- `subscribe()` 无超时:订阅不存在的 run_id 会永久挂起 [shadowflow/runtime/events.py:subscribe] — 需要基础设施级超时策略,如 asyncio.timeout wrapper
- `publish()` 非线程安全:asyncio.Event 文档明确标注 not thread-safe [shadowflow/runtime/events.py:publish] — 当前 asyncio 单线程事件循环安全;如需跨线程调用应用 loop.call_soon_threadsafe()
- `src/__tests__/useRunEvents.test.ts` 缺失 — 前端测试基础设施待补充,需 mock EventSource 框架

---

## Deferred from: code review of story-2.8 Agent Plugin Contract 文档 (2026-04-23)

- `stream_events` 无显式 cancellation contract (`aclose()` / try-finally 语义) [docs/AGENT_PLUGIN_CONTRACT.md §2.1] — 消费者断开连接时 CLI/subprocess 后端可能泄漏子进程；需 ABC v2 RFC
- `dispatch` 没有声明最大延迟边界 [docs/AGENT_PLUGIN_CONTRACT.md §2.1 + §4.1] — 现声明"非阻塞"但未定义 timeout；需设计层讨论
- `provider_presets.yaml` 插值 `{id}` / `{run_id}` / `{stdin}` 未定义转义/sanitize 规则 [shadowflow/runtime/executors.py `_interpolate_args`] — 若字段来自用户输入存在命令注入面；需独立 hardening story
- ACP 命名空间缺 session-expired 事件 [shadowflow/runtime/events.py + docs §6] — ACP session 在底层失效时消费者没有规范化信号；Epic 2 后续 ACP client 能力扩展
- `AgentCapabilities` 无 `schema_version` 字段 [shadowflow/runtime/contracts.py] — 未来新增能力时无法区分"旧 agent"与"明确不支持"；版本演进预留
- `/health` 返回 degraded 时 `dispatch` 仍可调用，错误模型不统一 [shadowflow/runtime/executors.py + server.py:559] — 需运行时契约收敛
- SSE Last-Event-ID reconnect 示例用 `EventSource`，无法携带自定义 auth headers [docs §6.4] — BYOK 安全面，Epic 5 统筹
- `AgentTask.payload` 为裸 `Dict` 无 schema [shadowflow/runtime/contracts.py:764-770] — 下游各 executor 自行 cast，缺统一 JSON Schema
- `run_id` 在 `AgentHandle` 与 event payload 两处出现，权威性声明缺失 [docs §2.2 + §4.3] — 文档层次 nit，两处应一致且显式声明哪个是权威
- `hermes` CLI preset 与 ACP executor 同名，启动时会打 override warning [shadowflow/runtime/provider_presets.yaml:34 vs ExecutorRegistry] — Registry 层收敛，Story 2.3/2.4 封口时一并处理
- 文档对 `executors.py` / `events.py` 的引用未写 commit hash 或行号（Dev Notes 要求） [docs/AGENT_PLUGIN_CONTRACT.md 全文] — 每次 merge 手动同步成本高，待 CI doc-alignment 自动化（类似 test_agent_plugin_contract.py 思路）

---

## Deferred from: automated code review of Epic 2/3/4 → done batch (2026-04-23)

- CI `head` 表达式仍用内联三目，与 `base` 的 `scan-base` step 重构风格不一致 [.github/workflows/ci.yml:195] — cosmetic 不对称，功能正确；建议 `head` 也走 step output 统一风格
- `test_reports_policy_failure_instead_of_swallowing` 断言 `status=reconfigured` + `policy_failure` 键同时存在 [tests/test_policy_runtime_update.py:152-162] — 部分成功+内嵌错误 vs 抛异常的 API 设计矛盾；需 RuntimeService.reconfigure 契约明确化
- Force-push 导致 `github.event.before` SHA 在浅克隆中不存在 [.github/workflows/ci.yml:190] — TruffleHog scan 可能失败或跳过；建议加 `git cat-file -e` 前置检查
- `schema.pop("$defs")` 在迭代中原地修改 schema dict [scripts/generate_ts_types.py:169] — 预先存在模式；若 schema 对象被后续代码复用会丢失 `$defs`
- `check_contracts.py` 不捕获 `generate_ts_types` 的 `$defs` collision warnings [scripts/check_contracts.py:43-50] — 一致性错误的 schema 两侧相同，drift check 报 OK；建议 generate() 返回 warning count 或 check script 监听 log

---

## Deferred from: 本地 dev 首验 → `/editor` ErrorBoundary 兜底 `zh is not defined`（2026-04-23）

**一行 fix 已 apply：** `src/EditorPage.tsx:175` 添加 `const zh = lang === 'CN';`（RunButton 漏写，调用方 EditorTopBar 用 `'CN'/'EN'` 约定）。

**同文件两套语言约定隐患（非阻塞）：** `RunButton`/`EditorTopBar` 用 `lang: 'CN'|'EN'` + `zh = lang === 'CN'`；`GoalBar` L198 用 `useI18n().language` + `zh = language === 'zh'`。两套判断独立使用不立即崩，但切语言时不同步会产生诡异状态。需统一到 `useI18n()` 一套。

**流程层 5 个漏洞 → 已立 change-request `_bmad-output/change-requests/2026-04-23-frontend-quality-gates.md`：**
1. CI 不跑 Playwright；`editor-shell.spec.ts` AC1 是"存在但死代码"
2. `EditorPage.tsx` 无组件级 vitest（只测子组件）
3. tsc 放行 `zh is not defined`（strict 配置存疑 / 全局 declare 污染）
4. dev-story / code-review skill 没机械强制"浏览器开一下" — CLAUDE.md 已写但未落地到 skill 步骤
5. `bmad-check-implementation-readiness` 没把前端 smoke 列为 gate

**订正：** sprint-status.yaml:117 `5-1-0g-storage-前端直调-byok-密钥管理: review`（不是 ready-for-dev；2026-04-23 bmad-help 输出有误）。

---

## Deferred from: code review of 5-1-0g-storage-前端直调-byok-密钥管理 (2026-04-23)

- `toBase64` 用 `String.fromCharCode(...spread)` 在大 buffer（>100KB）会 RangeError [src/core/hooks/useZerogSecretsStore.ts:33] — 私钥 32 字节不触发；若函数被复用于大 payload 需改 chunk 写法
- `getPrivateKey` 内存有缓存时直接返回，不重新验证 passphrase [src/core/hooks/useZerogSecretsStore.ts:123] — 设计行为（session 级访问），测试已覆盖
- `storage` event listener 无 cleanup / HMR 叠加 [src/core/hooks/useZerogSecretsStore.ts:103] — SPA 生命周期正常，仅 dev HMR 场景
- `_FRONTEND_DIRECT` 在 Python module import 时冻结，运行时不可切换 [shadowflow/integrations/zerog_storage.py:19] — 标准 FastAPI 模式，需重启生效
- leakGuard 未覆盖 `XMLHttpRequest` / `navigator.sendBeacon` / `WebSocket` [src/core/security/leakGuard.ts] — 增量加固，ethers 的 JsonRpcProvider 默认走 fetch
- Playwright E2E 性能测试（10MB ≤ 10s）需真实 0G 网络 [spec P6] — 已在 story Dev Notes 注明延迟到集成环境

---

## Deferred from: code review of 5-2-trajectory-sanitize-scan (2026-04-23)

- `onSanitizeConfirm` 丢弃 cleaned trajectory 未触发 0G 上传 [src/EditorPage.tsx:1426-1432] — 跨 Story 集成（5.1 + 5.2 连通），Story 5.3+ 或独立集成 task 解决
- `phone_intl` 正则 `\+?[1-9]\d{7,14}` 误报率高，匹配时间戳/订单号等 8-15 位数字 [shadowflow/runtime/sanitize.py:33-34] — spec 定义的正则，需产品层面决策是否收紧为 `\+[1-9]\d{7,14}`（必须有 `+` 前缀）
- SanitizeReviewModal 无 focus trap，tab 可跳出 modal [src/core/components/modals/SanitizeReviewModal.tsx] — 无障碍改进，非 MVP 阻塞
