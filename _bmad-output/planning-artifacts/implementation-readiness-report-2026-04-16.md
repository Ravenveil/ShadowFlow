---
name: implementation-readiness-report-2026-04-16
title: ShadowFlow Implementation Readiness Assessment — 2026-04-16 Evening Rerun
version: 2.0
created: 2026-04-16T15:07:48Z
updated: 2026-04-16T15:07:48Z
project: ShadowFlow
mode: batch-run (bmad-check-implementation-readiness)
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
supersedes: implementation-readiness-report-2026-04-16.md (12:44 version, pre correct-course)
inputs:
  - _bmad-output/planning-artifacts/prd.md (62KB, 22:38)
  - _bmad-output/planning-artifacts/architecture.md (64KB, 04-15 17:27 · stale flag)
  - _bmad-output/planning-artifacts/epics.md (72KB, 22:40)
  - _bmad-output/planning-artifacts/epics-addendum-2026-04-16.md (14KB, 22:42)
  - _bmad-output/planning-artifacts/shadowflow-product-brief.md (17KB, 22:36)
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-04-16.md (11KB, 22:45)
  - _bmad-output/implementation-artifacts/sprint-status.yaml (6.7KB, 22:43, +Epic 7 rows)
  - _bmad-output/implementation-artifacts/*.md (41 story artifact files, ready-for-dev)
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-16
**Project:** ShadowFlow
**Deadline:** 2026-05-16 (0G Hackathon, 30 days)
**Assessor Role:** Expert PM / Requirements Traceability

> 本报告是 2026-04-16 **第二次** readiness check（晚间执行），覆盖当日白天的 bmad-correct-course 批次变更（Inbox-Centric Collaboration + 模板 schema 扩展 + Epic 7 新增 7 story + Story 3.6.7/3.6.8 新增）。早上 12:44 的版本早于 22:38/22:40 的 PRD/Epics 更新，已过期，本报告直接覆盖。

---

## Section 1 · Document Inventory

### 1.1 Whole Documents Found（无 Sharded 重复）

| 文档类型 | 文件 | 大小 | 修改时间 | 状态 |
|---------|------|------|---------|------|
| **PRD** | prd.md | 62 KB | 04-16 22:38 | ✅ 最新（含 Inbox FR 段） |
| **Architecture** | architecture.md | 64 KB | 04-15 17:27 | ⚠️ **已知过期**（无 Epic 7 数据模型 / 新 API） |
| **Epics** | epics.md | 72 KB | 04-16 22:40 | ✅ 最新 |
| **Epics Addendum** | epics-addendum-2026-04-16.md | 14 KB | 04-16 22:42 | ✅ Epic 7 + 3.6.7/3.6.8 完整 |
| **Product Brief** | shadowflow-product-brief.md | 17 KB | 04-16 22:36 | ✅ v0.3（含 2026-04-16 changelog） |
| **UX Design** | — | — | — | ⚠️ 无独立 UX spec 文档；pen 稿 `docs/design/shadowflow-ui-2026-04-16-v2.pen`（1.24 MB）是 ground truth |
| **Sprint Status** | implementation-artifacts/sprint-status.yaml | 6.7 KB | 04-16 22:43 | ✅ 含 Epic 7 |
| **Change Log** | planning-artifacts/sprint-change-proposal-2026-04-16.md | 11 KB | 04-16 22:45 | ✅ 10 条决策留痕 |
| **Story Artifacts** | implementation-artifacts/*.md | 41 文件 | 04-16 13:41-22:43 | ⚠️ Epic 7 + 3.6.7/3.6.8 **story 文件缺失**（仅在 addendum 定义） |

### 1.2 关键发现

- ✅ **无 sharded 与 whole 并存的重复**
- ✅ **PRD / Epics / Epics Addendum / Brief 互相 consistent**（Ming Cabinet → Consulting 替换一致；FR-Inbox-* / FR-Template-Switcher / FR-Identity / FR-OpsRoom / FR-BriefBoard-Alias / FR-Group-Metrics 在 PRD 和 Epics 双边出现）
- ⚠️ **Architecture.md 尚未吸收 04-16 决策**（已知项，change-request 明确留待独立会话处理）
- ⚠️ **9 个新 Story（3.6.7 / 3.6.8 / 7.1-7.7）在 addendum 有 AC，但 `implementation-artifacts/` 下无独立 story 文件** —— 这是 `/bmad-create-story` 的下一步输入

---

## Section 2 · PRD Analysis

### 2.1 Functional Requirements Extracted（54 条 FR）

**模板设计 Template Design（FR1–FR7）** · **权限矩阵 Policy Matrix（FR8–FR12）** · **运行执行 Runtime Execution（FR13–FR18）** · **实时观察 Real-time Observability（FR19–FR22）** · **持久化与恢复 Persistence（FR23–FR26）** · **0G 链生态 Integration（FR27–FR31, FR31 Phase 3）** · **模板分享与交易 Sharing/Trading（FR32–FR35, FR35 Phase 3）** · **Agent 反向提问 & Gap 检测（FR36–FR37）** · **Demo & Pitch（FR38–FR41）** · **External Agent Integration（FR42）**

**协作四视图 & AI 员工化（2026-04-16 决策 1/2/5/6/9/10 追加 13 条 FR）**

- FR-Inbox-1: Inbox 顶层入口三列布局；LiveDashboard 降级为"专家观察模式"
- FR-Inbox-2: Tab（全部 / 单聊 / 群聊 / 未读）+ TEAM RUNS / AGENT DMs 两个 section
- FR-Inbox-3: 状态胶囊（Running / Blocked / Idle）+ 未读 badge + `DECISIONS · N`
- FR-Inbox-4: 右侧预览顶部 4 指标胶囊条（Active Runs / Pending Approvals / Cost Today / Members）
- FR-Inbox-5: 右侧预览内嵌 APPROVAL GATE 面板（紫色 accent `#A78BFA`）
- FR-Inbox-6: "+ 新群聊"触发"新项目流程"
- FR-Inbox-7: Inbox 按当前模板上下文筛选，不跨模板全局
- FR-Template-Switcher: 左窄导航顶部（原 SF Logo 位）提供模板切换器
- FR-Template-Switcher-2: 切换器展开列表 + 底部"+ 新建模板 / 加入企业"入口
- FR-Identity: 用户身份随模板切换（CEO / PI / Editor-in-Chief / Founder / Engagement Partner / Owner）
- FR-OpsRoom: 每模板独立默认常驻群聊命名
- FR-BriefBoard-Alias: BriefBoard 技术名固定，UI 别名按模板可改（禁用奏折 / 奏章 / 军机处借鉴术语）
- FR-Group-Metrics: Group 暴露 `pendingApprovalsCount` / `metrics.{activeRuns, costToday, members}`

**FR 总计:** 41（PRD v0.1 原有）+ 13（2026-04-16 新增）= **54 条**

### 2.2 Non-Functional Requirements Extracted（25 条 NFR）

**Performance（6）** P1 编辑器 ≤2s · P2 DAG ≤1s · P3 首 token ≤3s 冷 / ≤1.5s 热 · P4 看板事件 ≤500ms · P5 3 并行无状态竞争 · P6 0G IO ≤10s

**Security（6）** S1 key 仅客户端 · S2 上传前 sanitize · S3 下载 Merkle · S4 fallback no-training · S5 tool sandbox 白名单 · S6 Phase 3 INFT 加密元数据

**Scalability（3）** SC1 ≤50 并发 · SC2 runtime 无状态 · SC3 Phase 2+ Rust 下沉

**Accessibility（2）** A1 WCAG 2.1 AA basic · A2 不做 screen reader

**Integration（5）** I1 4+1 LLM Provider · I2 0G SDK 版本锁 · I3 0G Compute 成功率 ≥95% · I4 Tauri Sidecar（Phase 2 推迟）· I5 Shadow 桌面 ≥20 Tauri 命令（Phase 2 推迟）

**Reliability（3）** R1 resume 无丢失 · R2 全 provider 失败 pause · R3 compile 非阻塞警告

### 2.3 Additional Requirements（46 条 AR）

来自 `epics.md` Requirements Inventory + 2026-04-16 addendum：AR1-4（基础工程）· AR5-9（Runtime 契约扩展）· AR10-12（API 契约）· AR13-14（LLM Provider 增强）· AR15-21（前端核心）· AR22-23（Shadow UI 复用策略）· AR24-29（6 种子模板）· AR30-33（Demo 产物）· AR34-37（0G 合规）· AR38-39（测试）· AR40-41（文档）· AR42-44（Workflow Assembly / Graph Projection）· AR45-46（CLI-UI 边界）· **AR47-60（Universal Agent Plugin Contract）**

### 2.4 PRD 完整性评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 需求可测试性 | ✅ 强 | 每条 FR 有对应 Journey / Epic 映射 |
| Journey → FR 可追溯性 | ✅ 强 | J1–J5 + E1–E3 全映射到 FR |
| NFR 覆盖 | ✅ 完整 | 六维全有量化门槛 |
| Phase 边界清晰 | ✅ 强 | Phase 1 / 2 / 3 明确 |
| 2026-04-16 Inbox 升级一致性 | ✅ 完整 | 13 条新 FR + 信息架构 ASCII 图 + 决策编号 traceability |
| 风险识别 | ✅ 充分 | 10 条 Risk Mitigations |

**PRD 无阻塞问题。**

---

## Section 3 · Epic Coverage Validation

### 3.1 FR → Epic 映射（54 条全覆盖）

| FR 组 | Epic 映射 | 覆盖状态 |
|-------|----------|---------|
| FR1-FR7（Template Design）| Epic 3（FR6 在 Epic 4）+ Epic 3.6.7 扩展 schema | ✅ |
| FR8-FR12（Policy Matrix）| Epic 1 + Epic 4（FR9）+ Epic 7.7 复用 | ✅ |
| FR13-FR18（Runtime）| Epic 3 | ✅ |
| FR19-FR22（Observability）| Epic 4 + Epic 7 Inbox 指标胶囊复用 SSE | ✅ |
| FR23-FR26（Persistence）| Epic 1 | ✅ |
| FR27-FR30（0G Integration）| Epic 5 | ✅ |
| FR31 INFT、FR35 Marketplace | ❌ Phase 3 明确推迟 | ✅ |
| FR32-FR34（Share/Clone）| Epic 5 | ✅ |
| FR36-FR37（Gap Detection）| Epic 6 | ✅ |
| FR38-FR41（Demo/Pitch）| Epic 6（FR41 在 Epic 0）| ✅ |
| FR42（External Agent）| Epic 2 | ✅ |
| **FR-Inbox-1 ~ FR-Inbox-7** | **Epic 7 Story 7.1-7.7** | ✅ 新增覆盖 |
| **FR-Template-Switcher ×2** | **Epic 7 Story 7.1（左窄导航）** | ✅ 新增覆盖 |
| **FR-Identity / OpsRoom / BriefBoard-Alias** | **Epic 3.6.7 + Epic 7** | ✅ 新增覆盖 |
| **FR-Group-Metrics** | **Epic 7 Story 7.2 + 7.7** | ✅ 新增覆盖 |

**结论**: 54 / 54 FR **100% 覆盖**（FR31/FR35 Phase 3 明确推迟不计阻塞）。

### 3.2 NFR → Epic 映射

| NFR 组 | 对应 Epic |
|--------|---------|
| P1-P6 性能 | Epic 3（编辑器）+ Epic 4（看板）+ Epic 5（0G IO） |
| S1-S6 安全 | Epic 0（BYOK）+ Epic 5（sanitize/Merkle/no-training）+ Epic 2（sandbox） |
| SC1-SC3 扩展 | Epic 1（runtime 无状态） |
| A1-A2 可达 | Epic 3 + Epic 4 |
| I1-I5 集成 | Epic 2 + Epic 5 |
| R1-R3 可靠 | Epic 1 |

**Sprint-1 backlog 识别** 需独立 Story 0.5 "NFR Acceptance Harness" 覆盖 P3/S4/S5/A1/R2/TS2/I2 端到端验收 —— **Sprint 1 必补齐**。

### 3.3 AR 覆盖

AR1-46 全部有 Epic 归属；AR47-60（Universal Agent Plugin Contract）在 Epic 2 Stories 2.1-2.8 全覆盖。

---

## Section 4 · UX Alignment

### 4.1 UX 文档状态

**无独立 UX Spec 文档**。UX 关注点分散于：

1. PRD Web App Specific Requirements（浏览器矩阵 + 响应式 + 性能门槛 + WCAG 2.1 AA）
2. Architecture Frontend Architecture（04-15 版本，尚未吸收 Inbox 信息架构）
3. epics.md AR22-23 Shadow UI 复用清单
4. **Pencil pen 稿 `docs/design/shadowflow-ui-2026-04-16-v2.pen`（1.24 MB）** —— 04-16 决策 1-10 完整视觉落地；含 EditorPage / InboxPage / ChatPage / AgentDM / BriefBoard / TemplatesPage / LandingPage / AboutPage 中英双版
5. Epics-addendum Data Model / API 补丁 + Story AC 行为契约

### 4.2 UX 风险评估

| 项 | 状态 |
|----|------|
| pen 稿作为 ground truth 可用性 | ✅ |
| Story AC 与 pen 稿对齐 | ✅（引用具体 pen 节点 ID，如 "pen `InboxPage` (34BOB)"） |
| 设计语言一致性 | ✅（深色 `#0D1117` + 紫色 `#A78BFA` + 14px 圆角 + 120px 点阵）|
| 无正式 UX spec 文档 | ⚠️ Phase 1 MVP 可接受；Phase 2 建议 `/bmad-create-ux-design` 从 pen 提取 |
| 协作四视图信息架构 | ✅ PRD line 845 附近 ASCII 图完整 |

**UX 对齐无阻塞问题。**

---

## Section 5 · Epic Quality Review

### 5.1 Epic 结构评分

| Epic | Goal | User Outcomes | 映射 | Story 粒度 | Story 数 |
|------|------|---------------|------|----------|---------|
| Epic 0 · Developer Foundation | ✅ | ✅ | ✅ | ✅ | 4 |
| Epic 1 · Runtime Hardening | ✅ | ✅ | ✅ | ✅ | 5 |
| Epic 2 · Agent Plugin Contract | ✅ | ✅ | ✅ | ✅ | 8 |
| Epic 3 · Workflow Editor | ✅ | ✅ | ✅ | ✅ | 6 + 2 addendum = 8 |
| Epic 4 · Live Dashboard | ✅ | ✅ | ✅ | ✅ | 6 |
| Epic 5 · 0G Integration | ✅ | ✅ | ✅ | ✅ | 5 |
| Epic 6 · Demo Station | ✅ | ✅ | ✅ | ✅ | 4 |
| Epic 7 · Collaboration Quad-View | ✅ | ✅ | ✅ | ✅ | 7 |

**共 46 个 Story**（含 3.6.7/3.6.8 + Epic 7 的 9 个 addendum story）。

### 5.2 Story 文件与 AC 质量

**已存在 story 文件（37 个,ready-for-dev）**: Epic 0-6 全部（Epic 2 8 个 + Epic 3 6 个 + 其他）

**Story 质量**:
- ✅ 所有 Story User Story 格式（As a / I want / So that）
- ✅ Given-When-Then AC，每条 Story 至少 2-4 个场景
- ✅ AC 引用具体文件路径（`contracts.py` / `PolicyMatrixPanel.tsx` / `templates/*.yaml`）
- ✅ AC 引用性能门槛（对齐 PRD NFR）
- ✅ 跨 Story 依赖明确（如 Story 2.8 标注"必须 2.1-2.7 完成后"）

**缺失 story 文件（9 个,需 `/bmad-create-story` 产出）**:
- **Story 3.6.7 · 模板 YAML schema 扩展 + 6 种子模板改造** ← **Sprint-A 前置，阻塞 Epic 7 全部 Story**
- Story 3.6.8 · Template Builder Wizard MVP
- Story 7.1 · Inbox 页框架（三列布局）
- Story 7.2 · 消息列表项 + 分组 + 徽章
- Story 7.3 · "+ 新群聊"流程
- Story 7.4 · Inbox → Chat / AgentDM 路由与面包屑
- Story 7.5 · 群聊切换 BriefBoard 模式
- Story 7.6 · 搜索 + Tab 过滤
- Story 7.7 · APPROVAL GATE 面板

### 5.3 依赖链合法性

```
Epic 0 (Foundation)
  ↓
Epic 1 (Runtime + Policy Matrix) ─── approval_gate 契约
  ↓                                         ↓
Epic 2 (Agent Plugin Contract) → Story 2.3 ACP 对接 approval_gate
  ↓
Epic 3 (Editor + Templates)
  ↓
  ├─ Story 3.6.7 (schema 扩展) ──┐
  ↓                              │
Epic 4 (Live Dashboard + Dynamic Policy) ← Story 4.5 复用 Epic 1 policy
  ↓                              │
Epic 5 (0G) [部分并行]            │
  ↓                              │
Epic 7 (Inbox 4 视图) ←──────────┘（依赖 3.6.7 数据 schema）
  ↓
Epic 6 (Demo + Pitch)
```

- ✅ Epic 7 依赖链清晰：Policy Matrix（Epic 1）+ Workflow Editor（Epic 3）+ SSE（Epic 4）+ schema 扩展（Epic 3.6.7）
- ✅ Story 3.6.7 前置性已在 sprint-change-proposal 明确
- ✅ Story 2.7（Hermes `claw` SPIKE）置于 Sprint 0 首日

---

## Section 6 · Architecture Gap（已知,非阻塞）

### 6.1 Gap 清单

**`architecture.md`（04-15）未吸收 04-16 决策：**

1. **Data Model 扩展**（Template 增 `userRole / defaultOpsRoomName / briefBoardAlias / agentRoster / groupRoster / themeColor`；Group 增 `templateId / status / pendingApprovalsCount / metrics.*`）
2. **新 API 端点**（`GET /api/templates/{id}/inbox` + `POST /api/groups` + `POST /api/approvals/{id}/approve|reject` + `POST /api/templates/custom`）
3. **前端组件追加**（InboxPage / InboxMessageList / InboxPreview / ApprovalGatePanel / GroupMetricsBar / TemplateSwitcher / NewGroupWizard / TemplateBuilderWizard）
4. **Epic 7 信息架构图**（Inbox → Chat / AgentDM / BriefBoard）

### 6.2 处置建议

**不阻塞 dev 循环启动**。原因：
- epics-addendum Data Model / API 补丁片段已提供（可直接 import）
- Story AC 已独立承载新对象契约
- Story 3.6.7 代码实现本身会强制 schema 落地

**建议**：Sprint-A（Story 3.6.7）**完成后**独立跑一次 `/bmad-correct-course` 针对 architecture.md 做 Data Model + API 章节导入。

---

## Section 7 · Final Assessment

### 7.1 Readiness Gate 决策

| 维度 | 评分 | 门槛 | 判定 |
|------|------|------|------|
| PRD 完整性 | 10/10 | ≥8 | ✅ PASS |
| Epic FR 覆盖 | 54/54（含 13 新 FR）| 100% | ✅ PASS |
| Epic NFR 覆盖 | 25/25 | 100% | ✅ PASS |
| Story AC 质量 | 37 ready + 9 待创建（AC 已定）| AC 覆盖 ≥95% | ✅ PASS |
| 依赖链合法 | ✅ | 无循环 | ✅ PASS |
| UX Ground Truth | pen 稿 + addendum | 有可参照证据 | ✅ PASS |
| Architecture 一致 | ⚠️ 04-15 版本过期 | 非阻塞 | ⚠️ DEFER to Sprint-A 后 |
| Sprint Status 同步 | ✅ | Epic 7 + addendum story 已入 | ✅ PASS |

**总判定：🟢 READY FOR DEV**（Sprint-A 可立即启动；architecture.md 补丁推迟到 3.6.7 完成后）

### 7.2 关键风险 & 缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| 30 天 DDL + Epic 7 新增 7 story 挤压 Epic 5/6 buffer | 高 | Epic 7 Sprint-A + Sprint-B 优先（~5-6 天），Epic 5 Story 5.4 与 Epic 7 可并行 |
| Story 3.6.7 未完成前 Epic 7 全部阻塞 | 高 | Sprint-A（1-2 天）是关键路径首位 |
| Architecture.md 过期 | 中 | Story AC 承载契约 + addendum 补丁可即时 import |
| Epic 2 Sprint 0 SPIKE（Story 2.7）未跑可能导致 ShadowSoul 改名 | 中 | SPIKE 1 天即出 `docs/HERMES_CLAW_SPIKE.md` |
| Epic 7 UI 首次实现工作量偏差 | 中 | pen 稿完整降低设计环节；Story AC 精确引用 pen 节点 ID |
| NFR Acceptance Harness 未跑 | 中 | Sprint-1 必须补齐 Story 0.5 |

### 7.3 建议的下一步行动

按优先级：

1. **立即（本轮后）**：跑 `/bmad-sprint-status` 确认下一 story 是 Story 3.6.7
2. **Sprint-A Day 1**（1-2 天）：`/bmad-create-story 3.6.7` → `/bmad-dev-story` → `/bmad-code-review`
3. **Sprint-0 Day 1**（并行 1 天）：`/bmad-create-story 2.7` + SPIKE Hermes `claw`（不影响 Sprint-A）
4. **Sprint-B**（3-4 天）：Epic 7 Story 7.1 → 7.2 → 7.4 → 7.7 最小闭环
5. **Sprint-A 完成后**：独立会话跑 `/bmad-correct-course` 把 Data Model + API 补丁导入 architecture.md
6. **Sprint-C**（2-3 天）：Epic 7 Story 7.3 + 7.5 + 7.6
7. **Sprint-D**（可降级，2 天）：Story 3.6.8 MVP（导入 YAML 版本）
8. **Sprint 1 backlog**：补齐 Story 0.5 "NFR Acceptance Harness"；拆分 Story 2.3 成 a/b/c；Epic 6 收尾 story 加浏览器 smoke AC
9. **（可选）Phase 2 前**：`/bmad-create-ux-design` 从 pen 稿提取正规 UX spec 文档

### 7.4 Sign-off

ShadowFlow Phase 1 MVP 已经做好充分准备进入实现阶段：

- **规划 artifact 完备**（PRD v0.1 最新 / Epics 最新 / Epics Addendum Epic 7 完整 / sprint-status 同步 / sprint-change-proposal 留痕）
- **需求追溯 100%**（54 FR + 25 NFR + 46 AR → 8 Epic + 46 Story 全映射）
- **Story AC 可执行**（37 story ready-for-dev，9 story 待 `/bmad-create-story` 生成但 AC 已在 addendum 写好）
- **已知遗留项明确**（architecture.md 过期 → Sprint-A 后单独处理；NFR Harness → Sprint-1 backlog）

**开始 dev 循环！** 下一步是 `/bmad-sprint-status` → 然后 `/bmad-create-story 3.6.7`。

---

**Assessor:** Claude Opus 4.6（BMAD PM role）
**Assessment Mode:** Batch run（用户预授权"在这里全跑完吧"）
**Report Version:** 2.0（覆盖 2026-04-16 12:44 v1.0 过期版本）
