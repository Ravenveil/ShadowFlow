/**
 * phase-2-agent.ts — Phase 2 of the multi-turn skill-assembler prompt.
 *
 * S7 (skill-team-conversion-design-v1.md §5 line 815-855, D3 decision).
 *
 * In this phase the LLM, for each agent it decided to hire in phase 1, walks
 * 5 substeps (identity / persona / model / tools / memory). Each substep:
 *   - emits a running <sf:agent-substep>
 *   - calls get_skill_anchor (for persona/model/tools/memory)
 *   - calls register_agent on the LAST substep of each agent
 *     (or splits — see "register_agent timing" below)
 *   - emits a done <sf:agent-substep>
 *
 * Crucial invariant (§4.3 引用 vs 创造):
 *   - persona / model / tools / memory bodies fed into register_agent MUST
 *     come byte-for-byte from get_skill_anchor's `body` field. Do NOT
 *     paraphrase. Do NOT trim whitespace. Do NOT translate.
 *   - The frontend SkillSection renders a "cached 绿" pill when the body
 *     matches the yaml verbatim; paraphrasing breaks that pill.
 */

export const PHASE_2_AGENT = `# Phase 2 · 为每个选中的 Agent 配置 5 个 substep

## 总框架

emit \`<sf:step name="配置 Agent 角色" output_kind="nodes" status="running"/>\`

然后**对每个 phase 1 选中的 agent**（在 list_team_agents 返回里）做这 5 个 substep。
未选中（决定不上岗的）agent，发一条 \`<sf:agent-substep node_id="..." substep="identity"
status="pending"/>\` 让左侧步骤列表显示灰色「等候」，但**不调用任何 tool、不
register_agent**。

最后 emit \`<sf:step name="配置 Agent 角色" output_kind="nodes" status="done"/>\`.

## 单个 agent 的 5 substep 推进顺序

按顺序、不可跳：identity → persona → model → tools → memory.

每个 substep：

\`\`\`
<sf:agent-substep node_id="<agent_id>" substep="<slot>" status="running"/>
ToolUse get_skill_anchor({skill_id, agent_id, slot: "<slot>"})    # identity 不调
... (running tool_result)
<sf:agent-substep node_id="<agent_id>" substep="<slot>" status="done"
   source="<ref>" tokens="<n>" cached="true"/>
\`\`\`

### identity substep（无 tool）
identity 只是占位 — 标记"开始配置该 agent"。emit running, 然后立刻 emit done
（无 source/tokens）。

### persona / model / tools / memory substep
ToolUse \`get_skill_anchor({skill_id: "<skill>", agent_id: "<id>", slot: "<slot>"})\`，
拿到 \`{ref, tokens, body}\`。把 \`ref\` 放到 substep done 帧的 \`source\` 属性，
\`tokens\` 放到 \`tokens\`，\`cached\` 标 \`"true"\`。

## register_agent 的调用时机

每个 agent 走完 memory substep 后（即所有 4 个有 tool 的 slot 都拿到 body 了），
调用 **一次** \`register_agent({...})\`，把刚刚 fetch 到的 4 个 body 原样塞进入参：

\`\`\`
register_agent({
  node_id:           <agent.id>,
  title:             <agent.title>,          # 从 list_team_agents 返回
  type:              "agent" | "coordinator",
  sub:               <agent.sub or "">,      # 副标题
  chips:             ["<model>", "<role>", ...],   # 3-5 个中文标签
  avatar_char:       <title 首字>,
  status:            "ready",
  model_id:          <从 model body JSON 里读出的 id>,
  model_temperature: <model.temperature 若有>,
  model_max_tokens:  <model.max_tokens 若有>,
  model_context_window: <model.context_window 若有>,
  tools_picked:      <tools body JSON 里的 picked 数组>,
  tools_candidate:   <tools body JSON 里的 candidate 数组 — 可省>,
  persona:           <persona body —— 原样字符串，verbatim>,
  persona_source:    <persona 的 ref>,
  persona_tokens:    <persona 的 tokens>,
  persona_cached:    true,
  memory:            <memory body —— 原样字符串>,
  io_input:          <可省 — 后续 io substep 才填>,
  io_output:         <可省>
})
\`\`\`

返回 \`{ok:true, node_id}\` 即成功；后端会同步 emit \`event: 'node'\` 到 SSE，
前端 \`<RunSessionPage>\` 渲染该节点。

## 强制规则

- **不要**在 phase 2 里 emit \`<sf:node>\` / \`<sf:edge>\` / \`<sf:agent-persona>\`
  这些标签 —— register_agent tool 已经替你完成了 emit。
- **不要** paraphrase persona/memory body。LLM 只是搬运工，不是改写工。
- 4 个 slot 顺序固定（persona → model → tools → memory），每个 slot
  都要单独一次 get_skill_anchor 调用，不要合并。
- substep done 帧的 \`source\` 必须是 get_skill_anchor 返回的 \`ref\` 原样
  （例: "reader.agent.yaml#persona"）。
`;
