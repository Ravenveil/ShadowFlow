# memory 域（DDD 样板，2026-11-19 第 4 批）

> 目录重构 + 代码重构拆分。本域是「真 DDD 分层」的样板域：
> **entries 子域已按四件套重建**（model / repository / infra / use_cases），
> lessons / handoff / profiles 的路由仍在 adapters（待按同法迁移）。

## 归属

- 业务：记忆系统（entries 手动记忆 / lessons 自动经验 / handoff 交接 / profile 画像 / state）
- 分层契约（对照《项目越写越乱？先改目录结构》的三问）：
  - **规则在哪** → `model.ts`（实体 + 不变量 + 领域错误）
  - **有哪些用例** → `use_cases/*.ts`（动词命名，与 HTTP/SQL 无关）
  - **换存储改哪里** → 只改 `infra/*repository.ts`，application/web 零改动

## 目录（entries 子域已落地）

```
domains/memory/
├── model.ts                              # 内部：MemoryEntry 实体、scope/标题/内容不变量、领域工厂
├── repository.ts                         # 内部：MemoryEntryRepository 接口（依赖倒置点）
├── infra/
│   └── json-memory-entry.repository.ts   # 外部：JSON 文件实现（换 SQLite/PG 只换这里）
├── use_cases/
│   ├── entries.ts                        # 用例：list/create/update/delete/settings 编排
│   └── entries.test.ts                   # 单测：注入内存 repo，零 IO、不启 server
└── adapters/
    ├── memory-entries.ts                 # 薄壳：HTTP ↔ 用例 Result 映射（createRouter 工厂）
    ├── memory-handoff.ts                 # 待迁移
    ├── memory-lessons.ts                 # 待迁移
    ├── memory-profiles.ts                # 待迁移
    └── memory-state.ts                   # 待迁移
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

1. 装配根收口：index.ts 统一 `new JsonMemoryEntryRepository()` 注入，删除 adapter 内的过渡默认装配
2. lessons / handoff(1222 行) / profiles / state 按同法迁移；handoff 单独 PR（回归高发）
3. 全部迁完后，单独一步确认删除 `storage/memory-*` 与 `routes/memory/*` 存根
