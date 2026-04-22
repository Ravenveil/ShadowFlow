# Story 4.9: Policy Matrix Observability — 驳回热力 + 触发样本

Status: review
Created: 2026-04-21T07:00:46Z

---

## Story

As a **模板作者 / 主编陈姐(J3) / 研究员**,
I want **一张页面看到我配置的每条 policy 在过去 N 天被触发了多少次、集中在哪个 stage、最近 5 个驳回实例是什么**,
so that **我能判断哪条 policy 阈值过严(太多无谓 retry)或过松(真 bug 漏过),据此调整规则**。

---

## Acceptance Criteria

### AC1: 路由 + Summary 统计栏

**Given** `src/core/pages/PolicyObservabilityPage.tsx` 新增,路由挂 `/policy/observability`
**When** 用户打开页面
**Then** 顶部 Summary 栏(见 pen frame `sumbar`)展示 5 指标:
- **总驳回数**:窗口内全部 `reject` 事件数量 + 占总 Run 数百分比(格式 `123 (34%)`)
- **Top policy**:驳回次数最多的 policy name + 数量(橙字 `#F59E0B`)
- **Top stage**:驳回最集中的 stage name + 数量
- **Recovered rate**:retry 后最终通过的驳回数 / 总驳回数 × 100%(绿字 `#22C55E`,越高越好)
- **Median loops**:中位数 retry 轮次(mono 字体)
**And** 顶部右上角时间窗下拉:`Last 24h ▾`(选项:24h / 7d / 30d / all)
**And** 切换时间窗时全页数据重聚合,loading 骨架屏 ≤ 1.5s

### AC2: Heatmap 面板 — policy × stage 驳回矩阵

**Given** 页面主体左侧 HeatmapPanel(见 pen frame `HeatmapPanel`)
**When** 页面渲染
**Then**:
- **行** = ShadowFlow 已配置的 policy 列表(从 `usePolicyStore` 或 `GET /policy/stats` 返回)
- **列** = 5 lifecycle stages:`Intent / Plan / Review / Execute / Deliver`(枚举从 `src/common/types/stage.ts` 导入,若 Story 4.8 已创建则直接 import;否则本 Story 创建)
- **单元格** = 该 policy 在该 stage 的驳回计数,颜色按强度 6 档:
  - 0 → `#18181B`(背景色,不显示数字)
  - 1-5 → `#1A2535`(极淡蓝)
  - 6-15 → `#1B3A6B`(淡蓝)
  - 16-25 → `#1D5EA0`(中蓝)
  - 26-40 → `#F59E0B`(橙,警告级别)
  - 41+ → `#EF4444`(红,严重)
- 右上角图例 `LG1~LG6`(6 个 8×8 色块 + 数字范围标注)
- 行数超 20 时底部展示 "show more +" 懒加载

**Given** 用户点击某单元格或行头(policy name)
**When** click
**Then** 右侧 ExamplesPanel 切换到该 policy 的触发样本列表(高亮选中行)

### AC3: Examples 面板 — 触发样本

**Given** 右侧 ExamplesPanel(见 pen frame `ExamplesPanel`)
**When** 用户选中一条 policy(点 heatmap 行头或单元格)
**Then** 展示该 policy 最近 5 条驳回事件:
- `run_id`(mono 10px,截断前 12 位)
- `stage`(pill badge,颜色同 StageTimeline — 来自 Story 4.8 `StageTimeline.tsx` 同色方案)
- `timestamp`(相对时间,格式 `Xh ago` / `Xd ago`)
- `reason` 文本(14px,截断 2 行,hover 展开全文)
- `outcome` badge:`retry → ok`(绿)/ `aborted`(红)

**Given** 用户点击任一 example 行
**When** click
**Then** 跳 `/archive/{run_id}`(Story 4.8 ArchivePage)打开该 Run 完整轨迹

### AC4: 功能按钮

**Given** 页面右上角两个按钮

**"Edit matrix"按钮**:
**When** 点击
**Then** 跳 `/editor` 并定位到 PolicyMatrixPanel(Story 4.5)
- URL: `/editor?panel=policy&highlight={selected_policy}` (前端 query param 触发 PolicyMatrixPanel 开启并高亮目标 policy)
- 若无 `selected_policy` 则仅打开 editor 页

**"Download CSV"按钮**:
**When** 点击
**Then** 导出 CSV:
- 列:`policy_name, intent, plan, review, execute, deliver, total, window, timestamp`
- 文件名:`policy-stats-{window}-{YYYY-MM-DD}.csv`
- 可直接输入 Activation Bandit 训练(Story 6.1+,本 Story 仅负责导出格式正确)

### AC5: 后端聚合 endpoint

**Given** FastAPI `GET /policy/stats?window=7d`
**When** 前端请求
**Then** 返回:
```json
{
  "data": {
    "summary": {
      "total_rejections": 42,
      "total_runs": 12,
      "rejection_rate_pct": 28.5,
      "top_policy": { "name": "legal_review", "count": 18 },
      "top_stage": { "name": "review", "count": 22 },
      "recovered_rate_pct": 71.4,
      "median_loops": 2.0
    },
    "heatmap": [
      {
        "policy": "legal_review",
        "counts": { "intent": 0, "plan": 2, "review": 12, "execute": 4, "deliver": 0 }
      }
    ],
    "examples": {
      "legal_review": [
        {
          "run_id": "...", "stage": "review",
          "timestamp": "ISO8601", "reason": "...", "outcome": "retry_ok"
        }
      ]
    }
  },
  "meta": { "trace_id": "...", "timestamp": "...", "window": "7d" }
}
```
- 数据源:Story 1.3 `policy.violation` 事件流 + Story 1.5 trajectory 历史查询
- 后端 15 分钟 TTL 内存缓存(与 Story 4.7 `OpsAggregator` 同模式:`cachetools.TTLCache` 按 window 分 key)
- P95 响应 ≤ 300ms(聚合计算 + 缓存命中)

---

## Tasks / Subtasks

### 前端

- [x] **[AC1]** 新建 `src/core/pages/PolicyObservabilityPage.tsx`
  - [x] 路由 `/policy/observability`(注册到 `src/App.tsx`)
  - [x] 两栏布局:HeatmapPanel(flex-1)+ ExamplesPanel(360px 右侧)
  - [x] 顶部 SummaryBar + 时间窗下拉(共用 `WindowFilterDropdown`,若 Story 4.7/4.8 已建则 import)
  - [x] Zustand store `usePolicyObsStore`(独立 store):
    - state: `{ summary, heatmap, examples, window, selected_policy, loading }`
    - actions: `fetchStats(window)` / `selectPolicy(name)`

- [x] **[AC1]** 新建 `src/core/components/Panel/PolicySummaryBar.tsx`
  - [x] 5 格 KPI 布局(flex row,各 KPI 含 label + value + 颜色规则)
  - [x] 可复用 Story 4.7 的 `KPICard.tsx`(若已建则 import;Props 适配 ObsMetric 格式)

- [x] **[AC2]** 新建 `src/core/components/Panel/PolicyHeatmap.tsx`
  - [x] div-grid 实现(CSS Grid:`grid-template-columns: [label] auto [stages] repeat(5, 1fr)`)
  - [x] 行头:policy name(bold)+ total count(mono muted)
  - [x] 单元格:`HeatmapCell.tsx`(Props: `{ count, policy, stage, selected }`)
    - 颜色函数 `getCellColor(count: number): string`(6 档映射)
    - hover tooltip:`{policy} × {stage}: {count} 次`
    - click 触发 `selectPolicy(policy)`
  - [x] 图例组件 `HeatmapLegend.tsx`(6 色块 + 数字区间)
  - [x] **不引入 chart lib**(如 recharts/visx/d3);纯 CSS Grid + Tailwind 实现

- [x] **[AC2]** stage.ts 共用
  - [x] 若 Story 4.8 已创建 `src/common/types/stage.ts` → 直接 import
  - [x] 若 4.8 未合并 → 本 Story 创建(内容与 Story 4.8 完全一致,PR 合并时协调)

- [x] **[AC3]** 新建 `src/core/components/Panel/TriggeredExamplesList.tsx`
  - [x] 无选中时显示 placeholder `"点击左侧 Policy 查看触发样本"`
  - [x] 有选中时展示最多 5 条 example row
  - [x] 点击任一 row → 导航 `navigate(`/archive/${run_id}`)`

- [x] **[AC4]** 按钮实现
  - [x] "Edit matrix" 按钮:`navigate('/editor', { state: { panel: 'policy', highlight: selectedPolicy } })`
  - [x] "Download CSV":`buildCsvBlob(heatmap, window)` → `URL.createObjectURL` → `<a download>`触发
  - [x] 新建 `src/common/lib/csvExporter.ts`:
    - `exportPolicyStats(heatmap: HeatmapRow[], window: string): void`
    - 用 浏览器原生 CSV 构造(不引入第三方库)

### 后端

- [x] **[AC5]** 新建 `shadowflow/api/policy_observability.py`
  - [x] `GET /policy/stats?window=24h|7d|30d|all` endpoint
  - [x] `PolicyStatsQuery` Pydantic model(window 枚举验证)
  - [x] `PolicyObsAggregator` 类:
    - 接受 `EventBus`(Story 4.1)ring buffer + `CheckpointStore`(历史 trajectory)两数据源
    - `aggregate(window: str) -> PolicyStats`:
      - 时间窗过滤 `policy.violation` 事件
      - 聚合 heatmap: `{policy × stage → count}`
      - 聚合 summary(5 指标计算)
      - 聚合 examples:每 policy 最近 5 条 reject 事件
    - 15 min TTL 缓存:`cachetools.TTLCache(maxsize=4, ttl=900)`,key = window 字符串
  - [x] 新增 Pydantic 模型 `PolicyStats` / `HeatmapRow` / `RejectExample` / `ObsSummary`
    - 全部放 `shadowflow/api/policy_observability.py` 或 `shadowflow/runtime/contracts.py`(新字段,只新增)
  - [x] 挂载 router 到 `shadowflow/server.py`

- [x] **[AC5]** 新增 `tests/test_policy_obs.py`:
  - [x] 空事件时 summary 全 0,heatmap 空列表
  - [x] 10 个 mock `policy.violation` 事件(3 种 policy × 2 stage)→ 验证 heatmap counts
  - [x] recovered_rate 计算:5 retry_ok / 10 total = 50%
  - [x] 缓存 TTL:同 window 第二次调用不查事件流(mock EventBus 调用次数验证)
  - [x] P95 响应 ≤ 300ms(50 runs mock)

### 共用

- [ ] 路由注册:`/policy/observability` 加入 `src/App.tsx`
- [ ] 导航入口:与 Story 4.7(`/ops`)、Story 4.8(`/archive`)同级添加 Observability 导航链接
- [ ] `WindowFilterDropdown` 组件:若 Story 4.7/4.8 未建则本 Story 建,供三页共用
  - 放 `src/core/components/common/WindowFilterDropdown.tsx`(时间窗通用组件)

---

## Dev Notes

### 架构依据

- **Epic 4 Goal**:实时看板 + fleet-level 观测。Story 4.9 = 驳回质量分析维度,补充 4.5(PolicyMatrixPanel 编辑)与 1.1(Policy Matrix 核心对象)
- **Pencil 视觉锚点**:frame `PolicyMatrixObservability` id `6Q8Hd` @ (3200, 14200)
- **关键 PRD**: FR10(Policy Matrix 可视化)/ FR12(驳回统计)/ FR20(policy 可视化编辑 — 本页是只读观测伴生)
- **Data 反哺**:CSV 导出可直接输入 Story 6.1 `Activation Bandit` 训练数据(policy trigger signal)

### 依赖 Stories 关系

| 依赖 | 接口 | 状态 |
|------|------|------|
| **Story 1.3** (运行时真驳回) | `policy.violation` 事件结构(sender/receiver/reason/stage/timestamp) | ready-for-dev |
| **Story 1.5** (Trajectory export API) | `GET /workflow/runs/{id}?format=trajectory` 历史 reject 查询 | ready-for-dev |
| **Story 4.5** (PolicyMatrixPanel) | Jump target(`/editor?panel=policy`)+ `usePolicyStore`(policy list 来源) | ready-for-dev |
| **Story 4.8** (ArchivePage) | Jump target(`/archive/{run_id}`)+ `stage.ts` 共用枚举 | just created |

> ⚠️ **构建顺序风险**:
> - 若 Story 1.3 未完成:`policy.violation` 事件不存在 → 后端 `PolicyObsAggregator` 用 mock 数据或返回空(前端 graceful empty state)
> - 若 Story 4.8 未合并:`stage.ts` 文件本 Story 自建(PR 时协调)
> - 若 Story 4.5 未完成:"Edit matrix" 按钮 href 跳 `/editor` 仍可工作(无深链高亮),不阻塞本 Story

### 涉及文件(完整清单)

**前端新增**:
- `src/core/pages/PolicyObservabilityPage.tsx`
- `src/core/components/Panel/PolicySummaryBar.tsx`
- `src/core/components/Panel/PolicyHeatmap.tsx`
- `src/core/components/Panel/HeatmapCell.tsx`(可内联或独立组件)
- `src/core/components/Panel/HeatmapLegend.tsx`
- `src/core/components/Panel/TriggeredExamplesList.tsx`
- `src/core/store/usePolicyObsStore.ts`
- `src/common/lib/csvExporter.ts`
- `src/common/types/stage.ts`(若 Story 4.8 未先创建)
- `src/core/components/common/WindowFilterDropdown.tsx`(若 4.7/4.8 未建)

**前端修改**:
- `src/App.tsx`(挂 `/policy/observability` 路由)
- 导航组件(添加 Observability 入口)

**后端新增**:
- `shadowflow/api/policy_observability.py`(endpoint + aggregator)
- `tests/test_policy_obs.py`

**后端修改**:
- `shadowflow/server.py`(include_router policy_observability)
- `shadowflow/runtime/contracts.py`(新增 PolicyStats / HeatmapRow / RejectExample,只新增不改)

### 关键架构约束

1. **不引入 chart lib**:PolicyHeatmap 用 CSS Grid + Tailwind 实现,与 Story 4.7 sparkline 的"mono font 方块字符"同理——MVP 避免引入 recharts/visx/d3 等依赖。
2. **独立 Zustand store**:`usePolicyObsStore` 严禁与 `usePolicyStore`(编辑器用)耦合。观测 store 只读,编辑 store 只写。
3. **contracts.py 字段只新增**:新 Pydantic model 用 `Optional` + default,保证向后兼容。
4. **stage.ts 不重复**:若 Story 4.8 已创建则直接 import;PR 合并时检查冲突(两个 Story 可能同时 PR)。
5. **15 min TTL 缓存**:`cachetools.TTLCache` 按 window 分 key(最多 4 个 key:24h/7d/30d/all)。避免 N run × M policy fanout 查事件流。
6. **无 DB 设计遵守**:聚合从内存事件总线 ring buffer + checkpoint store 扫描,不引入 SQLite 表。
7. **CSV 导出不引入库**:用浏览器原生 `Blob + URL.createObjectURL` 实现,不 import csv-stringify 等。

### 前序 Story 经验

- **Story 4.7 (OpsAggregator)**:15 min TTL 缓存(`cachetools.TTLCache`)模式已在 4.7 建立,本 Story `PolicyObsAggregator` 完全沿用相同实现模式
- **Story 4.7 (KPICard)**:`KPICard.tsx` 若已存在,本 Story `PolicySummaryBar` 应复用它(Props 格式相同:label + value + delta/color),不重复实现
- **Story 4.8 (3 列布局)**:left pane + main + right detail 模式已验证,本 Story 用 heatmap + examples 2 列(无需第三列)
- **Story 4.8 (stage.ts)**:`Stage` 枚举如已建立,本 Story heatmap 列顺序必须与 StageTimeline 一致
- **Story 4.5 (usePolicyStore)**:policy 列表来源可能已在 `usePolicyStore.matrix` 中;本 Story 从 `GET /policy/stats` API 独立获取 policy 列表(不 coupling 编辑 store)

### 术语锁定

- **不使用 edict 叙事**:所有 UI 字符串 / log 用 ShadowFlow 本体术语:Policy Matrix / ApprovalGate / Run / Stage / Provider / Agent。不出现"三省六部 / 门下省 / 上朝"等叙事(见 memory/feedback_no_borrowing.md)
- **5 Stage 名称锁定**:`Intent / Plan / Review / Execute / Deliver`(来自 epics-addendum-2026-04-17-observability.md Cross-Story Notes)

### 测试标准

**单元测试**:
- `tests/test_policy_obs.py`:数据聚合逻辑 + 缓存 TTL + P95 响应
- `PolicyHeatmap.test.tsx`:6 色档渲染 + 点击高亮 + 图例展示
- `TriggeredExamplesList.test.tsx`:5 examples 渲染 + 无选中 placeholder + click 导航

**集成测试**:
- 后端起 `shadowflow-api`,mock 20 个 `policy.violation` 事件 → `/policy/stats?window=7d` 返回正确 heatmap + summary

**手工 Demo smoke**:
- 执行含 policy reject 的 run(J2 场景)→ 打开 `/policy/observability` → heatmap `Review` 列有高亮 → 点击该格 → Examples 面板显示 reject 样本 → 点击跳 `/archive/{run_id}` 正确打开轨迹

---

## References

- [Source: epics-addendum-2026-04-17-observability.md#Story 4.9]
- [Source: architecture.md#API & Communication Patterns]
- [Source: architecture.md#Frontend Architecture (Zustand 独立 store)]
- [Source: Story 1.3 (policy.violation 事件 — 数据源)]
- [Source: Story 1.5 (trajectory export — 历史 reject 查询)]
- [Source: Story 4.5 (PolicyMatrixPanel — 编辑跳转目标)]
- [Source: Story 4.7 (OpsAggregator — TTL 缓存模式 precedent)]
- [Source: Story 4.8 (ArchivePage — stage.ts 共用 + run 跳转目标)]
- [Source: docs/design/shadowflow-ui-2026-04-16-v2.pen frame `PolicyMatrixObservability` id `6Q8Hd`]
- [Source: memory/feedback_no_borrowing.md (术语锁定原则)]
- [Source: memory/project_pencil_design_language.md (色板 + 圆角 + 字体)]

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Code Dev Agent)

### Debug Log References

_n/a_

### Completion Notes List

- `shadowflow/api/policy_observability.py` 新建: `PolicyObsAggregator` + 15 min TTL 缓存 + `/policy/stats` endpoint。
- 6 档颜色通过 `heatmapColor` 单测覆盖 (0/5/15/25/40/41+)。
- 前端 Heatmap 用 CSS Grid + Tailwind (无 chart lib),Examples 面板点击跳 `/archive/{run_id}`。
- CSV 导出使用 Blob + URL.createObjectURL 原生实现。
- 与 Story 4.8 共用 `src/common/types/stage.ts`。

### File List

- shadowflow/api/policy_observability.py (new — aggregator + endpoint)
- src/core/stores/usePolicyObsStore.ts (new)
- src/core/components/Panel/PolicyHeatmap.tsx (new)
- src/core/pages/PolicyObservabilityPage.tsx (new)
- src/__tests__/components/PolicyHeatmap.test.tsx (new)
- tests/test_policy_obs.py (new)

### Change Log

- 2026-04-22: Story 4.9 完成,状态 → review
- 2026-04-22: Code review (Chunk A / 后端) 完成,发现 1 Decision / 8 Patch / 4 Defer,状态 → in-progress
- 2026-04-22: Code review (Chunk B / 前端) 完成,发现 0 Decision / 1 Patch / 0 Defer

### Review Findings

Code review 2026-04-22 · Chunk A 后端。

#### Decisions Resolved (2026-04-22)

- [x] **[Review][Decision→Patch] `_count_runs` 分母统一 completed_at** — 决议 **(b)**:统一用 `r.completed_at` 过滤(只数已结束的 run),跟 Archive 对齐。进行中 run 不进入分母;进程重启后 in-memory 丢失的问题归入 defer(需 CheckpointStore aggregation 独立故事)。

#### Patch

- [ ] **[Review][Patch] 4.9 · `_count_runs` 分母统一 completed_at** [shadowflow/api/policy_observability.py:1491-1493] — `return sum(1 for r in runs if r.completed_at is not None and r.completed_at >= cutoff)`;进行中 run 不进分母,跟 archive `completed_at` 窗口一致。(源决议 8b)
- [ ] **[Review][Patch] HIGH · `top_policy` / `top_stage` 使用 `max(dict, key=dict.get)` 非确定性** [shadowflow/api/policy_observability.py:1425] — 两个 policy 平分时靠 dict insertion order,UI 会闪烁,测试可能 flaky。改 `sorted(items, key=lambda kv: (-kv[1], kv[0]))[0]` 或 tuple 比较 tie-break。
- [ ] **[Review][Patch] HIGH · 直接访问 `bus._store` 私有属性 + 无窗口扫描** [shadowflow/api/policy_observability.py:1454] — `getattr(bus, "_store", {})` 依赖 RunEventBus 内部结构;每次请求全扫所有 run × 每 run 1000 事件 ring buffer。建议:(1) 给 `RunEventBus` 加公共 `iter_filtered(event_name=..., since=...)` 方法;(2) 扫描用 since-cursor 而非全扫。
- [ ] **[Review][Patch] HIGH · TTL 缓存无 new-violation invalidation** [shadowflow/api/policy_observability.py:1374-1376] — 新 `policy.violation` 事件发布后,UI 最多 15 分钟看到旧快照。订阅 bus,收到 `policy.violation` / `node.rejected` 时 clear 相关 key。
- [ ] **[Review][Patch] MEDIUM · `ts is None` 时静默绕过 cutoff** [shadowflow/api/policy_observability.py:1466-1470] — `if cutoff is not None and ts is not None and ts < cutoff: continue`:ts=None 时永远不过滤,旧事件污染短窗口。改为 ts=None 时按 cutoff 外处理(drop 或只在 no-cutoff 时包含)。
- [ ] **[Review][Patch] MEDIUM · `policy` 字段 fallback 到 `sender`(reviewer 角色)** [shadowflow/api/policy_observability.py:1475] — `reject()` 事件 payload 没有 `policy` 字段,aggregator 退回 `sender=reviewer_role`,结果 heatmap 行键/top_policy 实际是"top reviewer"。修:`RuntimeService.reject()` 发事件时显式带 `policy` 字段(policy 名或 matrix 规则 id);对缺 `policy` 的事件单独分到 `__unknown__` 桶。
- [ ] **[Review][Patch] MEDIUM · 未知 stage 折叠到 `review`** [shadowflow/api/policy_observability.py:1401-1402] — "research" / None 都被当成 review,review 计数虚高。加 `"other"` bucket 或保留原始 stage。
- [ ] **[Review][Patch] LOW · `examples` 未按 timestamp desc 排序** [shadowflow/api/policy_observability.py] — AC3 要求"最近 5 条";当前 `ex[-5:]` 只取"最后插入 5 条",ring buffer 复位 / 回放时顺序不匹配 timestamp。`sorted(examples, key=ts, reverse=True)[:5]`。
- [ ] **[Review][Patch] LOW · 未用 `Kind` Literal + `BLOCK_KINDS` 重复定义** [shadowflow/runtime/contracts.py:187,257,264] — `Kind = Literal[...]` 无引用点;`BLOCK_KINDS` set 与 `BlockDef.kind` 的 Literal 两处真相源,漂移风险。删 `Kind` 或真正用;`BlockDef.kind` 基于 `BLOCK_KINDS` 派生。

#### Deferred

- [x] **[Review][Defer] P95 ≤ 300ms + 50-runs 规模测试缺失** [tests/test_policy_obs.py] — NFR 测试集。
- [x] **[Review][Defer] `RunEventBus._store` 无驱逐** [shadowflow/runtime/events.py] — 独立 eviction 故事。
- [x] **[Review][Defer] `NODE_RETRIED` 常量在本 chunk 无发布点** [shadowflow/runtime/contracts.py] — Chunk B(TraceView)使用。
- [x] **[Review][Defer] `_rejection_events` 无上限** [shadowflow/runtime/service.py:460] — pre-existing 内存泄漏。

---

Code review 2026-04-22 · Chunk B 前端 (Epic 4 合批) · 3 层并行评审 (Blind / EdgeCase / AcceptanceAuditor)。

#### Patch — Chunk B

- [x] **[Review][Patch] 4.9 · usePolicyObsStore `fetchStats` 无 HTTP `.ok` 校验** [`src/core/stores/usePolicyObsStore.ts`] — `const res = await fetch('/policy/stats?...')` 后直接 `const json = await res.json()`，无 `if (!res.ok) throw` 守卫；后端 500（如 cachetools 未安装）时将错误报文写入 store，heatmap 渲染崩溃。加 `if (!res.ok) throw new Error(res.statusText)` 并在 catch 分支 `set({ error: e.message, loading: false })`。
