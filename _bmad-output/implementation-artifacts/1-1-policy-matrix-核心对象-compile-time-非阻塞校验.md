# Story 1.1: Policy Matrix 核心对象 + Compile-time 非阻塞校验

Status: done

## Story

As a **模板设计者**,
I want **可视化定义"谁能给谁发消息、谁能驳回谁",且系统保存时提示不推荐配置**,
so that **我的治理规则成为 runtime 一等公民,不是配置项**。

## Acceptance Criteria

1. **Given** `shadowflow/runtime/contracts.py` 新增 `WorkflowPolicyMatrixSpec` Pydantic 模型作为第 8 个核心对象
   **When** 该对象被 `WorkflowDefinition.policy_matrix` 字段引用
   **Then** 模型包含 `allow_send: {sender: [receiver, ...]}` + `allow_reject: {reviewer: [target, ...]}` 两个 dict 字段
   **And** 有 `model_validator` 跨字段校验(如 sender/receiver 必须是已声明的角色 id)

2. **Given** 保存一个违反最佳实践的矩阵(如"事实核查员 → 法务")
   **When** 前端调 `POST /workflow/validate`
   **Then** 返回 `{warnings: [{code: "POLICY_NOT_RECOMMENDED", ...}]}` 但 **status 200 不阻塞**(R3 非阻塞)
   **And** 警告附带"原因"字段 + 内置规则库命中链接

## Tasks / Subtasks

- [x] 修改 `shadowflow/runtime/contracts.py`:新增 `WorkflowPolicyMatrixSpec` Pydantic 模型 (AC: #1)
  - [x] 字段 `allow_send: Dict[str, List[str]]` — sender id → receiver id list
  - [x] 字段 `allow_reject: Dict[str, List[str]]` — reviewer id → target id list
  - [x] 可选 `description: Optional[str]` 和 `version: str = "1.0"`
  - [x] `@model_validator(mode="after")` 校验所有 sender/receiver/reviewer/target 必须在外部传入的 role id 集合内(由 `WorkflowDefinition` 校验层传入 context)
- [x] 修改 `shadowflow/runtime/contracts.py`:`WorkflowDefinition` 加 `policy_matrix: Optional[WorkflowPolicyMatrixSpec] = None` 字段 (AC: #1)
  - [x] 保持向后兼容:字段可选,老 YAML 不带 policy_matrix 仍可跑
- [x] 新建 `shadowflow/runtime/policy_matrix.py`:封装 Policy Matrix 相关帮助函数 (AC: #1, #2)
  - [x] `def can_send(matrix, sender, receiver) -> bool`
  - [x] `def can_reject(matrix, reviewer, target) -> bool`
  - [x] `def validate_best_practices(matrix, roles) -> List[Warning]` — 返回 `POLICY_NOT_RECOMMENDED` 警告列表
- [x] 内置规则库:在 `policy_matrix.py` 声明 `NOT_RECOMMENDED_PATTERNS` 常量 (AC: #2)
  - [x] 示例规则:事实核查员 → 法务、内容官 → 主编直接驳回 等
  - [x] 每条规则结构:`{code, pattern, reason, reference_url}`
- [x] 修改 `shadowflow/server.py`:`POST /workflow/validate` endpoint 返回 `{warnings: [...], errors: [...]}` (AC: #2)
  - [x] 非阻塞:有 warning 也返回 `status 200`(R3 合规)
  - [x] 有 errors(如字段校验失败)返回 `422` 标准错误 envelope
- [x] 新增 `tests/test_policy_matrix.py`:单元测试 (AC: #1, #2)
  - [x] 测 `WorkflowPolicyMatrixSpec` 可正确序列化/反序列化
  - [x] 测 `model_validator` 捕获非法 role id
  - [x] 测 `validate_best_practices` 对"事实核查员 → 法务"返回 warning 且 code=`POLICY_NOT_RECOMMENDED`
  - [x] 测 `/workflow/validate` API 非阻塞(warning 返回 200)
- [x] 同步更新 `docs/RUNTIME_CONTRACT_SPEC.md`:把第 8 对象写进契约说明

## Dev Notes

### 架构依据
- Epic 1 归属:Runtime Hardening — Policy Matrix 成为 runtime 一等公民
- 相关 AR:AR5(contracts.py 第 8 对象)、AR43(assembly constraint validator E3)
- 相关 FR:FR8 / FR10(编辑器 + compile-time 非阻塞校验)
- 相关 NFR:R3(Compile validation 非阻塞,用户可覆盖)

### 涉及文件 (source tree hints)
- 修改 ⭐:`shadowflow/runtime/contracts.py`(brownfield — 7 对象 schema 已冻结,新增不破坏)
- 新增 ⭐:`shadowflow/runtime/policy_matrix.py`
- 修改 ⭐:`shadowflow/server.py`(brownfield 2991 行 — 只加 endpoint,不动老 endpoint)
- 新增 ⭐:`tests/test_policy_matrix.py`
- 修改:`docs/RUNTIME_CONTRACT_SPEC.md`
- 参考 [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] 行 737
- 参考 [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] 行 271-307

### 关键约束
- **第 8 核心对象正式命名 `WorkflowPolicyMatrixSpec`**(不是 PolicyMatrixSpec)—— Story 0.3 TS 类型生成需对齐
- `POST /workflow/validate` 遵守统一 response envelope:`{data: {warnings, errors}, meta}` 或错误 envelope
- `@model_validator` 不允许在校验失败时 raise(否则阻塞)—— 返回 warning 列表,由调用方决定
- Brownfield 警告:`contracts.py` 已有 7 对象 schema 冻结(TS1),**只能新增不能改动**现有字段
- 前置依赖 story:无(Epic 1 起点)
- 后置依赖:Story 0.3 重跑类型生成脚本同步 TS、Story 1.3 消费 `can_reject` 做运行时校验

### 测试标准
- 单元测试文件:`tests/test_policy_matrix.py`(pytest,已有 conftest.py)
- 契约测试:`tests/test_contracts.py` 加 `WorkflowPolicyMatrixSpec` 序列化 roundtrip
- E2E 测试:Story 1.3 补(依赖本 story 的 `can_reject` 帮助函数)
- 可测 NFR:R3 验收(warning 非阻塞)

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/prd.md#FR8]
- [Source: _bmad-output/planning-artifacts/prd.md#FR10]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR R3]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

无重要 debug — 实现路径直接。role ID 校验由 `validate_graph` 完成而非 `WorkflowPolicyMatrixSpec.model_validator`，因为 Pydantic v2 `mode="after"` 不便传递外部 context；helper method `all_referenced_role_ids()` 代替 context-aware validator。

### Completion Notes List

- ✅ `WorkflowPolicyMatrixSpec`（第 8 核心对象）已添加到 `contracts.py`，字段：`allow_send`、`allow_reject`、`description`、`version`
- ✅ `WorkflowDefinition.policy_matrix: Optional[WorkflowPolicyMatrixSpec] = None`，向后兼容
- ✅ `validate_graph` 中校验 policy_matrix 引用的 role id 必须是已声明节点 id（违反 → 422）
- ✅ `PolicyWarning` 模型新增到 contracts.py，`WorkflowValidationResult` 加 `policy_warnings: List[PolicyWarning]`
- ✅ `shadowflow/runtime/policy_matrix.py` 新建：`can_send()`、`can_reject()`、`validate_best_practices()`、`NOT_RECOMMENDED_PATTERNS`
- ✅ `service.validate_workflow()` 调用 `validate_best_practices()` 填充 policy_warnings（非阻塞，200）
- ✅ `server.py /workflow/validate` 加 `response_model=WorkflowValidationResult` + `WorkflowValidationResult` 导入
- ✅ `tests/test_policy_matrix.py` — 20 个测试全部通过
- ✅ 全套回归测试 228 passed, 0 failures
- ✅ `docs/RUNTIME_CONTRACT_SPEC.md` 更新第 8 核心对象说明

### File List

- `shadowflow/runtime/contracts.py` — 新增 `WorkflowPolicyMatrixSpec`、`PolicyWarning`；更新 `WorkflowDefinition`、`WorkflowValidationResult`
- `shadowflow/runtime/policy_matrix.py` — 新建
- `shadowflow/runtime/__init__.py` — 导出 `PolicyWarning`、`WorkflowPolicyMatrixSpec`
- `shadowflow/runtime/service.py` — `validate_workflow` 调用 policy_matrix 校验
- `shadowflow/server.py` — `/workflow/validate` 加 response_model + 导入
- `tests/test_policy_matrix.py` — 新建，20 个测试
- `docs/RUNTIME_CONTRACT_SPEC.md` — 更新第 8 核心对象

## Review Findings (2026-04-22)

**Reviewer:** 3-layer adversarial subagent (Blind + Edge Case + Acceptance)
**Verdict: PASS_WITH_NITS** — Critical=0, Major=7, Minor=6, Nit=2
(核心契约 + R3 非阻塞正确，但最佳实践规则匹配有缺陷，有边界未覆盖)

### Patch
- [x] [Review][Patch] `validate_best_practices(matrix, roles: Set[str])` 的 `roles` 参数从不使用 — 已删除
- [x] [Review][Patch] 子串匹配 `in sender.lower()` 导致误报 — 改为精确相等匹配 + 显式别名表
- [x] [Review][Patch] `content_officer→editor` 别名对 `allow_send` 和 `allow_reject` 都触发 — 限定 scope=allow_reject
- [x] [Review][Patch] 同一 pair 同时命中 `allow_send` 与 `allow_reject` 时重复告警 — 加 seen 去重集合
- [x] [Review][Patch] 中文/Unicode 角色名绕过 ASCII-only 别名表 — 别名表扩展中文（事实核查员/法务/内容官/主编）
- [x] [Review][Patch] 自环 `{"alice":["alice"]}` 不告警 — 新增 `SELF_APPROVAL_DISCOURAGED` 规则
- [x] [Review][Patch] `allow_send: {"alice": []}` 语义歧义 — 新增 `POLICY_EMPTY_RECEIVER_LIST` 警告
- [x] [Review][Patch] 重复接收者 `[bob, bob]` 未 dedup — `validate_structure` 中 data-level dedup
- [x] [Review][Patch] 补测：自环 / 空列表 / 重复接收者 / 中文角色名 / 子串误报 — 7 个新测试全通过

### Defer
- [x] [Review][Defer] 前端 TS 类型缺 `policy_warnings`/`PolicyWarning` — 被 Story 0-3 的 regenerate 动作覆盖
- [x] [Review][Defer] `reconfigure()` 赋值时绕过 Pydantic 校验 — service 层设计问题，非 1-1 本身

### Dismissed: 5
- `validate_structure` Pydantic-redundant / mutable module globals / 返回类型 `set` vs `Set[str]` / version skew 未处理 / NIT

### Change Log

- 2026-04-21T09:16:16Z: Story 1.1 实现完成 — WorkflowPolicyMatrixSpec 第 8 核心对象 + policy matrix 非阻塞校验
- 2026-04-22T18:12:55Z: Review patches 9/9 全部修复 — 精确匹配替代子串、scope 限定、去重、中文别名、自环告警、空列表告警、接收者 dedup、7 新测试；全套 608 passed → done
