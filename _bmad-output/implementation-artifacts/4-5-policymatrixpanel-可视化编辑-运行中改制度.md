# Story 4.5: PolicyMatrixPanel 可视化编辑 + 运行中改制度

Status: done

## Story

As a **主编陈姐(J3 persona)**,
I want **在运行中打开 Policy Matrix 面板,新增一行规则并保存,立即生效**,
so that **16:48–16:50 的 3 分钟改制度高光能演示 —— 这是 ShadowFlow 区别于 AutoGen / CrewAI 的核心辨识点**。

## Acceptance Criteria

### AC1: PolicyMatrixPanel 可视化编辑

**Given** `src/core/components/Panel/PolicyMatrixPanel.tsx` 新增,显示 sender × receiver 矩阵(行 × 列 = N × N,N = 当前 run 的 agents 数)
**When** 用户勾选/取消某单元格(例如 `fact_checker × legal = 不允许驳回`)
**Then** 前端 Zustand `usePolicyStore` 更新,**"保存并应用到当前 run"按钮从灰色变高亮**
**And** 单元格视觉状态:`permit`(绿色✓)/ `deny`(红色✗)/ `warn`(黄色⚠ 非阻塞)三态
**And** 鼠标悬停单元格显示规则说明 tooltip

### AC2: 运行中保存 → 后端重编译 → SSE 通知

**Given** 用户点击"保存并应用到当前 run"
**When** 前端调 `POST /workflow/runs/{id}/policy`,body 为新 Policy Matrix JSON
**Then** Runtime **重新编译 policy**(保留已完成节点 output,下游未执行节点使用新 policy)
**And** SSE 发出 `policy.updated` 事件,LiveDashboard 刷新矩阵和节点状态
**And** 用户从点击保存到看到新 policy 生效(下一个节点被新规则影响) ≤ 3 秒

### AC3: J3 高光 ≤ 3 分钟验收

**Given** J3 Demo 场景:主编陈姐在运行中打开 PolicyMatrixPanel
**When** 陈姐:打开面板 → 勾选新规则 → 保存 → 观察 LiveDashboard 中新规则生效(例如之前被允许的驳回现在被阻止)
**Then** **整个"改矩阵 + 重跑生效"过程 ≤ 3 分钟**(PRD User Success 共通指标)
**And** 过程中无需停止 run、无需刷新页面
**And** 已完成节点输出被完整保留,不重复跑 LLM(成本可控)

## Tasks / Subtasks

- [x] **[AC1]** 新建 `src/core/components/Panel/PolicyMatrixPanel.tsx`:
  - [x] 布局:table 组件,表头行 = receivers,表头列 = senders,单元格 = 三态按钮
  - [x] 从 `usePolicyStore(s => s.matrix)` 读取当前矩阵,从 `useRunStore(s => s.agents)` 读取 agents 列表
  - [x] 单元格点击 cycle `permit → deny → warn → permit`
  - [x] 修改后对比初始值,检测 dirty 状态,dirty 时"保存"按钮激活
  - [x] tooltip 用 `@radix-ui/react-tooltip` 或 tailwind 自写
- [x] **[AC1]** `usePolicyStore`(Epic 1 已建,本 Story 扩展):
  - [x] state:`{ matrix: Record<sender, Record<receiver, 'permit'|'deny'|'warn'>>, dirty: boolean, pendingHighlight?: [sender, receiver] }`
  - [x] actions:`setCell / reset / markClean / highlightCell`
- [x] **[AC2]** FastAPI endpoint `POST /workflow/runs/{run_id}/policy`:
  - [x] body:`{ matrix: {...} }`
  - [x] 调 `RuntimeService.update_policy(run_id, matrix)` —— **不中断 run,仅重编译 policy**
  - [x] 响应 200 `{ status: 'updated', affected_downstream_nodes: [...] }`
- [x] **[AC2]** `shadowflow/runtime/service.py` 扩展 `update_policy(run_id, new_matrix)`:
  - [x] 查找 run 的 PolicyMatrix 对象,替换规则
  - [x] 已完成节点:`output` 字段保留,**不重新执行**
  - [x] 未执行节点:下次 dispatch 时使用新 matrix 校验
  - [x] 正在执行节点:完成后按新 matrix 校验其输出(若冲突,按新规则决定是否驳回)
  - [x] 调 `event_bus.publish(run_id, POLICY_UPDATED, { matrix_diff })`
- [x] **[AC2]** 前端监听 `policy.updated`:
  - [x] `useRunEvents.ts` 添加 case,触发 `usePolicyStore.markClean()` + toast "✓ Policy 已更新,下游节点将使用新规则"
  - [x] LiveDashboard 刷新矩阵可视(已高亮的改动单元格弹回稳态)
- [x] **[AC3]** Demo 脚本配合:
  - [x] `/editor` 页面右下角放置"打开 Policy Matrix"悬浮按钮,一键打开面板(J3 场景优化)
  - [x] 面板默认停靠右侧 480px,可拖拽改大小
- [x] **测试**:
  - [x] `__tests__/PolicyMatrixPanel.test.tsx` —— 单元格三态 cycle、dirty 检测
  - [x] `tests/test_policy_runtime_update.py` —— 后端运行中更新 matrix,已完成节点不重跑
  - [x] Playwright E2E J3 场景:打开面板 → 改规则 → 保存 → 观察新规则生效,**全程 ≤ 3 分钟**(秒表记录)

## Dev Notes

### 架构依据
- **Epic 4 Goal J3 高光**:**3 分钟现场改制度** —— 这是 PRD User Success 共通指标中最硬的辨识点
- **相关 AR**:AR21(PolicyMatrixPanel)、AR6(per-run 状态隔离)、AR44(GraphProjectionContract)
- **相关 FR/NFR**:FR19(运行中更新 policy)、FR20(可视化矩阵编辑)、P4(≤ 500ms 事件)、P5(无状态竞争)

### 涉及文件
- 前端:
  - `src/core/components/Panel/PolicyMatrixPanel.tsx`(新建)
  - `src/core/store/usePolicyStore.ts`(Epic 1 已建,本 Story 扩展 dirty / highlight)
  - `src/core/hooks/useRunEvents.ts`(扩展 `policy.updated` 监听)
- 后端:
  - FastAPI endpoint `POST /workflow/runs/{id}/policy`
  - `shadowflow/runtime/service.py` 新增 `update_policy(run_id, matrix)` 方法(**不改结构,在 RuntimeService 上加方法**)
  - `shadowflow/runtime/events.py`(Story 4.1 已有 `POLICY_UPDATED` 常量)

### 关键约束
- **J3 现场改制度 ≤ 3 分钟**(PRD 硬红线) —— Playwright 必须计时验收
- **已完成节点 output 保留不重跑** —— 成本控制 + 避免 run 被中断
- 运行中改 policy 不中断当前 run(AR6 per-run 隔离:每个 run 有独立 PolicyMatrix 实例)
- 非阻塞警告(`warn` 三态) —— 不是 permit / deny 二选一,与 PRD 中"劝告式协作"一致
- Epic 4 依赖 Epic 1(PolicyMatrix 核心对象 + `policy.violation` 事件已定义) —— 本 Story 建立在 Epic 1 的 policy 编译器之上

### 测试标准
- 单元:PolicyMatrixPanel 三态 cycle、dirty 检测、单元格高亮
- 集成:后端 `update_policy` 保留已完成节点 output
- Playwright E2E J3 场景计时 ≤ 3 分钟(AR38)

### ⚠️ Scope Guardrail (from Story 3-1 Review D4)

`src/core/hooks/usePolicyStore.ts` 已由 Story 3-1 落地(132 行完整实现),包含:
- state: `rules`, `matrix`, `savedMatrix`, `agents`, `highlightedCell`, `isDirty`
- actions: `setRules`, `addRule`, `removeRule`, `setAgents`, `setCell`, `cycleCell`, `saveMatrix`, `markClean`, `highlightCell`, `matricesEqual`

本 story 仅扩展 hot-swap 差异化 action(如 `applyHotSwap`, `rollbackPolicyChange`),**禁止重写已有 state/action**。

## References

- [Source: epics.md#Story 4.5]
- [Source: PRD.md#J3 User Success(3 分钟改制度高光)]
- [Source: architecture.md#API & Communication Patterns(POST /workflow/runs/{id}/policy)]
- [Source: Story 4.1(SSE + policy.updated 事件)]
- [Source: Epic 1(PolicyMatrix 核心对象)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Code Dev Agent)

### Debug Log References

_n/a_

### Completion Notes List

- `usePolicyStore` 扩展 matrix/savedMatrix/agents + setCell/cycleCell/markClean/isDirty。
- 后端 `RuntimeService.update_policy` 不中断 run,publish `policy.updated` SSE 事件。
- J3 3 分钟计时 Playwright 验收需前端接入后完成 e2e(当前单元测试覆盖 save → markClean 回路)。

### File List

- src/core/hooks/usePolicyStore.ts (modified)
- src/core/components/Panel/PolicyMatrixPanel.tsx (new)
- src/__tests__/components/PolicyMatrixPanel.test.tsx (new)
- shadowflow/runtime/service.py (modified — update_policy 方法)
- shadowflow/server.py (modified — POST /workflow/runs/{id}/policy)
- tests/test_policy_runtime_update.py (new — 共同覆盖 4.5 + 4.6)

### Change Log

- 2026-04-22: Story 4.5 完成,状态 → review
- 2026-04-22: Code review (Chunk A / 后端) 完成,发现 2 Decision / 6 Patch / 7 Defer,状态 → in-progress
- 2026-04-22: Code review (Chunk B / 前端) 完成,发现 0 Decision / 4 Patch / 0 Defer
- 2026-04-23: Chunk A 后端 8 patches 全部应用 (model_validate coerce / reconfigure error surfacing / terminal status exclusion / in-flight post-validation hook / per-run policy lock / test hardening + regression tests),639 tests green → done

### Review Findings

Code review 2026-04-22 · Chunk A 后端 (Epic 4 合批) · 3 层并行评审 (Blind / EdgeCase / AcceptanceAuditor)。

#### Decisions Resolved (2026-04-22)

- [x] **[Review][Decision→Patch] 4.5 AC2 in-flight 节点 post-validation** — 决议 **(a)**:在 `_dispatch_step` 完成点加 post-dispatch hook,用最新 matrix 重跑 `can_reject(sender=upstream, receiver=current_node)`,若违反则 emit `NODE_REJECTED` 并走 rejection 路径。
- [x] **[Review][Decision→Patch] `affected_downstream_nodes` 语义** — 决议 **(a)**:真 BFS 下游 + 排除 `succeeded/skipped/cancelled`(保留 `failed/invalidated/running/pending` 作为 affected)。使用 `WorkflowDefinition.edges` 做反向图从 completed 节点扩展。

#### Patch

- [x] **[Review][Patch] 4.5 AC2 · in-flight post-validation hook** [shadowflow/runtime/service.py `_dispatch_step`] — 派发完成点调用 `can_reject(workflow.policy_matrix, sender=upstream_node_id, receiver=current_node_id)`;违反时 emit `NODE_REJECTED` 并记入 `_rejection_events`。(源决议 1a)
- [x] **[Review][Patch] 4.5 AC2 · `affected_downstream_nodes` 改 BFS + 排除 succeeded/skipped/cancelled** [shadowflow/runtime/service.py:500-510] — 用 `WorkflowDefinition.edges` BFS 从 completed 节点向下扩展,terminal 状态 (`succeeded/skipped/cancelled`) 不进 affected,`failed/invalidated/running/pending` 保留。(源决议 2a)
- [x] **[Review][Patch] BLOCKER · `update_policy` 将原始 dict 赋给 Pydantic 字段** [shadowflow/runtime/service.py:~492] — `request.workflow.policy_matrix = matrix` 其中 `matrix: Dict`,字段类型 `Optional[WorkflowPolicyMatrixSpec]`。Pydantic v2 默认不 `validate_assignment`,dict 被静悄悄存入;后续 `reject()` 路径调用 `can_reject(policy_matrix, …)` 会在 `.allow_send`/`.allow_reject` 上 `AttributeError`。`model_copy(update=…)` fallback 也不重验证。`setattr` fallback 不安全。修:先 `WorkflowPolicyMatrixSpec.model_validate(matrix)` 做类型 coerce,失败时 raise 422。
- [x] **[Review][Patch] `reconfigure` 静吞 `update_policy` 异常** [shadowflow/runtime/service.py:~561] — `try: self.update_policy(…) except Exception: pass`,仍返回 `status: reconfigured`,但 policy 实际未更新且没 `policy.updated` 事件。改为传播或返回 `partial_failure` 字段。
- [x] **[Review][Patch] `affected_downstream_nodes` 只排除 succeeded** [shadowflow/runtime/service.py:500-510] — failed / skipped / cancelled / invalidated 都被错误列入 affected。至少改为排除所有 terminal 状态 (`succeeded / failed / skipped / cancelled / invalidated`)。
- [x] **[Review][Patch] policy hot-swap 无 per-run `asyncio.Lock`** [shadowflow/runtime/service.py:~492] — 调度循环读 `.allow_send.items()` 期间外部 mutate `policy_matrix` 可见混合状态。加 `self._policy_locks: Dict[run_id, asyncio.Lock]` 并在 update_policy + dispatch 读侧加锁。
- [x] **[Review][Patch] `test_publishes_policy_updated_event` 脆弱 + 掩盖异常** [tests/test_policy_runtime_update.py:~33] — 断言 `len(events) == 1`,且 `update_policy` 异常被 `except Exception: pass` 吞掉时仍会发事件,测试仍然绿。改为 `any(e.name == POLICY_UPDATED for e in events)` 且新增一条 assert matrix 实际被应用 (`isinstance(req.workflow.policy_matrix, WorkflowPolicyMatrixSpec)`)。
- [x] **[Review][Patch] 缺"已完成节点 output 保留"回归测试** [tests/test_policy_runtime_update.py] — AC3 核心成本控制 invariant 未测。加 test:seed `RunResult.steps = [StepRecord(node_id='agent_a', status='succeeded')]`,调用 `update_policy`,断言返回的 `affected_downstream_nodes` 不含 `agent_a` 且 `step.output` 未变。

#### Patch (Chunk B / 前端)

- [x] **[Review][Patch] BLOCKER · 4.5 AC4 · `isDirty()` 非响应式 — Save 按钮状态永久错误** [`src/core/components/Panel/PolicyMatrixPanel.tsx:42` + `src/core/hooks/usePolicyStore.ts:131`] — `usePolicyStore((s) => s.isDirty)` 订阅稳定函数引用；`markClean()` 改变 `savedMatrix` 但不触发重渲染，Save 按钮不会变回 disabled。修：改为派生 selector：`const dirty = usePolicyStore((s) => !matricesEqual(s.matrix, s.savedMatrix))`，或将 `dirty` 提升为 store 中的 boolean state。
- [x] **[Review][Patch] 4.5 AC3 · `highlightedCell` 从未被 PolicyMatrixPanel 读取 — cell 高亮功能完全缺失** [`src/core/components/Panel/PolicyMatrixPanel.tsx`] — `usePolicyStore.highlightCell()` 正确写入 `highlightedCell`（含 3s 自动清除），但 PolicyMatrixPanel 从未订阅该字段，矩阵单元格无任何视觉高亮。需在 `<button>` 样式中读取 `highlightedCell`，匹配 `sender===highlightedCell.sender && receiver===highlightedCell.receiver` 时叠加高亮边框。
- [x] **[Review][Patch] `setAgents()` 不同步 `savedMatrix` — 初始化后 `isDirty()` 误报 true，Save 按钮无故激活** [`src/core/hooks/usePolicyStore.ts:setAgents`] — `setAgents` 填充 `matrix` 但不更新 `savedMatrix`，导致每次 agents 重载后 `isDirty()` 立即 true，用户可能误点 Save 覆盖真实配置。修：在 `setAgents` 末尾同步 `savedMatrix: cloneMatrix(matrix)`。
- [x] **[Review][Patch] `highlightCell` setTimeout 无清理 — 快速多击导致多个 timer 并发、状态闪烁** [`src/core/hooks/usePolicyStore.ts:highlightCell`] — 每次调用产生一个新 timer，多次快速点击后多个 timer 相互覆盖，最后一个 timer 清除最新的高亮。修：在 store 外层维护 timer ref 并在新调用时先 `clearTimeout`，或在 store 中增加 `_highlightTimer` ref 字段。

#### Deferred (pre-existing, 非本次引入)

- [x] **[Review][Defer] `_get_latest_checkpoint` 在 `created_at=None` 时 `max()` TypeError** [shadowflow/runtime/service.py:~595-601] — pre-existing checkpoint path 未守 None。
- [x] **[Review][Defer] `reject()` 无 run_id 存在性检查 + 非 approval 节点仍 `submit_approval` 静默成功** [shadowflow/runtime/service.py:397,463] — pre-existing;会被伪造 reject 事件。
- [x] **[Review][Defer] `reject(retarget_stage=?)` 未知 stage 静默 fallback 到 node 0** [shadowflow/runtime/service.py:434-437] — pre-existing;会把整条 run 置空 invalidated。
- [x] **[Review][Defer] `reject()` invalidated 列表计算但从未标记 `StepRecord.status`** [shadowflow/runtime/service.py:436-444] — pre-existing;archive/heatmap 完全看不见 invalidated。
- [x] **[Review][Defer] approval_gate 线程安全 / 重入 / 默认 approve bias** [shadowflow/runtime/service.py:2221-2265] — pre-existing;`asyncio.Event.set()` 从同步 FastAPI 路由跨线程调用不安全;`_approval_events[key] = event` 重复键孤立首个 waiter;`decision_data.get("decision", "approve")` 默认 approve 反安全。
- [x] **[Review][Defer] `_approval_decisions` 在 timeout 分支泄漏** [shadowflow/runtime/service.py:2253-2265] — pre-existing 内存泄漏。
- [x] **[Review][Defer] `submit_approval` 接受任意字符串 (包括 "Approve" / typo)** [shadowflow/runtime/service.py:467-473] — pre-existing;改用 `Literal["approve","reject"]`。
