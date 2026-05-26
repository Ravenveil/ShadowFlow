---
status: superseded
superseded_at: 2026-05-26
superseded_by: docs/backend-capability-map-and-upgrade-plan.md
---

# ⚠️ 此 Epic 已 SUPERSEDED

本目录（`harness-mcp/`）是 top-down 按文章 6 维硬切的产物。**已被 bottom-up 计划替代**。

## 新位置

**主计划**：[`docs/backend-capability-map-and-upgrade-plan.md`](../../../docs/backend-capability-map-and-upgrade-plan.md)

对应的新动作：**U1 ToolPolicy → MCP 权限门复用 + Team MCP Binding**（§4.3）。

**重要重新评估**：`ToolPolicy.permission_rules` (`contracts_builder.py:93-107`) 完整的
allow/ask/deny + arg_pattern 权限模型已存在，可直接复用作 MCP 权限门——这是后端调研
发现的"隐藏珍宝"之一。

真正新建的只有 `runtime/team_mcp/client.py`（stdio/http transport 实现 + audit）。
工作量从 top-down 估算的 1-2 周降到约 2 周（含复用 + 新建混合）。

## 本目录文件仍有价值

调研细节（MCP 三 transport 实现优先级、ApprovalCard 复用边界、secrets store 路径）可复用。

---

如要推进 MCP 升级，按新计划 §4.3 走 U1。
