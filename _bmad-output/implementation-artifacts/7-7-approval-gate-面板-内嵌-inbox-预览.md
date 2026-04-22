# Story 7.7: APPROVAL GATE 面板(内嵌 Inbox 预览)

Status: ready-for-dev
Created: 2026-04-21T07:05:42Z

---

## Story

As a **用户**,
I want **在 Inbox 右侧预览就能通过/驳回待审议条目**,
so that **我不用进到群聊里就能处理审批,降低决策摩擦**。

---

## Acceptance Criteria

### AC1: PreviewPane 指标条填充

**Given** 用户选中一个群聊(Story 7.4 激活 PreviewPane)
**When** `ApprovalGatePanel` 挂载
**Then** PreviewPane 顶部指标条(`GroupMetricsBar`)展示真实数据 + 实时更新:
- `Active Runs`:当前 `status ∈ { running, paused }` 的 run 数
- `Pending Approvals`:未决 ApprovalGate 数(橙色 `#F59E0B` 当 > 0)
- `Cost Today`:当天所有 run 的 token cost 合计(格式 `$X.XX`,MVP 用 token count 代替真实价格)
- `Members`:agents + human members 合计
**And** 指标通过 SSE `approval.*` 事件和 `run.*` 事件驱动增量更新(不 5s polling)

### AC2: APPROVAL GATE 面板

**Given** 选中的群聊有待审议条目(`pendingApprovalsCount > 0`)
**When** PreviewPane APPROVAL GATE 槽位渲染
**Then** `ApprovalGatePanel.tsx` 显示:
- 面板 header:`APPROVAL GATE` 标题(10px mono 大写)+ `N pending`(橙色)
- 最多 5 条待审议条目(按等待时间 FIFO 排序,oldest first),每条:
  - 提交者 agent 头像(24×24)+ 名字(bold 12px)+ kind badge
  - 摘要引用段(≤ 120 字,`text-white/70 text-xs`,truncate 2 行)
  - 等待时间(如 `3m ago`,橙字当 > 5 分钟)
  - [通过] 按钮(绿色 `bg-green-500/80 hover:bg-green-500`,`text-white text-xs px-2 py-1 rounded-[6px]`)
  - [驳回] 按钮(红色 `bg-red-500/80 hover:bg-red-500`)

**Given** 超过 5 条
**Then** 底部显示 "+ {N-5} more →" 链接,跳 `/runs/{run_id}#approval-{gate_id}`(Story 4.7/4.8)

**Given** 无待审议条目
**Then** 面板显示空态:"✓ 无待处理审批"(绿色文字)

### AC3: 通过/驳回交互

**Given** 用户点击[通过]按钮
**When** 按钮触发
**Then** 前端调 `POST /api/approvals/{approval_id}/approve`
**And** 按钮变为 loading spinner + disabled(防止重复点击)
**And** 成功后:Toast "✓ 已通过审批",该条目从面板移除
**And** 错误时:Toast "✗ 操作失败:{reason}"

**Given** 用户点击[驳回]按钮
**When** 按钮触发
**Then** 弹出 mini dialog(inline,不是全屏模态):
- 文本区"驳回原因(可选)"(占位符 "说明驳回原因...")
- [确认驳回] / [取消] 按钮
- [确认驳回] → `POST /api/approvals/{id}/reject` body:`{ reason }`
**And** 驳回成功后触发 Story 1.3 真驳回逻辑(runtime 真实执行 `policy_matrix.can_reject`)
**And** SSE `node.rejected` 事件到达后,该条目从面板移除 + 相关 run 条目状态更新(`status → running`)

### AC4: SSE 实时更新

**Given** ApprovalGatePanel 挂载时订阅 SSE
**When** `approval.triggered` 事件到达(新审批出现)
**Then** 面板实时追加新条目(不刷新全页)

**When** `approval.resolved` 事件到达(审批已处理)
**Then** 对应条目从面板移除

**When** `run.started` / `run.completed` 事件到达
**Then** 顶部 `Active Runs` 指标更新

### AC5: 后端 Approvals 端点

**Given** Story 1.2/1.3 已建立 approval_gate + 真驳回逻辑
**When** 本 Story 新增两个端点:
**Then**:
- `POST /api/approvals/{approval_id}/approve`:
  - 调 `RuntimeService` 的 approval decision accept
  - 返回 200 `{ status: 'approved', run_id, gate_id }`
  - 发 SSE `approval.resolved` 事件
- `POST /api/approvals/{approval_id}/reject`:
  - 调 Story 1.3 `RuntimeService.reject(run_id, reviewer_role, target_node_id, reason)`
  - 返回 200 `{ status: 'rejected', run_id, gate_id }`
  - 触发真驳回事件链(`policy.violation` → `node.rejected` → `handoff.triggered`)
- `GET /api/groups/{group_id}/approvals/pending`:
  - 返回该 group 所有 pending ApprovalGate 条目列表
  - 字段:`{ approval_id, run_id, gate_id, submitter_name, submitter_kind, summary, triggered_at, waiting_seconds }`

---

## Tasks / Subtasks

### 前端

- [ ] **[AC1-AC2]** 新建 `src/core/components/inbox/ApprovalGatePanel.tsx`
  - [ ] Props: `{ groupId: string }`
  - [ ] 调 `GET /api/groups/{groupId}/approvals/pending` 加载待审议列表
  - [ ] 订阅 SSE `approval.*` 事件(复用 Story 4.1 `useRunEvents`)
  - [ ] 渲染最多 5 条 + "+ N more →" 链接
  - [ ] 空态(见 AC2)

- [ ] **[AC3]** 每条审批 `ApprovalItem.tsx` 组件
  - [ ] Props: `{ approval: PendingApproval; onApprove: (id) => void; onReject: (id, reason) => void }`
  - [ ] [通过]/[驳回] 按钮 + loading state
  - [ ] 驳回 inline dialog(简单 `div` 绝对定位,不用全屏模态)

- [ ] **[AC3]** 新建 `src/api/approvalApi.ts`
  - [ ] `approveApproval(approvalId): Promise<void>`
  - [ ] `rejectApproval(approvalId, reason: string): Promise<void>`

- [ ] **[AC4]** SSE 订阅
  - [ ] 在 `ApprovalGatePanel` useEffect 中监听 `approval.triggered` → `addItem` / `approval.resolved` → `removeItem`
  - [ ] 监听 `run.started` / `run.completed` → 更新 `GroupMetricsBar`(via `useInboxStore.updateGroupMetrics`)

- [ ] **[AC1]** 更新 `PreviewPane.tsx`(Story 7.4)
  - [ ] APPROVAL GATE 槽位渲染 `<ApprovalGatePanel groupId={selectedGroupId} />`

### 后端

- [ ] **[AC5]** 新增 `shadowflow/api/approvals.py`
  - [ ] `POST /api/approvals/{id}/approve`
  - [ ] `POST /api/approvals/{id}/reject` (body: `{ reason }`)
  - [ ] `GET /api/groups/{group_id}/approvals/pending`
  - [ ] 调用 Story 1.2/1.3 的 `RuntimeService.approve()` / `RuntimeService.reject()`
  - [ ] 挂载 router 到 `shadowflow/server.py`

- [ ] 新增 `tests/test_approvals_api.py`:
  - [ ] approve 成功 200 / approval_id 不存在 404
  - [ ] reject 触发真驳回事件链(mock RuntimeService.reject)

### 测试

- [ ] `ApprovalGatePanel.test.tsx`:
  - [ ] MSW mock `GET /api/groups/{id}/approvals/pending` → 2 条显示
  - [ ] 点[通过] → loading → 成功 → 条目消失
  - [ ] 点[驳回] → inline dialog → 确认 → 条目消失

---

## Dev Notes

### 前置(关键)

- **Story 1.2**:ApprovalGate 节点类型(approval gate 事件结构)
- **Story 1.3**:真驳回逻辑(`RuntimeService.reject()`),本 Story 直接复用
- **Story 4.1**:SSE 事件总线 + `approval.*` 事件命名空间
- **Story 7.4**:PreviewPane 的 APPROVAL GATE 槽位已预留

### 涉及文件

**前端新增**:
- `src/core/components/inbox/ApprovalGatePanel.tsx`
- `src/core/components/inbox/ApprovalItem.tsx`
- `src/api/approvalApi.ts`

**前端修改**:
- `src/core/components/inbox/PreviewPane.tsx`(激活 APPROVAL GATE 槽位)
- `src/core/store/useInboxStore.ts`(扩展 `updateGroupMetrics`)

**后端新增**:
- `shadowflow/api/approvals.py`
- `tests/test_approvals_api.py`

**后端修改**:
- `shadowflow/server.py`(include_router approvals)

### 关键约束

- **真驳回**:驳回必须走 Story 1.3 `RuntimeService.reject()`,不能 Toast 假装驳回(Architecture §6 Policy Matrix 真驳回语义,Project Context §6)
- **SSE 增量更新**:不 polling `/api/groups/{id}/approvals/pending`。`approval.triggered` 推送新条目,`approval.resolved` 移除条目。
- **inline 驳回 dialog**:避免全屏模态打断 Inbox 操作流。用绝对定位 div(相对 ApprovalItem),click outside → 关闭。
- **防重复点击**:通过/驳回按钮触发后立即 disabled + loading,SSE 事件到来才恢复(或 API 返回后恢复,取其先到者)。
- **待审议摘要来源**:从 run step 的最终 agent 输出取前 120 字。若 output 含 Markdown,用 plain text 提取(strip 标记)。

### J3 场景重要性

Story 7.7 是 J3 Demo("现场改制度 3 分钟高光")的收尾:
- J3 = 主编陈姐 → 在 Inbox 右侧预览看到 APPROVAL GATE → 驳回事实核查员的稿件 → runtime 真驳回 → 稿件重写 → 再次通过
- 整个过程在 Inbox 预览中完成,无需进入 ChatPage 或 LiveDashboard
- Demo 价值:一张 Inbox 页 = 审批决策中心,ShadowFlow 区别于"只是执行管道"的核心体验

## References

- [Source: epics-addendum-2026-04-16.md#Story 7.7]
- [Source: Story 1.2 (ApprovalGate 节点类型)]
- [Source: Story 1.3 (RuntimeService.reject — 真驳回)]
- [Source: Story 4.1 (SSE 事件总线 — approval.* 命名空间)]
- [Source: Story 7.4 (PreviewPane APPROVAL GATE 槽位)]
- [Source: project-context.md#6 Policy Matrix 真驳回语义]
- [Source: PRD.md#J3 User Success(3 分钟改制度高光)]

## Dev Agent Record

### Agent Model Used
{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
