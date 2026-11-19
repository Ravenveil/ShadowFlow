# backend/node — Node 网关

Node + TypeScript 后端（端口 8002）。负责 SSE streaming、tool dispatch、
skill / agent / team 数据层、Anthropic / GLM / OpenAI BYOK provider 路由。

**架构与目录是硬约束**：改代码前先读仓库根 [ARCHITECTURE.md](../../ARCHITECTURE.md)
（域包四件套、三问自检、放置决策树、红线）。样板域见 `src/domains/memory/README.md`。

## 启动

```bash
npm run dev:server          # 根部启动器；或在本目录 npx tsx src/index.ts
npx tsc --noEmit            # 类型检查（无 emit）
npx vitest run              # 全量测试
```

## 子目录

按功能域组织（2026-11-06 归位；域内细节见各目录 AGENTS.md）：

- `src/domains/` — ★ 业务域，分层为 `model` / `repository` / `infra` / `use_cases` / `adapters`（规范见 ARCHITECTURE.md）
- `src/routes/`  — Express HTTP 路由，按功能域分子目录：`runs/` `memory/` `groups/` `skills/` `agents/` `dashboard/` `projects/` `knowledge/` `system/`（见 `src/routes/AGENTS.md`）
- `src/lib/`     — 核心抽象（纯逻辑）：ConversationRuntime / Tool / Permission / Session / Skill yaml loaders
- `src/storage/` — sqlite 存储层（agents / runs / settings / sessions）+ Python 落库客户端（team-persistence / groups-backend）；**已迁移到 domains 的模块在此只剩兼容层**
- `src/assembly/` — 组装域：recipe 选择（`select.ts` / `rules/` / `skills/`）+ runSkillAssembler（`assembler.ts`）
- `src/quality/` — artifact 质检：静态 lint（`lint.ts`）+ 自动 critique（`critic.ts`）
- `src/parsers/` — `<sf:*>` 标签流式解析（`parser.ts`）+ CLI 流格式（`cli-streams/`）
- `src/prompts/` — S7 三相位 multi-turn prompt + S8 prompt 洋葱（`prompt-assembly.ts` + charters）
- `src/detectors/` — 本地 CLI / ACP 探测（`cli-registry.ts` / `cli-detector.ts` / `acp-detector.ts`）
- `src/loaders/` — skill / design-system 注册表（`skills.ts` / `design-systems.ts`）+ FS 加载器
- `src/transport/` — LLM / CLI / MCP / ACP 调用通道（`api-clients/` / `spawners/` / dispatcher）
- `src/workflow/` — DAG 调度执行（scheduler / executor / retry）
- `src/exporters/` — markdown / pdf 导出；`src/protocols/` — jsonrpc-stdio；`src/skill-ingest/` `src/skill-reader/` — skill 摄取与读取

测试布局：vitest 门禁只收 `src/__tests__/`；其余 colocated `*.test.ts` 也在 `npx vitest run` 全量里。

## 跨边界规则

- 不直接读写 `frontend/src/` 前端代码（跨栈只经 HTTP / SSE）
- 通过 SSE event 与前端通信（参考 `parsers/parser.ts` 的 `<sf:*>` 标签集 + `frontend/src/api/runSessions.ts` 的 EventSource listeners）
- 数据持久化通过 `.shadowflow/` 子目录（sqlite + json + yaml）
- `routes/` 只做 HTTP 薄壳：**业务规则进 `domains/<域>/model`，用例编排进 `use_cases`**；
  `lib/` 只放跨域通用抽象，`storage/` 只放 SQL / 落盘细节（判据见 ARCHITECTURE.md §3 §5）

## 关键文件

- `src/assembly/assembler.ts` — runSkillAssembler 主入口，team-backed skill 走 ConversationRuntime，否则 legacy 单 call
- `src/parsers/parser.ts` — `<sf:*>` 标签流式解析（D7 拆分待做）
- `src/prompts/prompt-assembly.ts` — S8 boundary marker + layered prompt 组装
- `src/lib/conversation-runtime.ts` — S5 16→50 turn agentic loop
- `src/lib/skill-yaml.ts` / `agent-yaml.ts` / `team-yaml.ts` — 全局 yaml 库加载器（S0.5）

## 不要碰

- `.shadowflow/sessions/` / `.shadowflow/projects/` — 运行时状态，sqlite + json file backed
- 不要把 `.shadowflow/agents/*.agent.yaml` / `*.team.yaml` 改名（用户手编源材料）
