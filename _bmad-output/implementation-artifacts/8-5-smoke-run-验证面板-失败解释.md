# Story 8.5: Smoke Run 验证面板 + 失败解释

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Builder 用户**,
I want **在发布前一键运行 Smoke Run，并看到用户能看懂的失败原因**,
so that **我可以先验证 Agent 是否能完成最小任务闭环，而不是把半成品直接投入使用**。

## Acceptance Criteria

### AC1 — `Smoke Run` 是 Builder 主路径中的发布前检查，而不是藏在 Graph/调试页里的工程能力

**Given** Story 8.2/8.3/8.4 已建立 `Goal / Scene / Graph` 主路径、Scene 编辑壳与 `Knowledge Dock`
**When** 用户完成最小 Goal / Scene 配置并准备继续验证
**Then** Builder 页面存在稳定、可发现的 `Smoke Run` 入口，且至少满足以下一项：
- 作为 Builder 顶部主 CTA 之一
- 作为右侧 `Run Preview / Validation` 面板的主按钮
- 作为 Publish 前的强提醒步骤

**And** 用户不需要跳去现有 `/editor` 的运行按钮、手动拼 workflow YAML、或理解 runtime 调试事件，才能发起最小验证

**And** `Smoke Run` 的文案明确表达“先检查能不能跑通最小闭环”，而不是暴露“compile / run / SSE / checkpoint”这类基础设施术语

### AC2 — Smoke Run 至少覆盖 5 类最小检查项，并返回结构化结果而不是单一成功/失败

**Given** Epic 8 addendum 已定义 8.5 的最小检查范围
**When** 用户点击 `Smoke Run`
**Then** 至少检查以下项目：
- 角色能否正常初始化
- 必要工具是否可用
- 知识绑定是否可访问
- 最小任务能否从输入走到输出
- 引用要求是否被满足（如启用）

**And** 返回结果至少包含：
- `status`（`passed` / `failed` / `warning`）
- `checks[]`
- `summary`
- `recommended_fix`
- `raw_reason` 或等价机器可读错误字段

**And** `checks[]` 中每一项至少具备：
- `check_id`
- `label`
- `status`
- `reason`
- `target_ref`

**And** 不允许把所有失败都折叠成一个“运行失败”的总错误 toast

### AC3 — 失败解释必须经过 Builder 友好的翻译层，至少覆盖 5 个用户可理解归因

**Given** 运行时原始错误可能来自 Builder 合同、Graph 投影、SSE、provider/tool、知识绑定或引用检查
**When** Smoke Run 某一检查失败
**Then** UI 至少按以下维度归因并输出 Builder 语言：
- 目标不够清晰
- 知识缺失或不可访问
- 工具权限不足
- 角色职责冲突
- Graph 配置存在断裂

**And** 对用户展示的主文案应优先是：
- 发生了什么
- 为什么失败
- 下一步该改哪里

**And** 至少为每一类失败给出一个建议修复入口，例如：
- 返回 Goal Mode 补充目标
- 打开 `Knowledge Dock`
- 打开某个 Agent 的 Inspector
- 切到 `Graph Mode`

**And** 原始错误对象可以保留在调试层或开发日志里，但不能直接把 HTTP status、Python traceback、SSE 原始 payload 当作用户可见解释

### AC4 — `citation_required` 与“暂不绑定知识”的语义必须从 8.4 贯穿到 Smoke Run

**Given** Story 8.4 已把 `citation_required`、`source_type`、`source_ref` 等字段稳定写入 `blueprint state`
**When** Smoke Run 读取当前 Blueprint
**Then** 至少满足以下规则：
- 若任一相关绑定 `citation_required = true`，则启用引用检查项
- 若当前选择“暂不绑定知识”，则把知识检查解释为“当前不要求知识来源”，而不是笼统判为缺失
- 若绑定存在但不可访问，应归因为“知识缺失或不可访问”，而不是“目标不够清晰”

**And** Smoke Run 读取的是统一 `blueprint state` / `graph projection state`，而不是某个局部组件缓存

**And** 8.5 当前阶段只需要做最小 citation smoke check，不要求完整 `citation_trace[]` 结构化输出；真正的 trace/provenance 留给 Epic 9.2

### AC5 — Smoke Run 必须复用现有运行态模式与事件流，而不是另起一套平行状态机

**Given** 仓库已存在 `useRunStore`、`useRunEvents`、SSE 事件流、Timeline、`status / error / data` 三元状态与独立 FastAPI router/service 模式
**When** 实现 8.5
**Then** 应优先复用以下资产/模式：
- `useRunStore` 的节点状态与 timeline 表达方式
- `useRunEvents` 的事件订阅与派发模式
- `status / error / data` 三元状态纪律
- `shadowflow/api/archive.py` 这类 router + service 拆分方式

**And** Smoke Run 面板与结果数据不得只存在于页面本地 `useState` 且无法被 Scene/Graph 共享

**And** 不应为了 8.5 重新造一个脱离现有 run 体系的“假执行器”

### AC6 — 验证面板必须把“检查进度、失败项、建议修复动作”呈现为可操作界面，而不是只有日志滚动区

**Given** Smoke Run 的目标是帮助用户在发布前修正问题
**When** 面板展示运行结果
**Then** 至少包含以下区域：
- 当前总状态摘要
- 检查项列表
- 失败原因/建议修复区
- 最近一次运行时间或状态提示

**And** 对失败项至少支持以下一种可操作入口：
- 跳转到对应 Agent / Team / Shared Knowledge 的 Inspector
- 打开 `Knowledge Dock`
- 切换到 Goal Mode 或 Graph Mode

**And** 若存在多个失败项，面板需区分“最阻塞的问题”与“次要问题”，避免用户不知道先修哪一个

**And** 若全部通过，也要明确说明“当前已通过最小闭环验证”，而不是仅消失按钮或只打一个 toast

### AC7 — 需要为 8.6 Publish Backfill 与 Epic 9 Eval/Regression 留稳定扩展缝

**Given** 8.6 将消费 Smoke Run 结果决定是否继续发布，而 Epic 9.5/9.6 会把 smoke eval / regression 升级为更完整的评测能力
**When** 交付 Story 8.5
**Then** 8.5 的责任边界应明确为：
- 提供 Builder 主路径的一键 Smoke Run
- 提供最小检查项与 Builder 友好失败解释
- 提供可被 Publish / Eval / Regression 消费的稳定结果结构

**And** 本 Story 明确不做：
- 完整 `EvalProfile` 配置器
- 完整回归基线比较
- 自动学习/自动修复
- Epic 9 的 `citation_trace[]`、`KnowledgePack CRUD`、`Release Report`

**And** 若当前需要占位数据，也必须保持字段名与结果 envelope 稳定，不能在 8.6/9.x 到来时整层推翻

### AC8 — 测试必须覆盖检查归因、引用开关、失败翻译与面板交互，防止“看起来像验证，实际只是按钮壳”

**Given** 8.5 是 Builder 从“可编辑”走向“可验证”的关键故事
**When** Story 8.5 完成
**Then** 至少新增以下测试：
- `src/core/components/builder/SmokeRunPanel.test.tsx`
- `src/pages/BuilderPage.test.tsx` 或等价页面集成测试
- `tests/test_builder_api.py` / `tests/test_builder_service.py` 中补充 smoke-run 场景

**And** 至少覆盖以下事实：
- 用户可从 Builder 主路径触发 Smoke Run
- 5 类最小检查项可返回结构化结果
- `citation_required` 会触发引用检查
- “暂不绑定知识”不会被错误判定为知识访问失败
- 原始错误会被翻译成 Builder 友好归因
- 面板能把失败项映射到明确修复入口

## Tasks / Subtasks

- [ ] **T1(AC1, AC6) 确定 `Smoke Run` 在 Builder 壳中的入口与面板落点**
  - [ ] 确认是在顶部 CTA、右侧验证面板，还是两者联动
  - [ ] 让入口与 `Goal / Scene / Graph` 三态兼容
  - [ ] 设计通过态、失败态、空态与未配置态

- [ ] **T2(AC2, AC5, AC7) 定义最小 Smoke Run 合同与结果结构**
  - [ ] 在 Builder 合同/API 中明确 `status / checks / summary / recommended_fix`
  - [ ] 每个 `check` 至少携带 `check_id / label / status / reason / target_ref`
  - [ ] 保持字段 `snake_case`
  - [ ] 为 8.6/9.x 预留稳定 envelope

- [ ] **T3(AC2, AC4, AC5) 实现后端 Smoke Run 最小执行链**
  - [ ] 读取统一 `blueprint state` 或其后端等价对象
  - [ ] 检查角色初始化、工具可用性、知识可访问性、最小任务闭环、引用要求
  - [ ] 复用现有 run/SSE/service 模式，而不是另起假执行器
  - [ ] 保留机器可读失败原因供翻译层消费

- [ ] **T4(AC3, AC6) 实现 Builder 友好失败翻译层**
  - [ ] 建立 `raw_reason -> user_facing_reason -> recommended_fix` 映射
  - [ ] 至少覆盖 5 类 Builder 归因
  - [ ] 为每类失败绑定一个修复入口
  - [ ] 保留调试层查看原始错误的能力，但不默认暴露给普通用户

- [ ] **T5(AC4) 打通 8.4 知识绑定与引用检查**
  - [ ] 读取 `citation_required`
  - [ ] 区分“未绑定知识”“绑定但不可访问”“已绑定且需引用”
  - [ ] 为后续 Epic 9.2 的 citation trace 保留扩展缝

- [ ] **T6(AC6, AC7) 让面板结果可驱动修复动作与发布前决策**
  - [ ] 支持从失败项跳转到 Goal / Scene / Graph / Knowledge Dock
  - [ ] 标出最阻塞问题与推荐修复顺序
  - [ ] 为 8.6 发布前 gating 留出状态接口

- [ ] **T7(AC8) 补测试护栏**
  - [ ] 组件测试覆盖面板状态、失败解释、修复入口
  - [ ] 页面测试覆盖 Builder 主路径触发与状态流转
  - [ ] Python 测试覆盖 smoke-run endpoint / service 结果结构与归因

## Dev Notes

### Story Foundation

- Epic 8 对 Story 8.5 的权威定义来自 [`_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md)
- 8.5 的本质不是“补一个测试按钮”，而是把 Builder 从“能配置”推进到“能验证最小闭环”
- 成功标准不是跑出底层 runtime 日志，而是让普通用户知道“哪里没配好、先修哪里、修完再发布”

### Previous Story Intelligence (8.1 / 8.2 / 8.3 / 8.4)

- 8.1 已要求 Builder API 至少存在 `POST /builder/blueprints/smoke-run`，说明 8.5 应优先沿用 Builder API 主链，而不是在页面内本地伪造验证结果
- 8.2 已把 Builder 主路径定义为 `Goal Mode` 先生成骨架，因此 8.5 的失败解释必须支持“返回 Goal Mode 补目标”的修复路线
- 8.3 已建立 `Goal / Scene / Graph` 三态、`Scene Tree + Canvas + Inspector` 壳，以及 `blueprint state` 为源、`graph projection state` 为投影的约束；8.5 只能读取这套状态源，不能另造第三套
- 8.4 已把 `Knowledge Dock` 做成 Scene Mode 主路径入口，并稳定写回 `citation_required / source_type / source_ref / retrieval_mode / freshness_hint`
- 因此 8.5 必须消费 8.4 的知识绑定语义，尤其是：
  - `citation_required = true` 触发引用检查
  - “暂不绑定知识”是显式选择，不应被误判为错误配置
  - `Knowledge Dock` 是失败修复的自然入口

### 现有代码基线（必须复用）

- [`src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx)
  - 当前仅有 `/`、`/templates`、`/import`、`/editor` 等路由，尚未发现 `BuilderPage`
  - 说明 8.5 后续实现若需要主路径入口，应与正在演进的 Builder 壳共同设计，不应抢占 `/` 或破坏 `/editor`

- [`src/EditorPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/EditorPage.tsx)
  - 已具备三栏壳、运行按钮、`ReactFlowProvider`、面板与 0G 相关交互
  - 适合复用其“顶部 CTA + 右侧面板 + 中央画布”语言，但不应把 Builder 验证逻辑继续直接糊进这个巨型文件

- [`src/pages/ImportPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/pages/ImportPage.tsx)
  - 已有 `status / error / data` 三元状态、输入校验、loading、toast、历史记录与可理解失败文案
  - 8.5 的 Smoke Run 结果与失败解释可直接借鉴这种节奏，而不是只弹一次模糊错误

- [`src/core/stores/useRunStore.ts`](D:/VScode/TotalProject/ShadowFlow/src/core/stores/useRunStore.ts)
  - 已定义节点状态、timeline、policy violation、pending gaps 等运行态切片
  - 8.5 应优先沿用这类状态纪律表达检查进度与失败项，而不是另起一个全局 `loading` 布尔值

- [`src/core/hooks/useRunEvents.ts`](D:/VScode/TotalProject/ShadowFlow/src/core/hooks/useRunEvents.ts)
  - 已把 SSE 事件归一到 `useRunStore`，并映射 `node.started / node.failed / node.rejected / agent.gap_detected / run.reconfigured`
  - 8.5 的 Smoke Run 若沿用现有执行链，应该通过相同事件体系消费结果，再在 Builder 层做失败翻译

- [`shadowflow/api/archive.py`](D:/VScode/TotalProject/ShadowFlow/shadowflow/api/archive.py)
  - 展示了独立 `APIRouter` + `Service` + `{data, meta}` 返回结构的稳定模式
  - 如果 8.5 需要 Builder smoke-run router/service 扩展，应沿用同类拆分方式

- [`tests/test_template_custom_api.py`](D:/VScode/TotalProject/ShadowFlow/tests/test_template_custom_api.py)
  - 提供 FastAPI `TestClient`、真实模型、无 mock 的接口测试样板
  - 8.5 的后端测试可直接借鉴这种风格验证结果 envelope 与错误路径

### 实施原则（防止开发写偏）

1. **Smoke Run 是 Builder 级验证，不是 runtime 原始日志浏览器**
   - 用户看到的是“检查项、失败原因、修复建议”
   - 原始事件与错误对象留在调试层

2. **`blueprint state` / `graph projection state` 仍是唯一真源**
   - 检查输入来自统一 Builder 状态
   - 不要从某个局部组件临时拼假配置再去验证

3. **先做最小闭环验证，再做完整 eval/regression**
   - 8.5 关注“能不能跑、知识能不能读、引用要求有没有满足”
   - 完整基线比较、分数体系与 release report 留给 Epic 9

4. **失败归因必须站在用户语言上**
   - 用“目标不清晰 / 知识不可访问 / 工具权限不足 / 角色职责冲突 / Graph 断裂”
   - 不要把 422、traceback、SSE payload 直接扔给用户

5. **复用既有运行态与测试模式，不重复造轮子**
   - 复用 `useRunStore`、`useRunEvents`、FastAPI router/service、Vitest/pytest 测试护栏
   - 不要造平行 run store 或假 smoke-run executor

### Project Structure Notes

- 前端建议落点：
  - `src/core/components/builder/SmokeRunPanel.tsx`
  - `src/core/components/builder/smoke-run/*`
  - `src/pages/BuilderPage.tsx`
  - `src/pages/BuilderPage.test.tsx`

- 若需要前端状态：
  - `src/core/stores/builderStore.ts` 或等价位置
  - 保持 `status / error / data` 三元组，避免单一全局 `loading`

- 后端建议落点：
  - `shadowflow/api/builder.py`
  - `shadowflow/runtime/builder_service.py`
  - 如需拆细，可加 `shadowflow/runtime/smoke_run_service.py`

- 测试建议：
  - `tests/test_builder_api.py`
  - `tests/test_builder_service.py`
  - `src/core/components/builder/SmokeRunPanel.test.tsx`

### Git / Workspace Intelligence

- 当前工作区前端仍是脏树，尤其集中在 [`src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx) 与 Inbox 相关文件
- Builder 系列代码文件当前仍未明显落地；从 `src/pages/` 只看到 `EditorPage.tsx`、`ImportPage.tsx`、`InboxPage.tsx`、`TemplatesPage.tsx`
- 这意味着 8.5 后续实施要优先避让现有路由与 Inbox 改造，同时把 Builder 组件保持在独立目录，不要继续膨胀 `EditorPage.tsx`

### Official Docs Sanity Check (2026-04-23)

- **React Flow 官方文档**
  - 官方状态管理指南继续明确推荐在应用变复杂时把 nodes/edges/actions 放进 Zustand 等集中 store
  - 当前仓库固定 `reactflow ^11.10.4`，不应为 8.5 顺手升级到 React Flow 12 再改写交互

- **React Router 官方文档**
  - 仓库固定 `react-router-dom 6.30.3`
  - v6 文档明确相对链接默认按 route hierarchy 解析，因此 Builder 若从验证面板跳到 Goal/Scene/Graph 子视图，需要在 6.30.3 语义下设计，不要假设 v7 行为

- **Vitest 官方文档**
  - 官网当前显示 `v4.1.5`
  - 仓库 dev 依赖锁定 `vitest ^4.0.18`，适合继续沿用现有 Vite/Vitest 体系给 Builder 面板补组件测试，而不是再引入第二套前端测试框架

- **FastAPI 官方文档**
  - 官方 `Bigger Applications` 指南继续推荐用 `APIRouter` 做多文件拆分，并通过 `include_router(...)` 汇入主应用
  - `Metadata and Docs URLs` 文档继续确认 `/docs`、`/redoc` 自动文档行为；8.5 若扩 Builder API，不应隐藏在 OpenAPI 之外

### Testing Requirements

- 组件测试至少覆盖：
  - 触发 Smoke Run
  - 运行中状态
  - 失败解释翻译
  - 修复入口按钮
  - 全部通过态

- 页面测试至少覆盖：
  - Builder 主路径可进入验证面板
  - 从失败项跳转到 Goal / Scene / Graph / Knowledge Dock
  - 再次运行时会复用当前 Blueprint 状态

- Python 测试至少覆盖：
  - smoke-run endpoint 成功 envelope
  - 5 类检查项的最小结果结构
  - `citation_required` 的触发
  - “暂不绑定知识” 的正确语义
  - 失败翻译前后的稳定字段

### Scope Boundaries

- **本 Story 做**
  - Builder 主路径的一键 Smoke Run
  - 最小检查项
  - Builder 友好失败解释
  - 修复入口与结果面板
  - 对 8.4 `citation_required` 的读取与最小引用检查

- **本 Story 不做**
  - 完整 `EvalProfile` UI
  - 完整 regression 基线比较
  - 完整 `citation_trace[]`
  - 完整 `KnowledgePack CRUD`
  - 自动修复 / 自动学习
  - 8.6 的完整发布回填链路

### References

- [Source: `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`#Story 8.5](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md)
- [Source: `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md)
- [Source: `_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md)
- [Source: `_bmad-output/implementation-artifacts/8-3-scene-mode-shell-scene-tree-inspector.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-3-scene-mode-shell-scene-tree-inspector.md)
- [Source: `_bmad-output/implementation-artifacts/8-4-knowledge-dock-绑定主路径.md`](D:/VScode/TotalProject/ShadowFlow/_bmad-output/implementation-artifacts/8-4-knowledge-dock-绑定主路径.md)
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Frontend Architecture](D:/VScode/TotalProject/ShadowFlow/_bmad-output/planning-artifacts/architecture.md)
- [Source: `_bmad-output/project-context.md`#5 React / Zustand 状态管理](D:/VScode/TotalProject/ShadowFlow/_bmad-output/project-context.md)
- [Source: `_bmad-output/project-context.md`#10 Testing Discipline](D:/VScode/TotalProject/ShadowFlow/_bmad-output/project-context.md)
- [Source: `_bmad-output/project-context.md`#11 Naming / Structure / Format](D:/VScode/TotalProject/ShadowFlow/_bmad-output/project-context.md)
- [Source: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`#4.5 最小可行的 Agent Scene Editor](D:/VScode/TotalProject/ShadowFlow/docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md)
- [Source: `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`#7.1 Phase A：Agent Builder MVP](D:/VScode/TotalProject/ShadowFlow/docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md)
- [Source: `src/AppRoutes.tsx`](D:/VScode/TotalProject/ShadowFlow/src/AppRoutes.tsx)
- [Source: `src/EditorPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/EditorPage.tsx)
- [Source: `src/pages/ImportPage.tsx`](D:/VScode/TotalProject/ShadowFlow/src/pages/ImportPage.tsx)
- [Source: `src/core/stores/useRunStore.ts`](D:/VScode/TotalProject/ShadowFlow/src/core/stores/useRunStore.ts)
- [Source: `src/core/hooks/useRunEvents.ts`](D:/VScode/TotalProject/ShadowFlow/src/core/hooks/useRunEvents.ts)
- [Source: `shadowflow/api/archive.py`](D:/VScode/TotalProject/ShadowFlow/shadowflow/api/archive.py)
- [Source: `tests/test_template_custom_api.py`](D:/VScode/TotalProject/ShadowFlow/tests/test_template_custom_api.py)
- [Source: `package.json`](D:/VScode/TotalProject/ShadowFlow/package.json)
- [Source: `pyproject.toml`](D:/VScode/TotalProject/ShadowFlow/pyproject.toml)
- [Source: official docs — React Flow state management, React Router 6.30.3 routing docs, Vitest docs, FastAPI APIRouter/docs metadata]

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Story chain analysis:
  - `_bmad-output/planning-artifacts/epics-addendum-2026-04-23-user-builder.md`
  - `_bmad-output/implementation-artifacts/8-1-agentblueprint-合同-builder-api-骨架.md`
  - `_bmad-output/implementation-artifacts/8-2-goal-mode-目标输入-blueprint-生成.md`
  - `_bmad-output/implementation-artifacts/8-3-scene-mode-shell-scene-tree-inspector.md`
  - `_bmad-output/implementation-artifacts/8-4-knowledge-dock-绑定主路径.md`
- Code baseline analysis:
  - `src/AppRoutes.tsx`
  - `src/EditorPage.tsx`
  - `src/pages/ImportPage.tsx`
  - `src/core/stores/useRunStore.ts`
  - `src/core/hooks/useRunEvents.ts`
  - `shadowflow/api/archive.py`
  - `tests/test_template_custom_api.py`
- Product/roadmap grounding:
  - `docs/plans/shadowflow-user-agent-builder-roadmap-2026-04-23.md`
  - `docs/plans/shadowflow-backend-agent-roadmap-2026-04-23.md`
- Official doc sanity check:
  - `https://reactflow.dev/learn/advanced-use/state-management`
  - `https://reactrouter.com/6.30.3`
  - `https://reactrouter.com/docs/en/v6/components/link`
  - `https://vitest.dev/`
  - `https://fastapi.tiangolo.com/tutorial/bigger-applications/`
  - `https://fastapi.tiangolo.com/tutorial/metadata/`

### Completion Notes List

- 已将 8.5 扩展为可直接开发的故事文档，明确了最小检查项、失败翻译层与修复入口
- 已把 8.1/8.2/8.3/8.4 的 Builder 合同、三态壳、知识绑定与 `citation_required` 串成 8.5 的实施前提
- 已结合现有 `useRunStore`、`useRunEvents`、`ImportPage`、`archive.py` 等资产，写清应复用的状态/事件/API 模式
- 已明确 8.5 只做 Builder 主路径的 smoke validation，不提前吞下 Epic 9 的完整 eval、citation trace 与 regression 平台范围
- 已补充官方文档校验，提醒后续实现保持 `react-router-dom 6.30.3`、`reactflow ^11.10.4`、Vitest v4 与 FastAPI `APIRouter` 模式

### File List

- `_bmad-output/implementation-artifacts/8-5-smoke-run-验证面板-失败解释.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 8.5 实施文档，状态置为 `ready-for-dev`
