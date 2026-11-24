# src/components/run-session/

RunSessionPage 的子组件。v3 stacked 设计（design doc §S6.3 + §S6.7）。

## 组件清单

### 右栏 4 tab 内容

- `OverviewPanel.tsx` — Overview tab（run 元数据 + step 列表）
- `AgentPanel.tsx` + `AgentDetail.tsx` (S6.7) — Agent tab v3 stacked（Identity card + 4 SkillSection）
- `TeamPanel.tsx` + `BlueprintCanvas.tsx` — Team tab DAG
- `PreviewPanel.tsx` (+ `PreviewIframe/Markdown/Json.tsx`) — Preview tab 4 mime
- `RightPaneTabs.tsx` — 4 tab shell + run-status pill + tabCounts

### Stacked section（S6.7 v3）

- `SkillSection.tsx` ★ (S6.7 + S10) — 4 个 stacked section 单元，pill 含 cached/generated/loading/waiting/pending/idle 6 态
- `PersonaPromptCard.tsx` — persona body 渲染
- `ToolsGrid.tsx` — tools chips
- `IOContractBar.tsx` — INPUT/OUTPUT 表格

### 左栏 chat 流

- `StepList.tsx` (S6.8) — step + substep 树形（agent · slot 缩进）
- `StepArtifactDrawer.tsx` (S2.4) — 点 step 看 artifact
- `StepRetryButton.tsx` (S4.3) — step 重跑
- `ThinkCard.tsx` (S3.2 + S3.3) — `<sf:thinking>` 折叠卡 + localStorage 持久化
- `FollowChip.tsx` — auto/locked 状态

### 杂

- `AgentRoster.tsx` / `AgentPickerModal.tsx` — agent header 圆头像切换
- `AgentEmptyState.tsx` — pending agent 占位
- `PolicyMatrixMini.tsx` — Team tab 右上角 RACI mini
- `LayoutShell.tsx` — RunSessionPage 三栏布局

## 数据流约定

- 所有 props 来自 `useRunSession(sessionId)` 返回的 `session` 对象
- **禁止**在组件内补缺数据 placeholder（plan-eng-review D11 决议）
- SSE 帧 → reducer state → props，没有别的路径

## 修改注意

- `SkillSection.tsx` 的 `id` prop 与 `useFollowMode.ts` 的 `SUBSTEP_TO_ANCHOR` 映射强耦合，改 id 必同步 hook
- `AgentDetail.tsx` 的 `pickSectionStatus` 是 SectionStatus 状态机源头，substep.cached 字段语义来自后端 S4 register_agent emit
- v3 stacked 视觉规范见 `D:/Users/jy/Downloads/platform (3).zip` 设计稿
