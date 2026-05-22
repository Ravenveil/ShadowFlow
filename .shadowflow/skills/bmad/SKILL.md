---
name: BMAD 四角全栈团队
description: PM → Architect → Dev → QA 串行流水线，BMAD 经典 4 角组合
mode: blueprint
preview_type: yaml
platform: web
scenario: software
fidelity: high
team_ref: BMAD-METHOD
example_prompt: "用 BMAD 4 角搭一个用户登录功能的研发团队"
allowed-tools:
  - list_team_agents
  - get_skill_anchor
  - register_agent
  - register_edge
---

# BMAD 四角全栈团队 Skill

本 skill 是一个 **Team Blueprint**——通过 `team_ref: BMAD-METHOD` 引用全局 team 库（`.shadowflow/teams/BMAD-METHOD.team.yaml`），agent 内容来自全局 agent 库（`.shadowflow/agents/{pm,arch,dev,qa}.agent.yaml`）。

BMAD 是经典软件研发四角组合：PM 定需求 → Architect 出方案 → Dev 写代码 → QA 验质量，配合 `qa → dev (bug_found, max_retries:3)` 的回路。

前端 AgentDetail v3 stacked 视图会显示 `from <agent>.agent.yaml#<slot>` 的溯源标，让用户知道 persona / model / tools 都不是 LLM 现造的，而是从 yaml cache 取出来的。

## 用户场景

何时启用本 skill：

- "搭一个 X 功能的研发团队"
- "用 BMAD 4 角做 Y"
- "帮我做这个 feature 的 PRD + 架构 + 实现"
- "我要一个软件研发流水线"
- 关键词：研发 / 开发 / feature / BMAD / PRD / 架构 / 实现 / 测试 / 全栈

不适用（应拒绝并建议其他 skill）：

- 单纯需求评审 / PRD 撰写（用 product-review skill，无需 dev/qa）
- 单纯架构评审（用 plan-eng-review skill）
- bug 排查（用 debug-pipeline skill）
- 数据分析 / 论文阅读 / 写作（明显不是软件研发场景）

## 工作流（三相位）

本 skill 严格遵循 S7 multi-turn prompt 的三相位规约。每一相位都以 `<sf:phase>` 起、以 `<sf:step>` 收。

### Phase 1 · 分析（list_team_agents）

1. 读 user goal，确认是软件研发场景。
2. **不合适** → 用中文一句话拒绝 + 建议换 skill；不要继续后续 phase。
3. **合适** → 调 `list_team_agents(skill_id='bmad')`，拿到本 team 全部可用 agent（pm / arch / dev / qa）+ 它们的 slot 清单。
4. emit `<sf:step name="分析用户意图" status="done">`，简述选了哪几个 agent 以及理由（"前端小改动只需要 pm + dev"或"完整 feature 需要 4 角全上"）。

### Phase 2 · agent（per-agent 5 substep）

对每个**决定启用**的 agent（按 goal 缩——不必 4 个全上）：

1. emit `<sf:agent-substep node_id="<agent>" substep="identity" status="running">`
2. 调 `get_skill_anchor(skill_id='bmad', agent_id='<agent>', slot='identity')` 取 yaml 原文 verbatim。
3. 对 `persona` / `model` / `tools` / `memory` 重复（共 5 个 substep）。
4. 当 5 个 slot 都取齐，调 `register_agent({ node_id, identity, persona, persona_source, persona_tokens, persona_cached: true, model, tools, memory })` 把 agent 加入 team。
5. emit `<sf:agent-substep node_id="<agent>" substep="<slot>" status="done">` 收每个 substep。

**未启用**的 agent emit `<sf:agent-substep node_id="<agent>" substep="identity" status="pending">`，让前端 AgentDetail 用灰色显示——告诉用户这个角色存在但本次没用到。

### Phase 3 · team（register_edge × N + complete）

1. 按 Phase 1 选定的子集，调 `register_edge({ from, to, kind: 'sequential' | 'conditional', condition?, max_retries? })` 把 edge 一条条建出来。完整 BMAD 流水线包含：
   - `pm → arch`（sequential）
   - `arch → dev`（sequential）
   - `dev → qa`（sequential）
   - `qa → dev`（conditional, condition: `bug_found`, max_retries: 3）
2. 全部 edge 建完后 emit `<sf:step name="配置 Team Workflow" output_kind="edges" status="done">`。
3. 最后 emit `<sf:complete redirect="/editor">` 收尾，前端会跳到 Team Editor。

## ALWAYS

- `agent.persona` / `model` / `tools` 内容必须来自 `get_skill_anchor` 返回值，**逐字 verbatim**，不要 paraphrase 让它"更流畅"。
- `register_agent` 入参必带 `persona_source`（如 `pm.agent.yaml#persona`）+ `persona_tokens` + `persona_cached: true`，表明来自 cache 而非现造。
- `model.id` 与 yaml 一致（pm → `claude-sonnet-4`，arch → `claude-sonnet-4`，dev → `claude-sonnet-4`，qa → `claude-haiku-4` 等，以 yaml 为准）。
- emit 顺序严格按三相位 Phase 1 → Phase 2 → Phase 3，不要乱序。
- 每个启用的 agent 必须 emit 全部 5 个 substep（identity / persona / model / tools / memory）。
- `qa → dev` 这条回路 edge 必须带 `condition: 'bug_found'` 和 `max_retries: 3`，与 team yaml 一致。

## NEVER

- 不要造 yaml 里没有的角色（如"测试主管"、"前端 lead"——本 team 只有 pm / arch / dev / qa 4 个）。
- 不要 paraphrase persona——用户要看的就是 yaml 原文。
- 不要无依据缩 tool list（dev 缺 `code_interpreter` 跑不了代码，qa 缺 `test_runner` 验不了功能）。
- 不要把 4 个 agent 全部 hard-code 启用——按 goal 决定子集，纯前端小改可以跳 arch。
- 不要跳 substep——每个启用的 agent 5 个 substep 全要 emit（要么 running/done，要么 pending）。
- 不要在 Phase 1 就 register_agent，那是 Phase 2 的事。
- 不要忽略 `qa → dev` 回路 edge，这是 BMAD 区别于"瀑布流"的核心。

## 示例 · "搭一个用户登录功能的研发团队" goal

LLM 决策：

- **启用 pm**：要把"用户登录"拆成 user story / 验收标准。
- **启用 arch**：要定鉴权方案（JWT / session / OAuth2）+ DB schema。
- **启用 dev**：要落地 API + 前端。
- **启用 qa**：要回归 + 安全测试（弱密码 / 暴破 / token 过期）。

emit edges：`pm → arch → dev → qa`（sequential 3 条）+ `qa → dev`（conditional, bug_found, max_retries:3）。

最终 team 输出：4 个 active agent + 0 个 pending + 4 条 edge。

## 示例 · "只想看一下登录功能的架构方案" goal

LLM 决策：

- **启用 pm**：仍需要明确需求边界（哪些是必需，哪些是 nice-to-have）。
- **启用 arch**：核心交付物。
- **跳 dev**：用户没要"落地代码"。
- **跳 qa**：用户没要"测试方案"。

emit edges：`pm → arch`（sequential）。

最终 team 输出：2 个 active agent + 2 个 pending（dev / qa 灰色）+ 1 条 edge。
