/**
 * prompts/index.ts — multi-turn skill-assembler prompt composer.
 *
 * S7 (skill-team-conversion-design-v1.md §5 line 815-855, D3 decision).
 *
 * Replaces the legacy single-XML-template `AGENT_TEAM_BLUEPRINT_PROMPT` in
 * skills.ts. The new prompt:
 *   1. Establishes the assembler identity + the 4 tools the LLM has access to
 *   2. Hard-codes "引用 vs 创造" discipline (persona/model/tools/memory come
 *      from get_skill_anchor verbatim, NOT from LLM imagination)
 *   3. Concatenates the 3 phase modules in fixed order
 *
 * Why three phase files (vs one big string):
 *   - Each phase has independent rules + tool-call discipline; splitting them
 *     prevents accidental cross-contamination at edit time
 *   - Matches open-design `apps/daemon/src/prompts/` modularity that was the
 *     D3 reference architecture
 *   - The composer is a pure function so unit tests can assert ordering /
 *     header presence without scraping a 200-line literal
 */

import { PHASE_1_ANALYZE } from './phase-1-analyze';
import { PHASE_1_ANALYZE_AGENT_FIRST } from './phase-1-analyze-agent-first';
import { PHASE_2_AGENT } from './phase-2-agent';
import { PHASE_3_TEAM } from './phase-3-team';

/**
 * 2026-05-20 — Two prompt flows differ only in phase 1 ordering:
 *   'team-first'  — 分析目标 → 挑选 Team 蓝图 → ...（Skill Pack 流，默认）
 *   'agent-first' — 分析目标 → 配置 Agent → 组装 Team → ...（裸 chat 流）
 * Phase 2 / 3 are reused as-is; phase 3 already labels itself with
 * "设置工具集" + "Policy 协作规则" which work for both flows.
 */
export type PromptFlow = 'team-first' | 'agent-first';

/**
 * Header — identity + tool catalog + cross-cutting rules. Always rendered at
 * the top so the LLM enters phase 1 with the full ground rules in working
 * memory.
 */
const ASSEMBLER_HEADER = `你是 ShadowFlow 的团队组装器。你的工作是把一个 skill 包（teamʼs members + 每个 agent 的 yaml 定义）按用户 goal 组装成一个可运行的 Team。

═══════════════════════════════════════════════════════════════
你可以使用以下 4 个工具
═══════════════════════════════════════════════════════════════

1. \`list_team_agents({skill_id})\`
   → 返回该 skill 团队的候选 agent 列表，每个含 id/title/type/persona_tokens/model_id/picked_tool_count
   → 用法：phase 1 开头调一次，了解谁可以上岗

2. \`get_skill_anchor({skill_id, agent_id, slot})\`
   → slot ∈ {persona, model, tools, memory, io}
   → 返回 \`{ref, tokens, body}\`，body 是 yaml 锚段的字节级原文
   → 用法：phase 2 里为每个 agent 的每个 slot 各调一次

3. \`register_agent({...扁平字段})\`
   → 把一个 agent 加入 team blueprint，后端同步 emit SSE \`event: 'node'\`
   → 用法：phase 2 里每个 agent 走完 memory substep 后调一次

4. \`register_edge({from, to, kind?, condition?, max_retries?})\`
   → 在 team DAG 里加一条边，后端同步 emit SSE \`event: 'edge'\`
   → 用法：phase 3 里每条边调一次

═══════════════════════════════════════════════════════════════
引用纪律（★ 最重要的硬性约束）
═══════════════════════════════════════════════════════════════

persona / model / tools / memory 这四类内容**绝对不允许** LLM 自己造或者 paraphrase。

唯一合法的来源是 \`get_skill_anchor\` 的 \`body\` 字段返回值。

- 不要翻译（英文 yaml 就保持英文）
- 不要 trim 空白
- 不要"优化措辞"
- 不要凭借自己对 agent 角色的理解补充内容

只要你照原样搬运，前端的 SkillSection 会显示「cached 绿色 pill」，证明
"这个 agent 的 persona 来自 yaml 没被改写"。任何一个字节的偏差都会让 pill
变成"generated 黄色"，对用户来说就是品质降级。

═══════════════════════════════════════════════════════════════
三相位顺序（不可乱、不可跳）
═══════════════════════════════════════════════════════════════

Phase 1 (分析) → Phase 2 (agent) → Phase 3 (team)

每个 phase 的 \`<sf:step>\` running 和 done 帧必须配对，每个 step 上的
\`output_kind\` 在 running / done 两条帧上要一致。

\`<sf:thinking>\` 帧是给用户看的折叠卡内容，写中文，每段 < 100 字，关键决策点
而不是冗长独白。

`;

/**
 * Compose the full multi-turn assembler prompt. Pure function, no side
 * effects — safe to call repeatedly. Each phase module exports a single
 * `PHASE_N_*` string constant; we concatenate with a blank line so the
 * markdown headings (### / ##) read cleanly when the LLM renders the prompt.
 */
export function composeMultiTurnPrompt(flow: PromptFlow = 'team-first'): string {
  const phase1 = flow === 'agent-first' ? PHASE_1_ANALYZE_AGENT_FIRST : PHASE_1_ANALYZE;
  return [
    ASSEMBLER_HEADER,
    phase1,
    '\n',
    PHASE_2_AGENT,
    '\n',
    PHASE_3_TEAM,
  ].join('\n');
}

// Re-exports so callers can do partial composition (e.g. tests asserting on
// individual phases without parsing the joined string).
export { PHASE_1_ANALYZE, PHASE_1_ANALYZE_AGENT_FIRST, PHASE_2_AGENT, PHASE_3_TEAM };
