---
name: tech-roadmap-rule
status: draft
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
epic: harness-rule
based_on: Explore agent 6 维代码基线调研 (2026-05-26)
---

# Harness Rule 技术路线

> 维度：**Team Rule Pack**。配 [[harness-scripts]] 形成"约束 + 校验"闭环。

## 1. 现状基线

| 关注点 | 当前状态 |
|--------|---------|
| system prompt 拼装点 | 现在分散在 `shadowflow/highlevel.py` 和 `shadowflow/runtime/builder_service.py:instantiate_blueprint()`；**没有统一 system_prompt 字段**，只有 `RoleProfile.persona` (contracts_builder.py:56) |
| agent prompt 加载链 | team / agent JSON → `agents.py:_load_agent()` → blueprint → `builder_service.py:instantiate_blueprint()` → 注入 context（来自 `context_builder.py:build_context()` line 69-115）|
| 现有种子来源 | `.claude/rules/` 实际存在 11 条（调研报告写"未找到"是误判）；`memory/feedback_*` 文件；Policy Matrix 内置 `POLICY_NOT_RECOMMENDED` / `SELF_APPROVAL_DISCOURAGED` 等最佳实践（`policy_matrix.py:10-30`）|
| Token 预算管理 | **无**。`context_builder` 只做内存层合并不截断；需集成 tiktoken 或 provider usage 字段 |

## 2. 推荐插桩点

```
后端：
  shadowflow/runtime/contracts_builder.py:RoleProfile  ← 新增 system_prompt: str 字段
  shadowflow/runtime/builder_service.py:instantiate_blueprint()  ← Rule 注入钩子
  shadowflow/api/teams.py                              ← 加 /rules CRUD
  shadowflow/runtime/rule_pack/                        ← 新建模块
    ├── schema.py        # TeamRuleSpec
    ├── injector.py      # 拼装 rule 注入 system prompt
    ├── seeds/           # 种子 rule markdown 文件
    └── token_budget.py  # 简易 tiktoken 截断

前端：
  src/components/team-settings/RulesTab.tsx            ← 新建
```

## 3. 技术路线（按 task 推进顺序）

### Task 001 — Schema + API（先做）
- `TeamRuleSpec` Pydantic 模型加到 `rule_pack/schema.py`
- `teams.py` 复用 TeamPolicy 模式加 endpoints
- **关键决策**：Rule 不内嵌在 RoleProfile，而是 team 级独立字段——所有 agent 共享

### Task 002 — Runtime 注入器（依赖 001）
- `RulePackInjector.inject(team_id, system_prompt) -> system_prompt`
- 插桩位置：`builder_service.py:instantiate_blueprint()` 的 system prompt 生成阶段
- 注入格式（拼到 system prompt 顶部）：
  ```
  ## 团队硬底线规则（违反 = 严重错误）
  {rule.content for severity=hard}

  ## 团队建议规则
  [建议] {rule.content for severity=soft}
  ```
- token 预算：rule 总长 > 2K 触发截断警告（用 tiktoken 估算）

### Task 003 — UI（与 002 并行，依赖 001）
- `RulesTab.tsx` 复用 PolicyMatrixPanel 同构样式
- markdown 编辑器：复用现有组件；没有就 textarea + preview MVP

### Task 004 — 种子库（与 001-003 并行）
- 从 `.claude/rules/`（11 条）+ `CLAUDE.md`（UI 保护规则、双后端架构等）+ `memory/feedback_*`（auto_commit / browser_verify / no_emoji 等）提炼
- 严格控制 ≤10 条（文章主张"只加关键的 Rule"）
- 候选优先级：
  1. 改完代码必须立即提交（feedback_auto_commit）
  2. 前端 Story DoD：浏览器手测 + console 零 error（feedback_frontend_dod_browser_verify）
  3. UI 禁用系统 emoji 做图标（feedback_no_system_emoji_icons）
  4. 不致敬/借鉴他家产品（feedback_no_borrowing）
  5. 禁止硬编码 API key
- 存到 `rule_pack/seeds/*.md`，UI 003 加"一键导入"按钮

## 4. 风险 / 隐藏阻塞

- **🟡 system_prompt 字段加到 RoleProfile 会改变 blueprint 数据模型**：需迁移已有 team JSON，加默认空值不破坏向后兼容
- **🟡 注入位置选择**：放 system prompt 顶部 vs 底部影响 LLM 注意力；建议顶部（文章主张"team 政策"地位高于 agent persona）
- **🟢 调研误判**：`.claude/rules/` 实际存在（agent-coordination.md / branch-operations.md / datetime.md / ... 11 条），可直接抽取

## 5. 与其他 epic 的接口契约

- **依赖 [[harness-scripts]]**（弱）：rule violation 可触发 validation hook fail；但本 epic 单独可上线（不阻塞 scripts）
- **配合 [[harness-sub-agent]] 004**：runtime 契约校验跟 rule 注入是同源软约束机制，共享 telemetry

## 6. 调研待二次确认项

- `builder_service.py:instantiate_blueprint()` 实际 system prompt 拼装顺序
- `context_builder.py:build_context()` 是不是真的没 token 截断（直接 grep 一下确认）
