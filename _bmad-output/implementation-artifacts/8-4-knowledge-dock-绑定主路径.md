# Story 8.4: Knowledge Dock 入口 + Knowledge Binding 主路径

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **想让 Agent 读取自己资料的用户**,
I want **在 Builder 主路径中直接绑定文档、URL 或知识包入口**,
so that **我创建出的 Agent 从一开始就有“知道什么”的能力，并且输出可以对知识来源负责**。

## Acceptance Criteria

### AC1 — `Knowledge Dock` 是 Scene Mode 的一等入口，而不是埋在 Graph/高级配置里的二级能力

**Given** Story 8.3 已把 Builder 主路径推进到 `Goal / Scene / Graph` 三态与 `Scene Tree + Canvas + Inspector` 壳  
**When** 用户在 `Scene Mode` 编辑 Blueprint  
**Then** 页面存在稳定、可发现的 `Knowledge Dock` 入口，并满足以下至少一项：
- 作为右侧 Inspector 的独立分区
- 作为可展开的侧边 Dock/Drawer
- 作为 `Scene Tree` 中 `Shared Knowledge` 的点击入口

**And** 用户不需要切回纯 `Graph Mode` 或打开底层 YAML，才知道去哪里绑定知识

**And** `Knowledge Dock` 默认使用用户能理解的语言，例如“文档 / 链接 / 已有知识包 / 暂不绑定”，而不是 `chunk / top-k / embedding` 等基础设施术语

### AC2 — Dock 至少支持四种主路径动作，并全部写回统一 `blueprint state`

**Given** 用户打开 `Knowledge Dock`  
**When** 用户操作主路径入口  
**Then** 至少支持以下动作：
- 上传文档
- 填写 URL / 数据源
- 绑定已有 `Knowledge Pack`
- 选择“暂不绑定知识”

**And** 这些动作都首先写回 Builder 的统一 `blueprint state`

**And** 不允许把知识绑定只保存在某个局部组件 state、某个未持久化 modal，或直接塞进底层 workflow metadata 后丢失 Builder 语义

**And** 若当前 Blueprint 是 team 模式，系统至少区分：
- `shared knowledge bindings`
- agent 级 `knowledge bindings`

**And** 若当前 Blueprint 是 single 模式，仍复用同一套绑定模型，不额外分叉第二套 schema

### AC3 — 每个 `KnowledgeBinding` 至少具备 5 个稳定字段，并与 8.1 Builder 合同方向一致

**Given** Epic 8 addendum 已明确 8.4 的最小绑定字段  
**When** 用户新增或编辑一个 Knowledge Binding  
**Then** 每条绑定至少包含以下字段：
- `source_type`
- `source_ref`
- `retrieval_mode`
- `citation_required`
- `freshness_hint`

**And** 建议同时保留稳定主键或本地 id，如：
- `binding_id`
- `scope`（`shared` / `agent`）
- `target_ref`（指向 Team 或某个 role）

**And** 字段命名保持 Builder 边界既有的 `snake_case`

**And** 在 Epic 9 真正落地 `KnowledgePack CRUD + ingest pipeline` 之前，这些字段可以是 **schema-complete but behavior-light**

**And** 不能把“上传文档”简化成只有文件名展示而没有 `source_ref`，也不能把 URL 绑定简化成裸字符串数组

### AC4 — 绑定流程要与现有 Import/0G/运行态资产协同，而不是另起一套上传和状态机

**Given** 当前仓库已经有：
- `ImportPage` 的 CID 输入/加载/错误提示体验
- `zerogStorage.ts` 的上传下载与 Merkle 校验封装
- `useRunStore` / `useRunEvents` 的运行态与检查态状态容器
**When** 实现 `Knowledge Dock`
**Then** 应优先复用以下模式：
- 输入校验、loading、toast、历史/回显等 UX 模式
- 文档/字节上传与后续资源引用的适配边界
- `status / error / data` 三元状态，而不是全局单一 `loading`

**And** 本 Story 不要求把文档直接上传到 0G Storage 作为默认路径

**And** 若未来支持文档资产归档到 0G，本 Story 也必须保留“绑定引用”和“资产存储”分层，避免把 `Knowledge Binding` 与 0G 归档语义写死在一起

### AC5 — 引用开关必须贯穿到后续 Smoke Run 检查项，不能只是 UI 装饰

**Given** 用户在某条绑定上启用了 `citation_required = true`  
**When** 后续 Story 8.5 触发 `Smoke Run`  
**Then** Smoke Run 至少把“是否正确引用来源”纳入检查项之一

**And** 8.4 当前阶段至少需要做到：
- 在 Blueprint 中稳定保存 `citation_required`
- 在 UI 上明确告知“发布前 Smoke Run 会检查引用”
- 为 8.5 预留检查项枚举或 metadata 信号

**And** 若用户选择“暂不绑定知识”，系统也应在未来 Smoke Run 中将其解释为“当前不做知识来源检查”，而不是模糊地当作缺失数据

### AC6 — `Knowledge Dock` 必须与 8.3 的 Scene Tree / Inspector / Canvas 联动，形成“选中即绑定”的主路径

**Given** Scene Mode 已要求 `Scene Tree / Canvas / Inspector` 三者联动  
**When** 用户在 Team、某个 Agent 或 `Shared Knowledge` 入口上操作  
**Then** `Knowledge Dock` 至少支持以下联动：
- 从 `Scene Tree` 选中 `Shared Knowledge` 时，Dock 显示共享绑定列表
- 从某个 Agent 节点进入时，Dock 显示该 Agent 当前绑定
- 在 Dock 中新增/删除绑定后，Inspector 与 Scene 投影可见对应变化

**And** 若当前没有任何知识绑定，界面展示明确空态，例如：
- “还没有绑定任何资料”
- “可先上传文档、粘贴链接，或稍后再做”

**And** 不允许出现用户在 Dock 中新增了绑定，但 Scene/Inspector 毫无反馈、看起来像没保存成功的状态断裂

### AC7 — 需要给 Epic 9 的 `KnowledgePack / Citation Trace / Retrieval` 留清晰扩展缝，而不是在 8.4 里提前做半套平台

**Given** Epic 9 才是知识平台底座  
**When** 交付 Story 8.4  
**Then** 8.4 的责任边界应明确为：
- 提供 Builder 主路径入口
- 提供最小 Knowledge Binding schema
- 提供可被 8.5/8.6/9.x 继续消费的状态与 UI 壳

**And** 本 Story 明确不做：
- parse → chunk → embed/index 的完整 ingest pipeline
- 真正的 `KnowledgePack CRUD`
- 真正的 citation trace 结构化输出
- 真正的 retrieval 执行器与召回评分

**And** 若需要临时 mock / placeholder，也必须保持字段和状态机稳定，不能在后续 Epic 9 到来时整层推翻

### AC8 — 测试覆盖主路径动作、绑定状态写回、引用开关与关键空态/错误态

**Given** 8.4 是 Builder 从“能建壳”走向“能接资料”的关键故事  
**When** Story 8.4 完成  
**Then** 至少新增以下测试：
- `src/core/components/builder/KnowledgeDock.test.tsx`
- `src/pages/BuilderPage.test.tsx` 或等价页面集成测试
- 如新增 Builder store/selector，可补状态测试
- 若新增后端契约占位或 schema 校验，可补 Python 测试

**And** 至少覆盖以下事实：
- 用户可在 Scene Mode 打开 Dock
- 四种主路径动作至少在 UI/状态层可达
- 新增绑定后会写回 `blueprint state`
- `citation_required` 会被稳定保存
- 无绑定时展示明确空态
- 非法输入或上传失败时展示可理解错误，而不是静默失败

## Tasks / Subtasks

- [ ] **T1(AC1, AC6) 确定 `Knowledge Dock` 在 Builder 壳中的落点**
  - [ ] 确认是 Inspector 分区、Drawer 还是 `Shared Knowledge` 入口联动
  - [ ] 打通与 `Scene Tree / Canvas / Inspector` 的选中关系
  - [ ] 为共享绑定与 agent 级绑定建立可切换视图

- [ ] **T2(AC2, AC3) 定义最小 `KnowledgeBinding` 数据结构**
  - [ ] 在 Builder 合同或前端类型中明确 `source_type / source_ref / retrieval_mode / citation_required / freshness_hint`
  - [ ] 视需要补 `binding_id / scope / target_ref`
  - [ ] 保持字段 `snake_case`
  - [ ] 确保写回统一 `blueprint state`

- [ ] **T3(AC2, AC4) 实现四种主路径动作**
  - [ ] 文档上传入口
  - [ ] URL / 数据源输入入口
  - [ ] 绑定已有 `Knowledge Pack` 入口
  - [ ] “暂不绑定知识”入口
  - [ ] 为每条动作补最小 loading / success / error 状态

- [ ] **T4(AC4, AC7) 保持入口与底座解耦**
  - [ ] 不把 0G 资产上传硬编码为默认绑定路径
  - [ ] 不在 8.4 内偷做完整 ingest/retrieval 平台
  - [ ] 通过 adapter/service 层隔离上传、引用、绑定 schema

- [ ] **T5(AC5) 为 Smoke Run 引用检查预埋信号**
  - [ ] 让 `citation_required` 能被 8.5 读取
  - [ ] 在 UI 文案里提示后续 Smoke Run 会检查引用
  - [ ] 为“暂不绑定知识”的场景保留明确语义

- [ ] **T6(AC6) 做好联动与空态反馈**
  - [ ] 选中 Team / Agent / Shared Knowledge 时切换 Dock 内容
  - [ ] 新增/删除绑定后给 Scene / Inspector 明确信号
  - [ ] 补空态、错误态、无权限/无数据态

- [ ] **T7(AC8) 补测试护栏**
  - [ ] 组件测试覆盖 Dock 主路径动作
  - [ ] 页面测试覆盖 Scene Mode 中打开 Dock 与写回状态
  - [ ] 状态测试覆盖 `blueprint state` 的知识绑定更新
  - [ ] 如新增后端 schema 占位，补对应 Python 测试

## Dev Notes

### Story Foundation

- Epic 8 对 Story 8.4 的权威定义来自 [`_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md)
- 8.4 的本质不是“补一个上传按钮”，而是把知识接入变成 Builder 主路径中的第一等能力
- 成功标准不是做出完整知识平台，而是让普通用户在 Scene Mode 下自然完成“给 Agent 绑定资料”的第一步

### Previous Story Intelligence (8.1 / 8.2 / 8.3)

- 8.1 已把 `KnowledgeBinding` 列为 Builder 一等对象，且要求 Builder 合同与既有 runtime 契约解耦
- 8.2 已把 Builder 入口定义为 `Goal Mode`，意味着 8.4 不能把知识接入重新拉回 schema-first 的底层配置心智
- 8.3 已建立 `Goal / Scene / Graph` 三态、`Scene Tree + Canvas + Inspector` 壳，以及 `blueprint state` 为源、`graph projection state` 为投影的约束
- 因此 8.4 必须把 `Knowledge Dock` 做成 Scene Mode 的自然延伸，而不是另起一条页面或临时 modal 路径

### 现有代码基线（必须复用）

- [`src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx)
  - 当前已有 `/`、`/templates`、`/import`、`/editor` 等稳定主路由
  - Builder 入口后续应与现有路由壳兼容，避免抢占正在演进的 Inbox 首页

- [`src/EditorPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/EditorPage.tsx)
  - 已具备三栏壳、`ReactFlowProvider`、画布、Inspector、0G 发布入口与运行态桥接
  - 8.4 应优先复用其布局/面板语言，而不是再造第三套编辑壳

- [`src/pages/ImportPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/pages/ImportPage.tsx)
  - 已有 `Import by CID` 的输入校验、loading、toast、历史记录、验证 banner 模式
  - `Knowledge Dock` 的 URL/资源输入和错误反馈可直接借鉴这一套交互节奏

- [`src/adapter/zerogStorage.ts`](D:/VScode/TotalProject/ShadowFlow/src/adapter/zerogStorage.ts)
  - 已把 0G 上传/下载、Merkle 校验和 `ZgFile.close()` 封装在 adapter 层
  - 这说明 8.4 若涉及文档资产上传，也应走独立 adapter/service，而不是把存储细节塞进 Builder 组件

- [`src/core/stores/useRunStore.ts`](D:/VScode/TotalProject/ShadowFlow/src/core/stores/useRunStore.ts)
  - 已采用 Zustand + Immer、精确状态切片与 `status / error / timeline` 模式
  - 8.4 的 Dock 状态与未来 8.5 Smoke Run 结果应沿用相同的状态纪律

- [`shadowflow/api/archive.py`](D:/VScode/TotalProject/ShadowFlow/shadowflow/api/archive.py)
  - 展示了 FastAPI 独立 router + service 的稳定拆分方式
  - 如果 8.4 需要后端占位契约或知识入口 API，应沿用这类组织方式

### 实施原则（防止开发写偏）

1. **Knowledge Dock 是 Builder 入口层，不是 Epic 9 知识平台的缩水替代**
   - 先把“怎么绑定”做顺
   - 不要在 8.4 偷做半套 ingest / retrieval / citation 平台

2. **`blueprint state` 是唯一真源**
   - 文档、URL、Knowledge Pack 绑定都先写回 Blueprint
   - 不要把绑定结果只挂在组件本地状态或 workflow metadata 临时对象里

3. **Scene-first，不是 infra-first**
   - 文案和 UI 优先讲“资料、来源、引用、新鲜度”
   - 避免默认暴露 `chunking / top-k / embedding / vector index`

4. **共享资源与 agent 级资源必须可区分**
   - Team 模式下至少区分 shared 与 agent-specific knowledge
   - Single 模式仍沿用同一套模型，避免未来回填困难

5. **为 8.5/8.6/9.x 留稳定扩展缝**
   - 8.5 读取 `citation_required` 做 Smoke Run 检查
   - 8.6 把绑定信息带入 Publish backfill
   - 9.1/9.2 再把 `KnowledgePack / Citation Trace` 从占位升级为真能力

### Project Structure Notes

- 前端建议落点：
  - `src/core/components/builder/KnowledgeDock.tsx`
  - `src/core/components/builder/knowledge/*`
  - `src/common/types/agent-builder.ts`
  - `src/pages/BuilderPage.tsx`
  - `src/pages/BuilderPage.test.tsx`

- 若需要前端 store / selector：
  - `src/core/stores/builderStore.ts` 或等价位置
  - 保持与现有 Zustand store 的精确 selector 模式一致

- 若需要后端占位接口：
  - `shadowflow/api/knowledge.py`
  - `shadowflow/runtime/knowledge_service.py`
  - 但仅限为 8.4 主路径服务，不做完整平台

### Git / Workspace Intelligence

- 当前工作区仍有前端脏树，尤其集中在：
  - [`src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx)
  - `src/pages/InboxPage.tsx`
  - `src/core/components/inbox/*`
- 这意味着 8.4 后续实施如果会改路由或主页面壳，必须先读取并避让这些未提交改动
- 最近 5 个提交仍集中在 Epic 5（0G Compute / author lineage）与 sprint 文档同步，说明 Builder 系列仍处于“文档先行、代码待落地”阶段，8.4 需要把空位与复用点写得非常清楚

### Official Docs Sanity Check (2026-04-23 / 2026-04-23 搜索校验)

- **React Flow 官方文档**
  - 官方状态管理指南明确支持把 React Flow 与 Zustand 结合使用，并指出随着应用增长，把 `nodes / edges / actions` 放入 store 更易维护
  - 文档当前已进入 React Flow 12 系列，但仓库仍固定在 `reactflow ^11.10.4`；本 Story 不应顺手触发大版本迁移

- **React Router 官方文档**
  - `reactrouter.com` 当前最新分支已到 `7.14.1`，但仓库 `package.json` 固定为 `react-router-dom 6.30.3`
  - v6 文档仍明确相对导航默认按 route hierarchy 解析，因此 Builder 若走子路由/嵌套路由，需要在 6.30.3 语义下设计，不要假设 v7 行为

- **0G SDK 约束**
  - 仓库前端当前锁定 `@0glabs/0g-ts-sdk 0.3.3` 与 `@0glabs/0g-serving-broker ^0.6.5`
  - 本 Story 若涉及文档资产输入，只能复用现有 0G 封装边界与 `.0g-skills/AGENTS.md` 规则，不能绕开现有安全约束

### Testing Requirements

- 组件测试至少覆盖：
  - 打开 `Knowledge Dock`
  - 新增文档 / URL / Knowledge Pack / 暂不绑定知识
  - `citation_required` 切换与保存
  - 空态与错误态

- 页面测试至少覆盖：
  - Scene Mode 下选择 `Shared Knowledge` 或某个 Agent 后 Dock 内容变化
  - 绑定写回 `blueprint state`
  - 返回 Scene/切换 Graph 后状态不丢失

- 若新增后端 schema 或接口占位：
  - Python 测试应验证字段名、成功 envelope、错误 envelope 与最小校验

### Scope Boundaries

- **本 Story 做**
  - `Knowledge Dock` 主路径入口
  - 最小 `KnowledgeBinding` schema
  - 文档 / URL / Knowledge Pack / 暂不绑定的四种动作
  - 与 Scene/Inspector/未来 Smoke Run 的联动信号

- **本 Story 不做**
  - 完整文档 ingest pipeline
  - 真正向量检索与排序
  - 完整 `KnowledgePack CRUD`
  - 真正 citation trace 输出
  - Epic 9 的长期记忆与状态系统

### References

- [Source: `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`#Story 8.4](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md)
- [Source: `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md)
- [Source: `_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md)
- [Source: `_bmad-output/implementation-artifacts/8-3-scene-mode-shell-scene-tree-inspector.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-3-scene-mode-shell-scene-tree-inspector.md)
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Frontend Architecture](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/architecture.md)
- [Source: `_bmad-output/project-context.md`#5 React / Zustand 状态管理](D:/VScode/TotalProject/ShadowFlow/_bmad-output/project-context.md)
- [Source: `_bmad-output/project-context.md`#11 Naming / Structure / Format](D:/VScode/TotalProject/ShadowFlow/_bmad-output/project-context.md)
- [Source: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`#4.5 最小可行的 Agent Scene Editor](D:/VScode/TotalProject/ShadowFlow/docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md)
- [Source: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`#7.1 Phase A：Agent Builder MVP](D:/VScode/TotalProject/ShadowFlow/docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md)
- [Source: `docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md`#6.1 Phase A：Agent Builder MVP](D:/VScode/TotalProject/ShadowFlow/docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md)
- [Source: `src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx)
- [Source: `src/EditorPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/EditorPage.tsx)
- [Source: `src/pages/ImportPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/pages/ImportPage.tsx)
- [Source: `src/adapter/zerogStorage.ts`](D:/VScode/TotalProject/ShadowFlow/src/adapter/zerogStorage.ts)
- [Source: `src/core/stores/useRunStore.ts`](D:/VScode/TotalProject/ShadowFlow/src/core/stores/useRunStore.ts)
- [Source: `shadowflow/api/archive.py`](D:/VScode/TotalProject/ShadowFlow/shadowflow/api/archive.py)
- [Source: `tests/test_template_custom_api.py`](D:/VScode/TotalProject/ShadowFlow/tests/test_template_custom_api.py)
- [Source: official docs — React Flow state management, React Router v6 Link / relative routing docs, npm package metadata for current repo-pinned 0G SDK context]

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Story chain analysis:
  - `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`
  - `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`
  - `_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md`
  - `_bmad-output/implementation-artifacts/8-3-scene-mode-shell-scene-tree-inspector.md`
- Code baseline analysis:
  - `src/AppRoutes.tsx`
  - `src/EditorPage.tsx`
  - `src/pages/ImportPage.tsx`
  - `src/adapter/zerogStorage.ts`
  - `src/core/stores/useRunStore.ts`
  - `shadowflow/api/archive.py`
  - `tests/test_template_custom_api.py`
- Product/roadmap grounding:
  - `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`
  - `docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md`
- Official docs sanity check:
  - `https://reactflow.dev/learn/advanced-use/state-management`
  - `https://reactrouter.com/6.30.3/components/link`
  - `https://www.npmjs.com/package/%400glabs/0g-serving-broker`
  - `https://www.npmjs.com/package/%400glabs/0g-ts-sdk`

### Completion Notes List

- 已将 8.4 扩展为可直接开发的故事文档，明确 `Knowledge Dock` 在 Builder 主路径中的责任与边界
- 已把 8.1/8.2/8.3 的 Builder 合同、Goal 入口、Scene Mode 壳与双状态层约束串成 8.4 的实现前提
- 已结合现有 `EditorPage`、`ImportPage`、`zerogStorage`、`useRunStore` 等资产，写清应复用的交互/状态模式
- 已明确 8.4 只交付知识接入入口与绑定 schema，不提前吞下 Epic 9 的 ingest / retrieval / citation 平台范围
- 已补充官方文档校验，提醒后续实现继续沿用 Zustand + React Flow 组合，并保持 `react-router-dom 6.30.3` 语义

### File List

- `_bmad-output/implementation-artifacts/8-4-knowledge-dock-绑定主路径.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 8.4 实施文档，状态置为 `ready-for-dev`
