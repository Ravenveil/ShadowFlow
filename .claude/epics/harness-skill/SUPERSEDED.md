---
status: superseded
superseded_at: 2026-05-26
superseded_by: docs/backend-capability-map-and-upgrade-plan.md
---

# ⚠️ 此 Epic 已 SUPERSEDED

本目录（`harness-skill/`）是 top-down 按文章 6 维硬切的产物。**已被 bottom-up 计划替代**。

## 新位置

**主计划**：[`docs/backend-capability-map-and-upgrade-plan.md`](../../../docs/backend-capability-map-and-upgrade-plan.md)

对应的新动作：**E3 Skill steps 类型扩展** + **E5 通用 SOP Skill 种子**（§4.2 暴露增强）。

**重要重新评估**：skill-ingest pipeline 完整 + `lib/skill-compiler/` 450 行已存在。
这块**是"frontmatter 扩 steps 字段 + 3 个种子 SKILL.md"**，不是新建 executor。
工作量从 top-down 估算的 2 周降到约 1.5 周（不含可选的创作 UI）。

## 本目录文件仍有价值

调研细节（skill-ingest 后端路由位置、steps schema 设计、SOP 种子内容）可复用。

---

如要推进 Skill 升级，按新计划 §4.2 走 E3 + E5。
