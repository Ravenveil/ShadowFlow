---
name: tech-roadmap-sub-agent
status: draft
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
epic: harness-sub-agent
based_on: Explore agent 6 维代码基线调研 (2026-05-26)
---

# Harness Sub-Agent 技术路线

> 维度：**角色契约 + 关卡模板**。让"自由组建"实质从"name+soul"升级为完整契约 team。

## 1. 现状基线

| 关注点 | 当前状态 |
|--------|---------|
| catalog_service.py 角色 | `catalog_service.py:34-150` 管理已发布 AgentBlueprint 目录（`.shadowflow/catalog/{app_id}.json`），含 `list_apps()` / `get_app()` / `register_published_app()` / `fork_app()` ——**可直接复用作 role template registry** |
| Quick Hire 流程 | `agents.py:quick_create_agent()` (line 328-349) → `_build_default_blueprint()` (305-325)，硬编码 RoleProfile，无模板系统 |
| agent-team-blueprint 模板位置 | **未在代码库找到现成文件**。需新建在 `templates/custom/` 或 `.shadowflow/templates/`；prompt 参考样板见 `api/teams.py:316-343 _TEAM_EDIT_SYSTEM_PROMPT` |
| BMAD-METHOD 角色定义位置 | 调研报告说未找到，但实际 `server/.shadowflow/skills/BMAD-METHOD/` + `.claude/skills/bmad-agent-{pm,architect,dev,ux-designer,...}/SKILL.md` 都有。**可直接抄结构** |
| RoleProfile 深度字段 | `contracts_builder.py:52-79` 完整 schema 已有（responsibilities / constraints / handoff_rules / capabilities / persona_traits / state_fields / collaboration_contract）|

## 2. 推荐插桩点

```
后端：
  shadowflow/runtime/builder_service.py:generate_blueprint()  ← Task 001 生成器深化
  shadowflow/runtime/catalog_service.py                       ← Task 003 复用作 role template registry
  shadowflow/api/agents.py:quick_create_agent()               ← Task 003 改造为"从模板招"
  shadowflow/runtime/role_templates/                          ← 新建模块（实际只是 catalog 的 thin wrapper）
    ├── gatekeeper.yaml
    ├── code_reviewer.yaml
    └── qa_tester.yaml
  shadowflow/runtime/turn_executor.py（或 service.py）         ← Task 004 runtime 契约校验

前端：
  src/components/team-editor/                                 ← 新建（替代下架的 /builder）
    ├── TeamEditorPage.tsx        # 主入口
    ├── RoleContractEditor.tsx    # 编辑 responsibilities/constraints/handoff_rules
    └── HandoffRuleEditor.tsx     # 结构化编辑 to_agent / when_condition
```

## 3. 技术路线（按 task 推进顺序）

### Task 001 — 生成器深化（与 002/003 可并行）
- 找到 `agent-team-blueprint` 模板（**先确认它在哪**——可能要从 server.ts 或 highlevel.py 倒查）
- 改 prompt 强制要求 LLM 为每角色填 responsibilities (≥2) / constraints (≥1) / handoff_rules (≥1)
- 加 schema 校验：缺字段 retry 一次
- 验证：3 个不同 goal（"做加密快照工具" / "写市场调研" / "审代码"）跑 e2e 看 blueprint

### Task 002 — 角色契约编辑 UI（与 001/003 并行）
- 新建 `team-editor` 替代下架的 `/builder`
- 复用 `useAgentList` hook
- handoff_rules 编辑器最复杂——用 react-flow 或简版"from/to/when"三栏表格 MVP
- 浏览器手测：生成 team → 编辑某 agent constraints → 保存 → 跑 turn 验证行为变化

### Task 003 — 关卡型角色模板（与 001/002 并行）
- 复用 `catalog_service.py` 作 registry，新增 `template_type: Literal["role", "agent", "team"]` 字段
- 3 个种子模板存 `shadowflow/runtime/role_templates/*.yaml`，结构抄 `RoleProfile` schema
- 模板内容（关键）：
  - **Gatekeeper**: `responsibilities: ["在编码开始前校验需求清晰度/设计可行性/集成风险"], constraints: ["不重写需求或设计文档"], handoff_rules: [{to: requirements, when: "需求歧义"}, {to: architect, when: "设计有漏洞"}]`
  - **Code Reviewer**: `responsibilities: ["交叉引用需求和设计文档审查实现"], handoff_rules: [{to: dev, when: "实现偏离设计"}]`
  - **QA Tester**: `responsibilities: ["验证主流程 + 边界 + 回归 + 稳定性"], handoff_rules: [{to: dev, when: "测试失败"}]`
- `agents.py:quick_create_agent()` 改造：从 catalog 查模板 + fork_app 克隆
- 加 API `POST /api/role-templates/{template_id}/instantiate`

### Task 004 — Runtime 契约校验（依赖 001）
- **第一阶段（调研）**：grep `responsibilities` / `constraints` / `handoff_rules` 所有引用点，写现状报告（≤200 字）
- **第二阶段（实现）**：
  - 弱校验起步：agent 输出后查 responsibilities 是否被提及（不阻断 turn，只记 telemetry）
  - 强校验留给 [[harness-scripts]] Validation Hook
- 与 [[harness-rule]] 002 注入器配合（契约字段 → 软规则）

## 4. 风险 / 隐藏阻塞

- **🔴 agent-team-blueprint 模板位置未明**：Task 001 启动前**必须先找到这个模板**——可能在 server/src/skills.ts 默认模板里，也可能在 prompts 目录。grep `agent-team-blueprint` 全仓应该能定位
- **🟡 catalog_service 扩展 template_type 字段需迁移**：已发布 catalog 数据要做兼容（默认 type="agent"）
- **🟡 handoff_rules 编辑 UI 复杂度高**：MVP 用扁平表格，react-flow 留 v2

## 5. 与其他 epic 的接口契约

- **配合 [[harness-rule]] 002**：契约字段 → 软规则注入复用同一 injector
- **被 [[harness-scripts]] Validation Hook 复用**：constraints 可被 builtin validator 转化为校验逻辑
- **服务 [[harness-workflow]] 001**：team_workflow.yaml 的 `default_agent` 字段引用本 epic 的 role 模板 id

## 6. 调研待二次确认项

- **agent-team-blueprint 模板的真实位置**（最重要，启动 Task 001 前必查）
- `catalog_service.py` 现有 catalog JSON 结构（决定 template_type 字段迁移路径）
- runtime 是否真的没校验 responsibilities/constraints（Task 004 第一阶段）
