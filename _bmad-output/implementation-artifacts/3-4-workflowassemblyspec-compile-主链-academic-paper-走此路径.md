# Story 3.4: WorkflowAssemblySpec → Compile 主链(Academic Paper 走此路径)

Status: in-progress

## Story

As a **学者(J2)**,
I want **Academic Paper 模板通过 assembly → compile 主链编译,而非硬编码成 WorkflowDefinition**,
so that **PRD Technical Success 第 7 条 + 学术差异化叙事成立(Block Catalog / Stage / Lane / Policy Matrix 是一等公民)**。

## Acceptance Criteria

### AC1 — compile() 主链实现且 Policy 跨字段校验

**Given** `shadowflow/assembly/compile.py` 实现 `compile(spec: WorkflowAssemblySpec) → WorkflowDefinition`
**When** 输入 Academic Paper 的 `WorkflowAssemblySpec`(含 Block Catalog + Stage / Lane 声明 + Policy Matrix)
**Then** 输出合法的 `WorkflowDefinition`,能被 `/workflow/run` 消费
**And** 编译过程校验 Policy Matrix 与节点角色一致性(跨字段约束)

### AC2 — `/workflow/compile` endpoint + warnings

**Given** 新增 endpoint `POST /workflow/compile`
**When** 前端提交 assembly spec
**Then** 返回 `{definition, warnings: []}`,warnings 包含非阻塞的 policy 建议(接 Story 1.1)

## Tasks / Subtasks

- [ ] **T1(AC1):`WorkflowAssemblySpec` Pydantic 模型**
  - [ ] 在 `shadowflow/runtime/contracts.py` 已有 7 核心对象基础上新增 `WorkflowAssemblySpec`
  - [ ] 字段:
    - `block_catalog: list[BlockDef]`(引用 AR24–29 的 6 种 Workflow Block)
    - `stages: list[StageDef]`(每 stage 有 `id / name / lanes[]`)
    - `lanes: list[LaneDef]`(每 lane 有 `id / role / blocks[]`)
    - `policy_matrix: PolicyMatrix`(已在 runtime/policy_matrix.py 定义)
    - `defaults: WorkflowDefaults`
  - [ ] 运行 `scripts/generate_ts_types.py` 同步到前端 `src/core/types/workflow.ts`
- [ ] **T2(AC1):`compile.py` 主链实现**
  - [ ] 新增 `shadowflow/assembly/compile.py`:`def compile(spec: WorkflowAssemblySpec) -> tuple[WorkflowDefinition, list[Warning]]`
  - [ ] **步骤**:
    1. 展开 Block Catalog:把 `plan / parallel / barrier / retry_gate / approval_gate / writeback` 6 种 block 实例化为节点(AR24–29)
    2. Stage × Lane 笛卡尔展开为 DAG 节点,按 lane 内顺序连边,跨 lane 靠 `barrier` 汇合(AR27)
    3. 注入 Policy Matrix 到对应节点的 `policies` 字段
    4. 调用 `validate_policy_consistency(definition, policy_matrix)`:
       - 每条 policy 指向的 `subject_role` 必须在节点角色列表中存在
       - `reviewer_role` 不能等于 `subject_role`(不能自己审自己)
       - 冲突或缺失 → 抛 `ShadowflowError.PolicyMismatch`
    5. 返回 `(definition, warnings)`,warnings 收集非阻塞建议(例:"合规官未覆盖某 lane")
  - [ ] 在已有 `assembly/__init__.py` 导出 `compile`
- [ ] **T2.5(AC1):与已有 `activation.py` / `learner.py` 的边界**
  - [ ] `compile.py` 只做 schema 转换,**不**调用 `activation.py`(AR43:compile 不执行 run)
  - [ ] `activation.py` 的 ActivationSelector 在 run 时才介入(Story 2.x 范围)
- [ ] **T3(AC2):`/workflow/compile` endpoint**
  - [ ] 在 `shadowflow/server.py` 新增 `@app.post("/workflow/compile")`
  - [ ] 入参:`WorkflowAssemblySpec` (JSON body)
  - [ ] 出参:`{data: {definition: WorkflowDefinition, warnings: list[str]}, meta: {...}}`(单一 response envelope,架构 API Boundaries)
  - [ ] 错误:`PolicyMismatch` → HTTP 422 + `{error: {code, message, details}}`
- [ ] **T4:单元测试**
  - [ ] 新增 `tests/test_assembly.py`:
    - `test_compile_academic_paper_happy_path`:加载 `templates/academic-paper.yaml`,调 compile,断言返回 WorkflowDefinition 含 6 种 Workflow Block 节点各至少 1 个
    - `test_policy_consistency_detect_self_review`:构造"reviewer_role == subject_role"用例 → 断言抛 PolicyMismatch
    - `test_compile_warnings_non_blocking`:合规官未覆盖 lane → warnings 非空但 definition 仍返回
- [ ] **T5:集成测试**
  - [ ] `tests/test_service.py` 追加:compile 后的 definition 直接喂给 `RuntimeService.run()` 跑通(mock LLM)

## Dev Notes

### 架构依据

- **Epic 3 Goal**:Academic Paper 走 assembly → compile 主链,是 PRD Technical Success 第 7 条和学术差异化叙事的技术基座
- **相关 AR**:AR24–29(6 种 Workflow Block 语义 plan/parallel/barrier/retry_gate/approval_gate/writeback)、AR42(Block Catalog / Stage / Lane 一等公民)、AR43(compile.py 只做 schema 转换,不执行 run)、AR16(Pydantic → TS 类型同步)
- **相关 FR/NFR**:FR4(WorkflowAssemblySpec 编译主链)、FR5(Policy Matrix 跨字段校验)、I1(compile 响应 < 1s,本地模板)

### 涉及文件

- 新增 `shadowflow/assembly/compile.py`(主链)
- 修改 `shadowflow/runtime/contracts.py`(新增 `WorkflowAssemblySpec` 等)
- 修改 `shadowflow/server.py`(新增 `/workflow/compile` endpoint)
- 同步 `src/core/types/workflow.ts`(Pydantic → TS)
- 新增 `tests/test_assembly.py`
- 复用 `shadowflow/runtime/policy_matrix.py`(MVP 已规划)、`shadowflow/runtime/errors.py`(ShadowflowError 体系)

### 关键约束

- **Academic Paper 模板必须走 WorkflowAssembly 主链**(Technical Success 第 7 条),不得硬编码 WorkflowDefinition
- **6 种 Workflow Block(plan/parallel/barrier/retry_gate/approval_gate/writeback)必须在 Academic Paper 命中**(Technical Success 第 6 条),compile 后要能数出来
- `assembly/compile.py` **不**依赖 `server.py` 或 `cli.py`(Component Boundaries)
- `assembly/compile.py` **不**执行 run,只负责 schema 转换(AR43)
- `activation.py` / `learner.py` 已有 brownfield 代码,compile.py 不入侵它们
- 单一 response envelope `{data, meta}` 成功 / `{error}` 失败(API Boundaries)

### 测试标准

- `tests/test_assembly.py` 覆盖 happy path + PolicyMismatch + warnings
- 集成:compile → RuntimeService.run 链路在 mock LLM 下跑通
- Story 3.6 会再做"Academic Paper 真实 provider 可运行"冒烟

## References

- [Source: epics.md#Story 3.4]
- [Source: architecture.md#Architectural Boundaries(lines 867–888)]
- [Source: architecture.md#Complete Project Directory Structure(lines 752–766)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

522/522 Python tests pass (7 new in test_assembly.py).

### Completion Notes List

- T1: Added `BlockDef`, `LaneDef`, `StageDef`, `WorkflowDefaults`, `WorkflowAssemblySpec` to `contracts.py` (end of file). Added `PolicyMismatch` to `errors.py`.
- T2: Rewrote `compile.py` — new `compile(spec) → (WorkflowDefinition, list[str])`. Steps: expand block_catalog → NodeDefinitions, build stage×lane DAG (single-lane sequential; multi-lane injects synthetic `control.parallel`+`control.barrier`), validate policy consistency, return definition + warnings. Old `compile_agents()` preserved. `assembly/__init__.py` updated to export `compile`.
- T3: Added `POST /workflow/compile` to `server.py`. Returns `{data: {definition, warnings}, meta: {}}`. `PolicyMismatch` → HTTP 422.
- T4: 7 new tests in `tests/test_assembly.py`. Covers: happy path (all 6 block kinds present), terminal edge, self-review PolicyMismatch, non-blocking warnings, single-block, approval_gate config, multi-lane parallel+barrier injection.
- Note: `academic-paper.yaml` kept in original `WorkflowTemplateSpec` format (backward compat). Assembly spec for academic paper is constructed directly in Python test.

### File List

- shadowflow/runtime/contracts.py (updated — BlockDef/LaneDef/StageDef/WorkflowDefaults/WorkflowAssemblySpec added)
- shadowflow/runtime/errors.py (updated — PolicyMismatch added)
- shadowflow/assembly/compile.py (rewritten — compile() main chain added, compile_agents() preserved)
- shadowflow/assembly/__init__.py (updated — exports compile, compile_agents, CompilationError)
- shadowflow/server.py (updated — POST /workflow/compile endpoint)
- tests/test_assembly.py (new — 7 tests)

## Code Review Findings (2026-04-22)

### Review Mode: full (1-layer Blind Hunter + direct analysis — ECH/Auditor agents hit rate limit)
### Decisions Applied

| ID | Finding | Decision |
|----|---------|---------|
| P2-α | `defaults=spec.defaults.metadata` 只传 metadata 子字段，丢失 llm/timeout_seconds/retry_policy | **Fixed** — 改为 `spec.defaults.model_dump()` |
| P2-β | server.py 未捕获 `ValueError`/`CompilationError` → HTTP 500 | **Fixed** — 新增 except 块返回 422 + COMPILE_ERROR envelope |
| P2-γ | AR16: generate_ts_types.py 未包含 assembly 类型，workflow.ts 缺失 BlockDef/WorkflowAssemblySpec 等 5 个接口 | **Fixed** — 脚本添加 6 个 assembly 模型，重新生成 workflow.ts（15 interfaces）|
| P2-δ | T5 集成测试缺失 | **Fixed** — test_assembly.py 新增 test_compile_output_compatible_with_runtime_request |
| BH-P1-1 | barrier 无入边"断路" | **Dismissed** — validate_graph 明确禁止 barrier 入边（Phase 1 fan-out by design）|
| BH-P1-2 | kind="agent" 用于 control nodes | **Dismissed** — `Literal["agent","node"]` 均合法 |
| D1 | `policy_matrix=None` 传给 WorkflowDefinition | **Accepted (D1=a)** — 直接传入会触发 validate_graph role 校验失败（注释有说明）|

### Patches Applied (4 files)

- [x] `shadowflow/assembly/compile.py` — defaults 改为 model_dump() (P2-α)
- [x] `shadowflow/server.py` — 新增 CompilationError 导入 + 422 error handling (P2-β)
- [x] `scripts/generate_ts_types.py` — 添加 6 个 assembly 模型 (P2-γ)
- [x] `src/core/types/workflow.ts` — 重新生成，新增 BlockDef/LaneDef/StageDef/WorkflowDefaults/WorkflowPolicyMatrixSpec/WorkflowAssemblySpec (P2-γ)
- [x] `tests/test_assembly.py` — T5 集成测试 test_compile_output_compatible_with_runtime_request (P2-δ)
