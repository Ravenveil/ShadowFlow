---
name: BMAD 四角全栈团队
description: PM → Architect → Dev → QA 串行流水线，BMAD 经典 4 角组合
mode: blueprint
preview_type: yaml
platform: web
scenario: software
fidelity: high
team_ref: bmad
example_prompt: "用 BMAD 4 角搭一个用户登录功能的研发团队"
allowed-tools:
  - list_team_agents
  - get_skill_anchor
  - register_agent
  - register_edge
---

# BMAD 四角全栈团队 Skill

通过 `team_ref: bmad` 引用全局 team 库（`.shadowflow/teams/bmad.team.yaml`）。

agent 内容来自全局 agent 库（pm / arch / dev / qa 各 `.shadowflow/agents/*.agent.yaml`）。

## Workflow（三相位）

Phase 1 · 分析：读 goal，确认是软件研发场景。如果不是，回单句澄清。
Phase 2 · agent：通过 `list_team_agents` + `get_skill_anchor` 取 yaml 原文，调 `register_agent` 把 agent 加入 team。可按 goal 缩减（如纯前端任务可跳过 arch）。
Phase 3 · team：调 `register_edge` 拼 pipeline，pm → arch → dev → qa。emit `<sf:complete>`。

## ALWAYS
- agent.persona / model 来自 `get_skill_anchor` 返回值（cached=true）

## NEVER
- 不要造 yaml 里没有的角色（如"测试主管"——只有 qa）
- 不要 paraphrase persona
- 不要无依据缩 tool list（dev 缺 code_interpreter 就跑不动）
