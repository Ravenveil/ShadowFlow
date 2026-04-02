# ShadowFlow Graph Projection Contract v1

> 日期：2026-04-01
> 状态：Draft
> 目的：把 `ShadowFlow` 当前的 graph projection 从“薄导出能力”推进为正式 runtime contract，供 `Shadow UI`、`Shadow CLI` 和后续 explainability / lineage / provenance 查询能力稳定消费

---

## 1. 一句话结论

`ShadowFlow` 不负责 graph surface，但必须正式提供：

**typed、可查询、可裁剪、可投影的 runtime graph contract。**

这里的重点不是“返回一份节点边 JSON”，而是让：

- `workflow graph`
- `run graph`
- `task tree`
- `artifact lineage`
- `memory relation`
- `checkpoint lineage`

都建立在一套统一的图语义之上。

---

## 2. 为什么现在要做这件事

根据当前计划主线，`Graph Projection` 已经是 `P0-5`。

而从当前代码状态看，`RuntimeService` 虽然已经有：

1. `export_workflow_graph()`
2. `export_run_graph()`

但这两者仍然偏薄：

1. `run graph` 基本上还是 workflow 节点的执行状态图
2. `task tree projection` 还没有独立 contract
3. `artifact / memory_event / checkpoint` 还没形成正式 lineage projection
4. UI / CLI 后续会需要 query，而不是只要一份整图导出

所以这一版 contract 的任务，不是“再加一个导出函数”，而是把 graph projection 升级成正式系统能力。

---

## 3. 设计原则

### 3.1 图继续作为统一本体

树不是图的替代物。  
`task tree` 更适合作为 `runtime graph` 的一种 projection。

说明：

- `task tree` 在这里指的是任务层级关系的投影视图
- 它不是第二套本体，也不是在 graph 之外再造一棵树

### 3.2 projection 必须 typed

所有 projection 都应显式区分实体类型和边类型，不能依赖消费方猜测。

### 3.3 projection 与 query 一起设计

contract 不应只回答“怎么导出”，还应回答：

1. 支持什么 scope
2. 支持什么过滤
3. lineage 如何遍历
4. summary 返回什么

### 3.4 审计态与热查询态分层

完整 provenance 可保留在 `RunResult` / audit 存储里；
而 projection contract 应偏向：

- UI 可消费
- CLI 可查询
- 热路径可快速返回

### 3.5 先支撑当前 runtime objects

v1 只围绕现有 runtime objects 展开：

1. `task`
2. `run`
3. `step`
4. `artifact`
5. `checkpoint`
6. `memory_event`
7. `handoff`

不在 v1 里引入额外复杂图学习语义。

---

## 4. Graph Ontology v1

## 4.1 节点类型

建议统一使用 `entity_type`，至少支持：

1. `workflow_node`
2. `run`
3. `task`
4. `step`
5. `artifact`
6. `checkpoint`
7. `memory_event`
8. `handoff`

## 4.2 边类型

建议统一使用 `edge_type`，至少支持：

1. `control_flow`
2. `conditional_flow`
3. `belongs_to_run`
4. `belongs_to_task`
5. `executes_node`
6. `delegation`
7. `handoff_to`
8. `produces_artifact`
9. `emits_memory_event`
10. `creates_checkpoint`
11. `derived_from_checkpoint`
12. `resume_from`
13. `retry_of`

## 4.3 边语义分层

建议边再显式区分两大类语义：

1. 自然执行边
   - 例如 `control_flow`、`produces_artifact`
2. 干预边
   - 例如 `resume_from`、`retry_of`、未来的 `cancelled_by`

这样后续 explainability 和审计才有稳定基础。

---

## 5. 统一 Projection Envelope

所有 projection 建议共用一个基础结构：

```json
{
  "projection_kind": "run_graph",
  "version": "v1",
  "scope": {
    "workflow_id": "wf_xxx",
    "run_id": "run_xxx"
  },
  "summary": {},
  "filters": {},
  "nodes": [],
  "edges": [],
  "metadata": {}
}
```

### 5.1 节点结构建议

```json
{
  "id": "step-001",
  "entity_type": "step",
  "label": "planner",
  "status": "succeeded",
  "parent_id": "task-xxx",
  "timestamps": {
    "started_at": "...",
    "ended_at": "..."
  },
  "refs": {
    "run_id": "run-xxx",
    "task_id": "task-xxx",
    "step_id": "step-001"
  },
  "metadata": {}
}
```

### 5.2 边结构建议

```json
{
  "id": "edge-xxx",
  "edge_type": "produces_artifact",
  "from_id": "step-001",
  "to_id": "artifact-001",
  "intervention": false,
  "metadata": {}
}
```

---

## 6. 一等 Projection 列表

## 6.1 `workflow_graph`

目的：

- 表达 workflow 定义层的节点与控制流

最少包含：

1. `workflow_node`
2. `control_flow`
3. `conditional_flow`

适用方：

- compile explain
- 静态图视图
- workflow 设计器

## 6.2 `run_graph`

目的：

- 表达一次 run 对 workflow 的实例化结果

最少包含：

1. `run`
2. `step`
3. `workflow_node`
4. `executes_node`
5. `control_flow`
6. `conditional_flow`

说明：

当前代码的 `export_run_graph()` 可视为这个 projection 的雏形，但还缺 run-level 节点和关系层。

## 6.3 `task_tree`

目的：

- 表达父任务、子任务、child run、所属 step 的层级关系

最少包含：

1. `task`
2. `run`
3. `delegation`
4. `belongs_to_run`
5. `belongs_to_task`

说明：

虽然名字叫 `task tree`，但本质上仍应由 graph ontology 过滤得到。

## 6.4 `artifact_lineage_graph`

目的：

- 回答 artifact 是由谁产生、属于谁、流向哪里

最少包含：

1. `artifact`
2. `step`
3. `task`
4. `run`
5. `produces_artifact`
6. `belongs_to_run`
7. `belongs_to_task`

可选扩展：

- `handoff_to`
- `writeback_target`

## 6.5 `memory_relation_graph`

目的：

- 表达 memory_event 与 step / task / handoff 的关系

最少包含：

1. `memory_event`
2. `step`
3. `task`
4. `handoff`
5. `emits_memory_event`

## 6.6 `checkpoint_lineage_graph`

目的：

- 回答 checkpoint 从哪来、被谁恢复、形成了什么 lineage

最少包含：

1. `checkpoint`
2. `step`
3. `run`
4. `creates_checkpoint`
5. `derived_from_checkpoint`
6. `resume_from`

---

## 7. Query / Export Contract v1

建议 `RuntimeService` 在 v1 正式支持这些入口：

1. `export_workflow_graph(workflow)`
2. `export_run_graph(run_id)`
3. `export_task_tree(run_id)`
4. `export_artifact_lineage(run_id=None, artifact_id=None)`
5. `export_memory_relation_graph(run_id)`
6. `export_checkpoint_lineage(run_id)`

### 7.1 通用查询参数建议

所有 projection 查询建议逐步支持：

1. `max_depth`
2. `edge_types`
3. `entity_types`
4. `include_metadata`
5. `include_payload`
6. `summary_only`

### 7.2 v1 最小要求

v1 不要求一次到位支持所有过滤，但至少要保证：

1. 每个 projection 都有稳定的 scope 定义
2. 节点/边类型固定
3. CLI 和 UI 可以依赖字段名

---

## 8. 与当前 runtime object 的映射

建议映射关系如下：

1. `RunRecord -> run node`
2. `TaskRecord -> task node`
3. `StepRecord -> step node`
4. `ArtifactRef -> artifact node`
5. `CheckpointRef -> checkpoint node`
6. `MemoryEvent -> memory_event node`
7. `HandoffRef -> handoff node`

边映射建议：

1. workflow edge -> `control_flow` / `conditional_flow`
2. `step.node_id` -> `executes_node`
3. `artifact.producer_step_id` -> `produces_artifact`
4. `memory_event.step_id` -> `emits_memory_event`
5. `checkpoint.step_id` -> `creates_checkpoint`
6. `resume metadata` -> `resume_from`
7. future parent-child task/run -> `delegation`

---

## 9. 当前代码与缺口

当前代码的优点：

1. runtime object 已有正式 schema
2. `export_workflow_graph()` 已存在
3. `export_run_graph()` 已存在
4. `artifact`、`checkpoint`、`memory_event`、`handoff` 都已经进入 `RunResult`

当前主要缺口：

1. graph envelope 还未统一
2. 没有 `entity_type / edge_type` 的统一 contract
3. `task_tree` 尚未正式导出
4. `artifact / memory / checkpoint lineage` 尚未正式导出
5. query contract 尚未正式化

---

## 10. 分阶段实施建议

### Phase 1: Contract 固化

1. 在 `contracts.py` 中补齐统一 graph envelope 模型
2. 给节点与边补 `entity_type / edge_type`
3. 保持 `export_workflow_graph()`、`export_run_graph()` 向后兼容

### Phase 2: 新 Projection 落地

1. 新增 `export_task_tree()`
2. 新增 `export_artifact_lineage()`
3. 新增 `export_memory_relation_graph()`
4. 新增 `export_checkpoint_lineage()`

### Phase 3: Summary / Index 优化

1. 为高频 projection 提供轻量 summary
2. 避免每次从完整 `RunResult` 暴力组图
3. 为 future UI / CLI 预留局部遍历入口

### Phase 4: 与 delegated run 对齐

1. 当 child run 语义成熟后，把 `delegation`、`belongs_to_task` 等边正式接入
2. 让 `task_tree` 从单任务投影升级为真正的多层 task lineage

---

## 11. 完成标准

`Graph Projection Contract v1` 完成时，应满足：

1. UI 可以稳定消费 `workflow_graph` 与 `run_graph`
2. CLI 可以稳定查询 `task_tree`
3. `artifact` / `checkpoint` 至少有最小 lineage 视图
4. schema、字段命名、边类型稳定
5. 不要求 UI 实现完成，但必须能被 UI 直接消费

---

## 12. 当前建议

如果紧接着进入实现，我建议顺序是：

1. 先补统一 graph envelope 与边类型
2. 先实现 `export_task_tree()`
3. 再实现 `export_checkpoint_lineage()`
4. 然后实现 `export_artifact_lineage()`

这样收益最大，因为它们最直接支撑：

- `Sub-agent Runtime`
- `resume / retry`
- `Shadow UI` 图视图
- `Shadow CLI` inspect / lineage 查询
