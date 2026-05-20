# server/src/prompts/

S7 三相位 multi-turn prompt 拆分（参考 open-design `apps/daemon/src/prompts/`）。每个 phase 一个文件，纯字符串导出。

## 文件

- `phase-1-analyze.ts` — Team-first phase 1：调 `list_team_agents` → 决定子集 → emit "分析目标需求" + "挑选 Team 蓝图" steps
- `phase-1-analyze-agent-first.ts` — Agent-first 变体：goal-driven 推 agent，跳「挑选 Team 蓝图」
- `phase-2-agent.ts` — per-agent 5 substep (identity/persona/model/tools/memory)，每 substep 调 `get_skill_anchor` + `register_agent`
- `phase-3-team.ts` — 设置工具集 + Policy 协作规则 + 配置 Team Workflow，调 `register_edge` × N + emit `<sf:complete>`
- `index.ts` — `composeMultiTurnPrompt(flow: 'team-first' | 'agent-first')` 拼装；含 `ASSEMBLER_HEADER`（身份 + 4 tool 目录 + 引用纪律）

## 触发方式

`server/src/assembler.ts` 在 team-backed skill 路径下调 `composeMultiTurnPrompt`：
- `skill.team` 存在 + `provider === 'anthropic'` → 走 multi-turn
- 否则 → 走 legacy 单 call 路径（旧 `AGENT_TEAM_BLUEPRINT_PROMPT` from skills.ts）

`routes/run-sessions.ts` 根据 `teamSpec` 是否存在自动选 flow：
- 有 teamSpec（BMAD/paper-review 等）→ team-first
- 无 teamSpec（裸 agent-team-blueprint）→ agent-first

## 5-step v3 命名（重要）

LLM emit 的 `<sf:step name="...">` 必须是这 5 个之一：

1. 分析目标需求
2. 挑选 Team 蓝图 (team-first only) / 跳过 (agent-first)
3. 配置 Agent 角色
4. 设置工具集
5. Policy 协作规则

前端 `src/core/hooks/useFollowMode.ts` STEP_TO_TAB 映射必须同步。改 prompt step name = breaking change。

## 跨边界规则

- 纯字符串 / 模板。**不导入** runtime / tool / SDK
- 修改 prompt 前先看 D2/D3/D7 相关 design doc 决议
- ALWAYS / NEVER 段是硬约束，对应 design doc §4.3 「引用 vs 创造」
