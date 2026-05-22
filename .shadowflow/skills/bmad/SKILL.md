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
allowed-tools: []
---

<!--
Phase 2 (2026-05-22): switched from tool_use orchestration to daemon-led
artifact handoff. Per orchestration-transport.md §"Phase 2 Eng Review"
decisions A2/A3/CL6, the daemon now drives team execution: it parses
team.yaml + agent.yaml, builds the DAG with workflow/scheduler.ts, and
emits <sf:node>/<sf:edge> SSE frames itself. The 4 SkillAnchorTool
references (list_team_agents / get_skill_anchor / register_agent /
register_edge) have been removed — they are no longer LLM-callable here.
The LLM acts as the agent the daemon scheduled and exchanges work via
artifact files (docs/brief.md → docs/architecture.md → ...).
-->

# BMAD 四角全栈团队 Skill

本 skill 是一个 **Team Blueprint**——通过 `team_ref: BMAD-METHOD` 引用全局 team 库（`.shadowflow/teams/BMAD-METHOD.team.yaml`），agent 内容来自全局 agent 库（`.shadowflow/agents/{pm,arch,dev,qa}.agent.yaml`）。

BMAD 是经典软件研发四角组合：PM 定需求 → Architect 出方案 → Dev 写代码 → QA 验质量，配合 `qa → dev (bug_found, max_retries:3)` 的回路。

daemon 负责把 yaml 解析、建图、发节点蓝图帧；agent LLM 只在自己被调度的那一步发 substep 帧、读上游 artifact、写下游 artifact。前端 AgentDetail v3 stacked 视图显示 `from <agent>.agent.yaml#<slot>` 的溯源标，让用户知道 persona / model / tools 是从 yaml cache 取出来的、不是 LLM 现造的。

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

## 编排模型（daemon-led + artifact handoff）

daemon 在 LLM 跑之前完成：

1. 读 `.shadowflow/teams/BMAD-METHOD.team.yaml`，按 user goal 决定启用哪几个 agent（4 个全上 vs 只 pm+arch 等）。
2. 从 `.shadowflow/agents/{pm,arch,dev,qa}.agent.yaml` 加载 persona / model / tools / memory 文本，作为各 agent LLM turn 的 system prompt 上下文。
3. 用 `workflow/scheduler.ts` 跑 DAG，按拓扑顺序调度每个 agent；conditional 边（如 `qa → dev (bug_found, max_retries:3)`）由 `workflow/condition.ts` 求值。
4. 每个节点开始时 emit `<sf:node>`，每条边 emit `<sf:edge>`，未启用的 agent emit pending `<sf:agent-substep>`。前端 AgentDetail 据此渲染。

agent LLM 在被调度的 turn 内只做三件事：

1. emit 自己的 5 个 substep 帧（identity → persona → model → tools → memory，每个一对 running/done）。
2. 读 system prompt 指定的上游 artifact 文件（例：`docs/brief.md`）。
3. 按 persona 工作，把产出写到 system prompt 指定的下游 artifact 文件（例：`docs/architecture.md`）。

完整 BMAD 串：`docs/brief.md` (pm) → `docs/architecture.md` (arch) → `docs/impl/` (dev) → `docs/qa-report.md` (qa)。`qa → dev` 回路在 qa-report 标记 `bug_found: true` 时由 scheduler 触发 dev 重跑。

## 协议 / 事件（XML tag）

LLM 在自己 turn 里可 emit 的协议帧（这些是事件协议，不是工具调用）：

- `<sf:thinking step="...">...</sf:thinking>` — 思考块
- `<sf:agent-substep node_id="..." substep="..." status="running|done" source="..." tokens="..." cached="true"/>` — 5 substep 推进帧
- `<sf:step name="..." output_kind="..." status="..."/>` — 步骤起止帧
- `<artifact path="...">...</artifact>` — 写文件（runtime 负责落盘到 workspace）

LLM **不可** emit 的（由 daemon 负责）：

- `<sf:node>` / `<sf:edge>` — daemon 建图时已经发完
- `<sf:agent-persona>` — daemon 用 agent.yaml 直接喂 system prompt

## ALWAYS

- 5 个 substep 顺序固定：identity → persona → model → tools → memory；每个 substep 必须一对 running + done 帧。
- substep done 帧的 `source` / `tokens` / `cached` 必须填 daemon 在 system prompt context 里提供的 anchor 元数据（例：`source="pm.agent.yaml#persona"`），不要瞎编。
- 上游 artifact 文件路径以 system prompt 提供的为准，读到后才开始正式产出。
- 下游 artifact 文件路径以 system prompt 提供的为准，必须严格写到那个路径，DAG scheduler 靠它把成果传给下一节点。
- `model.id` 必须与 yaml 一致（pm → `claude-sonnet-4`，arch → `claude-sonnet-4`，dev → `claude-sonnet-4`，qa → `claude-haiku-4` 等，以 daemon context 提供的为准）。

## NEVER

- 不要尝试 emit `<sf:node>` / `<sf:edge>` —— daemon 已经发完，重复 emit 会让前端节点列表重复渲染。
- 不要尝试调用 `list_team_agents` / `get_skill_anchor` / `register_agent` / `register_edge` 工具 —— 它们不存在于本 skill 的可用工具集（`allowed-tools: []`）。
- 不要 paraphrase persona / model / tools / memory 文本 —— daemon 已经把 yaml verbatim 喂给你的 system prompt，你只需"按这个身份工作"，不要复读或改写。
- 不要造 yaml 里没有的角色（如"测试主管"、"前端 lead"——本 team 只有 pm / arch / dev / qa 4 个）。
- 不要把 artifact 写到 system prompt 指定路径之外的地方，scheduler 找不到就断流水线。
- 不要在 `qa-report.md` 里隐藏 bug 让流水线提前完成 —— `qa → dev` 回路靠 `bug_found` 字段触发，掩盖会让用户拿不到该有的修复 turn。

## 示例 · "搭一个用户登录功能的研发团队" goal

daemon 决策（基于 goal 和 team.yaml）：启用全部 4 个 agent，DAG 为 `pm → arch → dev → qa` + 回路 `qa → dev`。

执行顺序：

1. **pm turn**：读 user goal，产出 `docs/brief.md`（user story + 验收标准）。emit 5 substep 帧。
2. **arch turn**：读 `docs/brief.md`，产出 `docs/architecture.md`（JWT / session / OAuth2 选型 + DB schema）。
3. **dev turn**：读 `docs/architecture.md`，产出 `docs/impl/`（API + 前端代码片段，写入 artifact 目录）。
4. **qa turn**：读 `docs/architecture.md` + `docs/impl/`，产出 `docs/qa-report.md`（回归 + 安全测试结果）。
5. 若 `qa-report.md` 标 `bug_found: true`，scheduler 触发 `qa → dev` 回路，dev 重跑（最多 3 次）。

最终 team 输出：4 个 active agent + 0 个 pending + 完整 artifact 链 + qa-report 决定的 success/retry 状态。

## 示例 · "只想看一下登录功能的架构方案" goal

daemon 决策：只启用 pm + arch，DAG 为 `pm → arch`，dev / qa pending。

执行顺序：

1. **pm turn**：读 user goal，产出 `docs/brief.md`。
2. **arch turn**：读 `docs/brief.md`，产出 `docs/architecture.md`。
3. dev / qa 节点 daemon emit pending 灰色状态，未实际触发 LLM turn。

最终 team 输出：2 个 active agent + 2 个 pending（dev / qa 灰色）+ 1 个 artifact 链（brief → architecture）。
