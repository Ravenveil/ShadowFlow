# analytics/usage 域（AI 用量看板）

按「内外分层 + 按业务聚合」从 `storage/token-usage.ts` 与 `routes/dashboard/dashboard.ts` 抽出（2026-11-19，第 2 批）。

- `adapters/token-usage.ts`：Token 用量流水写入/聚合查询，单价表来自 settings；内部仍依赖 `storage/sqlite` 与 `storage/settings`，后续应上提到 `shared/adapters`（批 0）。
- `adapters/dashboard.ts`：`GET /api/dashboard/overview|timeseries|breakdown|briefing` 路由，现算聚合，不预建表。
- 与 `analytics/merchant`（商家经营看板）是两个独立子域，代码注释已明确互不依赖，勿合并。

旧路径 `storage/token-usage.ts`、`routes/dashboard/dashboard.ts` 保留兼容 re-export；调用方（`index.ts`、`transport/*`、`routes/system/llm.ts`、测试）无需改动。

验证：`npx vitest run src/storage/token-usage.test.ts` + `npm run build`（tsc）。
