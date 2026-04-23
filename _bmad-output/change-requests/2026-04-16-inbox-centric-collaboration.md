---
name: Inbox-Centric 协作四视图 + AI 员工化愿景
created: 2026-04-16T17:00:00Z
status: proposed
driver: user
source-session: Pencil UI 设计会话（2026-04-16）
target-artifacts: [prd.md, epics.md, architecture.md, shadowflow-product-brief.md, sprint-status.yaml]
recommended-next-skill: bmad-correct-course
---

# Change Request · 2026-04-16 · Inbox-Centric 协作

## 背景

2026-04-16 Pencil UI 会话中，用户对 ShadowFlow 的核心产品定位与信息架构提出了贯穿 UI / 后端 / PRD 的一组决策。pen 层面已落地，但 bmad 产物（PRD / Epics / Stories / sprint-status）尚未反映。本文档是 `bmad-correct-course` 的输入。

## 四条核心决策

### 决策 1 · 协作视图从"三视图"升级为"四视图"

**变更：** 在 Chat（群聊）+ AgentDM（单聊）+ BriefBoard（日报板）三者之上，**新增 Inbox（消息列表）作为顶层入口**。

**参照：** 钉钉 / 飞书 / 企业微信的三列消息面板（窄导航 / 会话列表 / 当前会话）。**仅参照消息列表的信息架构**——不参照钉钉的文档/表格/听记/日历/DING 等工具套件功能。

**Pen 已完成：**
- `InboxPage_CN` (T9IrP) @ canvas (1500, 9760)
- `InboxPage` (34BOB) @ canvas (0, 9760)
- 三列布局：72px 窄导航（消息/模板/运行/归档 + 头像）+ 360px 消息列表（6 条示例：3 群聊 + 3 单聊）+ 1008px 右侧选中预览（群头部 + 3 条消息 + 两个大按钮"打开完整群聊 / 查看 BriefBoard"）

**对 PRD 的影响：**
- Functional Requirements 需新增 "FR-Inbox" 段，描述顶层消息列表能力
- 信息架构图需更新（PRD 若有 IA diagram）

**对 Epics 的影响（建议新增 Epic 7）：**
- **Epic 7 · Collaboration Tri-View (Inbox + Chat + AgentDM)**
  - Story 7.1 · Inbox 页框架（窄导航 + 列表 + 预览三列）
  - Story 7.2 · 消息列表项数据结构（单聊/群聊联合类型，未读/状态圆点/badge）
  - Story 7.3 · "+ 新群"流程：新建项目 = 新建群聊 + 选 AI 员工 + 邀请人类成员
  - Story 7.4 · Inbox → Chat / AgentDM 路由与面包屑
  - Story 7.5 · 群聊切换 BriefBoard 模式（segmented control）
  - Story 7.6 · 搜索 + Tab 过滤（全部/单聊/群聊/未读）

**对 Epic 4（Live Dashboard）的影响：**
- LiveDashboard 的定位需要厘清：它是"运行观察"（专家模式），**不是**日常协作入口。日常协作入口是 Inbox。
- 需要在 Epic 4 开头补充这一关系说明

### 决策 2 · 核心产品愿景："AI 员工在公司架构下与人共同工作"

**原话摘录：**
> 新项目可以直接开一个新群聊，然后把人拉进来，就开始干这个项目。AI 团队也可以像人在公司里面干活一样，AI 也可以在这种公司的架构下面去干活，这样的话就能够实现 AI 和人共同工作。

**内涵：**
1. **项目即群聊**：创建新工作 = 新开一个群聊 Room，把 AI 员工 + 人拉进来
2. **AI 员工化**：每个 AI Agent 是公司的一个员工，不是独立工具——有岗位（SOUL 角色）、工作产出、日报、@协作
3. **人机混合**：人与 AI 在同一个消息流里互相@、审议、驳回，没有主从之分
4. **公司架构**：组织层级（CEO / 内容官 / 合规官 等）由 Policy Matrix 定义，不是外置治理

**对 PRD 的影响：**
- "产品定位" 段需要更新为"AI 员工公司"叙事
- "目标用户" 段保持不变（一人公司 / 创业公司 / 新闻工作室 / DAO）
- "核心解决方案 5 步" 可扩写为"1. 开新群聊 2. 拉 AI 员工 3. 立法 Policy Matrix 4. 运行 5. 传承"
- 竞品对比段应强化：钉钉/飞书是人-人协作，ShadowFlow 是人-AI 协作（有了 AI 员工可以 7×24 干活）

**对 shadowflow-product-brief.md 的影响：**
- line 125 "公开致敬 Edict 证明了三省六部可行" → **删除**（见决策 3）
- line 122 "Ming Cabinet" 种子模板（明朝官制主题） → **建议替换**为中性场景模板（如 "Consulting Team" 或 "DAO Governance"）
- 首批用户画像保持不变但可以加一句"想拥有 AI 员工团队"

### 决策 3 · 不借鉴原则（叙事原则）

**原话：** "别借鉴了，这个东西应该在权限矩阵里面，而且也不能抄人家的。"

**Why:** 借鉴/致敬其他产品的术语（Edict 三省六部 / 门下省 / 军机处 / 明朝官制等）会：
(a) 让 ShadowFlow 看起来像衍生品
(b) 让学术/SaaS 场景模板出现不相关的古代制度术语（如 Academic Paper 模板里出现"门下省"属于错配）
(c) 审批/驳回机制在 ShadowFlow 架构里由 **Policy Matrix** 承载，是自己的原创抽象，不需要也不应该借壳别人的制度比喻

**How to apply：**
- 所有外部产品术语（门下省/三省六部/军机处/Ming Cabinet 内阁+司礼监+六部+都察院）从 PRD / Epics / Stories / Brief / Architecture 文档中清理
- 未来任何设计/文档/pen 都不再用"致敬/借鉴/参考 XX"的措辞
- 竞品分析可以保留（"Edict 做了 X，我们做 Y"），但不写"我们致敬 X"
- 自己的术语：`Policy Matrix` / `ApprovalGate` / `Workflow Token` / `Agent` / `SOUL` / `Stage` / `BriefBoard` / `Inbox` / `Chat` / `AgentDM`

**待清理清单（确切位置，供 bmad-correct-course 使用）：**

| 文件 | 行号 | 原内容 | 处理 |
|------|------|-------|------|
| `shadowflow-product-brief.md` | 125 | 公开致敬 Edict 证明了三省六部可行 | 删除整段"对 Edict 的态度" |
| `shadowflow-product-brief.md` | 122 | Ming Cabinet 种子模板（比三省六部更深） | 替换为中性场景模板 |
| `shadowflow-product-brief.md` | 74, 138 | Edict 作为竞品对照 | **保留**（竞品分析不是借鉴） |
| `docs/AgentGraph-Design-Doc.md` | 359 | 参考实现：三省六部（Edict） | 删除 |
| `docs/DESIGN.md` | 927 | 三权分立 Edict: 分权制衡、看板设计 | 删除描述，保留 GitHub 链接作参考 |
| `prd.md` | 614 | Edict 写死三省六部 | **保留**（竞品分析不是借鉴） |

### 决策 4 · BriefBoard 命名策略

**技术名固定：** `BriefBoard`（英文，Spec 层使用）
**模板 UI 别名允许用户改：**

| 模板 | 别名 |
|------|------|
| Solo Company | 日报 |
| Academic Paper | 组会汇报 |
| Modern Startup | Daily Standup |
| Newsroom | 早报会 |
| Consulting | Weekly Digest |

**禁用别名：** 奏折、奏章（不借鉴明朝官制，即使用户提过）、军机处（edict 术语）

**对 PRD / Architecture 的影响：**
- Data Model 需要 `template.alias.briefBoard: string` 字段
- 前端 i18n 需要按模板加载别名
- 默认别名从模板 YAML 读取（Epic 3.6 6 个种子模板需要配置各自别名）

## Pen 侧完成清单（2026-04-16）

✅ EditorPage: 6 处"门下省 / 三省六部"文本清理为 Policy Matrix 术语
✅ EditorPage: SectionWriter 节点加迷你进度条（14px 圆角 + 蓝色 65% 进度）
✅ EditorPage: 7 张节点卡片应用 14px 圆角
✅ EditorPage: 画布加 120px 间距点阵网格（49 点，z-order 最底层）
✅ EditorPage: 28 处"封驳→驳回"术语统一
✅ BriefBoard_CN (Ues6S) + BriefBoard (IoxlF) 中英双版完成
✅ InboxPage_CN (T9IrP) + InboxPage (34BOB) 中英双版完成
✅ 设计语言确立：深色 #0D1117 / Tailwind 中性色 / 14px 圆角 / 不借鉴 edict 色板

## bmad 推荐路径

**下一步：** 新开 fresh-context 会话跑 `bmad-correct-course`，引用本文件为 `change-request` 输入：

```
/bmad-correct-course
附输入: _bmad-output/change-requests/2026-04-16-inbox-centric-collaboration.md
```

correct-course 应产出：
1. 更新的 PRD（新增 FR-Inbox + 更新产品定位）
2. 更新的 epics.md（新增 Epic 7，更新 Epic 3.6 模板清单、Epic 4 定位）
3. 新增 Story 7.1-7.6（Inbox 相关）
4. 更新的 sprint-status.yaml（新增 Epic 7 行）
5. 清理 brief / DESIGN / AgentGraph-Design-Doc 中的借鉴叙事
6. Ming Cabinet 模板的替换方案（或删除方案）

## 风险与权衡

- **Epic 7 进入 Sprint 会挤占 Epic 4-6 的开发时间** — 但 Inbox 是用户体验核心，先于 LiveDashboard / LandingPage / Templates Gallery 价值更高
- **后端需支持"群聊室"模型** — 原架构以单次 run 为中心，现在需要支持"持久群聊 Room"，可能影响 Policy Matrix 的作用域设计（每群一套 Policy Matrix？）
- **删除 Ming Cabinet 会让"差异化模板"少一个** — 但与"不借鉴"原则冲突无法调和；需补一个替代模板（建议 Consulting Team 或 DAO Governance）

---

## 2026-04-16 晚间追加决策（补遗）

本节为同日晚间 pen 视觉升级 + 模板架构确认环节产生的 6 条新决策。已同步到 memory，尚未进入 PRD/Epic。本文件作为 `bmad-correct-course` 单一真源，下游 correct-course 会话应一并处理决策 1–10。

### 决策 5 · 方案 C 视觉升级（群聊预览 / Inbox 信息密度）

**变更：** Inbox 右侧"当前会话预览"从初版信息稀薄升级为高密度群聊全景，确立紫色 accent 为"协作态"视觉语言。

**Pen 已完成（`InboxPage_CN` T9IrP / `InboxPage` 34BOB）：**
- **紫色 accent `#A78BFA`** 作群聊/协作状态的视觉锚——区别于 EditorPage 的蓝色（运行态）、BriefBoard 的绿色（产出态）
- **消息列表分组**：`TEAM RUNS` / `AGENT DMs` 两段 section header（10px Mono 600 uppercase），替代原平铺列表
- **DECISIONS 徽章**：群聊列表项右侧加"📋 3"小徽章指示待决策数，点击跳 APPROVAL GATE
- **状态胶囊**：列表项加 `Running` / `Blocked` / `Idle` 三态胶囊（绿/橙/灰 8px radius）
- **群头指标条**：右侧预览顶部加一条 4 指标胶囊（Active Runs / Pending Approvals / Cost Today / Members）
- **APPROVAL GATE 大审批面板**：替代原"打开完整群聊"大按钮，直接在预览里陈列待审议条目（引用段 + 通过/驳回 快捷按钮）

**对 PRD / Epics 的影响：**
- Epic 7 Story 7.1（Inbox 页框架）需把"高密度信息架构"列为验收点——不是低保真消息列表
- 新增 Story 7.7 · APPROVAL GATE 面板（从群预览直接审议，无需点进群聊）
- Data Model：`Group.pendingApprovalsCount: int` / `Group.metrics: {activeRuns, cost, members}` 字段进入 API schema

### 决策 6 · 模板切换器位置：左窄导航顶部，占用原 SF Logo 位

**变更：** ShadowFlow 的"工作空间切换"放在**左窄导航最顶部 `x=12 y=16 w=48 h=48`**，取代 SF Logo。设计参照钉钉左上角的"企业切换"。

**Pen 已完成：**
- CN 用"学术 ▾"、EN 用"Academic ▾"作当前模板标签（10px Mono 在图标下方 y=68）
- 图标色随模板主色：Academic Paper = AP 红 `#EF4444`、Solo Company = 蓝、Newsroom = 橙
- **SF Logo 已删除**——切换器直接占用 Logo 位，不共存
- 历史：曾尝试放中列表顶部（钉钉大横条样式）→ 用户判断位置不对 → 恢复到左窄导航 Logo 位

**对 PRD / Architecture 的影响：**
- PRD 信息架构图需标注"左窄导航顶部 = 模板切换器"作为全局入口
- 前端导航组件 `SidebarNav` 需要`currentTemplate` prop 并渲染切换器
- Brand：SF Logo 从产品主界面撤出（仅保留在 LandingPage / AboutPage / 启动画面）

### 决策 7 · 模板串货原则：每模板独立 agent roster + group roster

**原话（用户两次强调）：** Academic Paper 里不能有 CEO / Compliance，Solo Company 里不能有 PI / SectionWriter。

**Why:** 若不同模板的 agent / group 互串，用户切换模板时认知成本剧增，模板也失去"一键进入特定工作场景"的价值。"Academic Paper + CEO"本身就是错配。

**How to apply:**
- **前端：** InboxPage 按当前模板筛选 group list + agent DM list（不是全局收件箱）。切换模板 = 切换整个上下文（列表 / 群聊 / 员工 / BriefBoard 别名全部换）
- **后端 Data Model：** 每个 Template 定义独立 `agentRoster: Agent[]` + `groupRoster: GroupTemplate[]`
- **后端 API：** `/api/templates/{id}/inbox` 返回该模板下的 group list + agent DM list；**不存在**跨模板的 `/api/inbox/all`
- **Epic 3.6 · 种子模板扩展：** 每个种子模板 YAML 除原有 policy matrix + workflow stages 外，还需定义 agentRoster + groupRoster + briefBoardAlias 三个字段

**对 Epics 的影响：**
- Epic 3.6（种子模板）Story 范围扩大——每个模板需同时设计 roster + default groups + alias
- 建议新增 Story 3.6.7 · 模板 YAML schema 扩展到 `{policyMatrix, workflowStages, agentRoster, groupRoster, briefBoardAlias}`

### 决策 8 · CitationReviewer 替代 Compliance（Academic Paper 模板）

**变更：** Academic Paper 模板下，原 MVP 6 岗位里的 `Compliance`（合规官）**不适配学术场景**——学术论文里没有"合规官"这个角色，审计由"引用与证据复核"承担。

**命名：** `CitationReviewer`（引用复核员）——负责核对引用完整性、数据出处、结论与证据链一致性。

**Why:** Compliance 是企业场景术语，学术写作的等价审计职能是 citation/reference 审核。保留 Compliance 会让 Academic 模板错误地借用企业合规词汇，违反决策 7（模板不串货）+ 决策 3（不借用不相关领域术语）。

**对 PRD / Epics 的影响：**
- Epic 3.6 · Academic Paper 模板 agent roster：`PI / SectionWriter / CitationReviewer / MethodReviewer / EditorialPolisher / SubmissionManager`（示例草案，以最终 brief 定稿为准）
- Policy Matrix 的 role 枚举需要按模板定义——不是全局共享 `[CEO, Editor, Compliance, ...]`

### 决策 9 · "我"的身份随模板切换（Ops Room 命名）

**变更：** 用户的身份随当前模板变化，不是固定的"User"。AgentDM 的"老板视角"设定按模板投射：

| 模板 | 用户身份 | 对应"常驻群聊"命名 |
|------|---------|--------------------|
| Solo Company | CEO | `CEO Ops Room`（一人公司的指挥室） |
| Academic Paper | PI（Principal Investigator） | `PI Study Room`（课题组例会室） |
| Newsroom | Editor-in-Chief | `Editorial Room`（总编办公室） |
| Modern Startup | Founder | `Founders Room` |
| Consulting | Engagement Partner | `Engagement Room` |
| DAO Governance | Steward | `Steward Room` |

**Why:** 延续决策 7 的模板不串货原则，同时避免 Inbox/Chat 在 Academic 场景里出现"CEO Ops Room"这种错配。

**对 PRD / Epics 的影响：**
- PRD "目标用户" 段可列这张映射表
- Epic 3.6 模板 YAML 新增 `userRole: string` + `defaultOpsRoomName: string` 两字段
- AgentDM 右栏的 "SOUL" + "CURRENT TASK" 卡片 header 文案应按模板投射用户身份

### 决策 10 · "+ 新模板/企业"入口（切换器展开后提供）

**变更：** 模板切换器下拉展开后，列表底部提供 "**+ 新建模板 / 加入企业**" 入口——对标钉钉"创建或加入企业"。

**语义：**
- **新建模板**：用户自定义一套 workflow stages + policy matrix + agent roster + group roster（进阶，可能要 Template Builder Wizard）
- **加入企业**（未来态 / 多租户场景）：接受他人分享的模板 invite link，进入 shared template 上下文

**Why:** 种子模板 6 套之外，ShadowFlow 的长期粘性取决于用户能自己造模板。切换器是最自然的入口——切换模板 = 切换工作空间。

**MVP 范围：**
- Pen 只画常态（不画展开），展开态由前端实现（不进 pen 第一轮）
- Epic 3.6 MVP 只实现"新建模板"，"加入企业"排期在多租户阶段（post-MVP）

**对 Epics 的影响：**
- 建议新增 Story 3.6.8 · Template Builder Wizard（5 步向导：命名 → agent roster → group roster → policy matrix → workflow stages）
- 排期判断：如果 Hackathon 时间紧，Wizard 可以只做 MVP 的"导入 YAML"版本，视觉向导排到 V2

---

## 合并后的 correct-course 输出清单（决策 1–10）

下游 `bmad-correct-course` 会话应产出：

1. 更新的 PRD：FR-Inbox / 产品定位改为"AI 员工公司"/ 信息架构含模板切换器 / "我"的身份随模板映射表
2. 更新的 epics.md：新增 Epic 7 · Collaboration Quad-View，更新 Epic 3.6 模板 YAML schema，Epic 4 LiveDashboard 定位说明
3. 新增 Story 7.1 – 7.7（Inbox 框架 / 数据结构 / 新群流程 / 路由 / BriefBoard 切换 / 搜索过滤 / APPROVAL GATE 面板）
4. 新增 Story 3.6.7 – 3.6.8（模板 YAML schema 扩展 / Template Builder Wizard）
5. 更新的 sprint-status.yaml：新增 Epic 7 行 + Epic 3.6 新 story 行
6. 清理 brief / DESIGN / AgentGraph-Design-Doc 中的借鉴叙事（决策 3 清理清单）
7. Ming Cabinet 模板替换方案（Consulting Team 或 DAO Governance）
8. Data Model 变更：`Group.pendingApprovalsCount` / `Group.metrics` / `Template.agentRoster` / `Template.groupRoster` / `Template.briefBoardAlias` / `Template.userRole` / `Template.defaultOpsRoomName`
9. Architecture 变更：`/api/templates/{id}/inbox` API 设计，前端 `SidebarNav` 组件引入模板切换器 prop
10. Brand 变更：SF Logo 从产品主界面撤出，仅保留于 LandingPage / AboutPage / 启动画面
