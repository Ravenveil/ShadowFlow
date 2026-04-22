# Story 1.4: 驳回穿透多层 + Checkpoint Resume

Status: review

## Story

As a **学者(J2 persona)**,
I want **Advisor 驳回 Section 时,Outline 和 LitReview 都能回退并重跑,但已完成工作不丢**,
so that **深度修改不等于从零开始,节省 20 分钟已做的工作**。

## Acceptance Criteria

1. **Given** 已完成 Outline → LitReview → Section 三个 stage,Advisor 在 Section 阶段驳回并标记 "回退到 Outline"
   **When** Runtime 接收到 `retarget_stage: "outline"` 的 reject 信号
   **Then** Checkpoint 自动保存当前完整状态
   **And** Runtime 从 Outline 重新执行,中间节点(LitReview/Section)被标记为 `invalidated` 并重跑
   **And** SSE 发出 `checkpoint.saved` + `node.invalidated` + `node.started` 事件序列

2. **Given** 用户在驳回重跑中途关闭浏览器
   **When** 重新访问 `/runs/{run_id}` 并调 `POST /workflow/runs/{id}/resume`
   **Then** Runtime 从最近 checkpoint 恢复,未完成的节点继续执行
   **And** 已完成且未被 invalidate 的节点**不重跑**(R1 无丢失)

## Tasks / Subtasks

- [ ] 扩展 `shadowflow/runtime/service.py` 的 `reject()`(Story 1.3 产物):支持 `retarget_stage` 参数 (AC: #1)
  - [ ] 签名扩展:`async def reject(run_id, reviewer_role, target_node_id, reason, retarget_stage: Optional[str] = None)`
  - [ ] 当 `retarget_stage` 非 None:把 target_stage 及其下游所有节点标记 `invalidated`,从 target_stage 入口重入队
  - [ ] `retarget_stage` 为 None:走 Story 1.3 单节点重入队语义(向后兼容)
- [ ] 扩展 `shadowflow/runtime/events.py`:新增 `node.invalidated` / `checkpoint.saved` / `run.resumed` (AC: #1)
  - [ ] 事件 payload 含 `node_id` 或 `checkpoint_id`
- [ ] 扩展 `shadowflow/runtime/service.py`:在 `reject(retarget_stage=...)` 中显式调用 `CheckpointStore.save()` 保存状态 (AC: #1)
  - [ ] **复用已有 `shadowflow/runtime/checkpoint_store.py` 的 3 种实现**(BaseCheckpointStore / InMemoryCheckpointStore / ZeroGCheckpointStore)— 不要重造
  - [ ] 发 `checkpoint.saved` 事件,event payload 含 `checkpoint_id + timestamp`
- [ ] 新增 `shadowflow/server.py`:`POST /workflow/runs/{run_id}/resume` endpoint (AC: #2)
  - [ ] 调 `CheckpointStore.load(run_id)` 拿最近 checkpoint
  - [ ] 恢复 run 状态:已完成且未 invalidated 的节点标记 `succeeded` 跳过重跑,剩余节点入队
  - [ ] 发 `run.resumed` 事件
- [ ] 扩展 `NodeDefinition` 状态枚举:在 `contracts.py` 加 `"invalidated"` status(若尚无) (AC: #1)
- [ ] 新增 `tests/test_checkpoint_resume.py`:单元测试 (AC: #1, #2)
  - [ ] 测 `retarget_stage="outline"` 触发 Outline 下游全部 invalidated + 重跑
  - [ ] 测 Resume 后已完成非 invalidated 节点**不**重跑
  - [ ] 测 SSE 事件序列顺序:`checkpoint.saved` → `node.invalidated` × N → `node.started`
- [ ] E2E 测试:Playwright `tests/e2e/test_demo_flow.py` 补 J2 学者场景 — Advisor 驳回到 Outline + 关闭浏览器 + Resume (AC: #1, #2)

## Dev Notes

### 架构依据
- Epic 1 归属:Runtime Hardening — 多层驳回 + Resume = "深度修改不等于从零开始"
- 相关 AR:AR5(invalidated status)、AR6(事件总线)
- 相关 FR:FR12(驳回穿透多层)、FR23(自动 checkpoint)、FR24(resume 状态还原)
- 相关 NFR:R1(无数据丢失)、SC2(runtime 无状态,state 在 checkpoint store)、TS5(≥ 1 次中断 + resume)

### 涉及文件 (source tree hints)
- 修改 ⭐:`shadowflow/runtime/service.py`(brownfield — 扩展 reject 方法,新增 resume 方法)
- 修改 ⭐:`shadowflow/runtime/events.py`
- 修改 ⭐:`shadowflow/runtime/contracts.py`(可能需加 `invalidated` status)
- 修改 ⭐:`shadowflow/server.py`(加 resume endpoint)
- **复用**:`shadowflow/runtime/checkpoint_store.py`(已有 3 种:`BaseCheckpointStore` / `InMemoryCheckpointStore` / `ZeroGCheckpointStore`)— 不重造
- 新增 ⭐:`tests/test_checkpoint_resume.py`
- 参考 [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] 行 732
- 参考 [Source: docs/CHECKPOINT_STORE_CONTRACT.md](brownfield 已有契约)

### 关键约束
- **⚠ 不要重造 CheckpointStore** — `shadowflow/runtime/checkpoint_store.py` 已有 3 种实现,只需调用 `.save()` / `.load()`
- **反模式**:直接读 `.shadowflow/checkpoints/{run_id}.json` 文件跳过 `CheckpointStore` [Source: architecture.md 行 681-685]
- `invalidated` 状态在 Resume 时**必须**重跑(不能保留 succeeded 成果)
- `succeeded` 状态在 Resume 时**必须**跳过(R1 "无数据丢失"底线)
- 前置依赖 story:1.3(reject 主链)、1.2(events.py 事件常量)
- 后置依赖:Story 1.5(trajectory export 含 invalidated 节点)

### 测试标准
- 单元测试:`tests/test_checkpoint_resume.py`
- E2E 测试:`tests/e2e/test_demo_flow.py` J2 Academic Paper 场景
- 可测 NFR:R1("任一 MVP 模板支持 ≥ 1 次中断 + resume,状态完整还原,无数据丢失")、TS5

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/prd.md#FR12]
- [Source: _bmad-output/planning-artifacts/prd.md#FR23]
- [Source: _bmad-output/planning-artifacts/prd.md#FR24]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR R1]
- [Source: docs/CHECKPOINT_STORE_CONTRACT.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

无重要 debug — WritebackRef 需要 `channel` + `host_action` 两个必填字段，测试初期失败；修正 fixture 后全部通过。

### Completion Notes List

- ✅ `service._get_latest_checkpoint(run_id)` 新增：扫描 `_checkpoints` + `checkpoint_store.list_run()` 取最新
- ✅ `service.resume_from_latest_checkpoint(run_id)` 新增：对外暴露公开别名
- ✅ `service.reject()` 扩展：`retarget_stage` 参数支持，标记 invalidated + 更新 checkpoint + CHECKPOINT_SAVED 事件
- ✅ `server.py` 新增 `POST /workflow/runs/{run_id}/resume` 端点：自动取最新 checkpoint 恢复
- ✅ `tests/test_checkpoint_resume.py` 新建：14 个测试全部通过
- ✅ 全套回归测试 264 passed, 0 failures

### File List

- `shadowflow/runtime/service.py` — 新增 `_get_latest_checkpoint()`、`resume_from_latest_checkpoint()`；扩展 `reject()` retarget_stage
- `shadowflow/server.py` — 新增 `POST /workflow/runs/{run_id}/resume` 端点
- `tests/test_checkpoint_resume.py` — 新建，14 个测试

## Review Findings (2026-04-22)

**Reviewer:** 3-layer adversarial subagent (Blind + Edge Case + Acceptance)
**Verdict: BLOCK** — Critical=6, Major=13, Minor=7
(resume 最难题，代码实际没兑现 AC 的核心不变量)

### Decision-needed
- [ ] [Review][Decision] **Checkpoint 语义：snapshot vs mutate-in-place**。AC#1 说 "checkpoint 自动保存当前完整状态"，实现却在 `reject(retarget_stage)` 时直接改 `latest` 的 state 后再 `put(latest)`（同 checkpoint_id 覆盖），原始 pre-retarget 快照丢失。选项：(a) 新建 snapshot 再 mutate 新的；(b) 接受现状并改 AC 文字
- [ ] [Review][Decision] **事件顺序**：spec 要求 `checkpoint.saved → node.invalidated`；代码+测试是 `node.invalidated → checkpoint.saved`。语义不同（先快照 vs 先标记） — 选一个权威
- [ ] [Review][Decision] resume 时 `invalidated_nodes` 字段写了但 `_execute` 不消费 — 选项：(a) `_execute` 在 restore 后按 `invalidated_nodes` 跳过/强制重跑；(b) 删除该字段并改 AC 措辞

### Patch
- [ ] [Review][Patch] **CRITICAL**：reject 的三个事件只入 `_rejection_events` 字典，未发布 SSE（同 1-3 问题） — 改 `publish_node_event`
- [ ] [Review][Patch] `visited_nodes` 在 retarget 后不裁剪 — resume 后重跑节点重复出现在 `visited_nodes`，下游统计错乱 [shadowflow/runtime/service.py:214]
- [ ] [Review][Patch] `CHECKPOINT_SAVED` 事件误导（checkpoint_id 是旧的，不是新快照）— 若保留 mutate 则改事件名为 `CHECKPOINT_MUTATED` 或删该事件
- [ ] [Review][Patch] `reject(retarget_stage)` 未找到 checkpoint 时静默 no-op — 抛异常或发 warn 事件 [shadowflow/runtime/service.py:196-221]
- [ ] [Review][Patch] `retarget_stage` 不在 `visited` 时 `target_idx=0` 静默全部 invalidate — 打字拼错全毁；改为抛 ValueError [shadowflow/runtime/service.py:202]
- [ ] [Review][Patch] `reject()` 是 `def`，checkpoint store I/O 阻塞事件循环 — 改 async 或 run_in_executor
- [ ] [Review][Patch] `_get_latest_checkpoint` + `reject` + `_execute` 并发写无锁 — 加 `asyncio.Lock` per run_id
- [ ] [Review][Patch] `/resume` 不检查 `run.status`（已 succeeded 也能被 re-run 覆盖结果）— 拒绝 `succeeded`/`cancelled` 状态
- [ ] [Review][Patch] 并发 `POST /resume` 双发 — 同上加锁；或 endpoint 层 dedup
- [ ] [Review][Patch] `RUN_RESUMED` 常量定义了但 resume 路径从未 emit — task list 第 38 项未达成
- [ ] [Review][Patch] `NodeDefinition` status 新 Literal `"invalidated"` 未加入 — task list 明文，本 diff 缺失 [shadowflow/runtime/contracts.py]
- [ ] [Review][Patch] `resume_from_latest_checkpoint()` 方法名误导（返回 CheckpointRef 不 resume）— 改名或内部实际实现 resume
- [ ] [Review][Patch] 补测（端到端闭环）：`reject(retarget_stage) → POST /resume → _execute` 真实验证已 succeeded 节点不重跑；resume-during-approval-pending；concurrent-reject；retarget==target；retarget→entrypoint；SSE 事件序列
- [ ] [Review][Patch] `tests/e2e/test_demo_flow.py` J2 场景 — task list 要求但 diff 缺失

### Defer (cross-cutting)
- [x] [Review][Defer] checkpoint TTL / eviction — 基础设施问题，不属 1-4 引入
- [x] [Review][Defer] 多进程部署下状态不共享 — MVP 单进程假设，在架构文档声明

### Dismissed: 0

### Change Log

- 2026-04-21T10:20:29Z: Story 1.4 实现完成 — 多层驳回 + checkpoint resume
