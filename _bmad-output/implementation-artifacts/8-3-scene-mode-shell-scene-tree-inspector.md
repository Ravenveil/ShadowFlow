# Story 8.3: Scene Mode Shell（Scene Tree + Canvas + Inspector）

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **大多数 Builder 用户**,
I want **在一个类似 Godot 的 `Scene Tree + Canvas + Inspector` 界面中编辑团队与角色，并能在 Goal / Scene / Graph 三层之间切换**,
so that **我用“场景编辑器”的心智创建智能体，而不是被 workflow 级实现细节淹没**。

## Acceptance Criteria

### AC1 — Builder 生成 Blueprint 后，Scene Mode 成为新的主编辑壳而不是占位页

**Given** Story 8.2 已把 Builder 主路径推进到 `Goal Mode -> 生成 blueprint`
**When** 用户接受生成结果并进入 `Scene Mode`
**Then** 页面进入一个稳定的 Builder 场景编辑壳，而不是继续停留在 Goal 结果卡片或直接掉回纯 `/editor`

**And** Scene Mode 至少具备四个固定区域：
- 左侧 `Scene Tree`
- 中央 `Canvas`
- 右侧 `Inspector`
- 顶部 `Goal / Scene / Graph` segmented control

**And** 这四个区域在桌面端同屏可见，在较窄视口下允许折叠侧栏，但不能丢失任一区域入口

**And** Scene Mode 必须明确建立在已有 `AgentBlueprint` 之上，而不是重新从 workflow YAML 读回一份弱化数据

### AC2 — `Goal / Scene / Graph` 三态切换存在统一状态源，切换时不丢失 Blueprint 上下文

**Given** Epic 8 的核心是 `goal-first / scene-first / progressive disclosure`
**When** 用户在 `Goal / Scene / Graph` 之间切换
**Then** Builder 至少存在一个统一的模式状态源，例如：
- `mode = "goal" | "scene" | "graph"`
- `blueprint`
- `graph_projection`
- `selection`

**And** 从 `Goal -> Scene` 切换后，当前 `blueprint` 仍被保留

**And** 从 `Scene -> Graph` 切换后，Graph 视图消费同一份 `graph_projection` 或可由同一份 `blueprint` 派生，而不是另造一次性临时 workflow

**And** 从 `Graph -> Scene` 返回时，至少保留：
- 当前选中节点或最近编辑对象
- Scene Tree 展开状态
- Inspector 最近查看对象

**And** 当前工作区还存在未提交的 Inbox 路由变更，因此本 Story 必须尽量复用现有页面壳，避免为了模式切换再重写整套路由体系

### AC3 — `Scene Tree` 至少正确表达 Team 根、Agent 节点与共享资源入口

**Given** Scene Mode 的左侧区域负责建立用户的整体结构感
**When** 页面渲染 `Scene Tree`
**Then** 至少出现以下节点层级：
- `Team` 根节点
- `Agent` 子节点列表（支持**主管-员工层级**，见下）
- `Shared Tools`
- `Shared Memory`
- `Shared Knowledge`

**And** Scene Tree 必须反映 `RoleProfile.sub_agents` 的层级结构：
```
Team
  └── 🎯 Research Manager（主管，can_spawn_tasks=true）
        ├── 👷 Search Worker 1（员工）
        ├── 👷 Search Worker 2（员工）
        └── 📝 Report Writer（员工）
  └── 🎯 Review Manager（主管）
        └── 👷 Fact Checker（员工）
```
- 主管节点可展开/收起，展示其员工列表
- 主管节点带特殊图标或标签（区别于普通 Agent）
- 员工节点缩进显示在主管下方
- 顶层 Agent（无主管、无员工）仍显示为平级，与现有行为兼容

**And** 当前 Story 至少支持：
- 展开/收起树节点（包括主管→员工展开）
- 高亮当前选中项
- 点击任意节点（主管或员工）驱动 Canvas 聚焦与 Inspector 切换

**And** Inspector 选中**主管**时，额外展示"员工列表"区域，支持：
- 查看员工名称与角色
- "添加员工"按钮（写入 `sub_agents[]`）

**And** 若当前 `blueprint.mode = "single"`，Scene Tree 仍应保留 Team 根，只是在 Team 下显示单个 Agent，避免 UI 分叉出第二套心智

**And** 本 Story 不要求完整 drag-and-drop 重排，但数据结构必须为后续角色增删与重排预留入口

### AC4 — `Canvas` 复用现有编辑器资产，但默认呈现 Builder 友好的场景投影

**Given** `src/EditorPage.tsx` 已有 `ReactFlowProvider`、三栏壳和 `WorkflowCanvas`
**When** Scene Mode 渲染中央画布
**Then** 应优先复用现有 `WorkflowCanvas` / `ReactFlowProvider` / Editor 壳，而不是再造一套新画布框架

**And** 画布默认展示的是 Builder 的 `scene projection`，至少包含：
- Team 或主 Agent 的可视节点
- Agent 间 handoff / collaboration 关系
- Shared Tools / Shared Knowledge / Shared Memory 的可见锚点或侧接节点

**And** 画布不要求在 8.3 暴露所有 workflow 级 gate/editing 细节，这些能力可以留在 `Graph Mode`

**And** 画布上的选中状态与 Scene Tree / Inspector 必须双向联动

**And** 若 `blueprint` 尚未生成或 `graph_projection` 无法建立，界面必须展示清晰空态/错误态，引导用户返回 Goal Mode，而不是渲染空白 React Flow

### AC5 — `Inspector` 至少能编辑 5 类 Builder 级属性，而不是只读信息面板

**Given** Scene Mode 的右侧区域负责“选中即编辑”
**When** 用户选中 Team、Agent 或共享资源入口
**Then** `Inspector` 至少可编辑以下字段：
- `role title`
- `role description / system prompt`
- `handoff / collaboration style`
- `visible tools`
- `knowledge bindings`
- `memory profile`（最小版）

**And** `Inspector` 的字段更新应首先写回 `blueprint state`

**And** 若某些字段在 Epic 9 之前仍是轻行为占位，界面也必须使用稳定 schema 写回，不允许退化成页面本地自由文本草稿

**And** 不同选中对象的 Inspector 面板允许有差异，但要共享统一的容器、保存逻辑和空态样式

### AC6 — 需要引入 `blueprint state` 与 `graph projection state` 双状态层，禁止在页面里临时拼装

**Given** Epic 8 addendum 已明确指出 8.3 需要“双状态层”
**When** 实现 Scene Mode
**Then** 至少区分以下两类状态：
- `blueprint state`：面向 Builder 语义的真实编辑状态
- `graph projection state`：供 Canvas/Graph 呈现的投影状态

**And** `blueprint state` 是源，`graph projection state` 是派生视图或可再生缓存

**And** 页面组件不得在 render 时临时把任意表单值拼成 ReactFlow nodes/edges 后直接当真数据保存

**And** 若需要 Zustand store，应沿用项目既有“精确 selector + immutable update”的模式，避免 `useStore()` 全量订阅引发编辑器重渲染膨胀

### AC7 — Scene Mode 与现有路由、EditorPage、Inbox 变更兼容，且为 8.4/8.5/8.6 留稳定扩展点

**Given** 目前仓库已有：
- 新的 `src/AppRoutes.tsx` 路由壳
- 巨型 `src/EditorPage.tsx`
- 正在进行中的 Inbox 页面改造
**When** 接入 Scene Mode
**Then** 实现方案至少满足以下约束：
- 不破坏现有 `/editor` 主链
- 不覆盖正在进行的 `/` Inbox 入口工作
- Builder 路由与 Editor 路由职责清晰
- 8.4 的 `Knowledge Dock`、8.5 的 `Smoke Run`、8.6 的 `Publish` 能自然挂载到当前壳上

**And** 推荐方案优先级为：
1. 新增 `BuilderPage` 承载 `Goal / Scene / Graph` 三态
2. 复用 `EditorPage` 的现有三栏布局与 `WorkflowCanvas`
3. 通过共享 Builder store 或 props 把 Graph Mode 对接回现有 editor 资产

**And** 不推荐直接继续把 8.3 逻辑全部糊进 `EditorPage.tsx` 顶层，若必须复用，也应拆出独立 Builder 组件目录

### AC8 — 测试覆盖模式切换、Scene Tree/Canvas/Inspector 联动与关键空态

**Given** 8.3 是 Builder 从“表单生成”走向“真正编辑”的关键故事
**When** Story 8.3 完成
**Then** 至少新增以下测试：
- `src/pages/BuilderPage.test.tsx` 或等价页面测试
- `src/core/components/builder/SceneTree.test.tsx`
- `src/core/components/builder/Inspector*.test.tsx` 或等价交互测试
- 如新增 store/selector，可补对应状态测试

**And** 至少覆盖以下事实：
- 接受 8.2 生成结果后可进入 `Scene Mode`
- `Goal / Scene / Graph` 切换不丢 `blueprint`
- 点击 Scene Tree 会同步更新 Canvas/Inspector
- Inspector 编辑会写回状态源
- 缺 `blueprint` 时 Scene Mode 展示明确引导，而非空白壳

**And** 本 Story 明确不做：
- 完整 Knowledge Dock 上传/ingest（Story 8.4）
- 真正 Smoke Run 面板与失败翻译（Story 8.5）
- 真正 Publish 回填链路（Story 8.6）
- Epic 9 的持久记忆、引用追踪、Agent State 真行为

## Tasks / Subtasks

- [ ] **T1(AC1, AC2) 定义 Builder 三态壳与统一状态源**
  - [ ] 确认 `BuilderPage` 路由落点与 `Goal / Scene / Graph` 切换方案
  - [ ] 建立统一 Builder 状态：`mode / blueprint / graph_projection / selection`
  - [ ] 让 8.2 的“接受并进入 Scene Mode”真正落到该状态源

- [ ] **T2(AC3) 实现 Scene Tree**
  - [ ] 新建 `src/core/components/builder/SceneTree.tsx` 或等价组件
  - [ ] 将 `Team / Agents / Shared Tools / Shared Memory / Shared Knowledge` 投影为树
  - [ ] 支持展开、收起、选中、高亮
  - [ ] 选中树节点时联动画布聚焦与 Inspector 面板

- [ ] **T3(AC4, AC6) 建立 scene projection 并复用 WorkflowCanvas**
  - [ ] 新建投影函数或 store 选择器，把 `AgentBlueprint` 映射为 Scene Canvas 所需节点/边
  - [ ] 优先复用 `ReactFlowProvider` 与 `WorkflowCanvas`
  - [ ] 区分 Scene 默认展示与 Graph 深度展示，避免一次暴露全部 workflow 细节
  - [ ] 补 `no blueprint / projection failed` 的空态与错误态

- [ ] **T4(AC5) 实现 Inspector 最小编辑能力**
  - [ ] 新建 `src/core/components/builder/inspector/*` 组件
  - [ ] 支持编辑 `role title / description / handoff / visible tools / knowledge bindings / memory profile`
  - [ ] 统一写回到 `blueprint state`
  - [ ] 按选中对象切换不同 Inspector 面板

- [ ] **T5(AC2, AC7) 打通 Goal / Scene / Graph 切换**
  - [ ] Goal Mode 接受后进入 Scene Mode
  - [ ] Scene Mode 可切换到 Graph Mode
  - [ ] Graph Mode 返回 Scene 时保留选中上下文
  - [ ] 明确 Builder 与 `/editor` 的边界，避免回归现有编辑器主链

- [ ] **T6(AC7) 控制文件结构与路由冲突风险**
  - [ ] 更新 `src/AppRoutes.tsx` 或等价入口，避让 Inbox 路由改动
  - [ ] 把 Builder 新组件放入 `src/core/components/builder/`
  - [ ] 避免继续膨胀 `src/EditorPage.tsx`；如需复用则做拆分

- [ ] **T7(AC8) 测试护栏**
  - [ ] 页面测试覆盖 `Goal / Scene / Graph` 三态切换
  - [ ] 组件测试覆盖 Scene Tree / Inspector 联动
  - [ ] 状态测试覆盖 `blueprint -> graph projection` 派生
  - [ ] 对空态和失败态补最小测试

## Dev Notes

### Story Foundation

- Epic 8 对 Story 8.3 的权威定义来自 [`_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md)
- 8.3 是 Epic 8 中把 Builder 从“生成骨架”推进到“可视化编辑”的关键故事
- 成功标准不是“做出一个漂亮三栏页”，而是建立 Scene-first 的稳定编辑主路径，让普通用户可以在不先理解 workflow schema 的前提下继续完善 Agent

### Previous Story Intelligence (8.1 + 8.2)

- 8.1 已确定 `AgentBlueprint` 是 Builder 单一中间产物，不能绕开去直接操纵底层 workflow schema
- 8.1 已明确前后端 Builder 边界采用 `snake_case`，并要求后续 UI 消费统一 API/类型层
- 8.2 已把 Goal Mode 的成功路径定义为：生成 `blueprint` 后可“接受并进入 Scene Mode”
- 8.2 已要求为 8.3 预留 `Scene Tree + Canvas + Inspector` 入口，因此 8.3 必须承接该状态而不是重开一条并行 UI
- 当前仓库里尚未发现已落地的 Builder 代码文件，说明 8.3 实施时要先补 Builder 壳与状态，不要误以为已有现成 `BuilderPage`

### 现有代码基线（必须复用）

- [`src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx)
  - 目前已存在 `/`、`/templates`、`/import`、`/editor` 路由
  - `/` 已切到新的 Inbox 主入口，Builder 不应抢占该入口
- [`src/EditorPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/EditorPage.tsx)
  - 已有三栏布局、`ReactFlowProvider`、`WorkflowCanvas`、Inspector 面板能力
  - 文件已经很大，适合作为复用资产，不适合继续无边界堆功能
- [`src/api/templates.ts`](D:/VScode/TotalProject/ShadowFlow/src/api/templates.ts)
  - 提供前端 API unwrap 风格样板，Builder API client 应维持同类模式
- [`shadowflow/server.py`](D:/VScode/TotalProject/ShadowFlow/shadowflow/server.py)
  - 已采用集中 `include_router(...)` 的 FastAPI 入口组织
  - 当前还未发现 Builder router 已接入，8.3 默认要与 8.1/8.2 的骨架实现协同演进
- [`shadowflow/api/archive.py`](D:/VScode/TotalProject/ShadowFlow/shadowflow/api/archive.py)
  - 提供独立 router/service 文件结构样板，可借鉴到后续 Builder API 拆分

### 实施原则（防止开发写偏）

1. **Scene Mode 是 Builder 主路径，不是 Editor 换皮**
   - 默认心智应是 Team / Agent / Shared Resources
   - workflow gate、边细节继续留给 `Graph Mode`

2. **`blueprint state` 是源，`graph projection` 是投影**
   - 先改 Builder 语义状态，再派生画布
   - 不要在组件 render 时临时拼 nodes/edges 后反向当真

3. **复用现有 ReactFlow/Editor 资产，不重复造轮子**
   - 现有 `ReactFlowProvider`、`WorkflowCanvas`、三栏壳都应优先复用
   - 不要再引入第二套画布框架或平行状态机

4. **Builder 路由要避让当前 Inbox 工作流**
   - 当前脏树显示 `src/AppRoutes.tsx`、`src/pages/InboxPage.tsx`、`src/core/components/inbox/*` 正在演进
   - 任何 8.3 实施都要先读这些改动，避免覆盖或误改首页入口

5. **Scene-first，不是 schema-first**
   - Scene Tree 和 Inspector 文案尽量使用 Team / Role / Knowledge / Memory 语言
   - 避免在 Scene Mode 默认暴露 `node / edge / provider / policy_matrix` 术语

### Project Structure Notes

- 前端建议落点：
  - `src/pages/BuilderPage.tsx`
  - `src/core/components/builder/BuilderModeSwitcher.tsx`
  - `src/core/components/builder/SceneTree.tsx`
  - `src/core/components/builder/SceneCanvasShell.tsx`
  - `src/core/components/builder/inspector/`
  - `src/core/stores/builderStore.ts` 或等价 store
  - `src/pages/BuilderPage.test.tsx`

- 若必须复用现有 `EditorPage`：
  - 保持 Builder 子组件独立目录
  - 避免把 Scene Tree / Builder mode / Inspector 分支逻辑继续直接塞进 `src/EditorPage.tsx`

- 现阶段未发现以下文件已存在：
  - `src/pages/BuilderPage.tsx`
  - `src/api/builder.ts`
  - `src/common/types/agent-builder.ts`
  - `shadowflow/api/builder.py`
  - `shadowflow/runtime/builder_service.py`
  - `shadowflow/runtime/contracts_builder.py`

### Git / Workspace Intelligence

- 当前工作区是脏树，且前端相关变更集中在：
  - [`src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx)
  - `src/pages/InboxPage.tsx`
  - `src/core/components/inbox/*`
  - `src/App.tsx` / `src/index.css` / `src/main.tsx`
- 这意味着 8.3 实施若同时触碰路由和页面壳，极易与正在进行的 Inbox 改造发生冲突
- 最近 5 个提交仍主要集中在 Epic 5（0G Compute / author lineage）与 sprint 文档同步，说明 Builder 系列故事目前仍处于“文档先行、代码待落地”阶段

### Official Docs Sanity Check (2026-04-23)

- **React Flow 官方文档**
  - `ReactFlowProvider` 用于让组件树中任意位置访问 flow 内部状态；若在路由环境里希望跨视图保留 flow 状态，应把 provider 放在合适的上层
  - `useReactFlow()` 只可在 `<ReactFlowProvider />` 或 `<ReactFlow />` 子树内使用，且不会因状态变化自动重渲染，适合做命令式聚焦/查询
  - 官方状态管理指南明确 React Flow 可与 Zustand 搭配，这与项目当前架构一致

- **React Router 官方文档**
  - v6 路由层级默认按 route hierarchy 解析相对导航，适合 Builder 内部做 `Goal / Scene / Graph` 子路由或嵌套布局
  - 若 Builder 需要与 `/editor` 并存，建议保持路由职责清晰，避免通过相对路径技巧把两套路由耦死

### Testing Requirements

- 页面测试至少覆盖：
  - 从 Goal 结果进入 Scene
  - `Goal / Scene / Graph` 切换
  - 缺 `blueprint` 时的回退引导
- 组件测试至少覆盖：
  - Scene Tree 选中 -> Inspector 切换
  - Scene Tree 选中 -> Canvas 聚焦/高亮
  - Inspector 编辑 -> 写回状态源
- Store/selector 测试至少覆盖：
  - `blueprint state` 到 `graph projection state` 的派生
  - 选择态保留与返回 Scene 时的恢复

### Scope Boundaries

- **本 Story 做**
  - Scene Mode 三栏壳
  - `Goal / Scene / Graph` 统一状态与切换
  - Scene Tree 最小结构
  - Canvas 的 scene projection
  - Inspector 最小编辑能力

- **本 Story 不做**
  - 真正 Knowledge Dock 上传/ingest
  - 真正 Smoke Run 面板
  - 真正 Publish 回填
  - Epic 9 的长时记忆、引用追踪与 Agent State 真行为
  - 完整 workflow graph 级高级编辑器替代

### References

- [Source: `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`#Story 8.3](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md)
- [Source: `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md)
- [Source: `_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md)
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Frontend Architecture](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/architecture.md)
- [Source: `_bmad-output/project-context.md`#5 React / Zustand 状态管理](D:/VScode/TotalProject/ShadowFlow/_bmad-output/project-context.md)
- [Source: `_bmad-output/project-context.md`#11 Naming / Structure / Format](D:/VScode/TotalProject/ShadowFlow/_bmad-output/project-context.md)
- [Source: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`#4.4 建议的 Godot 式交互模型](D:/VScode/TotalProject/ShadowFlow/docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md)
- [Source: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`#7.1 Phase A：Agent Builder MVP](D:/VScode/TotalProject/ShadowFlow/docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md)
- [Source: `docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md`#6.1 Phase A：Agent Builder MVP](D:/VScode/TotalProject/ShadowFlow/docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md)
- [Source: `src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx)
- [Source: `src/EditorPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/EditorPage.tsx)
- [Source: `src/api/templates.ts`](D:/VScode/TotalProject/ShadowFlow/src/api/templates.ts)
- [Source: `shadowflow/server.py`](D:/VScode/TotalProject/ShadowFlow/shadowflow/server.py)
- [Source: `shadowflow/api/archive.py`](D:/VScode/TotalProject/ShadowFlow/shadowflow/api/archive.py)
- [Source: `tests/test_template_custom_api.py`](D:/VScode/TotalProject/ShadowFlow/tests/test_template_custom_api.py)
- [Source: official docs — React Flow hooks/providers/state management, React Router v6 routing docs]

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Story chain analysis:
  - `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`
  - `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`
  - `_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md`
- Code baseline analysis:
  - `src/AppRoutes.tsx`
  - `src/EditorPage.tsx`
  - `src/api/templates.ts`
  - `shadowflow/server.py`
  - `shadowflow/api/archive.py`
- Product/roadmap grounding:
  - `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`
  - `docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md`
- Official docs sanity check:
  - `https://reactflow.dev/learn/advanced-use/hooks-providers`
  - `https://reactflow.dev/api-reference/hooks/use-react-flow`
  - `https://reactflow.dev/learn/advanced-use/state-management`
  - `https://reactflow.dev/api-reference/react-flow-provider`
  - `https://reactrouter.com/docs/en/v6/components/link`

### Completion Notes List

- 已将 8.3 扩展为可直接开发的故事文档，明确 Scene Mode 的四区壳、三态切换与双状态层
- 已把 8.1/8.2 的 Builder 合同与 Goal 入口结论串成 8.3 的前置依赖，避免实现时重新发明状态模型
- 已结合现有 `AppRoutes.tsx`、`EditorPage.tsx`、`templates.ts`、FastAPI router 模式，写清可复用资产与不应重复造轮子的边界
- 已把当前工作区的 Inbox 路由未提交改动标为实施风险，提醒后续开发必须先读取并避让
- 已补充 React Flow / React Router 官方文档校对点，确保 Scene Mode 的 provider、state 和路由切换实现不偏离当前官方推荐模式

### File List

- `_bmad-output/implementation-artifacts/8-3-scene-mode-shell-scene-tree-inspector.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 8.3 实施文档，状态置为 `ready-for-dev`
