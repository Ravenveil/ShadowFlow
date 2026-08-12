# ShadowFlow 前端三栏布局重构方案

> 日期：2026-06-24  
> 状态：v2 修订（已确认现状 + 更正 Hermes 三栏）

> **v2 更正记录（2026-06-24）**
> 1. **Hermes Desktop 是三栏**（左导航/会话史 · 中聊天 · 右代码/文件预览），v1 误写成「无固定右栏」，本版改正。
> 2. **右栏不加「成果」tab，维持只做减法**：曾考虑给右栏加一个「成果」面板放当前会话产物，但**「成果」= 项目页（/projects）的同一种数据（Artifacts），只差作用域**，再开一个等于第三个重复入口。结论：成果归项目页（左栏全局），右栏只删不加。
> 3. **已核实「工作区」tab 只是 run 列表 + 入口**（`RunWorkPane`：最近 run 卡 + 历史 + 「打开 Run」深链），**不展示产物本体**；产物预览（`PreviewPanel`）在 `/run-session/:id` 整页内。想看本会话产出 → 工作区 → 打开 Run。
> 4. **§3.3 ClawsGO 三栏已据真实截图校正**：右栏不是「模型/Prompt 配置卡」，而是**「Agent 的主机」= 工作空间/PPT/画布/密钥**（该 agent 的产出工作台）。原 v1 描述作废。

---

## 1. 设计目标

一句话：**左栏管"去哪"，右栏管"看啥"，中间是"干啥"。**

参考竞品的共同设计哲学：
- **Cherry Studio**：左栏 = 会话列表，中间 = 聊天，右栏 = 当前助手的设定/模型/工具。没有把日历、项目塞进右栏。
- **Hermes Desktop（三栏）**：左栏 = 导航 + 会话历史（ProfileSwitcher / SidebarRecentSessions / ActiveSessionsBar），中间 = 聊天，**右栏 = 代码 / 文件预览面板（当前任务产出）**。右栏内容随当前会话的产物走，不是全局文件管理器。
- **Clawsgo**：左栏 = Agent 列表，中间 = 聊天，右栏 = 当前 Agent 的上下文面板（模型、工具、历史）。
- **Coze**：左栏 = Bot 列表，中间 = 工作流/对话，右栏 = 节点配置（选中节点才出现）。

**核心原则：右栏 = "跟当前对话直接相关的东西"（设定 / 当前 run 的产出 / 当前群的任务），不是"整个产品的功能超市"，也不是"全局列表页的第二入口"。**

> 四家右栏的共同点：**右栏装的都是「当前对话/当前选中对象」的上下文**——Cherry 的助手设定、Clawsgo 的 Agent 详情、Coze 的节点配置、Hermes 的当前任务产物。**没有一家把「全局列表页」（日历/项目总览）塞进右栏。** 这正是本次重构的依据。

---

## 2. 现状问题

### 2.1 右栏重复导航

```
左栏导航已经有：                    右栏又塞了一份：
  日历 (/calendar)                    [日历] tab  ← 同一个 CalendarPage
  项目 (/projects)                    [项目] tab  ← 同一个 ProjectsPage
```

用户不知道该点左栏还是右栏——同一条路两个入口。

### 2.2 三套右栏，tab 集不统一

| 场景 | 文件 | tab 集 |
|------|------|--------|
| 个人单聊 DM | `PersonalRightPane.tsx` | [设定] [工作区] [任务] [Brief] [日历] [项目] |
| 群聊团队态 | `ThreadDrawerFB.tsx` | [Thread] [工作区] [任务] [文档] [Brief] [日历] [项目] |
| 执行会话 | `RunSessionPage.tsx` | [Overview] [Team] [Agent] [Preview] + Blueprint |

三套右栏互相独立，tab 命名不统一，维护成本高。

### 2.3 "文档" tab 是空态 mock

`ThreadDrawerFB` 的文档 tab 已删 mock（2026-06-24），现为空态，等 `GET /api/groups/{id}/docs` 上线再接真数据——先不占右栏位置。

### 2.4 「成果」既有真实链路，又有全局入口，但右栏没接

- **全局入口已存在**：左栏「项目/产物」= `/projects`（ProjectsPage），按 [[project_projects_page_redesign]] 已重定义为**全局成果（Artifacts）列表页**。
- **会话级产物链路是真的**：run-session 侧有 `ArtifactPreview.tsx` / `StepArtifactDrawer.tsx` / `PreviewPanel.tsx`（注释「右侧 Tabs 跟随产物」）/ `RunsPage` 真实「产物」列。
- **但聊天右栏没有「当前会话产出了什么」的视图**——用户想要的「右侧看项目文件、成果」恰恰是这一块，目前缺失。

---

## 3. 竞品布局详解

### 3.1 Cherry Studio

```
┌──────────┬──────────────────────────┐
│          │                          │
│ 会话列表  │     聊天区                │
│ (话题)   │                          │
│          │  用户消息 / 助手回复       │
│ ─────── │  Markdown 渲染            │
│ 助手库   │  代码高亮                  │
│ (分类)   │  图片预览                  │
│          │                          │
│          │  ── 底部输入栏 ──          │
│          │  [模型选择] [发送]         │
└──────────┴──────────────────────────┘

右栏：不存在。助手信息通过顶部设置面板查看。
```

- **无固定右栏**——助手设定（Prompt、模型、工具）通过点击助手名称弹出面板查看
- 左栏 = 话题列表 + 助手库入口（两个 tab 切换）
- 功能定位：纯粹的 AI 对话客户端，不做项目管理

### 3.2 Hermes Desktop（三栏）

```
┌──────────┬──────────────────┬──────────┐
│          │                  │          │
│ 导航     │     聊天区        │ 代码 /   │
│ ProfileSw│                  │ 文件预览  │
│ ─────── │  消息流          │          │
│ 会话历史  │  工具调用结果      │ 当前任务  │
│ (Recent  │  reasoning       │ 产出的    │
│ Sessions)│  代码块          │ 文件 /    │
│ ─────── │                  │ diff /   │
│ 活动会话  │  ── 输入栏 ──      │ 预览     │
│ (Active  │  [模型][工具][发送]│          │
│ Sessions)│                  │          │
└──────────┴──────────────────┴──────────┘

右栏：固定三栏的右栏 = 当前任务的代码/文件预览（产物视图），随当前会话走。
```

- **三栏布局**：左 = 导航 + 会话历史 + 活动会话条；中 = 聊天；**右 = 当前任务产出的代码/文件预览**。
- 右栏内容 = **当前会话的产物**（Hermes 是编码 Agent，产物即代码/文件 diff），不是全局文件管理器。
- 功能定位：自主 Agent 的工作台——**右栏专门展示「这次干出来了什么」**，正好对应我们要加的「成果」面板。

### 3.3 ClawsGO（三栏，已据真实截图校正 2026-06-24）

> 截图来源：clawsgo.cn 首页态（图1）+ `/sandbox` 任务态（图2）。原 v1 描述（右栏=模型/Prompt/工具/历史）有误，本版按截图改正。

```
┌────────┬──────────────────┬────────────────────┐
│        │                  │  Agent 的主机        │
│ 导航   │   Agent 选择 +    │  [工作空间][新标签]  │
│ ────── │   对话 / composer │ ┌────┬────┬────┐   │
│ 新建会话│                  │ │工作 │ PPT│画布 │   │
│ 文档   │   model selector  │ │空间 │    │    │   │
│ 搜索   │   场景分类 tab     │ ├────┴────┴────┤   │
│ ────── │  (学术/论文复现/   │ │     密钥      │   │
│ Agents │   商业/设计…)     │ └──────────────┘   │
│ 用户卡  │                  │                    │
└────────┴──────────────────┴────────────────────┘
```

- **最左导航栏**：新建会话 / 文档 / 搜索 / Agents 列表 / 底部用户卡
- **中间**：Agent 选择 + 对话 / composer（含 model selector「ClawsGO 1.0 Lite」+ 场景分类 tab）
- **右栏 =「Agent 的主机」**：带标签页（工作空间 / 新标签页），内容是该 Agent 的**工作空间 / PPT / 画布 / 密钥**——即 **agent 的产出与资源工作台**，不是模型配置卡。
- 关键观察：ClawsGO 右栏放的是「**这个 agent 的工作空间/产物**」，最贴近本项目用户最初想的「右侧看项目文件、成果」。我们已决定成果归项目页（见 §4.3），此处仅作对标记录。

### 3.4 Coze（字节跳动）

```
┌──────────┬──────────────────┬──────────┐
│          │                  │          │
│ Bot      │     工作区        │ 节点     │
│ 列表     │                  │ 配置     │
│          │  流程画布         │          │
│ ─────── │  / 对话区          │ 输入     │
│ 知识库   │                  │ 输出     │
│ 插件     │                  │ 参数     │
│ 工作流   │                  │ 调试     │
│          │                  │          │
└──────────┴──────────────────┴──────────┘
```

- **右栏 = 节点配置面板**——选中画布上的某个节点，右栏显示它的详细配置
- 没选中节点时右栏隐藏或显示概览
- 知识库、插件在左栏作为独立入口

---

## 4. 重构方案

### 4.1 目标布局

```
┌──────────┬──────────────────┬──────────┐
│          │                  │          │
│ 导航栏   │     中间区域       │  右栏    │
│          │                  │ (上下文)  │
│ ─────── │  聊天 / 独立页面    │          │
│ 新建任务  │                  │ [设定]   │
│ 收件箱   │                  │ [工作区]  │
│ 团队     │                  │ [任务]   │
│ Agent    │                  │ [Brief]  │
│ 日历 →   │  日历整页走左边    │          │
│ 项目 →   │  项目/产物走左边   │          │
│          │                  │          │
└──────────┴──────────────────┴──────────┘

右栏只做减法：删掉「日历/项目」整页（左栏已有全局入口）+「文档」mock。
成果归左栏「项目」全局页；想看本会话产出走「工作区 → 打开 Run」。
```

### 4.2 左栏导航（不变）

保持现有 `navConfig.ts` 的 PRIMARY_NAV：

| 图标 | 名称 | 路由 | 说明 |
|------|------|------|------|
| Plus | 新建任务 | `/chat?view=personal&new=1` | 个人态新会话 |
| Inbox | 收件箱 | `/inbox` | 通知/审批 |
| Users | 团队 | `/teams` | 团队管理 |
| Bot | Agent | `/agents` | 助手管理 |
| CalendarDays | 日历 | `/calendar` | 日程安排 |
| Folder | 项目 | `/projects` | 项目管理 |

**日历和项目在左栏有独立入口，用户从左栏点进去看到完整页面。**

### 4.3 右栏重构（核心变更）

原则：**只删「全局整页塞进右栏」（日历/项目整页 = 左栏第二入口）和无数据的 mock（文档）；不加新 tab。** 成果归项目页（左栏全局），不在右栏重开。

#### 个人单聊（PersonalRightPane）

| Tab | 内容 | 去留 | 理由 |
|-----|------|------|------|
| 设定 | 当前 Agent 的模型/Prompt/工具 | ✅ 保留 | 核心功能，对标 ClawsGO/Cherry 右栏的 agent 上下文 |
| 工作区 | 当前会话关联的 Run Session（run 列表 + 入口） | ✅ 保留 | 执行态入口；点「打开 Run」进整页看产物 |
| 任务 | 当前群组的待办审批 | ✅ 保留 | 跟当前对话直接相关 |
| Brief | 当前项目的简报/进展 | ✅ 保留 | 独特功能，跟对话上下文相关 |
| 日历 | CalendarPage 整页 | ❌ 删除 | 左栏已有**整页**入口，右栏塞整页 = 第二入口 |
| 项目 | ProjectsPage 整页（= 全局成果页） | ❌ 删除 | 同上；成果就在这个左栏全局页看 |

#### 群聊团队态（ThreadDrawerFB）

| Tab | 内容 | 去留 | 理由 |
|-----|------|------|------|
| Thread | 当前消息的回复线程 | ✅ 保留 | 群聊核心功能 |
| 工作区 | 当前群关联的 Run Session（run 列表 + 入口） | ✅ 保留 | 同上 |
| 任务 | 当前群组的待办审批 | ✅ 保留 | 同上 |
| Brief | 当前项目的简报/进展 | ✅ 保留 | 同上 |
| 文档 | 群组文档（当前已是空态） | ❌ 删除 tab | 无真实 API（`/api/groups/{id}/docs` 未上线），先不占位置；上线后再回收 |
| 日历 | CalendarPage 整页 | ❌ 删除 | 左栏已有整页入口 |
| 项目 | ProjectsPage 整页（= 全局成果页） | ❌ 删除 | 同上 |

> **为什么不在右栏单开「成果」tab**：右栏「成果」会和左栏「项目」(`/projects` = 全局成果页) 撞同一种数据（Artifacts），只差作用域——等于第三个重复入口。当前「工作区」tab 已能进入本会话的 run（→ 打开 Run → run-session 内 `PreviewPanel` 看产物），不缺这条路径。故成果统一归项目页。

#### 执行会话（RunSessionPage）

保持不变：`[Overview] [Team] [Agent] [Preview]` + Blueprint 画布。

**理由**：执行会话是全屏工作模式，跟普通聊天是不同的场景。右栏放 Blueprint 画布和各 Agent 状态面板是合理的。

### 4.4 重构后对比

```
重构前（3套右栏，tab 集不统一，含全局整页）：

  个人单聊:  [设定] [工作区] [任务] [Brief] [日历] [项目]          ← 6个
  群聊团队:  [Thread] [工作区] [任务] [文档] [Brief] [日历] [项目]  ← 7个
  执行会话:  [Overview] [Team] [Agent] [Preview]                ← 4个

重构后（去全局整页 + mock，两套聊天右栏对齐，纯减法）：

  个人单聊:  [设定] [工作区] [任务] [Brief]                       ← 4个
  群聊团队:  [Thread] [工作区] [任务] [Brief]                      ← 4个
  执行会话:  [Overview] [Team] [Agent] [Preview]                ← 4个（不变）

变化：−日历 −项目(整页) −文档(mock)；不加新 tab，成果归左栏项目页
```

---

## 5. 需要改动的文件

### 5.1 PersonalRightPane.tsx

**改动**：从 `TabId` / `TABS` 移除 `calendar`、`projects`，删除 import `CalendarPage`/`ProjectsPage`/`EmbeddedPage` 及 panels 里的 `calendar:` / `projects:` 渲染。纯减法，不加 tab。

```diff
-type TabId = 'employee' | 'work' | 'tasks' | 'brief' | 'calendar' | 'projects';
+type TabId = 'employee' | 'work' | 'tasks' | 'brief';
 const TABS: RightPaneTabDef<TabId>[] = [
   { key: 'employee', label: '设定' },
   { key: 'work', label: '工作区' },
   { key: 'tasks', label: '任务' },
   { key: 'brief', label: 'Brief' },
-  { key: 'calendar', label: '日历' },
-  { key: 'projects', label: '项目' },
 ];
```
配套删：`import CalendarPage` / `import ProjectsPage` / `import { EmbeddedPage }`，以及 panels 里 `calendar:`、`projects:` 两行。

### 5.2 ThreadDrawerFB.tsx

**改动**：从 `DrawerTab` / `tabs` 移除 `docs`、`calendar`、`projects`，删除对应 import 与面板渲染。纯减法。

```diff
-type DrawerTab = 'thread' | 'work' | 'tasks' | 'docs' | 'brief' | 'calendar' | 'projects';
+type DrawerTab = 'thread' | 'work' | 'tasks' | 'brief';
 const tabs = [
   { k: 'thread', label: 'Thread' },
   { k: 'work', label: tr('chat.tabWork', '工作区') },
   { k: 'tasks', label: tr('chat.tabTasks', '任务') },
-  { k: 'docs', label: tr('chat.tabDocs', '文档') },
   { k: 'brief', label: 'Brief' },
-  { k: 'calendar', label: '日历' },
-  { k: 'projects', label: '项目' },
 ];
```
配套删：`import CalendarPage` / `import ProjectsPage` / `import { EmbeddedPage }`，docs 空态面板，以及 `calendar:`、`projects:` 面板渲染。

### 5.3 成果数据归属（不在右栏，作记录）

成果统一在左栏「项目」(`/projects` ProjectsPage) 全局页看。会话级产物链路（`api/runSessions.ts` / `PreviewPanel`「右侧 Tabs 跟随产物」/ `StepArtifactDrawer` / `ArtifactPreview` / `RunsPage` 产物列）已存在且为真，通过「工作区 → 打开 Run → run-session 整页」可达，**本次不在聊天右栏重复实现**。

---

## 6. 后续可选优化（不在本次范围）

| 优化项 | 说明 | 优先级 |
|--------|------|--------|
| 右栏 tab 命名统一 | 个人态叫"设定"，群聊态叫"Thread"——可以统一成上下文相关的命名 | 低 |
| RunSessionPage 右栏复用 RightPaneTabs | 目前是独立实现，可以统一到 RightPaneTabs shell（已部分完成） | 中 |
| 右栏宽度可拖拽调整 | 当前固定 312px，竞品普遍支持拖拽 | 低 |
| 日历页面内嵌到聊天 | 如果用户确实需要在聊天时快速看日程，改为浮动面板而非右栏 tab | 待定 |
