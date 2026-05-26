---
status: superseded
superseded_at: 2026-05-26
superseded_by: docs/harness/backend-capability-map-and-upgrade-plan.md
---

# ⚠️ 此 Epic 已 SUPERSEDED

本目录（`harness-sub-agent/`）是 top-down 按文章 6 维硬切的产物。**已被 bottom-up 计划替代**。

## 新位置

**主计划**：[`docs/harness/backend-capability-map-and-upgrade-plan.md`](../../../docs/harness/backend-capability-map-and-upgrade-plan.md)

对应的新动作：**E1 RoleProfile 深度字段 UI 暴露** + **E4 关卡型角色模板种子**（§4.2 暴露增强）。

**重要重新评估**：bottom-up 调研确认 `RoleProfile` 完整契约 schema (responsibilities/
constraints/handoff_rules/collaboration_contract) 早就在 `contracts_builder.py:52` 存在。
这块**不是"新建"，是"暴露"**——只需补 UI（替代下架的 /builder）+ 加 3 个角色模板种子。
工作量从 top-down 估算的 2-3 周降到约 2 周。

## 本目录文件仍有价值

调研细节（agent-team-blueprint 模板位置、catalog_service 复用方案、Gatekeeper/Reviewer/QA
模板设计）可被 E1+E4 实施时引用。

---

如要推进 Sub-Agent 升级，按新计划 §4.2 走 E1 + E4。
