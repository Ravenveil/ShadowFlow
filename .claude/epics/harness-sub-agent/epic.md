---
name: harness-sub-agent
status: open
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
prd: harness-6dim-survey-and-river-memory
priority: P1
progress: 0%
source_doc: docs/harness/harness-6dim-survey-and-river-memory.md §2.2 Q3 + §4 B3
---

# Epic: Harness Dimension — Sub-Agent（角色契约 + 关卡模板）

## 维度定位

**文章 6 维之一**：Sub-Agent — *"Who handles complex tasks"* / *Specialized roles*

> "强行让一个 Agent 全包，等于赌它能同时把所有事都做好。简单任务能撑住，
> 但在真实工程复杂度下就会崩。" —— 文章 §1.3
>
> 文章主张的 7 角色：PM / 需求 / 架构 / **Gatekeeper** / Dev / Reviewer / QA

## 平台现状（部分有，部分缺）

**强项 ✅**：组建团队能力强 — StartPage composer 自然语言一键生成 team；
`POST /builder/blueprints` API（Story 8.1）；BMAD-METHOD 等 skill pack；Quick Hire。
数据模型层 `RoleProfile.{responsibilities, constraints, handoff_rules, capabilities,
persona_traits, state_fields}` + Story 13.5 `CollaborationContract` schema 都齐全。

**弱项 🟡**：精修团队契约能力弱 —
- LLM 跑 `agent-team-blueprint` 时基本只填 name/soul/role，深度契约字段大概率不被填
- 用户拿到自动生成 team 后没有契约编辑 UI 改它（`/builder` 已下架）
- 模板库缺 Gatekeeper / Code Reviewer 这类关卡型角色
- Runtime 是否校验 responsibilities/constraints 待二次确认

## 战略意义

文章的 PM 漂移警示对我们尤其相关 —— BMAD Mary（PM）已经有"漂移成意见提供者"倾向。
理论上 `RoleProfile.constraints` + `handoff_rules` 能约束这个，但**没人配过**。
本 epic 让"自由组建"的实质从"LLM 现编一组 name+soul"升级为"用户可控的完整契约 team"。

## Success Criteria

- [ ] `agent-team-blueprint` 生成器把 responsibilities/constraints/handoff_rules 也填进
- [ ] 用户拿到 team 后能在 UI 上 review + 修改任意 agent 的角色契约字段
- [ ] 角色模板库新增 Gatekeeper / Code Reviewer / QA 三个关卡型模板可装
- [ ] Runtime 在 turn 期校验 responsibilities/constraints（先调研现状再补）

## 后端模块责任

**触点**：
- `shadowflow/runtime/builder_service.py` — 生成器 prompt 深化
- `shadowflow/runtime/contracts_builder.py` — RoleProfile schema 已有，确认校验逻辑
- `shadowflow/runtime/turn_executor.py` — 加 responsibilities/constraints runtime 校验
- `shadowflow/runtime/role_templates/` — 新建关卡型角色模板目录
- `src/components/team-editor/` — 新建契约编辑 UI（替代下架的 `/builder`）

## Tasks Created

- [ ] 001.md - agent-team-blueprint 生成器深化（让 LLM 填深度契约字段）
- [ ] 002.md - 角色契约编辑 UI（team-editor 替代下架的 /builder）
- [ ] 003.md - 角色模板库扩充：Gatekeeper / Code Reviewer / QA
- [ ] 004.md - Runtime 契约校验：调研现状 + 补 responsibilities/constraints/handoff_rules 强制

Total tasks: 4
Parallel tasks: 2 (001 与 003 可并行，002 与 004 可并行)
Sequential tasks: 0（严格 4 阶段）
Estimated total effort: 2-3 周
