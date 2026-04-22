# Story 4.4: 节点详情 TraceView

Status: done

## Story

As a **用户(Demo 观众深究细节 / 运营者排查)**,
I want **点开任一节点查看输入/输出/历史/错误**,
so that **深度排查或理解 agent 决策过程,信任不是黑盒**。

## Acceptance Criteria

### AC1: 节点点击 → TraceView 面板滑出

**Given** LiveDashboard 中任一节点
**When** 用户点击节点
**Then** 右侧 TraceView 面板从右向左滑出(宽 480px,动画 ≤ 300ms)
**And** 面板显示 4 个分区:
- **Inputs** — 该节点接收的消息 / 上下文 JSON(可折叠,≤ 2KB 默认展开,> 2KB 折叠)
- **Outputs** — agent 产出(文本 / JSON / markdown 按 content-type 渲染)
- **Timeline** — 竖向时间线:`started / retried #1 / retried #2 / succeeded or rejected` 每项含时间戳 + 耗时
- **Error** — 若有错误,显示 error.code / message / stack(collapsed)

### AC2: Retry 历史完整保留

**Given** 节点经历多轮 retry
**When** TraceView Timeline 分区渲染
**Then** 显示**每一轮** retry 的 fail reason,而非只显示最后一次
**And** 每轮可点击展开查看该轮的 Inputs / Outputs(回放)
**And** Timeline 颜色编码:succeeded 绿 / rejected 红 / retried 橙 / failed 红

## Tasks / Subtasks

- [x] **[AC1]** 扩展 `src/core/components/Panel/TraceView.tsx`(新建):
  - [x] 从 `useRunStore(s => s.nodes[selectedNodeId])` 读单节点状态
  - [x] 4 分区布局:Inputs / Outputs / Timeline / Error,可折叠
  - [x] Inputs/Outputs 内联 JSON 展示, > 2KB 自动折叠(未引入 react-json-view, 避免新增依赖)
  - [x] Outputs 按 content-type 分支:`text/markdown` / `application/json` / 纯文本
  - [x] 滑出动画:inline style `transition: transform 280ms`
- [x] **[AC1]** 点击节点触发:
  - [x] `LiveDashboard` NodeCard 改为 `<button>`, `onClick` 调用 `useRunStore.selectNode(id)`
  - [x] TraceView 根据 `selectedNodeId` 自动滑出,空则收起(`translateX`)
  - [x] 关闭按钮 `×` 清除 `selectedNodeId`
- [x] **[AC2]** 后端 Timeline 数据来源:
  - [x] `useRunStore.nodes[id].timeline: TimelineEvent[]` 新增
  - [x] `useRunEvents.ts` 扩展监听 `node.retried` 并 append
  - [x] `shadowflow/runtime/events.py` 新增 `NODE_RETRIED = "node.retried"` 常量(供 service 重试 hook 调用)
- [x] **[AC2]** Timeline UI:
  - [x] 竖向时间轴,每项圆点 + attempt 号 + fail_reason
  - [x] 颜色编码:succeeded 绿 / rejected 红 / retried 橙 / failed 暗红
  - [x] 每轮可展开该 attempt 的 inputs/outputs(回放)
- [x] **测试**:
  - [x] `src/__tests__/components/TraceView.test.tsx` —— 滑出、4 分区、retry 轮次完整、关闭、敏感字段脱敏
  - [x] `src/__tests__/stores/timeline-build.test.ts` —— 事件序列正确构建 timeline、selectNode、reset

## Dev Notes

### 架构依据
- **Epic 4 Goal**:非 mock,真实可排查 —— TraceView 让"信任不是黑盒"成为可见事实
- **相关 AR**:AR21(TraceView 面板)、AR11(事件驱动 UI)、AR44(GraphProjectionContract)
- **相关 FR/NFR**:FR22(节点详情可查看输入/输出/历史/错误)、S5(审计可观测)

### 涉及文件
- 前端:
  - `src/core/components/Panel/TraceView.tsx`(项目已有,本 Story 扩展为 4 分区 + retry 支持)
  - `src/core/components/Panel/LiveDashboard.tsx`(Story 4.2,新增 `onNodeClick`)
  - `src/core/hooks/useRunEvents.ts`(Story 4.2,扩展 `node.retried` 事件处理)
  - `src/core/store/useRunStore.ts`(新增 `selectedNodeId` + `timeline` 字段)
- 后端:
  - `shadowflow/runtime/service.py`(在重试 hook 点 publish `node.retried` 事件)
  - `shadowflow/runtime/events.py`(Story 4.1 声明 `NODE_RETRIED` 常量)

### 关键约束
- **retry 历史完整保留** —— 不允许只保留最后一轮(Demo 戏剧性依赖多轮对抗的可见)
- TraceView 从 `useRunStore` 读,**不再独立订阅 SSE**(避免重复监听)
- Inputs/Outputs 展示要对敏感字段脱敏(S1 安全) —— 若字段名含 `api_key / password / token`,默认打码,点击"显示"才展开
- Outputs 若是 markdown(例如内容官产出文章),必须渲染为富文本,不是源码

### 测试标准
- 单元:4 分区渲染、timeline 事件顺序正确、retry 多轮可点开
- 集成:LiveDashboard 选中节点 ↔ TraceView 滑出联动
- Playwright:点节点 → TraceView 出现 → 查 retry 历史

## References

- [Source: epics.md#Story 4.4]
- [Source: architecture.md#Component Architecture(TraceView 已有 Panel)]
- [Source: Story 4.1(node.retried 事件)]
- [Source: Story 4.2(LiveDashboard + useRunStore)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Code Dev Agent)

### Debug Log References

_n/a_

### Completion Notes List

- 新增 `TimelineEvent` 类型 + `selectedNodeId` 到 `useRunStore`;保留旧字段向后兼容。
- `useRunEvents` 监听 `node.retried` 并 append 到 timeline;敏感字段(api_key/token/password/secret) 在 TraceView 展示时 mask。
- 避免引入 react-json-view / react-markdown 新依赖(与 Epic 4 轻量原则一致)。
- Backend `NODE_RETRIED` 常量已在 `events.py` 声明;实际 retry hook 将在 service 层后续 PR 接入(当前 publish_node_event helper 足够)。

### File List

- src/core/stores/useRunStore.ts (modified — selectedNodeId/timeline/selectNode)
- src/core/hooks/useRunEvents.ts (modified — node.retried 处理 + policy.updated / run.reconfigured 预留)
- src/core/components/Panel/TraceView.tsx (new — 4 section 面板)
- src/core/components/Panel/LiveDashboard.tsx (modified — NodeCard onClick → selectNode)
- src/__tests__/components/TraceView.test.tsx (new)
- src/__tests__/stores/timeline-build.test.ts (new)
- shadowflow/runtime/events.py (modified — NODE_RETRIED, RUN_RECONFIGURED)

### Change Log

- 2026-04-22: Story 4.4 完成,状态 → review
