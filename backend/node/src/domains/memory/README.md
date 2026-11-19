# memory 域（DDD 样板，2026-11-19 第 4 批）

> 目录重构 + 代码重构拆分。本域是「真 DDD 分层」的样板域：
> **entries / lessons / profiles 三个子域已按四件套重建**（model / repository / infra / use_cases / adapters）。
> 按 [ARCHITECTURE.md](../../../../ARCHITECTURE.md) §5「渐进式边界」：
> **handoff 只提纯规则层**（`handoff-model.ts`，1222 行的 SQL 装配仍留 storage），
> **state 只有 adapter 薄壳**（无业务规则，不配四件套）。

## 归属

- 业务：记忆系统（entries 手动记忆 / lessons 自动经验 / handoff 交接 / profile 画像 / state）
- 分层契约（对照《项目越写越乱？先改目录结构》的三问）：
  - **规则在哪** → `model.ts`（实体 + 不变量 + 领域错误）
  - **有哪些用例** → `use_cases/*.ts`（动词命名，与 HTTP/SQL 无关）
  - **换存储改哪里** → 只改 `infra/*repository.ts`，application/web 零改动

## 目录

```
domains/memory/
├── model.ts                              # entries：MemoryEntry 实体、scope/标题/内容不变量、领域工厂
├── repository.ts                         # entries：MemoryEntryRepository 接口（依赖倒置点）
├── lessons-model.ts  lessons-repository.ts
├── profiles-model.ts profiles-repository.ts
├── handoff-model.ts                      # 规则层：交接包不变量（SQL 仍留 storage/handoff.ts）
├── infra/
│   ├── json-memory-entry.repository.ts   # 换存储只换这里
│   ├── sqlite-lesson.repository.ts
│   └── sqlite-profile.repository.ts
├── use_cases/
│   ├── entries.ts   entries.test.ts      # 注入内存 repo，零 IO、不启 server
│   ├── lessons.ts   lessons.test.ts
│   └── profiles.ts  profiles.test.ts
└── adapters/
    ├── memory-entries.ts                 # 薄壳：HTTP ↔ 用例 Result 映射（createRouter 工厂）
    ├── memory-lessons.ts
    ├── memory-profiles.ts
    ├── memory-handoff.ts                 # 无 repository：直接调 storage 的 SQL 装配
    └── memory-state.ts                   # 无 model：纯形状转换
```

## 依赖方向（依赖倒置已成立）

```
adapters(web) → use_cases → model
                    ↓ 依赖接口
              repository(接口) ← infra(JSON 实现)
```

- `model.ts` 不 import express / fs / storage —— 纯领域
- `use_cases` 只认 `MemoryEntryRepository` 接口，不认 JSON —— 可注入内存实现单测
- `infra` 实现接口，技术细节（fs/path/atomic rename）全锁在这一层
- 换存储：新增 `infra/sqlite-*.repository.ts` + 装配根换一行 new，其余零改动

## 兼容

- `routes/memory/memory-entries.ts` 与 `storage/memory-entries.ts` 均保留为 re-export 存根，调用方零改动
- `adapters/memory-entries.ts` 默认导出仍是装配好的 Router 实例（index.ts 不动）
- 全量测试：123 文件 / 1551 测试全绿（含新增 6 条用例单测）

## 待办

1. 装配根收口：index.ts 统一 `new JsonMemoryEntryRepository()` / `new SqliteLessonRepository()` 注入，
   删除 adapter 内的过渡默认装配
2. **handoff 不拆四件套**（ARCHITECTURE.md §5）：它已提到 `handoff-model.ts` 作为规则层，
   1222 行的 SQL/DDL 装配留在 `storage/handoff.ts`，只继续把纯规则往 model 收，不做 repository/infra 拆分
3. `state` 无业务规则，永久维持 adapter 薄壳
4. 全部稳定后，单独一步确认删除 `storage/memory-*` 与 `routes/memory/*` 存根
