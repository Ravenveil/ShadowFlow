---
name: tech-roadmap-workflow
status: draft
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
epic: harness-workflow
based_on: Explore agent 6 维代码基线调研 (2026-05-26)
---

# Harness Workflow 技术路线

> 维度：**团队工作流 + 项目记忆**（合并 B4/B6/B8/B9）。此 epic 与其他 5 维相对独立。

## 1. 现状基线

| 关注点 | 当前状态 |
|--------|---------|
| TeamWorkflow schema | `teams.py:247-250` 仅有 `nodes/edges`，需扩 `phases`/`entrypoint`/`policy_matrix` 等字段；参考 `contracts.py:WorkflowDefinition` (line 162+) |
| Phase 1/2/3 pipeline 入口 | `service.py:run()` line 193-200 传入 start_node_id；DAG 调度在 `_execute()` 单一大循环，理解 Phase 边界需改造 |
| DAG scheduler | 条件边 expr-eval `_condition_pattern` (line 70-74) + 拓扑排序在 `_execute()` 内；已用 `yaml.safe_load()` 加载（cli.py），**能直接消费 workflow.yaml** |
| yaml 热重载 | **无**。仅启动时 `yaml.safe_load()`；workflow 持久化在 `.shadowflow/workflows/` (builder_service.py:42)，无文件监听 |

## 2. 推荐插桩点

```
后端：
  shadowflow/runtime/contracts.py:WorkflowDefinition       ← 新增 phases: List[Phase] 字段
  shadowflow/runtime/service.py:_execute()                  ← 理解 Phase 边界 + workflow.yaml 接入
  shadowflow/api/teams.py:247 TeamWorkflow                  ← 扩 schema 支持 yaml 形态
  shadowflow/server.py（FastAPI 主文件）                    ← 加 POST /api/workflows/submit-yaml
  shadowflow/runtime/workflow_def/                          ← 新建模块
    ├── schema.py        # TeamWorkflowDefinition (Phase / Transition / Stage)
    ├── loader.py        # yaml ↔ schema 双向
    ├── seeds/           # 种子 yaml（PM→需求→设计→Gatekeeper→Dev→Review→QA）
    └── reloader.py      # watchfiles 文件监听

前端：
  src/components/team-editor/WorkflowTab.tsx                ← 新建（与 sub-agent 002 同居 page）

子任务 003 (dev-map/TaskBoard)：
  shadowflow/api/teams.py                                   ← 加 team 创建时初始化两 artifact
  src/components/run-session/                               ← 在 Artifact 区展示 dev-map/task-board

子任务 004 (B8 Bedrock 重评 + B9 三层文档)：
  docs/design/river-memory-architecture-v2.md               ← 加 §Bedrock 重评章节
  docs/design/project-memory-three-layers-v1.md             ← 新建
```

## 3. 技术路线（按 task 推进顺序）

### Task 001 — schema + Phase 1/2/3 适配（先做）
- `TeamWorkflowDefinition` Pydantic 模型加到 `workflow_def/schema.py`，含 `stages: List[Stage]` / `transitions` 等
- 加 `POST /api/workflows/submit-yaml` 端点（先用 raw yaml 字符串接受 + 校验）
- `service.py:_execute()` 改造：
  - 入口先查 team_workflow.yaml；缺省（向后兼容）才走 LLM 现编 DAG
  - Phase 边界识别：每个 stage 完成发 STAGE_COMPLETE 事件
- 种子 yaml：参考文章 7 角色团队（PM→需求→设计→Gatekeeper→Dev→Review→QA）

### Task 002 — Workflow 编辑 UI（依赖 001）
- 复用 run-session 现有 DAG render 组件（如有）
- 与 [[harness-sub-agent]] 002 team-editor 同 page 分 tab
- 阶段列表 + 回滚路径声明 + 保存调 PUT /api/teams/{id}/workflow

### Task 003 — dev-map / Task Board 模板（与 001/002 并行）
- team 创建时（无论自然语言生成还是 quick hire）自动初始化两 artifact 到 team workspace
- 与 [[harness-sub-agent]] 003 关卡型模板配合：Dev / PM 模板 constraint 默认含"修改代码必更新 dev-map" / "推进任务必更新 task-board"
- 配套 builtin validator "dev-map-fresh"（属于 [[harness-scripts]] 维度 4，但定义在这里）

### Task 004 — B8 Bedrock 重评 + B9 三层模型文档（与其他并行，纯文档）
- **B8 决策建议**：选选项 B（FTS5 + 长期归档）—— 既保留沉淀能力又不背向量包袱
- **B9 三层模型图**：
  ```
  外部知识（静态输入）       → s6.11 Knowledge Folder（[[harness-skill]] 配合）
  Team 自维护项目索引（半静态）→ dev-map / Task Board（本 epic Task 003）
  Agent 间动态信息流通（运行时）→ 河流式记忆（独立 epic）
  ```

## 4. 风险 / 隐藏阻塞

- **🟡 service.py `_execute()` 单一大循环**：调研报告指出"turn/step/node 概念边界模糊"，本 epic Phase 化改造可能踩到设计债。MVP 用最小入侵：只在循环开头加 yaml 查询，不大动结构
- **🟡 yaml 热重载**：MVP 不做，重启生效；v2 加 watchfiles
- **🟢 此 epic 与其他 5 维独立**：可以无视依赖最先启动（但优先级 P2，让 Scripts/Rule 先排）

## 5. 与其他 epic 的接口契约

- **基本独立**：DAG scheduler 已有，schema 扩展是局部改造
- **隐式依赖 [[harness-sub-agent]] 003**：team_workflow.yaml 的 `default_agent` 字段引用 role 模板 id
- **配合 [[harness-scripts]]**：Phase 完成时跑 phase-level validation hook（高级特性，留 v2）

## 6. 调研待二次确认项

- `service.py:_execute()` 实际代码结构（决定 Phase 化改造入侵度）
- `contracts.py:WorkflowDefinition` 现有字段（确定增量字段而非重写）
- river-memory v2 设计文档里 Bedrock 章节当前内容
