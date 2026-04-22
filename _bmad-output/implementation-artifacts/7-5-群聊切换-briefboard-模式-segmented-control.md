# Story 7.5: 群聊切换 BriefBoard 模式(Segmented Control)

Status: ready-for-dev
Created: 2026-04-21T07:05:42Z

---

## Story

As a **用户**,
I want **在群聊里一键切换到该群的日报板**,
so that **我能看该项目的今日产出汇总,而不是逐条消息翻**。

---

## Acceptance Criteria

### AC1: Segmented Control 渲染

**Given** 用户在 `ChatPage`(`/chat/{groupId}`)
**When** 页面渲染
**Then** 顶部面包屑下方显示 `ChatBriefBoardToggle`(segmented control):
- 左 `Chat` | 右 `{briefBoardAlias}`(来自当前模板 `template.briefBoardAlias`)
- 样式:`flex rounded-sf bg-white/5 p-0.5`,每段:`px-4 py-1.5 rounded-[10px] text-sm transition-colors`
- 活动段:`bg-shadowflow-accent text-white`;非活动:`text-white/60 hover:text-white/80`
- 默认活动:"Chat"

**And** `briefBoardAlias` 示例:
- Solo Company → "日报"
- Academic Paper → "组会汇报"
- Newsroom → "早报会"
- Modern Startup → "Daily Standup"
- Blank → "BriefBoard"

### AC2: BriefBoard 视图

**Given** 用户点击 BriefBoard / {briefBoardAlias} 段
**When** 切换
**Then** 消息流区域替换为 `BriefBoardView` 组件
**And** BriefBoardView 展示:
- 日期标题 `今日 · {YYYY-MM-DD}`
- Per-agent 产出 feed(每条:`agent 头像 + 名 + kind badge + 产出摘要 + 时间戳`)
- 产出来自该群近期 run 的 `steps` 最终输出(聚合到当天)
**And** 空态:"今天暂无 Agent 产出 · 运行一个工作流开始协作"

### AC3: 上下文保留

**Given** 用户从 Chat 切换到 BriefBoard 再切回 Chat
**When** 切回 Chat
**Then** 消息流滚动位置恢复到切换前的位置(使用 `useRef` 保存 scrollTop)

### AC4: 数据接入

**Given** `GET /api/groups/{groupId}/briefboard?date={YYYY-MM-DD}`
**When** 前端请求
**Then** 返回:
```json
{
  "data": {
    "date": "2026-04-21",
    "entries": [
      {
        "agent_name": "SectionWriter",
        "agent_kind": "acp",
        "summary": "完成引言章节 1200 字...",
        "timestamp": "2026-04-21T10:30:00Z"
      }
    ]
  }
}
```
- 数据来源:该 groupId 关联的 run steps 的最终输出,按当天日期聚合

---

## Tasks / Subtasks

### 前端

- [ ] **[AC1]** 新建 `src/core/components/inbox/ChatBriefBoardToggle.tsx`
  - [ ] Props: `{ briefBoardAlias: string; activeTab: 'chat' | 'briefboard'; onChange: (tab) => void }`
  - [ ] Segmented control UI(见 AC1 样式)

- [ ] **[AC2]** 新建 `src/core/components/inbox/BriefBoardView.tsx`
  - [ ] Props: `{ groupId: string; date?: string }`
  - [ ] 调 `GET /api/groups/{groupId}/briefboard?date={today}` 拉取数据
  - [ ] Per-agent feed 渲染
  - [ ] 空态(见 AC2)

- [ ] **[AC1-AC3]** 更新 `ChatPage.tsx`(Story 7.4)
  - [ ] 引入 `ChatBriefBoardToggle`
  - [ ] `useState<'chat' | 'briefboard'>('chat')` 管理视图切换
  - [ ] 消息区条件渲染:`<MessageFlowView>` 或 `<BriefBoardView>`
  - [ ] `useRef<HTMLDivElement>` 保存消息流 scrollTop,切换时保存/恢复
  - [ ] 从 `useInboxStore.currentTemplate.briefBoardAlias` 读取 alias

- [ ] **[AC4]** 扩展 `src/api/groupApi.ts`
  - [ ] `fetchBriefBoard(groupId, date): Promise<BriefBoardData>`

### 后端

- [ ] 新增 `GET /api/groups/{group_id}/briefboard?date=` endpoint(在 `shadowflow/api/groups.py`)
  - [ ] 按 date 过滤该 group 关联 runs 的 step outputs
  - [ ] `BriefBoardEntry`:` { agent_name, agent_kind, summary, timestamp }`
  - [ ] 若无关联 run,返回空 entries

### 测试

- [ ] `ChatBriefBoardToggle.test.tsx`:初始 Chat 激活 / 点击切换
- [ ] `BriefBoardView.test.tsx`:MSW mock brieftboard endpoint / 空态渲染
- [ ] `ChatPage.test.tsx`:切换到 BriefBoard 再切回,滚动位置 ref 保存(mock scroll)

---

## Dev Notes

### 前置

- **Story 7.4 必须完成**:`ChatPage` 骨架已存在

### 涉及文件

**前端新增**:
- `src/core/components/inbox/ChatBriefBoardToggle.tsx`
- `src/core/components/inbox/BriefBoardView.tsx`

**前端修改**:
- `src/pages/ChatPage.tsx`(引入 toggle + 条件渲染)
- `src/api/groupApi.ts`(扩展 briefboard 接口)

**后端修改**:
- `shadowflow/api/groups.py`(新增 briefboard endpoint)

### 关键约束

- **briefBoardAlias 来自模板**:从 `template.brief_board_alias` 读,不硬编码。每个模板的别名不同是设计意图。
- **滚动位置保留**:用 `useRef` 保存 `scrollTop`,不用 state(避免触发重渲染)。
- **BriefBoard 数据 MVP 来源**:从 run step outputs 聚合,不需要独立聊天记录存储。

## References

- [Source: epics-addendum-2026-04-16.md#Story 7.5]
- [Source: Story 7.4 (ChatPage 骨架)]
- [Source: epics-addendum-2026-04-16.md#Data Model 补丁 (Template.briefBoardAlias)]

## Dev Agent Record

### Agent Model Used
{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
