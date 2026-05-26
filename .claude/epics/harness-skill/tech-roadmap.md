---
name: tech-roadmap-skill
status: draft
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
epic: harness-skill
based_on: Explore agent 6 维代码基线调研 (2026-05-26)
---

# Harness Skill 技术路线

> 维度：**Skill SOP 强化 + 通用 Skill 库**。让 skill 从"prompt 文档"升级为"执行剧本"。

## 1. 现状基线

| 关注点 | 当前状态 |
|--------|---------|
| skill-ingest pipeline 全貌 | 前端 `src/api/skillIngest.ts:55-87` 的 `previewSkill()` → `ingestSkill()` → `listInstalledSkills()`；后端路由（`/api/skills/{preview,ingest,installed}`）在 server.py 或独立 routes，调研未找到完整链路（**调研待二次确认**）|
| SKILL.md frontmatter schema | 调研指 `bmad-agent-builder/assets/init-sanctum-template.py:parse_frontmatter()` 是 YAML frontmatter 样板；**当前无 `steps:` 字段** |
| skill 调用链 | `@<id>` 解析（`skillToken.ts:49`）→ system prompt 注入 → executor 调用；executors.py 的 tool_call 处理（line 51）+ prompt 拼装（line 39-55）|
| tsx watch skill-loader 缓存 | 老问题（[[reference_harness_6dim_survey]] 第三方调研记录有），需重启才看新 skill；本 epic 加 deterministic step 时会再次踩坑 |

## 2. 推荐插桩点

```
后端：
  server/src/skills.ts                           ← skill 注册表 + frontmatter schema 解析
  server/src/skill-ingest/                       ← fetch/canonical-id/probe/register 流程
  shadowflow/runtime/skill_step_executor/        ← 新建模块
    ├── schema.py        # Step (LLMStep / ShellStep / HttpStep / BuiltinToolStep)
    ├── executor.py      # 按 step 顺序执行
    ├── sandbox.py       # shell/http 隔离（与 [[harness-scripts]] sandbox 同源）
    └── seeds/           # 通用 SOP skill 种子
        ├── sf-doc-sop/
        ├── sf-code-sop/
        └── sf-research-sop/

前端：
  src/pages/SkillCreatorPage.tsx                 ← 新建（或 modal）
  src/components/skill-editor/                   ← StepEditor 组件（结构化编辑 steps）
```

## 3. 技术路线（按 task 推进顺序）

### Task 001 — Skill steps schema 扩展（先做）
- SKILL.md frontmatter 新增 `steps: List[Step]` 字段
- `Step` 类型枚举：
  ```yaml
  steps:
    - kind: llm
      prompt: "..."
    - kind: shell
      cmd: "pytest"
      timeout: 60
      on_fail: blocker
    - kind: http
      method: POST
      url: "{{secret.notion_url}}"
      body: {...}
    - kind: builtin_tool
      tool_id: file_exists
      args: {path: "dist/main.js"}
  ```
- skill-ingest pipeline 解析 + 校验 steps（如果有）
- 执行引擎 `skill_step_executor/executor.py` 按顺序跑
- **向后兼容**：没填 steps 的 skill 仍按现有 prompt 模板模式跑

### Task 002 — Skill 创作 UI（与 001 可并行）
- 新建 `SkillCreatorPage.tsx` 或 modal
- 表单：name / description / category / 内容（markdown 编辑器 + preview）/ steps（StepEditor 组件）
- 保存 → 后端 skill 创建 API（**如不存在则同时建 endpoint**）→ 写入 `.shadowflow/skills/`
- 创建成功立即在 SkillDropdown / 装包 UI 可见（注意 tsx watch 缓存）
- 复用 [[harness-rule]] 003 / [[harness-scripts]] 005 同构 UX

### Task 003 — 通用 SOP skill 种子（依赖 001）
- 3-5 个种子 skill 存到 `skill_step_executor/seeds/`：
  - **sf-doc-sop**: 起草 → 自查 → 拼装 → 导出 PDF（含 shell step 调本地 markdown→pdf 命令）
  - **sf-code-sop**: 读代码 → 改代码 → 跑 lint → 报告 diff（含 shell step 调 ruff / eslint）
  - **sf-research-sop**: 搜文献 → 抽笔记 → 写综述 → 引用核对（含 http step 调 search API）
- 每个 skill 至少 50% step 是 deterministic（不全 LLM）
- 配套：每个 SOP 推荐挂哪几个 [[harness-scripts]] validation hook（文档化）

## 4. 风险 / 隐藏阻塞

- **🔴 skill-ingest 后端路由调研未完整**：Task 001 启动前需 grep `/api/skills` 全后端路由，搞清现状 schema 解析点
- **🟡 sandbox 与 [[harness-scripts]] 重复**：shell/http step 沙盒应与 validation_hooks/sandbox.py 共用同一实现（避免双套）
- **🟡 tsx watch 缓存**：加新 step 类型后，热加载是否生效？需测试，必要时加 cache invalidation
- **🟡 BYOK secrets 引用语法**：`{{secret.notion_url}}` 这种插值机制要确认现有 BYOK config 是否支持，否则要扩

## 5. 与其他 epic 的接口契约

- **配合 [[harness-scripts]]**：sandbox 共享；validation_hooks 的 builtin validator 也可被 skill 的 builtin_tool step 调用
- **配合 [[harness-workflow]] 003**：dev-map / Task Board 可由 skill 的 deterministic step 自动更新
- **依赖 [[harness-mcp]]**（弱）：未来 http step 调用外部 API 可走 MCP 改造

## 6. 调研待二次确认项

- skill-ingest 后端路由 / SKILL.md 解析点的真实位置（Task 001 前必查）
- tsx watch skill-loader 缓存机制（是否影响 deterministic step 热加载）
- BYOK secrets 插值语法是否存在
