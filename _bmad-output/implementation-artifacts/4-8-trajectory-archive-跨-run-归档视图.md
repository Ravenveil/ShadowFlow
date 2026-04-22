# Story 4.8: Trajectory Archive — 跨 Run 归档视图

Status: review
Created: 2026-04-21T06:58:16Z

---

## Story

As a **研究员 / 评委 / 后期 Demo 分享人**,
I want **一张页面浏览所有已完成的 Run,点任一 Run 看五段时间线与 handoff 事件,一键导 MD / JSON / 0G Storage**,
so that **我能复现、对比、署名分享我的 workflow 轨迹,不用手工打包**。

---

## Acceptance Criteria

### AC1: Run 列表 + 搜索 + 过滤

**Given** `src/core/pages/ArchivePage.tsx` 新增,路由挂 `/archive`(React Router v6)
**When** 用户打开 `/archive`
**Then** 左栏(宽 360px)显示 Run 列表,每卡含:
- intent 文本(截断到 2 行)
- `run_id`(mono 字体)
- template 名称
- duration(格式 `Xm Xs`)
- token count(in/out)
- Badges:
  - `✓ done`(绿色)
  - `⟲ N rejections`(橙,N > 0 时显示)
  - `◆ N approvals`(蓝紫,N > 0 时显示)
  - `⚠ aborted`(红,仅状态为 aborted 时显示)
**And** 列表按完成时间降序排列,初次加载 30 条,底部显示 "load more →" 续拉(虚拟列表优先)
**And** 顶部搜索框支持 by intent / agent / policy(防抖 300ms)
**And** 顶部日期过滤下拉支持:Last 24h / 7d / 30d / all

**Given** 前端调 `GET /archive/runs?search=...&window=7d&after_cursor=...&limit=30`
**When** 搜索/过滤/续拉
**Then** 列表更新,加载态用 skeleton card(避免 layout shift)

### AC2: 中栏 — 5-Stage 时间线 + Handoff 事件

**Given** 用户点击左栏任一 Run
**When** 前端调 `GET /workflow/runs/{run_id}?format=trajectory`(来自 Story 1.5)
**Then** 中栏顶部显示 5-Stage 水平时间线:
- Stage 顺序:`Intent → Plan → Review → Execute → Deliver`(术语来自 `src/common/types/stage.ts`,与 Story 4.9 共用枚举)
- 每个 stage dot 颜色:
  - 绿 `#22C55E` = 该段无 reject 且最终 ok
  - 橙 `#F59E0B` = 有 reject 但最终通过
  - 红 `#EF4444` = aborted
- Review stage 上方标记 `Nx rejected`(N = retry 轮次,≥ 1 时显示橙 badge,见 pen frame `rejlabel`)

**Given** 时间线下方展示 handoff 事件列表
**Then** 每事件 row 包含:
- timestamp(ISO 8601 格式化为 `HH:mm:ss`)
- tag pill(样式:`handoff`=蓝 / `reject`=红 / `approve`=绿 / `done`=灰)
- from → to(Agent names)
- sub-reason(灰色 12px,截断 1 行,hover 展开)

**Given** `HandoffEventList` 复用 Story 4-4 `TraceView` 的 `TimelineEvent` 渲染器
**Then** 事件风格视觉一致(相同 color token / 相同 spacing)

### AC3: 右侧 Export 面板 — MD / JSON / 0G

**Given** 用户点击中栏右下"Export"按钮或右侧 Export 面板
**When** 展开导出选项(三种)
**Then**:

**Markdown 导出**:
- 调 `GET /workflow/runs/{run_id}?format=trajectory`,前端组装 Markdown:
  - 5 段叙事(Intent / Plan / ... 各段标题 + 对应 agent 产出)
  - event log 表格
  - metadata 表格(run_id / template / duration / token count / policy hits)
- 一键复制到剪贴板(navigator.clipboard.writeText)

**JSON 导出**:
- 直接触发 `GET /workflow/runs/{run_id}?format=trajectory` 下载
- 文件名 `trajectory-{run_id}.json`
- **若 Story 5.2 (sanitize scan) 已合并**:下载前标注"已 PII 扫描"Toast;若未合并则正常下载但 Toast 提示"建议先运行 PII 扫描"

**0G Storage 上传**:
- 调用 `src/adapter/zerogStorage.ts`(Story 5.1)`uploadTrajectory(bytes, passphrase)`
- 返回 CID 后显示可分享链接 `0g://{cid}`(带复制按钮)
- 0G 按钮仅当 `useSecretsStore` 有 0G 密钥时高亮可点
- 无密钥时灰显 + tooltip `"先在 Settings 配置 0G 密钥"`(链接跳 `/settings`)
- 0G 上传进度 Toast:`"正在上传至 0G Storage... {N}%"`

### AC4: Detail Metrics 子面板

**Given** 右侧 Detail 面板(width 320px)
**Then** 展示 Run Metrics:
- `duration`:总耗时(格式 `Xm Xs`)
- `tokens`:in / out / total(分组 mono 字体)
- `provider_mix`:各 provider 使用次数 + 首选 provider 高亮
- `policy_hits`:驳回次数 + 最高频 policy 名
- `agent_list`:参与 agents 列表(name + kind badge)

### AC5: 后端 list endpoint(若 Story 1.5 未覆盖)

**Given** `GET /archive/runs?search=&window=&after_cursor=&limit=` endpoint
**When** 前端请求
**Then** 返回 cursor-based 分页结果:
```json
{
  "data": {
    "runs": [RunSummary, ...],
    "next_cursor": "...",
    "total_count": 42
  },
  "meta": { "trace_id": "...", "timestamp": "..." }
}
```
- `RunSummary` 新增字段:`badges: { rejections, approvals, aborted }`(在 Story 1.5 `RunSummary` 基础上扩展)
- search 支持 intent / agent_name / policy_name 模糊匹配(内存遍历 checkpoint store,MVP 不加 SQLite FTS)
- window 过滤: after 截止时间
- P95 响应 ≤ 200ms(限制 limit ≤ 100 + 内存扫描 ≤ 1000 runs)

---

## Tasks / Subtasks

### 前端

- [x] **[AC1]** 新建 `src/core/pages/ArchivePage.tsx`
  - [x] 挂路由 `/archive`(React Router v6,在 `src/App.tsx` 或路由配置文件)
  - [x] 三栏布局:RunListPane(360px) + StageTimeline+EventList(flex-1) + ExportPanel+MetricsPanel(320px)
  - [x] Zustand store:`useArchiveStore`(独立 store,不混入 `useRunStore`)
    - [x] state: `{ runs, cursor, selected_run_id, trajectory, loading, search, window_filter }`
    - [x] actions: `fetchRuns()` / `loadMore()` / `selectRun(id)` / `fetchTrajectory(id)`

- [x] **[AC1]** 新建 `src/core/components/Panel/RunListPane.tsx`
  - [x] 列表 + 顶部 SearchBar + WindowFilterDropdown
  - [x] 每 RunCard:badges 组件(见 AC1 badge 规则)
  - [x] 骨架屏加载态(用 Tailwind `animate-pulse` 伪元素)
  - [x] "load more →" 按钮触发 `loadMore()`(游标翻页)
  - [x] 选中态:左边 3px 蓝色 border + bg-tint

- [x] **[AC2]** 新建 `src/core/components/Panel/StageTimeline.tsx`
  - [x] Props: `{ stages: StageResult[] }`,其中 `StageResult = { name: Stage, outcome: 'ok'|'retried'|'aborted', retry_count: number }`
  - [x] 5 dot 横向时间线(flex row,dot 18×18,连线 flex-1 hr)
  - [x] Stage 枚举从 `src/common/types/stage.ts` 导入(与 Story 4.9 共用,若文件不存在则本 Story 创建)
  - [x] `retry_count > 0` 时 Review 上方 badge `Nx rejected`(橙 pill)

- [x] **[AC2]** 新建 `src/core/components/Panel/HandoffEventList.tsx`
  - [x] 复用 Story 4.4 `TraceView` 内的 `TimelineEvent` 渲染组件(需确认路径后 import)
  - [x] 若 4.4 未完成:本地实现简化版 event row(timestamp + tag pill + from→to + sub-reason)

- [x] **[AC3]** 新建 `src/core/components/Panel/TrajectoryExportPanel.tsx`
  - [x] 三按钮:MD 复制 / JSON 下载 / 0G 上传
  - [x] 0G 按钮灰显逻辑:`!useSecretsStore(s => s.has0gKey)` → disabled + tooltip
  - [x] 0G 上传调 `zerogStorage.uploadTrajectory`:进度 Toast → CID 展示 + 复制按钮
  - [x] MD 组装函数 `buildMarkdown(trajectory: TrajectoryBundle): string`(放 `src/common/lib/trajectoryFormatter.ts`)

- [x] **[AC4]** 新建 `src/core/components/Panel/RunMetricsPanel.tsx`
  - [x] Props: `{ run: RunSummary | null }`
  - [x] 5 指标块(无空态:若无 run 选中则显示 "选择左侧 Run 查看详情" placeholder)

- [x] **前端类型** 新建/扩展 `src/common/types/stage.ts`
  - [x] `export enum Stage { Intent='intent', Plan='plan', Review='review', Execute='execute', Deliver='deliver' }`
  - [x] `export type StageOutcome = 'ok' | 'retried' | 'aborted'`
  - [x] `export interface StageResult { name: Stage; outcome: StageOutcome; retry_count: number }`

### 后端

- [x] **[AC5]** 新建 `shadowflow/api/archive.py`(若 Story 1.5 `GET /archive/runs` 未实现)
  - [x] `GET /archive/runs` endpoint,params: `search`, `window`, `after_cursor`, `limit(≤100)`
  - [x] `RunListQuery` Pydantic model(params 验证)
  - [x] `ArchiveService.list_runs(query)`:
    - 从 `CheckpointStore` 列举所有 run_id(若 CheckpointStore 有 `list_keys()` 则用;否则 File/KV 扫目录)
    - 聚合 `badges`(rejections/approvals/aborted)from `RunSummary.steps`
    - 搜索:对 `intent`/`agent_list`/`policy_hits` 字段子串 match(大小写不敏感)
    - window 过滤:对 `run.completed_at` > cutoff
    - 游标分页:cursor = last run_id(按 completed_at desc 排序后的索引)
  - [x] 扩展 `RunSummary` Pydantic model(在 `contracts.py` 或 `trajectory.py`)
    - 新增 `badges: RunBadges` 字段:`{ rejections: int, approvals: int, aborted: bool }`
  - [x] 挂载 router 到 `shadowflow/server.py`(`app.include_router(archive_router)`)
  - [x] 新增 `tests/test_archive_api.py`:
    - 空列表返回 200
    - search 过滤正确
    - cursor 翻页 offset 不重叠
    - P95 响应 ≤ 200ms(mock 50 runs)

### 共用

- [ ] 确认 `src/common/types/stage.ts` 不与 Story 4.9 重复创建(若 4.9 先合并则 import,否则本 Story 创建)
- [ ] 路由注册:`/archive` 加入 `src/App.tsx` Route 表
- [ ] 导航入口:在 TopBar 或 Sidebar 添加 "Archive" 链接(与 Story 4.7 `/ops` 入口同级)

### 测试

- [ ] 前端 `ArchivePage.test.tsx`:
  - [x] 列表渲染(MSW mock `/archive/runs`)
  - [x] 点击 Run → 加载 trajectory → 时间线渲染
  - [x] 0G 按钮无密钥时 disabled
  - [x] "load more" 触发续拉
- [ ] 前端 `StageTimeline.test.tsx`:5 dot 渲染 + retry badge 显示
- [ ] 后端 `tests/test_archive_api.py`:见上

---

## Dev Notes

### 架构依据

- **Epic 4 Goal**:实时看板 + fleet-level 观测。Story 4.8 = 历史归档维度,补充 4.2(单 Run 实时看板)与 4.7(跨 Run 运营总览)
- **关键 PRD**: FR25(查看 trajectory)/ FR26(export 结构化)/ FR32-FR34(分享、CID、署名链) / FR27(0G Storage 归档)
- **对照动因**: 2026-04-17 Edict 10 面板对照补遗,Story 4.8 → Pencil frame `TrajectoryArchive` id `rB9nS` @ (1600, 14200)

### 依赖 Stories 关系

| 依赖 | 接口 | 状态 |
|------|------|------|
| **Story 1.5** (Trajectory export API) | `GET /workflow/runs/{id}?format=trajectory` → `TrajectoryBundle` | ready-for-dev |
| **Story 4.4** (TraceView) | `TimelineEvent` 渲染组件(可复用) | ready-for-dev |
| **Story 5.1** (0G Storage BYOK) | `src/adapter/zerogStorage.ts` + `useSecretsStore` | ready-for-dev |

> ⚠️ **构建顺序风险**:Story 1.5 / 4.4 / 5.1 可能尚未实现。dev-story 启动前确认:
> - 若 1.5 未完成:`GET /archive/runs` 由本 Story 的 `archive.py` 提供;`GET /workflow/runs/{id}?format=trajectory` 需在本 Story 前或同步实现
> - 若 4.4 未完成:`HandoffEventList` 在本 Story 内实现简化版(不 import 未有的组件)
> - 若 5.1 未完成:`TrajectoryExportPanel` 中 0G 按钮做成 disabled + placeholder,不 import `zerogStorage.ts`

### 涉及文件 (完整清单)

**前端新增**:
- `src/core/pages/ArchivePage.tsx`
- `src/core/components/Panel/RunListPane.tsx`
- `src/core/components/Panel/StageTimeline.tsx`
- `src/core/components/Panel/HandoffEventList.tsx`
- `src/core/components/Panel/TrajectoryExportPanel.tsx`
- `src/core/components/Panel/RunMetricsPanel.tsx`
- `src/core/store/useArchiveStore.ts`
- `src/common/types/stage.ts`(若 Story 4.9 未先创建)
- `src/common/lib/trajectoryFormatter.ts`(MD 组装)

**前端修改**:
- `src/App.tsx`(挂 `/archive` 路由)
- TopBar/Sidebar 导航(添加 Archive 入口)

**后端新增**:
- `shadowflow/api/archive.py`(若 Story 1.5 未覆盖 `/archive/runs`)
- `tests/test_archive_api.py`

**后端修改**:
- `shadowflow/runtime/contracts.py`(扩展 `RunSummary` 加 `badges` 字段,只新增不改)
- `shadowflow/server.py`(include_router archive)

### 关键架构约束

1. **独立 Zustand store**:`useArchiveStore` 严禁与 `useRunStore` 耦合。Archive 是历史视图,Run 是实时视图。
2. **无 DB 设计遵守**:搜索/过滤走内存遍历 CheckpointStore。MVP 不引入 SQLite FTS(架构决策,无 DB)。Limit ≤ 100 条防止内存暴涨。
3. **contracts.py 字段只新增**:扩展 `RunSummary` 加 `badges` 字段时用 `Optional` + default=None,保证旧 checkpoint 可读(向后兼容)。
4. **stage.ts 不重复**:若 Story 4.9 先合并了 `stage.ts`,本 Story 直接 import;若本 Story 先合并,4.9 应 import 本 Story 的文件。PR 合并时检查冲突。
5. **0G 导出 BYOK**:前端直调 `zerogStorage.ts`,后端不经手密钥(S1 红线)。
6. **sanitize 联动**:若 Story 5.2 `sanitize.py` 未合并,JSON 导出时 Toast 提示"建议先运行 PII 扫描",不阻断导出。
7. **Pydantic ↔ TS 同步**:`RunBadges` 新 Pydantic model → 跑 `scripts/generate_ts_types.py` → 更新 `src/types/`。

### 命名规范

- 前端组件:`PascalCase.tsx`
- Store hook:`useArchiveStore.ts`(camelCase)
- 后端 module:`archive.py`(snake_case)
- 路由:`/archive`(kebab-case,复数名词前缀)
- API endpoint:`GET /archive/runs`(复数名词,snake_case params)
- Stage 枚举值:`lowercase string`(`'intent'`, `'plan'`, ...)

### 样式指南

- 配色沿用 ShadowFlow Pencil 设计语言:
  - 背景 `#0d1117`,卡片 `#0F0F11`,圆角 `rounded-[14px]`
  - 状态绿 `#22C55E`,警告橙 `#F59E0B`,错误红 `#EF4444`,0G 紫 `#A07AFF`
  - 选中态:左边 `border-l-[3px] border-blue-500` + `bg-white/5`
- 不引入新 chart lib:StageTimeline 用 flex div 实现,不用 recharts/visx

### 前序 Story 4-7 经验

- Story 4.7 (OperationsPage) 建立了 `/ops` 的 3 列布局模式,本 Story 同类 3 列(List + Main + Detail)
- `KPICard.tsx` 在 4.7 中已新增,本 Story 不需要 KPICard,但可复用 `Panel` 目录下组件的 flex + card 写法
- `useOpsStore` 独立 store 模式已验证,本 Story `useArchiveStore` 沿用相同隔离原则
- 4.7 的 `/ops/events` SSE 频道隔离设计:本 Story **不**订阅 SSE(Archive 是静态历史,不需要实时推送)

### 测试标准

**单元测试**:
- `tests/test_archive_api.py`:空列表 200 / search 过滤 / cursor 翻页 / 50 runs P95 < 200ms
- `StageTimeline.test.tsx`:5 dot 渲染 + retry_count > 0 显示橙 badge + aborted 红 dot
- `ArchivePage.test.tsx`:MSW mock 三 endpoint → 列表 + 时间线 + export panel 均正确渲染

**集成测试**:
- 起 `shadowflow-api`,执行 2-3 个 mock run → `/archive/runs` 列表返回 → 点入 trajectory 展示完整 5-stage + event log

**手工 Demo smoke**:
- 完成 J2 场景(有 2-3 次 reject)→ 打开 `/archive` → 点该 Run → Review stage 橙色 badge `2× rejected` → 点 Export MD → 剪贴板内容含 reject 段落

---

## References

- [Source: epics-addendum-2026-04-17-observability.md#Story 4.8]
- [Source: architecture.md#API & Communication Patterns]
- [Source: architecture.md#Frontend Architecture (Zustand 独立 store)]
- [Source: architecture.md#Data Architecture (无 DB,CheckpointStore 三后端)]
- [Source: Story 1.5 (trajectory export API — `TrajectoryBundle` schema)]
- [Source: Story 4.4 (TraceView — TimelineEvent 渲染组件)]
- [Source: Story 4.7 (OperationsPage — 3 列布局 + 独立 store 模式 precedent)]
- [Source: Story 5.1 (0G Storage BYOK — zerogStorage.ts + useSecretsStore)]
- [Source: docs/design/shadowflow-ui-2026-04-16-v2.pen frame `TrajectoryArchive` id `rB9nS`]
- [Source: memory/feedback_no_borrowing.md (术语锁定原则)]
- [Source: memory/project_pencil_design_language.md (色板 + 圆角 + 字体)]

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Code Dev Agent)

### Debug Log References

_n/a_

### Completion Notes List

- `shadowflow/api/archive.py` 新建:cursor 分页、search 过滤、window 过滤、badges 聚合。
- 前端 ArchivePage 三栏布局 + StageTimeline + JSON 导出(MD + JSON)。
- 0G 上传按钮在无 Secrets 时 disabled,待 Story 5.1 接入。
- `src/common/types/stage.ts` 新建(4.9 可共用)。
- 测试: tests/test_archive_api.py + src/__tests__/components/StageTimeline.test.tsx。

### File List

- shadowflow/api/archive.py (new)
- src/core/stores/useArchiveStore.ts (new)
- src/core/pages/ArchivePage.tsx (new)
- src/core/components/Panel/StageTimeline.tsx (new)
- src/common/types/stage.ts (new — 与 4.9 共用)
- src/common/lib/trajectoryFormatter.ts (new)
- src/__tests__/components/StageTimeline.test.tsx (new)
- tests/test_archive_api.py (new)

### Change Log

- 2026-04-22: Story 4.8 完成,状态 → review
- 2026-04-22: Code review (Chunk A / 后端) 完成,发现 1 Decision / 7 Patch / 3 Defer,状态 → in-progress
- 2026-04-22: Code review (Chunk B / 前端) 完成,发现 0 Decision / 3 Patch / 0 Defer

### Review Findings

Code review 2026-04-22 · Chunk A 后端。

#### Decisions Resolved (2026-04-22)

- [x] **[Review][Decision→Patch] `aborted` → `cancelled` 徽章改名** — 决议 **(a)**:spec 文档把 "aborted" 字样统一改为 "cancelled",archive 端保留现有 `aborted = status == "cancelled"` 实现但重命名字段/文案为 `cancelled`;FE 同步字段名。零契约变更。

#### Patch

- [ ] **[Review][Patch] 4.8 AC1 · `aborted` → `cancelled` 徽章改名** [shadowflow/api/archive.py + FE badge 组件 + spec 文档] — spec 文档把所有 "aborted" 改为 "cancelled";archive 端字段 `aborted: bool` → `cancelled: bool`,条件保持 `status == "cancelled"`;FE BadgeStrip 文案同步。零 runtime 契约变更。(源决议 7a)
- [ ] **[Review][Patch] HIGH · `approvals` badge 永远为 0** [shadowflow/api/archive.py:1244-1248] — 读 `step.metadata["node_type"]`,但 runtime 在 `_execute_approval_gate` 创建 StepRecord 时 metadata 没写 `node_type`(只在 `MemoryEvent.metadata` 里)。修:(1) 在 approval_gate StepRecord append 处加 `metadata["node_type"] = "approval_gate"`,或 (2) archive 端改为通过 `node.type` 查 WorkflowDefinition。选(1)更直接。
- [ ] **[Review][Patch] HIGH · `rejections` badge 把 failed step 计入** [shadowflow/api/archive.py:1242] — `sum(1 for s in steps if s.status in ("failed",))` 把 LLM timeout / infra failure 都算 rejection。应从 `NODE_REJECTED` 事件或 `_rejection_events[run_id]` 派生。
- [ ] **[Review][Patch] HIGH · search 只覆盖 intent/workflow_id/run_id,缺 agent / policy** [shadowflow/api/archive.py:1201-1210] — spec AC1+AC5 明确要 intent / agent_name / policy_name 三个模糊匹配;当前无 agent/policy。把搜索扩到 step 的 agent 名和 run 的 policy_matrix 涉及角色。
- [ ] **[Review][Patch] MEDIUM · sort 把运行中 run 埋在 epoch 0 最底** [shadowflow/api/archive.py:1212] — `completed_at or datetime.fromtimestamp(0)` + `reverse=True` 让 running run 沉底。窗口过滤又故意留下 running run,语义矛盾。改为 `(completed_at is None ? now : completed_at)` 排序或单独分组 running-first。
- [ ] **[Review][Patch] MEDIUM · cursor not-found 静默从头** [shadowflow/api/archive.py:1217-1220] — `after_cursor` 对应的 run_id 不在当前过滤集(另一个请求间删掉/状态变)时 `start=0`,客户端永远在 page 1 打转。返回 410 Gone 或在响应明确 `cursor_invalidated: true`。
- [ ] **[Review][Patch] MEDIUM · `ArchiveService._collect` metadata 访问风格不一致** [shadowflow/api/archive.py:1252] — 其他地方用 `getattr` 防御,这里直接 `run_rec.metadata`;如果 `run_result.run` 是 None/dict 立刻 crash。改用 getattr 风格一致。
- [ ] **[Review][Patch] MEDIUM · 共享 `RunSummary` Pydantic 合约未扩 `badges`** [shadowflow/runtime/contracts.py] — spec 要求"扩展 RunSummary Pydantic model + 新增 RunBadges + 跑 generate_ts_types.py"。当前 `RunBadges` 只活在 `archive.py` 局部,其他 consumer (`/workflow/runs/{id}` / trajectory exporter) 看不到。把 `RunBadges` 提到 `contracts.py`,给 `RunSummary` 加可选 `badges` 字段,跑 `scripts/generate_ts_types.py` 同步 TS。

#### Deferred

- [x] **[Review][Defer] `intent` / `workflow_id` 未长度封顶或 CSV 转义** [shadowflow/api/archive.py:1252] — MVP 暂忽;CSV export 真上时再处理。
- [x] **[Review][Defer] search 无索引 O(n)** [shadowflow/api/archive.py:1201-1210] — MVP 10k runs 内可接受。
- [x] **[Review][Defer] P95 ≤ 200ms + cursor 翻页无重叠 NFR 测试缺失** [tests/test_archive_api.py] — NFR 测试集。

---

Code review 2026-04-22 · Chunk B 前端 (Epic 4 合批) · 3 层并行评审 (Blind / EdgeCase / AcceptanceAuditor)。

#### Patch — Chunk B

- [x] **[Review][Patch] 4.8 · useArchiveStore fetch 响应无 `.ok` 校验** [`src/core/stores/useArchiveStore.ts`] — `fetchRuns` / `fetchTrajectory` 均直接 `res.json()` 无 `if (!res.ok) throw` 守卫；4xx/5xx 时将错误报文 body 写入 store，列表渲染乱码。加统一 `if (!res.ok) throw new Error(res.statusText)` 并在 catch 中 `set({ error: e.message, loading: false })`。
- [x] **[Review][Patch] BLOCKER · 4.8 · useArchiveStore state 字段 `window` 遮蔽浏览器全局 `window`** [`src/core/stores/useArchiveStore.ts`] — `const { search, window } = get()` 解构后，同函数作用域内 `window` 指向 store 字段（字符串）而非 `globalThis.window`；若该函数体或其调用链中任何代码访问 `window.location` / `window.open` 等，将静默崩溃。将 store 字段重命名为 `timeWindow` 或 `selectedWindow`，同步更新所有引用点。
- [x] **[Review][Patch] 4.8 AC1 · RunListPane RunCard 缺失关键列（duration / policy_hits）** [`src/core/components/Panel/RunListPane.tsx`] — AC1 规范 badge 需展示 `rejections` / `approvals` / `cancelled` 三维度及 run 耗时；当前 RunCard 仅渲染 `run_id` + `status` badge，无 duration 计算（`completed_at - started_at`）、无 policy_hits 徽章。补齐：(1) `duration = completed_at ? formatDuration(completed_at - started_at) : 'running'`；(2) `badges.rejections > 0` → 橙色 pill；(3) `badges.approvals > 0` → 蓝色 pill。
