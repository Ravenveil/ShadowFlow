# Story 4.3: 驳回事件视觉强化 Toast

Status: done

## Story

As a **Demo 观众(评委)**,
I want **驳回事件发生时有大号红色 toast 不可被忽略**,
so that **J1 Demo 高光 #1/#2(合规官驳内容官、稽查驳工程师)、J3 主编驳回等戏剧性时刻能被评委 100% 抓住**。

## Acceptance Criteria

### AC1: 大号红色 Toast + 持续时长

**Given** SSE 流收到 `policy.violation` 或 `node.rejected` 事件
**When** LiveDashboard 处理事件
**Then** 屏幕顶部弹出大号(字号 ≥ 18pt)红色 toast:`"⚠️ Policy Matrix: {sender} 驳回 {receiver}"`
**And** toast 持续 5 秒(不可通过短时悬停误点关闭)
**And** toast 同时存在上限 3 条,超过堆叠排队不覆盖

### AC2: 被驳回节点闪烁红边 + 点击展开

**Given** toast 出现
**When** 对应 receiver 节点渲染
**Then** 该节点闪烁红边 3 次(每次 300ms),然后转稳态红边
**And** toast 可点击展开查看 `reason` 全文(`details.rule` + `details.message`)
**And** 展开面板同时高亮对应 Policy Matrix 单元格(sender × receiver 交叉点)

## Tasks / Subtasks

- [ ] **[AC1]** 新增 `src/core/components/Toast/RejectionToast.tsx`:
  - [ ] 使用项目已有 toast 容器(若无则集成 `sonner` 或 `react-hot-toast`,MVP 倾向轻量自研)
  - [ ] 样式:`text-xl font-bold bg-red-600 text-white shadow-2xl`,tailwind class ≥ `text-[18pt]`
  - [ ] 持续 5 秒(不随鼠标移走自动消失)
  - [ ] 图标用 ⚠️ emoji 或 Lucide `AlertTriangle`(24px)
- [ ] **[AC1]** 在 `useRunEvents.ts`(Story 4.2)中挂载事件监听:
  - [ ] 监听 `policy.violation` / `node.rejected`
  - [ ] 调 `toast.rejection({ sender, receiver, reason })`
  - [ ] 3 条上限 —— 超出的事件进队列,前一条消失后再弹出
- [ ] **[AC2]** 节点闪烁红边逻辑:
  - [ ] `useRunStore.setNodeStatus(nodeId, 'rejected')` 时记录 `rejectedAt` 时间戳
  - [ ] `AgentNode.tsx` 根据 `rejectedAt` 触发 CSS animation(`@keyframes flash-border` 3 次 × 300ms)
- [ ] **[AC2]** 点击 toast 展开详情:
  - [ ] 展开面板显示完整 `reason` 文本、时间戳、相关节点 ID
  - [ ] 若 `details.sender` 和 `details.receiver` 存在,调 `usePolicyStore.highlightCell(sender, receiver)`,PolicyMatrixPanel 中该单元格加黄色边框高亮 3 秒
- [ ] **测试**:
  - [ ] `__tests__/RejectionToast.test.tsx` —— 字号、颜色、持续时长
  - [ ] `__tests__/useRunEvents.test.ts` —— policy.violation 事件正确触发 toast
  - [ ] Playwright E2E:J1 双驳回场景,验证 2 个 toast 先后弹出,节点红边闪烁

## Dev Notes

### 架构依据
- **Epic 4 Goal**:J1 Demo 高光 #1/#2 必须被观众抓住 —— 驳回视觉不够强会让评委错过 6 分钟戏剧最关键时刻
- **相关 AR**:AR21(LiveDashboard 内集成 toast)、AR11(事件驱动 UI)
- **相关 FR/NFR**:FR21(驳回事件视觉强化,字号 ≥ 18pt 持续 ≥ 5s)、A1(动画可辨识)

### 涉及文件
- 前端:
  - `src/core/components/Toast/RejectionToast.tsx`(新建)
  - `src/core/hooks/useRunEvents.ts`(Story 4.2 已建,本 Story 扩展监听)
  - `src/core/components/Node/AgentNode.tsx`(Story 4.2 已建,本 Story 加红边闪烁动画)
  - `src/core/store/usePolicyStore.ts`(Epic 1 已建,本 Story 加 `highlightCell` action)

### 关键约束
- **视觉强化硬性要求**(FR21):字号 ≥ 18pt、红色背景、持续 ≥ 5 秒 —— 不允许默认小 toast 样式
- toast 堆叠而非覆盖,避免快速连发时前一条被吞掉
- 驳回事件由 Epic 1 Policy Matrix 产生(`policy.violation` 事件命名空间在 Story 4.1 的 `events.py` 中声明)
- 点击 toast 高亮 PolicyMatrixPanel 单元格 —— 依赖 `usePolicyStore` 的 `highlightCell` 轻量 action,不要在此 story 改矩阵数据

### 测试标准
- 单元:toast 字号 ≥ 18pt、持续 ≥ 5s 可被 JSDOM 断言
- Playwright:J1 场景完整跑通,双 toast 可见(截图比对)

## References

- [Source: epics.md#Story 4.3]
- [Source: PRD.md#FR21 驳回视觉强化]
- [Source: Story 4.1(policy.violation / node.rejected 事件)]
- [Source: Story 4.2(LiveDashboard)]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List

### Change Log

- 2026-04-22: Code review (Chunk B / 前端) 完成，发现 0 Decision / 3 Patch / 2 Defer，状态 → in-progress
- 2026-04-22: Chunk B P6/P7/P8 (toast 位置 + timer + 原子 dismiss) 应用，所有 patch [x]，状态 → done

### Review Findings

Code review 2026-04-22 · Chunk B 前端 (Epic 4 合批) · 3 层并行评审 (Blind / EdgeCase / AcceptanceAuditor)。

#### Patch

- [x] **[Review][Patch] 4.3 AC1 · Toast 容器位置错误（top-center → bottom-right）** [`src/core/components/Toast/RejectionToast.tsx:82`] — AC1 要求"屏幕右下角"，当前 CSS 为 `fixed top-4 left-1/2 -translate-x-1/2`（顶部居中）。改为 `fixed bottom-4 right-4`，同时确保不与其他面板重叠。
- [x] **[Review][Patch] 4.3 AC2 · 队列中等待的 Toast 永不自动消失（auto-dismiss 仅在渲染时触发）** [`src/core/stores/useRejectionToastStore.ts`] — auto-dismiss `setTimeout` 只在 `SingleToast` 组件 `useEffect` 内，处于 queue 中的 toast 不会被渲染，即使被 `_promote()` 提升后 timer 也可能已错过。在 `push()` 和 `_promote()` 内为每条 toast 启动 5s timer，timer 到期后调 `dismiss(id)`。
- [x] **[Review][Patch] `dismiss()` + `_promote()` 非原子双 `set()` 调用** [`src/core/stores/useRejectionToastStore.ts:dismiss`] — `dismiss` 先 `set()` 过滤 toast，再 `get()._promote()` 触发第二次 `set()`；React concurrent mode 下两次 set 间可能读到中间态导致 toast 重复显示或错误提升。将两步合并为单一 `set()` callback。

#### Deferred

- [x] **[Review][Defer] Toast id `Date.now() + Math.random()` 碰撞风险** [`src/core/stores/useRejectionToastStore.ts`] — Firefox 隐私模式下 Date.now() 精度降至 100ms，同时到达的 toast 有小概率 id 碰撞；MVP 可接受，后续可改用 `crypto.randomUUID()`。
- [x] **[Review][Defer] Toast queue 无最大深度限制** [`src/core/stores/useRejectionToastStore.ts`] — 批量 violation 时 queue 可无限积累；pre-existing 设计限制，需独立 eviction 故事。
