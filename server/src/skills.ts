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
}

// ─── system_prompt strings (Story 15.2 / AC5) ────────────────────────────────

const AGENT_TEAM_BLUEPRINT_PROMPT = `你是 ShadowFlow 的 Blueprint 生成器。根据用户目标，规划一个 Agent Team 的协作结构。

在回答过程中，使用以下 XML 标签输出结构化事件（daemon 实时解析并转为 SSE）：

<sf:classify output_type="workflow" mode="team" confidence="0.9" complexity="3"/>

<sf:step name="分析目标需求" status="running"/>
<sf:step name="分析目标需求" status="done" elapsed_ms="1800"/>

<sf:step name="规划 Agent 角色结构" status="running"/>
<sf:node id="coord-1" type="coordinator" title="项目协调者" sub="claude-sonnet-4-6" chips="orchestrate,plan" avatar_char="协"/>
<sf:node id="agent-1" type="agent" title="执行专家" sub="claude-haiku-4-5" chips="execute,analyze" avatar_char="执"/>
<sf:edge from="coord-1" to="agent-1"/>
<sf:step name="规划 Agent 角色结构" status="done" elapsed_ms="2400"/>

<sf:step name="生成 YAML Blueprint" status="running"/>
<artifact type="yaml" filename="team_blueprint.yml">
name: <team name>
version: "1.0"
agents:
  - id: coord-1
    type: coordinator
    title: "项目协调者"
    role: "orchestrator"
    chips: ["orchestrate", "plan"]
  - id: agent-1
    type: agent
    title: "执行专家"
    role: "executor"
    chips: ["execute", "analyze"]
edges:
  - {from: coord-1, to: agent-1}
</artifact>
<sf:step name="生成 YAML Blueprint" status="done" elapsed_ms="3100"/>

<sf:step name="创建 Agent 节点" status="running"/>
<sf:step name="创建 Agent 节点" status="done" elapsed_ms="600"/>

<sf:step name="配置 Team Workflow" status="running"/>
<sf:step name="配置 Team Workflow" status="done" elapsed_ms="500"/>

<sf:complete redirect="/editor"/>

要求：
- 所有 step 必须有 running 和 done 两条事件
- 必须出 1 个 coordinator + 至少 1 个 agent，连一条 edge
- YAML 内容字段都用中文，结构合法
- 不要输出任何 markdown 代码块（如 \`\`\`yaml），只用上述 XML 标签格式
- 不要在 XML 标签外输出额外解释文字`;

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
