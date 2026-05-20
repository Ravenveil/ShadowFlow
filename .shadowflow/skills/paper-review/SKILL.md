---
name: 论文评审团队
description: 4-agent 学术论文评审流水线 (reader → critic → writer)，基于 BMAD 编排模式
mode: blueprint
preview_type: yaml
platform: web
scenario: research
fidelity: high
team_ref: paper-review
example_prompt: "审一下这篇 arXiv 论文，重点看 methodology 部分"
allowed-tools:
  - list_team_agents
  - get_skill_anchor
  - register_agent
  - register_edge
---

# 论文评审团队 Skill

这个 skill 提供一个完整的 4 角色团队蓝图（reader / critic / synthesizer / writer），通过 `team_ref: paper-review` 引用全局 team 库（`.shadowflow/teams/paper-review.team.yaml`）。

agent 内容来自全局 agent 库（`.shadowflow/agents/*.agent.yaml`），前端 AgentDetail v3 stacked 视图显示 `from <agent>.agent.yaml#<slot>` 的溯源标。

## Workflow（三相位）

Phase 1 · 分析：读 goal，判断是否真的需要团队评审。如不合适回单句拒绝。
Phase 2 · agent：通过 `list_team_agents` + `get_skill_anchor` 取 yaml 原文，调 `register_agent` 把 agent 加入 team。注意按 goal 挑选 agent 子集（不必 4 个全用）。
Phase 3 · team：根据 phase 2 加入的 agent，调 `register_edge` 拼出 workflow。emit `<sf:complete>` 收尾。

## ALWAYS
- agent.persona 必须来自 `get_skill_anchor` 返回值（cached=true）
- model.id 直接抄 skill yaml，不要凭意改动

## NEVER
- 不要造 yaml 里没有的 agent
- 不要 paraphrase persona 让它"更流畅"
- 不要 hard-code 全部 4 agent 都启用——按 goal 决定
