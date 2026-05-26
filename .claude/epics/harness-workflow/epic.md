---
name: harness-workflow
status: open
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
prd: harness-6dim-survey-and-river-memory
priority: P2
progress: 0%
source_doc: docs/harness/harness-6dim-survey-and-river-memory.md §2.2 Q4 + §3 + §4 B4/B6/B8/B9
---

# Epic: Harness Dimension — Workflow（团队工作流 + 项目记忆）

## 维度定位

**文章 6 维之一**：Workflow — *"What is the sequence"* / *Handoff and progression rules*

> "Workflow 的核心不是'画了一张图'，而是为每一次推进、暂停、驳回、重启建立
> 明确、可审计的规则。" —— 文章 §1.4
>
> "AI 不需要记忆，它需要的是导航。" —— 文章 §1.7（项目记忆部分）

## 平台缺口（用户视角）

用户问："我想固定我团队的工作流：需求 → 设计 → 评审通过才进开发 → 开发 → review → QA → 交付，怎么定？"
**ShadowFlow 当前回答**：靠 LLM 在 Phase 1/2/3 现编 DAG，加 Policy Matrix 调节 retry/reject。
- DAG 是动态生成的，用户每次开 turn 现编
- 没有 `team_workflow.yaml` 这种用户可编辑、可 diff 的工作流资产
- 没有阶段 / 回滚契约
- Policy Matrix 维度太窄（仅 retry/reject），没覆盖"阶段 / 必产物 / 升级路径"

**评分**：平台原语 🟡 / 用户可用度 🔴。

## 本 epic 范围扩展

除文章原义的 Workflow，本 epic 还吸收**项目记忆**相关三件（§3 + B6/B8/B9）：
- **B6** Team-level dev-map / Task Board 模板 — "团队自维护项目索引"
- **B8** 河流式记忆 Bedrock 层 Vector DB vs FTS5 决策
- **B9** 项目记忆三层模型文档（s6.11 ↔ River ↔ dev-map）

这些都属于"团队如何持续协作不丢上下文"，与 workflow 同源。

## Success Criteria

- [ ] `team_workflow.yaml` schema 落地，含阶段 / 必产物 / 推进 / 回滚
- [ ] Phase 1/2/3 优先读 workflow def，缺省再走 LLM 现编 DAG
- [ ] Team 创建时自动生成 dev-map.md + task-board.md 两个 artifact
- [ ] river-memory-architecture-v2.md 完成 Bedrock 重评（选 A/B/C）
- [ ] "项目记忆三层" 文档发布

## 后端模块责任

**新建模块**：`shadowflow/runtime/workflow_def/` — workflow yaml 加载器 + 校验器。

**触点**：
- `shadowflow/api/teams.py` — workflow CRUD 已有（GET/PUT /api/teams/{id}/workflow），需扩展 yaml 支持
- Phase 1/2/3 pipeline — 优先读 def，缺省再现编
- `docs/design/river-memory-architecture-v2.md` — Bedrock 决策追加

## Tasks Created

- [ ] 001.md - team_workflow.yaml schema 设计 + Phase 1/2/3 适配
- [ ] 002.md - Workflow 编辑 UI（可视化阶段 / 回滚路径）
- [ ] 003.md - Team dev-map / Task Board 模板（B6）
- [ ] 004.md - 项目记忆三层模型决策（B8 Bedrock 重评 + B9 三层文档）

Total tasks: 4
Parallel tasks: 2 (003, 004 与 001-002 并行)
Sequential tasks: 2 (001 → 002)
Estimated total effort: 2-3 周
