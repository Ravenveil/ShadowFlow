# Story 1.5: Trajectory Export + Run 查询 API

Status: review

## Story

As a **开发者 / 评委**,
I want **一条 API 拿到完整 run 的 trajectory 结构化数据**,
so that **可以审计、归档、分享或做后续分析**。

## Acceptance Criteria

1. **Given** 一个已完成的 `run_id`
   **When** 调 `GET /workflow/runs/{run_id}`
   **Then** 返回 `{run, steps: [...], handoffs: [...], checkpoints: [...], final_artifacts: [...]}` 结构化 JSON
   **And** 所有时间戳 ISO 8601 UTC 格式
   **And** Pydantic 序列化 `exclude_none=True`(不返回 null 字段)

2. **Given** 需要下载该 run 的完整 trajectory 用于归档
   **When** 调 `GET /workflow/runs/{run_id}?format=trajectory`
   **Then** 返回适合上传到 0G Storage 的打包格式(workflow.yaml + policy_matrix + steps + artifacts)

## Tasks / Subtasks

- [ ] 新建 `shadowflow/runtime/trajectory.py`:Trajectory 组装逻辑 (AC: #1, #2)
  - [ ] `def build_run_summary(run_id) -> RunSummary`:聚合 run / steps / handoffs / checkpoints / final_artifacts
  - [ ] `def build_trajectory_bundle(run_id) -> TrajectoryBundle`:额外含 workflow.yaml + policy_matrix
  - [ ] 从 `CheckpointStore` 读取历史 checkpoint(不重造存储)
- [ ] 新建 Pydantic 模型 `RunSummary` / `TrajectoryBundle` 于 `contracts.py`(或 `trajectory.py`) (AC: #1, #2)
  - [ ] 字段全部 ISO 8601 UTC(用 `datetime` + 序列化配置 `json_encoders={datetime: lambda v: v.isoformat()}`)
  - [ ] 用 `model_config = ConfigDict(exclude_none=True)` 或导出时 `model_dump(exclude_none=True)`
- [ ] 修改 `shadowflow/server.py`:新增 `GET /workflow/runs/{run_id}` endpoint (AC: #1)
  - [ ] Query param `?format=summary`(默认) / `?format=trajectory`
  - [ ] summary 模式:调 `build_run_summary`,返回 envelope `{data: RunSummary, meta: {...}}`
  - [ ] 404 处理:run_id 不存在时走 `ShadowflowError` 统一错误 envelope
- [ ] 修改 `GET /workflow/runs/{run_id}`:`?format=trajectory` 分支 (AC: #2)
  - [ ] 调 `build_trajectory_bundle`,返回适合 0G Storage 上传的 JSON(前端直调 0G SDK 上传)
  - [ ] Response content-type: `application/json`
  - [ ] 注意:**上传前的 sanitize 扫描**由 Epic 5 Story 做(AR8 `sanitize.py`),本 story 只负责结构化导出
- [ ] 新增 `tests/test_trajectory_export.py`:单元测试 (AC: #1, #2)
  - [ ] 测 summary 格式含 5 个 key(run/steps/handoffs/checkpoints/final_artifacts)
  - [ ] 测时间戳 ISO 8601 UTC(带 `Z` 后缀或 `+00:00`)
  - [ ] 测 `exclude_none=True` 不返回 null 字段
  - [ ] 测 trajectory 格式含 `workflow_yaml` + `policy_matrix`
- [ ] 更新 OpenAPI schema(FastAPI 自动生成),验证 `/docs` Swagger UI 显示正确

## Dev Notes

### 架构依据
- Epic 1 归属:Runtime Hardening — Trajectory 是后续 0G Storage 归档 + 克隆的前提
- 相关 AR:AR5(contracts 第 8 对象复用)、AR19(zerogStorage 前端上传,本 story 只出结构化数据)
- 相关 FR:FR25(查看 trajectory)、FR26(export 结构化)、FR27(归档 0G Storage — Epic 5 消费本 API)
- 相关 NFR:S2(sanitize — 本 story 不做,Epic 5 做)、I3(0G Compute 成功率)

### 涉及文件 (source tree hints)
- 新增 ⭐:`shadowflow/runtime/trajectory.py`
- 修改 ⭐:`shadowflow/runtime/contracts.py`(新增 RunSummary / TrajectoryBundle 模型,brownfield 契约只新增不改)
- 修改 ⭐:`shadowflow/server.py`(新增 endpoint)
- 新增 ⭐:`tests/test_trajectory_export.py`
- 参考 [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] 行 283 `GET /workflow/runs/{run_id}`
- 参考 [Source: _bmad-output/planning-artifacts/architecture.md#Service Boundaries] 行 884-888(前端 → 0G Storage 直连 BYOK)

### 关键约束
- **时间戳必须 ISO 8601 UTC**(如 `2026-04-16T10:00:00Z`)— 与前端 `caseConverter` 约定一致
- **`exclude_none=True`**:用 `model.model_dump(exclude_none=True)` 显式控制;不要依赖 FastAPI 默认行为
- Response 遵守统一 envelope `{data, meta}` 或 `{error}` [Source: architecture.md 行 287]
- 本 story 不负责 PII sanitize(Epic 5 AR8 `shadowflow/runtime/sanitize.py` 专门处理)
- 前置依赖 story:1.1(第 8 对象 `WorkflowPolicyMatrixSpec` 进入 `trajectory` 格式)、1.2 / 1.3 / 1.4(事件数据进入 steps/handoffs/checkpoints)
- 后置依赖:Epic 5 Story(0G Storage 上传 + CID 克隆闭环)

### 测试标准
- 单元测试:`tests/test_trajectory_export.py`
- 契约测试:验证 7+1 核心对象在 trajectory bundle 中完整可反序列化(为 Epic 5 "CID 克隆后首次运行成功率 100%" 打基础)
- 可测 NFR:FR25 / FR26 AC、Business 指标"CID 克隆后首次运行成功率 100%"(Epic 5 验收)

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md#FR25]
- [Source: _bmad-output/planning-artifacts/prd.md#FR26]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

两次修正：StepRecord 需要 `index` + `started_at`；WorkflowDefinition policy_matrix role 必须在 nodes 中声明。

### Completion Notes List

- ✅ `contracts.py` 新增 `RunTrajectory` + `TrajectoryBundle` Pydantic 模型
- ✅ `runtime/trajectory.py` 新建：`build_run_trajectory()` + `build_trajectory_bundle()`
- ✅ `server.py` 新增 `GET /workflow/runs/{run_id}` 端点，支持 `?format=summary|trajectory`
- ✅ `runtime/__init__.py` 导出 `RunTrajectory` + `TrajectoryBundle`
- ✅ `tests/test_trajectory_export.py` 新建：17 个测试全部通过
- ✅ 全套回归测试 281 passed, 0 failures

### File List

- `shadowflow/runtime/contracts.py` — 新增 `RunTrajectory`、`TrajectoryBundle`
- `shadowflow/runtime/trajectory.py` — 新建
- `shadowflow/runtime/__init__.py` — 新增导出
- `shadowflow/server.py` — 新增 `GET /workflow/runs/{run_id}` 端点
- `tests/test_trajectory_export.py` — 新建，17 个测试

## Review Findings (2026-04-22)

**Reviewer:** 3-layer adversarial subagent (Blind + Edge Case + Acceptance)
**Verdict: BLOCK** — Critical=1, Major=13, Minor=7, Nit=3

### Decision-needed
- [ ] [Review][Decision] Trajectory payload 泄漏：`StepRecord.input`/`output`/`trace` 为 `Dict[str,Any]`，直接 dump 无 sanitize。选项：(a) 把 `format=trajectory` 挂到 feature flag，默认 off；(b) 阻塞到 Epic 5 sanitize-scan 上线；(c) 服务端 redact 已知密钥再返回
- [ ] [Review][Decision] 命名冲突 `RunSummary` vs `RunTrajectory`：spec task L29 写 "RunSummary + TrajectoryBundle"，实现改叫 `RunTrajectory`；现存 `RunSummary` 是另一模型。选 (a) 重命名回 spec；(b) 改 spec 认可新命名
- [ ] [Review][Decision] Bundle 的 `workflow_yaml` 是 `yaml.dump(WorkflowDefinition.model_dump())` 反序列化产物，丢失原始 YAML 注释/格式。CID 克隆场景里"原始模板"丢失。选 (a) 另存原始 YAML 文件字节；(b) 接受现状（clone 得到等价但非相同的模板）

### Patch
- [ ] [Review][Patch] **CRITICAL** 测试不覆盖 rejected / resumed / awaiting_approval 运行 — 本 story 的回放面，却只用 `status="succeeded"` 夹具测试 [tests/test_trajectory_export.py]
- [ ] [Review][Patch] `server.py:691` 读私有 `_requests_by_run_id` — 从 `_run_store` 重载的 run 没有 entry，`format=trajectory` 静默退化 bundle 无 `workflow_yaml`/`policy_matrix`，无 404、无 meta 标记 — 在 service 层暴露 `get_workflow_for_run(run_id)` [shadowflow/server.py:691]
- [ ] [Review][Patch] `format` query param 不校验 — `format=traj` / `FULL` 静默 fallback 到 summary；改 `Literal["summary","trajectory"]` 或 422
- [ ] [Review][Patch] `final_artifacts` 过滤退化（`metadata.final==True OR producer_step ∈ succeeded_steps`，后者吞掉一切） — 改为 `metadata.final is True` 单条件 [shadowflow/runtime/trajectory.py:28]
- [ ] [Review][Patch] `steps/handoffs/checkpoints` 无显式排序 — 加 `sorted(key=(index, started_at))` 并明确 tie-breaker
- [ ] [Review][Patch] `exported_at` 在 `RunTrajectory` 与 `TrajectoryBundle` 双存 + `datetime.now()` 导致 bundle 非确定性（同一 run 多次导出 CID 不同） — 冻结到 `run.ended_at` 或单一来源
- [ ] [Review][Patch] 时间戳 `+00:00` 与 Dev Notes "Z 后缀"不一致 — 统一
- [ ] [Review][Patch] 404 handling 用 `HTTPException(404)`，与 Story 1-3 `ShadowflowError` envelope 不对齐 [shadowflow/server.py:688]
- [ ] [Review][Patch] 端点无 auth 保护 + endpoint 暴露比其它路由敏感得多的数据（原始 input/prompt）— 至少加 env flag 或 dev-only
- [ ] [Review][Patch] `build_trajectory_bundle` 里 `yaml.dump` 失败静默成 `workflow_yaml=None`，无法区分"未提供"与"序列化炸" — 加日志
- [ ] [Review][Patch] 响应无分页/流式，长 run 一次性 dump — MVP 至少加体积警告或强制 sanitize
- [ ] [Review][Patch] `_requests_by_run_id` 并发读写无锁 — `reconfigure` 与 endpoint 并发可见 torn state

### Defer
- [x] [Review][Defer] `RunTrajectory` 无 `approval_events`/`policy_violations`/`reject_events` 字段 — 跨 story 集成差距，硬化回合统一加
- [x] [Review][Defer] invalidated step 与重执行 step 无 `re_executes` 边 — 与 1-4 一起解决
- [x] [Review][Defer] `HandoffRef` 是否有 `ts` 字段 — 原模型问题

### Dismissed: 3
- `RuntimeRequest` test 未使用 import / `final_artifacts` set 比较 O(N·M) 小规模 OK / `BaseModel` 重复 import NIT

### Change Log

- 2026-04-21T10:20:29Z: Story 1.5 实现完成 — Trajectory Export + Run 查询 API
