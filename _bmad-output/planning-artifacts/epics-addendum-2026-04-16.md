---
name: epics-addendum-2026-04-16
title: Epics Addendum · Collaboration Quad-View + Template Schema Extension
version: 0.1
created: 2026-04-16
status: proposed
parent: epics.md
trigger: _bmad-output/change-requests/2026-04-16-inbox-centric-collaboration.md
---

# Epics Addendum · 2026-04-16

本文件是 [epics.md](epics.md) 的增量补丁,承接 2026-04-16 Pencil UI 会话的 10 条决策(详见 `_bmad-output/change-requests/2026-04-16-inbox-centric-collaboration.md`)。

新增内容分两部分:
- **Epic 7** · Collaboration Quad-View(Inbox 顶层入口 + 模板切换器 + APPROVAL GATE 面板)
- **Epic 3.6 Addendum** · 模板 YAML schema 扩展 + Template Builder Wizard(Story 3.6.7 / 3.6.8)

---

# Epic 7: Collaboration Quad-View(Inbox + Chat + AgentDM + BriefBoard)

**Status**: backlog
**Priority**: P0(黑客松 MVP 关键路径 —— 用户进入产品后的主工作界面)
**FRs covered**: FR-Inbox-1 ~ FR-Inbox-7, FR-Template-Switcher, FR-Template-Switcher-2, FR-Identity, FR-OpsRoom, FR-BriefBoard-Alias, FR-Group-Metrics

**Goal**: 落地"AI 员工在公司架构下与人共同工作"的协作叙事 —— Inbox 作为顶层入口、Chat/AgentDM/BriefBoard 作为子视图、模板切换器作为全局上下文切换入口。LiveDashboard(Epic 4)从此降级为"专家观察模式"。

**依赖**:
- Epic 1 · Policy Matrix(APPROVAL GATE 面板需要)
- Epic 3 · Workflow Editor(Chat 里"打开项目编辑器"入口需要)
- Epic 3.6 · 6 种子模板 + addendum 扩展(模板切换器需要 roster + roomName 数据)
- Epic 4 · SSE 事件总线(Inbox 未读计数 + 状态胶囊驱动)

**前置决策**(来自 change-request):
- 决策 1 · 协作视图从"三视图"升级为"四视图"
- 决策 2 · AI 员工在公司架构下与人共同工作
- 决策 5 · 方案 C 视觉升级(紫色 accent / 分组 / DECISIONS 徽章 / 状态胶囊 / 指标条 / APPROVAL GATE 面板)
- 决策 6 · 模板切换器占用左窄导航 Logo 位
- 决策 9 · 用户身份随模板切换
- 决策 10 · "+ 新建模板 / 加入企业"入口

## Epic 7 Stories

### Story 7.1: Inbox 页框架(三列布局 + 窄导航 + 消息列表 + 右侧预览)

**As a** ShadowFlow 用户
**I want** 登录后默认进入 Inbox 页,看到钉钉式三列消息面板
**So that** 我能像在公司一样快速进入今天要处理的项目群聊 / 单聊

**Acceptance Criteria:**

**Given** 用户访问 `/` 根路径
**When** 未显式导航到其他页
**Then** 渲染 `InboxPage` 三列:
- 左 72px 窄导航(顶部模板切换器 + 消息 / 模板 / 运行 / 归档 + 底部头像)
- 中 360px 消息列表(Tab 过滤 + 分组 section + 列表项)
- 右 1008px 当前会话预览(群头指标条 + APPROVAL GATE 面板 + 最近 3 条消息 + 底部操作按钮)

**And** pen 参考 `InboxPage` (34BOB) / `InboxPage_CN` (T9IrP)

**And** 深色背景 `#0D1117`、圆角 14px、点阵网格 120px、紫色 accent `#A78BFA` 作协作态视觉锚

### Story 7.2: 消息列表项 + 分组 + 徽章系统

**As a** 用户
**I want** 列表项一眼看出哪个群在跑、有几条待审议、哪个员工在等我
**So that** 我不用逐个打开就知道今天的优先级

**Acceptance Criteria:**

**Given** 消息列表渲染
**When** 数据到位
**Then** 列表按 `TEAM RUNS`(群聊) + `AGENT DMs`(单聊) 两段 section header 分组

**And** 每项显示:
- 头像 + 名字
- 状态胶囊(`Running` 绿 / `Blocked` 橙 / `Idle` 灰)
- 最后消息预览(≤ 80 字符截断)
- 时间戳
- 未读 badge(数字,> 99 显示 `99+`)
- 待决策数徽章(`📋 N`,仅群聊)

**And** Tab 过滤:全部 / 单聊 / 群聊 / 未读

**And** 数据来源:`GET /api/templates/{current}/inbox` 返回当前模板上下文下的 group list + agent DM list

### Story 7.3: "+ 新群聊"流程(新项目 = 新群聊)

**As a** 用户
**I want** 点击"+ 新群聊"一键开新项目
**So that** 我能快速把 AI 员工 + 人拉进同一个协作空间

**Acceptance Criteria:**

**Given** 用户在 Inbox 页点击"+ 新群聊"按钮
**When** 弹出创建 dialog
**Then** 5 步向导:
1. 选当前模板下的 group template(可用 group roster 中选)
2. 选 AI 员工(从当前模板 agent roster 多选,默认全选)
3. 邀请人类成员(email / user ID,可选)
4. 命名群聊(默认填充 group template name)
5. 预览 Policy Matrix(继承 group template,可微调)

**And** 创建完成后跳转到新群聊的 Chat 视图(Epic 3 ChatPage)

**And** 后端:POST /api/groups` 创建持久 Group Room(不是单次 run),返回 groupId

### Story 7.4: Inbox → Chat / AgentDM 路由与面包屑

**As a** 用户
**I want** 从 Inbox 点击群聊 / 单聊条目能跳到对应视图,并能回到 Inbox
**So that** 四视图之间的切换流畅无感

**Acceptance Criteria:**

**Given** 用户在 Inbox 列表
**When** 点击群聊条目
**Then** 右侧预览更新为该群的 APPROVAL GATE 面板 + 最近 3 条消息

**And** 点击"打开完整群聊"跳转到 `/chat/:groupId`(ChatPage)

**When** 点击单聊条目
**Then** 跳转到 `/agent-dm/:agentId`(ChatPage_AgentDM)

**And** Chat / AgentDM 顶部显示面包屑 `Inbox / {groupName|agentName}`,点击返回 Inbox

### Story 7.5: 群聊切换 BriefBoard 模式(segmented control)

**As a** 用户
**I want** 在群聊里一键切换到该群的日报板
**So that** 我能看该项目的今日产出汇总,而不是逐条消息翻

**Acceptance Criteria:**

**Given** 用户在 Chat(群聊)视图
**When** 顶部显示 `Chat | BriefBoard` segmented control
**Then** 点击 BriefBoard 切换视图为该群的 BriefBoard(本群今日 Agent 日报 feed)

**And** BriefBoard UI 使用当前模板的 briefBoardAlias(Solo=日报 / Academic=组会汇报 / ...)

**And** 切换保留上下文(回到 Chat 时滚动位置还原)

### Story 7.6: 搜索 + Tab 过滤

**As a** 用户
**I want** 在 Inbox 顶部搜索群聊 / agent / 消息内容
**So that** 群多之后还能快速找到

**Acceptance Criteria:**

**Given** Inbox 列表顶部搜索框
**When** 用户输入关键词
**Then** 按群名 / agent 名 / 最后消息内容 fuzzy 过滤

**And** Tab `全部 / 单聊 / 群聊 / 未读` 状态保留

**And** 空态显示"没有匹配的会话"+ "+ 新群聊"引导

### Story 7.7: APPROVAL GATE 面板(内嵌 Inbox 预览)

**As a** 用户
**I want** 在 Inbox 右侧预览就能通过/驳回待审议条目
**So that** 我不用进到群聊里就能处理审批,降低决策摩擦

**Acceptance Criteria:**

**Given** 用户在 Inbox 选中一个有待决策的群聊
**When** 右侧预览显示
**Then** 顶部群头 4 指标胶囊条:Active Runs / Pending Approvals / Cost Today / Members

**And** 下方 APPROVAL GATE 面板列出最多 5 条待审议条目,每条含:
- 提交者 agent 头像 + 名字
- 摘要(引用段 ≤ 120 字)
- 时间戳
- [通过] / [驳回] 快捷按钮(紫色 accent)

**And** 点击通过 → `POST /api/approvals/{id}/approve`;驳回 → `POST /api/approvals/{id}/reject`(继承 Epic 1 Story 1.3 真驳回逻辑)

**And** 审议状态变更通过 SSE 事件实时更新徽章计数(继承 Epic 4 SSE 事件总线)

---

# Epic 3.6 Addendum: 模板 YAML Schema 扩展

**Parent**: Epic 3 Story 3.6(6 个种子模板 YAML 定稿 + 可运行)
**Status**: backlog
**Priority**: P0(Epic 7 依赖)

**Goal**: 把现有模板 YAML schema 从 `{policyMatrix, workflowStages}` 扩展为 `{policyMatrix, workflowStages, agentRoster, groupRoster, briefBoardAlias, userRole, defaultOpsRoomName}`,使 Epic 7 的 Inbox 按模板筛选 / 模板切换器 / Ops Room 命名 / BriefBoard 别名等能力都有数据源。

## Story 3.6.7: 模板 YAML Schema 扩展 + 6 种子模板改造

**As a** 模板编辑者 / 前端开发者
**I want** 模板 YAML 声明完整的协作上下文(不只是工作流)
**So that** Inbox / 切换器 / BriefBoard / AgentDM 能从模板直接读取所有 UI 上下文

**Acceptance Criteria:**

**Given** 模板 YAML schema 扩展
**When** 新增 5 个顶层字段
**Then** schema 如下:

```yaml
# templates/{id}.yaml 示例
id: academic-paper
name: Academic Paper
userRole: PI  # FR-Identity
defaultOpsRoomName: PI Study Room  # FR-OpsRoom
briefBoardAlias: 组会汇报  # FR-BriefBoard-Alias

agentRoster:  # 决策 7 每模板独立 agent 清单
  - id: pi
    name: PI
    soul: "课题负责人,把控研究方向与学术严谨性"
    llm: claude-sonnet-4-6
  - id: section-writer
    name: SectionWriter
    soul: "章节主笔,按 section 拆分写作任务"
  - id: citation-reviewer  # 决策 8 替代 Compliance
    name: CitationReviewer
    soul: "核对引用完整性、数据出处、结论与证据链一致性"
  - id: method-reviewer
    name: MethodReviewer
    soul: "复核实验方法与统计推断"
  - id: editorial-polisher
    name: EditorialPolisher
    soul: "文风润色与学术表达规范化"
  - id: submission-manager
    name: SubmissionManager
    soul: "会议/期刊投稿流程管理"

groupRoster:  # 决策 7 每模板独立默认群聊清单
  - id: pi-study-room
    name: PI Study Room
    agents: [pi, section-writer, citation-reviewer, method-reviewer, editorial-polisher]
    policyMatrix: academic-paper-default
  - id: submission-war-room
    name: Submission War Room
    agents: [pi, submission-manager, editorial-polisher]

policyMatrix: {...}  # 原有
workflowStages: [...]  # 原有
```

**And** 6 种子模板全部按新 schema 改造完毕:
- `solo-company.yaml` · userRole=CEO · defaultOpsRoomName=CEO Ops Room · briefBoardAlias=日报
- `academic-paper.yaml` · userRole=PI · defaultOpsRoomName=PI Study Room · briefBoardAlias=组会汇报 · agentRoster 用 CitationReviewer 替代 Compliance
- `newsroom.yaml` · userRole=Editor-in-Chief · defaultOpsRoomName=Editorial Room · briefBoardAlias=早报会
- `modern-startup.yaml` · userRole=Founder · defaultOpsRoomName=Founders Room · briefBoardAlias=Daily Standup
- `consulting.yaml` · userRole=Engagement Partner · defaultOpsRoomName=Engagement Room · briefBoardAlias=Weekly Digest · (替换原 ming-cabinet.yaml)
- `blank.yaml` · userRole=Owner · defaultOpsRoomName=(空) · briefBoardAlias=BriefBoard

**And** 后端 Python schema validator(`shadowflow/compiler/template_schema.py`)升级支持新字段(不破坏向后兼容 —— 旧 YAML 缺失字段时用合理默认)

**And** 前端 TS 类型生成(Story 0.3)自动同步到 `src/types/template.ts`

## Story 3.6.8: Template Builder Wizard(MVP 版)

**As a** 用户
**I want** 在模板切换器里点"+ 新建模板"一键走向导建自己的模板
**So that** 超出种子模板之外的场景也能玩 ShadowFlow

**Acceptance Criteria:**

**Given** 用户点击切换器下拉底部"+ 新建模板"
**When** 打开 Template Builder Wizard
**Then** 5 步向导:

1. 命名(模板 ID + 中文名 + 图标色)
2. 用户身份(userRole + defaultOpsRoomName + briefBoardAlias,提供常用预设 CEO/PI/Editor/Founder/自定义)
3. Agent Roster(从预设 agent 库多选 + 新增 +"复制自其他模板"快捷入口,决策 7 强制模板隔离,复制时要命名重映射)
4. Group Roster(至少 1 个默认 group,可选多个)
5. Policy Matrix(从预设矩阵选 + 微调)

**And** 完成后保存到 `templates/custom/{id}.yaml` 并立即可在切换器中选中

**And** MVP 版向导可降级为"导入 YAML 文件"快速路径(不要求可视化向导 UI 完备),面向黑客松 DDL 场景

**And** "+ 加入企业"入口在切换器中显示但置灰 + tooltip "Phase 3 多租户阶段启用"

---

# 对现有 Epic 的影响补丁

### Epic 4 · LiveDashboard 定位澄清

**在 Epic 4 开头补充一段(建议写入 epics.md line 514 附近):**

> **LiveDashboard 定位澄清(2026-04-16 决策 1)**:LiveDashboard 是"运行观察专家模式",**不是**日常协作入口。日常协作入口是 Inbox(Epic 7)。LiveDashboard 保留,作为进阶观察视图供技术用户深度追溯 run 细节。MVP 阶段两者并存,首屏默认落地 Inbox。

### Epic 3 · Story 3.6 范围扩大

Story 3.6 原 AC 不变,新增 3.6.7 / 3.6.8 作为补充(见本 addendum 上文)。

### Epic 6 · Story 6.3 TemplatesPage 模板清单更新

Story 6.3 的 6 模板展示中 `Ming Cabinet` 改为 `Consulting`(已在 epics.md 修订)。

---

# Data Model 补丁

```typescript
// src/types/group.ts
interface Group {
  id: string;
  templateId: string;  // 决策 7:group 绑定模板,Inbox 按模板筛选
  name: string;
  agents: AgentRef[];
  members: UserRef[];
  status: 'running' | 'blocked' | 'idle';  // FR-Inbox-3
  unreadCount: number;
  pendingApprovalsCount: number;  // FR-Group-Metrics
  metrics: {
    activeRuns: number;
    costToday: number;
    members: number;
  };
  lastMessage: MessagePreview;
  lastActivityAt: string;
}

// src/types/template.ts 扩展
interface Template {
  // 原有字段
  id: string;
  name: string;
  policyMatrix: PolicyMatrix;
  workflowStages: WorkflowStage[];
  // 新增
  userRole: string;              // 决策 9
  defaultOpsRoomName: string;    // 决策 9
  briefBoardAlias: string;       // 决策 4
  agentRoster: AgentDefinition[];  // 决策 7
  groupRoster: GroupTemplate[];    // 决策 7
  themeColor: string;             // 决策 6 模板切换器图标色
}
```

# API 补丁

```
# 新增端点
GET  /api/templates/{id}/inbox       返回该模板下的 group list + agent DM list(FR-Inbox-7)
POST /api/groups                     创建新群聊(Story 7.3)
POST /api/approvals/{id}/approve     快捷通过(Story 7.7)
POST /api/approvals/{id}/reject      快捷驳回(Story 7.7)
POST /api/templates/custom           创建自定义模板(Story 3.6.8)

# 修改端点
GET  /api/templates                  响应增加 userRole / defaultOpsRoomName / briefBoardAlias / agentRoster / groupRoster / themeColor
```

---

# Sprint 排期建议

**Sprint-A · Epic 3.6 Addendum(前置,1-2 天)**:Story 3.6.7 schema 扩展 + 6 模板改造 → 阻塞 Epic 7 所有 Story

**Sprint-B · Epic 7 核心(3-4 天)**:Story 7.1 → 7.2 → 7.4 → 7.7(最小闭环:看得到 Inbox + 跳转 + 审批)

**Sprint-C · Epic 7 完善(2-3 天)**:Story 7.3 + 7.5 + 7.6(新群流程 + BriefBoard 切换 + 搜索)

**Sprint-D · Epic 3.6 Wizard(2 天,可降级)**:Story 3.6.8 MVP 导入 YAML 版本,完整向导 UI 排到 V2

**黑客松 5/16 DDL 最小必做**:Sprint-A + Sprint-B。Sprint-C/D 视时间余量决定。
