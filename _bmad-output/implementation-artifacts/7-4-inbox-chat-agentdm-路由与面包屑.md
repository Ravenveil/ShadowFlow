# Story 7.4: Inbox → Chat / AgentDM 路由与面包屑

Status: ready-for-dev
Created: 2026-04-21T07:05:42Z

---

## Story

As a **用户**,
I want **从 Inbox 点击群聊 / 单聊条目能跳到对应视图,并能回到 Inbox**,
so that **四视图之间的切换流畅无感**。

---

## Acceptance Criteria

### AC1: Inbox 右侧预览更新(点击群聊)

**Given** 用户在 Inbox 列表点击一个群聊条目
**When** 点击发生
**Then** `PreviewPane` 更新显示该群聊内容:
- 顶部指标条槽位(4 胶囊)激活:**填充真实数据**(`group.metrics.activeRuns / pendingApprovalsCount / costToday / members`)
- 中部 APPROVAL GATE 面板槽位:展示该群 pending approvals 列表(Story 7.7 完整实现,本 Story 激活槽位 + 传 groupId)
- 底部最近消息槽位:**显示最近 3 条消息**(`GET /api/groups/{groupId}/messages?limit=3`)
**And** 选中条目左侧 3px 紫色 border 高亮
**And** `useInboxStore` 更新 `selectedGroupId`

### AC2: 指标条(MetricsBar)

**Given** PreviewPane 顶部指标条槽位激活
**When** 渲染
**Then** `GroupMetricsBar.tsx` 组件:4 胶囊横排
- `Active Runs: N`(绿色 `#22C55E` 数字)
- `Pending Approvals: N`(橙色 `#F59E0B` 数字,若 0 显示灰)
- `Cost Today: $X.XX`(白色)
- `Members: N`(白色,agents + humans 合计)
**And** 胶囊样式:`px-3 py-1.5 rounded-sf bg-white/5 text-xs font-mono flex gap-1.5 items-center`

### AC3: 最近消息预览

**Given** 前端调 `GET /api/groups/{groupId}/messages?limit=3`
**When** 渲染最近 3 条消息
**Then** 每条消息行:
- 发送者头像(24×24 圆形)
- 发送者名(bold 12px)
- 消息内容(截断 2 行,`text-white/70 text-xs`)
- 时间戳(mono 10px `text-white/40`)
**And** 底部 "打开完整群聊 →"(紫色文字按钮)→ 跳 `/chat/{groupId}`

### AC4: 跳转到 ChatPage

**Given** 用户点击"打开完整群聊 →"按钮 或 双击 Inbox 列表项
**When** 导航触发
**Then** 跳转 `/chat/{groupId}`
**And** `ChatPage`(新建,本 Story 最小实现):
- 顶部面包屑 `Inbox / {groupName}`(可点"Inbox"返回 `/` 根路径)
- 消息流区域(暂用占位文案"群聊视图 · Story 7.5 完整实现")
- 上部显示 `GroupMetricsBar`(复用 AC2 组件)

### AC5: 跳转到 AgentDM

**Given** 用户在 Inbox 列表点击 AGENT DMs 下的单聊条目
**When** 点击发生
**Then** 跳转 `/agent-dm/{agentId}`
**And** `AgentDMPage`(新建,本 Story 最小实现):
- 顶部面包屑 `Inbox / {agentName}`(可点返回 `/`)
- 消息流占位文案"单聊视图 · Phase 2 完整实现"
- Agent info 条:`kind / model / status`

### AC6: 路由注册

**Given** `src/App.tsx` Router Shell(Story 7.1 建立)
**When** 本 Story 落地
**Then** 新增路由:
- `/chat/:groupId` → `<ChatPage />`
- `/agent-dm/:agentId` → `<AgentDMPage />`
**And** 两个页面用 `React.lazy` 懒加载

---

## Tasks / Subtasks

### 前端

- [ ] **[AC1-AC2]** 更新 `PreviewPane.tsx`(Story 7.1 骨架)
  - [ ] 接收 `selectedGroupId: string | null` from `useInboxStore(s => s.selectedGroupId)`
  - [ ] 非空时激活 3 个槽位,渲染 `GroupMetricsBar` + Approval 槽 + 消息槽

- [ ] **[AC2]** 新建 `src/core/components/inbox/GroupMetricsBar.tsx`
  - [ ] Props: `{ metrics: GroupMetrics }`
  - [ ] 4 胶囊横排(见 AC2)

- [ ] **[AC3]** 前端调 `GET /api/groups/{groupId}/messages?limit=3`
  - [ ] 新建 `src/api/groupApi.ts`(若 Story 7.3 已建则扩展)
  - [ ] `fetchRecentMessages(groupId, limit): Promise<Message[]>`
  - [ ] 结果存入 `useInboxStore.recentMessages[groupId]`

- [ ] **[AC3]** 新建 `src/core/components/inbox/RecentMessagesPreview.tsx`
  - [ ] Props: `{ messages: Message[]; onOpenChat: () => void }`
  - [ ] 3 条消息行 + "打开完整群聊 →"按钮

- [ ] **[AC4]** 新建 `src/pages/ChatPage.tsx`(最小实现)
  - [ ] 读 `useParams({ groupId })`
  - [ ] 顶部 `BreadcrumbBar.tsx`:`<Inbox /> / {groupName}`(Inbox 可点 navigate('/'))
  - [ ] `GroupMetricsBar` 组件复用
  - [ ] 消息流占位(Story 7.5 完善)

- [ ] **[AC5]** 新建 `src/pages/AgentDMPage.tsx`(最小实现)
  - [ ] 读 `useParams({ agentId })`
  - [ ] 顶部 `BreadcrumbBar.tsx`:`<Inbox /> / {agentName}`
  - [ ] Agent info 条 + 消息流占位

- [ ] **[AC6]** 更新 `src/App.tsx`
  - [ ] `React.lazy` import `ChatPage` / `AgentDMPage`
  - [ ] 新增 Route `/chat/:groupId` + `/agent-dm/:agentId`

- [ ] **[AC1]** 更新 `MessageItem.tsx`(Story 7.2)
  - [ ] `onClick` prop 实现:群聊 → 更新 `useInboxStore.selectedGroupId`(显示预览);双击 → `navigate('/chat/{id}')`
  - [ ] 单聊 → `navigate('/agent-dm/{agentId}')`

### 后端

- [ ] 新建 `GET /api/groups/{group_id}/messages?limit=3` endpoint(在 `shadowflow/api/groups.py`)
  - [ ] 从 `CheckpointStore` 读取该 group 近期 run 的 agent 输出,组装为 `Message` 列表
  - [ ] `Message`:` { sender_name, sender_kind, content, timestamp }`
  - [ ] 无真实聊天记录时返回空列表(MVP 从 run steps 取最近 agent 输出作为消息)

### 测试

- [ ] `PreviewPane.test.tsx`:传 `selectedGroupId` → 3 槽位显示(不显示空态)
- [ ] `ChatPage.test.tsx`:面包屑"Inbox"可点返回
- [ ] 路由测试:`/chat/test-id` 命中 ChatPage(MemoryRouter)

---

## Dev Notes

### 前置

- **Story 7.1**:Router Shell + PreviewPane 骨架(3 槽位)
- **Story 7.2**:MessageItem + `useInboxStore.selectedGroupId`

### 涉及文件

**前端新增**:
- `src/pages/ChatPage.tsx`
- `src/pages/AgentDMPage.tsx`
- `src/core/components/inbox/GroupMetricsBar.tsx`
- `src/core/components/inbox/RecentMessagesPreview.tsx`
- `src/core/components/inbox/BreadcrumbBar.tsx`

**前端修改**:
- `src/App.tsx`(新增 2 路由)
- `src/core/components/inbox/PreviewPane.tsx`(激活槽位)
- `src/core/components/inbox/MessageItem.tsx`(onClick 逻辑)
- `src/core/store/useInboxStore.ts`(selectedGroupId + recentMessages)

**后端修改**:
- `shadowflow/api/groups.py`(新增 messages endpoint)

### 关键约束

- **ChatPage MVP 最小实现**:消息流占位即可,完整聊天功能 Phase 2。本 Story 核心价值是路由 + 面包屑 + 预览激活。
- **双击 vs 单击**:单击 Inbox 条目 → 右侧预览更新(不跳路由);双击 → 跳 `/chat/{id}`。UX 一致性:单击代价低,双击才进入专注模式。
- **消息数据 MVP 来源**:从 run steps 取 agent 最近输出作为"消息",不需要真实聊天室 DB。

## References

- [Source: epics-addendum-2026-04-16.md#Story 7.4]
- [Source: Story 7.1 (Router Shell + PreviewPane)]
- [Source: Story 7.2 (MessageItem + useInboxStore)]
- [Source: architecture.md#Frontend Architecture (React Router v6 懒加载)]

## Dev Agent Record

### Agent Model Used
{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
