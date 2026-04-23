---
name: epics-addendum-2026-04-23-user-builder
title: Epics Addendum · User Agent Builder + Knowledge/Memory/Eval + Agent Kits
version: 0.1
created: 2026-04-23
status: proposed
parent: epics.md
trigger: docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md + hello-agents/docs
---

# Epics Addendum · 2026-04-23 · 面向用户的 Agent Builder 三新 Epic

本文件是 [epics.md](epics.md) 的增量补丁，用于把 ShadowFlow 从“面向懂系统的人搭建多智能体结构”，推进为“普通用户也能创建、验证、发布第一个可用 Agent / Agent Team”的产品路径。

新增内容分三部分：
- **Epic 8** · Agent Builder 主路径（Goal / Scene / Graph）
- **Epic 9** · Knowledge / Memory / Eval Foundation
- **Epic 10** · Agent Kits（场景化 Agent Kits）

本轮增补显式参考：
- `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`
- `hello-agents/docs/chapter5`（低代码平台）
- `hello-agents/docs/chapter8`（记忆与检索）
- `hello-agents/docs/chapter9`（上下文工程）
- `hello-agents/docs/chapter12`（性能评估）
- `hello-agents/docs/chapter14`（自动化深度研究智能体）
- `hello-agents/docs/chapter15`（构建赛博小镇）

核心判断：

> ShadowFlow 已经完成了“结构层搭建”和部分“团队层搭建”，下一步要补的是“用户层搭建”。

---

# Epic 8: Agent Builder 主路径（Goal / Scene / Graph）

**Status**: backlog  
**Priority**: P0（用户层搭建主路径，优先级高于继续横向铺开协作视图）  
**Goal**: 把 ShadowFlow 从 `schema-first / graph-first` 的工作流编辑器，推进为 `goal-first / scene-first / progressive disclosure` 的 Agent Builder。

**Epic 8 解决的问题**:
- 用户不懂 workflow schema 时，如何依然创建第一个可用 Agent
- 用户创建的不是“节点集合”，而是“带角色、知识、工具边界、验证闭环的 Agent Blueprint”
- 模板、画布、群聊、单聊如何收束为一条连续主路径

**依赖**:
- Epic 3 · Workflow Editor + Template Compilation
- Epic 3.6 Addendum · Template Schema 扩展
- Epic 4 · SSE / LiveDashboard
- Epic 7 · Collaboration Quad-View
- Epic 9 · Knowledge / Memory / Eval Foundation（部分入口先占位，能力后接入）

## Epic 8 Stories

### Story 8.1: AgentBlueprint 合同 + Builder API 骨架

**As a** ShadowFlow 平台开发者  
**I want** 建立 `AgentBlueprint / RoleProfile / ToolPolicy / KnowledgeBinding / MemoryProfile / EvalProfile / PublishProfile` 的统一 Builder 合同，并暴露最小 Builder API  
**So that** Goal / Scene / Graph 三层编辑围绕同一份中间产物工作，而不是直接耦合到底层 workflow schema。

**Acceptance Criteria:**

**Given** 新增 Builder 领域模型  
**When** 查看前后端类型与 API 契约  
**Then** 存在以下一等对象：
- `AgentBlueprint`
- `RoleProfile`
- `ToolPolicy`
- `KnowledgeBinding`
- `MemoryProfile`
- `EvalProfile`
- `PublishProfile`

**And** 后端至少提供以下 endpoint：
- `POST /builder/blueprints/generate`
- `POST /builder/blueprints/instantiate`
- `POST /builder/blueprints/smoke-run`
- `POST /builder/blueprints/publish`
- `GET /builder/kits`

**And** `instantiate` 结果可映射到现有 `Template` 与 `WorkflowDefinition`

**Technical Hints:**
- 后端建议新增 `shadowflow/runtime/contracts_builder.py`、`shadowflow/runtime/builder_service.py`、`shadowflow/api/builder.py`
- 前端建议新增 `src/common/types/agent-builder.ts`、`src/api/builder.ts`

### Story 8.2: Goal Mode 目标输入 + Blueprint 生成

**As a** 非工程用户  
**I want** 先输入目标、对象、知识来源和期望产出，再由系统生成初始 Agent Blueprint  
**So that** 我不需要先理解节点、边、Policy Matrix 或 YAML，就能开始创建自己的 Agent。

**Acceptance Criteria:**

**Given** 用户进入 Builder  
**When** 默认打开 `Goal Mode`  
**Then** 页面以任务输入为主，而不是空白画布

**And** 最少包含以下输入项：
- 我想做什么（goal）
- 给谁用 / 服务对象是谁（audience）
- 需要哪些知识来源（docs / URLs / none）
- 更像单个助手还是一个团队（single / team）
- 最终想得到什么产物（answer / report / review / workflow draft）

**And** 生成结果返回后，用户可：
- 接受并进入 Scene Mode
- 重新生成
- 从模板生成
- 直接切换到 Graph Mode

**Technical Hints:**
- Goal Mode 的成功标准是让用户 10 分钟内拿到第一个可跑骨架
- 推荐在 meta 中回传 `confidence / missing_inputs / suggested_next_step`

### Story 8.3: Scene Mode Shell（Scene Tree + Canvas + Inspector）

**As a** 大多数 Builder 用户  
**I want** 在一个类似 Godot 的 `Scene Tree + Canvas + Inspector` 界面中编辑团队与角色，并能在 Goal / Scene / Graph 三层之间切换  
**So that** 我用“场景编辑器”的心智创建智能体，而不是被 workflow 级实现细节淹没。

**Acceptance Criteria:**

**Given** Builder Blueprint 已生成  
**When** 用户进入 `Scene Mode`  
**Then** 页面至少包含四个区域：
- 左侧 `Scene Tree`
- 中央 `Canvas`
- 右侧 `Inspector`
- 顶部 `Goal / Scene / Graph` segmented control

**And** `Scene Tree` 至少表达：
- Team 根节点
- Agent 节点
- Shared Tools
- Shared Memory / Shared Knowledge 入口

**And** `Inspector` 至少可编辑：
- `role title`
- `role description / system prompt`
- `handoff / collaboration style`
- `visible tools`
- `knowledge bindings`
- `memory profile`（最小版）

**Technical Hints:**
- 优先复用现有 `EditorPage / WorkflowCanvas / Inspector` 资产
- 需要新增 `blueprint state` 与 `graph projection state` 双状态层

### Story 8.4: Knowledge Dock 入口 + Knowledge Binding 主路径

**As a** 想让 Agent 读取自己资料的用户  
**I want** 在 Builder 主路径中直接绑定文档、URL 或知识包入口  
**So that** 我创建出的 Agent 从一开始就有“知道什么”的能力，并且输出可以对知识来源负责。

**Acceptance Criteria:**

**Given** 用户处于 Scene Mode  
**When** 打开 `Knowledge Dock`  
**Then** 可以执行以下动作：
- 上传文档
- 填写 URL / 数据源
- 绑定已有 Knowledge Pack
- 选择“暂不绑定知识”

**And** 每个绑定至少包含：
- `source_type`
- `source_ref`
- `retrieval_mode`
- `citation_required`
- `freshness_hint`

**And** 若启用引用开关，则后续 Smoke Run 把“是否正确引用来源”作为检查项之一

**Technical Hints:**
- Epic 8 只做主路径入口，不在本 Epic 内完成完整知识库平台
- UI 文案尽量避免直接暴露 chunk / top-k / embedding 等术语

### Story 8.5: Smoke Run 验证面板 + 失败解释

**As a** Builder 用户  
**I want** 在发布前一键运行 Smoke Run，并看到用户能看懂的失败原因  
**So that** 我可以先验证 Agent 是否能完成最小任务闭环，而不是把半成品直接投入使用。

**Acceptance Criteria:**

**Given** 用户完成 Goal / Scene 配置  
**When** 点击 `Smoke Run`  
**Then** 至少检查以下项目：
- 角色能否正常初始化
- 必要工具是否可用
- 知识绑定是否可访问
- 最小任务能否从输入走到输出
- 引用要求是否被满足（如启用）

**And** 失败解释至少按以下维度归因：
- 目标不够清晰
- 知识缺失或不可访问
- 工具权限不足
- 角色职责冲突
- Graph 配置存在断裂

**Technical Hints:**
- 复用 Epic 4 事件流，但需要一层 Builder 友好的错误翻译层

### Story 8.6: Publish Backfill（回填 Template / Workflow / Agent App）

**As a** 已完成 Builder 配置的用户  
**I want** 把 Blueprint 一键回填为 Template / Workflow，并发布为可复用的 Agent App 或 Team Template  
**So that** Builder 的产物能进入 ShadowFlow 现有生态，而不是停留在一次性草稿状态。

**Acceptance Criteria:**

**Given** Blueprint 已通过 Smoke Run 或用户选择继续发布  
**When** 点击 `Publish`  
**Then** 系统至少支持以下回填目标：
- `Template`
- `WorkflowDefinition`
- `Agent App`（MVP 可先为可复用模板实例）

**And** 用户可获得：
- `templateId / workflowId`
- kit 标签
- 跳转到 Editor / Templates / Chat 的入口

**And** 现有系统可识别由 Builder 生成的内容并继续编辑

**Technical Hints:**
- 推荐在模板元数据中记录 `builder_origin`、`builder_version`、`source_goal`

---

# Epic 9: Knowledge / Memory / Eval Foundation

**Status**: backlog  
**Priority**: P0（Epic 8 之后的第一层硬基础）  
**Goal**: 把 ShadowFlow 的 agent 从“会执行的节点”升级为“知道自己知道什么、会选择性记住什么、能解释来源、可被验证回归”的可持续对象。

**Epic 9 解决的问题**:
- 没有 `KnowledgePack`，用户无法稳定接入自己的资料
- 没有 `Citation Trace`，研究/知识型结果不可解释
- 没有 `MemoryProfile`，长时程体验退化成一次性 workflow
- 没有 `Agent State`，用户无法理解 agent 当前的连续状态
- 没有 `EvalProfile / Smoke Regression`，发布缺少客观门槛

**依赖**:
- Epic 8 · Agent Builder 主路径
- Epic 1 · Runtime / Events / Lineage 基础
- Epic 4 · Archive / Observability 视图
- Epic 5 · 0G 归档能力（增强项，非硬前置）

## Epic 9 Stories

### Story 9.1: KnowledgePack CRUD + Ingest Pipeline

**As a** Builder 用户 / 模板作者  
**I want** 把文件、文档集合与检索策略封装成可复用的 KnowledgePack，并绑定到 agent 或 team  
**So that** 我的 agent 知道“能访问什么知识、以什么方式检索、是否必须带出处”。

**Acceptance Criteria:**

**Given** 用户在 Builder 的 `Knowledge Dock` 中创建 KnowledgePack  
**When** 填写 `pack_id / name / description / sources / retrieval_profile / citation_required / freshness_policy`  
**Then** 系统保存一个一等对象 `KnowledgePack`

**And** ingest 流程完成 `parse → chunk → embed/index → status update`

**And** 每个 source 至少记录：
- `source_id`
- `mime_type`
- `imported_at`
- `checksum`
- `ingest_status`
- `chunk_count`

**Technical Hints:**
- 后端建议新增 `shadowflow/api/knowledge.py`、`shadowflow/memory/knowledge_pack.py`、`shadowflow/memory/retrieval_profiles.py`
- 前端建议新增 `src/pages/KnowledgePage.tsx`、`src/core/components/knowledge/KnowledgeDock.tsx`

### Story 9.2: Citation Trace + Provenance Contract

**As a** 研究 / 知识型 agent 的最终用户  
**I want** 每段回答、结论和报告内容都能回溯到具体来源片段与检索轨迹  
**So that** 我能判断结果是否可信，也能把产出用于汇报、审阅与引用。

**Acceptance Criteria:**

**Given** agent 使用了 KnowledgePack 检索  
**When** 生成回答、BriefBoard 摘要或最终报告  
**Then** 输出中携带 `citation_trace[]`

**And** 每条 trace 至少包含：
- `pack_id`
- `source_id`
- `chunk_id`
- `excerpt`
- `confidence`
- `retrieved_at`
- `task_or_artifact_ref`

**And** 缺引用时系统标记 `citation_missing`

**And** 归档或导出时，citation trace 以结构化字段保留

**Technical Hints:**
- 后端建议新增 `shadowflow/runtime/citation_service.py`
- 前端建议新增 `src/core/components/citation/CitationViewer.tsx`

### Story 9.3: MemoryProfile + Context Writeback

**As a** 创建长期可交互 agent 的用户  
**I want** 为 agent 配置工作记忆、情景记忆、语义记忆与写回规则  
**So that** 它能持续进化又不会把无关上下文全部塞进下一轮推理。

**Acceptance Criteria:**

**Given** Builder 或 Template 选择 MemoryProfile  
**When** 保存配置  
**Then** 至少支持以下字段：
- `working_memory_limit`
- `episodic_retention_days`
- `semantic_retrieval_top_k`
- `writeback_policy`
- `state_sync_policy`
- `compression_policy`

**And** run 完成后按规则把信息分层写回：
- 当前会话上下文进入 working memory
- 关键交互事件进入 episodic memory
- 被确认的偏好、规则、事实进入 semantic memory

**And** 上下文接近预算上限时执行 `Gather → Select → Structure → Compress`

**Technical Hints:**
- 优先扩展 `shadowflow/memory/session.py`、`user.py`、`global_memory.py`
- 建议新增 `shadowflow/runtime/context_builder.py`

### Story 9.4: Agent State Panel + Snapshot Restore

**As a** 使用长期 agent 的用户 / 调试者  
**I want** 看到 agent 当前的状态字段、活跃任务、最近写回与状态快照  
**So that** 我能理解它现在“是谁、记住了什么、为什么表现成这样”。

**Acceptance Criteria:**

**Given** agent 配置了 MemoryProfile 和 RoleProfile  
**When** 系统维护 Agent State  
**Then** 至少保留：
- `agent_id`
- `role_profile_ref`
- `memory_profile_ref`
- `state_fields`
- `session_summary`
- `recent_artifacts`
- `pending_tasks`
- `last_writeback_at`
- `state_version`

**And** 用户可：
- 查看最近状态摘要
- 查看最近记忆命中
- 查看绑定的 KnowledgePack
- 执行 `edit / reset / snapshot / restore`

**Technical Hints:**
- 后端建议新增 `shadowflow/api/state.py`、`shadowflow/runtime/state_service.py`
- 前端建议新增 `src/core/components/agent-state/AgentStatePanel.tsx`

### Story 9.5: EvalProfile + Smoke Eval Runner

**As a** 模板作者 / 发布者  
**I want** 为每个 agent、team 或 kit 定义最低评测标准，并一键执行 smoke eval  
**So that** 我在发布前能知道它是否真的具备目标能力，而不是“跑得通就算好”。

**Acceptance Criteria:**

**Given** 用户为 blueprint / template / kit 配置 EvalProfile  
**When** 保存  
**Then** 至少支持：
- `success_metrics`
- `test_prompts`
- `expected_artifacts`
- `citation_checks`
- `latency_budget_ms`
- `failure_thresholds`

**And** smoke eval 输出：
- 通过/失败
- 各项 metric 分数
- 是否满足 citation 要求
- 主要失败原因
- 推荐修复入口

**Technical Hints:**
- 后端建议新增 `shadowflow/api/evals.py`、`shadowflow/runtime/eval_service.py`
- 前端建议新增 `src/pages/EvalsPage.tsx`

### Story 9.6: Smoke Regression Gate + Release Report

**As a** ShadowFlow 维护者 / 发布负责人  
**I want** 在模板修改、知识更新或发布前自动执行 smoke regression，并与上一版基线比较  
**So that** 系统不会在“看起来更强”的迭代中悄悄退化。

**Acceptance Criteria:**

**Given** 发生以下任一变更：
- 模板结构变化
- KnowledgePack 内容变化
- MemoryProfile / EvalProfile 变化
- Provider 或 tool policy 变化

**When** 用户点击 publish、save as template 或 run release check  
**Then** 系统自动触发 smoke regression

**And** 至少比较：
- 成功率
- citation 完整率
- 首次通过率
- 平均时延
- token 开销
- 人工干预次数

**And** 若核心指标跌破阈值，则发布标记为 `blocked` 或 `warning`

**Technical Hints:**
- 建议新增 `shadowflow/runtime/regression_service.py`
- 前端建议新增 `src/core/components/evals/RegressionReportPanel.tsx`

---

# Epic 10: Agent Kits（场景化 Agent Kits）

**Status**: backlog  
**Priority**: P0（Builder 主路径成功率的核心放大器）  
**Goal**: 为 ShadowFlow Builder 提供用户听得懂、拿来就能跑的场景化 Agent Kits，让用户不必先理解 runtime / node / policy 细节，也能从目标出发创建 Research Kit、Knowledge Assistant Kit、Review & Approval Kit、Persona / NPC Kit。

**依赖**:
- Epic 8 · Agent Builder 主路径
- Epic 9 · Knowledge / Memory / Eval 基础层
- Epic 1 · Policy Matrix
- Epic 4 · Observability / SSE
- Epic 7 · Collaboration Quad-View

**设计原则**:
- `Template-first but not template-only`
- `Conversation-first for new users`
- `Scene-first mental model`
- `Trust-first delivery`
- `Persistent agents where needed`

## Epic 10 Stories

### Story 10.1: Research Kit（规划-搜集-总结-报告闭环）

**As a** 研究型用户 / 分析师 / 内容策划  
**I want** 通过 Builder 一键创建 Research Kit  
**So that** 我能从一个研究主题快速得到带引用、可追踪、可复用的研究结果，而不是手工拼 planner / search / report 节点。

**Acceptance Criteria:**

**Given** 用户选择 `Research Kit`  
**When** 进入 Goal Mode  
**Then** 默认向导至少包含：
- 研究主题
- 研究目标 / 输出形式
- 资料新鲜度要求
- 是否强制引用
- 最大搜索轮次 / 深度

**And** 默认 Scene 至少包含：
- `Planner`
- `Researcher / Gatherer`
- `Summarizer`
- `Report Writer`

**And** smoke-run 产出：
- TODO / 子任务拆解
- 研究进度日志
- 中间摘要
- 最终结构化报告
- 来源引用列表

**Technical Hints:**
- 新增 `shadowflow/runtime/kits/research_kit.py`
- 默认 Blueprint 应吸收 chapter14 的 `plan → execute → report`

### Story 10.2: Knowledge Assistant Kit（知识问答 + 引用 + 转人工）

**As a** 团队知识管理员 / 企业用户 / 文档助手创建者  
**I want** 通过 Builder 创建 Knowledge Assistant Kit  
**So that** 我能把文档、FAQ、制度、产品资料快速变成可问答、可引用、可升级的知识助手。

**Acceptance Criteria:**

**Given** 用户选择 `Knowledge Assistant Kit`  
**When** 完成配置  
**Then** 默认 Scene 至少包含：
- `Retriever`
- `Answerer`
- `Escalation / Human Handoff`

**And** 默认 policy 支持：
- 无命中文档时不编造答案
- 低置信度时转人工或转 Review
- 高风险问题必须附引用

**And** 默认 eval 至少检查：
- 文档命中率
- 是否附引用
- 拒答 / 升级是否触发正确

**Technical Hints:**
- 深度依赖 Epic 9 的 `KnowledgePack / Citation / RetrievalProfile`

### Story 10.3: Review & Approval Kit（Writer / Reviewer / Approver 闭环）

**As a** 需要内容审核、方案审批或多角色把关的用户  
**I want** 快速创建 Review & Approval Kit  
**So that** 我可以把“生成-复核-审批-回退重试”的流程变成一套开箱即用的 Agent App。

**Acceptance Criteria:**

**Given** 用户选择 `Review & Approval Kit`  
**When** 完成初始配置  
**Then** 默认 Scene 至少包含：
- `Author / Writer`
- `Reviewer`
- `Approver`
- `Rework Loop`

**And** 默认 policy matrix 至少定义：
- Writer 不能直接 Deliver
- Reviewer 可 reject 回 Writer
- Approver 可 approve / reject
- reject 触发 checkpoint + rerun

**And** 默认 eval 至少检查：
- 驳回路径是否生效
- 待审批事件是否可见
- 重跑后最终状态是否正确

**Technical Hints:**
- 强依赖既有 `Policy Matrix / Approval Gate / SSE`

### Story 10.4: Persona / NPC Kit（角色、记忆、状态、关系）

**As a** 希望创建长期角色 Agent、陪伴型 Agent 或 NPC 的用户  
**I want** 通过 Persona / NPC Kit 快速创建一个带人格、记忆和状态的持续角色  
**So that** 这个 Agent 不再只是一次性执行器，而是能在多轮互动中保持连贯性和角色感。

**Acceptance Criteria:**

**Given** 用户选择 `Persona / NPC Kit`  
**When** 完成实例化  
**Then** 该 Kit 至少具备：
- `RoleProfile`
- `MemoryProfile`
- `State Fields`
- `Relationship Hooks`

**And** 默认结果视图至少包含：
- 单聊界面（AgentDM）
- 角色状态面板
- 记忆查看 / 清理入口

**And** 默认 eval 至少检查：
- 角色语气是否稳定
- 记忆是否按 profile 写回
- 状态变更是否可解释

**Technical Hints:**
- 与 Epic 9 的 `MemoryProfile / Agent State` 紧耦合
- 角色、记忆、状态、关系设计吸收 chapter15 的产品抽象

### Story 10.5: Kit Defaults Registry（默认模板 / 默认 Policy / 默认 Eval）

**As a** Builder 产品与平台开发者  
**I want** 每个 Kit 都有统一的默认模板、默认 policy、默认 eval 注册表  
**So that** Kit 不会退化成只有名字的包装，而能稳定地产生可运行、可验证、可发布的 Scene。

**Acceptance Criteria:**

**Given** 平台内存在多个 Agent Kits  
**When** Builder 或 API 读取 Kit Catalog  
**Then** 每个 Kit 至少暴露以下元数据：
- `default_blueprint`
- `default_scene`
- `default_policy_profile`
- `default_eval_profile`
- `default_result_view`
- `recommended_inputs`
- `supported_modes`

**And** 若新增 Kit 缺少默认 template / policy / eval 任一项，则禁止其进入“可发布”状态

**Technical Hints:**
- 新增 `shadowflow/runtime/kits/registry.py`
- 前端建议新增 `src/core/components/builder/kits/KitCatalog.tsx`

### Story 10.6: Kit Smoke Run & Eval Pack（首跑验证与回归基线）

**As a** 首次创建 Agent 的用户 / 模板作者 / 平台维护者  
**I want** 每个 Kit 在发布前都有默认 smoke-run 与 eval pack  
**So that** 我能在几分钟内知道这个 Kit 是否真的可用，而不是发布后才发现只剩一张漂亮卡片。

**Acceptance Criteria:**

**Given** 任一 Kit 完成实例化  
**When** 用户点击 `Smoke Run`  
**Then** 系统自动执行该 Kit 的默认最小任务集，并输出：
- 是否通过
- 失败阶段
- 缺失配置
- 建议修复动作

**And** 每个 Kit 至少自带：
- 1 份默认 smoke case
- 1 份默认 regression case

**And** 默认回归样例至少覆盖：
- `Research Kit`: 研究主题最小闭环
- `Knowledge Assistant Kit`: FAQ / 引用 / 拒答场景
- `Review & Approval Kit`: reject → rework → approve
- `Persona / NPC Kit`: 连续对话与状态写回

**Technical Hints:**
- 强依赖 Epic 9 的 `EvalProfile / Smoke Regression`
- 建议新增 `shadowflow/runtime/kits/evals/`

---

# Cross-Epic Notes

- **Epic 8** 负责“生成与编辑主路径”
- **Epic 9** 负责“可信与连续的能力底座”
- **Epic 10** 负责“场景化产品封装”

三者关系应固定表达为：

> Epic 8 是壳，Epic 9 是底座，Epic 10 是场景化价值层。

---

# 并入建议

本 addendum 经确认后：
- 并入 `sprint-status.yaml` 作为 Epic 8 / 9 / 10 的 `backlog`
- 后续如需进入开发，优先顺序建议为：
  1. `8-1 → 8-2 → 8-3`
  2. `9-1 → 9-2`
  3. `10-5 → 10-1`
  4. 其余 Story 视 Builder 落地情况继续推进
