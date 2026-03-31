# AgentGraph 工作流治理主链 v1

> 日期：2026-03-30
> 状态：Active
> 目的：把 AgentGraph 当前主线从“能执行 workflow”推进到“能治理 workflow”

---

## 1. 一句话方向

当前主线不再优先扩 provider，而是优先把 `WorkflowTemplate` 做成一个**可治理、可校验、可复用**的高层对象。

主链顺序固定为：

1. `policy matrix`
2. `stage / lane`
3. compile-time validation
4. pattern library
5. scaffold / wizard

---

## 2. 为什么主线要切到这里

当前真正限制用户“方便建立自己的 workflow”的，不是还能不能多接一个 provider，而是：

- 角色和 agent 已经有了
- assignment 也有了
- 但模板层还没有把“谁能做什么、谁能改什么、流程分几段”正式建模

所以现在最应该补的是：

- 权限矩阵
- 阶段结构
- 编译期检查
- 模式库
- 生成入口

---

## 3. 已完成

### 3.1 Policy Matrix

`WorkflowTemplateSpec` 现已支持：

```yaml
policy_matrix:
  agents:
    reviewer:
      tools: ["filesystem"]
      side_effects: "read_only"
      requires_confirmation: true
      writeback_targets: []
```

当前含义：

- 约束某个模板 agent 允许使用哪些 tool
- 约束它是只读还是允许副作用
- 约束 writeback target
- 标记是否需要确认

### 3.2 Stage / Lane

`WorkflowTemplateSpec` 现已支持：

```yaml
stages:
  - stage_id: "review"
    name: "Review"
    lane: "quality"
    agents: ["reviewer"]
    approval_required: true
```

当前含义：

- 模板里的 agent 属于哪个 stage
- 该 stage 属于哪个 lane
- 是否需要审批/确认
- 是否是 barrier

### 3.3 Compile-Time Validation

当前 compiler 已经会在编译前检查：

- `policy_matrix` 里引用的 agent 是否存在
- `stages` 是否覆盖全部模板 agent
- entrypoint 是否位于第一 stage
- stage agent 是否重复出现在多个 stage
- agent 是否引用了超出 policy matrix 的 tools
- `read_only` agent 是否挂了 write/mixed tool
- 需要 side effect 的 policy 是否与 agent policy 冲突
- writeback target 是否越界

### 3.4 Pattern Library

当前把内置 preset 正式视为第一版 pattern library：

- `single-reviewer`
- `planner-coder-reviewer`
- `research-review-publish`

CLI 现在同时支持：

```bash
agentgraph presets list
agentgraph patterns list
```

### 3.5 Scaffold 入口

当前 `scaffold` 和 `init workflow` 都支持 pattern 入口：

```bash
agentgraph scaffold --pattern planner-coder-reviewer ...
agentgraph init workflow --pattern single-reviewer ...
```

并且已经支持第一版任务意图推荐：

```bash
agentgraph init workflow --task-kind research ...
agentgraph scaffold --task-kind build ...
```

当前会把常见任务意图映射到内置 pattern：

- `review / analysis -> single-reviewer`
- `build / code / delivery -> planner-coder-reviewer`
- `research / publish / content -> research-review-publish`

---

## 4. 当前实现落点

核心代码：

- `agentgraph/highlevel.py`
- `agentgraph/cli.py`

关键新增能力：

- `WorkflowPolicyMatrixSpec`
- `WorkflowStageSpec`
- Template compiler governance validation
- summary 输出 stages / lanes / policy

---

## 5. 接下来还要继续补什么

虽然主链已经进入实现态，但还没完全做完。

下一步建议继续补：

1. 更细的 `policy matrix`
   - approval mode
   - side-effect scope
   - tool capability tags

2. 更强的 `stage / lane`
   - 并行 lane
   - barrier 汇合规则
   - stage-level defaults

3. 更完整的 pattern library
   - fan-out + barrier
   - research / review / publish 的更多变体
   - multi-reviewer / multi-lane 模式

4. 更强的 scaffold / wizard
   - 从问答生成 stage + policy
   - 而不只是选 preset

---

## 6. 一句话结论

当前主线已经从：

- “只是能跑 workflow”

推进到：

- “开始能治理 workflow”

后面继续沿这条链推进，就能真正支撑“用户方便创建自己的工作流”。
