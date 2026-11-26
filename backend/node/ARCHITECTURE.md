# application 架构契约表（三判据）

> 路径均相对 `backend/node/`。三判据 = 文档 `documentation/ARCHITECTURE.md` §6 三问自检：
> ①规则在哪 → `model.ts` / `use_cases/`；②有哪些用例 → 数 `use_cases/`；③换存储改哪里 → `repository.ts` 接口 + `infra/` 一处实现。
> 下表覆盖 `src/application/` 下 **24 个业务包**（`adapters/` 为跨包技术适配层，不计入）。
> 门禁：`node scripts/arch-check.mjs`（扫描根已迁到 `application/**`）。

| 业务包 | 规则在哪 | 有哪些用例 | 换存储改哪里 |
|---|---|---|---|
| **memory** ✅ | `src/application/memory/model.ts`、`handoff-model.ts`、`lessons-model.ts`、`profiles-model.ts` | `src/application/memory/use_cases/entries.ts`、`lessons.ts`、`profiles.ts` | `src/application/memory/repository.ts`、`lessons-repository.ts`、`profiles-repository.ts` + `infra/{json-memory-entry,sqlite-lesson,sqlite-profile}.repository.ts`、`infra/storage-memory-*.ts` |
| **memos** ✅ | `src/application/memos/model.ts` | `src/application/memos/use_cases/memos.ts` | `src/application/memos/repository.ts` + `infra/json-memo.repository.ts` |
| **news** ✅ | `src/application/news/model.ts`（`enrich.ts` 为规则辅助） | `src/application/news/use_cases/news.ts` | `src/application/news/repository.ts` + `infra/json-news.repository.ts`（`infra/rss.ts` 为外部源适配） |
| **research** ✅ | `src/application/research/arc-model.ts` | `src/application/research/use_cases/arc-runs.ts` | `src/application/research/repository.ts` + `infra/arc-fs.reader.ts`（`adapters/arc-http.ts` 为外部 runner 适配） |
| agents | 【待整理】有 `model.ts`，无 `use_cases/`、`repository.ts` | 【待整理】用例散在 http / infra | 【待整理】存储直连在 `infra-*.ts` |
| analytics | 【待整理】有 `evidence-model.ts`、`usage/usage-model.ts` | 【待整理】无 `use_cases/` | 【待整理】adapters 直连 SQL |
| auth | 【待整理】三判据均缺 | 【待整理】 | 【待整理】`infra-store.ts` / `infra-users.ts` 未抽接口 |
| catalog | 【待整理】有 `model.ts`（评审裁决：独立达标，但三判据仍缺用例与仓储） | 【待整理】无 `use_cases/` | 【待整理】`infra-builtin.ts` / `infra-store.ts` 未抽接口 |
| connectors | 【待整理】三判据均缺 | 【待整理】 | 【待整理】`infra-journal.ts` / `infra-registry.ts` |
| conversations | 【待整理】"搬家不拆"，无 `use_cases/` | 【待整理】用例在 `http-*.ts` / `chat-orchestrator.ts` | 【待整理】`infra-*.ts` 混路由与存储；`http-projects.ts` 直连 DB 已在本次修复 |
| craft | 【待整理】有 `agent-model.ts`、`profit-model.ts` | 【待整理】无 `use_cases/` | 【待整理】`infra-profit*.ts` 等未抽接口 |
| memory-bank | 【待整理】三判据均缺 | 【待整理】 | 【待整理】 |
| merchant | 【待整理】有 `merchant-model.ts` | 【待整理】用例混在 `infra-store.ts`（1147 行） | 【待整理】`infra-store.ts` 直连存储 |
| opc | 【待整理】三判据均缺 | 【待整理】 | 【待整理】`routes/opc-company.ts`（773 行）混层 |
| prompts | 【待整理】纯提示词资源，无业务判据 | 【待整理】 | 【待整理】不涉及存储 |
| runs | 【待整理】"搬家不拆"，无 `use_cases/` | 【待整理】用例在 `http-*.ts` | 【待整理】`infra-*.ts` 混路由；`sessions-src/index.ts`（2254 行） |
| runtime | 【待整理】运行时基础设施，无业务判据层 | 【待整理】 | 【待整理】`timeline-projector.ts` / `run-event-bus.ts` 为机制文件 |
| schedules | 【待整理】三判据均缺 | 【待整理】 | 【待整理】 |
| settings | 【待整理】三判据均缺 | 【待整理】用例在 `http-*.ts` | 【待整理】`infra-store.ts`；`http.ts`（1251 行）混层 |
| shipping | 【待整理】有 `shipping-model.ts` | 【待整理】无 `use_cases/` | 【待整理】`infra-store.ts` 未抽接口 |
| skills | 【待整理】三判据均缺 | 【待整理】 | 【待整理】`assembly/assembler.ts`（1484 行）混层 |
| social | 【待整理】有 `social-model.ts` | 【待整理】无 `use_cases/` | 【待整理】`infra-store.ts` 未抽接口 |
| teams | 【待整理】有 `collaboration-models/` 下 6 个 model + 局部 `use_cases/`、`hops-repository.ts` | 【待整理】仅 hops/teams 两处用例，未覆盖全包 | 【待整理】`collaboration-models/infra/sqlite-hop.repository.ts` 之外仍混层；use_cases 边界曾泄漏 |
| voice | 【待整理】adapters 孤岛，无 model | 【待整理】 | 【待整理】不涉及存储 |

## 已知技术债（存量，门禁以 warning 计数，不阻断 CI）

1. **infra 实为 Router**：架构评审口径为 **12 个** `infra-*.ts` 混入路由职责；门禁实测直接 `import Router/express` 的非测试文件为 5 个——`agents/infra-registry.ts`、`agents/infra-state.ts`、`conversations/infra-message-feedback.ts`、`runs/infra-suggestions.ts`、`teams/infra-store.ts`。应拆到各自 `http*.ts`。【口径差异待确认】
2. **HTTP 直连 DB**：`conversations/http-projects.ts` 曾在 `:27,198-217` 直连 DB，**已在本次修复**，现经 `infra-projects.ts` / `infra-conversations.ts` 数据访问层调用。
3. **巨文件仍混层**：`runs/sessions-src/index.ts`(2254)、`conversations/chat-orchestrator.ts`(2183)、`skills/assembly/assembler.ts`(1484)、`settings/http.ts`(1251)、`memory/infra/storage-memory-handoff.ts`(1204)、`merchant/infra-store.ts`(1147) 等；当前全仓 22 个超 600 行文件已记入 `scripts/arch-line-baseline.json`，棘轮只许减不许增。
4. **model 不纯**：`agents/model.ts:12` 直连 `crypto`（门禁 `model-pure` warning）。旧 §8 把此列为硬红线，待存量清零后升回 fail。
5. **use_cases 边界**：门禁本次实测反向依赖（import infra/http/storage/routes）= 0；评审记录曾标注 teams use_cases 泄漏，当前已不触发，保持硬规则监控。
