---
name: shadowflow-epics
title: ShadowFlow Epic & Story Breakdown
workflowType: epics-and-stories
project_name: ShadowFlow
user_name: Jy
status: in_progress
created: 2026-04-16T00:45:30Z
updated: 2026-04-16T00:45:30Z
stepsCompleted:
  - step-01-extract-requirements
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
completedAt: 2026-04-16
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - docs/plans/cli-api-execution/shadowflow-engine-scope-v1.md
  - docs/plans/cli-api-execution/shadowflow-engine-task-list-v1.md
  - docs/plans/cli-api-execution/shadowflow-workflow-assembly-contract-v1.md
  - docs/plans/cli-api-execution/shadowflow-shadow-cli-shadow-ui-boundary-v1.md
  - docs/plans/cli-api-execution/shadowflow-graph-projection-contract-v1.md
  - docs/plans/cli-api-execution/shadowflow-language-strategy-v1.md
reusableAssets:
  shadow_ui: "D:\\VScode\\TotalProject\\Shadow\\src\\core\\components"
  shadow_ui_reuse_policy: "非图渲染组件(sidebar/inspector/common atoms/editor)优先复制过来改造;图渲染保持 ReactFlow 原生,Shadow PixiJS+d3-force 留 Phase 2"
baseline:
  prd_version: v0.1 (2026-04-15)
  architecture_version: v1.0 (2026-04-15)
  code_baseline: shadowflow v0.3.0 (Alpha) - 19.7K Python + 35.7K React
  hackathon_deadline: 2026-05-16
---

# ShadowFlow - Epic Breakdown

## Overview

本文档提供 ShadowFlow 完整的 Epic 与 Story 拆分,基于 PRD v0.1(41 条 FR + 25 条 NFR)、Architecture v1.0(7+1 核心对象、10 项 MVP 能力映射)与 6 份 cli-api-execution 研究文档。交付目标:2026-05-16 0G Hackathon MVP。

**特别约定**:
- **Shadow UI 复用策略**(新增 AR): ShadowFlow 前端侧 Panel / Layout / Inspector / Common atoms 等非图渲染组件优先从 `D:\VScode\TotalProject\Shadow\src\core\components\` 复制改造以减少 MVP 工作量;图渲染保持 ReactFlow 原生(Architecture 既有决策,PixiJS 留 Phase 2)
- **Brownfield 加固**: ShadowFlow Python Runtime v0.3.0 已交付 19.7K 行,MVP 是"加固 + 新增 Policy Matrix / SSE / 看板 / 0G 前端集成 / 6 模板",非从零搭建
- **FR31/FR35 Phase 3**: MVP 不涉及 INFT 铸造与 Multi-Mode Marketplace 交易

## Requirements Inventory

### Functional Requirements

**模板设计(Template Design)**

- **FR1**: 用户可加载系统预置的 6 个种子模板(`Solo Company` / `Academic Paper` / `Newsroom` / `Modern Startup` / `Consulting` / `Blank`)。每模板独立 agent roster + group roster + 用户身份 + BriefBoard 别名 + 默认 Ops Room,不跨模板串货(2026-04-16 决策 7)
- **FR2**: 用户可通过 YAML 编辑 + 可视化预览方式新增、修改模板中的角色(Role)、工具(Tool)、Agent 定义
- **FR3**: 用户可为每个角色定义 SOUL(职责 prompt)、可用工具列表、绑定的 LLM provider
- **FR4**: 用户可定义 stage / lane 结构,指定节点在哪个 stage、属于哪个 lane
- **FR5**: 用户可定义 parallel / barrier / retry / approval_gate 等控制流积木
- **FR6**: 用户可通过"运行中新增角色"功能,在一次已经启动的 run 中动态加入新角色,无需从头创建项目(J3 关键)
- **FR7**: 系统可通过 `WorkflowAssemblySpec → compile → WorkflowDefinition` 主链把高层积木装配编译为可运行 workflow(至少 Academic Paper 模板走此路径)

**权限矩阵(Policy Matrix)**

- **FR8**: 用户可通过可视化矩阵编辑器定义"谁能给谁发消息、谁能驳回谁"的权限关系
- **FR9**: 用户可在运行中修改 Policy Matrix 并触发 re-compile + re-run(J3 关键)
- **FR10**: 系统在矩阵保存时执行 compile-time validation,对不推荐的权限关系弹出非阻塞警告 + 原因展示(E3 关键)
- **FR11**: 系统在运行时真实执行 Policy Matrix 驳回—当 receiver 无权接收或 reject 发生时,触发 handoff 事件与 retry loop
- **FR12**: 驳回可穿透多层(Advisor 驳回 Section → 回退到 Outline → 中间步骤 rollback),触发 checkpoint resume(J2 关键)

**运行执行(Runtime Execution)**

- **FR13**: 用户可在编辑器下达自然语言指令,系统自动 fan-out 到各 stage 的入口节点
- **FR14**: 系统可并行(parallel)执行多个 lane / 节点,通过 barrier 汇合
- **FR15**: 系统可循环(retry_loop)执行,基于 convergence_signal 或 max_rounds 自动终止
- **FR16**: 系统可通过 approval_gate 暂停流程、等待审批角色决策、根据结果进入不同分支
- **FR17**: 每个节点可选择 LLM provider(MVP: Claude / OpenAI / Gemini / Ollama / 0G Compute,5 选 1)
- **FR18**: 系统在 provider 超时或不可用时按配置 fallback 链自动切换(E1 关键)

**实时观察(Real-time Observability)**

- **FR19**: 用户可在看板上实时看到每个节点的执行状态(pending / running / succeeded / failed / rejected)
- **FR20**: 用户可看到节点间的消息流(发起方 / 接收方 / 消息内容 / 时间戳)
- **FR21**: 驳回事件在看板上以视觉强化形式呈现(大号红色 toast,不可被忽略)
- **FR22**: 用户可在看板上点开任一节点查看详细输入 / 输出 / 历史 / 错误

**持久化与恢复(Persistence & Recovery)**

- **FR23**: 系统在每个 step 完成后自动 checkpoint(无需用户触发)
- **FR24**: 用户可在中断后 resume 任一 run,状态完整还原,已完成工作不丢
- **FR25**: 用户可查看某次 run 的完整 trajectory(所有 step / artifact / handoff / memory_event)
- **FR26**: 系统可 export run 为结构化 `run → step → final_output → trace → artifacts`

**0G 链生态集成(0G Ecosystem Integration)**

- **FR27**: 用户可将当前 run 的 trajectory 归档到 0G Storage,得到 CID
- **FR28**: 系统在上传前执行 sanitize scan,剔除禁止字段(PII / API key / session token)
- **FR29**: 用户可通过 CID 从 0G Storage 下载 trajectory,并在本地 Merkle 验证通过后解析
- **FR30**: 系统可调用 0G Compute 端点进行 LLM 推理,遵循 `processResponse()` 契约
- **FR31**: MVP 不提供任何 INFT 铸造功能(Phase 3+)**【Phase 3 明确推迟】**

**模板分享与交易(Template Sharing & Trading)**

- **FR32**: 用户可通过 `Import by CID` 一级入口加载来自 0G Storage 的他人模板
- **FR33**: 导入的模板保留原作者署名链(author lineage),后续修改作为"克隆分支"追溯
- **FR34**: 用户可把修改后的模板重新归档为新 CID,署名链自动累积 `原作者 → 克隆者`
- **FR35**: Phase 3+ 用户可选择三种交易模式(P2P / Escrow / On-chain INFT),MVP 不涉及 **【Phase 3 明确推迟】**

**Agent 反向提问 & Gap 检测(Agent Interactivity)**

- **FR36**: 当 Agent 检测到输入不完整时,主动向用户发起 question 消息事件,不自作主张填充(E2 关键)
- **FR37**: 用户回答后,系统自动 cascade 更新依赖下游

**Demo 与路演(Demo & Pitch)**

- **FR38**: Demo 站点首页可在无需登录下 Try Demo
- **FR39**: 每个模板有"Quick Demo"预填指令按钮,降低 Run 门槛
- **FR40**: Demo 站点底部有三个差异化对比页面入口(技术白皮书 / vs 竞品 / 0G 链上证据)
- **FR41**: 系统提供一个公开 README,评委 copy-paste 即可在本地跑通 MVP 端到端闭环

**External Agent Integration(外部 Agent 集成)**

- **FR42**: 用户可在模板 YAML 顶层 `agents: [...]` 声明异构 agent executor(`kind: api / cli / mcp / acp`),系统以 Universal Agent Plugin Contract(AgentExecutor ABC + 四种 kind + 三通道契约 + AgentEvent 归一流)统一编排 Hermes / OpenClaw / ShadowSoul / 任意 ACP agent,与内置 LLM Provider 节点走同一 Runtime 路径。**差异化护城河第二条:Edict 只用 OpenClaw,ShadowFlow 同时调度自家 + 第三方多 agent,用 Policy Matrix 统一编排**

### NonFunctional Requirements

**Performance**

- **P1**: 模板编辑器首屏渲染 ≤ 2s(冷启动)
- **P2**: 8 角色 DAG 可视化渲染 ≤ 1s
- **P3**: 单 run 首 token 延迟 ≤ 3s(冷启动) / ≤ 1.5s(热启动)
- **P4**: 前端看板事件到 UI 渲染延迟 ≤ 500ms
- **P5**: 3 节点并行执行场景下,runtime 不出现状态竞争或消息丢失
- **P6**: 0G Storage 上传 / 下载单次操作 ≤ 10s(正常网络)

**Security**

- **S1**: LLM API keys 仅存储于客户端(MVP: localStorage;Phase 2: 系统 keychain);严禁上链、存 0G Storage、写 trajectory metadata
- **S2**: 上传到 0G Storage 的 trajectory 必须通过 sanitize scan,剔除 PII / 敏感字段
- **S3**: 从 0G Storage 下载的 trajectory 必须 Merkle 验证通过才解析,防止篡改
- **S4**: Provider fallback 触发时,prompt 不应被用作 fallback provider 训练数据
- **S5**: 运行克隆模板时,tool 调用在受限 sandbox 内(MVP: 白名单 tools;Phase 2: container/wasm)
- **S6**: Phase 3 INFT 加密元数据保护 prompt(仅在铸造瞬间需要)**【Phase 3 推迟】**

**Scalability**

- **SC1**: MVP 面向黑客松评委 demo 场景,设计并发目标 ≤ 50 并发 run
- **SC2**: runtime 无状态设计,state 全在 checkpoint store,支持水平扩展(Phase 2+)
- **SC3**: Phase 2+ 如需高并发,消息总线 / lineage 查询引擎可按需下沉 Rust

**Accessibility**

- **A1**: MVP 满足 WCAG 2.1 AA basic(键盘导航 + 语义 HTML + 颜色对比度 ≥ 4.5:1)
- **A2**: 不做 screen reader 深度适配(Phase 2+ 按需)

**Integration**

- **I1**: 4 LLM Provider Adapter 全部可用,可扩展第 5 provider(0G Compute)
- **I2**: 0G Storage `@0glabs/0g-ts-sdk` 前端 TS 版本锁定到 `package.json`
- **I3**: 0G Compute 推理调用成功率 ≥ 95%
- **I4**: Phase 2 Tauri Sidecar 集成契约稳定(Rust + Python HTTP 127.0.0.1)**【Phase 2 推迟】**
- **I5**: Phase 2+ Shadow 桌面暴露 ≥ 20 Tauri 命令供 ShadowFlow 调用 **【Phase 2 推迟】**

**Reliability**

- **R1**: 任一 MVP 模板支持 ≥ 1 次中断 + resume,状态完整还原,无数据丢失
- **R2**: Provider 全部失败时,系统不 crash,而是 pause + checkpoint + 等待用户手动决策
- **R3**: Compile validation 失败时,保存操作被非阻塞警告;用户可覆盖,系统记录覆盖事件

### Additional Requirements

**基础工程(Foundation / Sprint 0)**:
- **AR1**: `docker-compose.yml` + `Dockerfile.api` + `Dockerfile.web` + `.env.example` 一键启动(阻塞 FR41 的评委复现)
- **AR2**: `.github/workflows/ci.yml` 提供 lint(ruff + eslint) + test(pytest + vitest) + build(docker build + npm build)
- **AR3**: `scripts/generate_ts_types.py` 把 Pydantic `contracts.py` 转成前端 `src/core/types/workflow.ts`,保证前后端 schema 单源
- **AR4**: `scripts/check_contracts.py` 供 CI 调用,验证 schema 同步 + 扫描 API key / private key / session token 泄漏

**Runtime 契约扩展(Brownfield 加固)**:
- **AR5**: `shadowflow/runtime/contracts.py` 新增第 8 个核心对象 `PolicyMatrixSpec` + `ApprovalGateNode` Literal 类型(阻塞 FR8-FR12 + FR16)
- **AR6**: `shadowflow/runtime/events.py` 新增事件总线(`asyncio.Queue` 每 run 一个)+ `event_types.py` 常量:`run.* / node.* / policy.* / checkpoint.* / provider.* / assembly.*`
- **AR7**: `shadowflow/runtime/errors.py` 新增 `ShadowflowError` 错误体系 + `code` 枚举集中管理(`POLICY_VIOLATION / PROVIDER_TIMEOUT / SANITIZE_REJECTED / ...`)
- **AR8**: `shadowflow/runtime/sanitize.py` 新增上传前 PII 扫描(白名单 + 黑名单字段,邮箱/电话/身份证/银行/API key/session token 全屏蔽)
- **AR9**: `shadowflow/assembly/compile.py` 新增 `WorkflowTemplateSpec → compile → WorkflowDefinition` 主链(阻塞 FR7 + Academic Paper 模板)

**API 契约(7 REST endpoint)**:
- **AR10**: FastAPI 新增 6 个 MVP endpoint(`POST /workflow/compile`、`GET /workflow/runs/{id}`、`GET /workflow/runs/{id}/events` SSE、`POST /workflow/runs/{id}/approval`、`POST /workflow/runs/{id}/policy`)+ 复用既有 `/workflow/validate` 和 `/workflow/run`
- **AR11**: 所有 endpoint 响应遵循 `{data, meta}` 成功 / `{error: {code, message, details, trace_id}}` 失败 envelope
- **AR12**: FastAPI 自动生成 OpenAPI 3.1(`/docs` + `/redoc`),前端 TS 通过 `openapi-typescript` 自动生成类型

**LLM Provider 层增强**:
- **AR13**: `shadowflow/llm/zerog.py` 新增 0G Compute 作为第 5 Provider,遵循 `processResponse(providerAddress, chatID, usageData)` 契约
- **AR14**: `shadowflow/llm/fallback.py` 新增 provider fallback 链编排(`0G → OpenAI → Claude → Gemini → Ollama` 顺序可配)

**前端新增**:
- **AR15**: 6 个新路由页面 `LandingPage / TemplatesPage / EditorPage / RunPage / ImportPage / AboutPage`
- **AR16**: 4 个新 Zustand store `useWorkflowStore / usePolicyStore / useRunStore / useSecretsStore`(`useSecretsStore` 通过 localStorage 加密持久化 BYOK 密钥)
- **AR17**: `src/adapter/sseClient.ts` 实现 Last-Event-ID 重连 + 指数退避
- **AR18**: `src/adapter/caseConverter.ts` 提供 snake↔camel 转换作为前后端边界单一转换点
- **AR19**: `src/adapter/zerogStorage.ts` 封装 `@0glabs/0g-ts-sdk`,前端直调 0G Storage 上传 / 下载 / Merkle 验证
- **AR20**: 2 个新 ReactFlow 节点类型 `ApprovalGateNode.tsx` 和 `BarrierNode.tsx`(继承 `BaseNode.tsx`)
- **AR21**: 核心面板组件 `PolicyMatrixPanel.tsx`(矩阵编辑 + 非阻塞警告) + `LiveDashboard.tsx`(SSE 驱动的看板,8 角色并发渲染 ≤ 1s)

**Shadow UI 复用(新增)**:
- **AR22**: 非图渲染 UI 组件优先从 `D:\VScode\TotalProject\Shadow\src\core\components\` 复制改造。具体候选清单(Step 2 设计 Epic 时细化):
  - `sidebar/` → ShadowFlow 左侧导航 / 模板切换器
  - `inspector/` → ShadowFlow 右侧节点详情面板 / TraceView
  - `common/` → 按钮 / 输入 / Toast 等原子组件
  - `editor/` → YAML 编辑器支持
  - `modals/` → 对话框通用容器
  - `layout/` → 三栏 split-screen 布局骨架
- **AR23**: **图渲染保持 ReactFlow 原生**,不搬 Shadow 的 `graph/` 目录(PixiJS+d3-force,与 ReactFlow 范式不兼容)

**⚠️ 重要认知校正**: Shadow 项目的 `AgentGraph/` 目录是 **ShadowFlow 的旧名**,不是外部依赖。ShadowFlow Python Runtime v0.3.0 19.7K 行 Python 就是 AgentGraph 改名后的现役代码,已经包含 `core/agent.py AgentConfig` / `core/graph.py` / `core/router.py` / `shadowflow/runtime/executors.py BaseExecutor+ExecutorRegistry` 等核心契约。因此"接入新 agent"不是"复用外部项目",而是"扩展自家已有 executor 抽象"(见 AR47-55)。

**6 个种子模板 YAML**:
- **AR24**: `templates/solo-company.yaml` - 8 角色双 Lane(Solopreneur persona)
- **AR25**: `templates/academic-paper.yaml` - 6 角色走 WorkflowAssembly 主链编译(学者 persona,Technical Success 第 7 条硬约束)
- **AR26**: `templates/newsroom.yaml` - 5 角色 + 支持运行中加事实核查员(Newsroom persona,J3 高光)
- **AR27**: `templates/modern-startup.yaml` - 3 角色(通用 persona)
- **AR28**: `templates/consulting.yaml` - Engagement Partner / Research Lead / Analyst / Senior Reviewer / Delivery Manager(咨询工作室 persona,2026-04-16 替换 Ming Cabinet)
- **AR29**: `templates/blank.yaml` - 空模板 + 引导向导文案

**Demo 与路演产物**:
- **AR30**: Landing 页的四维蓝海象限图(静态 SVG 或 Mermaid 嵌入)
- **AR31**: About 页的 9 条差异化对比问答(vs N8N / Cherry / AutoGen / AIverse / LangGraph 等)
- **AR32**: 0G Explorer 外链 - 真实 trajectory CID + Merkle proof 可独立验证
- **AR33**: 公开 README "Quick Start" 区块 - `git clone && docker compose up` 即可运行

**0G 合规**(来自 `.0g-skills/CLAUDE.md` ALWAYS/NEVER 规则):
- **AR34**: ethers v6(前端 0G Chain 交互,Phase 3);`evmVersion: "cancun"`(Phase 3 合约)
- **AR35**: `processResponse()` 必调(每次 0G Compute 推理后)
- **AR36**: `ZgFile` 必须 finally 关闭(0G Storage 上传规则)
- **AR37**: 私钥永不硬编码,永不上链,永不写 trajectory metadata

**测试与质量门**:
- **AR38**: E2E 测试(Playwright)至少覆盖 J1(Solopreneur) + J2(学者) + J3(Newsroom 现场改制度)三条关键 Journey
- **AR39**: 单元测试:`test_policy_matrix.py` / `test_sanitize.py` / `test_events_bus.py` / `test_assembly.py` / `test_llm_fallback.py` 新增

**文档与交付物**:
- **AR40**: 更新 README.md 添加"Quick Start"、demo 站链接、6 个种子模板说明、0G 链上证据
- **AR41**: 架构文档标注 `docs/ARCHITECTURE.md` 已被 `_bmad-output/planning-artifacts/architecture.md` 继承(去重)

**Workflow Assembly 主链细节**(来自 `shadowflow-workflow-assembly-contract-v1.md`):
- **AR42**: `WorkflowTemplateSpec` 定义 6 种 Workflow Block(`plan / parallel / barrier / retry_gate / approval_gate / writeback`),所有 6 种都在 Academic Paper 模板内真实调用(Technical Success 第 6 条)
- **AR43**: `assembly constraint validator` 在 compile 阶段检查"事实核查员→法务"等非法权限关系(E3 关键)

**Graph Projection 细节**(来自 `shadowflow-graph-projection-contract-v1.md`):
- **AR44**: Runtime 执行图与前端 ReactFlow 显示图通过 `GraphProjectionContract` 转换层映射,保证双向一致

**CLI-UI 边界**(来自 `shadowflow-shadow-cli-shadow-ui-boundary-v1.md`):
- **AR45**: Phase 1 MVP 保留 `shadowflow` CLI(`cli.py`),CLI 与 HTTP API 消费同一份 WorkflowDefinition(Technical Success 第 2 条同构约束)
- **AR46**: Phase 2 起用户入口迁移到 Shadow CLI / Shadow UI,ShadowFlow 收缩为纯引擎 **【Phase 2 推迟】**

**通用 Agent 接入协议(MVP 新增,关键差异化)**

基于对 Edict / OpenClaw / Hermes Agent / ACP 协议的调研 + ShadowClaw 规划定位,ShadowFlow 需要从"LLM Provider 池"升级为"**异构 agent 编排平台**"。现有代码 `shadowflow/runtime/executors.py:87` 已有 `BaseExecutor + ExecutorRegistry` 基础和 2 种 kind(`cli` / `api`),MVP 需要扩展到 4 类并通用化,**同时开发薄壳版 ShadowClaw 作为自家标杆 agent**。

**📋 决策定案(2026-04-16,基于 Hermes v0.9.0 实机验证后修正)**:
- **接入范围**:Hermes + OpenClaw + ShadowClaw + ACP + MCP + CLI
- **🏆 Agent 接入核心协议 = ACP**:ShadowFlow EditorPage = workflow IDE,ACP 的 session 管理 + 审批流 + 流式事件与 ShadowFlow 天然对应。**ACP 重点支持,MCP 和 CLI 为辅助通道**
- **Hermes 接入优先走 ACP**:`hermes acp` 已就绪;MCP(`hermes mcp serve`)作为 tool 暴露补充;CLI 作为兜底
- **🔬 SPIKE 项**:`hermes claw` 子命令已在 Hermes v0.9.0 内置(子命令列表确认),需 Sprint 0 立即 SPIKE 查清其含义——可能是 Hermes 已集成 OpenClaw 或自家 claw 能力,对 ShadowClaw 命名/定位有直接影响
- **ACP 恢复(Must)**:二次讨论后确认 ShadowFlow EditorPage 就是 workflow IDE(画布+运行+面板+审批),ACP 的 session 管理 + 审批流 + 流式事件与 ShadowFlow 的 run 生命周期 + approval_gate + SSE 看板**天然对应**。ACP 管 session,MCP 管 tool call,CLI 做兜底,三层互补
- **🆕 ShadowClaw 薄壳版纳入 MVP**:基于 Shadow 项目已有 ShadowClaw Rust 实作(`shadowclaw_execute_cli` 等 3 个 Tauri command + S.C.O.R.E. + ReAct 循环),Python 侧复刻 ~2 天可完成;**需要避开与 Hermes 原生 `claw` 子命令的命名冲突,SPIKE 后定**
- **🆕 ShadowClaw 纳入 MVP** — 采用"**薄壳组装**"策略:复用 ShadowFlow 现有 LLM Provider / CheckpointStore / 工具白名单,新增 ~300 行薄壳整合 + CLI handler,**图谱统一入口推迟到 Phase 2**
- **对标差异化**:Edict 只用 OpenClaw(别人家);ShadowFlow 调 Hermes + OpenClaw(第三方)+ ShadowClaw(自家)+ 任意 ACP agent,用 Policy Matrix 统一编排

**AR47(Must)Universal Agent Plugin Contract**
- 扩展 `shadowflow/runtime/executors.py:AgentExecutor` ABC,支持四种 kind:
  - `kind: "api"` - HTTP API 推理(已有,OpenAI/Claude/Gemini/Ollama/0G Compute)
  - `kind: "cli"` - CLI 进程派生(已有,需通用化,见 AR48;覆盖 OpenClaw/Hermes/ShadowClaw/Codex/Claude Code)
  - `kind: "mcp"` - MCP 客户端消费外部 MCP server(MVP 新增,见 AR53)
  - `kind: "acp"` - ACP(Agent Client Protocol)client(**MVP 恢复**,ShadowFlow = workflow IDE,ACP 管 agent session 生命周期 + 审批 + 流式事件)
- ABC 三方法 `dispatch(task) → handle` / `stream_events(handle) → AsyncIterator[AgentEvent]` / `capabilities() → AgentCapabilities`
- 事件流接入现有 `runtime/events.py`,保证看板 SSE 不额外改造

**AR48(Must)CLI Executor 通用化**
- 移除 `CliExecutor` 对 `provider: claude` 和 `provider: codex` 的 hardcode
- 改为 YAML 配置驱动:`{command, args, stdin_format, parse_format, env, workspace}` 通用字段
- `provider` 字段保留为注册名(`claude` / `codex` / `openclaw` / ...)用于默认配置 preset
- 为 OpenClaw 留通用 CLI 接入入口,不需代码改动

**AR49(Must)Agent 注册表机制**
- `templates/*.yaml` 支持顶层 `agents: [...]` 数组,每个 agent 声明 `{id, executor: {...}, soul, tools, skills?}`
- Pydantic `AgentSpec` 模型(在 `contracts.py` 扩展或 `core/agent.py` 增强)
- 编译时(`assembly/compile.py`)把 agent 引用解析到节点

**AR50(Must)统一 AgentEvent 流**
- 扩展 `runtime/events.py` 的 event_types 常量,新增 `agent.*` 命名空间:`agent.dispatched / agent.thinking / agent.tool_called / agent.completed / agent.failed`
- 所有 AgentExecutor 实现必须把原生事件(CLI stdout / JSONL / HTTP SSE / MCP notification)归一成 `AgentEvent`

**AR51(Should)Hermes Agent CLI Executor**(CLI + JSONL tail 模式)
- 基于实机验证:Hermes 有 CLI(`hermes` binary + `hermes_cli/` + root `cli.py`),程序化入口 `run_agent.py` / `batch_runner.py`,session 既写 JSONL 也写 SQLite(源码确认 `_persist_session()`)
- 在 AR48 通用化基础上,提供 `provider: "hermes"` 默认 preset:
  ```yaml
  executor:
    kind: "cli"
    provider: "hermes"
    command: "python"
    args: ["run_agent.py", "--prompt", "{stdin}", "--memory-key", "{run_id}"]
    workspace: "~/.hermes/agents/{id}"
    parse: "jsonl-tail"  # 尾追 Hermes session JSONL
  ```
- 事件归一到 AR50 `agent.*` 流;实机跑通后根据 Hermes 实际参数细节调整

**AR52(Should)OpenClaw CLI Executor**(CLI + JSONL tail 模式)
- 在 AR48 通用化基础上,提供 `provider: "openclaw"` 默认 preset:
  ```yaml
  executor:
    kind: "cli"
    provider: "openclaw"
    command: "openclaw"
    args: ["agent", "--agent", "{id}", "-m", "{stdin}", "--deliver"]
    workspace: "~/.openclaw/agents/{id}"
    parse: "jsonl-tail"  # 尾追 sessions/*.jsonl
  ```
- 参考 Edict 三通道契约设计思路(Dispatch CLI + Report CLI + Observability FS tail 的模式对比),在 ShadowFlow 里自研归一到 AR50 AgentEvent 流
- **✅ 独立路径确认(2026-04-18,AR60 Story 2.7 SPIKE)**:Hermes `claw` 子命令仅做 OpenClaw → Hermes 静态数据迁移,**不提供运行时代理**。ShadowFlow 接 OpenClaw 必须走本 AR52 独立路径(直接 spawn OpenClaw binary),不经 Hermes 中转。详见 `docs/HERMES_CLAW_SPIKE.md`

**AR53(Should)MCP Client Executor**(消费外部 MCP server,Hermes tool 暴露补充通道)
- 新增 `kind: "mcp"`,支持把外部 MCP server 作为 agent 调度
- YAML 示例:
  ```yaml
  executor:
    kind: "mcp"
    server: "stdio://python -m mcp_serve"  # 或 http://
    tool: "run_agent"
    args: {...}
  ```
- Hermes `mcp_serve.py` 是一个现成 target;ShadowFlow 本来也有 MCP 知识栈(`shadowflow/mcp_server.py` 提供的是相反方向)
- 实现:基于 MCP Python SDK(`pip install mcp`)

**AR56(Must ✅ 恢复)ACP Client — Agent 会话管理主协议**
- **恢复原因**(2026-04-16 二次讨论):ShadowFlow 的 EditorPage **就是 workflow IDE** —— 画布编辑 + 运行 + 面板 + 审批,形态与 VS Code/Zed 对 ACP 的 host 角色完全吻合
- **ACP 比 MCP 更贴合 ShadowFlow**:
  - ACP = **session 级别**管理(start / stream / approve / stop) → 对应 ShadowFlow 的 run 生命周期 + approval_gate
  - MCP = **tool call 级别**(一次性工具调用) → 对应简单的函数调用
  - ShadowFlow 需要**流式接收 agent 思考事件** + **审批流** + **session resume**,这些 ACP 原生支持而 MCP 没有
- **与 MCP 互补,不替代**:同一个 Hermes 可同时走 ACP(session 管理)+ MCP(tool 暴露);ShadowFlow 需两个 client
- **YAML 示例**:
  ```yaml
  executor:
    kind: "acp"
    command: "hermes acp"  # 或 stdio 连接
    session_config:
      approval_mode: "host_controlled"  # ShadowFlow approval_gate 接管
  ```
- **实现参考**:Zed's [agent-client-protocol](https://github.com/zed-industries/agent-client-protocol) spec + Hermes `acp_adapter/` 源码(server.py / session.py / events.py / tools.py)
- **工作量**:4-5 天(含 ACP spec 阅读 + Python client 实现 + 对接 runtime/events.py)

**AR60(Must)🔬 Hermes `claw` 子命令 SPIKE**
- Hermes v0.9.0 实机确认 `claw` 是内置子命令(`hermes_cli/claw.py`),但用途未知
- Sprint 0 SPIKE:跑 `hermes claw --help` + 读源码 `hermes_cli/claw.py`,搞清:
  - 是 Hermes 内置的 OpenClaw 集成?
  - 还是独立的类 claw agent 能力?
  - 与 ShadowFlow 的 ShadowClaw(影爪)命名是否冲突?需要改名吗?
- SPIKE 产出:`docs/HERMES_CLAW_SPIKE.md`,1 天内完成,结果影响 AR52(OpenClaw Adapter)和 AR57(ShadowClaw)的最终设计
- **✅ SPIKE 结论(2026-04-18,Story 2.7 已完成)**:`hermes claw` 是 **OpenClaw → Hermes 一次性数据迁移工具**(非运行时集成 / 非独立 agent)。仅 `migrate` + `cleanup` 两个子命令。**ShadowClaw(影爪)命名保留,零冲突**。详见 `docs/HERMES_CLAW_SPIKE.md`

**AR57(Should)🆕 ShadowClaw Agent(MVP 薄壳版)**
- **定位**:ShadowFlow 生态自家的标杆 agent,"对话 + 执行 + 记忆 + 工具 + 图谱"统一入口
- **🎯 重大发现(2026-04-16)**:Shadow Tauri 项目(`D:\VScode\TotalProject\Shadow\`)**已经存在 ShadowClaw 实作**:
  - `src-tauri/src/main.rs:63-66` 注册三个 Tauri command:`shadowclaw_get_doc_loop_contract` / `shadowclaw_start_dialog` / `shadowclaw_execute_cli`
  - Shadow PRD 明确:✅ ShadowClaw system prompt 已内置(S.C.O.R.E.)✅ ShadowClaw ReAct 循环已实现
  - Shadow PRD:已"为未来的 AgentGraph/ShadowClaw 集成留出接口"
  - 命名规范:Shadow 用 `ShadowClaw`(英文代码)/ 中文界面可用"影爪"
- **实现策略**:直接复用 Shadow 项目的 Rust 版 ShadowClaw,**不用 Python 重写**
  - ✅ Shadow `src-tauri/` 已有完整实现:3 个 Tauri command + S.C.O.R.E. system prompt + ReAct 循环
  - ⬜ **如果 ShadowClaw 可脱离 Tauri 独立运行** → 直接 spawn Rust binary(`kind: "cli"`)
  - ⬜ **如果绑定 Tauri runtime** → 从 `shadow-core` crate 提取独立 CLI binary(`shadow-claw-cli`,Rust 编译,~1-2 天)
  - ⬜ **如果 ShadowClaw 也实现 ACP server** → 用 `kind: "acp"` 接入(最优,与 Hermes 同通道)
  - 🔴 **砍项**:图谱统一入口推迟 Phase 2(需 Shadow 桌面集成)
- **作为 executor 注册**:优先 `kind: "acp"`,备选 `kind: "cli"`
- **MVP 工作量**:~1-2 天(编译 + 接入,非重写)
- **叙事价值**:Demo 站可以演示 ShadowFlow 同时调度 Hermes(第三方)+ OpenClaw(第三方)+ **ShadowClaw / 影爪(自家)**+ 任意 ACP agent,用 Policy Matrix 统一编排 —— **差异化护城河第二条**
- **澄清**:ShadowClaw ≠ Shadow CLI。前者是**被调度的 agent 实体**(对话+执行+记忆+工具),后者是**Shadow 桌面的用户入口**(调度器)。`shadowclaw_execute_cli` 命令是"通过 CLI 触发 ShadowClaw 执行"这一调用方式
- **✅ 命名冲突 SPIKE 已定案(2026-04-18,AR60 Story 2.7)**:ShadowClaw 与 Hermes `claw` 子命令概念 / namespace / 语义 / 血统四维正交,**保留命名,无需改名**。详见 `docs/HERMES_CLAW_SPIKE.md`

**AR58(Could)Agent Skills 热加载**(对标 Edict 的做法,降级)
- Hermes 和 OpenClaw 都有 skills 概念,ShadowFlow 支持模板声明 `skill_refs: ["https://..."]`
- 通过 executor 下发给支持该机制的 agent
- **MVP 推迟**,Phase 2 作为差异化叙事补齐

**AR59(Must)Agent 接入文档 & SPIKE**
- 新增 `docs/AGENT_PLUGIN_CONTRACT.md`(MVP 文档产物),规范 `AgentExecutor` ABC、四种 kind、三通道契约
- 更新 `docs/plans/cli-api-execution/claw-integration-boundary-v1.md` 从"先不做"升级为"MVP 基础版已实现"
- README 加一节"如何接入你的 Agent",配 Hermes / OpenClaw / ShadowClaw / ACP 四条具体流程样板
- **Sprint 0 SPIKE**(1 天):在 Hermes 实机上跑通 `python run_agent.py --prompt ...` 并 tail JSONL,验证所有假设,输出 `docs/HERMES_INTEGRATION_SPIKE.md`

### UX Design Requirements

**说明**: 项目无独立 UX Design 规范文档,UX 关注点已分散到:
1. PRD Web App Specific Requirements 小节(浏览器矩阵 / 响应式策略 / 性能目标 / WCAG 2.1 AA)
2. Architecture Frontend Architecture 小节(状态管理 / 路由 / 组件原子化 / Tailwind)
3. 本文档 AR22 Shadow UI 复用清单(非图渲染组件)

如 Phase 2+ 需要独立 UX 文档,届时通过 `bmad-create-ux-design` 工作流补齐。

### FR Coverage Map

**42 条 FR 全覆盖**(40 MVP + 2 Phase 3 延期):

| FR | Epic | 简要 |
|----|------|------|
| FR1 | Epic 3 | 加载 6 种子模板 |
| FR2 | Epic 3 | YAML 编辑 + 可视化预览 |
| FR3 | Epic 3 | 角色 SOUL + 工具 + LLM 定义 |
| FR4 | Epic 3 | stage / lane 结构 |
| FR5 | Epic 3 | parallel / barrier / retry / approval_gate 积木 |
| FR6 | Epic 4 | 运行中新增角色(J3 高光) |
| FR7 | Epic 3 | WorkflowAssemblySpec → compile 主链 |
| FR8 | Epic 1 | 可视化矩阵编辑器 |
| FR9 | Epic 4 | 运行中改 Policy Matrix(J3) |
| FR10 | Epic 1 | Compile-time validation 非阻塞警告(E3) |
| FR11 | Epic 1 | 运行时真驳回 |
| FR12 | Epic 1 | 驳回穿透多层 + checkpoint resume(J2) |
| FR13 | Epic 3 | NL 指令 fan-out |
| FR14 | Epic 3 | parallel + barrier 汇合 |
| FR15 | Epic 3 | retry_loop 收敛终止 |
| FR16 | Epic 1 | approval_gate 审批决策 |
| FR17 | Epic 3 | LLM provider 选择(5 选 1) |
| FR18 | Epic 3 | Provider 超时 fallback 链(E1) |
| FR19 | Epic 4 | 节点执行状态看板 |
| FR20 | Epic 4 | 节点间消息流 |
| FR21 | Epic 4 | 驳回事件视觉强化 toast |
| FR22 | Epic 4 | 点开节点查看详情 |
| FR23 | Epic 1 | 自动 checkpoint |
| FR24 | Epic 1 | 中断后 resume |
| FR25 | Epic 1 | 查看完整 trajectory |
| FR26 | Epic 1 | export run 结构化 |
| FR27 | Epic 5 | trajectory 归档 0G Storage |
| FR28 | Epic 5 | 上传前 sanitize scan |
| FR29 | Epic 5 | CID 下载 + Merkle 验证 |
| FR30 | Epic 5 | 0G Compute 推理 + processResponse |
| FR31 | ❌ Phase 3 | MVP 不做 INFT 铸造 |
| FR32 | Epic 5 | Import by CID 一级入口 |
| FR33 | Epic 5 | 作者署名链(author lineage) |
| FR34 | Epic 5 | 修改后重归档累积署名 |
| FR35 | ❌ Phase 3 | MVP 不做三种交易模式 |
| FR36 | Epic 6 | Agent gap detection + 反向提问(E2) |
| FR37 | Epic 6 | 用户回答后 cascade 更新下游 |
| FR38 | Epic 6 | Demo 无需登录 Try |
| FR39 | Epic 6 | Quick Demo 预填指令 |
| FR40 | Epic 6 | 差异化对比页面入口 |
| FR41 | Epic 0 | README 独立复现 |
| FR42 | Epic 2 | 异构 agent executor 声明(api/cli/mcp/acp)+ Universal Agent Plugin Contract |

**AR 覆盖**:AR1-46(基础设施与协议基线)分散到 Epic 0 / Epic 1 / Epic 3 / Epic 4 / Epic 5;**AR47-60**(Agent Plugin Contract,含 ACP/MCP/三通道契约)集中在 **Epic 2**;AR22-23(Shadow UI 复用)融入 Epic 3 / Epic 4。

**NFR 分布**:P1-P6 性能 → Epic 3 / Epic 4(编辑器 + 看板延迟);S1-S6 安全 → Epic 5(sanitize + Merkle)+ Epic 0(密钥管理);SC1-SC3 扩展 → Epic 1(无状态设计);A1-A2 可达性 → Epic 3 / Epic 4(前端);I1-I5 集成 → Epic 2(Agent)+ Epic 5(0G);R1-R3 可靠 → Epic 1(checkpoint + pause)。

## Epic List

**MVP 共 7 个 Epic,按用户价值组织**(Hackathon 2026-05-16 截止)。依赖关系:Epic 0 基础 → Epic 1(Runtime 契约)→ Epic 2(Agent 接入,依赖 Epic 1 Story 1.2 approval_gate)→ Epic 3 → Epic 4 → Epic 5(部分并行)→ Epic 6 收尾。

### Epic 0: Developer Foundation & One-Click Start

**Goal**: 评委 / 开发者 5 分钟执行 `git clone && docker compose up` 跑起完整 ShadowFlow MVP,验证所有后续 Epic 能被真实复现。这是 PRD Measurable Outcomes("独立跑通 100%")的兜底 Epic。

**FRs covered**: FR41
**ARs covered**: AR1(Docker Compose)· AR2(GitHub CI)· AR3(Pydantic→TS 生成)· AR4(check_contracts CI 守护)· AR45(CLI 与 HTTP API 同构)· AR46(Phase 2 Shadow CLI 入口迁移 · 延期)
**NFRs enforced**: S1(密钥仅客户端)· I2(0G SDK 版本锁)

**User Outcomes**:
- 独立开发者按 README 能在本地 5 分钟跑通 MVP 端到端闭环
- CI 守护 schema 一致性(Pydantic↔TS)
- 环境变量模板清晰,不泄密

---

### Epic 1: Runtime Hardening — Policy Matrix + Approval + Checkpoint Resume

**Goal**: 让 ShadowFlow Runtime 从"LLM 编排器"升级为"**有治理规则的协作平台**"—— Policy Matrix 作为第 8 个核心对象,approval_gate 作为一等节点类型,checkpoint/resume 支持驳回穿透多层回退。这是 PRD 核心差异化("**真驳回,不是配置项**")的代码底座。

**FRs covered**: FR8, FR10, FR11, FR12, FR16, FR23, FR24, FR25, FR26
**ARs covered**: AR5(PolicyMatrixSpec 第 8 对象 + ApprovalGateNode Literal)· AR6(events.py 事件总线 + run.*/node.*/policy.*/checkpoint.* 常量)· AR7(ShadowflowError + code 枚举)· AR9(WorkflowTemplateSpec → compile 主链,Story 1.1 与 3.4 共享)· AR10(新增 `/workflow/runs/{id}/approval` endpoint)· AR42(6 Workflow Block,approval_gate 一等积木)· AR43(assembly constraint validator 非阻塞警告)
**NFRs enforced**: R1(resume 无丢失)· R2(全 provider 失败 pause)· R3(compile 非阻塞警告)· SC2(runtime 无状态)

**User Outcomes**:
- 用户定的"谁能驳回谁"规则在 runtime 真实执行,触发 handoff 和 retry
- 合规官驳回内容官(J1)、Advisor 驳回 Section 退到 Outline(J2)在 runtime 层真实跑通
- 任意 run 中断后 resume 状态完整还原,已完成节点不重跑
- Trajectory export 结构化可审计

---

### Epic 2: Universal Agent Plugin Contract(ACP + MCP + CLI)

**Goal**: 把 ShadowFlow 从"LLM Provider 池"升级为"**异构 agent 编排平台**"—— 四种 executor kind(api / cli / mcp / acp),以 ACP 为核心协议管理 agent session 生命周期 + 审批流 + 流式事件,MCP 作为 tool 暴露补充,CLI 做通用兜底。这是 PRD 第二道差异化护城河("**Edict 写死 12 角色,ShadowFlow 能统一编排 Hermes + ShadowSoul + OpenClaw + 任意 ACP agent**")。

**FRs covered**: FR42
**ARs covered**: AR47-60(Universal Agent Plugin Contract,含 AgentExecutor ABC + 四 kind + 三通道契约 + ACP/MCP/CLI Client + AgentEvent 归一流 + ShadowSoul + Hermes SPIKE + 契约文档)
**NFRs enforced**: I1(4+1 LLM Provider)· S5(tool sandbox 白名单)

**User Outcomes**:
- 模板可声明 `executor.kind: acp/cli/mcp/api`,一键把 Hermes / ShadowSoul / OpenClaw 纳入编排
- Hermes ACP 模式与 ShadowSoul ACP 模式走同一 client,零特例代码
- SPIKE 产出 `docs/HERMES_CLAW_SPIKE.md` 厘清命名边界
- README 配三条"如何接入你的 Agent"流程样板(Hermes / OpenClaw / ShadowSoul)

---

### Epic 3: Workflow Editor + Template Compilation + 6 Seed Templates

**Goal**: 让用户能从 6 个种子模板(`Solo Company` / `Academic Paper` / `Newsroom` / `Modern Startup` / `Consulting` / `Blank`)起步,通过 YAML 编辑 + 可视化预览设计自己的团队,并通过 WorkflowAssemblySpec → compile → WorkflowDefinition 主链编译为可运行 workflow(至少 Academic Paper 走此路径)。包含 Provider fallback 链保证推理可靠性(E1)。**2026-04-16 决策 7/8/9 后模板 YAML schema 扩展为 `{policyMatrix, workflowStages, agentRoster, groupRoster, briefBoardAlias, userRole, defaultOpsRoomName}`(详见 epics-addendum-2026-04-16.md Story 3.6.7)。**

**FRs covered**: FR1, FR2, FR3, FR4, FR5, FR7, FR13, FR14, FR15, FR17, FR18
**ARs covered**: AR9(WorkflowTemplateSpec → compile 主链)· AR13(0G Compute 第 5 Provider)· AR14(shadowflow/llm/fallback.py provider 链)· AR15(6 路由页面:Landing/Templates/Editor/Run/Import/About)· AR16(4 Zustand store)· AR18(caseConverter.ts snake↔camel)· AR20(ApprovalGateNode.tsx + BarrierNode.tsx)· AR22-23(Shadow UI 非图渲染组件复用;图渲染保持 ReactFlow 原生)· AR24-29(6 种子模板 YAML)· AR42(6 Workflow Block 在 Academic Paper 全命中)· AR43(assembly constraint validator)
**NFRs enforced**: P1(编辑器 ≤ 2s)· P2(DAG 渲染 ≤ 1s)· P3(首 token ≤ 3s)· I1(5 LLM Provider 可切换)

**User Outcomes**:
- 8:49 AM 场景(J1):用户 ≤ 5 分钟从模板列表拖出 Solo Company 8 角色 DAG
- 学术场景(J2):Academic Paper 走 WorkflowAssembly 主链,6 种 Workflow Block 全命中
- 5 种子模板(非 Blank)+ 1 Blank 全部可运行
- Provider 超时自动 fallback 到下一家(E1 降级)

---

### Epic 4: Live Dashboard + Real-time Observation + Dynamic Policy

**Goal**: 用户在看板上**实时**观察多 agent 协作 + 驳回 + 重试全过程(SSE 500ms 延迟内),并支持**运行中新增角色 / 修改 Policy Matrix / Re-run with new policy**(J3 Pitch 第 3 分钟高光节点)。包含 PolicyMatrixPanel 可视化编辑 + 驳回 toast 视觉强化 + 节点详情查询。

**FRs covered**: FR6, FR9, FR19, FR20, FR21, FR22
**ARs covered**: AR6(asyncio.Queue 每 run 一个事件总线 + SSE 用)· AR10(新增 `/workflow/runs/{id}/events` SSE + `/workflow/runs/{id}/policy` endpoint)· AR11(response envelope)· AR17(sseClient.ts Last-Event-ID 重连 + 指数退避)· AR21(PolicyMatrixPanel.tsx + LiveDashboard.tsx,8 角色并发渲染 ≤ 1s)· AR44(GraphProjectionContract Runtime↔ReactFlow 双向一致)
**NFRs enforced**: P4(看板延迟 ≤ 500ms)· P5(3 并行无状态竞争)· A1(WCAG 2.1 AA basic)

**User Outcomes**:
- 8:52-8:58 AM 场景(J1):6 分钟双驳回戏剧在看板上真实呈现
- J3 高光(16:48-16:50):陈姐现场新增事实核查员 + 改矩阵 + 重跑 ≤ 3 分钟
- 每次驳回有大号红色 toast 不可忽略(FR21)
- 点开任一节点查看完整输入 / 输出 / 历史

---

### Epic 5: 0G Ecosystem Integration + CID Share/Clone

**Goal**: 让模板和 trajectory 真正成为**链上可验证资产**—— 前端直调 `@0glabs/0g-ts-sdk` 上传下载,Merkle 验证保证完整性,sanitize scan 剔除 PII / 密钥,作者署名链(author lineage)累积传承。0G Compute 作为第 5 provider 接入。

**FRs covered**: FR27, FR28, FR29, FR30, FR32, FR33, FR34
**ARs covered**: AR8(sanitize.py 白/黑名单字段扫描)· AR13(0G Compute 第 5 Provider + `processResponse()`)· AR14(fallback 链含 0G)· AR15(ImportPage 路由)· AR16(useSecretsStore BYOK 加密持久化)· AR19(zerogStorage.ts 封装 `@0glabs/0g-ts-sdk`,前端直调)· AR34(ethers v6 + `evmVersion: cancun` · Phase 3)· AR35(`processResponse()` 必调)· AR36(ZgFile finally 关闭)· AR37(私钥永不硬编码/上链/写 metadata)
**NFRs enforced**: S1(BYOK)· S2(sanitize)· S3(Merkle 验证)· S4(fallback no-training)· I2(0G SDK 版本锁)· I3(0G Compute 成功率 ≥ 95%)· P6(0G IO ≤ 10s)

**User Outcomes**:
- 8:59 AM 场景(J1):一键归档 0G Storage,CID `0x3f7a...bc91` 在 0G Explorer 可验证
- J4(跨 persona):粘贴 CID 导入 trajectory + Merkle 验证 + 克隆修改 + 重归档新 CID
- 0G Compute 成为第 5 provider,可在模板配置
- 0G Explorer 外链评委可独立验证

---

### Epic 6: Agent Interactivity + Demo Station + Pitch Ready

**Goal**: 把前 5 个 Epic 的能力织成**完整 5 分钟评委叙事** —— LandingPage(Slogan + 象限图 + CTA)+ TemplatesPage + "Quick Demo"预填 + 差异化对比页 + 0G 链上证据展示 + Phase 2/3 路线图。包含 Agent gap detection(E2)作为"宁可提问不瞎填"的细节亮点。

**FRs covered**: FR36, FR37, FR38, FR39, FR40
**ARs covered**: AR6(events.py 扩展 `agent.gap_detected` 事件)· AR15(LandingPage / TemplatesPage / AboutPage 路由)· AR30(Landing 四维蓝海象限图 SVG/Mermaid)· AR31(About 9 条"vs X"差异化问答)· AR32(About 0G Explorer 外链 + CID + Merkle proof 独立验证)· AR33(README Quick Start)· AR40(README 更新含 5 分钟复现 + 6 模板说明 + 链上证据)
**NFRs enforced**: P1(首屏 ≤ 2s)· A1(WCAG 2.1 AA basic)· SC1(≤ 50 并发)

**User Outcomes**:
- J5(评委 5 分钟):0:00 落地 → 0:15 选模板 → 0:45 Quick Demo → 1-2:30 双驳回戏 → 2:45 0G Explorer 外链 → 3:15 切第二模板 → 5:00 辨识度"有硬资产"
- E2 边界:林筱实验日志缺 baseline,SectionAgent 不瞎填而是弹窗问用户 3 选项(A/B/C)
- README 配 5 分钟 copy-paste 独立复现 + 9 条"vs X"差异化问答 100% 可点
- Phase 2/3 路线图页正确展示集成路径(Tauri Sidecar → INFT Marketplace)

---

# Epic 0: Developer Foundation & One-Click Start

## Epic 0 Stories

### Story 0.1: Docker Compose 一键启动

As a **评委 / 独立开发者**,
I want **执行 `git clone && docker compose up` 5 分钟内跑起完整 ShadowFlow**,
So that **我能独立复现 MVP 端到端闭环,不需要手动装 Python / Node 依赖**。

**Acceptance Criteria:**

**Given** 一台安装了 Docker Desktop(20.10+)的干净机器
**When** 执行 `git clone {repo} && cd ShadowFlow && cp .env.example .env && docker compose up -d`
**Then** 2 个容器(`shadowflow-api` 8000 端口 + `shadowflow-web` 3000 端口)启动成功
**And** 浏览器访问 `http://localhost:3000` 能看到 ShadowFlow Landing Page
**And** `curl http://localhost:8000/docs` 能看到 FastAPI Swagger UI
**And** `docker compose logs -f` 无 ERROR 级别日志

**Given** `.env` 缺少某个必需 KEY(如 `ANTHROPIC_API_KEY`)
**When** 启动容器
**Then** 容器启动但功能降级,前端提示"请在 localStorage 设置 API key"(不硬 crash)

### Story 0.2: GitHub Actions CI 流水线

As a **维护者**,
I want **每次 PR 自动跑 lint + test + docker build**,
So that **破坏性改动在合入前被拦截,保证主分支始终可部署**。

**Acceptance Criteria:**

**Given** 任一 PR 提交或 push 到 main
**When** GitHub Actions 触发 `ci.yml`
**Then** 跑通以下 jobs(失败即阻塞合并):
- `lint-backend`: ruff check + mypy
- `lint-frontend`: eslint
- `test-backend`: pytest(不含需要真 API key 的测试)
- `test-frontend`: vitest
- `build-docker`: docker build `Dockerfile.api` + `Dockerfile.web`

**And** CI 日志中不出现任何 API key / private key 明文
**And** 单次 CI 跑完时间 ≤ 10 分钟

### Story 0.3: Pydantic → TypeScript 类型生成脚本

As a **前端开发者**,
I want **后端 Pydantic 模型变更时 TS 类型自动同步**,
So that **前后端 schema 永远一致,避免 `runId` vs `run_id` 拼错**。

**Acceptance Criteria:**

**Given** `shadowflow/runtime/contracts.py` 包含 7+1 核心对象 Pydantic 模型
**When** 执行 `python scripts/generate_ts_types.py`
**Then** 生成 `src/core/types/workflow.ts`,包含所有模型的 TS interface/type
**And** TS 字段保留 snake_case(与后端一致,由 `src/adapter/caseConverter.ts` 在 fetch 层转 camel)

**Given** `contracts.py` 新增字段后未重跑脚本
**When** CI 跑 `scripts/check_contracts.py`
**Then** 报错 "schema drift detected: {fields}",CI fail

### Story 0.4: README Quick Start 独立复现指南

As a **0G Hackathon 评委**,
I want **按 README copy-paste 5 分钟在本地跑通 MVP**,
So that **我能独立验证声称的能力是否真实**。

**Acceptance Criteria:**

**Given** 一台安装了 Docker + Git 的 macOS / Windows / Linux 机器
**When** 按 README "Quick Start"章节逐步执行
**Then** 5 分钟内:
- clone 仓库 + 启动容器成功
- 访问 `http://localhost:3000` 选择 `Solo Company` 模板
- 点击"Quick Demo"按钮,看到双驳回戏剧完整上演
- 0G Explorer 外链能验证至少 1 条真实 trajectory CID

**And** README 包含以下 Section:Prerequisites / Quick Start / 5-Minute Demo / Troubleshooting / Architecture Overview / Phase 2-3 Roadmap

---

# Epic 1: Runtime Hardening — Policy Matrix + Approval + Checkpoint Resume

## Epic 1 Stories

### Story 1.1: Policy Matrix 核心对象 + Compile-time 非阻塞校验

As a **模板设计者**,
I want **可视化定义"谁能给谁发消息、谁能驳回谁",且系统保存时提示不推荐配置**,
So that **我的治理规则成为 runtime 一等公民,不是配置项**。

**Acceptance Criteria:**

**Given** `shadowflow/runtime/contracts.py` 新增 `WorkflowPolicyMatrixSpec` Pydantic 模型作为第 8 个核心对象
**When** 该对象被 `WorkflowDefinition.policy_matrix` 字段引用
**Then** 模型包含 `allow_send: {sender: [receiver, ...]}` + `allow_reject: {reviewer: [target, ...]}` 两个 dict 字段
**And** 有 `model_validator` 跨字段校验(如 sender/receiver 必须是已声明的角色 id)

**Given** 保存一个违反最佳实践的矩阵(如"事实核查员 → 法务")
**When** 前端调 `POST /workflow/validate`
**Then** 返回 `{warnings: [{code: "POLICY_NOT_RECOMMENDED", ...}]}` 但 **status 200 不阻塞**(R3 非阻塞)
**And** 警告附带"原因"字段 + 内置规则库命中链接

### Story 1.2: Approval Gate 节点类型

As a **工作流设计者**,
I want **在节点上声明 `type: "approval_gate"`,让审批角色决定放行或驳回**,
So that **J1 合规官、J2 Advisor、J3 主编等审议环节真实可执行**。

**Acceptance Criteria:**

**Given** `contracts.py:NodeDefinition.type` Literal 枚举扩展加入 `"approval_gate"`
**When** 模板节点声明 `{type: "approval_gate", approver: "compliance_officer", on_reject: "retry"}`
**Then** Runtime 执行到该节点时暂停,等待 `POST /workflow/runs/{id}/approval` 决策
**And** 决策可选 `approve` / `reject`,reject 时触发下游 `on_reject` 分支

**Given** Approval gate 等待超过 `timeout_seconds`(默认 300)
**When** 超时触发
**Then** 发出 `approval.timeout` 事件,run 进入 paused 状态,checkpoint 保存,等待用户手动 resume

### Story 1.3: 运行时真驳回 + Handoff 事件

As a **Demo 现场观众**,
I want **看到合规官驳回内容官不是 mock,是 runtime 真实执行的事件**,
So that **ShadowFlow 的差异化主张"真驳回"有技术背书**。

**Acceptance Criteria:**

**Given** Policy Matrix 定义"合规官 → 内容官"驳回权限
**When** 内容官产出推文 + 合规官审议后调用 `reject(reason: "GDPR 违规")`
**Then** Runtime 发出 `policy.violation` 事件(含 sender/receiver/reason)
**And** 发出 `node.rejected` 事件到被驳回的内容官节点
**And** 触发下游 handoff:内容官节点重置为 `pending` 状态,重新入队执行

**Given** Policy Matrix 不允许某角色驳回
**When** 该角色尝试调用 `reject()`
**Then** Runtime 返回 `PolicyViolation` 错误(`code: "POLICY_VIOLATION"`),不执行驳回

### Story 1.4: 驳回穿透多层 + Checkpoint Resume

As a **学者(J2 persona)**,
I want **Advisor 驳回 Section 时,Outline 和 LitReview 都能回退并重跑,但已完成工作不丢**,
So that **深度修改不等于从零开始,节省 20 分钟已做的工作**。

**Acceptance Criteria:**

**Given** 已完成 Outline → LitReview → Section 三个 stage,Advisor 在 Section 阶段驳回并标记 "回退到 Outline"
**When** Runtime 接收到 `retarget_stage: "outline"` 的 reject 信号
**Then** Checkpoint 自动保存当前完整状态
**And** Runtime 从 Outline 重新执行,中间节点(LitReview/Section)被标记为 `invalidated` 并重跑
**And** SSE 发出 `checkpoint.saved` + `node.invalidated` + `node.started` 事件序列

**Given** 用户在驳回重跑中途关闭浏览器
**When** 重新访问 `/runs/{run_id}` 并调 `POST /workflow/runs/{id}/resume`
**Then** Runtime 从最近 checkpoint 恢复,未完成的节点继续执行
**And** 已完成且未被 invalidate 的节点**不重跑**(R1 无丢失)

### Story 1.5: Trajectory Export + Run 查询 API

As a **开发者 / 评委**,
I want **一条 API 拿到完整 run 的 trajectory 结构化数据**,
So that **可以审计、归档、分享或做后续分析**。

**Acceptance Criteria:**

**Given** 一个已完成的 `run_id`
**When** 调 `GET /workflow/runs/{run_id}`
**Then** 返回 `{run, steps: [...], handoffs: [...], checkpoints: [...], final_artifacts: [...]}` 结构化 JSON
**And** 所有时间戳 ISO 8601 UTC 格式
**And** Pydantic 序列化 `exclude_none=True`(不返回 null 字段)

**Given** 需要下载该 run 的完整 trajectory 用于归档
**When** 调 `GET /workflow/runs/{run_id}?format=trajectory`
**Then** 返回适合上传到 0G Storage 的打包格式(workflow.yaml + policy_matrix + steps + artifacts)

---

# Epic 2: Universal Agent Plugin Contract(ACP + MCP + CLI)

## Epic 2 Stories

### Story 2.1: AgentExecutor ABC + 四 kind 枚举 + 注册表

As a **ShadowFlow 核心开发者**,
I want **定义统一的 AgentExecutor ABC 和四种 executor kind 枚举**,
So that **后续 ACP / MCP / CLI / API 的具体实现有共同契约,runtime 零特例分支**。

**Acceptance Criteria:**

**Given** `shadowflow/runtime/executors.py` 扩展现有 `BaseExecutor + ExecutorRegistry`
**When** 我阅读源码
**Then** 存在 `AgentExecutor(ABC)` 基类,三个抽象方法:`async dispatch(task) → handle` / `async stream_events(handle) → AsyncIterator[AgentEvent]` / `capabilities() → AgentCapabilities`
**And** `Kind = Literal["api", "cli", "mcp", "acp"]` 在 `contracts.py` 声明
**And** `ExecutorRegistry` 支持按 `(kind, provider)` 组合注册与查找

**Given** 模板 YAML 顶层声明 `agents: [{id, executor: {kind, provider, ...}, soul, tools}]`
**When** `assembly/compile.py` 编译模板
**Then** 每个 agent 的 executor 被解析到注册表,编译时校验 kind/provider 已注册

### Story 2.2: CLI Executor 通用化 + OpenClaw/Hermes/ShadowSoul CLI preset

As a **模板作者**,
I want **声明 `executor: {kind: cli, provider: openclaw/hermes/shadowsoul/...}` 即接入任意 CLI agent**,
So that **OpenClaw / Hermes CLI 模式 / ShadowSoul Rust binary 走同一路径,不需要代码改动**。

**Acceptance Criteria:**

**Given** 现有 `CliExecutor`(executors.py:114)硬编码 `claude` 和 `codex` provider
**When** 我重构
**Then** provider 改为注册表驱动:`provider_presets.yaml` 声明每个 provider 的 `{command, args_template, stdin_format, parse_format, workspace_template, env}`
**And** 新增 preset:`openclaw` / `hermes` / `shadowsoul` 三个默认配置
**And** 用户可在模板 YAML 覆盖任一字段

**Given** OpenClaw preset 配置 `args: ["agent", "--agent", "{id}", "-m", "{stdin}", "--deliver"]` + `parse: "jsonl-tail"`
**When** Runtime dispatch 该 executor
**Then** spawn 子进程 + tail `~/.openclaw/agents/{id}/sessions/*.jsonl` + 把 JSONL 事件归一成 `AgentEvent` 流

### Story 2.3: ACP Client 实现(Hermes / ShadowSoul 主协议)

As a **ShadowFlow 作为 workflow IDE**,
I want **通过 ACP(Agent Client Protocol)管理 Hermes / ShadowSoul 的 agent session**,
So that **session 生命周期、流式事件、审批流全用标准协议,零胶水代码**。

**Acceptance Criteria:**

**Given** `kind: "acp"` 注册到 AgentExecutor 注册表
**When** 模板声明 `executor: {kind: "acp", command: "hermes acp"}` 或 `{command: "shadow acp serve"}`
**Then** ShadowFlow 以 ACP host 角色启动 stdio JSON-RPC 子进程连接
**And** 发送 `initialize` / `session.new` / `session.prompt` 等 ACP 标准消息
**And** 接收 agent 流式响应,归一成 `AgentEvent`(agent.thinking / agent.tool_called / agent.completed)

**Given** ACP agent 请求用户批准执行危险操作(`session.requestPermission`)
**When** ShadowFlow 接收该请求
**Then** 对接到现有 approval_gate 机制(Epic 1 Story 1.2),暂停 session 等待用户决策
**And** 决策结果通过 ACP `session.permissionResult` 返回 agent

**Given** ACP session 中 agent crash 或 stdio EOF
**When** ShadowFlow 检测到
**Then** 发出 `agent.failed` 事件,触发 fallback 链或 pause + checkpoint

### Story 2.4: MCP Client 实现(Hermes tool 暴露补充通道)

As a **模板作者**,
I want **把 Hermes 的能力当作 tool 单次调用**(非 session 管理),
So that **对于简单的"查某信息"场景不需要完整 ACP session,走 MCP 更轻量**。

**Acceptance Criteria:**

**Given** 模板声明 `executor: {kind: "mcp", server: "stdio://hermes mcp serve", tool: "run_agent"}`
**When** Runtime dispatch
**Then** ShadowFlow 用 `mcp` Python SDK 连接 MCP server
**And** 发送 `tools/call` 请求,接收单次 tool result
**And** 归一成 `AgentEvent`(agent.tool_called + agent.completed)

**Given** MCP server 启动失败或 tool 不存在
**When** dispatch 时报错
**Then** 返回清晰错误 `{code: "MCP_SERVER_UNAVAILABLE" | "MCP_TOOL_NOT_FOUND"}`

### Story 2.5: ShadowSoul Rust Binary 接入

As a **ShadowFlow 用户**,
I want **在模板中声明 `provider: shadowsoul` 即可调用自家 Rust 版 ShadowSoul agent**,
So that **Demo 能演示 ShadowFlow 同时编排 Hermes + ShadowSoul + OpenClaw 三家**。

**Acceptance Criteria:**

**Given** Shadow 项目 `shadow-soul` crate 可独立编译产出 `shadow` binary
**When** 在 ShadowFlow 部署环境中 `shadow --version` 能跑通
**Then** 模板声明 `executor: {kind: "acp", command: "shadow acp serve"}` 或 `{kind: "cli", provider: "shadowsoul"}` 均可接入
**And** ShadowSoul preset 使用 S.C.O.R.E. system prompt + ReAct 循环(从 Shadow 项目沿用)

**Given** `shadow` binary 不在 PATH
**When** ShadowFlow 启动
**Then** 启动 health check 警告 `ShadowSoul unavailable, {模板} 的该 agent 将回退到 Claude`,不硬 crash

### Story 2.6: AgentEvent 归一流 + SSE 集成

As a **ShadowFlow 看板用户**,
I want **不管 agent 背后是 Hermes / OpenClaw / ShadowSoul,看板上显示的事件格式完全一致**,
So that **UI 层零特例,Demo 流畅不卡壳**。

**Acceptance Criteria:**

**Given** `shadowflow/runtime/events.py` 的 event_types 常量扩展 `agent.*` 命名空间
**When** 我阅读常量定义
**Then** 存在:`agent.dispatched` / `agent.thinking` / `agent.tool_called` / `agent.tool_result` / `agent.completed` / `agent.failed` / `agent.rejected`

**Given** 任意 AgentExecutor 实现(ACP/MCP/CLI/API)
**When** 产出原生事件(CLI stdout / JSONL / ACP stream / MCP result)
**Then** 归一为 `AgentEvent` 写入 run 的 asyncio.Queue
**And** SSE endpoint `/workflow/runs/{id}/events` 原样推送到前端
**And** 前端 `useRunEvents` hook 按 node_id 分发到 `useRunStore`,LiveDashboard 精确重渲染对应节点

### Story 2.7: Hermes `claw` 子命令 SPIKE

As a **ShadowFlow 架构师**,
I want **1 天内搞清 Hermes v0.9.0 内置 `claw` 子命令的真实用途**,
So that **ShadowSoul 命名和定位不会与 Hermes 生态冲突**。

**Acceptance Criteria:**

**Given** Sprint 0 分配 1 天 SPIKE 时间
**When** 我执行 `hermes claw --help` + 阅读 `hermes_cli/claw.py` 源码
**Then** 产出 `docs/HERMES_CLAW_SPIKE.md`,回答:
- Hermes `claw` 是内置 OpenClaw 集成 / 独立 claw agent / 还是其他能力?
- 是否与 ShadowSoul 命名冲突?
- ShadowSoul 是否需要改名或调整定位?

**And** 文档含具体命令输出 + 源码引用 + 决策建议 + 对 AR57 的影响分析

### Story 2.8: Agent Plugin Contract 文档(从 Story 0.5 迁移)

As a **第三方 Agent 开发者 / 社区贡献者**,
I want **看文档就能把我的 agent 接入 ShadowFlow**,
So that **ShadowFlow 成为一个真正开放的 agent 编排平台,PRD 差异化护城河第二条落在文档可交付产物上**。

**前置依赖**: 必须在 Story 2.1~2.7 完成后撰写(因为文档描述的 ABC / 四 kind / 三通道 / AgentEvent 命名空间 / preset 全部需要先实现)。

**Acceptance Criteria:**

**Given** 新增 `docs/AGENT_PLUGIN_CONTRACT.md`
**When** 我阅读该文档
**Then** 文档包含以下章节:

- AgentExecutor ABC 契约(`dispatch(task) → handle` / `stream_events(handle) → AsyncIterator[AgentEvent]` / `capabilities() → AgentCapabilities` 三方法)
- 四种 kind 语义(api / cli / mcp / acp)+ 选用决策树(session 管理 → acp;tool 单次调用 → mcp;子进程 → cli;HTTP API → api)
- 三通道契约(Dispatch / Report / Observability)含 Edict 模式对比(竞品分析,非借鉴)
- YAML 声明样板:Hermes(ACP)/ OpenClaw(CLI)/ ShadowSoul(ACP 或 CLI)/ 自定义 agent
- AgentEvent 事件命名空间(`agent.dispatched / thinking / tool_called / tool_result / completed / failed / rejected`)
- 如何写一个新的 provider preset(YAML schema + 注册流程)

**And** README "How to Plug Your Agent" 章节链接到此文档
**And** 文档附 `docs/HERMES_INTEGRATION_SPIKE.md` 与 `docs/HERMES_CLAW_SPIKE.md` 作为 worked example 交叉引用

---

# Epic 3: Workflow Editor + Template Compilation + 6 Seed Templates

## Epic 3 Stories

### Story 3.1: React Editor Shell + ReactFlow Canvas + Shadow UI 复用

As a **模板设计者**,
I want **打开 `/editor` 路由看到 split-screen 布局(左:画布,右:Inspector,顶:Toolbar)**,
So that **我有熟悉的 IDE 式操作界面**。

**Acceptance Criteria:**

**Given** 已从 Shadow 项目复制 `sidebar/ inspector/ common/ modals/ layout/` 组件到 ShadowFlow
**When** 访问 `/editor` 或 `/editor/:templateId`
**Then** 页面首屏渲染 ≤ 2s(P1),显示三栏布局
**And** ReactFlow Canvas 占主区,支持缩放/平移/节点拖拽
**And** Inspector 面板默认显示选中节点的配置

**Given** 加载 Solo Company 模板(8 角色 DAG)
**When** ReactFlow 渲染
**Then** DAG 完成渲染 ≤ 1s(P2),所有节点和边可见且无重叠

### Story 3.2: YAML 编辑器 + 双向同步(YAML ↔ Canvas)

As a **熟悉 YAML 的用户**,
I want **在右侧 YAML 编辑器直接改配置,画布实时反映**,
So that **可视化操作和代码级操作两条路径都通**。

**Acceptance Criteria:**

**Given** Monaco Editor 加载当前模板的 YAML
**When** 用户在 YAML 中修改 role 名称
**Then** 300ms 防抖后 Zustand store 更新,画布对应节点标签刷新

**Given** 用户在画布上拖动节点或改连接
**When** 释放鼠标
**Then** YAML 编辑器对应 block 立刻更新,保持两侧一致

**Given** YAML 有语法错误
**When** 编辑器失去焦点
**Then** 报错高亮 + Toast 提示,画布保持上一次有效状态

### Story 3.3: 节点类型 — Agent / ApprovalGate / Barrier / Parallel / Retry / Decision

As a **模板设计者**,
I want **从节点调色板拖出 7 种节点类型构建工作流**,
So that **PRD Technical Success 第 6 条"6 种 Workflow Block 全命中"可达成**。

**Acceptance Criteria:**

**Given** `src/core/components/Node/` 包含 `BaseNode` + `AgentNode` + `ApprovalGateNode`(新增)+ `BarrierNode`(新增)+ `ParallelNode` + `RetryNode` + `DecisionNode` + `PlanningNode`
**When** 节点调色板展开
**Then** 7 种节点可拖到画布,每种有独立视觉样式(图标 + 颜色)
**And** 所有自定义节点继承 `BaseNode.tsx`(AR Enforcement 第 8 条)

**Given** 用户拖出 ApprovalGate 节点
**When** 点击节点
**Then** Inspector 显示表单:approver(下拉选角色)+ on_approve / on_reject(下拉选下游分支)+ timeout(默认 300s)

### Story 3.4: WorkflowAssemblySpec → Compile 主链(Academic Paper 走此路径)

As a **学者(J2)**,
I want **Academic Paper 模板通过 assembly → compile 主链编译,而非硬编码**,
So that **PRD Technical Success 第 7 条 + 学术差异化叙事成立**。

**Acceptance Criteria:**

**Given** `shadowflow/assembly/compile.py` 实现 `compile(spec: WorkflowAssemblySpec) → WorkflowDefinition`
**When** 输入 Academic Paper 的 `WorkflowAssemblySpec`(含 Block Catalog + Stage / Lane 声明 + Policy Matrix)
**Then** 输出合法的 `WorkflowDefinition`,能被 `/workflow/run` 消费
**And** 编译过程校验 Policy Matrix 与节点角色一致性(跨字段约束)

**Given** 新增 endpoint `POST /workflow/compile`
**When** 前端提交 assembly spec
**Then** 返回 `{definition, warnings: []}`,warnings 包含非阻塞的 policy 建议(接 Story 1.1)

### Story 3.5: Provider 管理 + Fallback 链(E1 降级)

As a **用户**,
I want **为每个节点选 LLM provider(Claude/OpenAI/Gemini/Ollama/0G Compute)并配置 fallback 顺序**,
So that **任一 provider 超时不会 demo 中断**。

**Acceptance Criteria:**

**Given** 节点 Inspector 显示 Provider 配置面板
**When** 用户选 "Claude" 为主,勾选 "OpenAI → Ollama" 作为 fallback 链
**Then** YAML 生成 `provider: "claude", fallback_chain: ["openai", "ollama"]`

**Given** Claude API 30 秒超时
**When** Runtime 调用该节点
**Then** 自动切换 OpenAI 重试
**And** SSE 发出 `provider.fallback` 事件,看板显示橙色 toast "Claude 超时,切换到 OpenAI"
**And** 节点产出标注"本节点来自 OpenAI fallback"(FR18 + E1)

### Story 3.6: 6 个种子模板 YAML 定稿 + 可运行

As a **首次访问用户**,
I want **6 个种子模板全部可加载并运行出完整结果**,
So that **Demo 叙事完整,每个 persona 有专属样板**。

**Acceptance Criteria:**

**Given** `templates/` 目录新增 6 个 YAML:`solo-company.yaml`(8 角色双 Lane)、`academic-paper.yaml`(6 角色含 Advisor)、`newsroom.yaml`(5 角色)、`modern-startup.yaml`(3 角色)、`ming-cabinet.yaml`(4 角色)、`blank.yaml`(1 空角色模板)
**When** 任一模板被加载并 `Run`
**Then** 至少在默认 provider 可用时端到端跑完(不 crash)
**And** 所有 6 种 Workflow Block(plan / parallel / barrier / retry_gate / approval_gate / writeback)至少在 Academic Paper 真实调用(Technical Success 第 6 条)

**Given** Solo Company 模板
**When** 运行并观察 Policy Matrix 事件
**Then** 至少触发 1 次真实驳回(PRD User Success 第 2 条),合规官驳回内容官 或 稽查员驳回工程师

---

# Epic 4: Live Dashboard + Real-time Observation + Dynamic Policy

## Epic 4 Stories

### Story 4.1: SSE 事件总线 + /events Endpoint

As a **前端看板**,
I want **通过 `EventSource('/workflow/runs/{id}/events')` 订阅 runtime 事件流**,
So that **实时呈现 agent 协作过程**。

**Acceptance Criteria:**

**Given** `shadowflow/runtime/events.py` 实现每 run 一个 `asyncio.Queue`
**When** Runtime 执行节点 → 写事件到 Queue
**Then** SSE endpoint 读 Queue → 按 `event: {type}\ndata: {json}\n\n` 格式推送
**And** 每事件携带 `event_id`(单调递增),支持 `Last-Event-ID` header 断线重连补齐

**Given** 前端订阅该 SSE 流
**When** 节点状态变化
**Then** 前端收到事件到 UI 渲染延迟 ≤ 500ms(P4)
**And** 不出现状态竞争或消息丢失(P5)

### Story 4.2: LiveDashboard 看板组件

As a **Demo 观众**,
I want **在看板上看到每个节点的实时执行状态(pending/running/succeeded/failed/rejected)**,
So that **6 分钟戏剧 J1 能真实上演,不是 mock**。

**Acceptance Criteria:**

**Given** `src/core/components/Panel/LiveDashboard.tsx` 新增
**When** 挂载到 `/runs/:runId` 或 `/editor` 右下角
**Then** 显示当前 run 的所有节点,每个节点有 5 种状态色标(pending 灰 / running 蓝动画 / succeeded 绿 / failed 红 / rejected 红闪)
**And** 节点间消息流以浮动箭头动画展示(FR20)
**And** 用 Zustand selector 精确订阅,只重渲染变化节点(不触发全局重渲染)

### Story 4.3: 驳回事件视觉强化 Toast

As a **Demo 观众**,
I want **驳回事件发生时有大号红色 toast 不可被忽略**,
So that **J1 Demo 高光 #1/#2、J3 主编驳回等戏剧性时刻能被评委抓住**。

**Acceptance Criteria:**

**Given** SSE 流收到 `policy.violation` 或 `node.rejected` 事件
**When** LiveDashboard 处理
**Then** 顶部弹出大号(≥ 18pt)红色 toast:"⚠️ Policy Matrix: {sender} 驳回 {receiver}",持续 5 秒
**And** 被驳回节点闪烁红边(3 次)提示视觉焦点
**And** toast 可点击展开查看驳回原因全文

### Story 4.4: 节点详情 TraceView

As a **用户**,
I want **点开任一节点查看输入/输出/历史/错误**,
So that **深度排查或理解 agent 决策过程**。

**Acceptance Criteria:**

**Given** LiveDashboard 中任一节点
**When** 用户点击节点
**Then** 右侧 TraceView 面板滑出,显示:
- Inputs(该节点接收的消息/上下文)
- Outputs(产出)
- Timeline(started/succeeded/retried/rejected 时间线)
- Error(若有)

**And** 历史记录包含所有 retry 轮次(含每轮 fail reason)

### Story 4.5: PolicyMatrixPanel 可视化编辑 + 运行中改制度

As a **主编陈姐(J3 persona)**,
I want **在运行中打开 Policy Matrix 面板,新增一行规则并保存,立即生效**,
So that **16:48-16:50 的 3 分钟改制度高光能演示**。

**Acceptance Criteria:**

**Given** `PolicyMatrixPanel.tsx` 新增,显示 sender × receiver 矩阵
**When** 用户勾选/取消某单元格
**Then** 前端 Zustand store 更新,保存按钮高亮

**Given** 用户点击"保存并应用到当前 run"
**When** 前端调 `POST /workflow/runs/{id}/policy`
**Then** Runtime 重编译 policy(保留已完成节点 output,下游未执行节点使用新 policy)
**And** SSE 发出 `policy.updated` 事件,LiveDashboard 刷新
**And** 整个改矩阵 + 重跑过程 ≤ 3 分钟(PRD User Success 共通指标)

### Story 4.6: 运行中新增角色 + Re-run with New Policy

As a **陈姐**,
I want **在运行中加"事实核查员"角色 + 调整矩阵 + 重跑**,
So that **我的编辑部流程能随时进化,不需要从头创建项目**。

**Acceptance Criteria:**

**Given** 一个正在运行或已完成的 run
**When** 用户在编辑器画布拖入新节点(如 `fact_checker`)并在矩阵中配置其权限
**Then** 点"Save & Re-run" 触发 `POST /workflow/runs/{id}/reconfigure` + 重新编译 WorkflowDefinition
**And** 未改动的节点输出被复用(不重跑 LLM)
**And** 新增节点正确参与流程,Runtime 重新 fan-out

**Given** 用户不想重跑,仅保存新配置为模板草稿
**When** 点击 "Save as Template"
**Then** 不触发 re-run,仅更新 Zustand store 和本地 YAML 导出

---

# Epic 5: 0G Ecosystem Integration + CID Share/Clone

## Epic 5 Stories

### Story 5.1: 0G Storage 前端直调 + BYOK 密钥管理

As a **用户**,
I want **我的 0G 密钥仅存储于本地 localStorage,前端直接上传 trajectory 到 0G**,
So that **后端永不接触我的密钥(S1 BYOK)**。

**Acceptance Criteria:**

**Given** `src/adapter/zerogStorage.ts` 封装 `@0glabs/0g-ts-sdk`
**When** 用户在设置页输入 0G 私钥
**Then** 密钥以加密形式(Web Crypto API)存储到 localStorage,内存中解密使用
**And** 密钥**不出现**在任何 network request payload、log、error message(S1)

**Given** 用户发起 0G Storage 上传
**When** 前端调用 SDK
**Then** SDK 直接签名并提交到 0G Storage 端点(不经过 `shadowflow-api`)
**And** 单次上传 ≤ 10s(P6),返回 CID

### Story 5.2: Trajectory Sanitize Scan

As a **用户**,
I want **上传前自动扫描 trajectory,剔除 PII 和密钥**,
So that **我不小心把邮箱或 API key 写进 prompt,不会上链泄漏**。

**Acceptance Criteria:**

**Given** `shadowflow/runtime/sanitize.py` 新增
**When** 前端调 `POST /workflow/runs/{id}/trajectory/sanitize`
**Then** 后端扫描 trajectory,按白名单字段列表剔除:邮箱 / 电话 / 身份证 / 银行账户 / API key(以 `sk-` 开头)/ session token
**And** 返回 `{cleaned_trajectory, removed_fields: [...]}`

**Given** 扫描命中敏感字段
**When** 前端显示 `removed_fields` 列表给用户
**Then** 用户可选"确认继续上传"或"取消",系统默认要求用户确认(S2 非静默)

### Story 5.3: 0G Storage 下载 + Merkle 验证

As a **用户**,
I want **通过 CID 下载 trajectory,且验证数据完整性**,
So that **我能信任从 0G 克隆的模板未被篡改**。

**Acceptance Criteria:**

**Given** 用户粘贴 CID 到 `/import` 页面输入框
**When** 点 "Load"
**Then** 前端调 SDK 下载 + 本地 Merkle root 验证
**And** 验证通过 → 渲染模板,顶部显示 "✓ 0G Storage · CID 验证通过"
**And** 验证失败 → Toast "Merkle 验证失败,数据可能被篡改",不加载

### Story 5.4: 0G Compute 作为第 5 Provider 接入

As a **技术评委**,
I want **看到 0G Compute 真实被用于推理,不是装饰**,
So that **ShadowFlow 是 0G 原生不是贴标签(PRD 辨识度要求)**。

**Acceptance Criteria:**

**Given** `shadowflow/llm/zerog.py` 新增,继承 `LLMProvider`
**When** 节点配置 `provider: "0g_compute"` 并运行
**Then** 底层通过 OpenAI SDK 改 `base_url` 调用 0G Compute 端点
**And** 每次推理后调 `processResponse(providerAddress, chatID, usageData)`(0G skill 契约)
**And** ChatID 从 `ZG-Res-Key` header 提取,`data.id` 作 fallback

**Given** 0G Compute 调用成功率统计
**When** 连续跑 100 次推理
**Then** 成功率 ≥ 95%(I3)

### Story 5.5: Import by CID + 作者署名链

As a **跨 persona 克隆者(J4)**,
I want **通过 CID 导入模板 + 修改后重归档 + 署名链自动累积**,
So that **模板传承链可追溯,为 Phase 3 INFT 铸造留 metadata 基础**。

**Acceptance Criteria:**

**Given** `/import` 页面提供 "Import by CID" 一级入口(不藏在二级菜单)
**When** 用户输入 CID 并加载
**Then** 模板加载 + Merkle 验证 + 署名链展示(`author_lineage: ["Alex", "Jin"]`)

**Given** 用户修改模板(如新增角色)并点 "Publish to 0G"
**When** 前端重新归档
**Then** 上传产出新 CID
**And** 新 trajectory metadata 中 `author_lineage` 自动追加当前用户标识
**And** 原 CID 的 trajectory 不被修改(永久不可变,符合 PRD GDPR 应对)

---

# Epic 6: Agent Interactivity + Demo Station + Pitch Ready

## Epic 6 Stories

### Story 6.1: Agent Gap Detection + 反向提问(E2)

As a **学者林筱(E2 边界场景)**,
I want **SectionAgent 发现实验日志缺 baseline 时,弹窗问我三个选项而不是瞎填**,
So that **ShadowFlow 体现"宁可提问不瞎编"的工程美德**。

**Acceptance Criteria:**

**Given** `events.py` 扩展 `agent.gap_detected` 事件
**When** Agent 检测到输入不完整(如引用的数据 ID 在实验日志中不存在)
**Then** 发出 `agent.gap_detected` 事件,payload 含 `{gap_type, description, choices: [A, B, C]}`
**And** Runtime 暂停该节点,等待用户决策

**Given** 前端收到事件
**When** 弹窗展示三选项 "补充数据 / 从论文移除此对比 / 注释为 'will be updated'"
**Then** 用户选择后前端调 `POST /workflow/runs/{id}/gap_response`
**And** Runtime cascade 更新依赖下游(FR37),重新运行被影响节点

### Story 6.2: LandingPage — Slogan + 象限图 + CTA

As a **0G Hackathon 评委首次访问**,
I want **落地页 3 秒内理解产品核心差异化**,
So that **J5 路演前 15 秒内建立正确心智**。

**Acceptance Criteria:**

**Given** `src/pages/LandingPage.tsx` 新增作为 `/` 路由
**When** 首次访问
**Then** 首屏 ≤ 2s 渲染完成(P1),显示:
- Slogan:"让每个人都能设计自己的 AI 协作团队,团队本身是链上资产"
- 象限图:ShadowFlow 独占右上"真协作团队"象限
- CTA 按钮:"Try Live Demo(无需注册)" + "View GitHub"
- OG meta 完整(分享到 Twitter/Discord 有漂亮预览)

**And** 移动端 view-only 可见(桌面端主场景,mobile 仅展示)

### Story 6.3: TemplatesPage 6 模板 Gallery + Quick Demo 预填

As a **评委**,
I want **在模板选择页 30 秒内决定 demo 哪个模板**,
So that **J5 路演 0:15-0:45 阶段转化率高**。

**Acceptance Criteria:**

**Given** `src/pages/TemplatesPage.tsx` 作为 `/templates` 路由
**When** 访问
**Then** 6 张卡片展示(Solo Company / Academic Paper / Newsroom / Modern Startup / Consulting / Blank)
**And** 每张卡片含:30 字痛点描述 + GIF 预览 + "Quick Demo"预填按钮

**Given** 用户点 Quick Demo
**When** 跳转 `/editor/{templateId}` 并自动填入指令
**Then** 指令框预填(如 Solo Company:"修登录 bug + 发 CSV 推文 + 回邮件 + 评估 GDPR")
**And** 点击 "Run" 直接触发 run(降低门槛,FR39)

### Story 6.4: AboutPage — 差异化对比 + 0G 链上证据 + 路线图

As a **评委深度调研**,
I want **底部三个一级入口快速看差异化和链上证据**,
So that **J5 路演 2:30-4:30 的"技术背书"叙事完整**。

**Acceptance Criteria:**

**Given** `src/pages/AboutPage.tsx` 新增,对应 `/about` 路由
**When** 访问
**Then** 三个 Section:
- **Differentiation**:9 条"vs X"问答(vs ChatGPT / Cherry / N8N / LangGraph / AutoGen / CrewAI / Edict / AIverse / Dify),含对标表格与蓝海象限图
- **0G On-Chain Evidence**:至少 1 条真实 trajectory CID + 0G Explorer 外链按钮(评委点击直达)
- **Roadmap**:Phase 1 MVP ✅ / Phase 2 Sidecar 集成 / Phase 3 INFT Marketplace(三模式)

**And** 所有 9 条 "vs X" 问答 100% 可点展开(PRD Measurable Outcomes)
**And** 底部学术背书:引用 NMN / Voyager / WorkTeam / Neural Bandit / PaperOrchestra 5 条论文链接

