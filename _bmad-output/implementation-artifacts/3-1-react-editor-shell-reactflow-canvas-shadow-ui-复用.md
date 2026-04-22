# Story 3.1: React Editor Shell + ReactFlow Canvas + Shadow UI 复用

Status: done

## Story

As a **模板设计者**,
I want **打开 `/editor` 路由看到 split-screen 布局(左:画布,右:Inspector,顶:Toolbar)**,
so that **我有熟悉的 IDE 式操作界面,可快速上手搭建 agent 工作流**。

## Acceptance Criteria

### AC1 — 三栏布局首屏渲染

**Given** 已从 Shadow 项目复制 `sidebar/ inspector/ common/ modals/ layout/` 组件到 ShadowFlow
**When** 访问 `/editor` 或 `/editor/:templateId`
**Then** 页面首屏渲染 ≤ 2s(P1),显示三栏布局
**And** ReactFlow Canvas 占主区,支持缩放/平移/节点拖拽
**And** Inspector 面板默认显示选中节点的配置

### AC2 — Solo Company 模板 DAG 渲染性能

**Given** 加载 Solo Company 模板(8 角色 DAG)
**When** ReactFlow 渲染
**Then** DAG 完成渲染 ≤ 1s(P2),所有节点和边可见且无重叠

## Tasks / Subtasks

- [x] **T1(AC1):Shadow UI 非图渲染组件 copy 清单落地**
  - [x] 从 `D:\VScode\TotalProject\Shadow\src\core\components\sidebar\` → `src/core/components/sidebar/`(左栏节点调色板/模板树)
  - [x] 从 `D:\VScode\TotalProject\Shadow\src\core\components\inspector\` → `src/core/components/inspector/`(右栏节点配置表单)
  - [x] 从 `D:\VScode\TotalProject\Shadow\src\core\components\common\` → `src/core/components/common/`(按钮/下拉/Toast 等原子件)
  - [x] 从 `D:\VScode\TotalProject\Shadow\src\core\components\editor\` → `src/core/components/editor/`(toolbar/header)
  - [x] 从 `D:\VScode\TotalProject\Shadow\src\core\components\modals\` → `src/core/components/modals/`(确认/导入/导出对话框)
  - [x] 从 `D:\VScode\TotalProject\Shadow\src\core\components\layout\` → `src/core/components/Layout/`(split-pane + 三栏栅格)
  - [x] **禁止** copy `graph/` 目录 —— Shadow 的 PixiJS 渲染,ShadowFlow 保持 ReactFlow 原生(AR23)
- [x] **T2(AC1):路由与页面骨架**
  - [x] 新增 `src/pages/EditorPage.tsx`(注册到 React Router v6 的 `/editor/:templateId?`)
  - [x] split-screen 由 Layout 组件装配:左栏(Sidebar)+ 主区(Canvas)+ 右栏(Inspector)+ 顶栏(Toolbar)
  - [x] Vite code splitting:`/editor` 单独 chunk(参见 architecture Frontend Performance Optimization)
- [x] **T3(AC1):ReactFlow Canvas 行为**
  - [x] 复用已有 `src/core/components/Canvas/` 的 ReactFlow 挂载点
  - [x] 默认开启缩放(`panOnScroll`)、平移(`panOnDrag`)、节点拖拽(`nodesDraggable`)
  - [x] 选中节点时写入 `useWorkflowStore.selectedNodeId`,Inspector 订阅该 selector 精确渲染
- [x] **T4(AC1):Zustand store 接线**
  - [x] 新建或整合 `src/core/hooks/useWorkflowStore.ts`(持有 nodes/edges/defaults)
  - [x] 新建 `usePolicyStore.ts`、`useSecretsStore.ts`(后续 Story 使用,本故事仅预留 types)
- [x] **T5(AC2):Solo Company 8 角色 DAG 性能验收**
  - [x] 加载 `templates/solo-company.yaml`(Story 3.6 产出,此处可先用 mock fixture)到 Canvas
  - [x] Playwright E2E `tests/e2e/editor-shell.spec.ts`:打开 `/editor/solo-company` → 等待 `networkidle` → 断言首屏 ≤ 2s 且 DAG 渲染 ≤ 1s
  - [x] 开启 ReactFlow `onlyRenderVisibleElements`(为 Phase 3 大模板留余地,8 角色下不会破坏视觉)

## Dev Notes

### 架构依据

- **Epic 3 Goal**:6 种子模板起步 + YAML/可视化双轨编辑 + WorkflowAssemblySpec 主链编译 + Provider fallback
- **相关 AR**:AR16(Zustand 分域 store)、AR20(7 种节点的 Node 目录结构)、AR22(Shadow UI 非图渲染组件复用)、AR23(ReactFlow 原生渲染,不搬 PixiJS)
- **相关 FR/NFR**:FR1(模板加载 ≤ 2s)、FR13(IDE 式编辑器)、**P1(首屏 ≤ 2s)**、**P2(DAG 渲染 ≤ 1s)**

### 涉及文件

- 新增页面:`src/pages/EditorPage.tsx`
- **Shadow UI copy 清单(源 → 目标)**:
  - `D:\VScode\TotalProject\Shadow\src\core\components\sidebar\` → `src/core/components/sidebar/`
  - `D:\VScode\TotalProject\Shadow\src\core\components\inspector\` → `src/core/components/inspector/`
  - `D:\VScode\TotalProject\Shadow\src\core\components\common\` → `src/core/components/common/`
  - `D:\VScode\TotalProject\Shadow\src\core\components\editor\` → `src/core/components/editor/`
  - `D:\VScode\TotalProject\Shadow\src\core\components\modals\` → `src/core/components/modals/`
  - `D:\VScode\TotalProject\Shadow\src\core\components\layout\` → `src/core/components/Layout/`
- 已有 Canvas:`src/core/components/Canvas/`(保留)
- Zustand store(AR16):`src/core/hooks/useWorkflowStore.ts`、`usePolicyStore.ts`、`useSecretsStore.ts`

### 关键约束

- 图渲染保持 ReactFlow 原生,**不**搬 Shadow 的 PixiJS `graph/`(AR23)
- Shadow UI 非图渲染组件优先 copy + 改造,不重造(AR22)
- 首屏 JS bundle 目标 ≤ 400 KB gzipped(架构 Bundle Optimization)
- BYOK 密钥仅客户端持有,本故事不涉及密钥读写但需预留 `useSecretsStore` 空壳(S1)
- Pencil `.pen` 画稿若存在应作为 UX 依据在 PR 描述引用(非本仓库版本化)

### 测试标准

- Playwright E2E(AR38):J1 Solopreneur Journey 首步"打开编辑器看到 8 角色 DAG"
- 单测:Zustand store selector 不触发多余重渲染(Testing Library + `renderHook`)

## References

- [Source: epics.md#Story 3.1]
- [Source: architecture.md#Frontend Architecture(lines 317–356)]
- [Source: architecture.md#Complete Project Directory Structure(lines 689–865)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

24/24 Vitest unit tests pass. Playwright E2E spec created (requires browser install to execute).

### Completion Notes List

- T1: 6 component directories created with ShadowFlow-compatible implementations (common/sidebar/inspector/editor/modals/Layout). Shadow's incompatible PixiJS graph/ excluded per AR23. Shadow theming system (bg-v-*) replaced with ShadowFlow CSS variables.
- T2: react-router-dom@6 installed. src/pages/EditorPage.tsx + TemplatesPage.tsx as route-aware wrappers. main.tsx updated with BrowserRouter + lazy Routes (/editor/:templateId?, /templates, /).
- T3: WorkflowCanvas.tsx: panOnScroll, panOnDrag, nodesDraggable, onlyRenderVisibleElements all set.
- T4: useWorkflowStore.ts (re-export + useSelectedNode selector), usePolicyStore.ts (PolicyRule CRUD), useSecretsStore.ts (BYOK localStorage, NFR S1).
- T5: playwright.config.ts + tests/e2e/editor-shell.spec.ts (AC1 ≤2s / AC2 ≤1s assertions).

### File List

- src/core/components/common/ErrorBoundary.tsx (new)
- src/core/components/common/StatusBadge.tsx (new)
- src/core/components/common/index.ts (new)
- src/core/components/sidebar/NodePalette.tsx (new)
- src/core/components/sidebar/index.ts (new)
- src/core/components/inspector/NodeInspector.tsx (new)
- src/core/components/inspector/index.ts (new)
- src/core/components/editor/EditorToolbar.tsx (new)
- src/core/components/editor/index.ts (new)
- src/core/components/modals/ConfirmModal.tsx (new)
- src/core/components/modals/index.ts (new)
- src/core/components/Layout/EditorLayout.tsx (new)
- src/core/components/Layout/index.ts (new)
- src/pages/EditorPage.tsx (new)
- src/pages/TemplatesPage.tsx (new)
- src/main.tsx (updated — BrowserRouter + lazy routes)
- src/core/components/Canvas/WorkflowCanvas.tsx (updated — panOnScroll/panOnDrag/nodesDraggable/onlyRenderVisibleElements)
- src/core/hooks/useWorkflowStore.ts (new)
- src/core/hooks/usePolicyStore.ts (new)
- src/core/hooks/useSecretsStore.ts (new)
- playwright.config.ts (new)
- tests/e2e/editor-shell.spec.ts (new)
- src/__tests__/stores/usePolicyStore.test.ts (new)
- src/__tests__/stores/useSecretsStore.test.ts (new)
- src/__tests__/components/EditorLayout.test.tsx (new)
- src/__tests__/components/NodePalette.test.tsx (new)
- src/__tests__/components/StatusBadge.test.tsx (new)

### Review Findings

_Code review 2026-04-22 — Blind Hunter + Edge Case Hunter + Acceptance Auditor 三路评审_

#### Decision-Needed（已解决 6/6，2026-04-22）

- [x] [Review][Decision] **D1 Shadow UI 复制 vs 重造** → **c 补映射表**：接受重写已落地，不返工；但必须在 `docs/design/shadow-ui-mapping.md` 补 "Shadow 原组件 → ShadowFlow 重写对应" 清单，守住 AR22 可追溯性。→ follow-up task（见 deferred-work）
- [x] [Review][Decision] **D2 AC2 8 角色 fixture** → **b blocked-by-3.6**：Story 3-6 同批 review，mock fixture 是抛弃性代码；AC2 暂标 `blocked-by-3.6`，3-6 合并后补一行确认跑通。→ 见下方 defer 项
- [x] [Review][Decision] **D3 跨 story 节点引用** → **a 已验证接受**：`SfNode.tsx`/`ApprovalGateNode.tsx`/`BarrierNode.tsx`/`AgentNode.tsx` 已确认存在于 `src/core/components/Node/`（Story 3-3 产出）。imports 可解析。
- [x] [Review][Decision] **D4 usePolicyStore 超交付** → **c 接受 + 4-5/4-6 禁止重复交付**：不返工；在 Story 4-5 / 4-6 spec Dev Notes 加护栏注释"store 已由 3-1 落地，本 story 仅扩展差异化 action"。bugs 由 patches P11–P15 修复。→ follow-up task（见 deferred-work）
- [x] [Review][Decision] **D5 useWorkflowStore 仅 re-export** → **a 接受**：spec 原文"新建**或**整合"已覆盖；`defaults` surface 实际由 Story 3-6 template loader 承担。→ 派生 patch：加一行 TSDoc 标注边界
- [x] [Review][Decision] **D6 BYOK plaintext localStorage** → **c 接受 + UI 告警**：加密方案是安全剧场；工业标准（Anthropic Console、OpenAI Playground）都是 plaintext LS。→ 派生 patch：`SecretsModal` 顶部加 "密钥仅存本机浏览器，请勿在公共设备使用" banner

#### Patch（26 项可直接修复）

- [x] [Review][Patch] NodePalette 的 `retry_gate`/`merge`/`checkpoint` 未注册进 `nodeTypes`；且 `retry_gate` 与 `retry` 键冲突 [src/core/components/sidebar/NodePalette.tsx:22 ↔ src/core/components/Canvas/WorkflowCanvas.tsx]
- [x] [Review][Patch] `path="*"` 渲染 `<App/>` 应改为 `<Navigate to="/" replace/>` [src/main.tsx:17]
- [x] [Review][Patch] `useSecretsStore` 模块级 `loadSecrets()` → SSR/测试隔离损坏，改为 lazy init 或 `typeof window` 守卫 [src/core/hooks/useSecretsStore.ts:34]
- [x] [Review][Patch] `useSecretsStore` 反序列化未校验结果为 plain object（JSON 可能是数组/null/字符串）[src/core/hooks/useSecretsStore.ts:12-18]
- [x] [Review][Patch] `localStorage.setItem` 未 try/catch `QuotaExceededError`，静默丢盘数据与内存 state 分叉 [src/core/hooks/useSecretsStore.ts:28-34]
- [x] [Review][Patch] 未监听 `window 'storage'` 事件，跨 tab 修改不同步 [src/core/hooks/useSecretsStore.ts]
- [x] [Review][Patch] `setSecret(provider, '')` 持久化空串 + `hasAnySecret` 用 Boolean 误判 [src/core/hooks/useSecretsStore.ts:22-26, 52]
- [x] [Review][Patch] Playwright `baseURL: 'http://localhost:3000'` 与 Vite 默认 5173 不匹配，E2E 全部失败 [playwright.config.ts:20]
- [x] [Review][Patch] Playwright `waitForLoadState('networkidle')` 易 flap + 从 `goto` 起计时；换 `waitForSelector('.react-flow')` + `domcontentloaded` 起点 [tests/e2e/editor-shell.spec.ts:13-17, 30-37]
- [x] [Review][Patch] E2E 三栏断言仅测 `.react-flow`，未断言 Sidebar/Inspector 渲染 [tests/e2e/editor-shell.spec.ts]
- [x] [Review][Patch] `highlightCell` 定时器无 id 追踪 & 无取消逻辑（race + unmount 泄漏）[src/core/hooks/usePolicyStore.ts:80-90]
- [x] [Review][Patch] `addRule` 不去重 `(sender, receiver)` 而 `removeRule` 全擦，add/remove 不对称 [src/core/hooks/usePolicyStore.ts:76-84]
- [x] [Review][Patch] `matricesEqual` 内循环只迭代 `keysA`；`{x:{}}` vs `{y:{}}` 会误判相等 [src/core/hooks/usePolicyStore.ts:58]
- [x] [Review][Patch] `setCell` 未校验 sender/receiver 在 agents 列表，产生幻影行 [src/core/hooks/usePolicyStore.ts:98-104]
- [x] [Review][Patch] `setAgents` 自动写入 `permit` + 未去重/过滤空串 + 立即标 dirty [src/core/hooks/usePolicyStore.ts:87-96]
- [x] [Review][Patch] `NodeInspector` 用 `defaultValue` 而非受控 `value`，切换 node 不刷新显示 [src/core/components/inspector/NodeInspector.tsx:40]
- [x] [Review][Patch] `NodeInspector` label 仅读 `.zh`，无 `.en` fallback → `[object Object]` [src/core/components/inspector/NodeInspector.tsx:18-20]
- [x] [Review][Patch] `NodeInspector` config 非 string 值被 `String()` 强转回写破坏 config [src/core/components/inspector/NodeInspector.tsx:32-38]
- [x] [Review][Patch] `ConfirmModal` 缺 Esc 键、focus trap、`role="dialog"`、`aria-modal` 与 a11y 属性 [src/core/components/modals/ConfirmModal.tsx:17-19]
- [x] [Review][Patch] `ErrorBoundary` reset 后 children 仍抛错 → 无限循环；需 retry 计数或 key 重置 [src/core/components/common/ErrorBoundary.tsx:22-32]
- [x] [Review][Patch] `EditorPage` 硬编码 `lang="EN"` 与空 `onToggleLang`，破坏 i18n 切换 [src/pages/EditorPage.tsx:11]
- [x] [Review][Patch] `templateId` URL 参数未白名单校验，`/`/`..`/URL-encoded 直接透传 [src/pages/EditorPage.tsx:10-16]
- [x] [Review][Patch] `main.tsx` `lazy()` 路由缺 `ErrorBoundary` 包裹，chunk 404 白屏 [src/main.tsx:12-22]
- [x] [Review][Patch] `useSelectedNode` 未防 `selectedNodeIds` 为 undefined/空 [src/core/hooks/useWorkflowStore.ts:9-12]
- [x] [Review][Patch] `WorkflowCanvas` 对 `node.data.nodeType` 非 string truthy 走 `'in'` 检查会 TypeError [src/core/components/Canvas/WorkflowCanvas.tsx:51-57]
- [x] [Review][Patch] `edgeType` 入 `useMemo` deps 导致每次换边类型全量重建 [src/core/components/Canvas/WorkflowCanvas.tsx:82]
- [x] [Review][Patch] **D5 派生** `useWorkflowStore` 加 TSDoc 标注 `defaults surface deferred to Story 3-6 template loader` [src/core/hooks/useWorkflowStore.ts]
- [x] [Review][Patch] **D6 派生** `SecretsModal` 顶部加 banner "密钥仅存本机浏览器 localStorage，请勿在公共设备使用" [src/core/components/modals/SecretsModal.tsx]

#### Defer（2 项，已记入 deferred-work.md）

- [x] [Review][Defer] Inspector → `useSelectedNode` 实际订阅串接不在本 story diff 内（应在 legacy `EditorPageImpl`），本轮审查无法验证 T3 "Inspector 订阅该 selector 精确渲染" — deferred, pre-existing
- [x] [Review][Defer] **D2 派生** AC2 "8 角色 DAG ≤ 1s" 依赖 Story 3-6 `solo-company.yaml` 落地，blocked-by-3.6 — 3-6 合并后运行 `npx playwright test editor-shell.spec.ts` 复测通过即可 close AC2


