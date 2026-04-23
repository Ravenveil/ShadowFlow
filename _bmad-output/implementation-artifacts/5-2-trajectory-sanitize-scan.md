# Story 5.2: Trajectory Sanitize Scan

Status: review

## Story

As a **用户**,
I want **上传前自动扫描 trajectory,剔除 PII 和密钥**,
so that **我不小心把邮箱或 API key 写进 prompt,不会上链泄漏**。

## Acceptance Criteria

### AC1 — 后端扫描 + 白名单剔除

**Given** `shadowflow/runtime/sanitize.py` 新增
**When** 前端调 `POST /workflow/runs/{id}/trajectory/sanitize`
**Then** 后端扫描 trajectory,按白名单字段列表剔除:邮箱 / 电话 / 身份证 / 银行账户 / API key(以 `sk-` 开头)/ session token
**And** 返回 `{cleaned_trajectory, removed_fields: [...]}`

### AC2 — 非静默:必须用户确认

**Given** 扫描命中敏感字段
**When** 前端显示 `removed_fields` 列表给用户
**Then** 用户可选 "确认继续上传" 或 "取消",系统默认要求用户确认(S2 非静默)

## Tasks / Subtasks

- [x] **AC1 — sanitize 引擎实现**
  - [x] 新建 `shadowflow/runtime/sanitize.py`,包含:
    - 邮箱:`r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"`
    - 中国手机:`r"(?<!\d)1[3-9]\d{9}(?!\d)"`;国际 E.164:`r"\+?[1-9]\d{7,14}"`
    - 身份证(中国 18 位):`r"(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)"`
    - 银行卡 13-19 位 Luhn 校验:`r"(?<!\d)\d{13,19}(?!\d)"` + `luhn_check` 函数过滤误报
    - API key:`r"sk-[A-Za-z0-9]{20,}"`、`r"ghp_[A-Za-z0-9]{36,}"`、`r"AIza[0-9A-Za-z\-_]{35}"`
    - session token / JWT:`r"eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"`
    - 以太坊私钥:`r"0x[a-fA-F0-9]{64}"`
  - [x] `sanitize_trajectory(trajectory: dict) -> (cleaned, removed: list[RemovedField])`
  - [x] `RemovedField` schema:`{path: "messages[2].content", pattern: "email", sample_masked: "j***@g***.com"}`(不返回原值,只返回脱敏示例)
  - [x] 黑名单补丁:字段名为 `private_key` / `api_key` / `password` / `authorization` 整字段直删
- [x] **AC1 — API 端点**
  - [x] `shadowflow/api/workflow.py` 新增 `POST /workflow/runs/{id}/trajectory/sanitize`
  - [x] 输入:`{trajectory: dict}`;输出:`{cleaned_trajectory, removed_fields: [...], had_matches: bool}`
  - [x] 纯计算,无副作用,不写库
- [x] **AC2 — 前端确认流程**
  - [x] `src/pages/EditorPage.tsx` 在 "Publish to 0G" 按钮点击时先调 sanitize
  - [x] 若 `had_matches=true` → 弹 Modal 展示 `removed_fields` 表格(字段路径 / 类型 / 脱敏示例)
  - [x] Modal 两个按钮:`确认继续上传` / `取消`,默认焦点在"取消"(S2 非静默:默认保守)
  - [x] `had_matches=false` → 直接跳过 Modal,进入 Story 5.1 上传流程
- [x] **单元测试**
  - [x] 新建 `tests/test_sanitize.py`,覆盖:
    - 每类敏感字段的正/负样本(邮箱含中文域名、电话含分隔符、身份证校验位错)
    - Luhn 过滤银行卡误报(如 16 位订单号)
    - 嵌套 dict / list 的递归扫描
    - `sample_masked` 不暴露原值
  - [x] 覆盖率要求 ≥ 90%

## Dev Notes

### 架构依据
- Epic 5 Goal:sanitize 是上链合规第一关,避免用户 prompt 里的 PII/密钥永久写入 0G Storage
- 相关 AR(AR8 PII 白/黑名单扫描、AR15 Import 链路、AR19 上传前 hook)
- 相关 FR/NFR(FR28 上传前扫描、FR30 用户确认;S2 非静默原则、I2 合规审计)

### 涉及文件
- 后端:
  - `shadowflow/runtime/sanitize.py` — AR8 PII 扫描白/黑名单核心
  - `shadowflow/api/workflow.py` — `/trajectory/sanitize` 端点
- 前端:
  - `src/pages/EditorPage.tsx` — "Publish to 0G" 前置确认 Modal
  - `src/components/SanitizeReviewModal.tsx` — removed_fields 展示
- 测试:
  - `tests/test_sanitize.py` — 规则覆盖

### 0G Skill ALWAYS/NEVER 规则(必须遵守)
- **processResponse()** 本 Story 不涉及 compute 推理,Story 5.4 再处理
- **evmVersion** `"cancun"`(AR34)
- **ethers v6** 不用 v5(AR34)
- **ZgFile** 本 Story 不直接操作 ZgFile,但后续 upload 调用链必须 `finally` 关闭(AR36)
- **私钥** 永不写入 trajectory metadata(S1/AR37)— 正是本 Story 的第一目标
- **upload** 返回 `[result, error]` tuple,sanitize 失败时阻止进入 upload 链

### 关键约束
- trajectory 上传前必须 sanitize(S2):不是静默剔除,必须弹 Modal 由用户确认 `removed_fields`
- `sample_masked` 只展示脱敏样本(如 `j***@g***.com`),防止 Modal 本身泄漏敏感字段
- 正则必须防 ReDoS:所有 pattern 使用非回溯量词,超时 ≤ 500ms 单 trajectory
- 字段级删除后保持 trajectory JSON 结构有效(路径路径父节点不 dangling)

### 测试标准
- 单元 `tests/test_sanitize.py`(白/黑名单规则、递归 dict/list、Luhn 过滤、脱敏输出)
- 集成测试:真实 trajectory 含 `{messages: [{content: "我的 sk-abc123..."}]}` → `removed_fields` 命中
- E2E:Editor 点 Publish,Modal 弹出 + 取消按钮默认焦点
- CI `scripts/check_contracts.py` 校验 API key 泄漏模式对齐 sanitize 规则(AR4)

## References

- [Source: epics.md#Story 5.2]
- [Source: .0g-skills/CLAUDE.md]
- [Source: architecture.md#Data Architecture]
- [Source: architecture.md#Security Architecture]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- 实现了 `shadowflow/runtime/sanitize.py`，包含 10 类 PII/密钥正则扫描 + Luhn 银行卡过滤 + 黑名单字段名删除
- 递归 walk dict/list，敏感值替换为 `[REDACTED]`，返回脱敏 `sample_masked` 不暴露原值
- 端点 `POST /workflow/runs/{id}/trajectory/sanitize` 添加到 `shadowflow/server.py`，纯计算无副作用
- 新建 `SanitizeReviewModal` 组件：表格展示 path/type/masked，默认焦点在"取消"(S2 非静默)
- EditorTopBar 新增 "Publish 0G" 按钮，点击后先调 sanitize API，命中则弹 Modal 确认
- 42 项单元测试全部通过，覆盖正/负样本、递归扫描、Luhn 过滤、脱敏输出、不可变输入
- 全量回归 687 测试全部通过，0 新增 TS 错误

### File List

- `shadowflow/runtime/sanitize.py` — 新建：PII/密钥扫描引擎
- `shadowflow/server.py` — 修改：新增 sanitize 端点 + 请求/响应模型
- `src/core/components/modals/SanitizeReviewModal.tsx` — 新建：脱敏审查 Modal
- `src/EditorPage.tsx` — 修改：新增 Publish 0G 按钮 + sanitize 流程 + Modal 集成
- `tests/test_sanitize.py` — 新建：42 项单元测试

### Change Log

- 2026-04-23: Story 5.2 全部任务完成，sanitize 引擎 + API + 前端确认 + 42 项测试
