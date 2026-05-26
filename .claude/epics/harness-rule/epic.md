---
name: harness-rule
status: open
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
prd: harness-6dim-survey-and-river-memory
priority: P1
progress: 0%
source_doc: docs/harness/harness-6dim-survey-and-river-memory.md §2.2 Q1 + §4 B2
---

# Epic: Harness Dimension — Rule（Team Rule Pack）

## 维度定位

**文章 6 维之一**：Rule — *"What must never be violated"* / *Foundational constraints and red lines*

> "Rule 是软约束，不是硬关卡。规则集越大、任务越复杂，模型越容易表现出
> 遗忘 / 选择性失效 / 偷懒绕过。Rule 强制原则约束，无法强制流程执行。" —— 文章 §1.2

## 平台缺口（用户视角）

用户问："我想让我团队里所有 agent 都遵守'禁止硬编码 API key'，怎么配？"
**ShadowFlow 当前回答**：去 agent prompt 里一句一句加，或者写一个 skill 让它们 `@` 引用。
没有"Team 级 Rule 包"概念，没有 Rule 必读校验。

**评分**：平台原语 🔴 / 用户可用度 🔴。

## 战略意义

配合 [[harness-scripts]] 的 Validation Hook 形成"**约束 + 校验**"闭环：
- Rule 注入 = "告诉 agent 不该做什么"
- Validation Hook = "客观验证 agent 是否真的做到了"

单独的 Rule 没用（agent 会绕过），单独的 Validation 太硬（错过软性指引）。两者配套才完整。

## Success Criteria

- [ ] 用户在 team 设置 UI 加 "添加 Rule" 入口（独立对象，非 agent prompt）
- [ ] Rule 在每次 turn 开始时强制注入到 system prompt
- [ ] 提供 5-10 条种子 Rule（提炼自项目 .claude/rules + CLAUDE.md + 用户 memory feedback_*）
- [ ] Rule 与 Validation Hook 联动：违反 rule 触发 hook fail（可选）

## 后端模块责任

**新建模块**：`shadowflow/runtime/rule_pack/` —
含 rule schema、注入器、种子库。

**触点**：
- `shadowflow/api/teams.py` — 加 rules CRUD endpoints
- `shadowflow/runtime/turn_executor.py` — turn 开始时注入 rules
- `src/components/team-settings/` — 新增 "规则" tab

## Tasks Created

- [ ] 001.md - Team Rule Pack 数据模型 + Teams API
- [ ] 002.md - Runtime 注入器：turn 开始时把 rule 强制塞入 system prompt
- [ ] 003.md - Rule 创作 UI（team 设置 "规则" tab）
- [ ] 004.md - 种子 Rule 库：从 .claude/rules / CLAUDE.md / memory feedback_* 提炼 5-10 条

Total tasks: 4
Parallel tasks: 2 (003, 004 与 001-002 并行)
Sequential tasks: 2 (001 → 002)
Estimated total effort: 1-2 周
