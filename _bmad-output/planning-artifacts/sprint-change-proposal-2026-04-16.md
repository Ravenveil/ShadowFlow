---
name: sprint-change-proposal-2026-04-16
title: Sprint Change Proposal · Inbox-Centric 协作四视图 + 模板 Schema 扩展
version: 1.0
created: 2026-04-16
status: approved-batch-mode
trigger: _bmad-output/change-requests/2026-04-16-inbox-centric-collaboration.md
approver: Jy (batch mode, 一次性全跑完)
scope-classification: Moderate
handoff-to: [Developer, Product Owner]
---

# Sprint Change Proposal · 2026-04-16

## Section 1 · Issue Summary

### 问题陈述

2026-04-16 的 Pencil UI 设计会话产生了 **10 条决策**,跨越产品定位 / 信息架构 / 模板架构 / 视觉语言 / 后端 Data Model。这些决策已在 pen 稿里落地,在 memory 系统里持久化,但 **bmad planning artifacts(PRD / epics.md / sprint-status.yaml / brief)尚未反映**。

### 发现方式

- Pencil UI 会话完成后,用户问"开会话用 bmad 会知道这份 UI 设计吗?"
- 检查发现 `_bmad-output/change-requests/2026-04-16-inbox-centric-collaboration.md` 早期版本只记录了决策 1-4(会话前半段),**决策 5-10(视觉升级 + 模板架构 + 身份映射)未记录**
- 先追加 change-request 补全到决策 1-10,然后通过本次 `bmad-correct-course` 把 10 条决策回灌到全部 bmad artifact

### 证据

- Pen 侧:`d:\VScode\TotalProject\ShadowFlow\docs\design\shadowflow-ui-2026-04-16-v2.pen`(1.24 MB)完整包含 10 条决策的视觉落地
- Memory:4 份专题记忆(project_chat_briefboard_tri_view / reference_pen_file / project_pencil_design_language / feedback_no_borrowing)
- Change-request:`2026-04-16-inbox-centric-collaboration.md` 决策 1-10 齐

---

## Section 2 · Impact Analysis

### Epic Impact

| Epic | 影响 | 处理方式 |
|------|------|---------|
| Epic 0-2 | 无直接影响 | 不动 |
| Epic 3 | Story 3.6 范围扩大(模板 schema 从 2 字段扩展到 7 字段);Ming Cabinet → Consulting | epics.md 局部修订 + Story 3.6.7/3.6.8 作为 Addendum 追加 |
| Epic 4 | LiveDashboard 定位从"主入口"降级为"专家观察模式" | epics-addendum 补丁说明(Epic 7 接管主入口角色) |
| Epic 5-6 | Epic 6 Story 6.3 TemplatesPage 模板名单 `Ming Cabinet` → `Consulting` | epics.md 局部修订 |
| **Epic 7(新增)** | Collaboration Quad-View · 7 个 Story | 新建 epics-addendum-2026-04-16.md |

### Story Impact

| Story | 状态变化 | 原因 |
|-------|---------|------|
| 3-6-6-个种子模板 | AC 范围扩大 | schema 扩展 + Ming Cabinet 替换 Consulting |
| 新增 3-6-7 | backlog | 模板 YAML schema 扩展 |
| 新增 3-6-8 | backlog | Template Builder Wizard MVP |
| 6-3 TemplatesPage | AC 微调 | 模板名单更新 |
| 新增 7-1 ~ 7-7 | backlog | Collaboration Quad-View 全套 Story |

### Artifact Conflicts(已解决)

| 文件 | 改动范围 | 状态 |
|------|---------|------|
| `shadowflow-product-brief.md` | Ming Cabinet → Consulting + Academic Paper 模板 + 新增 v0.3 changelog | ✅ 已改 |
| `prd.md` | Ming Cabinet → Consulting(line 215 + 779)+ FR1 扩展 + 新增 `### 协作四视图 & AI 员工化` 段(13 条 FR) | ✅ 已改 |
| `epics.md` | FR1 + AR28 + Epic 3 Goal + Story 6.3 AC + 借鉴措辞软化(line 315/374/887) | ✅ 已改 |
| `sprint-status.yaml` | 新增 Epic 7 section + Epic 3.6 新 story 行 + last_updated 时间戳 | ✅ 已改 |
| `epics-addendum-2026-04-16.md` | 新建 Epic 7 全 7 个 Story + 3.6.7/3.6.8 + Data Model + API 补丁 | ✅ 已建 |

### Technical Impact

**Data Model 新字段(见 epics-addendum Data Model 补丁):**
- `Template.userRole / defaultOpsRoomName / briefBoardAlias / agentRoster / groupRoster / themeColor`
- `Group.templateId / status / pendingApprovalsCount / metrics.{activeRuns, costToday, members}`

**API 新端点:**
- `GET /api/templates/{id}/inbox`(FR-Inbox-7 按模板筛选)
- `POST /api/groups`(Story 7.3 新群聊)
- `POST /api/approvals/{id}/approve|reject`(Story 7.7 APPROVAL GATE)
- `POST /api/templates/custom`(Story 3.6.8 Wizard)

**前端组件新增:**
- `InboxPage` / `InboxMessageList` / `InboxPreview` / `ApprovalGatePanel` / `GroupMetricsBar`(Epic 7)
- `TemplateSwitcher`(在 `SidebarNav` 顶部,占用原 Logo 位)
- `NewGroupWizard`(5 步向导,Story 7.3)
- `TemplateBuilderWizard`(MVP 导入 YAML 版本,Story 3.6.8)

**Brand 变更:**
- SF Logo 从产品主界面撤出,仅保留于 LandingPage / AboutPage / 启动画面(模板切换器占用 Logo 位)

---

## Section 3 · Recommended Approach

### 采用路径: Direct Adjustment · Moderate Scope

**选择理由:**
- 10 条决策均为**增量/替换**,无需回滚已完成工作
- Pen 稿已完整,开发者可直接参照 pen 实现 Epic 7 UI
- 原 Epic 3-6 架构不需要推翻,只需:
  - Epic 3.6 扩展 schema(Story 3.6.7 前置依赖 Epic 7)
  - Epic 4 调整定位说明(非代码改动)
  - Epic 6 更新模板名单

### 不采用的路径

- ❌ **Rollback**:决策全部是新增能力,无工作可回滚
- ❌ **MVP 重审**:Epic 7 反而是更接近 MVP 核心价值(协作入口)的能力;不缩 scope 而是补齐原本缺失的入口叙事

### Effort Estimate

| 阶段 | 工作量 | 关键路径 |
|------|-------|---------|
| Sprint-A · Epic 3.6.7 schema 扩展 | 1-2 天 | 阻塞 Epic 7 |
| Sprint-B · Epic 7 核心闭环(7.1/7.2/7.4/7.7) | 3-4 天 | Inbox + 跳转 + 审批 |
| Sprint-C · Epic 7 完善(7.3/7.5/7.6) | 2-3 天 | 新群流程 + 切换 + 搜索 |
| Sprint-D · Epic 3.6.8 Wizard | 1-2 天(降级到导入 YAML) | 可选,视 DDL 余量 |
| **总计** | **7-11 天** | **黑客松 5/16 DDL 最小必做:Sprint-A + Sprint-B(≤ 5-6 天)** |

### Risk Assessment

| 风险 | 概率 | 对冲 |
|------|------|------|
| Epic 7 挤占 Epic 4-6 开发时间 | 高 | Epic 7 先于 LiveDashboard 完善;Epic 4 保留但降级为专家模式,可后置 |
| Data Model 扩展破坏既有 runtime | 中 | 新字段可选,旧 YAML 缺失时用默认;Story 3.6.7 AC 明确写了"不破坏向后兼容" |
| Template Builder Wizard 复杂度 | 中 | MVP 降级为"导入 YAML 文件"路径,完整 UI 向导排到 V2 |
| 模板串货边界执行不严 | 中 | 后端 API `/api/templates/{id}/inbox` 强制 scope,前端不提供全局视图 |

### Timeline Impact

**对黑客松 5/16 DDL 的影响:**
- Epic 7 Sprint-A + Sprint-B 必做(~5-6 天),挤压 Epic 5(0G 集成)和 Epic 6(Demo Station)的 buffer
- 建议:Epic 5 Story 5.4(0G Compute)与 Epic 7 可并行(不同开发者 / 不同目录)
- 兜底策略:如果 DDL 紧张,Story 7.5(BriefBoard 切换)和 7.6(搜索)可降级为 V1.1

---

## Section 4 · Detailed Change Proposals(已执行)

### 4.1 Stories

**新建 epics-addendum-2026-04-16.md 包含:**

| Story | 描述 | Status |
|-------|------|--------|
| 7.1 | Inbox 页框架(三列布局) | backlog |
| 7.2 | 消息列表项 + 分组 + 徽章 | backlog |
| 7.3 | "+ 新群聊"流程(新项目 = 新群) | backlog |
| 7.4 | Inbox → Chat / AgentDM 路由与面包屑 | backlog |
| 7.5 | 群聊切换 BriefBoard 模式 | backlog |
| 7.6 | 搜索 + Tab 过滤 | backlog |
| 7.7 | APPROVAL GATE 面板(内嵌预览) | backlog |
| 3.6.7 | 模板 YAML schema 扩展 + 6 种子模板改造 | backlog |
| 3.6.8 | Template Builder Wizard MVP | backlog |

### 4.2 PRD 修改

**文件:** `_bmad-output/planning-artifacts/prd.md`

| 修改 | 位置 | 内容 |
|------|------|------|
| Ming Cabinet → Consulting | line 215 | 模板清单表第 5 行 |
| FR1 扩展 | line 779 | 模板名单更新 + 追加"每模板独立 roster + 身份 + 别名,不串货" |
| 新增 `### 协作四视图 & AI 员工化` | line 844 后 | 13 条新 FR(FR-Inbox-1~7 / FR-Template-Switcher×2 / FR-Identity / FR-OpsRoom / FR-BriefBoard-Alias / FR-Group-Metrics)+ 信息架构 ASCII 图 |

### 4.3 Architecture 修改

**待处理(未在本轮完成,建议独立会话跑):**
- `architecture.md` 需要补 Data Model 新字段图表 + 新 API 端点章节
- 本轮 epics-addendum 已提供 Data Model / API 补丁片段,可直接 import 到 architecture.md

### 4.4 UI/UX 规格

**Pen 稿已是事实 UX spec:**
- 位置:`d:\VScode\TotalProject\ShadowFlow\docs\design\shadowflow-ui-2026-04-16-v2.pen`(1.24 MB)
- 覆盖:EditorPage / InboxPage / ChatPage / AgentDM / BriefBoard / TemplatesPage / LandingPage / AboutPage 全套中英双版
- 开发者 Epic 7 实现时:以 pen 稿为 ground truth,Story 7.1-7.7 AC 作为行为契约

**未来若需正规 UX spec 文档:** 跑 `/bmad-create-ux-design` 从 pen 稿自动提取(本轮未做)。

---

## Section 5 · Implementation Handoff

### Scope 分类: **Moderate**

- 不是 Minor(跨多 artifact + 新增 Epic + Data Model 变更)
- 不是 Major(不推翻架构,不调整 MVP 范围,pen 已就位)

### Handoff 接收方

**主要接收方:** Developer(开发者自己)
**协同方:** Product Owner(Jy 自任)

### Deliverables 已产出

✅ `shadowflow-product-brief.md` 修订(4 处)
✅ `prd.md` 修订(FR-Inbox 段 + Ming→Consulting 2 处)
✅ `epics.md` 修订(7 处:FR1 / AR28 / 借鉴措辞 ×3 / Epic 3 Goal / Story 6.3 AC)
✅ `epics-addendum-2026-04-16.md` 新建(Epic 7 + 3.6.7/3.6.8 + Data Model + API)
✅ `sprint-status.yaml` 更新(+ 9 行 story:3.6.7/3.6.8 + 7.1~7.7 + epic-7 section)
✅ `sprint-change-proposal-2026-04-16.md` 本文件

### 成功标准(Implementation Success Criteria)

**Epic 3.6.7 验收:**
- [ ] 6 种子模板全部有 userRole / defaultOpsRoomName / briefBoardAlias / agentRoster / groupRoster / themeColor 字段
- [ ] `consulting.yaml` 存在,`ming-cabinet.yaml` 删除
- [ ] Python validator 向后兼容旧 YAML(缺字段用默认)

**Epic 7 最小闭环验收(Sprint-A + B 完成):**
- [ ] 用户登录后首屏进入 Inbox(非 LiveDashboard)
- [ ] Inbox 三列布局渲染正常,参照 pen `InboxPage` (34BOB) 视觉
- [ ] 点群聊 → 右侧预览出现 APPROVAL GATE 面板 + 指标条
- [ ] 点模板切换器展开下拉,切换到 Academic Paper 后列表只显示该模板下的 group / agent(不串货)
- [ ] APPROVAL GATE [通过] / [驳回] 能真实触发 Policy Matrix 驳回流(Epic 1 Story 1.3 已有能力)

**黑客松 5/16 成功标准(含本次变更):**
- [ ] Demo 从 Inbox 出发,选模板 → 开新群聊 → 拉 AI 员工 → 运行 → 看板 → 审批驳回 → 归档 0G(完整叙事)
- [ ] 模板切换器在场展示"AI 员工在公司架构下工作"的叙事

### 下一步(Next Actions)

1. **✅ DONE**: 本次 correct-course 所有 artifact 已更新
2. **NEXT**: 新会话跑 `/bmad-check-implementation-readiness` 确认 Epic 7 + 3.6 新 story 与 PRD / architecture 无断链
3. **NEXT**: 新会话跑 `/bmad-sprint-status` 查看下一个该做的 story(建议 Story 3.6.7 前置)
4. **NEXT**: 进入 dev 循环 — `/bmad-create-story` → `/bmad-dev-story` → `/bmad-code-review`
5. **OPTIONAL**: 如需正规 UX spec 文档,跑 `/bmad-create-ux-design` 从 pen 稿提取
6. **OPTIONAL**: 新会话更新 `architecture.md` Data Model 章节(import 本 proposal 里 Data Model 补丁)

---

## 本次 correct-course 执行日志

**执行模式:** Batch(用户明确"一次性全跑完",跳过 Incremental 逐条 approve)
**执行时长:** ~1 小时(本会话内)
**执行范围:** 决策 1-10 全量回灌
**未完成项:**
- architecture.md 的 Data Model 章节补丁(已在本 proposal 提供片段,待独立会话 import)
- docs/DESIGN.md / docs/AgentGraph-Design-Doc.md 的 Edict 借鉴叙事清理(本次只处理 `_bmad-output/planning-artifacts/` 下的 artifact)

**建议下个会话:**
- 优先跑 `/bmad-check-implementation-readiness` 发现任何遗漏
- 如 readiness report 提示 architecture.md 断链,再独立跑一次 correct-course 针对 architecture(本轮不做避免 context 膨胀)

---

**Proposal 状态:** ✅ 已执行,所有 Deliverable 已产出
**Workflow 完成信号:** "Correct Course workflow complete, Jy!"
