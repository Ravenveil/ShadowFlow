---
status: superseded
superseded_at: 2026-05-26
superseded_by: docs/backend-capability-map-and-upgrade-plan.md
---

# ⚠️ 此 Epic 已 SUPERSEDED

本目录（`harness-rule/`）是 top-down 按文章 6 维硬切的产物。**已被 bottom-up 计划替代**。

## 新位置

**主计划**：[`docs/backend-capability-map-and-upgrade-plan.md`](../../../docs/backend-capability-map-and-upgrade-plan.md)

对应的新动作：**T1 SystemPromptBuilder 单一源**（§3.1 整理债）+ **N2 Team Rule Pack**（§4.3）。

新计划里 Rule 的处理变成：
- 先做 T1 把散落 3 处的 system prompt 拼装收拢（必须前置）
- 然后 N2 才是真正新建 rule_pack/ 模块

比 top-down 计划多了 T1 这步——因为后端调研发现 system prompt 散在 highlevel.py + context_builder.py + builder_service.py 三处。

## 本目录文件仍有价值

调研细节（种子库候选、注入器设计、token 预算）可被 N2 实施时引用。

---

如要推进 Rule 升级，请先做 T1，再启动 N2（按新计划 §4.3 + §5）。
