# server/

Node + TypeScript backend (port 8002). 负责 SSE streaming、tool dispatch、
skill / agent / team 数据层、Anthropic / GLM / OpenAI BYOK provider 路由。

## 启动

```bash
npm run dev:server     # tsx watch，自动重载
cd server && npx tsc --noEmit  # 类型检查（无 emit）
```

## 子目录

- `src/lib/`     — 核心抽象：ConversationRuntime / Tool / Permission / Session / Skill yaml loaders
- `src/routes/`  — Express HTTP 路由（/api/run-sessions, /api/teams/:id/dag, /api/skills, /api/agents）
- `src/prompts/` — S7 三相位 multi-turn prompt 文件（phase-1 / phase-2 / phase-3 + index）
- `src/loaders/` — SKILL.md / design-system 文件加载器
- `src/storage/` — sqlite 存储层（agents / runs / settings / sessions）
- `src/llm-providers/` — anthropic / glm / openai SDK 适配
- `src/lib/api-clients/` — ApiClient interface 实现（anthropic-api-client.ts 是 S6 主路径）
- `src/lib/tools/` — SkillAnchorTool 集（list_team_agents / get_skill_anchor / register_agent / register_edge）

## 跨边界规则

- 不直接访问 `src/` 前端代码
- 通过 SSE event 与前端通信（参考 `parser.ts` 的 `<sf:*>` 标签集 + `src/api/runSessions.ts` 的 EventSource listeners）
- 数据持久化通过 `.shadowflow/` 子目录（sqlite + json + yaml）
- 不要在 routes/ 写复杂业务逻辑——分到 lib/ 或 storage/

## 关键文件

- `src/assembler.ts` — runSkillAssembler 主入口，team-backed skill 走 ConversationRuntime，否则 legacy 单 call
- `src/parser.ts` — `<sf:*>` 标签流式解析（D7 拆分待做）
- `src/prompt-assembly.ts` — S8 boundary marker + layered prompt 组装
- `src/lib/conversation-runtime.ts` — S5 16→50 turn agentic loop
- `src/lib/skill-yaml.ts` / `agent-yaml.ts` / `team-yaml.ts` — 全局 yaml 库加载器（S0.5）

## 不要碰

- `.shadowflow/sessions/` / `.shadowflow/projects/` — 运行时状态，sqlite + json file backed
- 不要把 `.shadowflow/agents/*.agent.yaml` / `*.team.yaml` 改名（用户手编源材料）
