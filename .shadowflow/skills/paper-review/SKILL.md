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

本 skill 是一个 **Team Blueprint**——通过 `team_ref: paper-review` 引用全局 team 库（`.shadowflow/teams/paper-review.team.yaml`），agent 内容来自全局 agent 库（`.shadowflow/agents/{coord,reader,critic,writer}.agent.yaml`）。

前端 AgentDetail v3 stacked 视图会显示 `from <agent>.agent.yaml#<slot>` 的溯源标，让用户知道 persona / model / tools 都不是 LLM 现造的，而是从 yaml cache 取出来的。

## 用户场景

何时启用本 skill：

- "审一下这篇 arXiv 论文"
- "评审这篇 NeurIPS 论文，重点 methodology"
- "给我读这篇 paper 的 contribution"
- "帮我看下这篇论文的 related work 站得住吗"
- 关键词：论文 / paper / arxiv / review / 评审 / 审稿 / NeurIPS / ICML / ICLR

不适用（应拒绝并改建议其他 skill）：

- 写综述 / literature review（应用 literature-survey skill）
- 翻译论文（应用 translator skill）
- 写自己的论文（应用 paper-writer skill）
- 通用阅读笔记（无需 4-agent 编排，单 agent 即可）

## 工作流（三相位）

本 skill 严格遵循 S7 multi-turn prompt 的三相位规约。每一相位都以 `<sf:phase>` 起、以 `<sf:step>` 收。

### Phase 1 · 分析（list_team_agents）

1. 读 user goal，判断是不是"审论文"类场景。
2. **不合适** → 用中文一句话拒绝 + 建议换 skill；不要继续后续 phase。
3. **合适** → 调 `list_team_agents(skill_id='paper-review')`，拿到本 team 全部可用 agent（coord / reader / critic / writer）+ 它们的 slot 清单。
4. emit `<sf:step name="分析用户意图" status="done">`，简述选了哪几个 agent 以及理由（一两句话，不要长段铺垫）。

### Phase 2 · agent（per-agent 5 substep）

对每个**决定启用**的 agent（按 goal 缩——不必 4 个全上）：

1. emit `<sf:agent-substep node_id="<agent>" substep="identity" status="running">`
2. 调 `get_skill_anchor(skill_id='paper-review', agent_id='<agent>', slot='identity')` 取 yaml 原文 verbatim。
3. 对 `persona` / `model` / `tools` / `memory` 重复上面两步（共 5 个 substep）。
4. 当 5 个 slot 都取齐，调 `register_agent({ node_id, identity, persona, persona_source, persona_tokens, persona_cached: true, model, tools, memory })` 把 agent 加入 team。
5. emit `<sf:agent-substep node_id="<agent>" substep="<slot>" status="done">` 收每个 substep。

**未启用**的 agent emit `<sf:agent-substep node_id="<agent>" substep="identity" status="pending">`，让前端 AgentDetail 用灰色显示——告诉用户这个角色存在但本次没用到。

### Phase 3 · team（register_edge × N + complete）

1. 按 Phase 1 选定的子集，调 `register_edge({ from, to, kind: 'sequential' | 'conditional', condition?, max_retries? })` 把 edge 一条条建出来。
2. 全部 edge 建完后 emit `<sf:step name="配置 Team Workflow" output_kind="edges" status="done">`。
3. 最后 emit `<sf:complete redirect="/editor">` 收尾，前端会跳到 Team Editor。

## ALWAYS

- `agent.persona` / `model` / `tools` 内容必须来自 `get_skill_anchor` 返回值，**逐字 verbatim**，不要 paraphrase 让它"更流畅"。
- `register_agent` 入参必带 `persona_source`（如 `reader.agent.yaml#persona`）+ `persona_tokens` + `persona_cached: true`，表明来自 cache 而非现造。
- `model.id` 与 yaml 一致（reader → `claude-sonnet-4`，critic → `claude-sonnet-4`，writer → `claude-haiku-4` 等，以 yaml 为准）。
- emit 顺序严格按三相位 Phase 1 → Phase 2 → Phase 3，不要乱序。
- 每个启用的 agent 必须 emit 全部 5 个 substep（identity / persona / model / tools / memory）。

## NEVER

- 不要造 yaml 里没有的 agent（如"测试主管"、"论文翻译官"——本 team 只有 coord / reader / critic / writer 4 个）。
- 不要 paraphrase persona——用户要看的就是 yaml 原文。
- 不要无依据缩 tool list（reader 缺 `pdf_extract` 直接跑不了，critic 缺 `citation_check` 评不了 reference 质量）。
- 不要把 4 个 agent 全部 hard-code 启用——按 goal 决定子集。
- 不要跳 substep——每个启用的 agent 5 个 substep 全要 emit（要么 running/done，要么 pending）。
- 不要在 Phase 1 就 register_agent，那是 Phase 2 的事。

## 示例 · "审一篇 NeurIPS 论文 methodology" goal

LLM 决策：

- **启用 reader**：要从 PDF 提 methodology section，必需。
- **启用 critic**：methodology 重点要 critic 把关 baseline / metric 合理性。
- **跳 writer**：用户没要"写 review 文档"输出，只是看 methodology。
- **跳 coord**：单流量直接 pipeline（reader → critic），不需要 orchestrator。

emit edges：`reader → critic`（kind: sequential）。

最终 team 输出：2 个 active agent + 2 个 pending（writer / coord 灰色）+ 1 条 edge。
