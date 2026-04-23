# Story 8.1: AgentBlueprint 合同 + Builder API 骨架

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **ShadowFlow 平台开发者**,
I want **建立 `AgentBlueprint / RoleProfile / ToolPolicy / KnowledgeBinding / MemoryProfile / EvalProfile / PublishProfile` 的统一 Builder 合同，并暴露最小 Builder API**,
so that **Goal / Scene / Graph 三层编辑围绕同一份中间产物工作，而不是直接耦合到底层 workflow schema**。

## Acceptance Criteria

### AC1 — Builder 领域合同落地且与现有运行时契约解耦

**Given** 现有运行时契约单源位于 `shadowflow/runtime/contracts.py`，且已冻结 `WorkflowDefinition` / `RuntimeRequest` 等核心对象  
**When** 新增 Builder 领域层  
**Then** 新建独立文件 `shadowflow/runtime/contracts_builder.py`，至少包含以下一等对象：
- `AgentBlueprint`
- `RoleProfile`
- `ToolPolicy`
- `KnowledgeBinding`
- `MemoryProfile`
- `EvalProfile`
- `PublishProfile`

**And** Builder 合同使用 **Pydantic v2** 风格(`BaseModel` + `model_validator`)并保持 `snake_case`

**And** `AgentBlueprint` 至少能表达：
- `blueprint_id`
- `version`
- `name`
- `goal`
- `audience`
- `mode`(`single` / `team`)
- `role_profiles[]`
- `tool_policies[]`
- `knowledge_bindings[]`
- `memory_profile`
- `eval_profile`
- `publish_profile`
- `metadata`

**And** 本 Story **不**修改 `shadowflow/runtime/contracts.py` 中既有运行时 7+1 核心对象的字段语义，只通过映射层把 Builder 合同编译/转换为既有 `WorkflowTemplateSpec` 与 `WorkflowDefinition`

### AC2 — Builder Service 骨架存在且 `instantiate` 可映射到现有模板/工作流主链

**Given** 后端已存在 `shadowflow/highlevel.py` 中的 `WorkflowTemplateSpec`、`TemplateCompiler` 与 `WorkflowDefinition` 映射链  
**When** 实现 Builder 服务骨架  
**Then** 新建 `shadowflow/runtime/builder_service.py`，至少暴露以下方法：
- `generate_blueprint(...)`
- `instantiate_blueprint(...)`
- `smoke_run_blueprint(...)`
- `publish_blueprint(...)`
- `list_kits()`

**And** `instantiate_blueprint(...)` 返回结果中至少包含：
- `blueprint`
- `template_spec`
- `workflow_definition`
- `warnings[]`

**And** `workflow_definition` 通过现有 `WorkflowDefinition.model_validate(...)` 得到合法对象，而不是手搓裸 dict 后直接下发前端

**And** `template_spec` 优先复用现有 `WorkflowTemplateSpec` 能力，不重复发明另一套模板结构

**And** 在 Epic 9 尚未完成前：
- `KnowledgeBinding / MemoryProfile / EvalProfile / PublishProfile` 允许是 **schema-complete but behavior-light** 的占位实现
- `list_kits()` 可先返回静态内置 catalog
- `smoke_run_blueprint()` 与 `publish_blueprint()` 可返回结构化占位结果，但必须通过统一 service 路径返回合法 envelope，不能直接 `501 TODO`

### AC3 — Builder API 路由接入 FastAPI，且在 OpenAPI 中可见

**Given** 现有 FastAPI 应用集中在 `shadowflow/server.py`，并已采用 `shadowflow/api/*.py` 分路由组织  
**When** 新增 Builder API  
**Then** 新建 `shadowflow/api/builder.py`，至少提供以下 endpoint：
- `POST /builder/blueprints/generate`
- `POST /builder/blueprints/instantiate`
- `POST /builder/blueprints/smoke-run`
- `POST /builder/blueprints/publish`
- `GET /builder/kits`

**And** 所有成功响应统一为：
```json
{
  "data": {},
  "meta": {}
}
```

**And** 所有错误响应通过现有 `ShadowflowError` / exception handler 体系进入：
```json
{
  "error": {
    "code": "...",
    "message": "...",
    "details": {},
    "trace_id": "..."
  }
}
```

**And** 路由通过 `app.include_router(...)` 接入 `shadowflow/server.py`

**And** 这些 endpoint 在 `/docs` 与 `/redoc` 中可见，不允许 `include_in_schema=False`

### AC4 — 前端 Builder 类型与 API 客户端骨架存在

**Given** 前端当前已有 `src/common/types/` 与 `src/api/` 两层结构  
**When** 为 Builder 主路径补齐前端契约  
**Then** 新建：
- `src/common/types/agent-builder.ts`
- `src/api/builder.ts`

**And** `agent-builder.ts` 至少包含与后端 Builder 合同对齐的前端类型：
- `AgentBlueprint`
- `RoleProfile`
- `ToolPolicy`
- `KnowledgeBinding`
- `MemoryProfile`
- `EvalProfile`
- `PublishProfile`
- `BuilderGenerateRequest/Response`
- `BuilderInstantiateResponse`
- `BuilderKitSummary`

**And** 前端类型字段名保持后端 `snake_case`，不在 Builder 边界偷偷转 `camelCase`

**And** `src/api/builder.ts` 至少提供：
- `generateBlueprint(...)`
- `instantiateBlueprint(...)`
- `smokeRunBlueprint(...)`
- `publishBlueprint(...)`
- `listBuilderKits()`

**And** API 客户端复用现有 `templates.ts` 风格：集中处理 `fetch`、状态码与 error unwrap，不把 Builder 调用散落到页面组件中

### AC5 — 测试与边界说明完整，能阻止“空骨架假完成”

**Given** 本 Story 是 Epic 8 的第一篇故事，后续 8.2/8.3/8.4/8.5/8.6 都会建立在它上面  
**When** Story 8.1 完成  
**Then** 至少新增以下测试：
- `tests/test_builder_contracts.py` — 覆盖 Builder 合同字段与跨字段校验
- `tests/test_builder_service.py` — 覆盖 `generate / instantiate / list_kits` 基础行为
- `tests/test_builder_api.py` — 覆盖 5 个 Builder endpoint 的 happy path 与 envelope

**And** 至少验证以下事实：
- `AgentBlueprint` 缺关键字段时校验失败
- `instantiate` 产出的 `workflow_definition` 可被 `WorkflowDefinition.model_validate(...)` 接受
- `GET /builder/kits` 返回稳定列表结构
- API 成功响应进入 `{data, meta}`
- 非法请求进入标准错误响应，而不是 FastAPI 默认裸异常

**And** 本 Story **明确不做**：
- Goal Mode 页面与交互(Story 8.2)
- Scene Tree / Canvas / Inspector UI(Story 8.3)
- Knowledge Dock 真正上传/ingest(Story 8.4 / Epic 9)
- 真正的 smoke eval 执行引擎(Story 8.5 / Epic 9)
- 真正的 publish 持久化/回填 Agent App(Story 8.6)

## Tasks / Subtasks

- [ ] **T1(AC1) 新建 Builder 领域合同**
  - [ ] 新建 `shadowflow/runtime/contracts_builder.py`
  - [ ] 定义 `RoleProfile / ToolPolicy / KnowledgeBinding / MemoryProfile / EvalProfile / PublishProfile / AgentBlueprint`
  - [ ] 用 `model_validator(mode="after")` 补跨字段校验，例如：
    - [ ] `mode == "single"` 时 `role_profiles` 至少 1 个
    - [ ] `citation_required == true` 时 `knowledge_bindings` 不能为空或显式声明 `source_type`
    - [ ] `publish_profile.target` 与 `publish_profile.visibility` 组合合法
  - [ ] 保持 Builder 合同与 `runtime/contracts.py` 解耦，不在冻结运行时对象上硬塞 Builder 字段

- [ ] **T2(AC2) 实现 Builder Service 骨架**
  - [ ] 新建 `shadowflow/runtime/builder_service.py`
  - [ ] 设计请求/响应模型：`GenerateBlueprintRequest`、`InstantiateBlueprintRequest`、`SmokeRunBlueprintRequest`、`PublishBlueprintRequest`
  - [ ] `generate_blueprint(...)` 先做最小启发式生成：
    - [ ] 输入 `goal / audience / mode / desired_output / knowledge_sources`
    - [ ] 输出合法 `AgentBlueprint`
    - [ ] 在 `meta` 回传 `confidence / missing_inputs / suggested_next_step`
  - [ ] `instantiate_blueprint(...)` 将 `AgentBlueprint` 映射为 `WorkflowTemplateSpec`
  - [ ] 通过现有 `TemplateCompiler` 或等价现有主链产出 `WorkflowDefinition`
  - [ ] `list_kits()` 先返回静态 registry，至少包含 `research` / `knowledge_assistant` / `review_approval` / `persona_npc`
  - [ ] `smoke_run_blueprint(...)` 返回结构化占位结果：`status / checks / warnings / recommended_fix`
  - [ ] `publish_blueprint(...)` 返回结构化占位结果：`status / target / publish_ref / warnings`

- [ ] **T3(AC2) 明确 Blueprint → Template → Workflow 的映射规则**
  - [ ] 在 service 中实现独立的映射函数，例如 `_blueprint_to_template_spec(...)`
  - [ ] `RoleProfile` 映射到 `WorkflowTemplateSpec.agents[]` 或必要的静态 node 配置
  - [ ] `ToolPolicy` 映射到 agent `tools` / `policy_matrix` / `metadata`
  - [ ] `KnowledgeBinding / MemoryProfile / EvalProfile / PublishProfile` 先进入 `template.metadata` 与 `workflow.metadata`
  - [ ] `instantiate` 输出同时返回 `template_spec` 与 `workflow_definition`，方便后续 8.3/8.6 复用

- [ ] **T4(AC3) 新建 Builder API 路由并接入 server**
  - [ ] 新建 `shadowflow/api/builder.py`
  - [ ] 按现有 `shadowflow/api/archive.py` / `ops.py` 风格使用 `APIRouter`
  - [ ] 为 5 个 endpoint 建立 request/response 模型
  - [ ] 成功响应统一走 `{data, meta}` envelope
  - [ ] 错误路径统一抛 `ShadowflowError` 或 `HTTPException` 后再被标准化
  - [ ] 在 `shadowflow/server.py` 中初始化 Builder service 单例并 `include_router`
  - [ ] 确认 `/docs` / `/redoc` 可见这些 endpoint

- [ ] **T5(AC4) 新建前端 Builder 类型与 API client**
  - [ ] 新建 `src/common/types/agent-builder.ts`
  - [ ] 类型命名与字段名对齐后端，不重复定义 `WorkflowDefinition`
  - [ ] 新建 `src/api/builder.ts`
  - [ ] 参考 `src/api/templates.ts` 做统一 `_handleResponse<T>()`
  - [ ] 为 `generate / instantiate / smoke-run / publish / kits` 暴露 typed fetch 方法

- [ ] **T6(AC5) 测试护栏**
  - [ ] 新建 `tests/test_builder_contracts.py`
  - [ ] 新建 `tests/test_builder_service.py`
  - [ ] 新建 `tests/test_builder_api.py`
  - [ ] 如前端 API client 已落地，可补充 `src/api/builder.test.ts` 或等价最小测试
  - [ ] 跑最小测试集验证 Builder 主链，不要求一次性扫全仓历史测试

- [ ] **T7(AC5) Story 边界与后续故事交接**
  - [ ] 在文档/PR 描述中写明 8.1 只交付合同与 API skeleton，不交付 Builder UI
  - [ ] 记录 8.2 直接消费 `generate` 结果
  - [ ] 记录 8.3 直接消费 `instantiate` 返回的 `blueprint + workflow_definition`
  - [ ] 记录 Epic 9 完成后再把 `KnowledgeBinding / MemoryProfile / EvalProfile` 从 metadata-level 占位升级为真行为

## Dev Notes

### Story Foundation

- Epic 8 的正式 Story 定义来自 `planning-artifacts/epics-addendum-2026-04-23-user-builder.md`，不是当前主 `epics.md` 正文
- 本 Story 是 Epic 8 的第一篇，因此**没有前序 8.x 实现经验可复用**
- 当前 `sprint-status.yaml` 中 Epic 8 仍是 backlog，本 Story 创建后应把 `epic-8` 推进到 `in-progress`，并把 `8-1` 标为 `ready-for-dev`

### 现有代码基线(必须复用)

- **运行时契约单源**在 `shadowflow/runtime/contracts.py`
  - 已有 `WorkflowDefinition / NodeDefinition / EdgeDefinition / RuntimeRequest`
  - 已有 `model_validator(mode="after")` 图校验与递归 delegated workflow 校验
- **模板/高阶编译链**在 `shadowflow/highlevel.py`
  - 已有 `WorkflowTemplateSpec`
  - 已有 `TemplateCompiler.compile(template) -> WorkflowDefinition`
  - 已有模板 policy/stage/metadata 等高层抽象
- **FastAPI 入口**在 `shadowflow/server.py`
  - 已有按功能拆分的 `shadowflow/api/*.py` 路由组织方式
  - 已有 `ShadowflowError` 统一异常处理
  - 已有 `/docs` / `/redoc`
- **前端目录结构**已稳定
  - `src/common/types/` 放契约类型
  - `src/api/` 放 REST client
  - `src/pages/EditorPage.tsx` 是后续 Builder UI 的自然承载页

### 实施原则(防止开发写偏)

1. **Builder 是中间层，不是替代层**
   - 目标不是发明第二套 runtime
   - 目标是把 `goal-first / scene-first` 抽象汇聚到同一份 `AgentBlueprint`
   - 真正运行仍依赖既有 `WorkflowTemplateSpec / WorkflowDefinition`

2. **不要污染冻结契约**
   - Builder 合同单独放 `contracts_builder.py`
   - 运行时契约仍保持在 `runtime/contracts.py`
   - 映射发生在 `builder_service.py`

3. **先打通骨架，再补行为**
   - `knowledge / memory / eval / publish` 本 Story 先保证 schema 与 API 面存在
   - 真正 ingest / writeback / regression / publish pipeline 留给 8.4/8.5/8.6 与 Epic 9

4. **API 先稳定 envelope，再谈 UI**
   - 8.2/8.3 前端能否顺滑接入，取决于 8.1 的 response shape 是否稳定
   - 不要把 Builder 逻辑塞进 React 页面里“边写边调”

### Project Structure Notes

- 后端建议落点：
  - `shadowflow/runtime/contracts_builder.py`
  - `shadowflow/runtime/builder_service.py`
  - `shadowflow/api/builder.py`
  - `tests/test_builder_contracts.py`
  - `tests/test_builder_service.py`
  - `tests/test_builder_api.py`

- 前端建议落点：
  - `src/common/types/agent-builder.ts`
  - `src/api/builder.ts`

- **不要**把 Builder router 继续堆进 `shadowflow/server.py` 主文件
- **不要**新造 `src/types/builder.ts`、`src/services/builder.ts` 之类偏离现有结构的目录

### 现有模式与可直接借鉴文件

- `shadowflow/api/archive.py` / `shadowflow/api/ops.py`
  - 现有 APIRouter 拆分模式
  - 适合作为 `builder.py` 的骨架参照
- `tests/test_template_custom_api.py`
  - 现有 FastAPI TestClient 风格
  - 可直接借鉴 endpoint 测试写法
- `tests/test_highlevel_schema.py`
  - 现有 `TemplateCompiler.compile(...) -> WorkflowDefinition` 验证路径
  - 是 `instantiate` 最重要的参照测试
- `src/api/templates.ts`
  - 现有前端 API unwrap 与错误处理模式

### 官方文档校对(2026-04-23)

- **Pydantic 官方文档**
  - 当前官网文档版本显示为 `v2.12.5`
  - `model_validator(mode="after")` 需要返回已验证实例
  - `model_validate()` 是当前推荐的对象/字典校验入口
- **FastAPI 官方文档**
  - `APIRouter` + `include_router(...)` 是推荐的大应用拆分方式
  - OpenAPI 自动文档默认暴露在 `/docs` 与 `/redoc`
  - `include_in_schema=True` 会影响自动文档可见性

### Testing Requirements

- Python 测试优先，覆盖 Builder 合同、service、api 三层
- 不 mock `WorkflowDefinition` / `WorkflowTemplateSpec` 这种核心契约；应使用真实 Pydantic model
- API 层必须验证标准 envelope，而不是只验证 200 状态码
- 至少保证 `instantiate` 结果可走真实 `WorkflowDefinition.model_validate(...)`

### Scope Boundaries

- **本 Story 做**
  - Builder 合同
  - Builder service skeleton
  - Builder API skeleton
  - 前端 Builder 类型与 API client skeleton
  - 最小映射 `blueprint -> template_spec -> workflow_definition`

- **本 Story 不做**
  - Goal Mode 页面
  - Scene Tree / Canvas / Inspector
  - 真正知识 ingest 与 citation trace
  - 真正 memory writeback / agent state
  - 真正 smoke eval / regression gate
  - 真正 publish 到 template/workflow/agent app 的全链路

### References

- [Source: `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`#Story 8.1]
- [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml`#Epic 8]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Frontend Architecture]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#API & Communication Patterns]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Complete Project Directory Structure]
- [Source: `_bmad-output/project-context.md`#2 Runtime 契约冻结规则]
- [Source: `_bmad-output/project-context.md`#3 Pydantic ↔ TypeScript 单源工作流]
- [Source: `_bmad-output/project-context.md`#11 Naming / Structure / Format]
- [Source: `shadowflow/runtime/contracts.py`]
- [Source: `shadowflow/highlevel.py`]
- [Source: `shadowflow/server.py`]
- [Source: `shadowflow/api/archive.py`]
- [Source: `tests/test_highlevel_schema.py`]
- [Source: `tests/test_template_custom_api.py`]
- [Source: `src/api/templates.ts`]
- [Source: official docs — Pydantic validators/model_validate, FastAPI APIRouter/OpenAPI docs]

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Workflow source analysis: `shadowflow/runtime/contracts.py`, `shadowflow/highlevel.py`, `shadowflow/server.py`
- Existing API/testing pattern analysis: `shadowflow/api/archive.py`, `shadowflow/api/ops.py`, `tests/test_template_custom_api.py`, `tests/test_highlevel_schema.py`
- Official doc sanity check:
  - `docs.pydantic.dev/latest/concepts/validators/`
  - `docs.pydantic.dev/latest/concepts/models/`
  - `fastapi.tiangolo.com/reference/apirouter/`
  - `fastapi.tiangolo.com/reference/openapi/docs/`

### Completion Notes List

- 已按 `bmad-create-story` 思路把 8.1 从 Epic 描述扩展成可直接开发的 story 文档
- 已显式写出 Builder 合同与既有 runtime/template 主链的边界，防止实现时另起炉灶
- 已记录当前主 `epics.md` 尚未并入 Epic 8 正文，8.1 的权威 story 来源是 addendum
- 已补充最新官方文档校对结论，避免开发时退回 Pydantic v1 写法或把 Builder router 写成不可见 OpenAPI 端点
- 本 Story 无前序 8.x 可复用 learnings；最近提交主要是 Epic 5/7，说明当前仓库 API 路由拆分与文档化 story 产物风格已经稳定

### File List

- `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 8.1 实施文档，状态置为 `ready-for-dev`
