/**
 * phase-1-analyze.ts — Phase 1 of the multi-turn skill-assembler prompt.
 *
 * S7 (skill-team-conversion-design-v1.md §5 line 815-855, D3 decision).
 *
 * In this phase the LLM:
 *   1. Reads the goal and the active <skill> bundle in the system prompt
 *   2. Calls `list_team_agents(skill_id)` ONCE to see who is on the bench
 *   3. Decides which subset of those agents the goal actually needs
 *      (it MAY decide none, in which case it short-circuits to a natural-
 *       language reply and never enters phase 2/3)
 *
 * Output discipline:
 *   - emit <sf:step name="分析目标需求" output_kind="none" status="running"/>
 *   - emit <sf:thinking step="分析目标需求"> ... </sf:thinking>
 *   - emit <sf:step name="分析目标需求" output_kind="none" status="done"/>
 *   - emit <sf:step name="挑选 Team 蓝图" output_kind="none" status="running"/>
 *   - ToolUse list_team_agents({skill_id})        ← exactly once
 *   - emit <sf:thinking step="挑选 Team 蓝图"> ... </sf:thinking>
 *   - emit <sf:step name="挑选 Team 蓝图" output_kind="none" status="done"/>
 *
 * The <sf:thinking> bodies are user-facing summaries (< 100 字, 信息密度高),
 * NOT internal monologue. They become the "thinking fold-card" in the UI.
 */

export const PHASE_1_ANALYZE = `# Phase 1 · 分析目标 & 挑选 Team 蓝图

第一步是阅读 goal + system prompt 末尾的 <skill> 块（如果存在），判断这个
goal 是否真的适合此 skill。然后通过 \`list_team_agents\` 看一眼候选 agent
列表，决定要不要进入 phase 2 组装。

## 强制顺序（不可乱）

1. emit \`<sf:step name="分析目标需求" output_kind="none" status="running"/>\`
2. emit \`<sf:thinking step="分析目标需求">\` 块（一段中文，< 100 字，写"goal 是什么 / skill 看起来是否对口"）
3. emit \`<sf:step name="分析目标需求" output_kind="none" status="done"/>\`
4. emit \`<sf:step name="挑选 Team 蓝图" output_kind="none" status="running"/>\`
5. ToolUse \`list_team_agents({skill_id: "<active skill id>"})\` ——一次就够
6. 看返回的 agents 数组，决定"用哪几个 + 用 / 不用 / 等候"的分布
7. emit \`<sf:thinking step="挑选 Team 蓝图">\` 块（中文，< 100 字，写"为什么这几个"）
8. emit \`<sf:step name="挑选 Team 蓝图" output_kind="none" status="done"/>\`

## skill 不对口的退出口

如果 \`list_team_agents\` 返回的成员组合明显与 goal 不沾边（比如
paper-review 团队 vs goal="煮咖啡"），phase 1 结束时**不要**进入 phase 2。
改为发一段中文自然语言回复，告诉用户"这个 skill 不适合该 goal，建议换 skill
或换 goal"，然后 emit \`<sf:complete/>\`（不带 redirect）。

## 输入信息不足时的处理 — 用 \`<sf:question-form>\` 不用 markdown

如果 goal 模糊（比如"帮我做个东西"），phase 1 \`<sf:thinking>\` 里写明缺什么，
**不要**用 markdown 文字追问。**必须** emit \`<sf:question-form>\` XML 标签
让前端弹出结构化表单。然后 emit \`<sf:complete/>\` 结束 phase 1。

标签格式（attrs + JSON body）:

\`\`\`xml
<sf:question-form id="clarify" title="补充信息 30 秒">
{
  "description": "我需要确认两点再开工",
  "questions": [
    {
      "id": "target",
      "label": "你想对论文做什么？",
      "type": "radio",
      "options": ["快速速读 / 摘要", "深度评审（找问题）", "翻译", "复现实验"],
      "required": true
    },
    {
      "id": "paper",
      "label": "有具体论文吗？粘 URL 或 arXiv id",
      "type": "text",
      "placeholder": "https://arxiv.org/abs/2024.xxxxx",
      "required": false
    }
  ]
}
</sf:question-form>
\`\`\`

支持的 \`type\`：\`radio\`（单选）/ \`checkbox\`（多选，可加 \`maxSelections\`）/ \`text\`（自由文本）。
\`options\` 用于 radio + checkbox。\`required: true\` 的题用户必须答。

**严禁**：在 phase 1 用 markdown 列表问 "1. 你想做什么？ 2. 论文 URL?" —— 前端
看不见结构化数据，模态框不会弹出，用户体验会断裂。
`;
