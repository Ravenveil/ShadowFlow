# Story 4.2: LiveDashboard 看板组件

Status: done

## Story

As a **Demo 观众(评委/潜在用户)**,
I want **在看板上看到每个节点的实时执行状态(pending/running/succeeded/failed/rejected)**,
so that **6 分钟戏剧 J1 能真实上演,不是 mock,观众一眼看到谁在工作、谁被驳回**。

## Acceptance Criteria

### AC1: 5 状态色标 + 节点渲染

**Given** `src/core/components/Panel/LiveDashboard.tsx` 新增
**When** 挂载到 `/runs/:runId` 独立页或 `/editor` 右下角 split-screen
**Then** 显示当前 run 的所有节点,每个节点有 5 种状态色标:
- `pending` 灰色
- `running` 蓝色带 pulse 动画
- `succeeded` 绿色
- `failed` 红色
- `rejected` 红色闪烁(3 次后转稳态红边)

**And** 节点间消息流以浮动箭头动画展示(FR20)
**And** 状态切换动画 ≤ 300ms,视觉平滑无卡顿

### AC2: Zustand selector 精确订阅

**Given** `useRunStore`(单一 run 状态仓)维护 `nodes: Record<nodeId, NodeState>`
**When** SSE 收到单个节点状态变更事件
**Then** 用 Zustand selector `useRunStore(s => s.nodes[nodeId])` 精确订阅,**只重渲染该节点**
**And** 其他节点 React.memo 不触发重渲染
**And** 8 节点规模下,单次事件处理 CPU ≤ 5ms(浏览器 Performance 面板验证)

## Tasks / Subtasks

- [x] **[AC1]** 新建 `src/core/components/Panel/LiveDashboard.tsx`:
  - [x] 布局:NodeCard 卡片网格 + run 头部 badge + 驳回日志
  - [x] 订阅 `useRunStore` 拿 `run_id / nodes / violations`
  - [x] 节点样式由 `NodeState.status` 驱动:tailwind class 映射 5 状态色标
  - [x] 边动画:running 节点 animate-pulse 覆盖
- [x] **[AC1]** 新增 `src/core/components/Node/` 下缺失的 ReactFlow 节点类型:
  - [x] `AgentNode`(基础 agent,显示 label + agent_id + 状态图标)
  - [x] `ApprovalGateNode`(已存在 Epic 3)
  - [x] `BarrierNode`(已存在 Epic 3)
- [x] **[AC2]** `src/core/hooks/useRunEvents.ts`:
  - [x] 基于 SseClient + Last-Event-ID 重连(Story 4.1)
  - [x] 按 `event.type` 分发到 `useRunStore` action
  - [x] 保留 `onFallback` / `onEvent` 回调向后兼容
- [x] **[AC2]** `useRunStore`(Zustand + immer):
  - [x] state:`{ run_id, nodes: Record<string, NodeState>, violations: PolicyViolationRecord[] }`
  - [x] actions:`setNodeStatus / setNodeOutput / setNodeError / recordPolicyViolation / reset`
  - [x] immer 浅合并,未变节点引用不变
- [x] **测试**:
  - [x] `__tests__/components/LiveDashboard.test.tsx` — 8 个测试，状态 class 和 data-status 验证
  - [x] `__tests__/stores/useRunStore.test.ts` — 8 个测试，selector 精确性 + 节点隔离

## Dev Notes

### 架构依据
- **Epic 4 Goal**:实时看板支撑 6 分钟 Demo 戏剧性 —— 节点 pending→running→驳回的可视化必须精确、肉眼可辨
- **相关 AR**:AR21(LiveDashboard 面板)、AR44(GraphProjectionContract 确保 Runtime 图和 ReactFlow 显示图一致)
- **相关 FR/NFR**:FR6(实时事件流)、FR20(消息流箭头动画)、P4(≤ 500ms 端到端)、A1(动画 ≤ 300ms)

### 涉及文件
- 前端:
  - `src/core/components/Panel/LiveDashboard.tsx`(本 Story 新建)
  - `src/core/components/Node/AgentNode.tsx` / `ApprovalGateNode.tsx` / `BarrierNode.tsx`(若 Epic 3 未覆盖则本 Story 补齐)
  - `src/core/hooks/useRunEvents.ts`(SSE → store 分发)
  - `src/core/store/useRunStore.ts`(Zustand)
  - `src/adapter/sseClient.ts`(Story 4.1 已落地)
- 依赖:
  - Story 4.1 的 SSE 通道(**Epic 4 基石**,必须先 merge)
  - Epic 3 的 ReactFlow 基础节点类型

### 关键约束
- **Zustand selector 精确订阅**(Story 4.2 核心) —— 不触发全局重渲染,否则 8 节点 × 每秒 20 事件会卡顿
- `GraphProjectionContract`(AR44)—— Runtime 图结构和 ReactFlow 显示图必须双向一致,node_id / edge_id 一一对应
- 状态色标必须与 Story 4.3 驳回 toast 视觉语言一致(红色一致指驳回/失败)
- ReactFlow `onlyRenderVisibleElements` 开启(为 Phase 3 大模板留余地)

### 测试标准
- 单元:status 切换渲染 class 正确
- 性能:Zustand selector 精确订阅(render count 验证)
- Playwright E2E 覆盖 J1 双驳回(配合 Story 4.3)

## References

- [Source: epics.md#Story 4.2]
- [Source: architecture.md#Frontend Architecture(Zustand + ReactFlow)]
- [Source: architecture.md#Performance Optimization(只重渲染变化节点)]
- [Source: Story 4.1(SSE 事件通道)]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List

### Change Log

- 2026-04-22: Code review (Chunk B / 前端) 完成，发现 0 Decision / 1 Patch / 3 Defer，状态 → in-progress
- 2026-04-22: Chunk B P1 BLOCKER (run.reconfigured 分支) 应用，所有 patch [x]，状态 → done

### Review Findings

Code review 2026-04-22 · Chunk B 前端 (Epic 4 合批) · 3 层并行评审 (Blind / EdgeCase / AcceptanceAuditor)。

#### Patch

- [x] **[Review][Patch] BLOCKER · 4.6 AC4 · `run.reconfigured` 事件无处理分支 — LiveDashboard 拓扑永远不更新** [`src/core/hooks/useRunEvents.ts`] — `handleEvent` 已注册 `run.reconfigured` 监听器，但无对应 `if (type === 'run.reconfigured')` 分支；事件被丢弃，节点增删不反映到 store，LiveDashboard 图拓扑不更新。需新增分支：对 `new_nodes` 调用 `setNodeStatus(id, 'pending')`，对 `removed_nodes` 从 store 移除或标记。

#### Deferred

- [x] **[Review][Defer] Zustand actions 从 `getState()` 解构不在 `useCallback` 依赖数组** [`src/core/hooks/useRunEvents.ts`] — Zustand `getState()` actions 是稳定引用，实际安全；pre-existing 全项目模式，不引入新风险。
- [x] **[Review][Defer] `'*'` 通配符 + 命名 handler 导致 `handleEvent` 被双路调用** [`src/core/hooks/useRunEvents.ts`] — 每个命名 SSE 事件实际触发两次 `handleEvent`（store 写入幂等，无数据错误，但有冗余开销）；需改动 SseClient 架构，留独立故事。
- [x] **[Review][Defer] `violations` 数组无上界增长** [`src/core/stores/useRunStore.ts`] — 长时间 run 中持续 append，内存线性增长；pre-existing 问题，deferred-work 已记录相关条目。
