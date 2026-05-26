---
name: tech-roadmap-scripts
status: draft
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
epic: harness-scripts
based_on: Explore agent 6 维代码基线调研 (2026-05-26)
---

# Harness Scripts 技术路线

> 维度：**Validation Hooks**。L1→L2 命脉。

## 1. 现状基线

| 关注点 | 当前状态 |
|--------|---------|
| turn 主循环 | `shadowflow/runtime/service.py` 的 `async def run()` / `_execute()` 是 step 执行点 |
| `<sf:complete>` 解析器 | **无**——目前 turn 完成是 LLM 输出标签 + parser，没有"完成后必跑校验"环节 |
| 校验雏形 | Policy Matrix（`policy_matrix.py` retry/double-reject）是同构但维度窄的样板；事件总线在 `events.py:RunEventBus.publish()` |
| SSE 事件分发 | 前端 reducer `src/core/hooks/useRunSession.ts:103-160` 处理 `RunSessionStep status:failed`；新事件类型加在 `AgentEventType` 枚举（line 14）|
| 沙盒 / timeout | **无现成工具**。仅 `executors.py:subprocess` + httpx timeout。需 `asyncio.wait_for()` 自研或集成 `timeout-decorator`|

## 2. 推荐插桩点（核心）

```
后端：
  shadowflow/runtime/service.py:_execute()      ← step 完成后插 validation 钩子
  shadowflow/runtime/events.py                  ← 加 VALIDATION_* 常量
  shadowflow/api/teams.py                       ← 加 /validation-hooks CRUD
  shadowflow/runtime/validation_hooks/          ← 新建模块
    ├── schema.py        # ValidationHookSpec
    ├── runner.py        # 顺序跑 hooks，聚合结果
    ├── validators/      # builtin registry
    │   ├── tsc_check.py
    │   ├── pytest_pass.py
    │   ├── lint_clean.py
    │   ├── chrome_console_clean.py
    │   └── file_exists.py
    └── sandbox.py       # asyncio.wait_for + subprocess wrap

前端：
  src/core/hooks/useRunSession.ts:14            ← AgentEventType 加 VALIDATION_FAILED
  src/core/hooks/useRunSession.ts:103-160       ← reducer 加 validation 分支
  src/components/team-settings/                 ← 新建 ValidationHooksTab.tsx
```

## 3. 技术路线（按 task 推进顺序）

### Task 001 — 设计文档（先做）
- 输出：`docs/harness/design/team-validation-hook-v1.md`
- 关键决策：(a) hook on_fail = retry 走 Policy Matrix retry 路径合流，**不重复计数**；(b) 沙盒用 asyncio.wait_for + subprocess.run timeout 双层防御
- 与 epic 1 章节 [001.md](./001.md) AC 一致

### Task 002 — Schema + API（依赖 001）
- 加 `ValidationHookSpec` Pydantic 模型到 `contracts_builder.py` 或独立 `validation_hooks/schema.py`
- `teams.py` 加 endpoints 完全复用 `TeamWorkflow` / `TeamPolicy` 模式（增 GET/PUT）
- 持久化与 workflow / policy_matrix 同存 team JSON

### Task 003 — Runtime 接入（依赖 002）
- 在 `service.py:_execute()` 每个 step 完成后调 `validation_hooks.runner.run_all(team_id, step_ctx)`
- 全 pass → 继续；fail → 按 on_fail 走 retry（合流 Policy Matrix retry 计数）或 blocker（发 BLOCKER 事件）
- `events.py` 新增 `VALIDATION_STARTED` / `VALIDATION_PASSED` / `VALIDATION_FAILED` 事件
- 前端同步 reducer 新增分支显示"等待校验中 / 校验失败 / 校验通过"

### Task 004 — 内置 validator 种子库（与 003 并行）
- 5 个 validator 实现统一 `Validator.run(config, ctx) -> ValidationResult` 接口
- `chrome_console_clean` 通过 MCP client 调 `chrome-devtools:list_console_messages`——**需先确认 ShadowFlow runtime 能不能调 IDE 自用 MCP server**（如果不行就用 puppeteer / playwright 旁路）

### Task 005 — UI + e2e（依赖 002+004，与 003 并行）
- 复用 `PolicyMatrixPanel` 同构样式做 `ValidationHooksTab.tsx`
- 浏览器手测沿 `feedback_frontend_dod_browser_verify` memory

## 4. 风险 / 隐藏阻塞

- **🔴 沙盒缺失**：MVP 用 `asyncio.wait_for(subprocess.run, timeout=30s)` 起步；生产级需 Docker / firejail
- **🟡 chrome MCP 接入路径不明**：Task 004 chrome_console_clean validator 实施前需确认 user team agent runtime 能否调 IDE 装的 MCP（属于 [[harness-mcp]] 维度 6 的依赖）
- **🟡 Policy Matrix 整合**：retry 计数合流要避免双计数 bug

## 5. 与其他 epic 的接口契约

- **输出给 [[harness-rule]]**：`VALIDATION_FAILED` 事件可被 rule violation 复用作信号
- **输出给 [[harness-workflow]]**：validation 失败可触发 workflow rollback（依 task 003 推进进度）
- **依赖 [[harness-mcp]] 维度 6**：chrome_console_clean validator 在 task 004 实施前确认 MCP 调用通路

## 6. 调研待二次确认项

- `service.py` 实际 `_execute()` 代码结构需读一遍确认 step 完成检测点
- `events.py:RunEventBus.publish()` 调用约定（参数、并发安全）
- chrome-devtools MCP 在 user team runtime 是否可用（决定 task 004 实现路径）
