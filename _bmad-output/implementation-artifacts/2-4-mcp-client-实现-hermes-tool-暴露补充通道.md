# Story 2.4: MCP Client 实现(Hermes tool 暴露补充通道)

Status: review

## Story

As a **模板作者**,
I want **把 Hermes 的能力当作 tool 单次调用**(非 session 管理),
so that **对于简单的"查某信息"场景不需要完整 ACP session,走 MCP 更轻量**。

## Acceptance Criteria

### AC1: MCP client 能连接 server 并单次 tool 调用

**Given** 模板声明 `executor: {kind: "mcp", server: "stdio://hermes mcp serve", tool: "run_agent"}`
**When** Runtime dispatch
**Then** ShadowFlow 用 `mcp` Python SDK 连接 MCP server
**And** 发送 `tools/call` 请求,接收单次 tool result
**And** 归一成 `AgentEvent`(agent.tool_called + agent.completed)

### AC2: MCP 故障返回明确错误码

**Given** MCP server 启动失败或 tool 不存在
**When** dispatch 时报错
**Then** 返回清晰错误 `{code: "MCP_SERVER_UNAVAILABLE" | "MCP_TOOL_NOT_FOUND"}`

## Tasks / Subtasks

- [ ] **[AC1]** `pyproject.toml` 新增依赖 `mcp>=1.0`(官方 Python SDK)
- [ ] **[AC1]** 新建 `shadowflow/runtime/mcp/` 子模块:
  - [ ] `__init__.py`
  - [ ] `transport.py`:封装 MCP SDK 的 stdio / http 传输选择(解析 `server: "stdio://..."` 与 `server: "http://..."` 两种前缀)
  - [ ] `client.py`:`McpClient` 类,暴露 `async connect()` / `async list_tools()` / `async call_tool(name, args)` / `async close()`
- [ ] **[AC1]** 实现 `McpAgentExecutor(AgentExecutor)`,`kind = "mcp"`:
  - [ ] `dispatch(task)`:解析 `executor.server` → `transport.connect()` → `list_tools()` 校验 `tool` 存在 → 返回 `AgentHandle(client, tool_name, args)`
  - [ ] `stream_events(handle)`:发 `tools/call` → 产出 `agent.tool_called` 事件(含 tool + args) → 接收 result → 产出 `agent.tool_result` + `agent.completed`
  - [ ] `capabilities()`:`AgentCapabilities(streaming=False, approval_required=False, session_resume=False, tool_calls=True)`
- [ ] **[AC1]** 在 `ExecutorRegistry` 注册 `(kind="mcp", provider="generic")` 与 `(kind="mcp", provider="hermes")`(默认 server `stdio://hermes mcp serve`)
- [ ] **[AC2]** 故障码:
  - [ ] 新建 `shadowflow/runtime/errors.py`(若 MVP 新增已存在则扩展)的 `McpError` 类
  - [ ] MCP server 启动 subprocess 失败 / connect timeout → `McpError(code="MCP_SERVER_UNAVAILABLE", detail=...)`
  - [ ] `list_tools()` 未命中 → `McpError(code="MCP_TOOL_NOT_FOUND", tool=..., available=[...])`
  - [ ] `tools/call` 返回 error → `McpError(code="MCP_TOOL_ERROR", detail=...)`
  - [ ] 错误归一进 `agent.failed` 事件的 payload
- [ ] **测试**:
  - [ ] `tests/test_mcp_client_connect.py`:stdio server mock → connect + list_tools
  - [ ] `tests/test_mcp_agent_executor.py`:完整 dispatch → tools/call → 归一事件
  - [ ] `tests/test_mcp_errors.py`:三种错误码在对应故障下触发

## Dev Notes

### 架构依据
- **Epic 2 Goal**:MCP 作为 tool 单次调用**辅助通道**(与 ACP 互补,不替代)
- **AR 编号**:AR53(MCP Client Executor,Should)
- **相关 FR/NFR**:FR42、I1

### 涉及文件
- 新增:`shadowflow/runtime/mcp/{__init__.py,transport.py,client.py}`
- 扩展:`shadowflow/runtime/executors.py`(注册 `McpAgentExecutor`)
- 扩展:`shadowflow/runtime/errors.py`(新增 `McpError` 类)
- 更新:`pyproject.toml`(新增 `mcp` SDK 依赖)
- 新增测试:`tests/test_mcp_client_connect.py` / `test_mcp_agent_executor.py` / `test_mcp_errors.py`

### 关键约束
- **前置依赖**:Story 2.1(AgentExecutor ABC)必须先 merge
- **MCP 与 ACP 互补,不替代**:ACP 管 session,MCP 管 tool call,同一个 Hermes 可同时走两条通道
- MCP 是 **tool call 级别**(一次性),不要把它误用作 session(session 场景应走 Story 2.3 ACP)
- MCP Python SDK(`pip install mcp`)是官方实现,不要自己从头写
- Hermes `mcp_serve.py` 是现成的 MCP server target,Sprint 1 可直接接入验证
- ShadowFlow 自己的 `shadowflow/mcp_server.py` 是**反向**的(ShadowFlow 作为 MCP server 暴露给外部),不要混淆

### 测试标准
- **契约测试**:`McpAgentExecutor` 实现 `AgentExecutor` ABC
- **集成测试**:用 Hermes `mcp_serve.py` 作为 server 真实跑通一次 tool 调用
- **故障测试**:server 未启动 / tool 名错误 / call 返回 error 三种场景均返回规范错误码

## References

- [Source: epics.md#Story 2.4]
- [Source: epics.md#AR53 MCP Client Executor]
- [Source: MCP Python SDK — https://github.com/modelcontextprotocol/python-sdk]
- [Source: Hermes `mcp_serve.py`]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List

### Change Log

- 2026-04-22T02:40:00Z: Code Review (Chunk B, 3 层对抗) — AC1 `http://` / `ws://` 半成品,AC2 `isError` 语义缺失,MCP SDK 跨任务 __aexit__ 违反 AnyIO

### Review Findings

_Chunk B 审查(Blind + Edge + Auditor),2026-04-22_

**Story 2.4 AC 完成度真相:AC1 勉强达成(stdio 单向),`http://` 解析通过但 connect 主动拒绝,`ws://` 完全不支持;AC2 错误码 2/3(`MCP_SERVER_UNAVAILABLE` / `MCP_TOOL_NOT_FOUND` 达成,`MCP_TOOL_ERROR` 未正确识别 MCP SDK 返回 `CallToolResult.isError=True` 的 tool-level 错误)。**

#### Decision Needed

- [ ] [Review][Decision] **MCP `http://` 半成品 + `ws://` 完全缺失** [shadowflow/runtime/mcp/transport.py:parse + client.py:connect] — parse 层支持 `http://` 但 connect 抛 `not supported`。(a) 接受 stdio-only 并删除 http/ws 解析死代码 + 更新 spec AC1 去掉 "http 前缀";(b) 补实现 http (+ SSE MCP) transport
- [ ] [Review][Decision] **`mcp>=1.0` 只在 pyproject.toml `[mcp]` extra 中声明(line 51-52 + 61)而非 default dependencies** — CI/Docker/一般 `pip install shadowflow` 不会拉取;运行 ACP+MCP 时会走 `ImportError` → `MCP_SERVER_UNAVAILABLE`。(a) 上移 `mcp>=1.0` 到 default deps;(b) 保留 extra + README/CI 明确要求 `pip install shadowflow[mcp]`;(c) 动态降级:MCP executor 未导入时仅 warning 不注册

#### Patch(待应用)

- [ ] [Review][Patch] **[CRITICAL]** MCP SDK `stdio_client` + `ClientSession` 跨任务 `__aexit__` 违反 AnyIO task scope [shadowflow/runtime/mcp/client.py:connect + close] — 当前 `connect()` 手动 `__aenter__` 存 self,`close()`(通常另一协程)`__aexit__` → MCP SDK 抛 `RuntimeError: Attempted to exit cancel scope in a different task`。改用 `AsyncExitStack` 或整个 `connect → call → close` 包在同一 `async with` 内
- [ ] [Review][Patch] **[HIGH]** `call_tool` 未识别 `CallToolResult.isError=True` 的 tool-level 错误 [shadowflow/runtime/mcp/client.py:call_tool + executors.py:McpAgentExecutor.stream_events] — MCP SDK 协议:tool 逻辑错误通过 `result.isError=True + content` 返回(非 exception);当前把 isError 结果当 `tool_result` 成功 yield,违反 AC2 "tools/call 返回 error → `MCP_TOOL_ERROR`"。改:`if result.isError: raise McpError(code="MCP_TOOL_ERROR", detail=result.content)`
- [ ] [Review][Patch] **[HIGH]** `AgentHandle.metadata` 塞活 `_mcp_client` 对象,JSON 序列化失败 [shadowflow/runtime/executors.py:McpAgentExecutor.dispatch] — 同 ACP handle 问题,改为 executor 实例内 registry;见 Story 2.3 Decision 配套
- [ ] [Review][Patch] **[MEDIUM]** `McpAgentExecutor` 每次 dispatch 重建 client,无连接复用,无超时 [shadowflow/runtime/executors.py:McpAgentExecutor.dispatch / stream_events] — 高并发冷启动 + hang server 直接卡死;加 `asyncio.wait_for(client.connect(), timeout=10)` + 考虑 `(server, tool)` 级别连接池
- [ ] [Review][Patch] **[MEDIUM]** `McpTransportConfig.parse` 用 `raw.split()` 不支持带空格路径 [shadowflow/runtime/mcp/transport.py:parse] — Windows `stdio://C:\Program Files\Hermes\hermes.exe mcp serve` 拆错;改 `shlex.split(raw, posix=os.name != "nt")`
- [ ] [Review][Patch] **[MEDIUM]** `McpClient.close` 幂等性靠 `None` 侥幸 [shadowflow/runtime/mcp/client.py:close] — 中途异常时 ctx 未被置 None,二次 close 会重入 `__aexit__` → `RuntimeError: Cannot reenter`;改 try/finally + 每个 ctx 单独 None-set
- [ ] [Review][Patch] **[LOW]** `ImportError` 分支不一致(`mcp` 根包 vs `mcp.client.stdio`)[shadowflow/runtime/mcp/client.py:connect] — 合并成一个 `MCP_SERVER_UNAVAILABLE + detail="mcp package version mismatch"`

#### Defer

- [x] [Review][Defer] **`McpAgentExecutor(provider="generic")` `default_server=""`,dispatch 必 raise `MCP_SERVER_UNAVAILABLE`** — 存在目的不明;交给 Story 2.8(Agent Plugin Contract 文档)说明使用方式
- [x] [Review][Defer] **MCP `stdio://sh -c 'evil'` 参数可执行注入** [shadowflow/runtime/mcp/transport.py:parse] — 虽用 `create_subprocess_exec` 不经 shell,但 URI 源自 YAML 模板是信任边界;交 Epic 5 Security Hardening
- [x] [Review][Defer] **`default_tool="run_agent"` 硬字符串相等,server 用 namespace 命名(如 `hermes.run_agent`)则立即 `MCP_TOOL_NOT_FOUND`** [shadowflow/runtime/executors.py:_build_mcp_executors] — 交给 Story 2.8 文档化命名约定

#### Dismiss

- "`list_tools()` 返回 `List[str]` 还是 `List[dict]`" — 经 code 验证 client.py:list_tools 返回 `[t.name for t in result.tools]`(List[str]),Chunk A carry-over 疑虑清除
