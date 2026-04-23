# Story 8.2: Goal Mode 目标输入 + Blueprint 生成

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **非工程用户**,
I want **先输入目标、对象、知识来源和期望产出，再由系统生成初始 Agent Blueprint**,
so that **我不需要先理解节点、边、Policy Matrix 或 YAML，就能开始创建自己的 Agent**。

## Acceptance Criteria

### AC1 — Builder 默认进入 Goal Mode，入口以任务输入为主而不是空白画布

**Given** Epic 8 的目标是把 ShadowFlow 从 `graph-first` 推进为 `goal-first / scene-first / progressive disclosure`
**When** 用户进入 Builder 主路径
**Then** 默认首先看到的是 `Goal Mode` 输入界面，而不是空白 `WorkflowCanvas`

**And** 页面首屏至少包含以下内容：
- Goal Mode 标题与一句话解释
- 任务输入主表单
- 清晰的主 CTA（生成 Blueprint）
- 次 CTA（从模板生成 / 切换 Graph Mode）

**And** 首屏文案应强调“先说目标，系统帮你长出骨架”，而不是暴露 `node / edge / provider / policy_matrix` 等底层术语

**And** Goal Mode 必须能在后续无损切换到 `Scene Mode` 与 `Graph Mode`

### AC2 — Goal Mode 至少覆盖 5 个关键输入项，并与 Builder 合同对齐

**Given** Story 8.1 已建立 `AgentBlueprint` 合同与 `/builder/blueprints/generate` API 骨架
**When** 用户填写 Goal Mode 表单
**Then** 表单最少包含以下输入项：
- `goal`：我想做什么
- `audience`：给谁用 / 服务对象是谁
- `knowledge_sources`：需要哪些知识来源（`docs` / `urls` / `none`，且支持多值）
- `mode`：更像单个助手还是一个团队（`single` / `team`）
- `desired_output`：最终想得到什么产物（`answer` / `report` / `review` / `workflow_draft`）

**And** 每个字段都具备：
- 合理默认值或 placeholder
- 前端必填/选填状态说明
- 对应的错误提示文案

**And** 字段命名与请求 payload 保持 `snake_case`

**And** 若用户选择 `knowledge_sources = none`，界面仍允许生成，但在结果 `meta.missing_inputs` 中体现“知识暂未绑定”

### AC3 — 点击生成后，前端通过 Builder API 获取 Blueprint，并展示结构化生成结果

**Given** 前端已具备 `src/api/builder.ts` 与 `src/common/types/agent-builder.ts`
**When** 用户点击 `生成 Blueprint`
**Then** 前端调用 `generateBlueprint(...)`，请求走 `POST /builder/blueprints/generate`

**And** 成功返回后，前端至少接收并保存：
- `data.blueprint`
- `meta.confidence`
- `meta.missing_inputs`
- `meta.suggested_next_step`
- `meta.source`（如为 template 或 heuristic，可选）

**And** Goal Mode 结果区至少能向用户清晰展示：
- 生成出的 Blueprint 名称/摘要
- 当前模式（single/team）
- 建议下一步
- 缺失输入提示

**And** 前端不直接拼装 Blueprint dict，必须消费 8.1 定义的 Builder API 响应

**And** 若返回错误，错误路径通过统一 API unwrap 进入可读错误提示，而不是把原始异常对象直接渲染到界面

### AC4 — 生成结果后，用户可执行 4 条后续路径

**Given** Blueprint 已成功生成
**When** 用户查看生成结果区
**Then** 用户至少可以执行以下动作：
- 接受并进入 `Scene Mode`
- 重新生成
- 从模板生成
- 直接切换到 `Graph Mode`

**And** “接受并进入 Scene Mode” 至少完成以下行为：
- 保留当前 `blueprint`
- 切换 Builder 视图状态为 `scene`
- 把 Blueprint 作为 Scene/Graph 后续状态的输入源

**And** “重新生成” 不会丢失用户已填写表单，默认基于当前输入重发请求

**And** “从模板生成” 会进入既有模板入口或触发模板选择弹层，而不是复制另一套模板列表实现

**And** “直接切换到 Graph Mode” 至少支持把当前 Blueprint 对应到已有 editor 主链，避免用户必须先经过 Scene Mode

### AC5 — Goal Mode 具备加载、禁用、空态与失败解释，不允许“静默无反馈”

**Given** Builder 生成过程依赖异步请求
**When** 请求进行中、失败或结果信息不完整
**Then** Goal Mode 至少覆盖以下界面状态：
- 初始空态
- 提交中 loading 态
- 成功态
- 失败态
- 缺输入提示态

**And** loading 态下：
- 主 CTA 进入禁用状态
- 表单不会重复提交
- 页面有明确的忙碌反馈

**And** 失败态至少区分以下两类：
- 输入不合法 / 校验失败
- 服务端生成失败 / 网络失败

**And** 失败解释文案优先使用 Builder 领域术语，例如“目标不够清晰”“知识来源缺失”“生成骨架失败”，而不是直接暴露 HTTP 细节

### AC6 — Goal Mode 与现有路由/编辑器资产兼容，且不破坏现有 `/editor` 主链

**Given** 当前前端已有 `AppRoutes.tsx`、`EditorPage.tsx`、`TemplatesPage.tsx`
**When** 接入 Goal Mode
**Then** Goal Mode 的落点应明确为 Builder 主路径的一部分，并与现有路由兼容

**And** 至少满足以下一项：
- 新增独立 `BuilderPage` 与 `/builder` 路由
- 或在现有 Builder/Editor 入口中显式加入 `Goal / Scene / Graph` 三态切换

**And** 无论采用哪种落点，都必须：
- 保留现有 `/editor` 能力，避免回归已有 workflow 编辑器
- 复用现有 `EditorPage`/`WorkflowCanvas` 资产，而不是平地重写另一套画布
- 为后续 8.3 的 `Scene Tree + Canvas + Inspector` 预留状态入口

### AC7 — 测试覆盖 Goal Mode 表单、API 集成与结果流转，防止“只有漂亮壳子”

**Given** 8.2 是 Builder 面向用户的第一个真实交互故事
**When** Story 8.2 完成
**Then** 至少新增以下测试：
- `src/pages/BuilderPage.test.tsx` 或等价页面测试
- `src/api/builder.test.ts` 或等价 API client 测试
- 如新增后端校验逻辑，补对应 `tests/test_builder_api.py` 或 `tests/test_builder_service.py`

**And** 至少覆盖以下事实：
- 必填字段缺失时，生成按钮不可用或提交后出现明确错误
- 点击生成会调用 Builder API，而不是本地伪造结果
- 成功返回后结果区展示 `confidence / missing_inputs / suggested_next_step`
- 重新生成保留表单值
- 接受后能进入 `Scene Mode` 状态
- 失败态会展示用户可理解的错误提示

**And** 本 Story 明确不做：
- 完整 `Scene Tree + Canvas + Inspector`（Story 8.3）
- 真正的 Knowledge Dock 上传与 ingest（Story 8.4 / Epic 9）
- 真正的 Smoke Run 执行面板（Story 8.5）
- 真正的 Publish 回填链路（Story 8.6）

## Tasks / Subtasks

- [ ] **T1(AC1) 定义 Goal Mode 页面落点与视图状态**
  - [ ] 确认 `BuilderPage` 独立路由或 `EditorPage` 内三态切换方案
  - [ ] 建立 `goal / scene / graph` 视图状态源
  - [ ] 补首屏空态与主/次 CTA

- [ ] **T2(AC2) 实现 Goal Mode 主表单**
  - [ ] 新建 Goal Mode 表单组件，例如 `src/core/components/builder/GoalModeForm.tsx`
  - [ ] 接入 `goal / audience / knowledge_sources / mode / desired_output`
  - [ ] 为字段提供默认值、placeholder 与校验提示
  - [ ] 保持 Builder 边界 payload 为 `snake_case`

- [ ] **T3(AC3) 接入 Builder API 生成链路**
  - [ ] 复用 Story 8.1 的 `generateBlueprint(...)`
  - [ ] 设计 Goal Mode 本地 state：`idle / loading / success / error`
  - [ ] 保存 `blueprint` 与 `meta`
  - [ ] 成功后展示摘要、confidence、missing inputs、suggested next step

- [ ] **T4(AC4) 实现 4 条后续路径动作**
  - [ ] 接受并进入 `Scene Mode`
  - [ ] 重新生成（保留当前表单值）
  - [ ] 从模板生成（复用现有模板入口）
  - [ ] 直接切换 `Graph Mode`

- [ ] **T5(AC5) 完成错误与加载体验**
  - [ ] 提交中禁用 CTA，防重复请求
  - [ ] 区分输入错误与服务端/网络错误
  - [ ] 提供 Builder 语义化失败解释
  - [ ] 为结果不完整场景补 `missing_inputs` 提示

- [ ] **T6(AC6) 做到与既有路由和编辑器兼容**
  - [ ] 更新 `src/AppRoutes.tsx` 或等价入口
  - [ ] 确保不破坏现有 `/editor`
  - [ ] 复用 `WorkflowCanvas`、`EditorPage` 或现有页面壳，而非新造独立系统

- [ ] **T7(AC7) 测试护栏**
  - [ ] 补页面测试覆盖表单校验、提交、成功/失败态
  - [ ] 补 API client 测试覆盖 envelope unwrap
  - [ ] 若后端为了 8.2 增加了新校验或 meta 规则，同步补 Python 测试

## Dev Notes

### Story Foundation

- Epic 8 对 Story 8.2 的权威定义来自 `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`
- 本 Story 是 Epic 8 的第二篇故事，直接建立在 Story 8.1 的 Builder 合同与 API skeleton 上
- 8.2 的成功标准不是“做一个更漂亮的表单”，而是让用户 10 分钟内拿到第一个可跑骨架

### Previous Story Intelligence (8.1)

- 8.1 已明确 Builder 是**中间层**，不是替代既有 runtime/template 主链
- 8.1 已要求前端通过 `src/api/builder.ts` 消费 `/builder/blueprints/generate`，不要在页面里手搓 Blueprint
- 8.1 已要求 Builder 边界字段保持 `snake_case`，8.2 不应引入私有 camelCase DTO
- 8.1 已为 8.2 预留 `meta.confidence / meta.missing_inputs / meta.suggested_next_step`，本 Story 应直接消费这些字段
- 8.1 已把后续 8.3 定义为 `instantiate` 结果的主要消费者，因此 8.2 的前端状态必须能把 `blueprint` 继续传给 Scene/Graph

### 现有代码基线(必须复用)

- **现有路由壳**在 `src/AppRoutes.tsx`
  - 当前已有 `/templates`、`/import`、`/editor`
  - 若新增 `/builder`，应按现有 lazy route 模式接入
- **现有编辑器壳**在 `src/EditorPage.tsx`
  - 已有共享 goal state、run state、canvas 与 inspector 模式
  - 可复用为 `Graph Mode` 落点，不要重造一套编辑器
- **现有模板 API client 模式**在 `src/api/templates.ts`
  - 已有 `_handleResponse<T>()`
  - Builder API 应延续同类错误 unwrap 方式
- **现有模板类型**在 `src/common/types/template.ts`
  - 提醒前端已经存在类型文件与 API 分层，不要把 Builder 类型塞进页面组件
- **现有 FastAPI 组织方式**在 `shadowflow/server.py` 与 `shadowflow/api/archive.py`
  - 说明路由按 `APIRouter` 拆分、统一 `include_router(...)` 已是稳定模式

### 实施原则(防止开发写偏)

1. **Goal Mode 是任务入口，不是字段墓地**
   - 首屏必须围绕“我要做什么”组织
   - 不要把用户第一屏变成复杂配置面板

2. **先生成骨架，再逐步暴露复杂度**
   - 8.2 只需要把用户送入 Scene/Graph 的正确起点
   - Scene Tree、Inspector、Knowledge Dock 留给后续 Story

3. **结果要能接着走，不是一次性 toast**
   - 成功后必须保留 `blueprint`
   - 用户必须能继续去 Scene / Graph，而不是看一眼结果文本就结束

4. **不要绕过 8.1 的 Builder API 合同**
   - 8.2 不应本地伪造“假 Blueprint”
   - 即使后端当前是 heuristic/static，也要走统一 API 路径

5. **不要破坏现有编辑器主链**
   - `/editor` 已承载当前 workflow 编辑器
   - Builder 是上层入口，不是替换现有 editor

### Project Structure Notes

- 前端建议落点：
  - `src/pages/BuilderPage.tsx`
  - `src/core/components/builder/GoalModeForm.tsx`
  - `src/core/components/builder/GoalModeResult.tsx`
  - `src/core/components/builder/BuilderModeSwitcher.tsx`
  - `src/api/builder.ts`
  - `src/common/types/agent-builder.ts`
  - `src/pages/BuilderPage.test.tsx`
  - `src/api/builder.test.ts`

- 若决定暂时复用 `EditorPage`：
  - 也应把 Builder 相关组件放在 `src/core/components/builder/` 下
  - 不要把 Goal Mode 表单直接糊进 `EditorPage.tsx` 顶层形成巨型文件继续膨胀

### Git / Workspace Intelligence

- 当前工作区存在未提交前端改动：`src/AppRoutes.tsx`、`src/pages/InboxPage.tsx`、`src/core/components/inbox/*` 等
- 8.2 后续实施时大概率也会触碰路由与页面壳，开发前应先读取这些未提交变更，避免覆盖正在进行的 Inbox 路由工作
- 最近 5 个提交主要集中在 Epic 5（0G Compute / author lineage）与 sprint 文档同步，说明当前仓库“故事文档驱动实现”的节奏已稳定，可继续沿用

### Official Docs Sanity Check (2026-04-23)

- **Pydantic 最新文档**
  - `model_validator(mode="after")` 需要返回验证后的实例
  - `model_validate()` 仍是从 dict/object 进入校验的推荐入口
- **FastAPI 最新文档**
  - `APIRouter` + `include_router(...)` 是官方推荐的大应用拆分模式
  - 自动文档默认仍是 `/docs` 与 `/redoc`，可通过 `docs_url` / `redoc_url` 配置

### Testing Requirements

- 页面测试至少覆盖：
  - 初始空态
  - 必填项缺失
  - 提交 loading 态
  - 成功态结果展示
  - 错误态解释
  - 接受后切换到 `Scene Mode`
- API client 测试至少覆盖：
  - 成功 envelope unwrap
  - 校验错误 unwrap
  - 一般错误消息透传
- 如 8.2 顺手补强了 Builder 后端 meta 规则，Python 测试要验证：
  - `missing_inputs` 返回稳定结构
  - `suggested_next_step` 在不同 mode 下合理变化

### Scope Boundaries

- **本 Story 做**
  - Goal Mode 默认入口
  - 5 个关键输入字段
  - 生成 Blueprint 的前端请求/状态/结果流转
  - 接受/重生成/模板/Graph 4 条动作
  - 加载/错误/空态/缺输入提示

- **本 Story 不做**
  - 完整 Scene 编辑器
  - 真正知识上传/ingest
  - 真正 Smoke Run 验证面板
  - 真正 Publish 回填链路
  - 深度 Research/Persona/Review Kit 具体实例化

### References

- [Source: `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`#Story 8.2]
- [Source: `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`]
- [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml`#Epic 8]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Frontend Architecture]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#API & Communication Patterns]
- [Source: `_bmad-output/project-context.md`#3 Pydantic ↔ TypeScript 单源工作流]
- [Source: `_bmad-output/project-context.md`#5 React / Zustand 状态管理]
- [Source: `_bmad-output/project-context.md`#11 Naming / Structure / Format]
- [Source: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`#4.4 建议的 Godot 式交互模型]
- [Source: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`#7.1 Phase A：Agent Builder MVP]
- [Source: `docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md`#6.1 Phase A：Agent Builder MVP]
- [Source: `src/AppRoutes.tsx`]
- [Source: `src/EditorPage.tsx`]
- [Source: `src/api/templates.ts`]
- [Source: `src/common/types/template.ts`]
- [Source: `shadowflow/server.py`]
- [Source: `shadowflow/api/archive.py`]
- [Source: `tests/test_template_custom_api.py`]
- [Source: official docs — Pydantic validators/models, FastAPI APIRouter/metadata docs]

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Story chain analysis: `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`, `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`
- Route and editor baseline: `src/AppRoutes.tsx`, `src/EditorPage.tsx`
- API/testing baseline: `src/api/templates.ts`, `shadowflow/server.py`, `shadowflow/api/archive.py`, `tests/test_template_custom_api.py`
- Product roadmap grounding: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`, `docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md`
- Official doc sanity check:
  - `https://docs.pydantic.dev/latest/concepts/validators/`
  - `https://docs.pydantic.dev/latest/concepts/models/`
  - `https://fastapi.tiangolo.com/tutorial/bigger-applications/`
  - `https://fastapi.tiangolo.com/tutorial/metadata/`

### Completion Notes List

- 已将 8.2 扩展为可直接开发的故事文档，明确了 Goal Mode 的默认入口、表单字段、API 集成与状态流转
- 已继承 8.1 的 Builder 合同边界，防止 8.2 通过页面本地假数据绕开真正 Builder API
- 已结合现有 `AppRoutes`、`EditorPage`、`templates.ts`、FastAPI router 模式，补全了具体落点与复用点
- 已补充对当前工作区未提交前端改动的提醒，避免后续开发 8.2 时误覆盖正在进行的 Inbox 路由工作
- 已补充 Pydantic / FastAPI 官方文档校对点，确保实现继续沿用 `model_validate`、`model_validator` 与 `APIRouter` 推荐模式

### File List

- `_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 8.2 实施文档，状态置为 `ready-for-dev`
