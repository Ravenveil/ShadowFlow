# Story 7.6: 搜索 + Tab 过滤

Status: ready-for-dev
Created: 2026-04-21T07:05:42Z

---

## Story

As a **用户**,
I want **在 Inbox 顶部搜索群聊 / agent / 消息内容**,
so that **群多之后还能快速找到**。

---

## Acceptance Criteria

### AC1: 搜索框联动

**Given** `MessageList` 顶部搜索框(Story 7.1 建立,原为静态 input)
**When** 用户在搜索框输入关键词(防抖 300ms)
**Then** 消息列表实时过滤,展示匹配条目:
- 匹配规则:**任意字段命中**即显示:
  - group/agent `name`(模糊匹配,大小写不敏感)
  - `lastMessage.content`(子串匹配)
- 匹配到的关键词在列表项中**高亮**(黄色背景 `bg-yellow-400/20`,不破坏现有 MessageItem 样式)
**And** 搜索时 Tab 过滤仍然生效(搜索 × Tab 双重过滤,AND 逻辑)

### AC2: 空态

**Given** 搜索关键词无匹配,或 Tab 过滤后列表为空
**When** 渲染
**Then** 空态展示:
- 图标(搜索 icon SVG,白色 30%)
- 主文案:"没有匹配的会话"(白色 70%)
- 副文案:若有搜索词显示 `"未找到 '{keyword}'"`;若无搜索词显示"还没有会话"
- 引导按钮:"+ 新群聊"(紫色 `#A78BFA` 文字链接 → 触发 Story 7.3 Dialog)

### AC3: 搜索框交互

**Given** 搜索框有内容
**When** 渲染
**Then** 右侧显示清除按钮 × 图标(click → 清空 input + 重置过滤)

**Given** 键盘 `Escape` 键
**When** 搜索框聚焦时按 Escape
**Then** 清空搜索词 + 搜索框 blur

**Given** 键盘 `Cmd/Ctrl + K` 全局快捷键(Inbox 页范围)
**When** 按下
**Then** 聚焦搜索框

### AC4: Tab 过滤增强(延续 Story 7.2)

**Given** 4 Tab 已有"全部 / 单聊 / 群聊 / 未读"(Story 7.2 实现)
**When** 用户切 Tab
**Then** Tab 右侧显示该 Tab 下的条目数量 badge(灰色小字,如 `群聊 (3)`)
**And** "未读"Tab badge 显示未读总数(所有未读 unreadCount 之和,橙色当 > 0)

---

## Tasks / Subtasks

### 前端

- [ ] **[AC1-AC3]** 扩展 `MessageList.tsx`
  - [ ] 搜索框升级:加 `value` 受控 + `onChange` handler + 防抖 300ms(`useDebounce` hook)
  - [ ] 清除按钮(输入非空时显示):
    ```tsx
    {searchText && (
      <button onClick={() => setSearchText('')} className="...">×</button>
    )}
    ```
  - [ ] 过滤逻辑:`filteredItems = allItems.filter(item => matchesSearch(item, searchText) && matchesTab(item, activeTab))`
  - [ ] 关键词高亮:`HighlightText.tsx` 组件(将 text 按 keyword split,高亮命中部分)

- [ ] **[AC1]** 新建 `src/common/hooks/useDebounce.ts`(若项目中无该 hook)
  - [ ] `function useDebounce<T>(value: T, delay: number): T`

- [ ] **[AC2]** 新建 `src/core/components/inbox/InboxEmptyState.tsx`
  - [ ] Props: `{ keyword?: string; onCreateGroup: () => void }`
  - [ ] 空态 UI(见 AC2)

- [ ] **[AC3]** 搜索框 Escape / Cmd+K 快捷键
  - [ ] `useEffect` 注册 `keydown` 监听:`Escape` → 清空 + blur;`Meta+K / Ctrl+K` → focus searchInput
  - [ ] `useRef<HTMLInputElement>` 引用搜索框
  - [ ] 全局快捷键仅在 InboxPage 范围内生效(组件 mount 时注册,unmount 时清理)

- [ ] **[AC4]** Tab 条目数 badge
  - [ ] 在 `MessageList` 内计算各 Tab 条目数:
    - 全部:`groups.length + agentDMs.length`
    - 单聊:`agentDMs.length`
    - 群聊:`groups.length`
    - 未读:`items.filter(i => i.unreadCount > 0).length`(橙色当 > 0)
  - [ ] Tab 文字后加 badge:`<span className="ml-1 text-[10px] text-white/40">{count}</span>`(未读用 `text-shadowflow-warn`)

### 测试

- [ ] `MessageList.test.tsx`:
  - [ ] 输入关键词 → 列表过滤正确
  - [ ] 无匹配 → 空态组件渲染
  - [ ] 清除按钮 → 重置列表
  - [ ] Escape 键 → 清空搜索
  - [ ] Tab + 搜索 AND 逻辑:Tab="群聊" + 搜索"PI" → 仅群聊中 name 含 PI 的条目

---

## Dev Notes

### 前置

- **Story 7.2 必须完成**:`useInboxStore.groups / agentDMs` 数据已就位;Tab 过滤基础逻辑已建立

### 涉及文件

**前端新增**:
- `src/core/components/inbox/InboxEmptyState.tsx`
- `src/common/hooks/useDebounce.ts`(若不存在)

**前端修改**:
- `src/core/components/inbox/MessageList.tsx`(搜索联动 + Tab badge)
- `src/core/components/inbox/MessageItem.tsx`(关键词高亮传入)

### 关键约束

- **前端纯本地过滤**:搜索不发网络请求,对已加载的 `useInboxStore.groups + agentDMs` 本地过滤。群多时 O(N) 扫描可接受(MVP ≤ 100 个群)。
- **关键词高亮不破坏 MessageItem**:`HighlightText` 组件只接受字符串,返回 ReactNode(span 包裹),MessageItem 不感知高亮逻辑。
- **Cmd+K 只在 Inbox 页**:全局监听但组件 unmount 时 `removeEventListener`,不影响 Editor / Archive 等页面。
- **防抖 300ms**:与 Epic 3 前端校验防抖保持一致(project-context §验证时机 onChange 防抖 300ms)。

## References

- [Source: epics-addendum-2026-04-16.md#Story 7.6]
- [Source: Story 7.2 (useInboxStore + MessageItem + Tab 过滤基础)]
- [Source: Story 7.3 (+ 新群聊引导按钮)]

## Dev Agent Record

### Agent Model Used
{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
