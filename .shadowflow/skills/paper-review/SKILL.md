---
name: 论文评审团队
description: 4-agent 学术论文评审流水线 (reader → critic → writer)，基于 BMAD 编排模式
mode: blueprint
preview_type: yaml
platform: web
scenario: research
fidelity: high
example_prompt: "审一下这篇 arXiv 论文，重点看 methodology 部分"
---

# 论文评审团队 Skill

这个 skill 提供一个完整的 4 角色团队蓝图（reader / critic / synthesizer / writer），从 team.skill.yaml 直接派生，跳过 LLM 生成。

每个 agent 的 persona / model / tools / memory / io 都来自独立的 `<agent>.skill.yaml` 文件，前端 AgentDetail v3 stacked 视图会显示 `from <agent>.skill.yaml#<slot>` 的溯源标。
