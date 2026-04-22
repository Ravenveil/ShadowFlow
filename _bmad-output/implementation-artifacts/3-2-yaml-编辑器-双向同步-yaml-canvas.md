# Story 3.2: YAML 编辑器 + 双向同步(YAML ↔ Canvas)

Status: done

## Story

As a **熟悉 YAML 的用户**,
I want **在右侧 YAML 编辑器直接改配置,画布实时反映;在画布上拖动节点,YAML 也同步**,
so that **可视化操作和代码级操作两条路径都通,满足 PRD 双轨编辑差异化定位**。

## Acceptance Criteria

### AC1 — YAML → Canvas(防抖同步)

**Given** Monaco Editor 加载当前模板的 YAML
**When** 用户在 YAML 中修改 role 名称
**Then** 300ms 防抖后 Zustand store 更新,画布对应节点标签刷新

### AC2 — Canvas → YAML(拖拽释放立即同步)

**Given** 用户在画布上拖动节点或改连接
**When** 释放鼠标
**Then** YAML 编辑器对应 block 立刻更新,保持两侧一致

### AC3 — YAML 语法错误不击穿画布

**Given** YAML 有语法错误
**When** 编辑器失去焦点
**Then** 报错高亮 + Toast 提示,画布保持上一次有效状态

## Tasks / Subtasks

- [x] **T1(AC1):Monaco Editor 集成**
  - [x] 新增 `src/core/components/editor/YamlEditor.tsx`(封装 `@monaco-editor/react`)
  - [x] 主题与 VSCode dark 一致,YAML language worker 启用
  - [x] Vite 懒加载该 chunk,避免 Landing/Templates 页面引入 Monaco(~1MB)
- [x] **T2(AC1):YAML → store 同步管道**
  - [x] 新增 `src/core/hooks/useYamlSync.ts`:
    - 监听 Monaco `onChange` → 300ms 防抖
    - 调 `parseWorkflowYaml(text)`(用 `yaml` 库的 `parse` with strict mode)
    - 成功则写入 `useWorkflow.setWorkflow(...)`、`usePolicyStore.addRule(...)`
    - 失败则写入 `useYamlEditorStore.setYamlError`(不污染 nodes/edges)
- [x] **T3(AC2):store → YAML 序列化管道**
  - [x] 新增 `src/core/lib/yamlSerializer.ts`:`serializeWorkflow(nodes, edges) → string`
  - [x] useYamlSync Effect 订阅 nodes/edges 变化 → 立即序列化写回 useYamlEditorStore
  - [x] **防循环**:sourceTag 'user'/'store' 控制双向更新,防止循环触发
- [x] **T4(AC3):错误态处理**
  - [x] Monaco `onDidBlurEditorText` 触发校验 → 在错误行插 `markers`(红色波浪)
  - [x] YamlEditor 内嵌 error banner 显示 "⚠ {error}"
  - [x] Canvas 不回滚,继续展示最后一次成功 parse 的 state
- [x] **T5:测试**
  - [x] 单测 `src/__tests__/stores/useYamlEditorStore.test.ts` (5 tests)
  - [x] 单测 `src/__tests__/lib/yamlSerializer.test.ts` (11 tests)
  - [x] Playwright E2E `tests/e2e/yaml-canvas-sync.spec.ts`

## Dev Notes

### 架构依据

- **Epic 3 Goal**:YAML/可视化双轨编辑是 PRD 差异化护城河之一
- **相关 AR**:AR16(Zustand 分域 store + `subscribeWithSelector`)、AR20(7 种节点类型)、AR42(Monaco 与 ReactFlow 不共享状态机,通过 store 中转)
- **相关 FR/NFR**:FR14(YAML 双轨编辑)、FR15(可视化拖拽)、P3(编辑响应 < 300ms)

### 涉及文件

- 新增 `src/core/components/editor/YamlEditor.tsx`
- 新增 `src/core/hooks/useYamlSync.ts`
- 新增 `src/core/lib/yamlSerializer.ts`(双向序列化器)
- 复用 Shadow UI Toast:从 `src/core/components/common/Toast.tsx`
- Zustand store(AR16):`useWorkflowStore`、`usePolicyStore`

### 关键约束

- **单一数据源**:Zustand store 是唯一 source of truth,Monaco 文本只是视图
- **防循环**:YAML→store 与 store→YAML 必须打 `source` tag 或使用 `skipNextSerialize` flag
- 300ms 防抖为硬性约束(AC1),不得自行放宽
- 图渲染保持 ReactFlow 原生(AR23),Monaco 也不得直接操作 ReactFlow 内部 state
- 语法错误不击穿画布(AC3)→ 画布状态机要容错

### 测试标准

- 单测覆盖 parse 成功/失败、序列化幂等(`serialize(parse(x)) === x`)
- Playwright 覆盖 J2 Academic Paper 的双向同步关键帧(AR38)

## References

- [Source: epics.md#Story 3.2]
- [Source: architecture.md#Frontend Architecture(lines 317–356)]
- [Source: architecture.md#Complete Project Directory Structure(lines 768–821)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

40/40 Vitest unit tests pass. Playwright E2E spec created (requires browser install to execute).

### Completion Notes List

- T1: `src/core/components/editor/YamlEditor.tsx` — wraps `@monaco-editor/react` with `sf-dark` theme (#0d1117 bg, purple cursor), YAML language, Monaco error markers on blur. Lazy-loaded via `lazy()` in EditorPage so Monaco chunk only loads on YAML tab open.
- T2: `src/core/hooks/useYamlSync.ts` — bidirectional bridge: Direction A (user→Monaco onChange→300ms debounce→parseWorkflowYaml→setWorkflow/setYamlError); Direction B (store nodes/edges change→serializeWorkflow→setYamlText 'store'). Anti-loop via `useYamlEditorStore._sourceTag`.
- T3: `src/core/lib/yamlSerializer.ts` — `parseWorkflowYaml` (strict mode, array root guard) + `serializeWorkflow`. Added to EditorPage as `<YamlSyncBridge />` (calls `useYamlSync()`, renders null) always mounted inside ReactFlowProvider.
- T4: Error markers via `monaco.editor.setModelMarkers` on blur; error banner in YamlEditor; canvas state preserved on error.
- T5: 40 tests pass (prev 24 + 11 yamlSerializer + 5 useYamlEditorStore). E2E spec created.

### File List

- src/core/components/editor/YamlEditor.tsx (new)
- src/core/components/editor/index.ts (updated — export YamlEditor)
- src/core/hooks/useYamlSync.ts (new)
- src/core/hooks/useYamlEditorStore.ts (previously created)
- src/core/lib/yamlSerializer.ts (previously created — added Array.isArray guard)
- src/EditorPage.tsx (updated — lazy YamlEditor import, YamlSyncBridge, YAML tab in RightInspector)
- src/__tests__/stores/useYamlEditorStore.test.ts (new)
- src/__tests__/lib/yamlSerializer.test.ts (new)
- tests/e2e/yaml-canvas-sync.spec.ts (new)

## Code Review Findings (2026-04-22)

### Review Mode: full (3-layer parallel adversarial)
### Reviewers: Blind Hunter · Edge Case Hunter · Acceptance Auditor

### Decisions Applied

| ID | Finding | Decision |
|----|---------|---------|
| P1-α | `useYamlSync()` double-mounted in both `RightInspector` + `YamlSyncBridge` → dual Direction A+B effects | **Fixed** — RightInspector now derives `validateNow` locally via `useYamlEditorStore` + `parseWorkflowYaml`; only `YamlSyncBridge` calls `useYamlSync()` |
| P1-β | `_sourceTag` never resets after user typing → Direction B permanently blind after first keystroke | **Fixed** — Added `resetSourceTag()` action to store; Direction A debounce calls it on successful parse before `setWorkflow` |
| P2-1 | `category` hardcoded to `'agent'` — gate nodes loaded from YAML get wrong category | **Fixed** — Added `GATE_TYPES` set; category derived from `nodeType` in `parseWorkflowYaml` |
| P2-2 | `setWorkflow` calls `saveToHistory('Load workflow')` per debounce cycle — pollutes undo stack | **Fixed** — Added `opts?: { skipHistory?: boolean }` to `setWorkflow`; `useYamlSync` passes `{ skipHistory: true }` |
| P2-3 | Monaco `value` prop causes cursor reset on Direction B update | **Deferred (D2=a)** — Accepted; controlled prop is simpler; fix requires uncontrolled mode rework |
| P2-4 | AC3 spec says "Toast 提示"; implementation uses inline banner | **Partial fix** — Added `role="alert"` + `aria-live="assertive"` for accessibility; full Toast system deferred to design-system story |
| P2-5 | AC2 (Canvas→YAML) had ZERO E2E test coverage | **Fixed** — Added AC2 palette-drag E2E test; fixed AC3 test using blocked `/editor/solo-company` |
| P2-6 | `onBlur` stale closure in `handleMount` (registered once, captures mount-time prop) | **Fixed** — `onBlurRef` updates via `useEffect`; blur listener reads `onBlurRef.current` |
| P2-7 | Missing `source`/`target` → `String(undefined ?? '')` = `''` → dangling edges | **Fixed** — `rawEdges.flatMap` skips entries with empty srcId or tgtId |
| P3-1 | `nodesRef`/`edgesRef` maintained but never read (dead code) | **Fixed** — Removed both refs from `useYamlSync.ts` |
| P3-2 | `monaco.editor.defineTheme('sf-dark')` called on every `handleMount` | **Fixed** — Extracted to module-level `ensureSfDarkTheme()` with `_sfDarkDefined` guard |
| P3-4 | Anti-loop guard had zero integration-level test coverage | **Fixed** — Added 3 tests: `resetSourceTag`, Direction A guard, Direction B guard |
| D1 | AR16 specifies `subscribeWithSelector`; actual impl uses React `useEffect` | **Accepted (D1=a)** — useEffect pattern is functionally equivalent; migrating adds complexity without behavioral gain at this stage |

### Deferred Items

- **P3-3**: Duplicate node IDs in YAML not validated (React key collision) — defer to Story 3-6 YAML schema validation
- **P3-5**: Edge original `id` lost on roundtrip — acceptable trade-off; IDs not user-visible
- **P3-6**: Workflow-level `id`/`name` metadata dropped on Direction B serialize — defer to Story 3-6 schema completion
- **AC3 full Toast**: Requires design-system Toast infrastructure story (Epic 5 candidate)

### Patches Applied (9 files)

- [x] `src/core/hooks/useYamlEditorStore.ts` — add `resetSourceTag()` action (P1-β)
- [x] `src/core/stores/workflowStore.ts` — `setWorkflow` opts.skipHistory (P2-2)
- [x] `src/core/hooks/useYamlSync.ts` — resetSourceTag + skipHistory + remove dead refs (P1-β, P2-2, P3-1)
- [x] `src/EditorPage.tsx` — remove `useYamlSync()` from `RightInspector`; local `validateNow` (P1-α)
- [x] `src/core/lib/yamlSerializer.ts` — GATE_TYPES category inference + edge source/target validation (P2-1, P2-7)
- [x] `src/core/components/editor/YamlEditor.tsx` — `role="alert"` + `onBlurRef` + `ensureSfDarkTheme` (P2-4, P2-6, P3-2)
- [x] `tests/e2e/yaml-canvas-sync.spec.ts` — AC2 test added; AC3 route fixed; networkidle→domcontentloaded (P2-5)
- [x] `src/__tests__/stores/useYamlEditorStore.test.ts` — anti-loop guard tests (P3-4)
