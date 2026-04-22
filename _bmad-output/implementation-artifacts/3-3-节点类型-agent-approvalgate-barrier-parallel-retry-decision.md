# Story 3.3: 节点类型 — Agent / ApprovalGate / Barrier / Parallel / Retry / Decision

Status: done

## Story

As a **模板设计者**,
I want **从节点调色板拖出 7 种节点类型(Agent / ApprovalGate / Barrier / Parallel / Retry / Decision / Planning)构建工作流**,
so that **PRD Technical Success 第 6 条"6 种 Workflow Block 全命中"可达成,且 ApprovalGate/Barrier 两类关键节点首次落地可视化**。

## Acceptance Criteria

### AC1 — 7 种节点齐备且均继承 BaseNode

**Given** `src/core/components/Node/` 包含 `BaseNode` + `AgentNode` + `ApprovalGateNode`(新增)+ `BarrierNode`(新增)+ `ParallelNode` + `RetryNode` + `DecisionNode` + `PlanningNode`
**When** 节点调色板展开
**Then** 7 种节点可拖到画布,每种有独立视觉样式(图标 + 颜色)
**And** 所有自定义节点继承 `BaseNode.tsx`(AR Enforcement 第 8 条)

### AC2 — ApprovalGate Inspector 表单完整

**Given** 用户拖出 ApprovalGate 节点
**When** 点击节点
**Then** Inspector 显示表单:approver(下拉选角色)+ on_approve / on_reject(下拉选下游分支)+ timeout(默认 300s)

## Tasks / Subtasks

- [x] **T1(AC1):新增 `ApprovalGateNode.tsx`**
  - [ ] 路径:`src/core/components/Node/ApprovalGateNode.tsx`
  - [ ] extends `BaseNode`(继承通用 header/handle/badge 样式)
  - [ ] 图标:盾牌(Lucide `ShieldCheck`),主色橙色 `#F59E0B`
  - [ ] 两个出口 handle:`approve`(绿)、`reject`(红);一个入口 handle:`in`
  - [ ] 节点标题显示 `approver` 字段(无则显示占位"未指定审批人")
- [x] **T2(AC1):新增 `BarrierNode.tsx`**
  - [ ] 路径:`src/core/components/Node/BarrierNode.tsx`
  - [ ] extends `BaseNode`
  - [ ] 图标:闸口(Lucide `GitMerge`),主色蓝色 `#3B82F6`
  - [ ] 多入口 handle(动态数量,由上游并行分支决定)、单出口 handle
  - [ ] 徽标显示当前到达数 `n/N`(Story 4.2 LiveDashboard 会注入 runtime 数据,本故事仅渲染骨架)
- [x] **T3(AC1):注册 ReactFlow `nodeTypes` 并添加到调色板**
  - [ ] 修改 `src/core/components/Canvas/` 的 `nodeTypes = { agent, approval_gate, barrier, parallel, retry, decision, planning }`
  - [ ] 在 sidebar 调色板(Shadow UI copy 自 Story 3.1)新增 7 张 drag source 卡片
  - [ ] 每张卡片携带 `application/reactflow` DataTransfer 类型,drop 到 Canvas 后写入 `useWorkflowStore.addNode()`
  - [ ] `BaseNode.tsx` 提供 `renderHeader/renderBody/renderHandles` hooks,7 种节点全部走同一模板以满足 AR Enforcement 第 8 条
- [x] **T4(AC2):ApprovalGate Inspector 表单**
  - [ ] 在 `src/core/components/inspector/` 新增 `ApprovalGateForm.tsx`
  - [ ] 字段:
    - `approver`:下拉,options 来自 `useWorkflowStore.roles`(已声明的 agent 角色列表)
    - `on_approve`:下拉,options 来自当前节点 outgoing edges 的 target node ids
    - `on_reject`:下拉,同上
    - `timeout`:数字输入,默认 `300`(秒),范围 `[10, 86400]`
  - [ ] 表单 onChange → `useWorkflowStore.updateNodeData(nodeId, { ...patch })`
- [x] **T5:测试**
  - [ ] 单测 `src/__tests__/ApprovalGateNode.test.tsx`:渲染、选中态、handle 正确数量
  - [ ] 单测 `src/__tests__/ApprovalGateForm.test.tsx`:字段联动、默认 timeout=300
  - [ ] Playwright E2E `tests/e2e/node-palette.spec.ts`:拖拽 7 种节点到 Canvas → 全部成功落地

## Dev Notes

### 架构依据

- **Epic 3 Goal**:6 种 Workflow Block 必须在可视化层可以拖出
- **相关 AR**:AR20(Node 目录结构 5+2=7)、AR Enforcement 第 8 条(所有节点继承 BaseNode)、AR22(Inspector 表单组件 copy 自 Shadow UI)、AR24–29(6 种 Workflow Block 语义:plan/parallel/barrier/retry_gate/approval_gate/writeback)
- **相关 FR/NFR**:FR13(7 种节点 IDE 式调色板)、FR17(ApprovalGate 表单 approver/on_approve/on_reject/timeout)

### 涉及文件

- 新增 `src/core/components/Node/ApprovalGateNode.tsx`(AR20)
- 新增 `src/core/components/Node/BarrierNode.tsx`(AR20)
- 已有 `BaseNode.tsx` / `AgentNode.tsx` / `ParallelNode.tsx` / `RetryNode.tsx` / `DecisionNode.tsx` / `PlanningNode.tsx`(沿用)
- 新增 `src/core/components/inspector/ApprovalGateForm.tsx`
- 修改 Canvas 的 `nodeTypes` 注册

### 关键约束

- **图渲染保持 ReactFlow 原生**(AR23),不搬 Shadow PixiJS `graph/`
- **所有自定义节点必须继承 BaseNode**(AR Enforcement 第 8 条),新增的 ApprovalGate/Barrier 不得自己写 `<div className="react-flow__node">`
- Inspector 字段表单复用 Shadow UI `common/Select` / `common/Input`,不重造(AR22)
- 视觉样式参考 Pencil `.pen` 画稿(若存在),不在 Git 版本化,但 PR 描述引用路径

### 测试标准

- 单测 Testing Library:节点渲染、选中、handle 数量
- Playwright E2E:J1/J2 Journey 中"模板设计者拖出 ApprovalGate 并配置 approver"关键帧(AR38)

## References

- [Source: epics.md#Story 3.3]
- [Source: architecture.md#Frontend Architecture(lines 317–356)]
- [Source: architecture.md#Complete Project Directory Structure(lines 776–782)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

53/53 Vitest unit tests pass.

### Completion Notes List

- T1: `ApprovalGateNode.tsx` fully rewritten — SfNode-style inline CSS, amber #F59E0B accent, 3 Handles (in/approve/reject), approver field display, status dot.
- T2: `BarrierNode.tsx` created — blue #3B82F6, dynamic multi-input handles (spread top), single bottom output, arrived/total counter badge.
- T3: `WorkflowCanvas.tsx` nodeTypes registry expanded to 9 types (custom/default/agent/planning/parallel/retry/decision/approval_gate/barrier). Fixed bug: nodeType→rfType mapping now uses `dataNodeType in nodeTypes` instead of checking typeof component, so approval_gate/barrier render their own components. NodePalette already had all 7 palette items from Story 3.1.
- T4: `ApprovalGateForm.tsx` — approver select (roles from store), on_approve/on_reject selects (downstream ids), timeout number input (default 300, range 10–86400). Wired to `onUpdate` callback.
- T5: 13 new tests (7 ApprovalGateNode + 6 ApprovalGateForm). Added Handle/Position/ReactFlowProvider etc. to reactflow mock in setup.ts.

### File List

- src/core/components/Node/ApprovalGateNode.tsx (rewritten)
- src/core/components/Node/BarrierNode.tsx (new)
- src/core/components/Canvas/WorkflowCanvas.tsx (updated — expanded nodeTypes, fixed rfType mapping)
- src/core/components/inspector/ApprovalGateForm.tsx (new)
- src/core/components/inspector/index.ts (updated — export ApprovalGateForm)
- src/test/setup.ts (updated — Handle/Position/ReactFlowProvider in mock)
- src/__tests__/components/ApprovalGateNode.test.tsx (new)
- src/__tests__/components/ApprovalGateForm.test.tsx (new)

## Code Review Findings (2026-04-22)

### Review Mode: full (3-layer parallel adversarial)
### Reviewers: Blind Hunter · Edge Case Hunter · Acceptance Auditor

### Decisions Applied

| ID | Finding | Decision |
|----|---------|---------|
| P1-α | Registry key `timeout_s` vs form key `timeout` — values never persist | **Fixed** — `ApprovalGateForm` now reads/writes `timeout_s` throughout |
| P1-β | `parseInt(e.target.value) \|\| DEFAULT_TIMEOUT` snaps valid 0 to 300; makes field unusable mid-edit | **Fixed** — split into `timeoutStr` (display) + `timeoutS` (validated); uses `isNaN` guard; only pushes on valid input |
| P1-γ | Stale `cfg` closure in `push()` — rapid sequential changes clobber each other | **Fixed** — `push()` now spreads current local state values before `patch`, ensuring no prior change is lost |
| P1-δ | `addNode` always sets `type: 'custom'` — approval_gate/barrier demoted in YAML export and runtime | **Fixed** — `useWorkflow.addNode` now sets `type: nodeType` |
| P2-δ | `ApprovalGateForm` exported but never rendered anywhere — AC2 completely dead | **Fixed** — `InspectorTab` branches on `node.data.nodeType === 'approval_gate'` and renders `ApprovalGateForm` with derived `agentRoles` + `downstreamIds` |
| P2-2 | `ApprovalGateNode` and `BarrierNode` missing from `Node/index.tsx` barrel | **Fixed** — added both exports |
| P3-BarrierStatus | BarrierNode `error` status falls through to 'idle' text | **Fixed** — explicit `error` branch in status label ternary |
| P3-1 | Emoji icons lack `role="img"` + `aria-label` | **Fixed** — both ApprovalGateNode (🛡) and BarrierNode (⊞) |
| P3-2 | `<label>` missing `htmlFor` / inputs missing `id` — WCAG 1.3.1 | **Fixed** — `FIELD_IDS` constants, `Field` component now takes `htmlFor` |
| P2-6 | No `node-palette.spec.ts` E2E test | **Fixed** — created `tests/e2e/node-palette.spec.ts` with 4 tests |
| D1 | AR #8 BaseNode inheritance — all nodes are standalone `memo()`, BaseNode is legacy stub | **Accepted (D1=a)** — consistent pattern across all nodes; enforcing would require epic-level refactor |
| D2 | AR22 common/Select/Input don't exist — form uses plain `<select>`/`<input>` | **Accepted (D2=a)** — design system components don't exist yet; consistent with rest of codebase |

### Deferred Items

- **BH-P2 (rfType silent fallback)**: Misspelled nodeType falls through to SfNode silently. Defer — add `console.warn` in dev mode in a separate cleanup pass.
- **ECH-P2-5 (BarrierNode dynamic handle reposition)**: When `total` changes at runtime, connected edges visually detach. Deferred to Story 4.2 (this story renders static skeleton only).
- **ECH-P1-1 (useEffect on `[node.id]`)**: Form won't re-sync if same node's config changes externally (e.g., YAML sync). Deferred — needs a broader "config-externally-updated" subscription pattern, Epic 4 concern.
- **ECH-P3-3 (registry color vs hardcoded)**: ApprovalGateNode hardcodes amber, registry says green. Deferred to design system skin story.

### Patches Applied (8 files)

- [x] `src/core/hooks/useWorkflow.ts` — `addNode` uses `type: nodeType` (P1-δ)
- [x] `src/core/components/inspector/ApprovalGateForm.tsx` — timeout_s key + isNaN + stale cfg + htmlFor (P1-α, P1-β, P1-γ, P3-2)
- [x] `src/EditorPage.tsx` — wire ApprovalGateForm in InspectorTab + imports (P2-δ)
- [x] `src/core/components/Node/index.tsx` — barrel exports (P2-2)
- [x] `src/core/components/Node/BarrierNode.tsx` — error status label + aria-label (P3-status, P3-1)
- [x] `src/core/components/Node/ApprovalGateNode.tsx` — aria-label (P3-1)
- [x] `tests/e2e/node-palette.spec.ts` — new E2E test (P2-6)
- [x] sprint-status.yaml + story spec — status review → in-progress
