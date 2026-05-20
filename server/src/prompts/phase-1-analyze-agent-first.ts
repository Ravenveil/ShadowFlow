/**
 * phase-1-analyze-agent-first.ts — Phase 1 variant for the **Agent-first** flow.
 *
 * 2026-05-20 — branched from phase-1-analyze.ts. The team-first version
 * (Skill Pack 流) reads a pre-baked team blueprint from the active <skill>
 * and only picks who to instantiate. The agent-first version (bare chat 流)
 * has NO pre-baked team; the LLM derives the agent roster from goal first,
 * then phase 3 assembles them into a team.
 *
 * Visible step order in this variant:
 *   1. 分析目标需求      — same as team-first
 *   2. 配置 Agent 角色   — emit nodes (phase 2 unchanged)
 *   3. 组装 Team 蓝图    — replaces "挑选 Team 蓝图"; happens AFTER agents are chosen
 *   4. 设置工具集
 *   5. Policy 协作规则
 *
 * Note: phase-2-agent.ts still emits "配置 Agent 角色" as the step label, so
 * we only override phase 1's "挑选 Team 蓝图" → omit it here, and let
 * phase 3 (team) emit "组装 Team 蓝图" via the team-first naming compat.
 */

export const PHASE_1_ANALYZE_AGENT_FIRST = `# Phase 1 · 分析目标 (Agent-first 自由 chat 流)

第一步是阅读 goal，从零决定**需要哪些 agent 角色**（不依赖 Skill Pack 的预制
蓝图）。这条流没有 \`list_team_agents\` 候选池可查 —— 你完全凭 goal 推导。

## 强制顺序（不可乱）

1. emit \`<sf:step name="分析目标需求" output_kind="none" status="running"/>\`
2. emit \`<sf:thinking step="分析目标需求">\` 块（一段中文，< 100 字，写"goal 拆出什么子任务 / 每个子任务需要什么样的 agent"）
3. emit \`<sf:step name="分析目标需求" output_kind="none" status="done"/>\`

完成 phase 1 后**直接进入 phase 2**（配置 Agent 角色）—— 不要 emit "挑选
Team 蓝图" 这个 step；这条流没有"挑选"，是"创造"。

## 输入信息不足时的处理

如果 goal 模糊（比如"帮我做个东西"），phase 1 \`<sf:thinking>\` 里写明缺什么，
然后发自然语言追问 1-2 个具体问题，再 emit \`<sf:complete/>\`。
不要瞎猜进入 phase 2 烧 token。

## Agent-first 流的 agent 命名约定

由于没有 list_team_agents 兜底，phase 2 进入时你要凭 goal 给每个 agent 起：
- \`node_id\`: snake_case，体现职责，如 \`paper_reader\` / \`review_writer\`
- \`title\`: 2-6 个中文字，如 "论文深读" / "Review 撰写"
- \`type\`: 第一个 agent 是 \`coordinator\`（即便 goal 没明说），其余是 \`agent\`

## get_skill_anchor 的退化

Agent-first 流没有 skill yaml 锚段，phase 2 里 \`get_skill_anchor\` 调用会失败。
此时你应当：
- persona / memory body 由你自己写一段中文（每条 < 80 字），phase 2 里把
  \`persona_cached: false\` / \`persona_source: ""\` 显式标出 —— 前端会渲染
  "generated 黄色" pill 而不是 "cached 绿色"，让用户知道这是 LLM 自创内容。
- model_id 默认填 "claude-sonnet-4-6"；tools_picked 留空数组（用户回头再选）。
`;
