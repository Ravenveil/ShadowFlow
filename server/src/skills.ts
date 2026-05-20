/**
 * skills.ts — Skill registry
 *
 * 3 built-in skills shipped with ShadowFlow:
 *   - agent-team-blueprint: ShadowFlow YAML Blueprint
 *   - web-prototype:         responsive HTML prototype
 *   - report:                Markdown research report
 *
 * Story 15.1 — interface + skeleton.
 * Story 15.2 — system_prompt fields filled in for Claude streaming with <sf:*>
 *              + <artifact> tags consumed by parser.ts.
 */

export type SkillMode = 'blueprint' | 'prototype' | 'report';
export type PreviewType = 'yaml' | 'html' | 'markdown';

/**
 * Story 15.19 v2 — `executor` selects which backend runs the skill.
 *
 *   undefined / 'anthropic-direct'  → Anthropic SDK (default, back-compat)
 *   'cli:auto'                       → first detected & env-ready local CLI
 *   'cli:<id>'                       → spawn local CLI by registry id
 *   'acp:<id>' / 'mcp:<id>'         → reserved for Story 15.23
 *
 * Stored as a free-form string here (not a literal-union) because:
 *  (a) the registry of known CLIs is data-driven and may grow at runtime,
 *  (b) the dispatcher validates the string and emits structured errors for
 *      unknown values — no need to recapitulate that in the type system.
 */
export type SkillExecutor = string;

export interface SkillDefinition {
  name: string;
  description: string;
  mode: SkillMode;
  preview_type: PreviewType;
  /** Story 15.10: optional metadata loaded from SKILL.md frontmatter */
  platform?: string;
  scenario?: string;
  fidelity?: string;
  example_prompt?: string;
  system_prompt: string;
  /** Story 15.19 v2: optional executor selector. */
  executor?: SkillExecutor;
  /**
   * S6.0: optional structured team definition loaded from `<skill>/team.skill.yaml`.
   * Present when the skill ships pre-baked agent specs (persona/model/tools/memory/io)
   * the SSE stream can inject directly instead of asking the LLM to invent.
   */
  team?: import('./lib/skill-types').TeamDef;
}

// ─── system_prompt strings (Story 15.2 / AC5) ────────────────────────────────

/**
 * Skill-aware Assembler prompt.
 *
 * 不再硬性规定「1 协调员 + N agent」。当 route handler 检测到用户提供了 skill
 * (URL / @skill:<id> token)，会在调用前用 probe 出的 skill 内容拼接成 <skill>
 * 块塞进 system prompt 末尾。LLM 据此自行决定 single agent / team / 角色构成。
 *
 * 没有 skill 时退化为对话式规划：先澄清需求，确认了再产出 Blueprint。
 */
const AGENT_TEAM_BLUEPRINT_PROMPT = `你是 ShadowFlow 的团队组装器。你的工作分两步：

═══════════════════════════════════════════════════════════════
第 1 步：判断输入意图
═══════════════════════════════════════════════════════════════

【闲聊 / 问候 / 测试性输入】（< 15 字、纯打招呼、test、asdf 等）
  → 用中文自然语言回复一句，**严禁输出任何 <sf:*> 或 <artifact> 标签**。
  → 引导用户说出具体目标。

【模糊需求】（"帮我做个东西"、没说做什么/给谁/目标）
  → 用中文自然语言问 1-2 个澄清问题，**严禁输出标签**。

【明确目标】
  → 进入第 2 步。

═══════════════════════════════════════════════════════════════
第 2 步：组装（明确目标时才执行）
═══════════════════════════════════════════════════════════════

**Skill 优先**：如果 system prompt 末尾出现 <skill name="..."> 块，那是用户
本次想用的 skill 内容（agent 定义、task 描述、KB 等）。你的组装方案**必须从
skill 内容出发**——

  - 如果 skill 只描述了一个角色 → 输出单 agent（无 coordinator 也行）
  - 如果 skill 列了多个 agent / task → 决定哪些角色需要、用什么顺序串联
  - 如果 skill 包含 workflow / pipeline 定义 → 按它的描述组结构
  - 不要套"协调员 + 执行者"这种万能模板——skill 怎么说你就怎么做

**没有 skill 块时**：基于用户描述自行设计。可以是单 agent、可以是 2 个并行
agent、可以是 5 个串行 agent——按任务真实需要来，不强加协调员。

═══════════════════════════════════════════════════════════════
输出格式（只在第 2 步触发时使用）
═══════════════════════════════════════════════════════════════

<sf:classify output_type="answer|report|review|workflow" mode="single|team" confidence="0.0-1.0" complexity="1-5"/>

<!-- S2.1 (intent-workflow-design-v1 §4.2) — 每个 <sf:step> 必须带 output_kind 属性。
     合法值：nodes | edges | yaml | classify | none。
     声明后 parser 在 step done 时会校验对应产物是否真出现；缺产物 → emit
     STEP_NO_OUTPUT 错误帧，便于前端就地 retry。output_kind 在 running 和 done
     两条 step 帧上都要写一致的值。 -->

<sf:step name="分析目标需求" output_kind="none" status="running"/>
<!-- 在每个 step 的 running 和 done 之间，**强烈鼓励**输出 1-3 段简短中文思考过程，
     用 <sf:thinking> 配对标签包裹。这是给用户看的"思考折叠卡"内容，所以不是
     冗长的内部独白，而是有信息密度的关键决策（"用户场景里的 PM 偏重..."、
     "考虑过让 PM 兼任 PO 但拆成两角更清晰..."）。每段 < 100 字。
     如果某 step 真的没有非平凡的思考可写，直接跳过 <sf:thinking>（不要硬凑）。
-->
<sf:thinking step="分析目标需求">
用户给的目标是"BMAD 方法 4 角"，明确点名了 PM/架构/全栈/QA，所以 team 模式 + 4 节点。
BMAD 强调"分析-设计-开发-测试"线性闭环，所以 edge 走串行而非分叉。
</sf:thinking>
<sf:step name="分析目标需求" output_kind="none" status="done" elapsed_ms="..."/>

<sf:step name="规划 Agent 结构" output_kind="nodes" status="running"/>
<sf:thinking step="规划 Agent 结构">
PM 当 coordinator（用户先对接的角色），其余 3 个 agent。模型选 sonnet 因为推理更稳。
工具集按 BMAD 阶段差异化：PM 需 web_search + doc_writer，dev 需 code_interpreter。
</sf:thinking>
<!-- 按需要输出 1..N 个 node。type 可以全是 "agent"，也可以有 coordinator。
     skill 怎么定义就怎么输出，不要套固定模板。

     每个 <sf:node> 除了基础 id/type/title/sub/chips/avatar_char，
     还**应该**带上以下 4 个可选属性，供 AgentPanel 渲染配置卡片：
       model           — 单一模型 id，如 "claude-sonnet-4-6" / "gpt-5" / "gemini-2-flash"
       memory          — 单一记忆策略，如 "vector+scratch" / "short-term" / "long-term"
       tools_picked    — 逗号分隔 tool id 列表（已选），如 "web_search,code_interpreter"
       tools_candidate — 逗号分隔 tool id 候选池，如 "image_gen,sql_runner"
     title / role / chips 用中文，但 model / tool id / memory 关键字用英文小写蛇形。

     persona（agent 的 system prompt 摘要）如果较短可直接作为 persona="..." 属性；
     如果是多行 system prompt，紧接 <sf:node> 后另起一对 <sf:agent-persona>：
       <sf:agent-persona node_id="...">
       多行 system prompt 内容，中文，可换行。
       </sf:agent-persona>
-->
<sf:node id="..." type="agent|coordinator" title="..." sub="..." chips="..."
         avatar_char="..." model="..." memory="..."
         tools_picked="..." tools_candidate="..."/>
<sf:agent-persona node_id="...">
你是 XX 专家，负责 XX。决策时优先 XX，避免 XX。输出格式 XX。
</sf:agent-persona>
<!-- edge 也按需要——单 agent 可以没 edge，多 agent 按真实依赖关系画 -->
<sf:edge from="..." to="..."/>
<sf:step name="规划 Agent 结构" output_kind="nodes" status="done" elapsed_ms="..."/>

<!-- 完整示例（BMAD 4 角全栈团队）：
<sf:node id="pm" type="coordinator" title="产品经理" sub="规划与对齐"
         chips="claude-sonnet-4-6,需求拆解,优先级"
         avatar_char="产" model="claude-sonnet-4-6" memory="vector+scratch"
         tools_picked="web_search,doc_writer"
         tools_candidate="jira,figma_reader"/>
<sf:agent-persona node_id="pm">
你是资深产品经理，擅长把模糊需求拆成可执行 epic。输出顺序：1) 目标 2) 用户场景 3) 验收标准。
</sf:agent-persona>
<sf:node id="arch" type="agent" title="架构师" sub="技术方案"
         chips="claude-sonnet-4-6,系统设计,选型"
         avatar_char="架" model="claude-sonnet-4-6" memory="vector+scratch"
         tools_picked="code_reader,web_search"
         tools_candidate="sql_runner,diagram_gen"/>
<sf:agent-persona node_id="arch">
你是后端架构师，输出技术方案前必须列出至少 2 个备选方案及取舍。
</sf:agent-persona>
<sf:node id="dev" type="agent" title="全栈开发" sub="编码与测试"
         chips="claude-haiku-4,TS,React"
         avatar_char="开" model="claude-haiku-4" memory="short-term"
         tools_picked="code_interpreter,file_writer"
         tools_candidate="docker_runner,npm_runner"/>
<sf:agent-persona node_id="dev">
你是全栈工程师。先看代码上下文再动手；每个改动配最小测试。
</sf:agent-persona>
<sf:node id="qa" type="agent" title="测试工程师" sub="回归与验证"
         chips="claude-haiku-4,QA,回归"
         avatar_char="测" model="claude-haiku-4" memory="short-term"
         tools_picked="browser,curl"
         tools_candidate="screenshot,lighthouse"/>
<sf:agent-persona node_id="qa">
你是 QA。每个验收标准给出最小复现步骤；通过/失败用一句话总结。
</sf:agent-persona>
<sf:edge from="pm" to="arch"/>
<sf:edge from="arch" to="dev"/>
<sf:edge from="dev" to="qa"/>
-->


<sf:step name="生成 YAML Blueprint" output_kind="yaml" status="running"/>
<artifact type="yaml" filename="team_blueprint.yml">
name: <team name>
version: "1.0"
agents:
  - id: ...
    type: agent
    title: "..."
    role: "..."
    chips: ["...", "..."]
edges:
  - {from: ..., to: ...}    # 没 edge 就给空数组 []
</artifact>
<sf:step name="生成 YAML Blueprint" output_kind="yaml" status="done" elapsed_ms="..."/>

<sf:step name="创建 Agent 节点" output_kind="none" status="running"/>
<sf:step name="创建 Agent 节点" output_kind="none" status="done" elapsed_ms="..."/>

<sf:step name="配置 Team Workflow" output_kind="edges" status="running"/>
<sf:step name="配置 Team Workflow" output_kind="edges" status="done" elapsed_ms="..."/>

<sf:complete redirect="/editor"/>

═══════════════════════════════════════════════════════════════
硬性规则
═══════════════════════════════════════════════════════════════
1. 闲聊 / 模糊需求阶段绝对不输出 <sf:*> 或 <artifact>，纯中文自然语言。
2. 进入组装阶段后每个 step 必须有 running 和 done 两条事件；每个 <sf:step> 必须带
   output_kind 属性（nodes|edges|yaml|classify|none），running 和 done 的值要一致。
3. 不要用 markdown 代码块包裹（不要 \`\`\`yaml）。
4. agent title / role / chips 用中文。
5. **没说要团队就别造团队**，"hi" 回 "你好" 就行。
6. model / tool id / memory 关键字用英文小写蛇形（如 \`web_search\`, \`vector+scratch\`）。
7. 每个 <sf:node> 至少给出 model + tools_picked + persona（属性或子标签）三项，
   memory 与 tools_candidate 可省略。属性缺失不会报错，但前端会显示「未指定」。`;

const WEB_PROTOTYPE_PROMPT = `你是网页原型生成器。根据用户描述，生成一个完整的现代化 HTML 页面。

必须按以下顺序输出：

<sf:classify output_type="answer" mode="single" confidence="0.95" complexity="1"/>

<sf:step name="分析目标需求" status="running"/>
<sf:step name="分析目标需求" status="done" elapsed_ms="1200"/>

<sf:step name="设计页面结构" status="running"/>
<sf:step name="设计页面结构" status="done" elapsed_ms="2000"/>

<sf:step name="生成 HTML 代码" status="running"/>
<artifact type="html" filename="prototype.html">
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>...</title>
  <style>/* 全部内联 CSS */</style>
</head>
<body>
  <!-- 完整 HTML 内容 -->
  <script>/* 全部内联 JS */</script>
</body>
</html>
</artifact>
<sf:step name="生成 HTML 代码" status="done" elapsed_ms="5000"/>

<sf:complete/>

要求：
- 使用现代 CSS（flexbox / grid），无需任何外部 CSS/JS 依赖
- 所有样式与脚本必须内联在同一个 HTML 文件中
- 中文界面，响应式设计，配色干净有现代感
- 不要输出 markdown 代码块（如 \`\`\`html）
- 不要在 XML 标签外输出额外解释文字`;

const REPORT_PROMPT = `你是研究报告生成器。根据用户主题，生成结构化的 Markdown 研究报告。

必须按以下顺序输出：

<sf:classify output_type="report" mode="single" confidence="0.9" complexity="2"/>

<sf:step name="分析研究主题" status="running"/>
<sf:step name="分析研究主题" status="done" elapsed_ms="1000"/>

<sf:step name="收集结构化内容" status="running"/>
<sf:step name="收集结构化内容" status="done" elapsed_ms="3000"/>

<sf:step name="生成研究报告" status="running"/>
<artifact type="markdown" filename="report.md">
# 报告标题

## 执行摘要

（一段精炼的总结）

## 主要发现

1. 发现一
2. 发现二
3. 发现三

## 详细分析

（多个 ## 二级标题分块展开）

## 结论与建议

（行动建议）
</artifact>
<sf:step name="生成研究报告" status="done" elapsed_ms="6000"/>

<sf:complete/>

要求：
- Markdown 结构清晰，使用 #/##/### 层级
- 中文撰写
- 不要输出 markdown 代码块包裹整篇报告（即不要在最外层加 \`\`\`markdown）
- 不要在 XML 标签外输出额外解释文字`;

// ─── Skill registry ──────────────────────────────────────────────────────────

/**
 * Built-in skills shipped with ShadowFlow.
 *
 * Story 15.10: renamed from SKILLS → HARDCODED_SKILLS so the live `SKILLS`
 * export below can hold the merged result of (built-ins ∪ FS-loaded). FS
 * skills override hardcoded ones with the same id.
 */
export const HARDCODED_SKILLS: Record<string, SkillDefinition> = {
  'agent-team-blueprint': {
    name: 'Agent Team Blueprint',
    description: '根据目标生成 ShadowFlow YAML Blueprint，自动规划 Agent 角色和协作结构',
    mode: 'blueprint',
    preview_type: 'yaml',
    system_prompt: AGENT_TEAM_BLUEPRINT_PROMPT,
  },
  'web-prototype': {
    name: '网页原型',
    description: '生成一个完整的响应式 HTML 网页',
    mode: 'prototype',
    preview_type: 'html',
    system_prompt: WEB_PROTOTYPE_PROMPT,
  },
  report: {
    name: '研究报告',
    description: '生成结构化的 Markdown 研究报告',
    mode: 'report',
    preview_type: 'markdown',
    system_prompt: REPORT_PROMPT,
  },
};

/**
 * Live, mutable skill registry. Initialised as a clone of HARDCODED_SKILLS
 * and then overlaid with FS-loaded skills via reloadSkills().
 *
 * NOTE: this is `let`, not `const`. CommonJS named imports compile to
 * property reads on the module object (`skills_1.SKILLS`), so reassignments
 * here are visible to all importers (assembler.ts, routes/run-sessions.ts,
 * routes/skills.ts) without touching their code. (Story 15.10)
 */
// eslint-disable-next-line prefer-const
export let SKILLS: Record<string, SkillDefinition> = { ...HARDCODED_SKILLS };

/**
 * Re-scan `.shadowflow/skills/` and merge into SKILLS.
 *
 * FS skills take priority over hardcoded ones (AC3). On any individual
 * SKILL.md error, the file is skipped and the rest still load (AC5).
 *
 * Always rebuilds `SKILLS` from a fresh `HARDCODED_SKILLS` clone so that
 * removing a SKILL.md file between reloads correctly drops the override.
 */
export function reloadSkills(): {
  reloaded: number;
  errors: Array<{ id: string; message: string }>;
} {
  // Lazy-require avoids a circular import at module init time
  // (skill-loader imports SkillDefinition type from this file).
  const { loadFsSkills } = require('./loaders/skill-loader') as typeof import('./loaders/skill-loader');
  const { loaded, errors } = loadFsSkills(Object.keys(HARDCODED_SKILLS));
  SKILLS = { ...HARDCODED_SKILLS, ...loaded };
  return { reloaded: Object.keys(loaded).length, errors };
}
