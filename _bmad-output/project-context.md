---
project_name: ShadowFlow
user_name: Jy
date: 2026-04-16
status: complete
optimized_for_llm: true
rule_count: 12
sections_completed:
  - technology_stack
  - zerog_integration
  - runtime_contract
  - schema_single_source
  - sse_event_bus
  - state_management
  - policy_matrix_semantics
  - workflow_assembly
  - provider_fallback_security
  - testing_discipline
  - naming_structure_format
  - agent_plugin_contract
  - critical_dont_miss
existing_patterns_found: 12
---

# Project Context for AI Agents

_本文件收录 AI Agent 在 ShadowFlow 中实现代码时**必须遵守的关键规则与模式**。聚焦"不看就会踩坑"的非显而易见细节。与 `CLAUDE.md` / `AGENTS.md` / `.0g-skills/CLAUDE.md` / `_bmad-output/planning-artifacts/architecture.md` 互补(不重复可机检项如 ruff/eslint 默认规则)。_

> **优先级**:`CLAUDE.md` > 本文件 > `architecture.md` > 默认框架行为

---

## Technology Stack & Versions

### Backend(Python,19.7K LOC,已冻结契约)

- **Python** `>=3.9`(支持 3.9/3.10/3.11/3.12)
- **Pydantic** `>=2.0`(**v2 专用**,禁止 v1 语法如 `@validator`,改用 `@field_validator` / `@model_validator`)
- **PyYAML** `>=6.0` · **httpx** `>=0.26`(唯一异步 HTTP 客户端,禁用 `requests` / `aiohttp`)
- 可选:**FastAPI** `>=0.109` · **uvicorn** `>=0.27` · **aiosqlite** `>=0.19` · **redis** `>=5.0`
- 质量工具:**black** line-length=100 · **ruff** select=[E/F/I/N/W] · **mypy** · **pytest** + **pytest-asyncio**
- CLI 入口:`shadowflow = shadowflow.cli:main`(`pyproject.toml [project.scripts]`)

### Frontend(React/TS,35.7K LOC)

- **React** `^18.2` · **Vite** `^5.0.8` · **TypeScript** `^5.2`(`strict` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch`)
- **ReactFlow** `^11.10.4`(MVP 唯一 DAG 渲染引擎;PixiJS+d3-force 方案已废弃,留 Phase 2)
- **Zustand** `^4.5` + **Immer** `^10`(状态管理组合)
- **Tailwind** `^3.4` + **PostCSS** + **Autoprefixer**
- 测试:**Vitest** `^4.0` + **@testing-library/react** `^13.4` + **jsdom** `^28`
- 路径别名:`@/* → ./src/*`(tsconfig `paths`),禁止长相对路径如 `../../../`

### 链 / 计算(0G 生态)

- **ethers** **v6 专用**(禁 v5 API 如 `ethers.providers.JsonRpcProvider`,改用 `ethers.JsonRpcProvider`)
- Solidity `evmVersion: "cancun"`(0G Chain 硬约束,写在 `hardhat.config.ts` / `foundry.toml`)
- **@0glabs/0g-ts-sdk**(前端调,BYOK;版本号锁定到 `package.json`,禁用 `^` 自动升级)
- 0G Compute 推理后必调:`processResponse(providerAddress, chatID, usageData)`(参数顺序不可颠倒)

### 版本锁定纪律

- `@0glabs/0g-ts-sdk` 在 `package.json` 必须**精确版本**(无 `^` / `~`)—— I2 契约
- `requirements.txt` / `pyproject.toml` 中 0G 相关依赖同样精确锁定
- CI 应校验 lock 文件与声明一致(`pnpm-lock.yaml` / `package-lock.json`)

---

## Critical Implementation Rules

### 1. 0G 集成红线(最高优先级,违反即数据损坏或合规事故)

- ✅ **ALWAYS** 在每次 0G Compute 推理后调用 `processResponse(providerAddress, chatID, usageData)`,参数顺序不可错
- ✅ **ALWAYS** 从 `ZG-Res-Key` 响应头提取 `chatID`,`data.id` 仅作为 chatbot 场景的 fallback
- ✅ **ALWAYS** 使用 `ZgFile` 时 `file.close()` 写在 `finally` 块里
- ✅ **ALWAYS** `indexer.upload(file, rpcUrl, signer)` 返回 `[result, error]` tuple,必须解构检查
- ✅ **ALWAYS** `indexer.download()` 用 try/catch 包裹(可抛异常,不只是返回 error)
- ✅ **ALWAYS** 下载 trajectory 后**先 Merkle 验证再解析**(S3 红线,失败直接拒绝)
- ✅ **ALWAYS** 上传 trajectory 前走 `sanitize.py` 扫描(剔除 PII / API key / session token)
- ✅ **ALWAYS** Service tuple 用下标访问:`s[0]=providerAddress / s[1]=serviceType / s[6]=model / s[10]=teeVerified`
- ✅ **ALWAYS** Ledger tuple:`account[1]=totalBalance / account[2]=availableBalance`
- ❌ **NEVER** 在后端代理 0G Storage 上传(违反 BYOK;密钥不出前端)
- ❌ **NEVER** 在 trajectory / metadata / log 中出现 API key / session token / 私钥
- ❌ **NEVER** 将私钥硬编码(必须从 `.env` 读);`.env` 不入 git
- ❌ **NEVER** 在 Provider fallback 链里把用户 prompt 送往可能用于训练的 tier(必须 no-training API tier 或 Ollama 本地)—— S4 红线

### 2. Runtime 契约冻结规则(7+1 对象)

- **对象清单**:`task / run / step / artifact / checkpoint / memory_event / handoff` + MVP 新增 `policy_matrix`
- **字段级冻结**:任何破坏性字段改动必须走 **major version bump**(0.x → 1.0)并更新 `RUNTIME_CONTRACT_SPEC.md`
- 新增字段必须带默认值,保证旧 checkpoint 可被读取(向后兼容)
- 所有 Pydantic model 定义位于 `shadowflow/runtime/contracts.py`——**Single Source of Truth**
- Pydantic model 必须是**不可变模式**:修改 = `model.copy(update={...})`,禁止原地 mutate
- 有跨字段约束的 model 必须带 `@model_validator(mode="after")`(如 parallel/barrier 图验证)

### 3. Pydantic ↔ TypeScript 单源工作流

- `shadowflow/runtime/contracts.py` 是 SSOT → `scripts/generate_ts_types.py`(Sprint 1 补完)→ `src/types/*.ts`
- 生成物 `src/types/` **必须 git commit**(便于 review diff);标记为 `// AUTO-GENERATED - DO NOT EDIT`
- 前端**禁止**手写 runtime 契约类型(会漂移);UI-only 类型可手写但不可混入契约目录
- CI 中跑 `generate_ts_types.py` 校验无 diff;若有 diff = 后端改了契约没重跑生成器 = PR block
- 字段命名:**保留 Python 原生 `snake_case`**(API payload / TS 类型同款),前端**禁止**把 `snake_case` 映射成 `camelCase`

### 4. SSE 事件总线模式(非 WebSocket)

- API 设计:**REST + SSE** 组合;SSE 是一等公民,非 fallback
- 每个 run **一个** `asyncio.Queue`(不共享队列,隔离 run);consumer 断开后 Queue 自动清理
- **所有新事件**必须先注册到 `shadowflow/runtime/event_types.py`(集中常量,禁止散落字符串)
- 事件命名空间:`run.* / node.* / policy.* / approval.* / agent.* / handoff.*`(`AR50` 已冻结)
- 前端 `sseClient.ts` 必须带**指数退避重连**(初始 1s,最大 30s)
- 前端 `EventSource` 订阅必须在 `useEffect` cleanup 里 `.close()`(否则泄漏)
- 后端 SSE handler 必须 `logger.exception(trace_id=run.id)` 包裹错误路径

### 5. React / Zustand 状态管理

- Zustand `set` 回调**必须返新对象**(immutable update);需要嵌套更新时用 **Immer**:`set(produce(draft => { ... }))`
- 订阅组件**必须用 selector 精确订阅**:`useStore(s => s.run.status)`,禁止 `useStore()` 拿整个 store(会过度渲染)
- 密钥存储专用 store `useSecretsStore`(AR16),**禁止**混入运行时 store(避免 accidentally 序列化到 trajectory)
- **禁止** `loading = true` 单一 flag 在全局蔓延——每个异步操作自己的 `{status, error, data}` 三元组
- ReactFlow 自定义节点**必须继承** `src/components/workflow/BaseNode.tsx`,不允许从零写(样式/回调约定复用)

### 6. Policy Matrix 真驳回语义(三段闭环)

- 语义链:`policy_matrix.reject` → `approval_gate` 触发 → `checkpoint rollback` 回退
- 驳回**必须穿透多层**(如 Advisor 驳回 Section 退到 Outline,所有中间 step rollback;J2 关键)
- `PolicyMatrixValidator` 在保存时跑 **compile-time validation**,对不推荐关系弹**非阻塞警告**(R3:用户可覆盖,覆盖事件记录到 `memory_event`)
- 运行时真执行:**禁止**用 toast 假装驳回——必须触发 `handoff` 事件 + `retry_loop`
- 运行中修改 Policy Matrix → 必须触发 **re-compile + re-run**(FR9,J3 关键)

### 7. Workflow Assembly 编译链

- 高层积木 → 可运行 workflow 主链:`WorkflowAssemblySpec → assembly/compile.py → WorkflowDefinition`
- 6 个 Block 命中清单:`plan / parallel / barrier / retry_gate / approval_gate / writeback`(TS6 红线,Academic Paper 模板必须全 6 命中)
- 新增 Block 类型必须:(a) 扩 `WorkflowAssemblySpec` schema;(b) 实现 `compile.py` 对应分支;(c) 前端 `src/components/workflow/*Node.tsx` 新节点;(d) 文档更新 `WORKFLOW_SCHEMA.md`
- **禁止**在 `WorkflowDefinition` 层手工拼装,必须经 compile 路径(保证 provenance 可追溯)

### 8. Provider Fallback 安全位

- Provider 5 选 1:**Claude / OpenAI / Gemini / Ollama / 0G Compute**
- Fallback 链配置在 `shadowflow/llm/fallback.py`;超时默认 30s(Claude),失败转下一个
- **S4 强制**:fallback 目标必须是 **no-training tier**(如 Anthropic API 默认 / OpenAI API 默认)或 **Ollama 本地**;禁止送往可能训练的端点
- **R2 强制**:所有 provider 都失败 → **不 crash**,而是 `run.status=paused` + checkpoint + 等待用户手动决策
- Provider Adapter 必须实现统一接口(`ILLMProvider`),**禁止**在业务代码里直接调 SDK
- 所有 async LLM 调用**必须**套 `asyncio.wait_for` 或 `httpx timeout=`(无超时 = PR block)

### 9. Agent Plugin Contract(FR42 / Epic 2)

- 四 kind:`api` / `cli` / `mcp` / `acp`(`AgentExecutor` ABC 四实现)
- YAML 声明方式见 `docs/AGENT_PLUGIN_CONTRACT.md`(Story 2.8 产出,不在 Epic 0 造文档)
- `AgentEvent` 命名空间 `agent.*` 归一化(Story 2.6);所有 kind 的事件必须映射到同一事件结构
- CLI preset 通用化:`ShadowSoul` / `Claude Code` / `Gemini CLI` 走同一 `CliAgentExecutor`(Story 2.5)
- ACP Client(Story 2.3)含 stdio 连接 + session 生命周期 + 异常重连;**工作量过大时必须拆 a/b/c**
- `Hermes claw` SPIKE(Story 2.7 / 应为 Sprint 0 首日):验证可行性后再推进其余 ACP 工作

### 10. Testing Discipline

- 测试文件位置:
  - Python:`tests/` 目录镜像源码结构;命名 `test_*.py`
  - 前端:源码同级 `*.test.ts(x)`(Vitest + Testing Library)
- **pytest-asyncio**:`@pytest.mark.asyncio` 标注异步测试;legacy 测试标 `@pytest.mark.legacy` 隔离
- **禁止在契约冻结对象上 mock**(7+1 对象)——用真实 Pydantic instance;mock 仅限外部 SDK(0G / LLM Provider / HTTP)
- **每个 `model_validator` 必须有对应测试**(正 + 反样例)
- 前端组件测试必须覆盖:(a) happy path(b) 错误态(c) 空数据态;跳过性能测试(E2E 阶段再做)
- 集成测试覆盖跨模块契约(如 SSE 事件 end-to-end),位于 `tests/integration/`
- **禁止**用 `time.sleep` 等异步结果;用 `await asyncio.wait_for` 或 `waitFor` helper

### 11. Naming / Structure / Format

- **Python / 后端 payload**:`snake_case`(Pydantic 原生,API 保留)
- **TS 变量 / 函数**:`camelCase` · **TS 类型 / React 组件**:`PascalCase` · **常量**:`UPPER_SNAKE_CASE`
- **文件命名**:React 组件 `PascalCase.tsx` · 其余 TS `kebab-case.ts` · Python `snake_case.py`
- **路径别名** `@/*` 强制;禁止 `../../../` 深相对路径
- **时间**:后端/存储统一 UTC ISO 8601(带 Z 后缀);前端展示统一走 `formatDate(iso, locale)` 工具(禁止各组件 `toLocaleString()` 散落)
- **Boolean**:JSON 中必须 `true`/`false`;禁止 `"true"` / `1`
- **Null**:Pydantic 默认 `model_dump(exclude_none=True)`;前端不要依赖字段存在(用 optional chaining)
- **OpenAPI**:所有新 endpoint 必须可见;禁用 `include_in_schema=False`(除 health check)

### 12. 关键 Don't-Miss(防踩坑清单)

- ❌ **反向依赖**:Epic 0 Story 0.5(Agent Plugin Contract 文档)已迁至 Epic 2 Story 2.8;**不要**在 Epic 0 造该文档
- ❌ **并行谎言**:Epic 2 依赖 Epic 1 Story 1.2(approval_gate),依赖链是**串行**,不要回 "∥" 表述
- ❌ **PRD PixiJS 话术过时**:用 ReactFlow 原生实现(见 architecture.md line 1157),Pitch 不要说"搬 Shadow PixiJS"
- ❌ **Browser Matrix**:MVP 支持 Chrome/Edge/Arc ≥ 120 + Firefox ≥ 120 + Safari 17+;Safari 下 0G SDK 有潜在坑,Epic 6 收尾必跑冒烟
- ❌ **无 DB 决策**:MVP **不引入** SQLite/PostgreSQL 持久化;state 全在 checkpoint store(Memory/File/0G)——SC2
- ❌ **Tauri / INFT / Semantic Scholar 真 API / 登录系统**:全部 Phase 2/3+,MVP 不做;Scope 防漂移
- ❌ **Accessibility**:A1 要求 WCAG 2.1 AA basic(键盘导航 + 语义 HTML + 对比度 ≥ 4.5:1);颜色仅靠色差的 UI 会踩 A1
- ❌ **前端轻信后端**:API 层 Pydantic `model_validate()` **强制**,不接受"前端已验证"假设(S 层信任不可跨)
- ❌ **绕过 CheckpointStore 抽象**:禁止直接读写文件/HTTP,必须走 `CheckpointStore` 接口(Memory/File/0G 三实现)
- ❌ **破坏 `event_types.py` 单源**:新事件不注册 = 前端盲跑 / grep 不到 / 漂移灾难
- ⚠️ **0G TS SDK 在 Windows 稳定性风险**(PRD 已列中等概率)——本周内必须 smoke test + 预录 demo 视频兜底
- ⚠️ **Sprint 0 首日**:跑 Hermes `claw` SPIKE(Story 2.7 应当作 "Story 2.0")——可行性未证前不推 2.3-2.6

---

## Development Workflow Notes

- **Git**:Epic 分支 `epic/{name}`(不是 per-issue);commit message `Issue #{number}: {description}`;从干净 main 创建
- **PR**:违反模式的 PR 必须在 description 标注 **"Pattern Exception" + 理由**;命名规范由 ruff/eslint 机检,不过 lint 不合并
- **路径规范**(`.claude/rules/path-standards.md`):文档/commit 引用用**相对路径**;不得暴露 `/Users/xxx/` / `C:\Users\xxx\` 等本机路径
- **DateTime**(`.claude/rules/datetime.md`):frontmatter 时间戳必须用 `date -u +"%Y-%m-%dT%H:%M:%SZ"` 实时取,禁止占位/估算
- **GitHub 操作**(`.claude/rules/github-operations.md`):写入 GH(issue / PR / comment)前必须检查 `origin` 不是 `automazeio/ccpm` 模板仓
- **Frontmatter 剥离**:内容发 GH 前必须 `sed '1,/^---$/d; 1,/^---$/d'` 去掉 YAML 头(`.claude/rules/strip-frontmatter.md`)

---

## Quick Reference 表

| 场景 | 规则引用 |
| ---- | -------- |
| 写 0G 代码 | 本文件 §1 + `.0g-skills/CLAUDE.md` + `skills/{category}/{skill}/SKILL.md` |
| 改 Runtime 契约 | 本文件 §2-3 + `docs/RUNTIME_CONTRACT_SPEC.md` + 跑 `generate_ts_types.py` |
| 写 SSE 事件 | 本文件 §4 + `event_types.py` 注册 + `sseClient.ts` 指数退避 |
| 写 React 组件 | 本文件 §5 + `BaseNode.tsx` 继承 + Zustand selector 精确订阅 |
| 写 Policy Matrix | 本文件 §6 + `docs/SHADOW_AGENTGRAPH_RESPONSIBILITY_MATRIX.md` |
| 写 Workflow Block | 本文件 §7 + `docs/WORKFLOW_SCHEMA.md` + 扩 `compile.py` |
| 接 LLM Provider | 本文件 §8 + `llm/fallback.py` + `ILLMProvider` 接口 |
| 接 Agent kind | 本文件 §9 + Story 2.8 的 `docs/AGENT_PLUGIN_CONTRACT.md` |
| 写测试 | 本文件 §10 + `pyproject.toml [tool.pytest.ini_options]` markers |
| 踩坑排查 | 本文件 §12 |

---

## Usage Guidelines

**For AI Agents:**

- 实施任何代码前先读本文件;遇冲突时以**本文件 §1-12 > architecture.md > 框架默认**为序
- 违反 §1(0G 红线)或 §2(Runtime 契约)= 数据损坏 / 合规事故,必须停手
- 不确定时选**更严格**选项;`.0g-skills/` 下 `SKILL.md` 是 0G 场景的具体 playbook

**For Humans(Jy 及协作者):**

- 本文件定位:**非显而易见规则**的单源(可机检项如 ruff/eslint 不收录)
- 当 Pydantic 契约 / event_types / AR 编号 / Epic 依赖链变动 → 同步更新
- Sprint 1 末 review,删除已变成"显而易见"的条款(保持精简)
- 与 CLAUDE.md 互补:CLAUDE.md 是路由与优先级,本文件是规则体

## Document History

- 2026-04-16 · v1.0 · 首次生成(GPC step-01 discovery + step-02 全 12 章一次性生成 + step-03 finalize)
