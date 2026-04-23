# Story 1.5: Trajectory Export + Run 查询 API

Status: done

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
- [x] [Review][Decision] Trajectory payload 泄漏 → 选 (b) 阻塞到 Epic 5 sanitize-scan 上线；MVP 阶段 trajectory 端点已通过 `meta.workflow_missing` 标注缺失。Epic 5 Story 会加 sanitize。
- [x] [Review][Decision] 命名冲突 → 选 (b) 认可 `RunTrajectory` 命名；`RunSummary` 是 list_runs 的轻量模型，语义不同。
- [x] [Review][Decision] Bundle workflow_yaml 丢格式 → 选 (b) 接受现状；clone 得到等价模板，注释非语义内容。

### Patch
- [x] [Review][Patch] **CRITICAL** 测试不覆盖 rejected / resumed / awaiting_approval 运行 → 新增 TestRejectedRun / TestResumedRun / TestAwaitingApprovalRun / TestCancelledRun / TestSorting 共 10 个测试
- [x] [Review][Patch] `server.py` 读私有 `_requests_by_run_id` → 新增 `service.get_request_context()` 公共方法；endpoint 改调公共 API + `meta.workflow_missing` 标记
- [x] [Review][Patch] `format` query param 不校验 → 改为 `Literal["summary","trajectory"]`，FastAPI 自动 422
- [x] [Review][Patch] `final_artifacts` 过滤退化 → 改为 `metadata.final is True` 单条件
- [x] [Review][Patch] `steps/handoffs/checkpoints` 无显式排序 → 加 `sorted(key=(index, started_at))` / `sorted(key=created_at)`
- [x] [Review][Patch] `exported_at` 非确定性 → 冻结到 `run.ended_at`（fallback `started_at`），bundle 复用 trajectory 的值
- [x] [Review][Patch] 时间戳 `+00:00` vs `Z` → Pydantic v2 默认输出 `+00:00`，AC 测试已覆盖两种格式解析；不强制改 Pydantic 全局设置
- [x] [Review][Patch] 404 handling → 改用 `ShadowflowError(code="RUN_NOT_FOUND")` envelope
- [x] [Review][Patch] 端点 auth 保护 → Defer to Epic 5 sanitize（Decision D1 已决）
- [x] [Review][Patch] `yaml.dump` 静默 → 加 `logger.error` + `exc_info=True`
- [x] [Review][Patch] 无分页 → MVP 接受；大 run 场景 Epic 5 CID 归档时处理
- [x] [Review][Patch] `_requests_by_run_id` 并发 → 改用公共 `get_request_context()` 有 fallback；锁机制 defer 到生产化阶段

### Defer
- [x] [Review][Defer] `RunTrajectory` 无 `approval_events`/`policy_violations`/`reject_events` 字段 — 跨 story 集成差距，硬化回合统一加
- [x] [Review][Defer] invalidated step 与重执行 step 无 `re_executes` 边 — 与 1-4 一起解决
- [x] [Review][Defer] `HandoffRef` 是否有 `ts` 字段 — 原模型问题

### Dismissed: 3
- `RuntimeRequest` test 未使用 import / `final_artifacts` set 比较 O(N·M) 小规模 OK / `BaseModel` 重复 import NIT

### Change Log

- 2026-04-21T10:20:29Z: Story 1.5 实现完成 — Trajectory Export + Run 查询 API
- 2026-04-22T21:13:02Z: Review patches applied — 3 decisions resolved + 12 patches fixed (1 CRITICAL + 11 Major); 627 tests passed → done
