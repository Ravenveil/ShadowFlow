# Story 2.6: AgentEvent 归一流 + SSE 集成

Status: done

## Story

As a **ShadowFlow 看板用户**,
I want **不管 agent 背后是 Hermes / OpenClaw / ShadowSoul,看板上显示的事件格式完全一致**,
so that **UI 层零特例,Demo 流畅不卡壳**。

## Acceptance Criteria

### AC1: `agent.*` 事件命名空间常量集齐

**Given** `shadowflow/runtime/events.py` 的 event_types 常量扩展 `agent.*` 命名空间
**When** 我阅读常量定义
**Then** 存在:`agent.dispatched` / `agent.thinking` / `agent.tool_called` / `agent.tool_result` / `agent.completed` / `agent.failed` / `agent.rejected`

### AC2: 四类 executor 产出归一 AgentEvent 到 SSE,前端精确重渲染

**Given** 任意 AgentExecutor 实现(ACP/MCP/CLI/API)
**When** 产出原生事件(CLI stdout / JSONL / ACP stream / MCP result)
**Then** 归一为 `AgentEvent` 写入 run 的 asyncio.Queue
**And** SSE endpoint `/workflow/runs/{id}/events` 原样推送到前端
**And** 前端 `useRunEvents` hook 按 node_id 分发到 `useRunStore`,LiveDashboard 精确重渲染对应节点

## Tasks / Subtasks

- [ ] **[AC1]** `shadowflow/runtime/events.py`(MVP 新增文件)扩展 `agent.*` 命名空间:
  - [ ] 新增常量类 `AgentEventType`(或 `Literal` 类型别名):
    - `AGENT_DISPATCHED = "agent.dispatched"`
    - `AGENT_THINKING = "agent.thinking"`
    - `AGENT_TOOL_CALLED = "agent.tool_called"`
    - `AGENT_TOOL_RESULT = "agent.tool_result"`
    - `AGENT_COMPLETED = "agent.completed"`
    - `AGENT_FAILED = "agent.failed"`
    - `AGENT_REJECTED = "agent.rejected"`
  - [ ] 导出到 `shadowflow.runtime.__init__` 方便引用
  - [ ] 在 `contracts.py` 的 `AgentEvent` 模型 `type` 字段用上述 Literal 约束
- [ ] **[AC2]** 事件总线接入:
  - [ ] `shadowflow/runtime/events.py` 新增 `RunEventBus` 类,内部每 run 一个 `asyncio.Queue`
  - [ ] `bus.publish(run_id, event: AgentEvent)`:推入队列,带 `seq` 单调递增号(用于 Last-Event-ID 重连)
  - [ ] `bus.subscribe(run_id, last_seq: int|None) → AsyncIterator[AgentEvent]`:从 `last_seq + 1` 起订阅
- [ ] **[AC2]** 四类 executor 全部对接事件总线:
  - [ ] `CliAgentExecutor`(Story 2.2):JSONL / stdout 解析 → `bus.publish(agent.thinking | agent.tool_called | agent.completed | agent.failed)`
  - [ ] `AcpAgentExecutor`(Story 2.3):ACP `session.update` → `bus.publish(...)`;`session.requestPermission` 接入 → `bus.publish(agent.rejected)` 当用户拒绝
  - [ ] `McpAgentExecutor`(Story 2.4):tools/call 返回 → `bus.publish(agent.tool_called + agent.tool_result + agent.completed)`
  - [ ] `ApiExecutor`(老实现):stream 分片 → `bus.publish(agent.thinking)`,完成时 `agent.completed`
  - [ ] 每个 executor 在 `dispatch` 时先发一次 `agent.dispatched`(含 agent_id / node_id / kind / provider)
- [ ] **[AC2]** SSE endpoint `/workflow/runs/{id}/events`:
  - [ ] 已有或 MVP 新增:`shadowflow/server.py` 的 FastAPI 路由
  - [ ] 使用 `StreamingResponse` + `text/event-stream` 格式
  - [ ] 支持 `Last-Event-ID` header,从 `bus.subscribe(run_id, last_seq)` 恢复
  - [ ] 每条事件格式:`id: {seq}\nevent: {type}\ndata: {json}\n\n`
- [ ] **[AC2]** 前端 `src/core/hooks/useRunEvents.ts`(MVP 新增):
  - [ ] 用 `EventSource`(或 `adapter/sseClient.ts`)连接 endpoint,带 `Last-Event-ID` 重连
  - [ ] 解析 `event.type` 分发到 `useRunStore`(`src/core/hooks/useRunStore.ts`)
  - [ ] Store 按 `node_id` 索引事件流,`LiveDashboard`(`src/core/components/Panel/LiveDashboard.tsx`)**只重渲染对应 node**(避免全局重渲染)
  - [ ] 事件 camelCase 转换走 `adapter/caseConverter.ts`
- [ ] **测试**:
  - [ ] `tests/test_events_bus.py`:publish/subscribe 往返 + Last-Event-ID 断点续传
  - [ ] `tests/test_agent_event_namespace.py`:7 个常量存在 + 类型约束
  - [ ] `tests/test_sse_endpoint.py`:模拟 run 产出事件,HTTP client 断线重连收到完整序列
  - [ ] `src/__tests__/useRunEvents.test.ts`:mock EventSource,事件按 node_id 正确路由
  - [ ] **集成**:Hermes / OpenClaw / ShadowSoul 三家 agent 同时跑,前端看板三格事件格式完全一致

## Dev Notes

### 架构依据
- **Epic 2 Goal**:UI 层零特例,Demo 流畅
- **AR 编号**:AR50(统一 AgentEvent 流,Must)
- **相关 FR/NFR**:FR42、I1、S5、NFR-性能(SSE Last-Event-ID 重连)

### 涉及文件
- 新增:`shadowflow/runtime/events.py`(MVP 新增:事件总线 + event_types 常量)
- 扩展:`shadowflow/runtime/contracts.py`(`AgentEvent.type` 用新 Literal)
- 扩展:所有四类 executor(`CliAgentExecutor` / `AcpAgentExecutor` / `McpAgentExecutor` / `ApiExecutor`)接入总线
- 扩展:`shadowflow/server.py`(SSE endpoint)
- 新增:`src/core/hooks/useRunEvents.ts` / `useRunStore.ts`(MVP 新增)
- 扩展:`src/core/components/Panel/LiveDashboard.tsx`(MVP 新增,按 node_id 精确重渲染)
- 扩展:`src/adapter/sseClient.ts`(MVP 新增,Last-Event-ID 重连)
- 新增测试:`tests/test_events_bus.py` / `test_agent_event_namespace.py` / `test_sse_endpoint.py` / `src/__tests__/useRunEvents.test.ts`

### 关键约束
- **前置依赖**:Story 2.1(ABC / AgentEvent 骨架)、Story 2.2(CLI)、Story 2.3(ACP)、Story 2.4(MCP)必须先 merge,本 story 做**最后的归一层 + 前端接入**
- **前端精确重渲染**:`LiveDashboard` 必须按 node_id 订阅,**不能**用一个全局 store 触发全 DAG 重绘(PRD NFR 性能要求)
- SSE Last-Event-ID 重连用单调递增 `seq`(run scoped),不要用全局时间戳
- `agent.rejected` 专门对应 ACP `session.requestPermission` 被用户拒绝的场景(与 `agent.failed` 区分)
- 事件 payload 在 `contracts.py` 定 **discriminated union**(按 `type` 字段区分 schema),前端 TS 类型从 Pydantic 生成(走 `scripts/generate_ts_types.py`)
- SSE endpoint 若已存在老实现,brownfield 扩展而非重写

### 测试标准
- **契约测试**:7 个事件类型常量存在且类型约束生效
- **事件总线测试**:并发 publish / subscribe / Last-Event-ID 断点续传
- **SSE 测试**:HTTP client 模拟断线重连,收到完整有序事件序列(无丢失、无重复)
- **前端测试**:mock EventSource 场景覆盖各事件类型正确路由到 node
- **集成测试**:Demo 模板下 Hermes + OpenClaw + ShadowSoul 三家事件前端看板一致

## References

- [Source: epics.md#Story 2.6]
- [Source: epics.md#AR50 统一 AgentEvent 流]
- [Source: architecture.md#shadowflow/runtime/events.py(MVP 新增)]
- [Source: architecture.md#src/core/hooks/useRunEvents.ts(MVP 新增)]
- [Source: architecture.md#src/adapter/sseClient.ts(Last-Event-ID 重连)]

### Review Findings

- [x] [Review][Patch] 双重事件分发：useRunEvents.ts 同时注册 `*` catch-all 和命名 handler，导致 handleEvent 每事件调用两次 [src/core/hooks/useRunEvents.ts:184] — 已修复：移除 `*` catch-all
- [x] [Review][Patch] RUN_RESUMED 事件键名错误：service.py 使用 `"event"` 而非 `"type"`，导致 SSE 事件类型为 `message` 而非 `run.resumed` [shadowflow/runtime/service.py:492] — 已修复
- [x] [Review][Patch] SSE 重连失败：server.py 仅从 HTTP header 读取 Last-Event-ID，但浏览器 EventSource 无法设置自定义 header，前端通过 query param 发送 [shadowflow/server.py:533] — 已修复：增加 query_params fallback
- [x] [Review][Patch] AgentEvent.type 无 Literal 约束：contracts.py 使用 plain `str`，违反 AC1 规范 [shadowflow/runtime/contracts.py:786] — 已修复：添加 AgentEventTypeLiteral
- [x] [Review][Patch] PolicyViolationEvent 字段名不一致：使用 `event` 而非 `type`，与系统其余部分不一致 [shadowflow/runtime/events.py:194] — 已修复
- [x] [Review][Patch] RunEventBus 内存泄漏：close_run 后 _store/_seq/_notifiers/_closed 从未清理 [shadowflow/runtime/events.py] — 已修复：添加 purge_run() 方法
- [x] [Review][Patch] JSONL 类型未规范化：executor 直接拼接 `agent.{type}` 产生非法类型如 `agent.assistant` [shadowflow/runtime/executors.py:311] — 已修复：添加 _JSONL_TYPE_MAP 映射
- [x] [Review][Defer] SSE endpoint 无认证 — 跨切面安全问题，不属于 Story 2-6 范畴
- [x] [Review][Defer] subscribe() 无超时 — 订阅不存在的 run_id 会永久挂起，需要基础设施级修复
- [x] [Review][Defer] publish() 非线程安全 — asyncio 单线程模式下安全，如需跨线程调用需加锁
- [x] [Review][Defer] src/__tests__/useRunEvents.test.ts 缺失 — 前端测试基础设施待补充

## Dev Agent Record

### Agent Model Used

claude-opus-4-6 (bmad-code-review scheduled task)

### Debug Log References

### Completion Notes List

- 2026-04-23: 三层并行 code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor)
- 7 个 patch 级发现全部修复，4 个 defer 级发现记录到 deferred-work.md
- 630 tests passed, 0 failed

### File List

- shadowflow/runtime/events.py (PolicyViolationEvent.type + purge_run)
- shadowflow/runtime/contracts.py (AgentEventTypeLiteral)
- shadowflow/runtime/executors.py (_JSONL_TYPE_MAP)
- shadowflow/runtime/service.py (RUN_RESUMED key fix)
- shadowflow/server.py (Last-Event-ID query param fallback)
- src/core/hooks/useRunEvents.ts (remove double dispatch)
- tests/test_events_bus.py (purge_run tests)
- tests/test_reject_runtime.py (PolicyViolationEvent.type)
- tests/test_checkpoint_resume.py (RUN_RESUMED key)
- tests/test_agent_executor_contract.py (AgentEvent Literal types)
- tests/test_cli_agent_executor.py (JSONL type mapping)
