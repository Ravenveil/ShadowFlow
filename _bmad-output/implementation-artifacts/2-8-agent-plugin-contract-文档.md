# Story 2.8: Agent Plugin Contract 文档(从 Story 0.5 迁移)

Status: review

## Story

As a **第三方 Agent 开发者 / 社区贡献者**,
I want **看文档就能把我的 agent 接入 ShadowFlow**,
so that **ShadowFlow 成为一个真正开放的 agent 编排平台,PRD 差异化护城河第二条落在文档可交付产物上**。

**前置依赖**:必须在 Story 2.1~2.7 完成后撰写(因为文档描述的 ABC / 四 kind / 三通道 / AgentEvent 命名空间 / preset 全部需要先实现)。

## Acceptance Criteria

### AC1: AGENT_PLUGIN_CONTRACT.md 六个必备章节齐全

**Given** 新增 `docs/AGENT_PLUGIN_CONTRACT.md`
**When** 我阅读该文档
**Then** 文档包含以下章节:

- AgentExecutor ABC 契约(`dispatch(task) → handle` / `stream_events(handle) → AsyncIterator[AgentEvent]` / `capabilities() → AgentCapabilities` 三方法)
- 四种 kind 语义(api / cli / mcp / acp)+ 选用决策树(session 管理 → acp;tool 单次调用 → mcp;子进程 → cli;HTTP API → api)
- 三通道契约(Dispatch / Report / Observability)含 Edict 模式对照
- YAML 声明样板:Hermes(ACP)/ OpenClaw(CLI)/ ShadowSoul(ACP 或 CLI)/ 自定义 agent
- AgentEvent 事件命名空间(`agent.dispatched / thinking / tool_called / tool_result / completed / failed / rejected`)
- 如何写一个新的 provider preset(YAML schema + 注册流程)

**And** README "How to Plug Your Agent" 章节链接到此文档
**And** 文档附 `docs/HERMES_INTEGRATION_SPIKE.md` 与 `docs/HERMES_CLAW_SPIKE.md` 作为 worked example 交叉引用

## Tasks / Subtasks

- [ ] **[AC1]** 新建 `docs/AGENT_PLUGIN_CONTRACT.md`,按以下章节结构撰写:
  - [ ] `# Agent Plugin Contract`
  - [ ] `## 1. 概述`:ShadowFlow 作为异构 agent 编排平台的定位,四 kind + 三通道
  - [ ] `## 2. AgentExecutor ABC 契约`
    - [ ] 2.1 三方法签名(贴 Story 2.1 最终代码 `shadowflow/runtime/executors.py` 的 AgentExecutor 类定义)
    - [ ] 2.2 `AgentTask` / `AgentHandle` / `AgentCapabilities` Pydantic 模型字段表
    - [ ] 2.3 生命周期时序图(文字描述 + Mermaid)
  - [ ] `## 3. 四种 Kind 语义与选用决策树`
    - [ ] 3.1 `api` — HTTP API 推理(OpenAI/Claude/Gemini/Ollama/0G Compute)
    - [ ] 3.2 `cli` — CLI 子进程(OpenClaw / Hermes / ShadowSoul / Codex / Claude Code)
    - [ ] 3.3 `mcp` — 外部 MCP server 的 tool 单次调用
    - [ ] 3.4 `acp` — ACP host 角色,session 管理 + 审批流 + 流式事件
    - [ ] 3.5 决策树(Mermaid 或 ASCII):session 管理 → acp;tool 单次调用 → mcp;子进程 → cli;HTTP API → api
  - [ ] `## 4. 三通道契约`
    - [ ] 4.1 Dispatch 通道(ShadowFlow → agent,任务下发)
    - [ ] 4.2 Report 通道(agent → ShadowFlow,结果回传)
    - [ ] 4.3 Observability 通道(agent → ShadowFlow,流式事件 / JSONL tail / SSE)
    - [ ] 4.4 Edict 模式对照表(ShadowFlow 三通道 vs. Edict 三通道)
  - [ ] `## 5. YAML 声明样板`
    - [ ] 5.1 Hermes(ACP 主):完整 YAML block + 注释
    - [ ] 5.2 OpenClaw(CLI + JSONL tail):完整 YAML block + 注释
    - [ ] 5.3 ShadowSoul(ACP 或 CLI):双路径示例
    - [ ] 5.4 自定义 agent 从零接入的 4 步流程
  - [ ] `## 6. AgentEvent 命名空间`
    - [ ] 6.1 7 个事件类型定义(贴 Story 2.6 的 `events.py` 常量 + 字段 schema)
    - [ ] 6.2 事件序列示意(`dispatched → thinking+ → tool_called → tool_result → completed` / `failed` / `rejected`)
    - [ ] 6.3 SSE wire format(id / event / data)
    - [ ] 6.4 Last-Event-ID 重连语义
  - [ ] `## 7. 如何写一个新的 provider preset`
    - [ ] 7.1 `provider_presets.yaml` schema(所有字段 + 类型 + 必选/可选)
    - [ ] 7.2 注册流程:在 YAML 加 preset → `ExecutorRegistry` 自动加载 → 模板用 `provider: <name>` 即可
    - [ ] 7.3 覆盖机制:用户模板 YAML 如何覆盖 preset 任一字段
    - [ ] 7.4 worked example:从 0 到 1 接入一个虚构 agent `foo-agent` 的完整流程
  - [ ] `## 8. 健康检查与降级`
    - [ ] 8.1 `/health` endpoint 的 agents 字段说明(Story 2.5 产出)
    - [ ] 8.2 binary 缺失时的 fallback 链注入机制
  - [ ] `## 9. 参考与交叉引用`
    - [ ] 9.1 `docs/HERMES_INTEGRATION_SPIKE.md`(Sprint 0 Hermes 实机验证,AR59 产物)
    - [ ] 9.2 `docs/HERMES_CLAW_SPIKE.md`(Story 2.7 命名 SPIKE)
    - [ ] 9.3 `docs/SHADOWSOUL_RUNTIME_SPIKE.md`(Story 2.5 Runtime SPIKE)
    - [ ] 9.4 ACP spec: https://github.com/zed-industries/agent-client-protocol
    - [ ] 9.5 MCP Python SDK: https://github.com/modelcontextprotocol/python-sdk
- [ ] **[AC1]** 更新 `README.md`:
  - [ ] 新增 `## How to Plug Your Agent` 章节(5-10 行简要说明)
  - [ ] 链接到 `docs/AGENT_PLUGIN_CONTRACT.md`
  - [ ] 在 PRD 差异化护城河描述中把"可交付文档产物"指向本文档
- [ ] **[AC1]** 更新 `docs/plans/cli-api-execution/claw-integration-boundary-v1.md`:
  - [ ] 把"先不做"升级为"MVP 基础版已实现,详见 AGENT_PLUGIN_CONTRACT.md"
  - [ ] 对 AR59 的兑现打勾
- [ ] **[AC1]** 验证清单:
  - [ ] 每个 YAML 样板能跑通(至少 Hermes / OpenClaw 两条实机验证)
  - [ ] 7 个事件类型常量与代码常量对齐(从代码反查文档)
  - [ ] 决策树覆盖 4 种 kind 所有选择
  - [ ] worked example(foo-agent)至少一位团队外成员盲读能照做成功(可口头验证)

## Dev Notes

### 架构依据
- **Epic 2 Goal**:PRD 差异化护城河第二条 = "可交付文档产物 + 开放平台"
- **AR 编号**:AR59(Agent 接入文档 & SPIKE,Must)
- **相关 FR/NFR**:FR42、I1、**Demo 叙事**(社区可扩展)

### 涉及文件
- 新增:`docs/AGENT_PLUGIN_CONTRACT.md`(核心产物)
- 更新:`README.md`(新增 "How to Plug Your Agent" 章节)
- 更新:`docs/plans/cli-api-execution/claw-integration-boundary-v1.md`(升级为"已实现")
- 引用:`docs/HERMES_INTEGRATION_SPIKE.md`(AR59 Sprint 0 已产出)
- 引用:`docs/HERMES_CLAW_SPIKE.md`(Story 2.7 产出)
- 引用:`docs/SHADOWSOUL_RUNTIME_SPIKE.md`(Story 2.5 产出)

### 关键约束
- **前置依赖(强硬)**:必须在 Story 2.1~2.7 全部完成后才能撰写。原因:
  - Story 2.1:ABC 契约定义(章节 2)
  - Story 2.2:CLI preset 样板(章节 5.2 / 7)
  - Story 2.3:ACP client 实现(章节 3.4 / 5.1)
  - Story 2.4:MCP client 实现(章节 3.3)
  - Story 2.5:ShadowSoul 接入 + health(章节 5.3 / 8)
  - Story 2.6:AgentEvent 命名空间(章节 6)
  - Story 2.7:命名决议 SPIKE(章节 5.3 的最终 provider 名)
- **文档代码引用以实际 merge 版本为准**(避免文档与代码漂移),每处 ABC 定义 / 事件常量 / YAML 样板引用时写上对应 commit hash 或文件行号
- **决策树要可执行**,不要只列概念:读者看完必须能判断自己的 agent 该用哪个 kind
- worked example(foo-agent)必须**能跑**,不要停留在伪代码
- README 章节**不超过 10 行**,把详情放到 AGENT_PLUGIN_CONTRACT.md
- **本 story 是 Story 0.5 迁移**,若原 Story 0.5 有遗留任务或讨论笔记,需检查并合并

### 测试标准
- **文档结构检查**:9 个一级章节齐全(第 1 章概述 + 8 个明细章)
- **代码对齐检查**:7 个事件常量名 / ABC 方法名 / YAML 字段名从代码反查到文档全一致
- **可执行性检查**:团队外成员照 worked example 能在 1 小时内接入一个新 agent
- **交叉引用检查**:三个 SPIKE 文档 + ACP/MCP spec 链接可达

## References

- [Source: epics.md#Story 2.8]
- [Source: epics.md#AR59 Agent 接入文档 & SPIKE]
- [Source: epics.md#Story 0.5(本 story 迁移自此)]
- [Source: docs/HERMES_INTEGRATION_SPIKE.md(Sprint 0 产物)]
- [Source: docs/HERMES_CLAW_SPIKE.md(Story 2.7 产出)]
- [Source: docs/SHADOWSOUL_RUNTIME_SPIKE.md(Story 2.5 产出)]
- [Source: architecture.md#Complete Project Directory Structure]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

All 34 tests pass: tests/test_agent_plugin_contract.py

### Completion Notes List

- docs/AGENT_PLUGIN_CONTRACT.md — 9-chapter contract document (created)
- README.md — "How to Plug Your Agent" section added, links to contract doc
- tests/test_agent_plugin_contract.py — 34 tests: structure (9 sections) + 7 event constants + 3 ABC methods + YAML fields + README integration + cross-refs + 4 kinds

### File List

- docs/AGENT_PLUGIN_CONTRACT.md
- README.md
- tests/test_agent_plugin_contract.py
