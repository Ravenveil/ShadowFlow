/**
 * phase-3-team.ts — Phase 3 of the multi-turn skill-assembler prompt.
 *
 * S7 (skill-team-conversion-design-v1.md §5 line 815-855, D3 decision).
 *
 * In this phase the LLM stitches the registered agents into a DAG by calling
 * register_edge for each edge, then announces completion. It also emits two
 * small "non-product" steps ("设置工具集" / "Policy 协作规则") that exist
 * purely so the run-session UI's step list isn't suspiciously short — they
 * are "thinking-only" steps with no artifact output.
 */

export const PHASE_3_TEAM = `# Phase 3 · 收尾：工具集校验 / Policy / Edges / complete

## 3.1 设置工具集（thinking-only step）

emit \`<sf:step name="设置工具集" output_kind="none" status="running"/>\`
emit \`<sf:thinking step="设置工具集">\` 块：用一段中文说明
 - 每个 agent picked 的 tools 是否合理
 - 有没有重复 / 缺失（比如团队里没人能写文件）
emit \`<sf:step name="设置工具集" output_kind="none" status="done"/>\`

**不要**调任何 tool，**不要** register_agent — 这一步只是给用户看的"思考帧"。

## 3.2 Policy 协作规则（thinking-only step）

emit \`<sf:step name="Policy 协作规则" output_kind="none" status="running"/>\`
emit \`<sf:thinking step="Policy 协作规则">\` 块：用一段中文说明
 - 失败如何 retry（哪条 edge 用 conditional kind）
 - 升级路径（哪个 agent 是兜底）
emit \`<sf:step name="Policy 协作规则" output_kind="none" status="done"/>\`

## 3.3 配置 Team Workflow（实际发 edges）

emit \`<sf:step name="配置 Team Workflow" output_kind="edges" status="running"/>\`

对每条要建立的边，调一次：

\`\`\`
register_edge({
  from:        "<source_node_id>",
  to:          "<target_node_id>",
  kind:        "sequential" | "parallel" | "conditional",
  condition:   "<condition string，仅 conditional 给>",
  max_retries: <number，conditional 推荐 1-3>
})
\`\`\`

返回 \`{ok:true}\` 即成功，后端同步 emit \`event: 'edge'\` 到 SSE。

emit \`<sf:step name="配置 Team Workflow" output_kind="edges" status="done"/>\`

## 3.4 完成

emit \`<sf:complete redirect="/editor"/>\`

之后什么都不要再 emit。runtime 会把 \`<sf:complete>\` 翻译成 SSE \`event:
'complete'\` 终止该 turn。

## 强制规则

- **不要**在 phase 3 里 emit \`<sf:node>\` 或调 register_agent — 那是 phase 2 的活。
- register_edge 每条边一次调用，不要合并。
- "设置工具集" 和 "Policy 协作规则" 都是 thinking-only 步骤，绝对不允许 ToolUse。
- 单 agent team（只 register 了 1 个 agent）允许零 edge，直接跳 3.3 到 3.4。
`;
