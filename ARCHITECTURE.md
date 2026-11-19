# ShadowFlow 架构与目录规范

> **这份文档是约束，不是介绍。** 新增/修改代码必须遵守；评审时以它为准。
> 面向人的上手流程见 [CONTRIBUTING.md](CONTRIBUTING.md)；面向编码代理的快速约束见 [AGENTS.md](AGENTS.md)。
>
> 建立于 2026-11-19，来自一次全量重构的实践（8 个业务域、9 次提交、1551 → 1885 测试零回归）。
> 方法论来源见文末「参考」。

---

## 一、我们到底在优化什么

目录不是审美问题。它决定三件事，这三条也是**验收标准**：

1. **能很快知道要改什么** —— 接到需求能直接定位到文件，不用全局搜索。
2. **改的时候要读的上下文尽量少** —— 一次改动只看一两个文件就够。
3. **连带修改很少甚至没有** —— 改规则不用顺手改路由、改 SQL、改测试三处。

反例对照（都是我们踩过的）：

| 反例 | 违反了 |
|---|---|
| 大杂烩：一个 `storage/merchant-board.ts` 里塞了口径计算 + SQL + 分桶 + 格式化 | ① |
| 按层分包：`domain/` `application/` `adapters/` 各一整层大包，加个功能要跨三层跳 | ② |
| 按用例分包：一个功能一个包，各写一份共用模型 | ③ |

---

## 二、第一刀：内外分层（按「变化原因」分，不按技术分）

| 层 | 目录 | 什么变化会驱动它 | 典型内容 |
|---|---|---|---|
| 外部 | `adapters/` | 接口协议、框架、调用方形态 | HTTP 路由、请求/响应形状、参数校验到 400/422 的映射 |
| 外部 | `infra/` | 存储、第三方 SDK、IO | SQLite/JSON 仓储实现、文件读写、外部 API 客户端 |
| 内部 | `model/`<br>`use_cases/`<br>`repository/` | 业务规则、用例、不变量 | 实体、状态机、口径计算、编排流程、仓储**接口** |

判据只有一句：

- 换数据库 / 换框架 / 换接口协议要动的 → **外部**
- 新增一个用例 / 改一条业务规则要动的 → **内部**

## 三、第二刀：内部按业务聚合

同一领域模型、同一组数据的用例，聚进同一个域包；互不相干的功能各自成包。
**每个域包自含** model / use_cases / repository，只有真跨域共享的才上移。

## 四、领域包的标准形状（后端 `backend/node/src/domains/<域>/`）

以 `domains/memory` 为样板（`entries` / `lessons` / `profiles` 三个子域已完整四件套）：

```
domains/memory/
├── model.ts                              # 内部：实体、不变量、领域错误、领域工厂
├── repository.ts                         # 内部：接口（依赖倒置点）
├── infra/json-memory-entry.repository.ts  # 外部：实现（换 SQLite 只换这里）
├── use_cases/entries.ts                  # 内部：用例编排（动词命名，与 HTTP/SQL 无关）
├── use_cases/entries.test.ts             # 注入内存 repo，零 IO、不启 server
└── adapters/memory-entries.ts            # 外部：薄壳，HTTP ↔ 用例 Result 映射
```

依赖方向（**箭头只能往右/往下，反向即违规**）：

```
adapters ─→ use_cases ─→ model
                │ 依赖接口
                ↓
          repository(接口) ←── infra(实现)
```

一个域里有多个子域时用后缀区分，不硬塞进一个 `model.ts`：

```
domains/memory/lessons-model.ts      domains/memory/profiles-model.ts
domains/memory/handoff-model.ts      domains/commerce/merchant-model.ts
```

## 五、渐进式边界：不是所有文件都配得上四件套

全量重构得出的结论：**盲目四件套 = 制造空壳**。按规则密度分流：

| 情形 | 做法 | 实例 |
|---|---|---|
| 规则密集、单一子域 | 完整四件套（model + repository + infra + use_cases + adapters） | `domains/memory/entries`、`lessons`、`profiles`、`collaboration/hops` |
| 多子域交织的巨文件 | **只提纯规则层** `model`，`storage/` 保留 SQL/DDL 装配 | `handoff`、`merchant-board`、`craft-profit`、`social-publish`、`ops-shipping` |
| 纯编排胶水（无业务规则） | **不动** | `craft-intake`、`craft-team-setup` |

判断方法：问「这段代码里，有没有一行业务规则是**换存储/换框架都不该变**的？」
有 → 该进 model；只有查表拼参数 → 留在原处。

## 六、三问自检（判断是否真做到，而不是贴了标签）

1. **规则在哪？** → 能指到 `model.ts` / `use_cases/`，而不是「在 storage 的某个函数里」。
2. **对外提供哪些用例？** → 数 `use_cases/` 下的文件就能答，不用读路由。
3. **想换存储改哪里？** → 只看 `infra/`，其余零改动。

任何一问答不上，说明只是搬了文件。

## 七、放置决策树（新增代码前先走一遍）

```
我要加的东西是……
├─ 一个 HTTP 端点            → adapters/ 加薄壳；逻辑写进 use_cases/
├─ 一条业务规则 / 一次校验    → model/
├─ 一次多步骤编排            → use_cases/（只认接口，不认实现）
├─ 一段 SQL / 一次文件读写    → infra/（实现 repository 接口）
├─ 一个纯格式化/文案工具      → 就近放，别造 utils/ helper/ tools 幽灵目录
└─ 跨域共享（sqlite、settings、协议标签）→ shared/ 或既有公共层，谨慎上移
```

## 八、红线（评审直接打回）

**后端（`backend/node`）**

- `model.ts` 禁止 import `express` / `sqlite` / `fs` / `crypto` / `child_process` —— 纯领域，可用 Node 标准库的纯函数（如 `path`）也尽量避免。
- `routes/`、`adapters/` 只做形状转换：**不写业务规则、不直连 SQL、不直接调 LLM SDK**。
- 每个 export 只有一个真源：`storage/*` 与 `routes/*` 里对已迁移的模块**只剩 re-export 或薄包装**，不得再出现第二份实现。
- 领域错误必须在 adapter/兼容层翻译成原有 HTTP 错误类（如 `raiseRule()` 把 `MerchantDomainError` → `MerchantError(400)`），**不能让路由的 `instanceof` 判断失效变成 500**。
- 迁移期间：**新代码一律写进新结构，禁止往旧位置加文件**；兼容层删除单独一步、单独确认，不做一次性大爆炸移动。

**前端（`frontend/src`）**

- `api/` 只做 fetch 与形状映射，不放业务判断；`store/` 只放状态，不直接 fetch。
- `neo/`（Neo 界面体系）与 `pages/`（路由级页面）不互相 import 内部实现。
- 组件不自己拼后端 URL；一律经 `api/`。

**通用**

- 不新增「幽灵目录」（`utils/`、`helpers/`、`common2/`）。真要放，说明它属于哪个域的 model。
- 文件超过 ~600 行先想「这里是不是有两个域」，而不是继续加函数。
- `docs/` 不入库（见 `.gitignore`）。开发文档只放仓库根的 `CONTRIBUTING.md` / `ARCHITECTURE.md` / 各层 `AGENTS.md`。

## 九、现状盘点（2026-11-19）

| 域 | 结构 | 说明 |
|---|---|---|
| `memory` | 四件套（entries）+ 规则层（lessons/profiles/handoff） | **样板域**，见 `domains/memory/README.md` |
| `collaboration` | 四件套（hops）+ model/use_cases（teams）+ 规则层（groups / state） | 群与编队语义 |
| `commerce` | 规则层三件（merchant / social / shipping） | 口径、状态机、收件校验 |
| `craft` | 规则层（profit / agent） | 代卖盈利口径 |
| `analytics` | 规则层（usage / evidence） | 成本估算、证据包 |
| `catalog` | 规则层（蓝图脱敏 + 契约校验） | 对线安全 |
| `voice` | adapters | 待补 |

未列入的模块（`routes/`（未迁移部分）、`transport/`、`workflow/`、`parsers/`、`prompts/`）目前仍是技术分层，属技术基础设施，**不强行业务聚合**。要动它们时按本文的判据先问一句「这里有业务规则吗」。

## 十、验收（每批改动都要过）

```bash
cd backend/node && npx tsc --noEmit && npx vitest run      # 后端：类型 + 全量
cd frontend   && npx tsc --noEmit && npx vitest run        # 前端：类型 + 全量
```

- **零回归**是硬门槛：基线数字只许增（新增测试）不许减。
- UI 改动必须同步对应测试用例（`frontend/src/neo/__tests__` 等）。
- 提交按批、带 pathspec（`git commit -- <只我的文件>`），一批一个主题。

## 十一、参考

- 《项目越写越乱？先改目录结构》——内外分层 + 业务聚合 + 三条判据的出处
- 《5 分钟学会写架构设计》——Domain / use_case / adaptor 的分工
- Notion：`架构裁定 + 主控自举交付方案（2026-11-19）`（前 3 批为何不算 DDD、目标目录树、修正路线）
- Notion：`目录结构重构 Prompt（可复用）`（可直接复制执行的迁移步骤与约束）
- 在本仓库里可直接对照的样板：`backend/node/src/domains/memory/README.md`
