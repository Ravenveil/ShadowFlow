# Story 2.3: ACP Client 实现(Hermes / ShadowSoul 主协议)

Status: in-progress

## Story

As a **ShadowFlow 作为 workflow IDE**,
I want **通过 ACP(Agent Client Protocol)管理 Hermes / ShadowSoul 的 agent session**,
so that **session 生命周期、流式事件、审批流全用标准协议,零胶水代码**。

## Acceptance Criteria

### AC1: ACP host 角色启动 + 核心 JSON-RPC 消息闭环

**Given** `kind: "acp"` 注册到 AgentExecutor 注册表
**When** 模板声明 `executor: {kind: "acp", command: "hermes acp"}` 或 `{command: "shadow acp serve"}`
**Then** ShadowFlow 以 ACP host 角色启动 stdio JSON-RPC 子进程连接
**And** 发送 `initialize` / `session.new` / `session.prompt` 等 ACP 标准消息
**And** 接收 agent 流式响应,归一成 `AgentEvent`(agent.thinking / agent.tool_called / agent.completed)

### AC2: ACP 审批请求接入 ShadowFlow approval_gate

**Given** ACP agent 请求用户批准执行危险操作(`session.requestPermission`)
**When** ShadowFlow 接收该请求
**Then** 对接到现有 approval_gate 机制(Epic 1 Story 1.2),暂停 session 等待用户决策
**And** 决策结果通过 ACP `session.permissionResult` 返回 agent

### AC3: ACP session 故障处理

**Given** ACP session 中 agent crash 或 stdio EOF
**When** ShadowFlow 检测到
**Then** 发出 `agent.failed` 事件,触发 fallback 链或 pause + checkpoint

## Tasks / Subtasks

<!-- Sprint 1 readiness report 标注本 story 为 4-5 天工作量。建议 Sprint 1 按 a/b/c 三段落地:
  a) ACP transport + initialize + session.new/prompt(AC1 最小闭环)
  b) session.requestPermission + permissionResult 对接 approval_gate(AC2)
  c) 故障处理 + fallback / checkpoint(AC3)
  本文件不实际拆文件,dev 按 Tasks 顺序分段 PR 即可 -->

- [ ] **[AC1-a]** 新建 `shadowflow/runtime/acp/` 子模块:
  - [ ] `__init__.py`
  - [ ] `transport.py`:stdio JSON-RPC 传输层(asyncio subprocess + Content-Length framing 或 newline-delimited,按 ACP spec)
  - [ ] `messages.py`:Pydantic 模型对应 ACP 请求/响应 `initialize` / `session.new` / `session.prompt` / `session.update` / `session.requestPermission` / `session.permissionResult`
  - [ ] `client.py`:`AcpClient` 类,封装 request / notify / on_message 回调
- [ ] **[AC1-a]** 实现 `AcpAgentExecutor(AgentExecutor)`,`kind = "acp"`:
  - [ ] `dispatch(task)`:spawn 子进程 → 发 `initialize` → 发 `session.new` → 发 `session.prompt` → 返回 `AgentHandle(acp_client, session_id)`
  - [ ] `stream_events(handle)`:监听 `session.update` 流 → 归一为 `agent.thinking` / `agent.tool_called` / `agent.tool_result` / `agent.completed`
  - [ ] `capabilities()`:`AgentCapabilities(streaming=True, approval_required=True, session_resume=True, tool_calls=True)`
- [ ] **[AC1-a]** 在 `ExecutorRegistry` 注册两条 ACP executor:
  - [ ] `(kind="acp", provider="hermes")`,默认 `command: "hermes acp"`
  - [ ] `(kind="acp", provider="shadowsoul")`,默认 `command: "shadow acp serve"`(Story 2.5 会进一步验证)
  - [ ] 用户模板可覆盖 `command` 字段
- [ ] **[AC2-b]** 实现 `session.requestPermission` 接入 approval_gate:
  - [ ] 新增 `shadowflow/runtime/acp/approval_bridge.py`
  - [ ] 收到 ACP `session.requestPermission` → 查 run 上下文的 `approval_gate` → 写入 pending approval 队列 → 发 SSE 事件 `agent.approval_requested`
  - [ ] 前端 resolve 后 → 经 `/workflow/runs/{id}/approvals/{req_id}` POST → bridge 发 ACP `session.permissionResult`
  - [ ] **不重复造轮子**:复用 Epic 1 Story 1.2 的 approval_gate store(若无则 brief 注明依赖,需 PM 协调)
- [ ] **[AC3-c]** 故障处理:
  - [ ] `transport.py` 监听 subprocess exit / stdio EOF → raise `AcpSessionTerminated`
  - [ ] `AcpAgentExecutor` 捕获后,产出 `agent.failed` 事件(含 exit_code / stderr 末尾 100 行)
  - [ ] 检查节点配置的 `fallback_chain`(如 `["acp:hermes", "cli:openclaw", "api:claude"]`),按链尝试
  - [ ] 若无 fallback,触发 pause + checkpoint(调 `CheckpointStore.save`)
- [ ] **测试**:
  - [ ] `tests/test_acp_transport.py`:JSON-RPC framing / 请求-响应匹配 / EOF 处理
  - [ ] `tests/test_acp_client_session.py`:mock ACP server 完整 initialize → session.new → session.prompt → session.update 流
  - [ ] `tests/test_acp_approval_bridge.py`:requestPermission → approval_gate → permissionResult 往返
  - [ ] `tests/test_acp_failure.py`:subprocess crash → `agent.failed` + fallback 触发
  - [ ] **集成**:Sprint 1 末在 Hermes v0.9.0 实机上跑一次 `hermes acp` 真实端到端

## Dev Notes

### 架构依据
- **Epic 2 Goal**:ACP 作为**agent 接入核心协议**(host 角色),MCP 辅助,CLI 兜底
- **AR 编号**:AR56(ACP Client,Must,恢复)
- **相关 FR/NFR**:FR42、I1、S5、PRD 差异化护城河(session + 审批 + 流式)

### 涉及文件
- 新增:`shadowflow/runtime/acp/{__init__.py,transport.py,messages.py,client.py,approval_bridge.py}`
- 扩展:`shadowflow/runtime/executors.py`(注册 `AcpAgentExecutor`)
- 扩展:`shadowflow/runtime/contracts.py`(若需扩展 `AgentEvent.type` 值域)
- 依赖:Epic 1 Story 1.2 的 `approval_gate` 基础设施
- 新增测试:`tests/test_acp_transport.py` / `test_acp_client_session.py` / `test_acp_approval_bridge.py` / `test_acp_failure.py`

### 关键约束
- **前置依赖**:Story 2.1(AgentExecutor ABC)必须先 merge;Epic 1 Story 1.2(approval_gate)必须存在或 stub
- **ACP spec 权威来源**:https://github.com/zed-industries/agent-client-protocol(包括消息字段名、framing、错误码)
- Sprint 1 **readiness report 标注本 story 为 4-5 天工作量**,建议分三段 PR(a/b/c),见上方 Tasks 注释
- **ShadowSoul/ShadowClaw 命名待 Story 2.7 SPIKE 决议**。本 story 的 `provider="shadowsoul"` 注册名当前沿用 epics.md 用法,SPIKE 决议后可能改名;改名时只需动 preset key,不动 ACP client 代码
- ACP 是 **session 级别**管理(start / stream / approve / stop) → 与 ShadowFlow run 生命周期 + approval_gate 天然对应,不要退化成"包一层 MCP"
- stdio JSON-RPC framing 按 LSP 风格(Content-Length header),与 Hermes `acp_adapter/` 源码对照验证
- Windows 下 subprocess stdio 用 `asyncio.create_subprocess_exec` + `stdin/stdout=PIPE`,注意换行符归一(`\r\n` → `\n`)

### 测试标准
- **契约测试**:`AcpAgentExecutor` 实现 `AgentExecutor` ABC 三方法
- **协议测试**:JSON-RPC framing / 请求-响应匹配 / 通知事件分发
- **集成测试**:至少 Hermes `hermes acp` 实机跑通一次完整 session
- **故障测试**:subprocess kill → `agent.failed` + fallback

## References

- [Source: epics.md#Story 2.3]
- [Source: epics.md#AR56 ACP Client — Agent 会话管理主协议]
- [Source: ACP Spec — https://github.com/zed-industries/agent-client-protocol]
- [Source: Hermes `acp_adapter/`(server.py / session.py / events.py / tools.py)]
- [Source: epics.md#Story 1.2(approval_gate 依赖)]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List

### Change Log

- 2026-04-22T02:40:00Z: Code Review (Chunk B, 3 层对抗) — AC2 approval_bridge 未接入 + AC3 fallback/checkpoint 缺失 + ACP spec 消息名/字段不符

### Review Findings

_Chunk B 审查(Blind + Edge + Auditor),2026-04-22_

**Story 2.3 AC 完成度真相:AC1 部分(JSON-RPC 闭环 + dispatch 能跑)、AC2 完全未闭环(approval_bridge 是孤岛死代码)、AC3 只做了最浅层 `agent.failed` 事件,fallback_chain / checkpoint 全缺失。**

#### Decision Needed

- [ ] [Review][Decision] **Story 2.3 AC 实质未达 review→done 标准** — AC2 `approval_bridge.py` 存在但**全工程无人实例化/调用**,前端 resolve 后没有路径回送 `session.permissionResult`;AC3 `fallback_chain` 读取与 `CheckpointStore.save` 触发在 `AcpAgentExecutor.stream_events` 里根本没实现,只发了空壳 `agent.failed` 事件。三选一:(a) 按 Chunk A 模式降级 Story 2.3 AC2/AC3 到 Phase 2(独立 Story),接受 AC1 基本达成;(b) 退回 `in-progress`,补齐 AC2/AC3 后再 review;(c) 混合 — AC2 降级,AC3 仅补 fallback_chain 最小实现
- [ ] [Review][Decision] **ACP 消息名 `session.new` / `session.prompt`(点号)** 与 Zed 官方 ACP spec 约定 `session/new` / `session/prompt`(斜杠)不符;实机对接 `hermes acp` 会 `method not found`。方案:(a) 立即改为斜杠格式(透明兼容 Hermes);(b) 维持点号 + 在 Hermes 侧加适配层;(c) 先改斜杠 + 等 Sprint 1 末真实机测试确认
- [ ] [Review][Decision] **`AgentHandle.metadata` 塞活 `_acp_transport` / `_acp_client` 对象** — Pydantic `Dict[str, Any]` 允许,但任何 `model_dump_json` / SSE 广播 / checkpoint 持久化立刻 `TypeError`。是否接受"handle 不可跨进程 / 不可持久化"这个隐性契约(加文档警告),还是改成 session registry + metadata 只存 session_id?

#### Patch(待应用)

- [ ] [Review][Patch] **[CRITICAL]** `SessionPromptRequest` 是 JSON-RPC request(带 id)但用 `transport.send` fire-and-forget [shadowflow/runtime/acp/client.py:prompt] — 改为 `transport.request()` 并 await 响应;或改为 notification(去 id)
- [ ] [Review][Patch] **[CRITICAL]** `_reader_loop` 条件 `if msg_id is not None and "result" in msg or (...)` 运算符优先级脆弱,且无 `id` 但畸形的响应会进 notifications queue [shadowflow/runtime/acp/transport.py:_reader_loop] — 改为显式括号 `if msg_id is not None and ("result" in msg or "error" in msg):`;非法消息走专用 `logger.warning` 分支
- [ ] [Review][Patch] **[HIGH]** `notifications()` async generator 无终止 sentinel,subprocess 崩溃后 consumer 永远卡在 `queue.get()` [shadowflow/runtime/acp/transport.py:notifications + _reader_loop finally] — reader_loop 结束时 `await self._notifications.put(None)`,iterator 检 None 则 break
- [ ] [Review][Patch] **[HIGH]** `session_resume=True` 与 finally 无条件 `transport.stop()` 矛盾 [shadowflow/runtime/executors.py:AcpAgentExecutor.stream_events finally + capabilities] — 二选一:(a) capabilities 改为 `session_resume=False`(当前真实能力);(b) 引入 session registry 保活 transport,stream_events 结束只取消订阅不 stop
- [ ] [Review][Patch] **[HIGH]** stderr 持续 drain 缺失,pipe buffer 满会阻塞 agent 子进程 [shadowflow/runtime/acp/transport.py:_reader_loop] — 独立 task 持续读 stderr 写 ring buffer,stop 时取 tail;符合 AC3 "stderr 末尾 100 行"
- [ ] [Review][Patch] **[HIGH]** `AcpTransport.stop` 先 cancel reader 再 terminate,丢 returncode/stderr 诊断 [shadowflow/runtime/acp/transport.py:stop] — 改为:先 `process.terminate()` → await reader 自然走 EOF → cancel 作兜底
- [ ] [Review][Patch] **[MEDIUM]** `initialize` params 缺 `protocolVersion`,`capabilities` 字段与 ACP spec 不符 [shadowflow/runtime/acp/messages.py:InitializeRequest] — 按 Zed spec 加 `protocolVersion`(number)+ `clientCapabilities.fs.readTextFile` 等
- [ ] [Review][Patch] **[MEDIUM]** `SessionUpdateNotification` 字段 `{type, content}` 与 ACP spec `{update: {sessionUpdate: ...}}` 不符 [shadowflow/runtime/acp/messages.py + client.py:stream_events 解析] — 对照 Zed `session/update` schema 修正
- [ ] [Review][Patch] **[MEDIUM]** JSON-RPC error 细节被 `str(msg["error"])` 吞掉,无法按 code 分支 [shadowflow/runtime/acp/transport.py:_reader_loop] — 引入 `AcpRpcError(code, message, data)`,future.set_exception 时保留结构
- [ ] [Review][Patch] **[MEDIUM]** `_build_acp_executors` 硬编码命令,无 `shutil.which` 预检,与 CliAgentExecutor degraded 路径不对称 [shadowflow/runtime/executors.py:_build_acp_executors] — dispatch 前检查,缺失直接返回 degraded handle;与 CLI 对齐
- [ ] [Review][Patch] **[MEDIUM]** `create_future()` 用废弃 `get_event_loop()` + send 失败泄漏 pending [shadowflow/runtime/acp/transport.py:request] — 改用 `get_running_loop()`;send 抛异常时 `self._pending.pop(msg_id)` 清理
- [ ] [Review][Patch] **[MEDIUM]** `AcpApprovalBridge` 并发不安全、permissionId 重复覆盖静默、loop-bound `asyncio.Event` [shadowflow/runtime/acp/approval_bridge.py] — 加 `asyncio.Lock` 保护 dict;register 已存在键时 raise;Event → Future(跨 loop 安全)
- [ ] [Review][Patch] **[MEDIUM]** `notifications` queue 无 maxsize,慢消费 OOM [shadowflow/runtime/acp/transport.py:__init__] — `Queue(maxsize=1000)`,满时 `put` 走 logger.warning + drop 或背压
- [ ] [Review][Patch] **[MEDIUM]** `asyncio.create_subprocess_exec` 无 `env` / `cwd` / `encoding` 控制,Windows 中文乱码进 JSON parser [shadowflow/runtime/acp/transport.py:start] — 显式 `env={**os.environ, "PYTHONIOENCODING": "utf-8"}`
- [ ] [Review][Patch] **[LOW]** ACP msg id `uuid4().hex[:12]`(48 bit)理论可碰撞 [shadowflow/runtime/acp/messages.py:_new_id] — 用完整 hex 或递增 counter
- [ ] [Review][Patch] **[LOW]** `reader_loop` 裸 `except Exception: pass` 吞诊断信息 [shadowflow/runtime/acp/transport.py:_reader_loop] — `logger.exception`

#### Defer

- [x] [Review][Defer] **Python async generator GC 延迟导致 transport 僵尸子进程** — consumer 不 `aclose()` 则 `stream_events.finally` 延后跑;交后续 `contextlib.aclosing` 或 service 层封装
- [x] [Review][Defer] **`AcpTransport` 未提供对称 `notify(method, params)` / `on_message` 回调接口** — spec 子任务 [AC1-a] 隐含要求,当前接口不对称但未阻塞功能
- [x] [Review][Defer] **`AcpSessionTerminated` 在 executors.py 中 catch 分支实际死代码**(client 已内部 catch) — 清理交独立 refactor
- [x] [Review][Defer] **JSON-RPC id `str` vs `number` 碰撞**(`str(0) == str("0")`) — 边缘情况,spec 允许两种 id 类型,需要规范化层;交后续

#### Dismiss

- `AcpApprovalBridge` 写入已涵盖 `register_permission_request` 完整签名,类设计合理,只是未接入(归入 Decision D1-a 的 AC2 降级/补齐决策)
