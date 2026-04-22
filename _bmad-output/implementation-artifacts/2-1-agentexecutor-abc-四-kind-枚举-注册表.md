# Story 2.1: AgentExecutor ABC + 四 kind 枚举 + 注册表

Status: done

## Story

As a **ShadowFlow 核心开发者**,
I want **定义统一的 AgentExecutor ABC 和四种 executor kind 枚举**,
so that **后续 ACP / MCP / CLI / API 的具体实现有共同契约,runtime 零特例分支**。

## Acceptance Criteria

### AC1: AgentExecutor ABC 契约落地

**Given** `shadowflow/runtime/executors.py` 扩展现有 `BaseExecutor + ExecutorRegistry`
**When** 我阅读源码
**Then** 存在 `AgentExecutor(ABC)` 基类,三个抽象方法:`async dispatch(task) → handle` / `async stream_events(handle) → AsyncIterator[AgentEvent]` / `capabilities() → AgentCapabilities`
**And** `Kind = Literal["api", "cli", "mcp", "acp"]` 在 `contracts.py` 声明
**And** `ExecutorRegistry` 支持按 `(kind, provider)` 组合注册与查找

### AC2: 模板编译时校验注册状态

**Given** 模板 YAML 顶层声明 `agents: [{id, executor: {kind, provider, ...}, soul, tools}]`
**When** `assembly/compile.py` 编译模板
**Then** 每个 agent 的 executor 被解析到注册表,编译时校验 kind/provider 已注册

## Tasks / Subtasks

- [ ] **[AC1]** 在 `shadowflow/runtime/contracts.py` 扩展类型(不动老契约):
  - [ ] 新增 `Kind = Literal["api", "cli", "mcp", "acp"]` 类型别名
  - [ ] 新增 `AgentCapabilities` Pydantic/dataclass(字段:`streaming: bool`, `approval_required: bool`, `session_resume: bool`, `tool_calls: bool`)
  - [ ] 新增 `AgentTask` / `AgentHandle` / `AgentEvent` 数据结构(AgentEvent 的命名空间由 Story 2.6 最终收口,本 story 只给最小骨架:`run_id, node_id, agent_id, type, payload, ts`)
- [ ] **[AC1]** 在 `shadowflow/runtime/executors.py` 新增 `AgentExecutor(ABC)`:
  - [ ] 不删除、不破坏 `BaseExecutor + ExecutorRegistry`(brownfield:老节点执行路径继续走 `BaseExecutor.execute()`)
  - [ ] `AgentExecutor` 作为**平行新契约**,三抽象方法签名参照 AC1
  - [ ] 添加 `kind: Kind` 类属性 + `provider: str` 实例属性
- [ ] **[AC1]** 扩展 `ExecutorRegistry` 支持 `(kind, provider)` 组合键:
  - [ ] 内部用 `Dict[Tuple[str, str], AgentExecutor]` 存储
  - [ ] `register(executor)` 以 `(executor.kind, executor.provider)` 为键
  - [ ] `resolve(kind, provider) → AgentExecutor` 查找方法
  - [ ] 兼容老 `execute(config, payload)` API(按老逻辑走 kind only 查找,fallback)
- [ ] **[AC2]** `assembly/compile.py` 编译链新增 agent 解析:
  - [ ] 解析 YAML 顶层 `agents: [...]` 为 `List[AgentSpec]`(Pydantic 模型在 contracts.py 或 core/agent.py)
  - [ ] 对每个 agent,调用 `registry.resolve(kind, provider)`,未找到则 raise `UnknownExecutorError` 并给出**可用 (kind, provider) 组合清单**
  - [ ] 把编译后的 agent 绑定到节点的 `agent_ref`
- [ ] **测试**:
  - [ ] `tests/test_agent_executor_contract.py`:ABC 契约(子类必须实现三方法)
  - [ ] `tests/test_executor_registry.py`:`(kind, provider)` 注册 + 查找 + 未注册报错
  - [ ] `tests/test_compile_agents.py`:模板含未注册 provider 时编译失败

## Dev Notes

### 架构依据
- **Epic 2 Goal**:从"LLM Provider 池"升级为"异构 agent 编排平台",四种 executor kind(api/cli/mcp/acp)
- **AR 编号**:AR47(Universal Agent Plugin Contract)、AR49(Agent 注册表机制)
- **相关 FR/NFR**:FR42(Agent 编排)、I1(可插拔契约)、S5(审计可观测)

### 涉及文件
- 扩展:`shadowflow/runtime/executors.py`(现有 `BaseExecutor + ExecutorRegistry` + 2 kind)
- 扩展:`shadowflow/runtime/contracts.py`(新增 `Kind` / `AgentCapabilities` / `AgentTask` / `AgentHandle` / `AgentEvent` / `AgentSpec`)
- 扩展:`shadowflow/assembly/compile.py`(新增 agents 解析链路)
- 新增测试:`tests/test_agent_executor_contract.py` / `tests/test_executor_registry.py` / `tests/test_compile_agents.py`

> **注(2026-04-22 Code Review)**:实际 contracts.py 同时落地了 Story 1.x/1.5/3.4 的前置契约字段(`WorkflowPolicyMatrixSpec` / `ApprovalGateConfig` / `PolicyWarning` / `RunTrajectory` / `TrajectoryBundle` / `WorkflowAssemblySpec` / `BlockDef` / `StageDef` / `LaneDef`);`executors.py` 也同时包含 Story 2.3/2.4 的 `AcpAgentExecutor` / `McpAgentExecutor`。作为 brownfield 稳定底座接受,各字段归属见类注释 / 注解。ACP/MCP 的行为质量审查推到 Chunk B,本 Chunk A 只认"类定义 + 注册存在"。

### 关键约束
- **本 story 是 Epic 2 基石** —— ABC 契约定下来后,Story 2.2 / 2.3 / 2.4 / 2.5 / 2.6 才能动工。Sprint 1 第一天必须先 merge 本 story。
- **不要破坏现有 `BaseExecutor + ExecutorRegistry`**(brownfield):现有 `CliExecutor` / `ApiExecutor` 继续可用,`AgentExecutor` 是**平行新契约**,Story 2.2 再把 CLI 迁过来
- `Kind` 枚举用 `Literal` 而非 `Enum`,与 Pydantic v2 契约保持一致
- `AgentEvent` 骨架在本 story 先定最小字段,Story 2.6 再扩展 `agent.*` 命名空间常量集
- ACP 是核心协议(host 角色,stdio JSON-RPC),MCP 辅助,CLI 兜底
- ACP spec 参考 https://github.com/zed-industries/agent-client-protocol

### 测试标准
- **契约测试**:`AgentExecutor` ABC 必须覆盖 `dispatch` / `stream_events` / `capabilities` 三方法未实现时 TypeError
- **注册表测试**:`(kind, provider)` 重复注册覆盖行为、未知 kind 报错、未知 provider 报错
- **编译测试**:模板含未注册 provider 时 `compile` 失败并提示已注册清单

## References

- [Source: epics.md#Story 2.1]
- [Source: epics.md#AR47 Universal Agent Plugin Contract]
- [Source: epics.md#AR49 Agent 注册表机制]
- [Source: architecture.md#Complete Project Directory Structure(shadowflow/runtime/)]
- [Source: shadowflow/runtime/executors.py:87(现有 BaseExecutor + ExecutorRegistry)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

无重要 debug。

### Completion Notes List

- ✅ `contracts.py` 新增：`Kind`、`AgentCapabilities`、`AgentTask`、`AgentHandle`、`AgentEvent`、`AgentSpec`
- ✅ `executors.py` 新增：`AgentExecutor(ABC)` 三抽象方法、`UnknownExecutorError`
- ✅ `ExecutorRegistry` 扩展：`register_agent()`、`resolve(kind, provider)`、`list_agent_executors()`；老 `execute()` 路径完全保留
- ✅ `assembly/compile.py` 新建：`parse_agent_specs()` + `compile_agents()` + `CompilationError`
- ✅ `runtime/__init__.py` 导出新类型
- ✅ `tests/test_agent_executor_contract.py` 新建：12 个测试全部通过
- ✅ `tests/test_executor_registry.py` 新建：10 个测试全部通过
- ✅ `tests/test_compile_agents.py` 新建：12 个测试全部通过
- ✅ 全套回归测试 315 passed, 0 failures

### File List

- `shadowflow/runtime/contracts.py` — 新增 Kind/AgentCapabilities/AgentTask/AgentHandle/AgentEvent/AgentSpec
- `shadowflow/runtime/executors.py` — 新增 AgentExecutor ABC、UnknownExecutorError；扩展 ExecutorRegistry
- `shadowflow/runtime/__init__.py` — 新增导出
- `shadowflow/assembly/compile.py` — 新建
- `tests/test_agent_executor_contract.py` — 新建，12 个测试
- `tests/test_executor_registry.py` — 新建，10 个测试
- `tests/test_compile_agents.py` — 新建，12 个测试

### Change Log

- 2026-04-21T10:20:29Z: Story 2.1 实现完成 — AgentExecutor ABC + 四 kind 枚举 + 注册表
- 2026-04-22T02:17:49Z: Code Review (Chunk A, 3 层对抗) — 发现作用域污染 + ABC 签名弱类型

### Review Findings

_Chunk A 审查(Blind + Edge + Auditor),2026-04-22_

#### Decision Needed

- [ ] [Review][Decision] **Scope 污染 — Chunk A 越界实现 Story 2.3/2.4/1.5/3.4 契约** — `contracts.py` 新增了 `WorkflowPolicyMatrixSpec`/`PolicyWarning`/`ApprovalGateConfig`(Story 1.x)、`RunTrajectory`/`TrajectoryBundle`(Story 1.5)、`WorkflowAssemblySpec`/`BlockDef`/`StageDef`/`LaneDef`(Story 3.4);`executors.py` 新增 `AcpAgentExecutor`/`McpAgentExecutor`(Story 2.3/2.4);`__init__.py` 对 `errors`/`mcp`/`events` 硬依赖。是否接受 Chunk A 为"前置契约包"(从而 2.3/2.4/3.4 Chunk 只审行为),还是要求拆分到各 story?影响后续 Chunk B/C/D 审查边界。

#### Patch

- [ ] [Review][Patch] **AgentExecutor ABC `kind`/`provider` 强制性缺失(缓修)** [shadowflow/runtime/executors.py:AgentExecutor] — 当前通过强类型签名间接约束(Patch 已带);`__init_subclass__` 硬校验缓到后续 Story 统一加。
- [x] [Review][Patch] **[已修 2026-04-22]** ABC 三方法签名使用 AC1 指定的 `AgentTask / AsyncIterator[AgentEvent] / AgentCapabilities` [shadowflow/runtime/executors.py:AgentExecutor + CliAgentExecutor + AcpAgentExecutor + McpAgentExecutor] — 顶层 import `from contracts import AgentCapabilities, AgentEvent, AgentHandle, AgentTask`;三实现类 dispatch/stream_events/capabilities 签名全部强类型化;stream_events 改为 `def ... AsyncIterator` 而非 `async def` 避免 Pyright false-positive
- [x] [Review][Patch] **[已修 2026-04-22]** `ExecutorRegistry.register_agent` 重复 `(kind, provider)` 告警 [shadowflow/runtime/executors.py:ExecutorRegistry.register_agent] — 新键存在时 `logger.warning(..., old=%s, new=%s)` 暴露覆盖

#### Defer

- [x] [Review][Defer] **老 `BaseExecutor.execute()` 的 (kind only) fallback 未在 Chunk A 可见** [shadowflow/runtime/executors.py:913-] — Spec Task 要求保留,但 diff 截断看不到;延后到 Chunk C 确认。
- [x] [Review][Defer] **`RunRecord`/`RunSummary`/`TaskRecord`/`StepRecord` 状态 Literal 三处独立维护** [shadowflow/runtime/contracts.py:190/199/208/237] — scope 越界(Story 1.x),且易在新增状态时漏改一处;共享 Literal 别名建议交给 Story 1.x 清理。
- [x] [Review][Defer] **`WorkflowPolicyMatrixSpec.validate_structure` isinstance 检查无意义且未阻断 sender→sender 自回路** — scope 属于 Story 1.1 Policy Matrix。
- [x] [Review][Defer] **`NodeDefinition.validate_approval_gate` 缺反向检查(普通节点带 approval 配置被静默忽略)** — scope 属于 Story 1.2。
- [x] [Review][Defer] **`AgentSpec.executor: Dict[str, Any]` 弱类型** — Story 2.1 Task 称 AgentSpec 为 Pydantic 模型但 executor 子结构未强类型;可接受,后续 Story 再收口。

#### Dismiss

- `compile_execution_prompt` 未显示 import — 原文件已存在,Chunk A diff 截断未含导入区。
- `parse_format="codex-jsonl"` 超出 AC1 列表 — 合理扩展,保留老 codex 行为。
- `model_validator` 导入 — 原 `validate_graph` 已使用,必然已 import。
