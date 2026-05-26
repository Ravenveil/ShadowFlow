---
status: superseded
superseded_at: 2026-05-26
superseded_by: docs/backend-capability-map-and-upgrade-plan.md
---

# ⚠️ 此 Epic 已 SUPERSEDED

本目录（`harness-workflow/`）是 top-down 按文章 6 维硬切的产物。**已被 bottom-up 计划替代**。

## 新位置

**主计划**：[`docs/backend-capability-map-and-upgrade-plan.md`](../../../docs/backend-capability-map-and-upgrade-plan.md)

对应的新动作：**E2 Workflow yaml 模式扩展**（§4.2）。

**重要重新评估**：`TeamWorkflow` (`teams.py:247`) 已有完整 nodes/edges schema +
DAG scheduler + 条件边 expression eval 已存在。这块**主要是"扩字段 + 加 UI"**，
不是从零建。工作量从 top-down 估算的 2-3 周降到约 1 周（不含可选的 phases 概念引入）。

**B6/B8/B9 三个附属项**（dev-map / Task Board / Bedrock 重评）维持原计划，
可独立做，不阻塞 E2 主体。

## 本目录文件仍有价值

调研细节（service.py:_execute 改造方案、yaml 加载点、Bedrock 重评 A/B/C 三选项）可复用。

---

如要推进 Workflow 升级，按新计划 §4.2 走 E2。
