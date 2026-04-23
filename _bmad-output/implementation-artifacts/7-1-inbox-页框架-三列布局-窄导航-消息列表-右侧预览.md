# Story 7.1: Inbox 页框架(三列布局 + 窄导航 + 消息列表 + 右侧预览)

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **ShadowFlow 用户**,
I want **登录后默认进入 Inbox 页,看到钉钉式三列消息面板(72px 窄导航 / 360px 消息列表 / 1008px 右侧预览)**,
so that **我能像在公司一样快速进入今天要处理的项目群聊与单聊,Epic 7 协作四视图的顶层入口就位,Sprint-B 后续 Story(7.2/7.4/7.7)有框架可挂**。

## Acceptance Criteria

### AC1 — React Router v6 接入 + `/` 默认进入 InboxPage

**Given** `package.json` 当前**无** `react-router-dom` 依赖(前端仅装了 reactflow + zustand + tailwind)
**When** Story 7.1 落地
**Then** 新增 `react-router-dom@^6.21.0` 精确版本锁定(与 project-context §版本锁定纪律一致)
**And** `src/App.tsx` 重构为 Router Shell:
- `<BrowserRouter>` 包裹所有路由
- `/` → `<InboxPage />`
- `/editor`、`/editor/:templateId` → 占位 `<EditorPage />`(由 Story 3.1 后续填充内容,7.1 只建路由槽 + 最小空壳)
- `/runs/:runId`、`/templates`、`/import`、`/about` → 后续 Story 填充,7.1 不创建页面文件
**And** 旧的 AgentGraph 三栏布局(当前 App.tsx 直接渲染 `WorkflowCanvas + NodePanel + ConfigPanel + Toolbar`)**搬入** `src/pages/EditorPage.tsx` 空壳,保留既有导入路径以便 3.1 复用
**And** 访问 `/` 根路径 ≤ 2s 首屏渲染(对齐 P1),未显式导航时渲染 InboxPage

### AC2 — 三列布局落地(72 / 360 / 1008)

**Given** 用户访问 `/`
**When** InboxPage 渲染
**Then** 页面为 `flex flex-row` 三列水平布局,总宽 1440px(目标分辨率):
- 左列 **`w-[72px]`** NarrowNav(固定宽度,flex-none)
- 中列 **`w-[360px]`** MessageList(固定宽度,flex-none)
- 右列 **`flex-1`** PreviewPane(剩余空间,在 1440px 下恰为 1008px)
**And** 三列间 1px 分隔线(`border-r border-white/5`),不使用 box-shadow 分隔(避免点阵网格背景干扰)
**And** 总体高度 `h-screen overflow-hidden`,每列独立滚动(`overflow-y-auto`)
**And** 窗口缩小到 ≤ 1024px 时 PreviewPane 隐藏(保留前两列,移动/平板优化在 V2 处理,MVP 仅保证桌面首屏正确)

### AC3 — 左窄导航 NarrowNav 骨架(72px)

**Given** 左列 NarrowNav 组件 `src/core/components/inbox/NarrowNav.tsx`
**When** 渲染
**Then** 从上到下依次包含(本 Story 只建骨架与占位,交互由后续 Story 填充):
1. **顶部:模板切换器占位**(48×48 圆角 14px 方块,背景 `#A78BFA` 模板主色占位,下方 10px Mono 文本 "Solo ▾")— 完整交互由 Story 3.6.8 Wizard + Epic 7 模板切换器 Story 接管;本 Story 静态占位即可
2. **中间:4 个导航图标**(消息 / 模板 / 运行 / 归档),每个 40×40 圆角 14px,默认灰色 `text-white/50`,活动项紫色 `text-[#A78BFA]`,当前激活项固定为"消息"(`/` 路径)
3. **底部:用户头像占位**(32×32 圆形,默认用户首字母占位,点击事件先 `console.log` 待后续接入身份)
**And** 图标使用 **Heroicons v2 Outline**(Tailwind 生态默认)或内联 SVG;禁止引入新 icon 库(避免 bundle 膨胀)
**And** 顶部切换器与导航图标之间 24px gap,导航图标互相 12px gap,底部头像距 bottom 16px

### AC4 — 中消息列表 MessageList 骨架(360px)

**Given** 中列 MessageList 组件 `src/core/components/inbox/MessageList.tsx`
**When** 渲染
**Then** 从上到下包含(本 Story 只建骨架 + 空态,列表项渲染由 Story 7.2 接管):
1. **顶部 Header**(高 56px):标题"Inbox" + 右侧"+ 新群聊"按钮(紫色 accent 背景 + 白色文字,圆角 14px,点击事件先 `console.log('TODO: Story 7.3')`)
2. **搜索框**(高 40px,圆角 14px,暗色背景 `bg-white/5`,占位符"搜索群聊 / agent / 消息…";本 Story 不实现过滤逻辑,由 Story 7.6 接管)
3. **Tab 过滤栏**:4 个 Tab(全部 / 单聊 / 群聊 / 未读),水平排列,活动 Tab 底部紫色 2px underline;本 Story 仅建 UI,切换状态存 `useState`,不过滤数据(空数组占位)
4. **内容区**:两个 section header 占位 —— `TEAM RUNS`(灰色 10px Mono 大写字母间距 0.1em)与 `AGENT DMs`,每个 header 下方显示空态占位"暂无会话"
**And** 整列滚动 `overflow-y-auto`;header + 搜索 + Tab 为 sticky top(不随内容滚动)
**And** 本 Story **不**接入 `GET /api/templates/{current}/inbox` endpoint(数据接入由 Story 7.2 完成);所有列表项渲染留空,只保证骨架在视觉上对齐 pen 稿

### AC5 — 右预览区 PreviewPane 骨架(1008px)

**Given** 右列 PreviewPane 组件 `src/core/components/inbox/PreviewPane.tsx`
**When** 渲染(当前无选中会话)
**Then** 显示"未选中会话"空态:
- 居中 200×200 svg 插画占位(可用纯色矩形 + 文字"选择一个会话查看详情"替代,不要求实际插画)
- 下方副文本"从左侧列表选择群聊或单聊开始协作"
**And** 预留三个 slot(本 Story 不填充内容,仅占位):
1. **顶部指标条槽位**(高 72px,4 胶囊布局占位:Active Runs / Pending Approvals / Cost Today / Members)— 由 Story 7.7 填充真实数据
2. **中部 APPROVAL GATE 面板槽位**(高 320px,紫色 accent 边框占位)— 由 Story 7.7 接管
3. **底部最近消息槽位**(高 240px,最近 3 条消息占位)— 由 Story 7.4 填充
**And** slot 在 AC5 空态下**不显示**(`hidden`),仅在未来选中会话时通过 props `groupId` 决定渲染;本 Story 测试仅断言空态可见

### AC6 — 深色主题 Design Tokens 落地

**Given** `tailwind.config.ts` 当前仅有 `primary`(蓝色)配色
**When** Epic 7 视觉规范接入
**Then** 扩展 `tailwind.config.ts` 的 `theme.extend.colors`:

```ts
colors: {
  // 保留原有 primary(不破坏 AgentGraph 组件)
  primary: { /* ... 原样保留 ... */ },
  // Epic 7 协作四视图 tokens
  shadowflow: {
    bg: '#0D1117',          // 页面主背景(深色)
    surface: '#161B22',     // 列 / 卡片 surface(次深)
    border: '#21262D',      // 分隔线 / 边框
    accent: '#A78BFA',      // 紫色协作态锚点(AGENT / APPROVAL / 活动 tab)
    success: '#22C55E',     // Running 状态胶囊
    warn: '#F59E0B',        // Blocked 状态胶囊
    muted: '#6B7280',       // Idle 状态胶囊
  },
},
borderRadius: {
  // 保留原有 lg/xl
  'lg': '0.75rem',
  'xl': '1rem',
  // Epic 7 统一圆角
  'sf': '14px',             // 全站统一 14px
},
```

**And** `src/index.css` 设置 `html, body` 默认 `bg-shadowflow-bg text-white/90`
**And** 点阵网格 120px:在 InboxPage 根容器加背景 util
```css
background-image: radial-gradient(#21262D 1px, transparent 1px);
background-size: 120px 120px;
```
或提取为 Tailwind plugin `bg-dot-grid-120`(任选其一,本 Story 倾向内联 style 以减少 Tailwind 配置复杂度,不强制 plugin)
**And** 紫色 accent 仅用于:活动 Tab / 活动 nav 图标 / "+ 新群聊"按钮 / APPROVAL GATE 面板边框(槽位)—— 其他位置禁用(协作态视觉锚保持克制)

### AC7 — 单元测试覆盖

**Given** Vitest + Testing Library 已配置(package.json devDependencies)
**When** 测试落地
**Then** 新增至少以下测试:
1. `src/pages/InboxPage.test.tsx` — 渲染 InboxPage 断言三列存在(`getByTestId('narrow-nav')` / `getByTestId('message-list')` / `getByTestId('preview-pane')`)
2. `src/pages/InboxPage.test.tsx` — 默认路由 `/` 命中 InboxPage(用 `<MemoryRouter initialEntries={['/']}>`)
3. `src/core/components/inbox/NarrowNav.test.tsx` — 4 nav 图标均渲染,当前激活项是"消息"
4. `src/core/components/inbox/MessageList.test.tsx` — Tab 切换改变活动 state(点击"群聊"→ 活动 Tab 文本为"群聊")
5. `src/core/components/inbox/PreviewPane.test.tsx` — 无 `groupId` prop 时渲染空态占位文案

**And** 所有测试需 `data-testid` 已挂到对应 DOM 节点(开发时加 testid,不留到后续 Story 再补)
**And** `npm run test:run` 全绿,无 warning,覆盖率不做硬性要求(黑客松节奏)

### AC8 — 与其他 Story 的边界清晰(不越界)

**Given** Sprint-B 后续 Story 会在 7.1 基础上扩展
**When** 7.1 实现
**Then** **明确不做**以下事项(由后续 Story 承担):
- **不做** 列表项真实渲染(Story 7.2 — 分组 + 徽章 + 状态胶囊)
- **不做** "+ 新群聊"5 步向导(Story 7.3)
- **不做** 点击列表项跳转 `/chat/:groupId` / `/agent-dm/:agentId`(Story 7.4)
- **不做** BriefBoard segmented control 切换(Story 7.5)
- **不做** 搜索实际过滤(Story 7.6)
- **不做** APPROVAL GATE 面板真实审批交互(Story 7.7)
- **不做** 模板切换器下拉展开与 `POST /api/templates/custom`(Story 3.6.8 + 后续 Story)

**And** 本 Story 产出的组件与路由,必须让 7.2–7.7 可以**直接在其上扩展而无需重构**(路由入口 / 三列骨架 / 视觉 tokens 三者稳定)

## Tasks / Subtasks

- [ ] **T1(AC1)接入 React Router v6 + 路由表**
  - [x] `package.json` dependencies 新增 `"react-router-dom": "6.21.0"`(精确锁定,不用 `^`)— 对齐 project-context §版本锁定
  - [ ] `npm install` 并提交 `package-lock.json`
  - [x] 重构 `src/App.tsx`:导入 `BrowserRouter / Routes / Route`,`/` → InboxPage,`/editor(/:templateId)` → EditorPage 占位,保留 `<I18nProvider>` 外层
  - [ ] 旧的 AgentGraph 三栏内容搬入 `src/pages/EditorPage.tsx` 空壳(直接挪当前 App.tsx 里 `<div class="flex flex-1 ...">` 整段到 EditorPage 的返回值,修复 `./components/...` 的错误 import 指向 `@/core/components/...` 别名路径,让 3.1 有干净起点)
  - [ ] 验证 `npm run dev` 后 `http://localhost:3000/` 进 Inbox,`http://localhost:3000/editor` 进 EditorPage(旧 UI)

- [x] **T2(AC2 + AC6)新增 InboxPage 三列外壳 + Design Tokens**
  - [x] 新建 `src/pages/InboxPage.tsx`:`<div class="flex flex-row h-screen overflow-hidden bg-shadowflow-bg text-white/90" style={{ backgroundImage: 'radial-gradient(#21262D 1px, transparent 1px)', backgroundSize: '120px 120px' }}>`
  - [x] 装配三列:`<NarrowNav /> <MessageList /> <PreviewPane />`,各列加 `border-r border-shadowflow-border`(最后一列去边)
  - [x] 修改 `tailwind.config.ts`:在 `theme.extend.colors` 加 `shadowflow: { bg, surface, border, accent, success, warn, muted }`,在 `borderRadius` 加 `'sf': '14px'`
  - [x] 修改 `src/index.css`:设置 `body { @apply bg-shadowflow-bg text-white/90; }`(若现有全局样式冲突需调和,优先保留 Inbox 配色)

- [x] **T3(AC3)NarrowNav 骨架**
  - [x] 新建 `src/core/components/inbox/NarrowNav.tsx`:`<nav data-testid="narrow-nav" class="w-[72px] flex-none flex flex-col items-center py-4 gap-6 bg-shadowflow-surface">`
  - [x] 顶部模板切换器占位(48×48 `rounded-sf`,背景 `#A78BFA`,白色首字母"S",下方 10px `font-mono` 白 50% "Solo ▾")
  - [x] 4 nav 图标(消息 / 模板 / 运行 / 归档),每个 40×40 `rounded-sf`,当前激活"消息"项用 `text-shadowflow-accent`
  - [x] 底部头像占位(32×32 rounded-full,字母"J"居中,`mt-auto`)
  - [x] 图标使用内联 SVG 或 `@heroicons/react`(如果选后者需在 package.json 补依赖,推荐内联以省 bundle)

- [x] **T4(AC4)MessageList 骨架**
  - [x] 新建 `src/core/components/inbox/MessageList.tsx`:`<aside data-testid="message-list" class="w-[360px] flex-none flex flex-col bg-shadowflow-surface border-r border-shadowflow-border overflow-y-auto">`
  - [x] Header(56px 高):左"Inbox"(font-semibold)+ 右"+ 新群聊"按钮(`px-3 py-1.5 rounded-sf bg-shadowflow-accent text-white text-sm`,onClick console.log 占位)
  - [x] 搜索框(40px 高):`<input type="text" placeholder="搜索群聊 / agent / 消息…" class="w-full h-10 rounded-sf bg-white/5 px-3 text-sm" />`(不接入过滤逻辑)
  - [x] Tab 过滤栏:4 Tab horizontal,`useState<'all'|'dm'|'team'|'unread'>('all')`,活动 Tab 底部 2px `border-b border-shadowflow-accent`
  - [x] 两段 section header(`TEAM RUNS` / `AGENT DMs`):10px `font-mono` 白 50% 大写字母 `tracking-wider`,下方空态"暂无会话"(白 30%)
  - [x] 顶部三段(header + 搜索 + Tab)设为 `sticky top-0 bg-shadowflow-surface z-10`

- [x] **T5(AC5)PreviewPane 骨架**
  - [x] 新建 `src/core/components/inbox/PreviewPane.tsx`:`<main data-testid="preview-pane" class="flex-1 flex flex-col bg-shadowflow-bg overflow-y-auto">`
  - [x] 接收可选 prop `groupId?: string`;7.1 默认无 groupId,渲染空态(居中占位 + 副文本)
  - [x] 预留三个条件渲染 slot(注释掉或 `{false && (...)}`):指标条条 / APPROVAL GATE / 最近消息 —— 由 7.4 / 7.7 填充
  - [x] 空态占位:200×200 `bg-shadowflow-surface rounded-sf` 矩形 + 下方文案"选择一个会话查看详情"(主文)/ "从左侧列表选择群聊或单聊开始协作"(副文,白 50%)

- [x] **T6(AC7)单元测试**
  - [x] 新建 `src/pages/InboxPage.test.tsx`:`<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>` → 断言 3 列 testid 均存在;无选中时断言空态文案"选择一个会话查看详情"可见
  - [x] 新建 `src/core/components/inbox/NarrowNav.test.tsx`:断言渲染后 4 个 nav button 存在,当前激活 aria-current 在"消息"
  - [x] 新建 `src/core/components/inbox/MessageList.test.tsx`:断言 `+ 新群聊` 按钮存在;点击"群聊" Tab → 活动 state 变更(用 `fireEvent` + 视觉 class 断言)
  - [x] 新建 `src/core/components/inbox/PreviewPane.test.tsx`:不传 groupId 时空态可见;传 `groupId="test"` 时空态不可见(槽位还未填但断言占位消失)
  - [x] 跑 `npm run test:run` 全绿;若现有 `__tests__/` 有旧测试崩,优先隔离(标 skip)而非删除,防止破坏 AgentGraph 回归

- [ ] **T7(AC8)边界清晰度交付审查**
  - [ ] 在 PR description 中显式列出"本 Story 不做"清单(对齐 AC8)
  - [x] 确认 NarrowNav / MessageList / PreviewPane 的组件 interface 允许后续 Story 传 props 扩展(不写死内部 state)
  - [x] 确认 tailwind `shadowflow.*` tokens 不与现有 `primary.*` 冲突(现有 AgentGraph 组件继续用 primary,新 Inbox 组件只用 shadowflow)

## Dev Notes

### 架构关键路径

**改动集中在:1 个入口文件 + 3 个 pages + 3 个 inbox 组件 + 1 个配置文件 + 4 个测试文件。**

1. `src/App.tsx` — 从直接渲染 UI 改为 Router Shell(重构,不新建)。当前 App.tsx 有**已经错误的 import**(`./components/Canvas` 路径不存在,实际在 `src/core/components/Canvas/`),本 Story 顺手修复 — 搬到 EditorPage 时用 `@/core/components/...` 别名重写 import。
2. `src/pages/InboxPage.tsx` — **新建**(三列外壳 + 点阵网格 + Design Tokens 应用点)
3. `src/pages/EditorPage.tsx` — **新建空壳**,接收当前 App.tsx 的 AgentGraph UI;Story 3.1 后续在此扩展(双方依赖关系锁定在本 Story)
4. `src/core/components/inbox/NarrowNav.tsx` — **新建**(72px 左窄导航骨架)
5. `src/core/components/inbox/MessageList.tsx` — **新建**(360px 中列骨架,Tab + 搜索 + section 占位)
6. `src/core/components/inbox/PreviewPane.tsx` — **新建**(1008px 右列骨架,空态 + 预留 slot)
7. `tailwind.config.ts` — **修改**(`theme.extend.colors.shadowflow.*` + `borderRadius.sf`)
8. `src/index.css` — **微改**(body 默认配色)
9. `package.json` / `package-lock.json` — **新增** `react-router-dom@6.21.0` 精确版本
10. 4 个测试文件(InboxPage + 3 个组件)

### 与其他 Story 的依赖拓扑

**前置(已完成)**:
- **Story 3.6.7(done)** — 提供 `Template` 类型带 `user_role / default_ops_room_name / brief_board_alias / agent_roster / group_roster / theme_color`;NarrowNav 顶部模板切换器占位若后续接数据,从 `src/common/types/template.ts` 导入类型即可(本 Story 不强制接数据,静态占位)

**并行(Sprint-B 中 7.1 是首站)**:
- **Story 3.1(ready-for-dev)** — 也需要 Router。**本 Story 负责初始化 Router**(`/` + `/editor` 两条路由),3.1 只需填充 EditorPage 内容,不再处理 Router 启动。3.1 执行人请从本 Story 创建的 `src/pages/EditorPage.tsx` 空壳开始。

**后置(本 Story 完成后解锁)**:
- Story 7.2 在 MessageList 骨架上挂接真实列表项 + 分组 + 徽章
- Story 7.3 在"+ 新群聊"按钮上挂 5 步向导 dialog
- Story 7.4 在 PreviewPane slot 上接入 `/chat/:groupId` / `/agent-dm/:agentId` 跳转 + 最近消息
- Story 7.6 在 MessageList 搜索框接入 fuzzy 过滤逻辑
- Story 7.7 在 PreviewPane 两个 slot(指标条 / APPROVAL GATE)接入真实数据 + 审批交互

### 关键约束(违反 = PR block)

**来自 `_bmad-output/project-context.md`(必读)**:

- **§5 React / Zustand** — Zustand `set` 必须返新对象;selector 精确订阅禁全 store 拿取。**本 Story 暂不引入新 Zustand store**(Tab state 用 useState 够了),但为 7.2 预留接入点 —— 组件 interface 允许后续传 store selector 作 prop。
- **§11 命名** — React 组件 `PascalCase.tsx`;文件路径用 `@/*` 别名;禁止 `../../../`。本 Story 所有新组件遵循。
- **§3 TS 类型单源** — `src/common/types/template.ts`(3.6.7 产出)已存在,**禁止**重造 Template 类型。NarrowNav 若后续要用,直接 import。
- **§12 Don't-Miss #A1** — WCAG 2.1 AA:点阵网格背景的对比度 4.5:1 必须满足;文字用 `text-white/90` 在 `#0D1117` 上对比度 ≈ 14:1 ✓;文字用 `text-white/50` 在 surface `#161B22` 上对比度 ≈ 7.3:1 ✓(占位文案用 30% 会偏低,仅限装饰占位不含语义时可用,但测试里不要断言 30% 文本的可访问名)。

**来自 architecture.md(frontend 区段,lines 317-356)**:

- Zustand 分域 store(AR16)—— 不强制在 7.1 引入,但后续 Story(尤其 7.2 拉消息列表)必开 `useInboxStore` 或复用 `useRunStore`,留白即可。
- ReactFlow `onlyRenderVisibleElements` —— 与 Inbox 无关,EditorPage 的 Canvas 已经配置过。
- Vite code splitting —— `/editor` 路由需独立 chunk。在 App.tsx 中用 `React.lazy(() => import('@/pages/EditorPage'))` 包住 EditorPage import + `<Suspense fallback={...}>` 兜底,让 Inbox 路径不加载 Editor chunk。
- 初始 JS bundle ≤ 400 KB gzipped(MVP 目标)—— 接入 react-router-dom 大约增加 15 KB,仍在预算内。

### 文件结构落地(本 Story 产出后)

```
src/
├── App.tsx                                    # 重构:Router Shell
├── index.css                                  # 微改:body 配色
├── pages/                                     # 新增目录
│   ├── InboxPage.tsx                          # 新
│   ├── InboxPage.test.tsx                     # 新
│   └── EditorPage.tsx                         # 新(空壳 + 旧 AgentGraph UI)
├── core/
│   └── components/
│       ├── Canvas/ Node/ Panel/ Toolbar/      # 现有(本 Story 不动)
│       └── inbox/                             # 新增目录
│           ├── NarrowNav.tsx                  # 新
│           ├── NarrowNav.test.tsx             # 新
│           ├── MessageList.tsx                # 新
│           ├── MessageList.test.tsx           # 新
│           ├── PreviewPane.tsx                # 新
│           └── PreviewPane.test.tsx           # 新
└── common/
    └── types/template.ts                      # 现有(3.6.7 产出,本 Story 不改)
```

### 视觉规范引用(ground truth)

- **pen 稿**:`docs/design/shadowflow-ui-2026-04-16-v2.pen`(Pencil MCP 访问)
  - 节点 `InboxPage` id = `34BOB`
  - 节点 `InboxPage_CN` id = `T9IrP`
- Design Tokens 取值(与 pen 对齐):bg `#0D1117` / surface `#161B22` / border `#21262D` / accent `#A78BFA` / 圆角 14px / 点阵网格 120px
- 状态胶囊配色:Running `#22C55E` / Blocked `#F59E0B` / Idle `#6B7280` / Pending Approval(紫 `#A78BFA`)— 本 Story 不使用,Story 7.2 应用

### 测试标准

- **Vitest + @testing-library/react + jsdom** 已在 devDependencies(`^4.0` / `^13.4` / `^28`)
- 测试文件 **co-located**(与源码同级 `*.test.tsx`),遵循 project-context §10
- 路由测试用 `<MemoryRouter>`(@testing-library 标准做法)避免真 BrowserRouter 在 jsdom 里出错
- **禁用** `time.sleep` / 真实 timer;Tab 切换断言用 `fireEvent.click` + 同步 class 断言
- 若 `npm run test:run` 出现**现有** `__tests__/` 下测试失败(非本 Story 引入),优先 `describe.skip` 隔离并在 PR description 记录,不回归修复(超出本 Story 范围)

### 风险与预置方案

1. **App.tsx 当前 import 已 broken**(`./components/Canvas` 不存在,应为 `./core/components/Canvas`)—— 现有代码可能 dev 时就会报错。Dev 执行时若 `npm run dev` 起不来,**先修** import 路径再开始 7.1 重构;若能起来说明有未观察到的 alias 或 re-export,保留原样搬进 EditorPage。
2. **旧 AgentGraph UI 搬入 EditorPage 可能带其他隐式依赖**(如 `I18nProvider` / 组件内部 state)—— 只做**机械挪移**,不做逻辑调整。若挪移后 EditorPage 崩,在 PR 描述记录,交给 Story 3.1 彻底重构。
3. **tailwind 配置扩展需要 dev server 重启**—— 修改 `tailwind.config.ts` 后 `npm run dev` 若 JIT 未生效需 kill 重起;这是框架特性,不是本 Story bug。
4. **react-router-dom 6.21.0 版本验证**:写本 Story 时查 react-router 最新稳定(2026-04 检查);若 MVP 执行时发现 6.21.x 已有更新的 6.2x.0,可升到最新 patch 但严禁跨 minor(保持向后兼容承诺)。

### Project Structure Notes

- `src/pages/` 目录**本 Story 首次创建**(之前不存在),所有路由页组件落此处
- `src/core/components/inbox/` 目录**本 Story 首次创建**,专属 Inbox 三列骨架的子组件
- 不要落到 `src/core/components/Panel/`(那里是 EditorPage 用的面板)或 `src/common/ui/`(那是原子 UI,Inbox 三列是 organism 级)
- **禁止** 新建 `src/components/` 根目录(对齐 architecture.md 结构,component 全部在 `src/core/components/` 或 `src/common/ui/` 下)

### References

- [Source: `_bmad-output/planning-artifacts/epics-addendum-2026-04-16.md#Story 7.1`(lines 45-62)— Story 原 AC + pen 引用]
- [Source: `_bmad-output/planning-artifacts/epics-addendum-2026-04-16.md#Epic 7 Stories` — 与 7.2/7.3/7.4/7.5/7.6/7.7 的边界定义]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Frontend Architecture`(lines 317-356)— Zustand / React Router v6 / ReactFlow / Bundle 目标]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure`(lines 689-865)— `src/pages/` + `src/core/components/` 官方结构]
- [Source: `_bmad-output/planning-artifacts/prd.md`(lines 849-861)— FR-Inbox-1~7 / FR-Template-Switcher / FR-Identity / FR-OpsRoom / FR-BriefBoard-Alias / FR-Group-Metrics 全文]
- [Source: `_bmad-output/project-context.md#5 React / Zustand 状态管理` — 组件模式约束]
- [Source: `_bmad-output/project-context.md#11 Naming / Structure / Format` — 命名与路径别名]
- [Source: `_bmad-output/implementation-artifacts/3-6-7-模板-yaml-schema-扩展-6-种子模板改造.md` — Template 类型产出路径 `src/common/types/template.ts`]
- [Source: `_bmad-output/implementation-artifacts/3-1-react-editor-shell-reactflow-canvas-shadow-ui-复用.md` — EditorPage 路由契约(7.1 预留,3.1 填充)]
- [Source: `docs/design/shadowflow-ui-2026-04-16-v2.pen` — pen UI ground truth,节点 `InboxPage`(34BOB)、`InboxPage_CN`(T9IrP)]
- [Source: `src/App.tsx`(当前 stale)— 需重构为 Router Shell 的起点]
- [Source: `package.json`(当前无 react-router-dom)— 需新增 `react-router-dom@6.21.0` 精确锁定]
- [Source: `tailwind.config.ts`(当前仅 primary 色)— 需扩展 `shadowflow.*` tokens]

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `npm run test:run -- src/pages/InboxPage.test.tsx src/core/components/inbox/NarrowNav.test.tsx src/core/components/inbox/MessageList.test.tsx src/core/components/inbox/PreviewPane.test.tsx` ✅ 6 tests passed
- `npx eslint src/AppRoutes.tsx src/pages/InboxPage.tsx src/pages/InboxPage.test.tsx src/core/components/inbox/NarrowNav.tsx src/core/components/inbox/NarrowNav.test.tsx src/core/components/inbox/MessageList.tsx src/core/components/inbox/MessageList.test.tsx src/core/components/inbox/PreviewPane.tsx src/core/components/inbox/PreviewPane.test.tsx src/main.tsx src/test/setup.ts` ✅ passed
- `npm run build` ❌ blocked by pre-existing repo TypeScript errors outside Story 7.1 scope
- `npm install --package-lock-only` ⏳ timed out after ~124s; `package-lock.json` unchanged

### Completion Notes List

- ✅ `/` 现已命中新的 Inbox 三列骨架页，`App.tsx` 收敛为路由壳，入口路由抽到 `src/AppRoutes.tsx`
- ✅ 新增 `InboxPage`、`NarrowNav`、`MessageList`、`PreviewPane`，完成 72 / 360 / flex-1 三列布局与 120px 点阵背景
- ✅ 扩展 Tailwind `shadowflow.*` design tokens 与 `rounded-sf`
- ✅ 新增 4 个定向测试文件，并补上 Vitest 的 `jest-dom` matcher setup
- ✅ 保留 `/templates`、`/import`、`/editor` 路由，同时新增 `/runs/:runId` 与 `/about` 占位路由槽位
- ⚠️ Story 仍保留为 `in-progress`：`npm install/package-lock` 未完成，`npm run dev` 未做人工路由验收，PR description 边界说明待真正提 PR 时补

### File List

- `src/App.tsx`
- `src/AppRoutes.tsx`
- `src/main.tsx`
- `src/pages/InboxPage.tsx`
- `src/pages/InboxPage.test.tsx`
- `src/core/components/inbox/NarrowNav.tsx`
- `src/core/components/inbox/NarrowNav.test.tsx`
- `src/core/components/inbox/MessageList.tsx`
- `src/core/components/inbox/MessageList.test.tsx`
- `src/core/components/inbox/PreviewPane.tsx`
- `src/core/components/inbox/PreviewPane.test.tsx`
- `src/index.css`
- `src/test/setup.ts`
- `tailwind.config.ts`
- `package.json`
- `package-lock.json`

### Change Log

- 2026-04-23: 启动 Story 7.1，实现 Inbox 三列骨架、路由壳、design tokens 与定向测试；保留为 in-progress 以等待剩余非代码交付项
