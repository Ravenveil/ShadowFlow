# TODOS

## Sprint 15 延后事项（autoplan 2026-05-04 决策）

### → Sprint 16

- **Epic 10 Kits** — Research Kit / Knowledge Assistant Kit / Review Kit
- **Epic 13-3** (Catalog Agent/Team Import) — 依赖 Template Marketplace
- **Epic 13-5** (Agent Scope Framing) — 补丁级工作
- **Epic 13-6** (Standalone → Team Promotion) — 需 Team 主路径稳定后再做

### → Phase 2

- **Sessions/ACP 前端** — ACP moat 验证（UI 优先策略下排期）
- **BeeAI ACP alignment** (acp_server.py) — 独立任务，~半天，anytime

### → 独立 Sprint

- **React Flow v11→v12 迁移** — 较大重构，不捆绑功能需求
- **LightRAG query route** (/knowledge/packs/{id}/search) — Story 9.4 前置
- **A2A SSE streaming** — Phase 2

### → 环境待修

- **APScheduler 安装** — `.smoke-venv` 的 pip 无法正常调用；需用 `pip install 'APScheduler>=3.10,<4'` 手动安装后 `test_schedules_api.py` 才会全绿
- **浏览器路由验证** — Sprint 15 Epic 12 提交后的 browser DoD 仍待人工验证（所有路由无 console error）

---

## v2 ConnectionResolver — parallel/barrier block topology

**Status:** ✅ Implemented (2026-04-02)

`ConnectionResolver.resolve()` now supports `strategy="capability"` with catalog
parameter for capability-dependency graph inference. Fan-out, fan-in, cycle
detection, and isolated block handling are all implemented and tested.

See: `docs/plans/spontaneous-assembly/step-b-v2-topology-inference.md`
