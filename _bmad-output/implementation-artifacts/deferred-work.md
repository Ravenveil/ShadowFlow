# Deferred Work

Items deferred during code reviews. Each entry is a real issue that was found but intentionally not fixed in the reviewed story. Use this list to inform future story planning.

---

## Deferred from: automated code review of 11-2/11-3/11-4 (2026-04-26T12:31:55Z)

- **[D-fs1 / HIGH-infra] `_glob` / `_grep` 同步阻塞 asyncio 事件循环** [shadowflow/mcp_servers/fs_server.py `_glob`/`_grep`] — 大目录递归遍历使用同步 I/O 直接在 async 函数中执行，会 block event loop 数秒；修复需 `asyncio.to_thread` 包装，属架构重构，留 Phase 2。
- **[D-fs2 / LOW] 符号链接目录本身可被 rglob 遍历**  [shadowflow/mcp_servers/fs_server.py `_grep`] — glob 结果已过滤沙箱外文件，但 rglob 遍历过程中符号链接目录内容可被读取；Phase 2 安全 Story 统一处理。
- **[D-fs3 / LOW] `_write`/`_edit` 非原子写入** [shadowflow/mcp_servers/fs_server.py] — 进程崩溃可导致文件部分写入；建议改用 `os.replace()` 原子写，留 Phase 2 基础设施 Story。
- **[D-web1 / CRITICAL-design] SSRF — `follow_redirects=True` 无私有 IP 过滤** [shadowflow/mcp_servers/web_server.py `_fetch`] — 工具设计上允许任意 URL（Agent 能力边界在 Policy Matrix）；若需限制，需系统级安全 Story 添加 allowlist/denylist 或禁用重定向跟随。
- **[D-web2 / MEDIUM] `_cache` 无上限/无主动驱逐** [shadowflow/mcp_servers/web_server.py] — 同 2026-04-25 deferred 条目；bounded LRU 替换留 Phase 2。
- **[D-11-4-1 / HIGH-design] max_iterations 返回 tool 结果字符串而非 LLM 答复** [shadowflow/runtime/service.py `run_agent_with_tools`] — 同 D6（已在 deferred-work.md）；超出迭代上限时返回值语义歧义，需产品确认是抛异常、返回结构体还是最终一轮 LLM 调用后再返回。
- **[D-11-4-2 / LOW] 缺少验证 `messages` payload 不含内部标记的测试** [tests/llm/test_tool_use.py] — 多轮工具调用后 `call_args.kwargs["messages"]` 未断言不含 `_is_tool_results` key；留 Story 11-4 补充测试。

---

## Deferred from: code review (2026-04-26T11:56:15Z) — uncommitted changes (Epic 8 / Epic 11 / Security hardening)

- **[D1 / CRITICAL-design] BYOK 设备密钥与密文共存 localStorage** [src/core/hooks/useSecretsStore.ts] — AES-GCM 加密在设备密钥同存同取 localStorage 场景下防御能力有限；代码注释已标明"仅防止静态扫描/被动 XSS"。真正的密钥保护需 WebCrypto non-extractable key + IndexedDB 或 userVerification，留 Phase 2 安全审计 story 决策。
- **[D2 / HIGH-design] Tool name collision 仅 WARNING，后来者覆盖先来者** [shadowflow/runtime/service.py `run_agent_with_tools`] — MCP 客户端工具名冲突时静默覆盖；MVP 单客户端场景无影响，多客户端时存在"供应链混淆代理"风险。后续需为工具名加 client namespace 前缀（如 `{client_id}:{tool_name}`）。
- **[D3 / HIGH-infra] slowapi `get_remote_address` 在反向代理后获取 proxy IP** [shadowflow/server.py] — 10/min 限速在 Docker Compose+nginx 部署下作用于所有用户共享 IP；需配置 uvicorn `forwarded_allow_ips` 或自定义 key_func 读取 `X-Forwarded-For`。待部署拓扑确认后修复。
- **[D4 / HIGH] Zustand `useSecretsStore` storage 事件监听器无法清理** [src/core/hooks/useSecretsStore.ts] — Zustand 单例模式下一个监听器可接受；micro-frontend 拆卸或 HMR 场景下无法 `removeEventListener`。留 Phase 2 重构 store 初始化方式时处理。
- **[D5 / MEDIUM] `agent.tool_called` SSE 事件中 MCP tool args 未能全量 redact** [shadowflow/runtime/events.py + service.py] — `_redact_sse_payload` 仅按预定义 key 名 redact；第三方 MCP tool 参数字段名不可预测（如 `auth`, `key`, `bearer`）。需要基于值模式的 redact 方案，留安全 hardening story。
- **[D6 / MEDIUM] ReAct max_iterations 返回值语义歧义** [shadowflow/runtime/service.py `run_agent_with_tools`] — 超出最大轮次时返回最后一条 `role: "tool"` 消息的 `str(result)` 内容，与正常完成无法区分（SSE 事件 `agent.max_iterations_reached` 发出但调用方看不见）。应抛出特定异常或返回带状态的结构体，留 Story 11-4 修复。
- **[D7 / MEDIUM] `detect_gap` 超深/超宽输入返回 `None` 与"无 gap"语义相同** [shadowflow/runtime/gap_detector.py] — 当前行为：bounds exceeded → 记 WARNING → 返回 `None`；调用方无法区分"正常无 gap"与"输入被拒绝"。应返回哨兵值或抛出，留 Sprint 1 gap-detection 重构处理。
- **[D8 / LOW] `tool_choice = "auto"` 写死，无法传 `"required"` 或指定函数名** [shadowflow/llm/openai.py] — 限制 ReAct 循环在某些 agent 场景下的控制粒度，MVP 可接受，留 Story 11-4 迭代升级。
- **[D9 / LOW] `run_agent_with_tools` 无单元/集成测试** [shadowflow/runtime/service.py] — 重要的新执行路径（ReAct 循环、工具调用、SSE 事件、超迭代终止）目前无 pytest 覆盖，留 Story 11-4 DoD 补充测试。
- **[D10 / LOW] `readOnly` prop 仅前端 UI 约束，无服务端授权** [src/core/components/Panel/PolicyMatrixPanel.tsx] — 客户端 disabled 按钮可绕过直接调 API；需在 `/workflow/runs/{run_id}/policy` endpoint 添加 role-based 权限校验，留 Epic 12 RBAC story。
- **[D11 / LOW] Zustand `useSecretsStore` 异步初始化无 loading 状态** [src/core/hooks/useSecretsStore.ts] — 首次渲染 `secrets: {}` 可能触发"无密钥"提示，等异步加载完成才恢复；添加 `loading: boolean` 字段可消除闪烁，留 UX 优化阶段。

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

---

## Deferred from: code review of 5-3-0g-storage-下载-merkle-验证 (2026-04-23)

- 失败日志仅存于 React state（`failureLogs` 状态），页面刷新后丢失 [src/pages/ImportPage.tsx:86-89] — spec "本地保留" 措辞模糊，历史 CID 用 localStorage 但失败日志未持久化；可延后到 UX 优化
- E2E smoke test allowlist 包含 `'404'` 和 `'net::ERR'` 过于宽泛 [tests/e2e/route-smoke.spec.ts:21-28] — 可能压制真实资源加载错误；pre-existing CI 设计，不属本 story
- `uploadTrajectory` 无并发保护（download 已有 Set<string> mutex） [src/adapter/zerogStorage.ts:99] — pre-existing code，不属本 story scope

---

## Deferred from: code review of 5-4-0g-compute-作为第-5-provider-接入 (2026-04-23)

- httpx.AsyncClient 从未关闭，无 close()/context manager [shadowflow/llm/zerog.py] — pre-existing pattern，其他 provider 也无关闭方法
- `_ensure_metadata` 无 asyncio.Lock 保护 [shadowflow/llm/zerog.py:157-161] — 并发请求可能重复 spawn bridge 子进程，当前使用模式低风险
- httpx.ConnectError/DNS 错误未捕获 [shadowflow/llm/zerog.py:258-268] — FallbackProvider 可能 misclassify 原始 httpx 异常
- AC2 压测无执行证据 — bench 脚本存在但无 `_bmad-output/benchmarks/` 输出文件，需 testnet 运行验证
- 私钥通过 subprocess 环境变量传递 [shadowflow/llm/zerog.py:48-53] — /proc/<pid>/environ 可读性风险；stdin pipe 更安全但需架构重构
- 流式响应未显式 aclose() [shadowflow/llm/zerog.py:294-347] — 连接可能半读状态残留，需 response.aclose() in finally


## Deferred from: code review of 7-2-消息列表项-分组-徽章系统 (2026-04-24)

- `PLACEHOLDER_TEMPLATE_ID` 硬编码 'academic-paper' [src/core/components/inbox/MessageList.tsx:17] — Story 7.4 路由实现后由动态 templateId 替换
- SSE `approval.*` 事件未接线到 useInboxStore [src/core/store/useInboxStore.ts] — 需要 run-to-group mapping 在本 story 中尚未建立；`updateGroupStatus` action 已就位，待未来故事补齐 SSE 订阅逻辑
- fetchInbox 缓存：切换回已访问 template 不会重新拉取 [src/core/store/useInboxStore.ts:41] — MVP 可接受设计；若需实时性可加 TTL 过期机制

---

## Deferred from: automated code review of 7-3 + 7-4 (2026-04-25)

### 7-3 新群聊流程
- PolicyMatrixPreview 显示全局 usePolicyStore 状态（新群组为空矩阵）而非模板 policy [src/core/components/inbox/CreateGroupDialog.tsx:287] — 修复需为 PolicyMatrixPanel 添加 initialMatrix prop；MVP Step 5 为信息性预览，空矩阵可接受；Phase 2 处理
- MemberEmailInput 缺少基础 email 格式验证 [src/core/components/inbox/CreateGroupDialog.tsx:236] — AC4 中 Step 3 为 optional skip；轻微 AC3 遗漏，Phase 2 补全
- groups.py 通过函数内 import 引用 server.py._get_template 循环依赖 [shadowflow/api/groups.py:99] — pre-existing 架构债；建议提取 _get_template 至 shadowflow/runtime/template_registry.py

### 7-4 路由与面包屑
- recentMessages 缓存无 TTL/无效化机制 [src/core/components/inbox/PreviewPane.tsx:32] — 新消息到达时不自动刷新；Phase 2 SSE 事件触发缓存失效
- MessageList.tsx 包含 Story 7-6 搜索/过滤功能（scope 混入）— useDebounce / tabCounts / matchesSearch 属于 Story 7-6(in-progress)；功能正确无 harm，待 7-6 正式跟踪时核对 diff 边界

---

## Deferred from: automated code review of 7-5 / 7-6 / 7-7 (2026-04-25)

### 7-5 ChatBriefBoardToggle
- `briefBoardAlias` 初始渲染为 'BriefBoard'，异步加载模板后闪变真实别名（如"日报"） [src/pages/ChatPage.tsx] — 属常见异步数据加载 UX 模式，可用 Suspense/骨架屏优化，但非 AC 要求；Phase 2 视 UX 打磨需求

### 7-7 ApprovalGatePanel
- approve/reject 端点无调用方鉴权校验，任意请求可通过/驳回任意 approval_id [shadowflow/api/approvals.py] — 属系统级安全加固，范围超出本 Story；建议纳入 x-5 rate-limiting + auth hardening story 一起处理
- CORS `allow_methods` 限制为 `["GET", "POST", "OPTIONS"]`，日后若新增 DELETE 端点（如审批撤回）需同步更新 [shadowflow/server.py] — 视后续 Story 需求在 server.py 中按需扩展 allow_methods


---

## Deferred from: code review of story 11.1/11.2/11.3/11.4 (2026-04-25)

### 11.1 shell_server — deferred items
- `run()` 工具接受任意 shell 命令（`shell=True`）——设计层面命令沙箱/allowlist 需求超出本 Story；MCP Server 作为 Agent 工具的安全边界将在系统级安全 Story 统一处理
- SSH `key_path` 参数接受任意文件路径——key_path 仅作 paramiko `key_filename`，不执行；低风险，可在 SSH 安全加固 Story 统一处理
- tmux 固定 5 秒等待策略不可靠——输出捕获准确性可通过 `tmux wait-for` 或轮询改善；Phase 2 优化
- messages 列表跨迭代无上限增长——LLM context 截断属系统级策略，不在 ReAct Loop 本身处理

### 11.3 web_server — deferred items
- `_cache` 模块级全局 dict 无主动驱逐（仅 TTL 惰性检查）——内存 DoS 风险低（1h TTL 自然过期），bounded LRU 可在 Phase 2 替换

---

## Deferred from: code review of story 7-8 and story 8-1 (2026-04-26)

### 7-8 Chat → Builder Jump
- Blueprint 状态在 `navigate('/editor')` 时丢失（未通过 sessionStorage 或 router state 传递）[src/pages/BuilderPage.tsx:handleSwitchToGraph] — Story 8.3 Scene/Graph 集成时统一处理 Blueprint → Editor 传递机制
- generate 端点无单请求鉴权依赖或速率限制保护 [shadowflow/api/builder.py] — 系统级安全策略，纳入 x-5 rate-limiting + auth hardening story

### 8-1 AgentBlueprint Builder API 骨架
- `sub_agents` 层级结构（主管→员工嵌套）未映射到 `instantiate` 产出的工作流图，当前仅做线性串联 [shadowflow/runtime/builder_service.py:_blueprint_to_template_spec] — 超出 8.1 骨架范围，Story 8.3 实现 Scene Tree 时再连通主管→子节点池映射

## Deferred from: code review of 7-7-approval-gate-面板-内嵌-inbox-预览 (2026-04-26)

- `_approval_registry` / `_reverse_registry` 进程重启后全部丢失，pending 审批无法恢复 [shadowflow/api/approvals.py:31-32] — MVP in-memory 架构设计，与 run_store/checkpoint 一致；需持久化层时统一处理
- SSE `/api/approvals/events` 流无心跳帧（keepalive），长空闲连接被 Proxy 静默断连后 generator 泄漏 [shadowflow/api/approvals.py:stream_approval_events] — 运维加固，建议 asyncio 定期发送 `: keepalive\n\n` 注释帧
- `_resolve_run_group_id` / `_resolve_group_run_ids` 每次 SSE tick 全量调用 `svc.list_runs()`（O(n) 磁盘 IO）[shadowflow/api/approvals.py:170-200] — 性能优化，MVP 规模可接受；未来可在 RuntimeService 维护 run_id→group_id 索引
- `fetchPendingApprovals` 对所有非 2xx 响应静默返回 `[]`，UI 无法区分"无审批"与"服务器错误" [src/api/approvalApi.ts:9-13] — UX 错误态改进，建议加 error/null 返回值
- `Active Runs` 指标初始化为 0，组件挂载时无后端同步；已运行的 runs 不会被计入直到下次 SSE 事件 [src/core/components/inbox/ApprovalGatePanel.tsx + useInboxStore.ts] — 需后端补充 `GET /api/groups/{id}/metrics` 端点提供初始快照

---

## Deferred from: automated code review of 8-3-scene-mode-shell-scene-tree-inspector (2026-04-26)

- **F5 — RoleInspector 本地 state 在同 role_id blueprint 替换时可能 stale** [src/core/components/builder/inspector/RoleInspector.tsx:73] — `key={role.role_id}` 的缓解措施在 MVP 实践中充分；同 ID 替换场景极少（生成新 blueprint 时 role_id 通常不同）

---

## Deferred from: automated code review of 8-3b-roleprofile-深度配置-persona-traits-state-fields (2026-04-26)

- **D1 — liveRole selector 仅搜索一层 sub_agents，深度 >1 嵌套角色找不到** [src/core/components/builder/inspector/RoleProfilePanel.tsx:120] — 当前 UI 不支持深度嵌套创建（Builder Phase 2 计划），风险窗口可控
- **D2 — KnowledgeBinding TS 接口有 4 个字段不在 Python 后端（retrieval_mode / freshness_hint / scope / target_ref）** [src/common/types/agent-builder.ts:52] — Story 8.4 KnowledgeDock 的前向规划字段；留 Story 8.4 同步 Python 端实现
- **D3 — infer_can_spawn model_validator 仅在构造时触发，前端 addSubAgent 后不重新校验** [shadowflow/runtime/contracts_builder.py:52] — blueprint 在 API 边界完整 model_validate()，设计行为；留 Story 8.6 publish 路径时验证
- **D4 — 无前端→后端端到端集成测试（store 状态 → model_validate() 校验链路）** — E2E 测试属 Epic 6 closing story 范畴；AC7 已覆盖 Python 单元测试
- **D5 — AccordionSection open 状态为组件级 local state，selection 切换后不重置** [src/core/components/builder/inspector/RoleProfilePanel.tsx:41] — 依赖 BuilderPage `key={role.role_id}` 缓解；留验证
- **D6 — patchHandoff 在快速双击时 stale liveRole.metadata 可能覆盖并发写入** [src/core/components/builder/inspector/RoleProfilePanel.tsx:159] — MVP 单用户频率不触发；Phase 2 改为 store 原子更新函数
- **D7 — allRoles flatMap 每次 selector 返回新数组引用，引发额外重渲染** [src/core/components/builder/inspector/RoleProfilePanel.tsx:126] — 无数据错误；Phase 2 引入 shallow 比较优化

- **F24 — 有 role_profiles 为空的 blueprint 时画布渲染 Team Root 而非 empty state** [src/core/components/builder/SceneCanvasShell.tsx:173] — Team root 始终被添加到 projection，"No blueprint" 空态文本对有 blueprint 但无角色的情况永不显示；轻微 UX 边界，可接受

---

## Deferred from: automated code review of 11-1-shell-mcp-server Round 2 (2026-04-26)

- **_tmux_run exit_code 永远为 0** [shell_server.py:239-245] — `tmux send-keys` 无法捕获真实命令退出码；修复需改用 `tmux run-shell` 或 sentinel 输出解析，属架构重设计，超出本 Story patch 范围
- **capture-pane 固定 5s 捕获可能返回旧命令输出** [shell_server.py:284-296] — 无法判断命令是否完成；需 `tmux wait-for` 或轮询信号机制，与上条同源，Phase 2 重构 _tmux_run 时一并处理
- **并发 _tmux_run 同 session 竞争条件** [shell_server.py:259-296] — has-session/send-keys/capture-pane 无 session 级锁；需 `asyncio.Lock` per-session 字典，超出本 Story 范围
- **SSH host 未校验（SSRF/内网 pivot）** [shell_server.py:159] — 设计层面：tool 本身允许任意 host，安全边界在调用方（Policy Matrix/Agent 配置）；系统级安全 Story 统一处理

---

## Deferred from: automated code review of 8-4-knowledge-dock and 8-4b-tool-registry (2026-04-26)

### 8-4 Knowledge Dock
- **Scene Tree `shared-knowledge` 无动态 badge 计数** [src/core/stores/builderStore.ts:139] — AC6 要求新增/删除绑定后 Scene 有可见反馈；角色层级有 badge，但 shared-knowledge 节点标签固定，无绑定数计数；推迟到 Story 8.5/8.6 完善 Scene 联动
- **AC8 缺少 Scene Mode 完整路径集成测试** [src/core/components/builder/KnowledgeDock.test.tsx] — 直接渲染 KnowledgeDock 而非测 Scene Tree → Inspector → Dock 完整路径；推迟到 Story 8.6 Scene 路径稳定后补集成测试

### 8-4b Tool Registry
- **SHA-256 密钥派生无盐值** [shadowflow/runtime/tool_credentials.py:22] — 弱密钥可被彩虹表预计算；建议安全加固 Story 升级为 PBKDF2/Argon2 并附迁移脚本
- **`_write_provider` 非原子写入** [shadowflow/runtime/tool_registry.py:94-96] — 进程崩溃可损坏 JSON 文件；建议 `os.replace` 原子写模式，独立基础设施 Story 处理
- **`env_keys` 以明文暴露密钥名** [shadowflow/runtime/tool_registry.py:122-123] — 当前设计允许展示键名（用于 `***` 掩码）；若安全需求收紧可加 hash 混淆
- **`_SCHEMA_CACHE_DIR` 相对路径依赖进程启动目录** [shadowflow/runtime/tool_registry.py:4] — 建议统一 `SF_DATA_DIR` 环境变量，与 checkpoint store 保持一致
- **`ToolPicker` 仅加载 `connected` provider 的工具，failed provider 无 Inspector 内重试入口** [src/core/components/builder/inspector/fields/ToolPicker.tsx:212] — 建议在 ToolProvidersTab 中提供明确重试路径，或 ToolPicker 内展示"测试连接"按钮
