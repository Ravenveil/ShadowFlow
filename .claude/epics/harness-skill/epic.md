---
name: harness-skill
status: open
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
prd: harness-6dim-survey-and-river-memory
priority: P2
progress: 0%
source_doc: docs/harness/harness-6dim-survey-and-river-memory.md §2.2 Q2 + §4 B5
---

# Epic: Harness Dimension — Skill（SOP 强化 + 通用 Skill 库）

## 维度定位

**文章 6 维之一**：Skill — *"How should this be done"* / *Standard operating procedures*

> "Skill 是在告诉 AI：这件事不要现场发挥；不要每次都从头推导流程，也别去猜
> 一个大概的工作流；按这些固定步骤来。" —— 文章 §1.1
>
> 文章主张："把高频固定动作沉淀成 Skill。"

## 平台现状（部分有，确定性弱）

**强项 ✅**：Skill 是一等公民 — `server/.shadowflow/skills/`、skill-ingest pipeline、
`@id` / `/id:cmd` 解析、SkillDropdown UI；用户可装 BMAD-METHOD 等上游 skill。

**弱项 🟡**：
- **SOP 性质太弱**：文章说 Skill 是"执行剧本"（把 `go build` 所有 flag/tag 沉淀成不容现场发挥
  的命令包）。我们的 skill 仍是 "prompt 模板 + 资源"，确定性靠 agent 自己听话。
- **用户没有 UI 写 skill**：要写 skill 必须懂 markdown frontmatter / skill-ingest / `@` vs `/` 解析；
  非工程师用户上不了手。
- **高频固定动作没沉淀成种子 skill**：文档 SOP / 代码 SOP / 研究 SOP 这种通用模板一个都没有。

**评分**：平台原语 🟡 / 用户可用度 🟡。

## 战略意义

文章作者把"编译 / 测试 / 校验"做成 skill。**在 ShadowFlow 上下文里等价物是什么？**
本 epic 沉淀 3-5 个"通用 SOP skill"作为种子，让新用户开箱即用。
同时强化 skill 的"剧本"属性 —— 允许 skill 触发本地命令 / HTTP / 内置工具，不只是 prompt。

## Success Criteria

- [ ] Skill schema 支持 "deterministic step" 类型（执行本地命令 / HTTP / 内置工具）
- [ ] 平台内 "新建 Skill" 表单（无需懂 markdown），UI 校验后保存到 .shadowflow/skills/
- [ ] 3-5 个内置 SOP skill 种子上架（文档 / 代码 / 研究）
- [ ] 装包流程：用户从 UI 一键启用某 SOP skill 用于其 team

## 后端模块责任

**触点**：
- `shadowflow/runtime/skill_registry/` 或 `server/src/skills.ts` — skill schema 扩展
- `shadowflow/runtime/skill_step_executor/`（新建）— deterministic step 执行引擎
- `src/components/skill-creator/`（新建）— UI 创作面板

## Tasks Created

- [ ] 001.md - Skill "deterministic step" 类型设计 + schema 扩展
- [ ] 002.md - Skill 创作 UI（平台内"新建 Skill"表单）
- [ ] 003.md - 沉淀 3-5 个通用 SOP skill 种子（文档 / 代码 / 研究）

Total tasks: 3
Parallel tasks: 2 (002, 003 与 001 并行)
Sequential tasks: 0
Estimated total effort: 2 周
