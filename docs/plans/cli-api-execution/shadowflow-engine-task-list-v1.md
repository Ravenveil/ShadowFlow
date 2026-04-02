# ShadowFlow Engine Task List v1

> 日期：2026-03-31
> 状态：Execution Backlog
> 目的：把 `ShadowFlow` 当前引擎主线拆成明确可执行任务，避免和 `Shadow CLI / Shadow UI` 边界混淆

---

## 1. P0 主任务

### P0-1 Runtime Contract 固化

目标：

把下面对象正式固化为引擎 contract：

- `task`
- `run`
- `step`
- `artifact`
- `checkpoint`
- `memory_event`
- `handoff`

完成标准：

1. 每个对象都有字段级 schema
2. 命名统一
3. 运行时持久化边界明确
4. 查询与恢复入口明确

### P0-2 Sub-agent Runtime

目标：

把子任务执行做成正式 runtime，而不是只靠 workflow 拼接。

完成标准：

1. 支持父子 run 关系
2. 支持 lineage / task tree
3. 支持上下文隔离
4. 支持 handoff
5. 支持 retry / resume

### P0-3 WorkflowTemplate Compile 主链

目标：

把高层模板主链做稳。

完成标准：

1. `Tool / Skill / Role / Agent / WorkflowTemplate` 的字段 contract 稳定
2. `policy matrix` 稳定
3. `stage / lane` 稳定
4. compile-time validation 稳定
5. pattern library 形成第一版

### P0-4 File Collaboration / Writeback Contract

目标：

把文件协作从“附带输出”提升为正式 runtime 语义。

完成标准：

1. artifact 类型清晰
2. handoff 文件语义清晰
3. writeback target 语义清晰
4. memory note 语义清晰

### P0-5 Graph Projection

目标：

为 `Shadow UI` 提供稳定 graph projection 数据。

完成标准：

1. run graph 可投影
2. task tree 可投影
3. artifact/memory relation 可投影
4. 投影结构和 UI 解耦

---

## 2. P1 次级任务

### P1-1 Explainability

1. compile summary
2. run explain summary
3. task tree explain summary

### P1-2 Memory Event 扩展

1. success / failure / confidence
2. preference / feedback
3. cost / source / relation

### P1-3 Claw Adapter 预留

1. execution contract 预留 `claw`
2. 不立即接具体实现
3. 先收口 adapter boundary

---

## 3. 明确不做

当前阶段不由 `ShadowFlow` 承担：

1. 用户侧 CLI 产品壳
2. 对话产品壳
3. provider/model 设置页
4. 工作台 UI
5. 图谱 UI
6. 团队 / 邀请码 / 资源共享

---

## 4. 推荐执行顺序

1. 先做 `Runtime Contract`
2. 再做 `Sub-agent Runtime`
3. 再做 `File Collaboration / Writeback`
4. 再做 `Graph Projection`
5. 最后继续扩 `WorkflowTemplate Compile`

---

## 5. 当前建议

如果马上进入实现阶段，最先应该从下面两件事开始：

1. `task/run/step/artifact/checkpoint/memory_event/handoff` 字段契约文档
2. `sub-agent runtime` 的最小运行语义设计

因为这两件事会直接决定：

- Shadow CLI 后面怎么调用引擎
- Shadow UI 后面怎么可视化任务链
