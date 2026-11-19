# memory 域（第 3 批迁移，2026-11-19）

> 内外分层 + 按业务聚合目录重构。本域聚合「记忆三区 + handoff + profile」相关 HTTP 路由。

## 归属

- 业务：记忆系统（lessons 自动记忆 / 交接 handoff / 画像 profile / entries / state）
- 层：adapters（HTTP 入口），领域逻辑仍在 `src/storage/memory-*`（第 4 批计划迁入本域 `store/`）

## 目录

- `adapters/memory-entries.ts` ← 原 `routes/memory/memory-entries.ts`
- `adapters/memory-handoff.ts` ← 原 `routes/memory/memory-handoff.ts`
- `adapters/memory-lessons.ts` ← 原 `routes/memory/memory-lessons.ts`
- `adapters/memory-profiles.ts` ← 原 `routes/memory/memory-profiles.ts`
- `adapters/memory-state.ts` ← 原 `routes/memory/memory-state.ts`

## 兼容

旧路径 `routes/memory/*.ts` 保留为 re-export 存根，`index.ts` 无需改动。全量测试通过后可单独删除存根（单独一步确认）。

## 待办（第 4 批）

`storage/memory-entries / memory-handoff / memory-lessons / memory-profile-configs` 及其测试迁入 `domains/memory/store/`，并处理 storage 层被 `groups-chat` / `run-sessions` / `workflow/executor` 等外部引用。
