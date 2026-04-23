---
name: epics-addendum-2026-04-17-observability
title: Epics Addendum · Epic 4 Observability Gap Fills (Edict 10 面板对照补遗)
version: 0.1
created: 2026-04-17
status: proposed
parent: epics.md
trigger: 2026-04-17 用户对照 edict 10 面板后识别 3 处 fleet-level 观测缺口 · Pencil 已落稿
---

# Epics Addendum · 2026-04-17 · Epic 4 Observability 三新 Story

本文件是 [epics.md](epics.md) 的增量补丁,补三条 Epic 4(Observability & UX)下的 fleet-level 观测画板。

**增补动因**: 2026-04-17 用户对照 edict《1300 年前的唐朝制度》文中 10 面板,识别 ShadowFlow 既有设计覆盖 7 个(单 Run 看板/模板库/TraceView/协作四视图/Policy 编辑器/Provider 链/Trajectory API),但**缺 3 个跨 Run 的 fleet-level 观测视角**。Pencil 稿已先行落地作为视觉锚点,本文件补对应 Story 定义。

**不借鉴 edict 叙事/术语** — 所有命名、概念、字段走 ShadowFlow 本体(Policy Matrix / ApprovalGate / Run / Stage / Provider),参见 memory/feedback_no_borrowing.md。

**Pencil 视觉锚点**(均在 `docs/design/shadowflow-ui-2026-04-16-v2.pen`):
- Story 4.7 → frame `OperationsOverview`  id `ecvHQ`  @ (0, 14200)
- Story 4.8 → frame `TrajectoryArchive`   id `rB9nS`  @ (1600, 14200)
- Story 4.9 → frame `PolicyMatrixObservability` id `6Q8Hd` @ (3200, 14200)

---

## Epic 4 补丁 · Story 4.7 · Operations Overview(跨 Run fleet 视角)

**Status**: proposed
**Priority**: P1(Epic 4 收尾前必须并入)
**Estimate**: 2-3 人日
**Epic 归属**: Epic 4 · Observability & UX

**Goal**: 为 ShadowFlow 补一张 fleet-level 运营总览页(区别于既有的单 Run `LiveDashboard`),聚合"哪些 Run 在跑 / 哪些 Agent 活/降级/离线 / 哪家 Provider 在负载 / 有多少审批在排队"。

**前置依赖**:
- Story 4.1 SSE 事件总线(跨 Run 事件聚合基础)
- Story 1.5 Trajectory export API(Run 查询 endpoint)
- Story 2.1 AgentExecutor ABC(Agent 健康度信号来源)
- Story 3.5 Provider fallback 链(Provider 元数据)

### User Story

As a **ShadowFlow 运营者 / Demo 主持人**,
I want **在一张页面同时看到所有 Run、所有 Agent、所有 Provider、所有待审批的健康状态**,
So that **我能一眼识别系统瓶颈(Agent 宕机 / Provider 限流 / 审批积压),不用切 N 个单 Run 看板**。

### Acceptance Criteria

**Given** `src/core/pages/OperationsPage.tsx` 新增,路由挂 `/ops`
**When** 用户打开 `/ops`
**Then** 页面顶部展示 4 KPI 卡:Active Runs / Pending Approvals / Avg Provider Latency (p95) / Policy Rejection Rate(字段参见 pen frame `ecvHQ` KPI_* 子节点)
**And** 每 KPI 含 delta(vs 前 24h)与 Tailwind 状态色(approvals 用 `#F59E0B` 当 >0)

**Given** 页面中段展示 Agent Health 6-9 卡网格(见 pen frame `AgentCard_1~6`)
**When** Agent Runtime 上报心跳/降级/离线
**Then** 每卡显示:status dot(绿/橙/红)+ kind(ACP/MCP/CLI)+ model + queue depth + p95 + mini trend(ASCII sparkline 或 SVG)
**And** 整体 agent roster 来自 `GET /agents/health` endpoint(新增),轮询 5s 一次或 SSE

**Given** 页面中段右侧展示 Provider Load 5 行条形图(见 pen frame `Panel_ProviderLoad`)
**When** Provider 请求数/分钟变化
**Then** 每行显示:provider name + model count + p95 + TEE badge(✓/✗) + 负载条(0-100% 归一化到用户配置预算)+ 右侧百分比
**And** 面板底部展示 fallback 链可视化(4-5 pill 节点连箭头,来自 Story 3.5 配置)

**Given** 页面底部展示 Approval Queue 条(见 pen frame `Panel_ApprovalsQueue`)
**When** ApprovalGate 触发未决审批
**Then** 显示 FIFO 队列(oldest first),每行:run_id · template · sender→receiver · policy(gate + field)+ 等待时长 + 指派对象
**And** 点击任一行跳转到 `/runs/{id}#approval-{gate_id}` 对应 run 的审批展开位置

**Given** 运行中新增 `/agents/health`、`/providers/load`、`/approvals/pending` 三 endpoint
**When** 前端轮询/订阅
**Then** 响应 P95 ≤ 200ms(page 要 smooth, 不阻塞主线程)
**And** 所有数据本地聚合,**不**经过任何外部服务(S1 BYOK 不破)

### Technical Hints

- 新增文件:
  - `src/core/pages/OperationsPage.tsx`(主页面)
  - `src/core/components/Panel/AgentHealthGrid.tsx`
  - `src/core/components/Panel/ProviderLoadPanel.tsx`
  - `src/core/components/Panel/ApprovalQueueStrip.tsx`
  - `shadowflow/api/ops.py`(三个聚合 endpoint)
- 数据源:`shadowflow/runtime/registry.py`(Agent 注册表)+ `shadowflow/runtime/events.py`(事件流聚合)+ 既有 Provider manager
- Zustand store:`useOpsStore`(独立于 `useRunStore`,避免单 Run 状态污染)

---

## Epic 4 补丁 · Story 4.8 · Trajectory Archive Page(跨 Run 归档视图)

**Status**: proposed
**Priority**: P1
**Estimate**: 2-3 人日
**Epic 归属**: Epic 4 · Observability & UX

**Goal**: 把 Story 1.5 的 trajectory export API 升级成一张可检索、可对比、可分享的归档页。当前实现:API 有,但 UI 散在单 Run 的 TraceView 里,无跨 Run 浏览 / 导出路径,也无法一键发到 0G Storage(Story 5.1 的上行路径缺 UI 入口)。

**前置依赖**:
- Story 1.5 Trajectory export & Run 查询 API(数据源)
- Story 4.4 TraceView(节点详情,可复用子组件)
- Story 5.1 0G Storage 前端直调(0G 上链按钮)

### User Story

As a **研究员 / 评委 / 后期 Demo 分享人**,
I want **一张页面浏览所有已完成的 Run,点任一 Run 看五段时间线与 handoff 事件,一键导 MD / JSON / 0G Storage**,
So that **我能复现、对比、署名分享我的 workflow 轨迹,不用手工打包**。

### Acceptance Criteria

**Given** `src/core/pages/ArchivePage.tsx` 新增,路由挂 `/archive`
**When** 用户打开 `/archive`
**Then** 左栏显示 Run 列表(360 宽),每卡含:intent 文本 + run_id + template + duration + token count + badges(✓ done / ⟲ rejections / ◆ approvals / ⚠ aborted)
**And** 支持顶部搜索(by intent / agent / policy)与日期过滤(last 24h / 7d / 30d / all)
**And** 列表按时间降序,懒加载(初次 30 条,"load more →"续拉)

**Given** 用户点击左栏任一 Run
**When** 前端调 `GET /runs/{id}/trajectory`
**Then** 中栏顶部显示 5-stage 水平时间线(Intent → Plan → Review → Execute → Deliver),每 stage dot 颜色按该段 outcome(绿=ok / 橙=有 reject 但最终 ok / 红=aborted)
**And** Review stage 上方标记 `2× rejected` 等 retry 循环次数(见 pen frame `rejlabel`)
**And** 时间线下方展示 handoff 事件列表(tag: handoff/reject/approve/done),每事件含 time + tag pill + from→to + sub-reason(见 pen `Event_1~6`)

**Given** 用户点击中栏右下"Export"或右侧 Export 面板
**When** 选择 Markdown / JSON / 0G Storage
**Then**
- **Markdown**: 复制到剪贴板,五段叙事 + event log + metadata 表格
- **JSON**: 下载完整 `trajectory.json`(Story 1.5 既有 schema)+ PII sanitize(若 Story 5.2 已合并)
- **0G Storage**: 调 `zerogStorage.upload(trajectory, signer)`(来自 Story 5.1),返回 CID 并显示 `0g://...` 可分享链接
**And** 0G 发布按钮仅当用户已在设置页完成 BYOK 时高亮可点,否则灰显 + tooltip "先在 Settings 配置 0G 密钥"

**Given** 右侧 Detail 面板
**Then** 展示 Run Metrics:duration / tokens(in/out)/ provider mix / policy hits / agent list

### Technical Hints

- 新增文件:
  - `src/core/pages/ArchivePage.tsx`
  - `src/core/components/Panel/RunListPane.tsx`
  - `src/core/components/Panel/StageTimeline.tsx`(5 stage 水平时间线)
  - `src/core/components/Panel/HandoffEventList.tsx`
  - `src/core/components/Panel/TrajectoryExportPanel.tsx`(封装 MD/JSON/0G 三按钮)
  - `shadowflow/api/archive.py`(列表 + 搜索 endpoint,若 Story 1.5 没覆盖)
- 复用:`TraceView`(Story 4.4)的事件渲染子组件
- 0G:复用 `src/adapter/zerogStorage.ts`(Story 5.1)

---

## Epic 4 补丁 · Story 4.9 · Policy Matrix Observability(驳回热力 + 触发样本)

**Status**: proposed
**Priority**: P1
**Estimate**: 2-3 人日
**Epic 归属**: Epic 4 · Observability & UX

**Goal**: 把 Story 4.5 的 PolicyMatrixPanel **编辑器**升级一个观测伴生页 —— 跨 Run 聚合"哪条 policy 驳回最多 / 在哪个 stage / 回合数 / 最近触发样本"。数据可反哺 Story 6.1 Agent Gap Detection 与 Activation Bandit 训练。

**前置依赖**:
- Story 1.3 运行时真驳回 handoff 事件(reject 事件数据源)
- Story 4.5 PolicyMatrixPanel 编辑器(规则定义源,含 policy id/threshold)
- Story 1.5 Trajectory export API(历史 reject 事件查询)

### User Story

As a **模板作者 / 主编陈姐(J3)/ 研究员**,
I want **一张页面看到我配置的每条 policy 在过去 N 天被触发了多少次、集中在哪个 stage、最近 5 个驳回实例是什么**,
So that **我能判断哪条 policy 阈值过严(太多无谓 retry)或过松(真 bug 漏过),据此调整规则**。

### Acceptance Criteria

**Given** `src/core/pages/PolicyObservabilityPage.tsx` 新增,路由挂 `/policy/observability`
**When** 用户打开页面
**Then** 顶部 Summary 栏(见 pen frame `sumbar`)展示 4 指标:
- 总驳回数(窗口内)+ 占总 Run 比例
- Top policy(name + 数量,橙字)
- Top stage(name + 数量)
- Recovered rate(retry 后通过的比例,绿字)
- Median loops(中位数 retry 轮次)

**Given** 页面主体左侧 heatmap 面板(见 pen frame `HeatmapPanel`)
**When** 渲染
**Then** 行 = policy(ShadowFlow 已配置所有 policy,最多 20 行,超出懒加载)
**And** 列 = 5 lifecycle stages(Intent / Plan / Review / Execute / Deliver)
**And** 单元格 = 该 policy 在该 stage 的驳回计数,颜色按强度分 6 档(0 / 1-5 / 6-15 / 16-25 / 26-40 / 41+,参见 pen frame 图例 `LG1~6`)
**And** 点击单元格或行头 → 右侧 examples 面板切换到该 policy 的触发样本

**Given** 右侧 Examples 面板(见 pen frame `ExamplesPanel`)
**When** 选中一条 policy
**Then** 展示该 policy 最近 5 条驳回事件:run_id + stage + timestamp + reason 文本 + outcome(retry 成功/aborted)
**And** 点击任一 example → 跳 `/archive/{run_id}` 打开该 Run 完整轨迹

**Given** 页面右上"Edit matrix"按钮
**When** 点击
**Then** 跳 `/editor` 定位到 Policy Matrix Panel(Story 4.5),含当前选中 policy 的编辑高亮

**Given** 右下"Download CSV"按钮
**When** 点击
**Then** 导出 heatmap 原始数据(policy × stage × count + 时间窗 + 元数据)CSV,可手工/脚本喂给 Activation Bandit 训练(Story 6.1+)

**Given** 顶部时间窗下拉(Last 24h / 7d / 30d / all)
**When** 切换
**Then** 全页数据按窗口重聚合,loading 骨架屏 ≤ 1.5s

### Technical Hints

- 新增文件:
  - `src/core/pages/PolicyObservabilityPage.tsx`
  - `src/core/components/Panel/PolicyHeatmap.tsx`(SVG 或 div-grid 实现,不用 chart lib)
  - `src/core/components/Panel/TriggeredExamplesList.tsx`
  - `shadowflow/api/policy_observability.py`(聚合 endpoint:`GET /policy/stats?window=7d`)
- 数据源:Story 1.3 reject 事件流 + Story 1.5 trajectory 历史查询
- 缓存:后端预聚合 15 分钟 TTL(减少 N Run × M policy 的 fanout)

---

## Cross-Story Notes

**Epic 4 收尾策略**: Story 4.7 / 4.8 / 4.9 可**并行实现**(三页无相互依赖,各自 3 个独立 endpoint)。共用 UI 模块:
- `src/core/components/Panel/KPICard.tsx`(4.7 / 4.9 Summary 栏复用)
- `src/core/components/Panel/StageLabels.tsx`(4.8 / 4.9 共用 5-stage 术语常量)

**术语锁定**: 5 lifecycle stages 命名 **Intent / Plan / Review / Execute / Deliver** 为本轮确定,需在 `src/common/types/stage.ts` 新增枚举,供 4.8 / 4.9 一致引用。

**Demo 价值**: 三页一起做出后,ShadowFlow 对外演示路径从单 Run 升到 fleet 级,J1 Demo 可切入 `/ops` 展示"12 个 Agent 协作 + 3 个审批在排队"的企业感画面。

---

**批准流程**: 本 addendum 经用户确认后即并入 sprint-status.yaml 作为 `backlog` 状态,然后走 `bmad-create-story` 为 4.7 建 story file。
